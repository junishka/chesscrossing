// Pure Web Audio synthesis for the station (docs/BIBLE.md §10). The rig is the master chain;
// the instruments are the inventory and nothing else: the harmonium, the ship's bell, the
// Olivetti, the Predictor's pulleys and the clock. Nothing here touches an AudioContext at
// import time, so the data and the pure helpers can be tested in Node.
import type { SfxName } from '../types'

// ───────────────────────────── Units and constants ─────────────────────────────

/** MIDI note number to frequency in hertz (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Decibels to a linear gain (0 dB = 1). `-Infinity` gives 0. */
export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20)
}

/** The instruments the station owns (Law VI). Pitched: harmonium, bell. Percussion: Olivetti, pulleys, clock. Recorded: Record 4. */
export const INVENTORY = ['harmonium', 'bell', 'olivetti', 'pulleys', 'clock', 'record4'] as const

/** A name in the inventory. */
export type InstrumentName = (typeof INVENTORY)[number]

/** The harmonium's out stop speaks only on notes above E5 (MIDI 76). */
export const OUT_STOP_ABOVE_MIDI = 76

/** The harmonium's numbers from §10: detune, filter, tremolo, ADSR, breath and the out stop. */
export const HARMONIUM = {
  detuneCents: 6,
  lowpassHz: 900,
  lowpassQ: 0.7,
  tremoloHz: 5.5,
  tremoloDepth: 0.08,
  attackS: 0.12,
  decayS: 0,
  sustain: 1.0,
  releaseS: 0.4,
  breathDb: -36,
  breathHz: 300,
  outStopDb: -30,
} as const

/** The ship's bell: partial ratios with their decay times in seconds, and the fundamental. */
export const BELL = {
  hz: 660,
  partials: [
    { ratio: 1, decayS: 3.0, level: 1 },
    { ratio: 2.0, decayS: 2.2, level: 0.55 },
    { ratio: 2.76, decayS: 1.6, level: 0.4 },
    { ratio: 3.9, decayS: 1.0, level: 0.22 },
    { ratio: 5.4, decayS: 0.6, level: 0.12 },
  ],
  strikeS: 0.002,
} as const

/** The Olivetti's three sounds. */
export const OLIVETTI = { keyHz: 1600, keyS: 0.006, impulseS: 0.001, marginHz: 2400, marginS: 0.08, marginDb: -18, carriageHz: 1000, carriageS: 0.18 } as const

/** The clock: the tick and the lever. The two dials are 11 ms apart, always. */
export const CLOCK = { tickS: 0.005, dialOffsetS: 0.011, leverHz: 300, leverS: 0.015, impulseS: 0.001 } as const

/** The Predictor's pulleys: forty-one ticks through a 900 Hz band-pass, staggered over 4 s. */
export const PULLEYS = { count: 41, bandHz: 900, insertS: 4 } as const

/** Record 4: wow and crackle applied to the rendered Survey Theme. */
export const RECORD4 = { wowHz: 0.5, wowCents: 4, cracklePerSecond: 12, crackleDb: -40 } as const

/**
 * The staggered times of the forty-one pulley ticks inside the 4 s insert: an even grid
 * with a deterministic jitter of up to a third of a slot, so the pulleys never sound like a metronome.
 */
export function pulleyTimes(): number[] {
  const slot = PULLEYS.insertS / PULLEYS.count
  let seed = 0x1f2a3b4c
  const out: number[] = []
  for (let i = 0; i < PULLEYS.count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const jitter = ((seed / 0xffffffff) - 0.5) * slot * 0.66
    out.push(Math.max(0, Math.min(PULLEYS.insertS - 0.01, i * slot + slot * 0.5 + jitter)))
  }
  return out
}

/** The survey pin's file from a velocity 0..1: files a..h are 0..7; each file is 2 percent higher. */
export function pinFile(velocity: number): number {
  return Math.round(Math.max(0, Math.min(1, velocity)) * 7)
}

// ───────────────────────────── Rig ─────────────────────────────

/** The signal chain every sound goes through. */
export interface Rig {
  ctx: BaseAudioContext
  /** The sum, before the tape and the room. */
  master: GainNode
  /** Sound effects, into the sum. */
  sfxBus: GainNode
  /** Music and room tones, into the sum. */
  musicBus: GainNode
  /** The limiter at the end of the chain. */
  limiter: DynamicsCompressorNode
}

