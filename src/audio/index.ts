// The audio facade: wires the bus to the synth and the sequencer, and respects the player's settings.
// What it plays is the station's inventory (docs/BIBLE.md §10) and nothing else.
import type { SfxName } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { Sequencer, emptyChair, renderRecord4 } from './music'
import { type Glide, type Rig, createGlide, getRig, initSynth, playRecord, playSfx, wake } from './synth'

const sequencer = new Sequencer()
let soundOn = store.settings.sound
let musicOn = store.settings.music
let attached = false
let timeScale = 1
let glideLoop: Glide | null = null
let recordRender: Promise<void> | null = null
let recordPlaying: { src: AudioBufferSourceNode; gain: GainNode } | null = null

/** Checkmate: the bell, 3000 ms of silence, the Survey Theme. */
const MATE_SILENCE_S = 3
/** The photograph: 800 ms of silence, one impulse, the Survey Theme. */
const PHOTO_SILENCE_S = 0.8
/** Record 4 from the house's own player, once, after the needle drops. */
const RECORD_DB = -12
const NEEDLE_S = 0.9

function renderRecordOnce(rig: Rig): void {
  if (recordRender) return
  recordRender = renderRecord4(rig.ctx.sampleRate)
    .then((buf) => { sequencer.setRecord4(buf) })
    .catch(() => { sequencer.setRecord4(null) })
}

/** Everything the rest of the app needs from the sound department. */
export const audio = {
  /** Creates and resumes the AudioContext, renders Record 4 in the background; call on the first user gesture, safe to call repeatedly. */
  init(): void {
    const rig = initSynth()
    if (rig && !attached) {
      attached = true
      sequencer.attach(rig)
      glideLoop = createGlide(rig)
      renderRecordOnce(rig)
    }
  },

  /**
   * Plays a sound effect now, if sound is on and the context exists. Checkmate and the photograph
   * are followed by the Survey Theme and the record's needle drop by Record 4; those are music,
   * so they follow the music setting (inside the sequencer) and not the sound one.
   */
  sfx(name: SfxName, velocity = 1): void {
    const rig = getRig()
    if (!rig) return
    wake(rig)
    if (soundOn) playSfx(rig, name, velocity, undefined, timeScale)
    if (name === 'mate') sequencer.playOnce('survey', MATE_SILENCE_S)
    if (name === 'photo') sequencer.playOnce('survey', PHOTO_SILENCE_S)
    if (name === 'record' && musicOn) {
      const buf = sequencer.getRecord4()
      if (recordPlaying) { recordPlaying.src.stop(); recordPlaying = null }
      if (buf) {
        const playing = playRecord(rig.ctx, rig.musicBus, buf, rig.ctx.currentTime + NEEDLE_S, RECORD_DB, false)
        playing.src.addEventListener('ended', () => { if (recordPlaying === playing) recordPlaying = null })
        recordPlaying = playing
      }
    }
  },

  /** Crossfades (1.2 s) to a theme by id, or to silence with `none` or null. `survey` plays once over the current theme. */
  music(theme: string | null): void {
    sequencer.play(theme)
  },

  /** The Empty Chair once at −12 dB below its Quarters level: the chair has given check. */
  chairCheck(): void {
    sequencer.playOnce('emptychair', 0, emptyChair.gainDb - 12)
  },

  /** The smoothed tide gauge in centipawns; Slack Water sounds within 0.3 pawns of level. */
  setGauge(cp: number): void {
    sequencer.setGauge(cp)
  },

  /** Distance in metres from the house's door, for Record 4 heard on the path. */
  setRecordDistance(metres: number): void {
    sequencer.setRecordDistance(metres)
  },

  /** The glide loop: felt hiss tracking the carried piece's speed in mm/s (−24 dB at 220 mm/s); off when `on` is false. */
  glide(on: boolean, speed?: number): void {
    if (!glideLoop) return
    glideLoop.set(on && soundOn, speed)
  },

  /** Turns sound effects and/or music on or off. */
  setEnabled(o: { sound?: boolean; music?: boolean }): void {
    if (o.sound !== undefined) { soundOn = o.sound; if (!soundOn) glideLoop?.set(false) }
    if (o.music !== undefined) {
      musicOn = o.music
      sequencer.setEnabled(musicOn)
      if (!musicOn && recordPlaying) { recordPlaying.src.stop(); recordPlaying = null }
    }
  },
}

sequencer.setEnabled(musicOn)

bus.on('audio:sfx', ({ name, velocity }) => audio.sfx(name, velocity))
bus.on('audio:music', ({ theme }) => audio.music(theme))
bus.on('settings:change', (s) => audio.setEnabled({ sound: s.sound, music: s.music }))
// Slow motion reaches the sound effects only: the harmonium and the bell are live instruments and ignore it (§10).
bus.on('time:scale', ({ scale }) => { timeScale = scale })
