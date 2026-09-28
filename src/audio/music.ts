// The motifs, the room tones and the sequencer (docs/BIBLE.md §10). Motif data is pure (no
// AudioContext) so it can be tested: the Survey Theme, the Empty Chair and Slack Water on the
// harmonium; wind, sea, channel, shell underfoot and Record 4 as beds. There is no other music.
import {
  type Harmonium, type HeldNote, type Rig, RECORD4, addCrackle, createRig, dbToGain, gull, harmonium, pinkBuffer, playRecord, whiteBuffer, wake,
} from './synth'

// ───────────────────────────── Notes ─────────────────────────────

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Note name to MIDI: `C4` = 60, `F#5` = 78, `Bb3` = 58. Throws on nonsense. */
export function noteNumber(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`bad note ${name}`)
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + PITCH_CLASS[m[1]] + accidental
}

/** MIDI to a note name with sharps: 74 = `D5`. */
export function noteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

/** One note of a motif: `at` and `dur` in seconds from the motif's start; `hand` is left or right. */
export interface MotifNote { at: number; midi: number; dur: number; hand: 'left' | 'right' }

/** A motif for the harmonium: its notes in time, its length (silences included) and whether it loops. */
export interface Motif {
  id: MotifId
  /** The key and metre, for the record. */
  description: string
  /** Seconds, silences included. */
  length: number
  loop: boolean
  /** Level on the music bus in dB. */
  gainDb: number
  notes: MotifNote[]
}

/** The motifs the harmonium plays. */
export type MotifId = 'survey' | 'emptychair'

// ───────────────────────────── The Survey Theme ─────────────────────────────

/** 6/8 at 84 dotted-crotchet bpm: one bar is 1.429 s. */
export const SURVEY_BAR_S = (60 / 84) * 2
/** The melody's crotchets, three to a bar as a hemiola: 476 ms. */
export const SURVEY_CROTCHET_S = SURVEY_BAR_S / 3
/** The melody: D5 F5 E5 | D5 A4 G4 | A4 C5 B4 | A4 held two bars. */
export const SURVEY_MELODY = ['D5', 'F5', 'E5', 'D5', 'A4', 'G4', 'A4', 'C5', 'B4', 'A4'] as const
/** The bass, a dotted minim per bar: D2, A2, G2, A2, the last held under the melody's two bars. */
export const SURVEY_BASS = ['D2', 'A2', 'G2', 'A2'] as const

function surveyNotes(): MotifNote[] {
  const notes: MotifNote[] = []
  SURVEY_MELODY.forEach((name, i) => {
    const last = i === SURVEY_MELODY.length - 1
    notes.push({ at: i * SURVEY_CROTCHET_S, midi: noteNumber(name), dur: last ? 2 * SURVEY_BAR_S : SURVEY_CROTCHET_S, hand: 'right' })
  })
  SURVEY_BASS.forEach((name, i) => {
    const last = i === SURVEY_BASS.length - 1
    notes.push({ at: i * SURVEY_BAR_S, midi: noteNumber(name), dur: last ? 2 * SURVEY_BAR_S : SURVEY_BAR_S, hand: 'left' })
  })
  return notes.sort((a, b) => a.at - b.at)
}

/** The Survey Theme: harmonium, D dorian, 6/8 at 84, five bars, 7.1 s. Once at checkmate and at each chapter card; never looped. */
export const surveyTheme: Motif = {
  id: 'survey',
  description: 'D dorian, 6/8 at 84 dotted-crotchet bpm',
  length: 5 * SURVEY_BAR_S,
  loop: false,
  gainDb: -8,
  notes: surveyNotes(),
}

// ───────────────────────────── The Empty Chair ─────────────────────────────

/** 3/4 at 60 bpm: a dotted minim is 3 s. */
export const CHAIR_BAR_S = 3
/** The figure: A4 (3 s), E5 (3 s), two bars of nothing (6 s), A4 (3 s); 15 s. The bass never enters. */
export const CHAIR_FIGURE: readonly { note: string | null; bars: number }[] = [
  { note: 'A4', bars: 1 }, { note: 'E5', bars: 1 }, { note: null, bars: 2 }, { note: 'A4', bars: 1 },
]