/**
 * The tape saturation curve: tanh(k·x) / k, so quiet signals pass at unity and full scale is bent
 * down to tanh(k) / k (0.6 at k = 1.5, −4.4 dB). Whatever is left goes to the limiter.
 */
export function tapeCurve(k = 1.5, samples = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * 4))
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / k
  }
  return curve
}

/**
 * The trim after the limiter. Browsers' `DynamicsCompressorNode` adds an automatic makeup gain
 * (about +3.4 dB at threshold −6, ratio 20), which would put the ceiling near −2.5 dBFS; this
 * takes it back so that nothing leaves the chain above −6 dBFS.
 */
export const LIMITER_TRIM_DB = -4.5

/**
 * Writes an impulse response into `data`: exponentially decaying noise reaching −60 dB at `seconds`.
 * Each channel gets its own noise so the room has width.
 */
export function fillRoomResponse(data: Float32Array, sampleRate: number, seconds: number, seed: number): void {
  const k = Math.log(1000) / (seconds * sampleRate)
  let s = seed >>> 0
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const n = s / 0x7fffffff - 1
    data[i] = n * Math.exp(-k * i) * (i < 64 ? i / 64 : 1)
  }
}

/** A synthesized 0.9 s room, stereo, cached per context. */
function roomResponse(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 0.9
  const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  fillRoomResponse(buf.getChannelData(0), ctx.sampleRate, seconds, 0x2545f491)
  fillRoomResponse(buf.getChannelData(1), ctx.sampleRate, seconds, 0x9e3779b9)
  return buf
}

/**
 * Builds the master chain on any context, live or offline: sum → tape saturation (k 1.5) →
 * high shelf −2 dB at 8 kHz → the room at −18 dB wet in parallel with the dry → the limiter
 * (threshold −6 dB, knee 0, ratio 20, attack 1 ms, release 100 ms) → the trim → out.
 */
export function createRig(ctx: BaseAudioContext): Rig {
  const master = ctx.createGain()
  master.gain.value = 1
  const tape = ctx.createWaveShaper()
  tape.curve = tapeCurve(1.5)
  tape.oversample = '2x'
  const shelf = ctx.createBiquadFilter()
  shelf.type = 'highshelf'
  shelf.frequency.value = 8000
  shelf.gain.value = -2
  const room = ctx.createConvolver()
  room.buffer = roomResponse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = dbToGain(-18)
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.1
  const trim = ctx.createGain()
  trim.gain.value = dbToGain(LIMITER_TRIM_DB)

  master.connect(tape)
  tape.connect(shelf)
  shelf.connect(limiter)
  shelf.connect(room)
  room.connect(wet)
  wet.connect(limiter)
  limiter.connect(trim)
  trim.connect(ctx.destination)

  const sfxBus = ctx.createGain()
  const musicBus = ctx.createGain()
  sfxBus.connect(master)
  musicBus.connect(master)
  return { ctx, master, sfxBus, musicBus, limiter }
}

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

let live: Rig | null = null

/** Creates the live AudioContext lazily and resumes it; call on a user gesture. Null when unsupported. */
export function initSynth(): Rig | null {
  if (typeof window === 'undefined') return null
  if (!live) {
    const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : (window as WindowWithWebkit).webkitAudioContext
    if (!Ctx) return null
    let ctx: AudioContext
    try {
      ctx = new Ctx({ latencyHint: 'interactive' })
    } catch {
      try { ctx = new Ctx() } catch { return null }
    }
    live = createRig(ctx)
  }
  wake(live)
  return live
}

/** Resumes a live context that the browser suspended (autoplay policy, an interruption). No-op offline. */
export function wake(rig: Rig): void {
  const ctx = rig.ctx as AudioContext
  if (typeof ctx.resume === 'function' && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

/** The live rig, if `initSynth` has run. */
export function getRig(): Rig | null {
  return live
}

// ───────────────────────────── Building blocks ─────────────────────────────

const whiteBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
const pinkBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()

/** Fills `data` with deterministic white noise in −1..1. */
export function fillWhite(data: Float32Array, seed: number): void {
  let s = seed >>> 0
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    data[i] = s / 0x7fffffff - 1
  }
}

/** Fills `data` with pink noise (Kellet's filter over deterministic white), scaled to about −1..1. */
export function fillPink(data: Float32Array, seed: number): void {
  let s = seed >>> 0
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const w = s / 0x7fffffff - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}

/** 4 s of white noise, cached per context. */
export function whiteBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = whiteBuffers.get(ctx)
  if (buf) return buf
  buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 4), ctx.sampleRate)
  fillWhite(buf.getChannelData(0), 0x9e3779b9)
  whiteBuffers.set(ctx, buf)
  return buf
}

