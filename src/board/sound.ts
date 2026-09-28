/**
 * The date-stamp, docs/visual.md section 13: a rubber stamp struck once on a
 * ledger page on a wooden desk. A short wooden knock with a soft body, about
 * 180 ms, dry, no reverb, modest level. Synthesised with WebAudio when
 * "Detained." finishes typing. Never plays before the page has had a user
 * gesture. On by default; 'settings:sound' on the bus turns it.
 */
import type { EventBus } from '../contracts/events'

export const STAMP_MS = 180
export const STAMP_LEVEL = 0.45

/** The part of AudioContext the knock uses, so a test can stand one in. */
export interface AudioContextLike {
  readonly currentTime: number
  readonly sampleRate: number
  readonly destination: AudioNode
  readonly state: string
  resume(): Promise<void>
  createOscillator(): OscillatorNode
  createGain(): GainNode
  createBiquadFilter(): BiquadFilterNode
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer
  createBufferSource(): AudioBufferSourceNode
  close?(): Promise<void>
}

export interface StampSoundOptions {
  on?: boolean
  /** Makes the audio context. Default: the window's AudioContext, if any. */
  createContext?: () => AudioContextLike | null
  /** Where user gestures are observed. Default: window. */
  gestureTarget?: EventTarget
}

export interface StampSound {
  /** Strikes the stamp, if on and the page has had a gesture. Returns whether it sounded. */
  play(): boolean
  setOn(on: boolean): void
  isOn(): boolean
  /** Whether a user gesture has been seen. */
  hasGesture(): boolean
  destroy(): void
}

const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const

function defaultContextFactory(): AudioContextLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

/** Schedules one knock on the context at its current time. */
export function synthesiseKnock(ctx: AudioContextLike): void {
  const t0 = ctx.currentTime
  const end = t0 + STAMP_MS / 1000

  // The body: a low tone that drops quickly, the desk under the page.
  const body = ctx.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(190, t0)
  body.frequency.exponentialRampToValueAtTime(110, t0 + 0.06)
  const bodyGain = ctx.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t0)
  bodyGain.gain.linearRampToValueAtTime(STAMP_LEVEL, t0 + 0.004)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, end)
  body.connect(bodyGain)
  bodyGain.connect(ctx.destination)
  body.start(t0)
  body.stop(end)

  // The strike: a short burst of noise through a band, the rubber meeting paper.
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.03))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.setValueAtTime(1600, t0)
  band.Q.setValueAtTime(0.9, t0)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(STAMP_LEVEL * 0.6, t0)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035)
  noise.connect(band)
  band.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(t0)
  noise.stop(t0 + 0.04)
}

export function createStampSound(options: StampSoundOptions = {}, bus?: EventBus): StampSound {
  let on = options.on ?? true
  let gestured = false
  let ctx: AudioContextLike | null = null
  const factory = options.createContext ?? defaultContextFactory
  const target: EventTarget | null = options.gestureTarget ?? (typeof window !== 'undefined' ? window : null)

  const activation = (): boolean => {
    if (typeof navigator === 'undefined') return false
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive?: boolean } }).userActivation
    return ua?.hasBeenActive === true
  }

  const markGesture = (): void => {
    gestured = true
    unlisten()
  }
  const unlisten = (): void => {
    if (!target) return
    for (const type of GESTURE_EVENTS) target.removeEventListener(type, markGesture, true)
  }
  if (target) {
    for (const type of GESTURE_EVENTS) target.addEventListener(type, markGesture, true)
  }

  const offBus = bus?.on('settings:sound', (e) => {
    on = e.on
  })

  return {
    play() {
      if (!on) return false
      if (!gestured && !activation()) return false
      if (!ctx) ctx = factory()
      if (!ctx) return false
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
      try {
        synthesiseKnock(ctx)
      } catch {
        return false
      }
      return true
    },
    setOn(value) {
      on = value
    },
    isOn() {
      return on
    },
    hasGesture() {
      return gestured || activation()
    },
    destroy() {
      unlisten()
      offBus?.()
      if (ctx?.close) void ctx.close().catch(() => undefined)
      ctx = null
    },
  }
}
