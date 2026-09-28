// Pure tests for the sound department: no AudioContext. The data of the motifs against the bible,
// the recipes against the SfxName union, and the inventory rule against the module's exports.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAIR_FIGURE, SURVEY_BAR_S, SURVEY_CROTCHET_S, Sequencer, emptyChair, isSlack, isThemeId, motifs, noteName, noteNumber, recordGainDb,
  surveyTheme, themes, windowNotes,
} from '../src/audio/music'
import * as music from '../src/audio/music'
import * as synth from '../src/audio/synth'
import {
  BELL, HARMONIUM, INVENTORY, OUT_STOP_ABOVE_MIDI, SFX_NAMES, SILENT_SFX, dbToGain, fillPink, fillRoomResponse, midiToHz, pinFile, pulleyTimes,
  recipes, tapeCurve,
} from '../src/audio/synth'
import type { SfxName } from '../src/types'

const EXPECTED_SFX: SfxName[] = [
  'pickup', 'place', 'slide', 'capture', 'check', 'mate', 'castle', 'promote',
  'tick', 'flag', 'whip', 'dolly', 'lift', 'paper', 'door', 'bell', 'typewriter',
  'hover', 'select', 'illegal', 'record', 'telephone', 'drawer', 'chime',
  'rise', 'glide', 'seat', 'pin', 'knight', 'ratchet', 'creak', 'clamp', 'hoist', 'tray',
  'lever', 'flagfall', 'knock', 'adjourn', 'key', 'marginbell', 'carriage', 'spares',
  'floorboard', 'shell', 'lamp', 'pulleys', 'photo', 'tidebell', 'wind', 'gull',
]

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps

test('midiToHz and dbToGain', () => {
  assert.equal(midiToHz(69), 440)
  assert.ok(near(midiToHz(81), 880, 1e-9))
  assert.ok(near(dbToGain(0), 1))
  assert.ok(near(dbToGain(-6), 0.5012, 1e-4))
  assert.equal(dbToGain(-Infinity), 0)
})

test('noteNumber and noteName', () => {
  assert.equal(noteNumber('C4'), 60)
  assert.equal(noteNumber('A4'), 69)
  assert.equal(noteNumber('F#5'), 78)
  assert.equal(noteNumber('Bb3'), 58)
  assert.equal(noteNumber('D2'), 38)
  assert.equal(noteName(74), 'D5')
  assert.equal(noteName(38), 'D2')
  assert.throws(() => noteNumber('H4'))
})

test('the Survey Theme: D dorian in 6/8 at 84, the melody and the bass as the bible writes them', () => {
  assert.ok(near(SURVEY_BAR_S, 1.4286, 1e-4), 'one bar is 1.429 s')
  assert.ok(near(SURVEY_CROTCHET_S, 0.476, 1e-3), 'a melody crotchet is 476 ms')
  const right = surveyTheme.notes.filter((n) => n.hand === 'right')
  const left = surveyTheme.notes.filter((n) => n.hand === 'left')
  assert.deepEqual(right.map((n) => noteName(n.midi)), ['D5', 'F5', 'E5', 'D5', 'A4', 'G4', 'A4', 'C5', 'B4', 'A4'])
  // nine crotchets of 476 ms, then A4 held two bars (2.86 s)
  for (const n of right.slice(0, 9)) assert.ok(near(n.dur, SURVEY_CROTCHET_S))
  assert.ok(near(right[9].dur, 2 * SURVEY_BAR_S))
  assert.ok(near(right[9].dur, 2.857, 1e-3))
  right.forEach((n, i) => assert.ok(near(n.at, i * SURVEY_CROTCHET_S), `crotchet ${i} on the grid`))
  // the bass: a dotted minim per bar, D2 A2 G2 A2, one to a bar
  assert.deepEqual(left.map((n) => noteName(n.midi)), ['D2', 'A2', 'G2', 'A2'])
  left.forEach((n, i) => assert.ok(near(n.at, i * SURVEY_BAR_S), `bass ${i} on the bar`))
  for (const n of left.slice(0, 3)) assert.ok(near(n.dur, SURVEY_BAR_S))
  // five bars, 7.1 s in all, never looped
  assert.ok(near(surveyTheme.length, 5 * SURVEY_BAR_S))
  assert.equal(Number(surveyTheme.length.toFixed(1)), 7.1)
  assert.equal(surveyTheme.loop, false)
  const end = Math.max(...surveyTheme.notes.map((n) => n.at + n.dur))
  assert.ok(near(end, surveyTheme.length), 'the last note ends with the fifth bar')
  // the right hand in D dorian: no accidentals
  for (const n of right) assert.ok([0, 2, 4, 5, 7, 9, 11].includes(n.midi % 12))
})