/** 4 s of pink noise, cached per context. */
export function pinkBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = pinkBuffers.get(ctx)
  if (buf) return buf
  buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 4), ctx.sampleRate)
  fillPink(buf.getChannelData(0), 0x7f4a7c15)
  pinkBuffers.set(ctx, buf)
  return buf
}

/**
 * Gain node with a linear attack to `peak` and an exponential decay to silence at `t + dur`.
 * The base value is silence too: a source that starts on a sample before the first automation
 * event would otherwise render that sample at unity, a click.
 */
function envelope(ctx: BaseAudioContext, t: number, peak: number, attack: number, dur: number): GainNode {
  const g = ctx.createGain()
  const p = g.gain
  p.value = 0.0001
  p.setValueAtTime(0.0001, t)
  p.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.001, dur))
  return g
}

/** What a sound effect receives: the context, where to play, when, how hard, and the rate for slow motion. */
export interface Env {
  ctx: BaseAudioContext
  out: AudioNode
  t: number
  /** Velocity 0..1. */
  v: number
  /** Playback rate: 1 normally, 0.4 in the four slow-motion moments. Durations stretch and pitch falls with it. */
  rate: number
}

interface NoiseOpts {
  dur: number
  gain: number
  freq: number
  type?: BiquadFilterType
  q?: number
  attack?: number
  /** Filter frequency at the end of the burst (exponential sweep). */
  freqEnd?: number
  /** Pink instead of white. */
  pink?: boolean
}

/** A filtered noise burst. The buffer offset follows the schedule time so no two bursts are identical. */
function noise(e: Env, o: NoiseOpts): void {
  const { ctx, out, t, rate } = e
  const src = ctx.createBufferSource()
  src.buffer = o.pink ? pinkBuffer(ctx) : whiteBuffer(ctx)
  src.loop = true
  src.playbackRate.value = rate
  const f = ctx.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.Q.value = o.q ?? 1
  const dur = o.dur / rate
  f.frequency.setValueAtTime(o.freq * rate, t)
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd * rate, t + dur)
  const g = envelope(ctx, t, o.gain, (o.attack ?? 0.002) / rate, dur)
  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.start(t, (t * 7.31) % 3.5)
  src.stop(t + dur + 0.05)
}

interface ToneOpts {
  freq: number
  dur: number
  gain: number
  type?: OscillatorType
  attack?: number
  /** Frequency at the end (exponential glide). */
  freqEnd?: number
  /** Optional filter placed after the oscillator. */
  filter?: { type: BiquadFilterType; freq: number; q?: number }
}

/** A single oscillator with an envelope and an optional filter. */
function tone(e: Env, o: ToneOpts): void {
  const { ctx, out, t, rate } = e
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  const dur = o.dur / rate
  osc.frequency.setValueAtTime(o.freq * rate, t)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd * rate, t + dur)
  const g = envelope(ctx, t, o.gain, (o.attack ?? 0.002) / rate, dur)
  let head: AudioNode = osc
  if (o.filter) {
    const f = ctx.createBiquadFilter()
    f.type = o.filter.type
    f.Q.value = o.filter.q ?? 1
    f.frequency.value = o.filter.freq * rate
    head.connect(f)
    head = f
  }
  head.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** A 1 ms impulse: white noise with an instant attack, optionally through a band-pass. */
function impulse(e: Env, gain: number, ms = 1, bandHz?: number): void {
  noise(e, { type: bandHz ? 'bandpass' : 'highpass', freq: bandHz ?? 20, q: bandHz ? 4 : 0.5, dur: ms / 1000, attack: 0.0002, gain })
}

// ───────────────────────────── The harmonium ─────────────────────────────

/** A sounding harmonium note; `release(t)` closes it over 400 ms. */
export interface HeldNote { release(t: number): void }

/** The harmonium HS-0406, one stop out. Built on a node; its filter and tremolo are shared by every note. */
export interface Harmonium {
  /** Plays a note for `dur` seconds (the release begins at `t + dur`). `gain` is linear, 1 for a normal note. */
  note(midi: number, t: number, dur: number, gain?: number): void
  /** Opens a note and returns its release. */
  hold(midi: number, t: number, gain?: number): HeldNote
  /** Stops the shared tremolo; the harmonium falls silent after `t`. */
  dispose(t: number): void
}