function chairNotes(): MotifNote[] {
  const notes: MotifNote[] = []
  let at = 0
  for (const step of CHAIR_FIGURE) {
    if (step.note) notes.push({ at, midi: noteNumber(step.note), dur: step.bars * CHAIR_BAR_S, hand: 'right' })
    at += step.bars * CHAIR_BAR_S
  }
  return notes
}

/** The Empty Chair: harmonium, right hand alone, A minor, 3/4 at 60 bpm, looped with its silences. */
export const emptyChair: Motif = {
  id: 'emptychair',
  description: 'A minor, 3/4 at 60 bpm, right hand alone',
  length: CHAIR_FIGURE.reduce((s, f) => s + f.bars * CHAIR_BAR_S, 0),
  loop: true,
  gainDb: -14,
  notes: chairNotes(),
}

/** Every motif by id. */
export const motifs: Record<MotifId, Motif> = { survey: surveyTheme, emptychair: emptyChair }

/** Slack Water: a held harmonium fifth, D2 and A2, at −30 dB, while the gauge is within 0.3 pawns of level. */
export const SLACK_WATER = { notes: ['D2', 'A2'] as const, gainDb: -30, windowPawns: 0.3, releaseS: 0.4 } as const

/** True when the smoothed gauge (centipawns) is within Slack Water's window of level. */
export function isSlack(cp: number): boolean {
  return Math.abs(cp) <= SLACK_WATER.windowPawns * 100
}

/**
 * Record 4 heard from the path: −30 dB at the door (4 m and nearer), falling 6 dB for each doubling
 * of the distance beyond 4 m; below −48 dB it is gone.
 */
export function recordGainDb(metres: number): number {
  const m = Math.max(0, metres)
  const db = m <= 4 ? -30 : -30 - 6 * Math.log2(m / 4)
  return db < -48 ? -Infinity : db
}

/** The path's cadence: one step every 625 ms. */
export const SHELL_STEP_S = 0.625

// ───────────────────────────── Themes ─────────────────────────────

/** The theme ids `audio.music()` accepts. `survey` plays once over whatever is sounding; `none` and null are silence. */
export type ThemeId = 'survey' | 'emptychair' | 'slackwater' | 'house' | 'galley' | 'path' | 'grid' | 'none'

/** A continuous layer of a theme. */
export type BedName = 'boardroomTone' | 'houseTone' | 'galleyTone' | 'range' | 'sea' | 'wind' | 'channel' | 'shell' | 'record4' | 'gulls'

/** What a theme is made of: beds, an optional looping motif, and whether Slack Water's fifth is gated in. */
export interface ThemeDef {
  id: ThemeId
  beds: BedName[]
  motif?: MotifId
  slackWater?: boolean
}

/** Every theme by id. */
export const themes: Record<ThemeId, ThemeDef> = {
  survey: { id: 'survey', beds: [], motif: 'survey' },
  emptychair: { id: 'emptychair', beds: ['houseTone'], motif: 'emptychair' },
  slackwater: { id: 'slackwater', beds: ['boardroomTone', 'sea'], slackWater: true },
  house: { id: 'house', beds: ['houseTone'] },
  galley: { id: 'galley', beds: ['galleyTone', 'range'] },
  path: { id: 'path', beds: ['wind', 'shell', 'record4', 'gulls'] },
  grid: { id: 'grid', beds: ['wind', 'channel'] },
  none: { id: 'none', beds: [] },
}

/** True for a theme id the sequencer knows. */
export function isThemeId(id: string | null): id is ThemeId {
  return id !== null && Object.prototype.hasOwnProperty.call(themes, id)
}

// ───────────────────────────── Scheduling (pure) ─────────────────────────────

/** The position of a motif voice: motif seconds at a context time, and the next note to schedule. */
export interface Cursor { cursor: number; cursorAt: number; index: number }

