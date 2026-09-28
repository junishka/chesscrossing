// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createBus } from '../contracts/bus'
import { STAMP_MS, createStampSound, synthesiseKnock, type AudioContextLike } from './sound'

interface Log {
  started: number[]
  stopped: number[]
}

function param(): AudioParam {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  } as unknown as AudioParam
}

function fakeContext(log: Log): AudioContextLike {
  const node = (): Record<string, unknown> => ({
    connect: vi.fn(),
    start: (t: number) => log.started.push(t),
    stop: (t: number) => log.stopped.push(t),
    frequency: param(),
    gain: param(),
    Q: param(),
    type: '',
  })
  return {
    currentTime: 1,
    sampleRate: 48000,
    destination: {} as AudioNode,
    state: 'running',
    resume: () => Promise.resolve(),
    createOscillator: () => node() as unknown as OscillatorNode,
    createGain: () => node() as unknown as GainNode,
    createBiquadFilter: () => node() as unknown as BiquadFilterNode,
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }) as unknown as AudioBuffer,
    createBufferSource: () => node() as unknown as AudioBufferSourceNode,
  }
}

describe('synthesiseKnock', () => {
  it('is a short dry knock of about 180 ms: a body and a strike, both started now', () => {
    const log: Log = { started: [], stopped: [] }
    synthesiseKnock(fakeContext(log))
    expect(log.started).toEqual([1, 1])
    expect(Math.max(...log.stopped) - 1).toBeCloseTo(STAMP_MS / 1000)
    expect(STAMP_MS).toBe(180)
  })
})

describe('createStampSound', () => {
  it('never plays before a user gesture, then plays once one has happened', () => {
    const log: Log = { started: [], stopped: [] }
    let made = 0
    const sound = createStampSound({
      createContext: () => {
        made++
        return fakeContext(log)
      },
    })
    expect(sound.hasGesture()).toBe(false)
    expect(sound.play()).toBe(false)
    expect(made).toBe(0)
    window.dispatchEvent(new Event('pointerdown'))
    expect(sound.hasGesture()).toBe(true)
    expect(sound.play()).toBe(true)
    expect(made).toBe(1)
    expect(log.started.length).toBe(2)
    sound.destroy()
  })

  it('starts off when asked and follows settings:sound on the bus', () => {
    const log: Log = { started: [], stopped: [] }
    const bus = createBus()
    const sound = createStampSound({ on: false, createContext: () => fakeContext(log) }, bus)
    window.dispatchEvent(new Event('keydown'))
    expect(sound.isOn()).toBe(false)
    expect(sound.play()).toBe(false)
    bus.emit({ type: 'settings:sound', on: true })
    expect(sound.isOn()).toBe(true)
    expect(sound.play()).toBe(true)
    bus.emit({ type: 'settings:sound', on: false })
    expect(sound.play()).toBe(false)
    sound.destroy()
  })

  it('is silent when the page has no audio', () => {
    const sound = createStampSound({ createContext: () => null })
    window.dispatchEvent(new Event('pointerdown'))
    expect(sound.play()).toBe(false)
    sound.destroy()
  })
})