const HARMONIUM_NOTE_GAIN = 0.16

/**
 * Two sawtooths detuned ±6 cents → low-pass 900 Hz, Q 0.7 → tremolo 5.5 Hz at 8 percent →
 * ADSR 120 / 0 / 1.0 / 400 ms. A noise bed at −36 dB band-passed 300 Hz breathes with each note.
 * The out stop, a third sawtooth an octave up at −30 dB, speaks only above E5.
 * `wow`, when given, modulates every oscillator's detune (Record 4's ±4 cents at 0.5 Hz).
 */
export function harmonium(ctx: BaseAudioContext, out: AudioNode, wow?: AudioNode): Harmonium {
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = HARMONIUM.lowpassHz
  lp.Q.value = HARMONIUM.lowpassQ
  const trem = ctx.createGain()
  trem.gain.value = 1 - HARMONIUM.tremoloDepth
  const lfo = ctx.createOscillator()
  lfo.frequency.value = HARMONIUM.tremoloHz
  const depth = ctx.createGain()
  depth.gain.value = HARMONIUM.tremoloDepth
  lfo.connect(depth)
  depth.connect(trem.gain)
  lp.connect(trem)
  trem.connect(out)
  lfo.start()

  const hold = (midi: number, t: number, gain = 1): HeldNote => {
    const hz = midiToHz(midi)
    const peak = HARMONIUM_NOTE_GAIN * gain
    const env = ctx.createGain()
    env.gain.value = 0.0001
    env.gain.setValueAtTime(0.0001, t)
    env.gain.linearRampToValueAtTime(peak, t + HARMONIUM.attackS)
    env.gain.setValueAtTime(peak * HARMONIUM.sustain, t + HARMONIUM.attackS + HARMONIUM.decayS)
    env.connect(lp)
    const stops: { stop(when: number): void }[] = []
    const saw = (freq: number, cents: number, level: number): void => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.detune.value = cents
      if (wow) wow.connect(osc.detune)
      const g = ctx.createGain()
      g.gain.value = level
      osc.connect(g)
      g.connect(env)
      osc.start(t)
      stops.push(osc)
    }
    saw(hz, HARMONIUM.detuneCents, 0.5)
    saw(hz, -HARMONIUM.detuneCents, 0.5)
    if (midi > OUT_STOP_ABOVE_MIDI) saw(hz * 2, 0, dbToGain(HARMONIUM.outStopDb))
    const breath = ctx.createBufferSource()
    breath.buffer = whiteBuffer(ctx)
    breath.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = HARMONIUM.breathHz
    bp.Q.value = 0.8
    const bg = ctx.createGain()
    bg.gain.value = dbToGain(HARMONIUM.breathDb)
    breath.connect(bp)
    bp.connect(bg)
    bg.connect(env)
    breath.start(t, (t * 3.17) % 3.5)
    stops.push(breath)
    let released = false
    return {
      release(when: number): void {
        if (released) return
        released = true
        const at = Math.max(when, t + HARMONIUM.attackS)
        env.gain.setValueAtTime(peak * HARMONIUM.sustain, at)
        env.gain.linearRampToValueAtTime(0.0001, at + HARMONIUM.releaseS)
        for (const s of stops) s.stop(at + HARMONIUM.releaseS + 0.05)
      },
    }
  }
  return {
    note(midi, t, dur, gain = 1) { hold(midi, t, gain).release(t + dur) },
    hold,
    dispose(t) { lfo.stop(t + 0.1) },
  }
}

// ───────────────────────────── The ship's bell ─────────────────────────────

/**
 * One strike of the ship's bell: partials at 1, 2.0, 2.76, 3.9 and 5.4 times 660 Hz with decays of
 * 3.0, 2.2, 1.6, 1.0 and 0.6 s, and a 2 ms noise strike. Played live; it ignores slow motion.
 */