/** A note the window decided to play: context time and stretched duration. */
export interface Due { note: MotifNote; time: number; dur: number }

/**
 * Advances a cursor to `now` at `scale` motif-seconds per real second and returns the notes that fall
 * inside the next `lookahead` real seconds. Notes the timer missed (a throttled tab) are skipped, not
 * fired late. A looping motif wraps; a finished one leaves `index` at the end and `done` true.
 */
export function windowNotes(motif: Motif, c: Cursor, now: number, lookahead: number, scale: number): { cursor: Cursor; due: Due[]; done: boolean } {
  const s = Math.max(0.05, scale)
  let cursor = c.cursor + Math.max(0, now - c.cursorAt) * s
  let index = c.index
  const cursorAt = Math.max(now, c.cursorAt)
  let horizon = cursor + lookahead * s
  const due: Due[] = []
  let done = false
  for (;;) {
    if (index >= motif.notes.length) {
      if (!motif.loop) { done = cursor >= motif.length; break }
      if (horizon < motif.length) break
      cursor -= motif.length
      horizon -= motif.length
      index = 0
      continue
    }
    const n = motif.notes[index]
    if (n.at > horizon) break
    const time = cursorAt + (n.at - cursor) / s
    if (time >= now - 0.05) due.push({ note: n, time, dur: n.dur / s })
    index++
  }
  return { cursor: { cursor, cursorAt, index }, due, done }
}

// ───────────────────────────── Beds ─────────────────────────────

/** A running layer: `stop(t)` closes it, `tick` schedules pulses ahead (steps, gulls) for beds that have them. */
export interface Bed {
  stop(t: number): void
  tick?(now: number, lookahead: number): void
}

interface BedContext {
  rig: Rig
  out: AudioNode
  record4: () => AudioBuffer | null
  recordDb: () => number
}

/** Filtered noise with a slow amplitude LFO: the sea, the wind, the channel, the room tones. */
function noiseBed(ctx: BaseAudioContext, out: AudioNode, t: number, o: { pink: boolean; type: BiquadFilterType; hz: number; q?: number; db: number; lfoHz?: number; lfoDepth?: number }): Bed {
  const src = ctx.createBufferSource()
  src.buffer = o.pink ? pinkBuffer(ctx) : whiteBuffer(ctx)
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = o.type
  f.frequency.value = o.hz
  f.Q.value = o.q ?? 0.7
  const level = ctx.createGain()
  const base = dbToGain(o.db)
  level.gain.value = base
  const stops: { stop(t: number): void }[] = [src]
  if (o.lfoHz) {
    // The level swings between base × (1 − depth) and base.
    const depth = o.lfoDepth ?? 0.5
    level.gain.value = base * (1 - depth / 2)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = o.lfoHz
    const d = ctx.createGain()
    d.gain.value = (base * depth) / 2
    lfo.connect(d)
    d.connect(level.gain)
    lfo.start(t)
    stops.push(lfo)
  }
  const fade = ctx.createGain()
  fade.gain.value = 0.0001
  fade.gain.setValueAtTime(0.0001, t)
  fade.gain.linearRampToValueAtTime(1, t + 0.6)
  src.connect(f)
  f.connect(level)
  level.connect(fade)
  fade.connect(out)
  src.start(t, (t * 1.37) % 3)
  return {
    stop(at) {
      fade.gain.cancelScheduledValues(at)
      fade.gain.setValueAtTime(1, at)
      fade.gain.linearRampToValueAtTime(0.0001, at + 0.6)
      for (const s of stops) s.stop(at + 0.7)
    },
  }
}

/** A deterministic scheduler of pulses: the path's steps, the gulls. */
function pulseBed(start: number, next: (i: number, seed: number) => number, fire: (t: number, i: number) => void): Bed {
  let i = 0
  let at = start
  let seed = 0x6c8e9cf5
  let stopped = false
  return {
    stop() { stopped = true },
    tick(now, lookahead) {
      while (!stopped && at < now + lookahead) {
        if (at >= now - 0.05) fire(at, i)
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        at += next(i, seed / 0xffffffff)
        i++
      }
    },
  }
}