test('the Empty Chair: right hand alone, A4, E5, two bars of nothing, A4; 15 s; looped with its silences', () => {
  assert.deepEqual(CHAIR_FIGURE.map((f) => [f.note, f.bars]), [['A4', 1], ['E5', 1], [null, 2], ['A4', 1]])
  assert.equal(CHAIR_FIGURE.reduce((s, f) => s + f.bars * 3, 0), 15)
  assert.equal(emptyChair.length, 15)
  assert.equal(emptyChair.loop, true)
  assert.ok(emptyChair.notes.every((n) => n.hand === 'right'), 'the bass never enters')
  assert.deepEqual(emptyChair.notes.map((n) => [noteName(n.midi), n.at, n.dur]), [['A4', 0, 3], ['E5', 3, 3], ['A4', 12, 3]])
  assert.equal(emptyChair.gainDb < surveyTheme.gainDb, true, 'heard through the wall')
})

test('the harmonium and the bell carry the numbers of §10', () => {
  assert.equal(HARMONIUM.detuneCents, 6)
  assert.equal(HARMONIUM.lowpassHz, 900)
  assert.equal(HARMONIUM.lowpassQ, 0.7)
  assert.equal(HARMONIUM.tremoloHz, 5.5)
  assert.equal(HARMONIUM.tremoloDepth, 0.08)
  assert.deepEqual([HARMONIUM.attackS, HARMONIUM.decayS, HARMONIUM.sustain, HARMONIUM.releaseS], [0.12, 0, 1.0, 0.4])
  assert.equal(HARMONIUM.breathDb, -36)
  assert.equal(HARMONIUM.outStopDb, -30)
  assert.equal(OUT_STOP_ABOVE_MIDI, noteNumber('E5'))
  assert.equal(BELL.hz, 660)
  assert.deepEqual(BELL.partials.map((p) => p.ratio), [1, 2.0, 2.76, 3.9, 5.4])
  assert.deepEqual(BELL.partials.map((p) => p.decayS), [3.0, 2.2, 1.6, 1.0, 0.6])
  assert.equal(BELL.strikeS, 0.002)
})

test('the inventory rule: nothing outside the station is exported', () => {
  assert.deepEqual([...INVENTORY], ['harmonium', 'bell', 'olivetti', 'pulleys', 'clock', 'record4'])
  const banned = /musicbox|pluck|vibraphone|softbass|brush|harpsichord|glockenspiel|pizzicato|snare|organ|karplus|telephoneRing/i
  for (const name of [...Object.keys(synth), ...Object.keys(music)]) {
    assert.ok(!banned.test(name), `${name} is not in the inventory`)
  }
  assert.equal('instrument' in synth, false)
  assert.equal('INSTRUMENT_RANGE' in music, false)
})

test('every SfxName has a recipe, exactly once; the silent ones are silent', () => {
  assert.deepEqual([...SFX_NAMES].sort(), [...EXPECTED_SFX].sort())
  assert.equal(new Set(SFX_NAMES).size, EXPECTED_SFX.length)
  for (const name of EXPECTED_SFX) assert.equal(typeof recipes[name], 'function', `${name} has a recipe`)
  assert.deepEqual([...SILENT_SFX], ['whip', 'hover', 'telephone'])
  // the generic names map onto the station's sounds
  assert.equal(recipes.pickup, recipes.rise)
  assert.equal(recipes.place, recipes.seat)
  assert.equal(recipes.capture, recipes.hoist)
  assert.equal(recipes.promote, recipes.spares)
  assert.equal(recipes.drawer, recipes.spares)
  assert.equal(recipes.flag, recipes.flagfall)
  assert.equal(recipes.dolly, recipes.floorboard)
  assert.equal(recipes.typewriter, recipes.key)
  assert.equal(recipes.select, recipes.clamp)
  assert.equal(recipes.illegal, recipes.knock)
  assert.equal(recipes.chime, recipes.marginbell)
  assert.equal(recipes.whip, recipes.hover)
  assert.equal(recipes.hover, recipes.telephone)
})