export function bellStrike(ctx: BaseAudioContext, out: AudioNode, t: number, gain = 1): void {
  const peak = 0.3 * gain
  for (const p of BELL.partials) {
    const osc = ctx.createOscillator()
    osc.frequency.value = BELL.hz * p.ratio
    const g = ctx.createGain()
    g.gain.value = 0.0001
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak * p.level, t + 0.002)
    g.gain.setTargetAtTime(0, t + 0.002, p.decayS / 6.9)
    osc.connect(g)
    g.connect(out)
    osc.start(t)
    osc.stop(t + p.decayS + 0.5)
  }
  noise({ ctx, out, t, v: 1, rate: 1 }, { type: 'highpass', freq: 4000, q: 0.7, dur: BELL.strikeS, attack: 0.0003, gain: peak * 0.8 })
}

// ───────────────────────────── The Olivetti, the pulleys, the clock ─────────────────────────────

/** The Olivetti's key: a 1 ms impulse and a 1.6 kHz sine for 6 ms. */
export function olivettiKey(e: Env): void {
  impulse(e, 0.22 * e.v, 1)
  tone(e, { freq: OLIVETTI.keyHz, dur: OLIVETTI.keyS, gain: 0.12 * e.v, attack: 0.0005 })
}

/** The Olivetti's margin bell: a 2.4 kHz sine for 80 ms at −18 dB. */
export function olivettiMarginBell(e: Env): void {
  tone(e, { freq: OLIVETTI.marginHz, dur: OLIVETTI.marginS, gain: dbToGain(OLIVETTI.marginDb) * e.v, attack: 0.001 })
}

/** The Olivetti's carriage: noise low-passed 1 kHz for 180 ms. */
export function olivettiCarriage(e: Env): void {
  noise(e, { type: 'lowpass', freq: OLIVETTI.carriageHz, q: 0.7, dur: OLIVETTI.carriageS, attack: 0.01, gain: 0.2 * e.v })
}

/** One pulley tick: an impulse through a 900 Hz band-pass. */
export function pulleyTick(e: Env, gain: number): void {
  impulse(e, gain, 1, PULLEYS.bandHz)
}

/** The clock's tick: 5 ms of noise, twice, the dials 11 ms apart. */
export function clockTick(e: Env): void {
  noise(e, { type: 'bandpass', freq: 3200, q: 3, dur: CLOCK.tickS, attack: 0.0005, gain: 0.16 * e.v })
  noise({ ...e, t: e.t + CLOCK.dialOffsetS / e.rate }, { type: 'bandpass', freq: 2900, q: 3, dur: CLOCK.tickS, attack: 0.0005, gain: 0.14 * e.v })
}

/** The clock's lever: a 1 ms impulse and a 300 Hz sine for 15 ms. */
export function clockLever(e: Env): void {
  impulse(e, 0.28 * e.v, 1)
  tone(e, { freq: CLOCK.leverHz, dur: CLOCK.leverS, gain: 0.2 * e.v, attack: 0.001 })
}

/** A gull, FM: carrier 1.2 kHz, modulator 40 Hz, the index sweeping. A bird and not an instrument. */
export function gull(ctx: BaseAudioContext, out: AudioNode, t: number, gain = 1): void {
  const dur = 0.55
  const carrier = ctx.createOscillator()
  carrier.frequency.setValueAtTime(1200, t)
  carrier.frequency.linearRampToValueAtTime(1500, t + dur * 0.35)
  carrier.frequency.linearRampToValueAtTime(1100, t + dur)
  const mod = ctx.createOscillator()
  mod.frequency.value = 40
  const index = ctx.createGain()
  index.gain.setValueAtTime(40, t)
  index.gain.linearRampToValueAtTime(600, t + dur * 0.4)
  index.gain.linearRampToValueAtTime(80, t + dur)
  mod.connect(index)
  index.connect(carrier.frequency)
  const g = envelope(ctx, t, 0.06 * gain, 0.04, dur)
  carrier.connect(g)
  g.connect(out)
  mod.start(t)
  carrier.start(t)
  mod.stop(t + dur + 0.1)
  carrier.stop(t + dur + 0.1)
}

// ───────────────────────────── Record 4 ─────────────────────────────

/** Adds crackle to a rendered record: `perSecond` impulses at `db`, deterministic. */
export function addCrackle(buffer: AudioBuffer, perSecond = RECORD4.cracklePerSecond, db = RECORD4.crackleDb): void {
  const level = dbToGain(db)
  const sr = buffer.sampleRate
  let s = 0x51ed270b
  const count = Math.floor(buffer.duration * perSecond)
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const at = Math.floor(((i + (s / 0xffffffff)) / perSecond) * sr)
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const sign = s & 1 ? 1 : -1
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch)
      if (at + 2 < data.length) { data[at] += sign * level; data[at + 1] -= sign * level * 0.5 }
    }
  }
}