/** Builds one bed at `t` into `bc.out`. */
function buildBed(bc: BedContext, name: BedName, t: number): Bed {
  const { ctx } = bc.rig
  const out = bc.out
  switch (name) {
    case 'boardroomTone': return noiseBed(ctx, out, t, { pink: false, type: 'bandpass', hz: 250, q: 0.7, db: -42 })
    case 'houseTone': return noiseBed(ctx, out, t, { pink: false, type: 'bandpass', hz: 250, q: 0.7, db: -42 })
    case 'galleyTone': return noiseBed(ctx, out, t, { pink: false, type: 'bandpass', hz: 400, q: 0.7, db: -42 })
    case 'range': return noiseBed(ctx, out, t, { pink: true, type: 'lowpass', hz: 60, q: 0.7, db: -38, lfoHz: 0.3, lfoDepth: 0.3 })
    case 'sea': return noiseBed(ctx, out, t, { pink: true, type: 'lowpass', hz: 900, q: 0.5, db: -36, lfoHz: 0.08, lfoDepth: 0.6 })
    case 'wind': return noiseBed(ctx, out, t, { pink: true, type: 'lowpass', hz: 600, q: 0.5, db: -30, lfoHz: 0.05, lfoDepth: 0.6 })
    case 'channel': return noiseBed(ctx, out, t, { pink: true, type: 'lowpass', hz: 120, q: 0.7, db: -34, lfoHz: 0.1, lfoDepth: 0.7 })
    case 'shell': return pulseBed(t + 0.3, () => SHELL_STEP_S, (at) => shellStep(ctx, out, at))
    // One gull at a time: a gull lasts under a second and the next is 18 to 40 s away.
    case 'gulls': return pulseBed(t + 6, (_i, r) => 18 + r * 22, (at) => gull(ctx, out, at, 0.7))
    case 'record4': return recordBed(bc, t)
    default: return neverBed(name)
  }
}

function neverBed(name: never): never {
  throw new Error(`unknown bed ${String(name)}`)
}

/** One shell step: noise band-pass 3 kHz, 60 ms, −22 dB. */
function shellStep(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const src = ctx.createBufferSource()
  src.buffer = whiteBuffer(ctx)
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 3000
  f.Q.value = 1
  const g = ctx.createGain()
  g.gain.value = 0.0001
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(dbToGain(-22), t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.start(t, (t * 5.13) % 3.5)
  src.stop(t + 0.1)
}

/** Record 4 faint from the house, looped, its level following the distance; starts when the render arrives. */
function recordBed(bc: BedContext, t: number): Bed {
  const { ctx } = bc.rig
  let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  let stopped = false
  let lastDb = Number.NaN
  const apply = (at: number): void => {
    const db = bc.recordDb()
    if (!playing || db === lastDb) return
    lastDb = db
    playing.gain.gain.setTargetAtTime(dbToGain(db), at, 0.25)
  }
  const tryStart = (at: number): void => {
    const buf = bc.record4()
    if (!buf || playing || stopped) return
    playing = playRecord(ctx, bc.out, buf, at, bc.recordDb(), true)
  }
  tryStart(t)
  return {
    stop(at) {
      stopped = true
      if (playing) { playing.gain.gain.setTargetAtTime(0, at, 0.2); playing.src.stop(at + 1) }
    },
    tick(now) { tryStart(now + 0.05); apply(now) },
  }
}

// ───────────────────────────── Record 4 ─────────────────────────────

/** Length of the record: the theme, its release and a little run-out. */
export const RECORD4_SECONDS = Math.ceil(surveyTheme.length + 2)

/**
 * Renders Record 4 once: the Survey Theme on the harmonium through its own rig, with wow
 * (0.5 Hz, ±4 cents) on every oscillator and crackle (12 impulses/s at −40 dB) pressed into the groove.
 * Needs `OfflineAudioContext`; resolves null where there is none.
 */
export async function renderRecord4(sampleRate: number): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null
  const off = new OfflineAudioContext(2, Math.floor(sampleRate * RECORD4_SECONDS), sampleRate)
  const rig = createRig(off)
  const wow = off.createOscillator()
  wow.frequency.value = RECORD4.wowHz
  const depth = off.createGain()
  depth.gain.value = RECORD4.wowCents
  wow.connect(depth)
  wow.start()
  const level = off.createGain()
  level.gain.value = dbToGain(surveyTheme.gainDb)
  level.connect(rig.musicBus)
  scheduleMotif(harmonium(off, level, depth), surveyTheme, 0.2)
  const buf = await off.startRendering()
  addCrackle(buf)
  return buf
}