test('the pulleys: forty-one ticks, staggered, inside 4 s', () => {
  const times = pulleyTimes()
  assert.equal(times.length, 41)
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], 'in order')
  assert.ok(times[0] >= 0 && times[times.length - 1] < 4)
  const gaps = times.slice(1).map((t, i) => t - times[i])
  assert.ok(new Set(gaps.map((g) => g.toFixed(4))).size > 10, 'not a metronome')
})

test('the survey pin: velocity picks the file, a..h', () => {
  assert.equal(pinFile(0), 0)
  assert.equal(pinFile(1), 7)
  assert.equal(pinFile(0.5), 4)
  assert.equal(pinFile(-3), 0)
  assert.equal(pinFile(9), 7)
})

test('Slack Water and Record 4 from the path', () => {
  assert.ok(isSlack(0) && isSlack(30) && isSlack(-30))
  assert.ok(!isSlack(31) && !isSlack(-120))
  assert.equal(recordGainDb(0), -30)
  assert.equal(recordGainDb(4), -30)
  assert.ok(near(recordGainDb(8), -36))
  assert.ok(near(recordGainDb(16), -42))
  assert.equal(recordGainDb(40), -Infinity, 'gone by the sixth stone')
})

test('themes: the ids the facade accepts, and what each is made of', () => {
  assert.deepEqual(Object.keys(themes).sort(), ['emptychair', 'galley', 'grid', 'house', 'none', 'path', 'slackwater', 'survey'])
  assert.ok(isThemeId('grid') && !isThemeId('title') && !isThemeId(null))
  assert.equal(themes.survey.motif, 'survey')
  assert.equal(themes.emptychair.motif, 'emptychair')
  assert.equal(themes.slackwater.slackWater, true)
  assert.deepEqual(themes.grid.beds, ['wind', 'channel'])
  assert.ok(themes.path.beds.includes('shell') && themes.path.beds.includes('record4'))
  assert.equal(themes.none.beds.length, 0)
  assert.ok(themes.grid.motif === undefined && themes.path.motif === undefined, 'no other music during chess')
  assert.deepEqual(Object.keys(motifs).sort(), ['emptychair', 'survey'])
})

test('windowNotes: schedules ahead, skips what the timer missed, loops and finishes', () => {
  const m = surveyTheme
  // from rest at t = 10: the first crotchet and the first bass note fall in a 0.2 s window
  const a = windowNotes(m, { cursor: 0, cursorAt: 10, index: 0 }, 10, 0.2, 1)
  assert.deepEqual(a.due.map((d) => [noteName(d.note.midi), d.time]).sort(), [['D2', 10], ['D5', 10]])
  assert.equal(a.done, false)
  // 0.5 s later the second crotchet (at 0.476 s) falls in the window and nothing is played twice
  const b = windowNotes(m, a.cursor, 10.5, 0.2, 1)
  assert.deepEqual(b.due.map((d) => noteName(d.note.midi)), ['F5'])
  assert.ok(near(b.due[0].time, 10 + SURVEY_CROTCHET_S))
  // slow motion: at 0.4 the durations stretch and the times spread
  const c = windowNotes(m, { cursor: 0, cursorAt: 0, index: 0 }, 0, 1.3, 0.4)
  const f5 = c.due.find((d) => noteName(d.note.midi) === 'F5')!
  assert.ok(near(f5.time, SURVEY_CROTCHET_S / 0.4) && near(f5.dur, SURVEY_CROTCHET_S / 0.4))
  // a stalled timer skips the missed notes rather than firing them late
  const d = windowNotes(m, { cursor: 0, cursorAt: 0, index: 0 }, 3.3, 0.2, 1)
  assert.ok(d.due.every((x) => x.time >= 3.25))
  assert.deepEqual(d.due.map((x) => noteName(x.note.midi)), ['C5'])
  assert.equal(d.cursor.index, 11, 'the seven crotchets and three bass notes before it were skipped, and C5 taken')
  // the theme ends once the cursor passes its length
  const e = windowNotes(m, { cursor: 0, cursorAt: 0, index: 0 }, 8, 0.2, 1)
  assert.equal(e.done, true)
  // the Empty Chair loops with its silences: after 15 s the figure begins again
  const f = windowNotes(emptyChair, { cursor: 0, cursorAt: 0, index: 0 }, 14.95, 0.2, 1)
  assert.deepEqual(f.due.map((x) => [noteName(x.note.midi), Number(x.time.toFixed(3))]), [['A4', 15]])
  assert.equal(f.cursor.index, 1)
})