/**
 * Plays a rendered record into `out`. The wow and the crackle are in the groove already
 * (`renderRecord4`), so nothing is modulated here: a second wow would double the ±4 cents.
 * Returns the source to stop and the gain to ride.
 */
export function playRecord(ctx: BaseAudioContext, out: AudioNode, buffer: AudioBuffer, t: number, gainDb: number, loop: boolean): { src: AudioBufferSourceNode; gain: GainNode } {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = loop
  const gain = ctx.createGain()
  gain.gain.value = dbToGain(gainDb)
  src.connect(gain)
  gain.connect(out)
  src.start(t)
  src.addEventListener('ended', () => { gain.disconnect() })
  return { src, gain }
}

// ───────────────────────────── The glide ─────────────────────────────

/** The glide loop: pink noise low-passed 1.2 kHz whose gain tracks the piece's speed. */
export interface Glide {
  /** Turns the hiss on at `speed` mm/s (−24 dB at 220 mm/s), or off. */
  set(on: boolean, speed?: number): void
  /** Stops the loop for good. */
  dispose(): void
}

/** Builds the glide loop on a rig; silent until `set(true, speed)`. */
export function createGlide(rig: Rig): Glide {
  const { ctx } = rig
  const src = ctx.createBufferSource()
  src.buffer = pinkBuffer(ctx)
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1200
  const g = ctx.createGain()
  g.gain.value = 0
  src.connect(lp)
  lp.connect(g)
  g.connect(rig.sfxBus)
  src.start()
  return {
    set(on, speed = 220) {
      const level = on ? dbToGain(-24) * Math.max(0, speed) / 220 : 0
      g.gain.setTargetAtTime(Math.min(dbToGain(-12), level), ctx.currentTime, 0.03)
    },
    dispose() { src.stop(); g.disconnect() },
  }
}

// ───────────────────────────── Sound effects ─────────────────────────────

/** A sound effect: schedules itself into `e.out` at `e.t`. */
export type Recipe = (e: Env) => void

const later = (e: Env, seconds: number): Env => ({ ...e, t: e.t + seconds / e.rate })