/**
 * Renders `seconds` of a theme onto any context (the sound department's demo): its beds, its motif
 * from `t0`, and Slack Water's fifth held open. Returns nothing; the caller renders the context.
 */
export function renderTheme(rig: Rig, id: ThemeId, seconds: number, record4: AudioBuffer | null = null, t0 = 0.05): void {
  const def = themes[id]
  const { ctx } = rig
  const bc: BedContext = { rig, out: rig.musicBus, record4: () => record4, recordDb: () => recordGainDb(4) }
  const beds = def.beds.map((b) => buildBed(bc, b, t0))
  for (const b of beds) b.tick?.(t0, seconds)
  if (def.motif) {
    const m = motifs[def.motif]
    const g = ctx.createGain()
    g.gain.value = dbToGain(m.gainDb)
    g.connect(rig.musicBus)
    scheduleMotif(harmonium(ctx, g), m, t0)
  }
  if (def.slackWater) {
    const g = ctx.createGain()
    g.gain.value = dbToGain(SLACK_WATER.gainDb)
    g.connect(rig.musicBus)
    const h = harmonium(ctx, g)
    for (const n of SLACK_WATER.notes) h.hold(noteNumber(n), t0)
  }
}

/** Schedules every note of a motif on a harmonium from `t0`, unstretched. */
export function scheduleMotif(h: Harmonium, motif: Motif, t0: number): void {
  for (const n of motif.notes) h.note(n.midi, t0 + n.at, n.dur)
}

// ───────────────────────────── Sequencer ─────────────────────────────

const LOOKAHEAD_S = 0.15
/** Hidden tabs get their timers throttled to about once a second; schedule further ahead there. */
const HIDDEN_LOOKAHEAD_S = 1.5
const INTERVAL_MS = 25
/** Themes crossfade over 1.2 s. */
export const CROSSFADE_S = 1.2

interface MotifVoice {
  motif: Motif
  h: Harmonium
  gain: GainNode
  c: Cursor
  /** Context time after which the voice can be dropped. */
  endsAt: number | null
}

interface ThemeVoice {
  id: ThemeId
  gain: GainNode
  beds: Bed[]
  motif: MotifVoice | null
  slack: { h: Harmonium; held: HeldNote[]; gate: GainNode; open: boolean } | null
  fadeStart: number
  endsAt: number | null
}

/**
 * The sequencer: a 25 ms timer schedules 150 ms ahead. Themes are beds plus at most one looping
 * harmonium motif, crossfading over 1.2 s; the Survey Theme and the Empty Chair can also be played
 * once, over whatever is sounding. `setTimeScale` stretches the scheduling (the demo's control);
 * the game never calls it, because the harmonium is a live instrument and ignores slow motion (§10).
 */