test('windowNotes: a one-shot due in the future (checkmate: the bell, 3 s, the theme) waits for its start', () => {
  const m = surveyTheme
  // requested at t = 10 to start at t = 13: the opening notes are scheduled at 13, not now, and nothing repeats
  const a = windowNotes(m, { cursor: 0, cursorAt: 13, index: 0 }, 10, 0.15, 1)
  assert.deepEqual(a.due.map((d) => [noteName(d.note.midi), d.time]).sort(), [['D2', 13], ['D5', 13]])
  assert.equal(a.cursor.cursorAt, 13)
  assert.equal(a.cursor.cursor, 0)
  const b = windowNotes(m, a.cursor, 12.9, 0.15, 1)
  assert.deepEqual(b.due, [])
  // once the clock passes the start the cursor runs and the second crotchet falls at 13.476
  const c = windowNotes(m, b.cursor, 13.4, 0.15, 1)
  assert.deepEqual(c.due.map((d) => noteName(d.note.midi)), ['F5'])
  assert.ok(near(c.due[0].time, 13 + SURVEY_CROTCHET_S))
  assert.equal(c.done, false)
  // and it finishes 7.14 s after its start, not after the request
  assert.equal(windowNotes(m, c.cursor, 20, 0.15, 1).done, false)
  assert.equal(windowNotes(m, c.cursor, 20.2, 0.15, 1).done, true)
})

test('the master chain: the tape curve is odd and bounded, the room decays to −60 dB at 0.9 s', () => {
  const curve = tapeCurve(1.5, 1001)
  assert.ok(near(curve[500], 0, 1e-9))
  assert.ok(near(curve[1000], Math.tanh(1.5) / 1.5) && near(curve[0], -curve[1000]), 'full scale bends to 0.6')
  assert.ok(near(curve[510], 0.02, 1e-4), 'quiet signals pass at unity')
  assert.ok(Math.abs(curve[750]) < 0.5, 'the tape compresses the top')
  const sr = 1000
  const data = new Float32Array(sr)
  fillRoomResponse(data, sr, 0.9, 1)
  const head = Math.max(...Array.from(data.slice(64, 200)).map(Math.abs))
  const tail = Math.max(...Array.from(data.slice(900)).map(Math.abs))
  assert.ok(tail < head * 0.002, 'sixty decibels down by the end')
  const pink = new Float32Array(4096)
  fillPink(pink, 7)
  assert.ok(Math.max(...Array.from(pink).map(Math.abs)) <= 1.2)
})

test('sequencer without an AudioContext keeps the request pending', () => {
  const s = new Sequencer()
  assert.equal(s.playing, null)
  s.play('house')
  assert.equal(s.playing, 'house')
  s.play('no-such-theme')
  assert.equal(s.playing, null)
  s.play('grid')
  s.play('survey')
  assert.equal(s.playing, 'grid', 'the Survey Theme plays over the current theme')
  s.play('none')
  assert.equal(s.playing, null)
  s.setEnabled(false)
  s.play('slackwater')
  s.setTimeScale(0.4)
  s.setGauge(12)
  s.setRecordDistance(9)
  assert.equal(s.playing, 'slackwater')
  assert.equal(s.getRecord4(), null)
})