/** Piece rise: white noise 40 ms, band-pass 3 kHz Q 2, fast decay. */
const rise: Recipe = (e) => noise(e, { freq: 3000, q: 2, dur: 0.04, attack: 0.002, gain: 0.2 * e.v })
/** Seat / tick: sine 2 kHz 8 ms with 1 ms noise attack; second tick 2.4 kHz at −6 dB, 3 ms later. */
const seat: Recipe = (e) => {
  noise(e, { type: 'highpass', freq: 3000, q: 0.7, dur: 0.001, attack: 0.0002, gain: 0.2 * e.v })
  tone(e, { freq: 2000, dur: 0.008, gain: 0.22 * e.v, attack: 0.001 })
  tone(later(e, 0.003), { freq: 2400, dur: 0.008, gain: 0.22 * dbToGain(-6) * e.v, attack: 0.001 })
}
/** Survey pin: sine click 2.4 kHz decaying in 12 ms, +2 percent pitch per file (velocity picks the file), −24 dB. */
const pin: Recipe = (e) => tone(e, { freq: 2400 * Math.pow(1.02, pinFile(e.v)), dur: 0.012, gain: dbToGain(-24), attack: 0.0005 })
/** Knight: rise; 90 Hz sine 30 ms with 40 ms noise low-passed 600 Hz; tick. */
const knight: Recipe = (e) => {
  rise(e)
  tone(later(e, 0.04), { freq: 90, dur: 0.03, gain: 0.3 * e.v, attack: 0.002 })
  noise(later(e, 0.04), { type: 'lowpass', freq: 600, q: 0.7, dur: 0.04, gain: 0.2 * e.v })
  seat(later(e, 0.09))
}
/** Davit slew: the ratchet, an impulse every 38 ms through a 900 Hz band-pass; twelve of them. */
const ratchet: Recipe = (e) => { for (let i = 0; i < 12; i++) impulse(later(e, i * 0.038), 0.18 * e.v, 1, 900) }
/** Halyard creak: sawtooth 90 Hz, 200 ms, low-pass 500 Hz, −20 dB. */
const creak: Recipe = (e) => tone(e, { type: 'sawtooth', freq: 90, freqEnd: 104, dur: 0.2, gain: dbToGain(-20) * e.v, attack: 0.03, filter: { type: 'lowpass', freq: 500, q: 1 } })
/** Clamp: one sine click 3.1 kHz. */
const clamp: Recipe = (e) => tone(e, { freq: 3100, dur: 0.01, gain: 0.18 * e.v, attack: 0.0005 })
/** Capture hoist: noise band-pass sweeping 2 kHz → 400 Hz over 600 ms, −18 dB; no impact. */
const hoist: Recipe = (e) => noise(e, { freq: 2000, freqEnd: 400, q: 1.2, dur: 0.6, attack: 0.05, gain: dbToGain(-18) * e.v })
/** Returned tray: paper slide, noise band-pass 4 kHz, 120 ms, 30 ms attack. */
const tray: Recipe = (e) => noise(e, { freq: 4000, q: 0.8, dur: 0.12, attack: 0.03, gain: 0.12 * e.v })
/** The clock's lever. */
const lever: Recipe = (e) => clockLever(e)
/** Flag fall: the lever once; the tick stops (the clock stops calling for it). */
const flagfall: Recipe = (e) => clockLever(e)
/** Resign: one wood knock, sine 110 Hz, 40 ms. */
const knock: Recipe = (e) => tone(e, { freq: 110, dur: 0.04, gain: 0.4 * e.v, attack: 0.001 })
/** Adjourn: paper, noise low-pass 2 kHz, 250 ms; a soft thud at 70 Hz. */
const adjourn: Recipe = (e) => {
  noise(e, { type: 'lowpass', freq: 2000, q: 0.7, dur: 0.25, attack: 0.03, gain: 0.12 * e.v })
  tone(later(e, 0.2), { freq: 70, dur: 0.08, gain: 0.2 * e.v, attack: 0.005 })
}
/** The Olivetti's key. */
const key: Recipe = (e) => olivettiKey(e)
/** The Olivetti's margin bell. */
const marginbell: Recipe = (e) => olivettiMarginBell(e)
/** The Olivetti's carriage. */
const carriage: Recipe = (e) => olivettiCarriage(e)
/** SPARES drawer: pink noise low-pass 800 Hz, 520 ms, a 2 ms click at the end. */
const spares: Recipe = (e) => {
  noise(e, { pink: true, type: 'lowpass', freq: 800, q: 0.7, dur: 0.52, attack: 0.04, gain: 0.3 * e.v })
  impulse(later(e, 0.5), 0.25 * e.v, 2)
}
/** Dolly indoors: floorboard, noise low-pass 200 Hz, 80 ms. */
const floorboard: Recipe = (e) => noise(e, { type: 'lowpass', freq: 200, q: 0.8, dur: 0.08, attack: 0.005, gain: 0.35 * e.v })
/** Shell underfoot: noise band-pass 3 kHz, 60 ms, −22 dB. */
const shell: Recipe = (e) => noise(e, { freq: 3000, q: 1, dur: 0.06, attack: 0.004, gain: dbToGain(-22) * e.v })
/** Lamp lit: sine 60 Hz thud 80 ms; sawtooth sweep 200 → 800 Hz over 1.5 s, low-passed, −24 dB (the clockwork, not a note). */
const lamp: Recipe = (e) => {
  tone(e, { freq: 60, dur: 0.08, gain: 0.3 * e.v, attack: 0.003 })
  tone(e, { type: 'sawtooth', freq: 200, freqEnd: 800, dur: 1.5, gain: dbToGain(-24) * e.v, attack: 0.1, filter: { type: 'lowpass', freq: 900, q: 0.7 } })
}
/** Card / placard: paper, noise band-pass 5 kHz, 90 ms. */
const paper: Recipe = (e) => noise(e, { freq: 5000, q: 0.8, dur: 0.09, attack: 0.02, gain: 0.1 * e.v })
/** Predictor insert: forty-one pulley ticks at staggered intervals over 4 s, then one paper advance. */
const pulleys: Recipe = (e) => {
  for (const at of pulleyTimes()) pulleyTick(later(e, at), 0.16 * e.v)
  paper(later(e, PULLEYS.insertS + 0.05))
}
/** Photograph: 800 ms silence, a single impulse. The Survey Theme follows from the facade. */
const photo: Recipe = (e) => impulse(later(e, 0.8), 0.3 * e.v, 1)
/** Tide bell: the ship's bell, three strikes 900 ms apart, from the house's direction. */
const tidebell: Recipe = (e) => { for (let i = 0; i < 3; i++) bellStrike(e.ctx, e.out, e.t + i * 0.9, 0.7 * e.v) }
/** One gust: pink noise low-passed 600 Hz, swelling over 3 s at −30 dB. */
const wind: Recipe = (e) => noise(e, { pink: true, type: 'lowpass', freq: 600, q: 0.5, dur: 3, attack: 1.2, gain: dbToGain(-30) * e.v })
/** One gull. */
const gullOnce: Recipe = (e) => gull(e.ctx, e.out, e.t, e.v)
/** Check: the bell, one strike; then the creak as flag U rises. */
const check: Recipe = (e) => { bellStrike(e.ctx, e.out, e.t, 0.8 * e.v); creak(later(e, 0.5)) }
/** Lift: the harmonium's D minor chord, low, swelling over the lift at −22 dB. */
const lift: Recipe = (e) => {
  const chord = harmonium(e.ctx, e.out)
  for (const midi of [38, 45, 50, 53]) chord.note(midi, e.t, 1.1, dbToGain(-22) * e.v)
  chord.dispose(e.t + 2)
}
/** A latch click from the Olivetti's carriage recipe: a short carriage and one impulse. */
const door: Recipe = (e) => {
  noise(e, { type: 'lowpass', freq: 1000, q: 0.7, dur: 0.06, attack: 0.005, gain: 0.16 * e.v })
  impulse(later(e, 0.05), 0.2 * e.v, 2)
}
/** Needle drop: a soft thud, a crackle burst. Record 4 itself starts from the facade. */
const needle: Recipe = (e) => {
  tone(e, { freq: 60, freqEnd: 45, dur: 0.12, gain: 0.2 * e.v, attack: 0.005 })
  for (let i = 0; i < 8; i++) impulse(later(e, 0.1 + i * 0.09), 0.05 * e.v, 1)
}
/** Nothing: the whip pan, hover and the telephone are silent. */
const silence: Recipe = () => undefined