export class Sequencer {
  private rig: Rig | null = null
  private voices: ThemeVoice[] = []
  private oneShots: MotifVoice[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private timeScale = 1
  private enabled = true
  private current: ThemeId | null = null
  private gaugeCp = 0
  private recordMetres = 4
  private record4: AudioBuffer | null = null
  private readonly onVisibility = (): void => { this.tick() }

  /** Connects the sequencer to a rig; starts the pending theme if one was requested earlier. */
  attach(rig: Rig): void {
    if (this.rig !== rig && typeof document !== 'undefined') {
      if (this.rig) document.removeEventListener('visibilitychange', this.onVisibility)
      document.addEventListener('visibilitychange', this.onVisibility)
    }
    this.rig = rig
    if (this.current) this.startTheme(this.current)
  }

  /** Gives the sequencer the rendered Record 4; the path's bed starts it on its next tick. */
  setRecord4(buffer: AudioBuffer | null): void {
    this.record4 = buffer
  }

  /** The rendered Record 4, if it has arrived. */
  getRecord4(): AudioBuffer | null {
    return this.record4
  }

  /** The theme requested most recently (playing, or pending until attached or enabled). */
  get playing(): ThemeId | null {
    return this.current
  }

  /**
   * Crossfades to a theme, or to silence with `none` or null. Unknown ids fade to silence; the same id
   * keeps playing. `survey` is not a place: it plays the Survey Theme once over the current theme.
   */
  play(id: string | null): void {
    if (id === 'survey') { this.playOnce('survey'); return }
    const next: ThemeId | null = isThemeId(id) && id !== 'none' ? id : null
    if (next !== null && next === this.current && this.voices.some((v) => v.endsAt === null)) return
    this.current = next
    this.fadeOutAll()
    if (this.current) this.startTheme(this.current)
  }

  /** Plays a motif once, over whatever is sounding, `delay` seconds from now, at `gainDb` (the motif's own by default). */
  playOnce(id: MotifId, delay = 0, gainDb?: number): void {
    if (!this.rig || !this.enabled) return
    wake(this.rig)
    const ctx = this.rig.ctx
    const motif = motifs[id]
    const gain = ctx.createGain()
    gain.gain.value = dbToGain(gainDb ?? motif.gainDb)
    gain.connect(this.rig.musicBus)
    const start = ctx.currentTime + 0.05 + Math.max(0, delay)
    this.oneShots.push({ motif: { ...motif, loop: false }, h: harmonium(ctx, gain), gain, c: { cursor: 0, cursorAt: start, index: 0 }, endsAt: null })
    this.ensureTimer()
  }

  /** Motif seconds per real second: 0.4 makes the scheduling four-tenths as fast. Not driven by `time:scale` in the game. */
  setTimeScale(scale: number): void {
    this.timeScale = scale
  }

  /** The smoothed gauge in centipawns: Slack Water sounds within 30 of level and stops over 400 ms when it moves. */
  setGauge(cp: number): void {
    this.gaugeCp = cp
    for (const v of this.voices) this.applyGate(v)
  }

  /** Distance in metres from the house's door, for Record 4 on the path. */
  setRecordDistance(metres: number): void {
    this.recordMetres = metres
  }

  /** Mutes (fade out) or restores the current theme. */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return
    this.enabled = on
    if (!on) this.fadeOutAll()
    else if (this.current) this.startTheme(this.current)
  }

  private applyGate(v: ThemeVoice): void {
    if (!v.slack || !this.rig) return
    const open = isSlack(this.gaugeCp)
    if (open === v.slack.open) return
    v.slack.open = open
    const now = this.rig.ctx.currentTime
    const p = v.slack.gate.gain
    p.cancelScheduledValues(now)
    p.setValueAtTime(open ? 0.0001 : 1, now)
    p.linearRampToValueAtTime(open ? 1 : 0.0001, now + SLACK_WATER.releaseS)
  }