/** One recipe per SfxName: the station's sounds, and the generic names mapped onto them. */
export const recipes: Record<SfxName, Recipe> = {
  pickup: rise,
  place: seat,
  slide: (e) => noise(e, { pink: true, type: 'lowpass', freq: 1200, q: 0.7, dur: 0.26, attack: 0.06, gain: dbToGain(-24) * e.v }),
  capture: hoist,
  check,
  mate: (e) => bellStrike(e.ctx, e.out, e.t, e.v),
  castle: (e) => { seat(e); seat(later(e, 0.25)) },
  promote: spares,
  tick: clockTick,
  flag: flagfall,
  whip: silence,
  dolly: floorboard,
  lift,
  paper,
  door,
  bell: (e) => bellStrike(e.ctx, e.out, e.t, e.v),
  typewriter: key,
  hover: silence,
  select: clamp,
  illegal: knock,
  record: needle,
  telephone: silence,
  drawer: spares,
  chime: marginbell,
  rise,
  glide: (e) => noise(e, { pink: true, type: 'lowpass', freq: 1200, q: 0.7, dur: 0.26, attack: 0.06, gain: dbToGain(-24) * e.v }),
  seat,
  pin,
  knight,
  ratchet,
  creak,
  clamp,
  hoist,
  tray,
  lever,
  flagfall,
  knock,
  adjourn,
  key,
  marginbell,
  carriage,
  spares,
  floorboard,
  shell,
  lamp,
  pulleys,
  photo,
  tidebell,
  wind,
  gull: gullOnce,
}

/** Every sound effect name, in the order of `recipes`. */
export const SFX_NAMES = Object.keys(recipes) as SfxName[]

/** The sound effects that are silent by the bible: the whip pan, hover, the telephone. */
export const SILENT_SFX: readonly SfxName[] = ['whip', 'hover', 'telephone']

/**
 * Schedules a sound effect on the rig's sfx bus at `time` (defaults to now). `rate` below 1 is slow
 * motion: the buffered sounds stretch and fall in pitch; the bell ignores it.
 */
export function playSfx(rig: Rig, name: SfxName, velocity = 1, time?: number, rate = 1): void {
  const t = time ?? rig.ctx.currentTime + 0.01
  recipes[name]({ ctx: rig.ctx, out: rig.sfxBus, t, v: Math.max(0, Math.min(1, velocity)), rate: Math.max(0.05, Math.min(1, rate)) })
}