  private startTheme(id: ThemeId): void {
    if (!this.rig || !this.enabled) return
    const rig = this.rig
    wake(rig)
    const ctx = rig.ctx
    const def = themes[id]
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.value = 0.0001
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_S)
    gain.connect(rig.musicBus)
    const bc: BedContext = { rig, out: gain, record4: () => this.record4, recordDb: () => recordGainDb(this.recordMetres) }
    const beds = def.beds.map((b) => buildBed(bc, b, now + 0.02))
    let motif: MotifVoice | null = null
    if (def.motif) {
      const m = motifs[def.motif]
      const mg = ctx.createGain()
      mg.gain.value = dbToGain(m.gainDb)
      mg.connect(gain)
      motif = { motif: m, h: harmonium(ctx, mg), gain: mg, c: { cursor: 0, cursorAt: now + 0.5, index: 0 }, endsAt: null }
    }
    let slack: ThemeVoice['slack'] = null
    if (def.slackWater) {
      const gate = ctx.createGain()
      gate.gain.value = 0.0001
      const level = ctx.createGain()
      level.gain.value = dbToGain(SLACK_WATER.gainDb)
      gate.connect(level)
      level.connect(gain)
      const h = harmonium(ctx, gate)
      const held = SLACK_WATER.notes.map((n) => h.hold(noteNumber(n), now + 0.05))
      slack = { h, held, gate, open: false }
    }
    const voice: ThemeVoice = { id, gain, beds, motif, slack, fadeStart: now, endsAt: null }
    this.voices.push(voice)
    this.applyGate(voice)
    this.ensureTimer()
  }

  private fadeOutAll(): void {
    if (!this.rig) return
    const now = this.rig.ctx.currentTime
    for (const v of this.voices) {
      if (v.endsAt !== null) continue
      // Computed rather than read from `gain.value`, which some engines do not update mid-ramp.
      const reached = Math.max(0.0001, Math.min(1, (now - v.fadeStart) / CROSSFADE_S))
      v.gain.gain.cancelScheduledValues(now)
      v.gain.gain.setValueAtTime(reached, now)
      v.gain.gain.linearRampToValueAtTime(0.0001, now + CROSSFADE_S)
      v.endsAt = now + CROSSFADE_S
      for (const b of v.beds) b.stop(now + CROSSFADE_S - 0.6)
      // The fifth is held open for as long as the theme lives; released here, its sources stop
      // 400 ms later instead of running (silent) for the rest of the session.
      if (v.slack) for (const n of v.slack.held) n.release(now + CROSSFADE_S - SLACK_WATER.releaseS)
    }
  }

  private ensureTimer(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.tick(), INTERVAL_MS)
  }

  private tick(): void {
    if (!this.rig) return
    const now = this.rig.ctx.currentTime
    const lookahead = typeof document !== 'undefined' && document.hidden ? HIDDEN_LOOKAHEAD_S : LOOKAHEAD_S
    const keep: ThemeVoice[] = []
    for (const v of this.voices) {
      if (v.endsAt === null || now < v.endsAt) {
        for (const b of v.beds) b.tick?.(now, lookahead)
        if (v.motif) this.advance(v.motif, now, lookahead, v.endsAt)
      }
      if (v.endsAt !== null && v.endsAt <= now) this.dropTheme(v, now)
      else keep.push(v)
    }
    this.voices = keep
    const shots: MotifVoice[] = []
    for (const m of this.oneShots) {
      this.advance(m, now, lookahead, null)
      if (m.endsAt !== null && m.endsAt <= now) { m.h.dispose(now); m.gain.disconnect() }
      else shots.push(m)
    }
    this.oneShots = shots
    if (!this.voices.length && !this.oneShots.length && this.timer !== null) { clearInterval(this.timer); this.timer = null }
  }

  private dropTheme(v: ThemeVoice, now: number): void {
    v.motif?.h.dispose(now)
    if (v.slack) {
      for (const n of v.slack.held) n.release(now)
      v.slack.h.dispose(now + SLACK_WATER.releaseS)
    }
    v.gain.disconnect()
  }

  private advance(m: MotifVoice, now: number, lookahead: number, endsAt: number | null): void {
    const r = windowNotes(m.motif, m.c, now, lookahead, this.timeScale)
    m.c = r.cursor
    for (const d of r.due) if (endsAt === null || d.time < endsAt) m.h.note(d.note.midi, d.time, d.dur)
    if (r.done && m.endsAt === null) m.endsAt = now + 1.5
  }
}
