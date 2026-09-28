import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { assertPalette, grades, palette, saturationOf, sides, squares, tokens, ui } from '../src/content/palette'
import { laws } from '../src/content/laws'
import { orders } from '../src/content/orders'
import { ALL_SQUARES, cairnReadLine, isletName, legend, plateText, SLATE_NAMES, slateName } from '../src/content/survey'
import { findBook, openings } from '../src/content/openings'
import { CORRESPONDENCE_FEN, correspondencePlies, HOUSE_GAME_FEN, JUNE_CARD_TEXT, UNPOSTED_MOVE } from '../src/content/correspondence'
import { chapterEntries, chapters } from '../src/content/chapters'
import { eggEntries, eggs } from '../src/content/eggs'
import { chairBudgetMs, ratingUpdate, seaStates } from '../src/content/seaStates'
import {
  causewayCardText, crossable, isDusk, readingDue, secondsToNextWindowChange, stationClock, tidePhase, watches, watchStartLabel,
} from '../src/content/watches'
import { crateLine, dayName, earlierVolumeHeaders, ledgerHeader, readingText, wirelessTranscript } from '../src/content/station'

test('the correspondence game validates and reaches the bible position', () => {
  const c = new Chess()
  for (const san of correspondencePlies) assert.ok(c.move(san), `illegal ply ${san}`)
  assert.equal(correspondencePlies.length, 80)
  assert.equal(c.fen(), CORRESPONDENCE_FEN)
  assert.ok(c.move(UNPOSTED_MOVE))
  assert.equal(c.fen(), HOUSE_GAME_FEN)
  assert.equal(JUNE_CARD_TEXT, '40. Rc8   your move, then. A.H.')
})

test('every islet name resolves and the legend has sixty-four entries', () => {
  assert.equal(legend.length, 64)
  assert.equal(new Set(legend.map((e) => e.square)).size, 64)
  assert.equal(new Set(legend.map((e) => e.name)).size, 64)
  for (const sq of ALL_SQUARES) assert.match(isletName(sq), /^[A-Z][a-z]+ [A-Z][a-z]+$/)
  assert.equal(isletName('e4'), 'Eider Reach')
  assert.equal(isletName('f7'), 'Fennel Skerry')
  assert.equal(isletName('h8'), 'Heron Head')
  assert.equal(plateText('e4', 1931, true), 'e4 · EIDER REACH · SURVEYED 1931 · A.H.')
  assert.equal(plateText('h8', 1965, false), 'h8 · HERON HEAD · NOT SURVEYED')
  assert.equal(cairnReadLine('c4'), 'Cairn c4 (Cinder Reach) read.')
  assert.equal(slateName('h5'), 'Hirst Sound')
  assert.equal(slateName('e4'), 'Eider Reach')
  assert.equal(Object.keys(SLATE_NAMES).length, 8)
})

test('chapters 1..9 in order, each with a date fallback', () => {
  assert.equal(chapterEntries.length, 9)
  chapterEntries.forEach((c, i) => {
    assert.equal(c.number, i + 1)
    assert.ok(c.sentence.length > 0)
    assert.equal(c.triggers[c.triggers.length - 1].kind, i === 0 ? 'start' : 'date')
  })
  assert.equal(chapters.length, 9)
  assert.equal(chapters[0].unlock.kind, 'start')
  assert.equal(chapters[1].unlock.kind, 'games')
  assert.equal(chapterEntries[8].sentence, 'Low water was at 16:12. The season was closed properly.')
})

test('thirty-two eggs with unique ids in known frames', () => {
  assert.equal(eggs.length, 32)
  assert.equal(new Set(eggs.map((e) => e.id)).size, 32)
  eggEntries.forEach((e, i) => assert.equal(e.id, `EE-${String(i + 1).padStart(2, '0')}`))
  const frames = new Set(['boardroom', 'chartroom', 'galley', 'landing', 'recorders', 'quarters', 'lamproom', 'workshop', 'boathouse', 'section', 'jetty', 'path', 'point', 'grid', 'eider', 'cinder', 'heron'])
  for (const e of eggs) assert.ok(frames.has(e.location), `${e.id} in ${e.location}`)
})

test('the palette passes the Law VII lint', () => {
  assertPalette()
  assert.equal(Object.keys(tokens).length, 39)
  assert.equal(tokens['grid.beacon'], '#A5503F')
  assert.ok(saturationOf(tokens['grid.beacon']) <= 0.62)
  assert.equal(squares.hover, '#C9A55A')
  assert.equal(sides.w.body, '#E3D6B4')
  assert.equal(sides.b.felt, '#B99A4E')
  assert.equal(ui.paperWhite, '#E8DFC6')
  assert.equal(palette.boardroom.wall, '#86A5AE')
  assert.deepEqual(grades.outside.gain, [1.05, 1.01, 0.94])
  assert.equal(grades.outside.vignette, 0.15)
})

test('laws and orders are complete', () => {
  assert.equal(laws.length, 15)
  assert.equal(laws[14].title, 'Nothing is cruel.')
  assert.equal(orders.length, 12)
  assert.equal(orders[3].text, 'The board is never left unset.')
  assert.ok(orders[11].typed)
})

test('every book line is legal and the book is found', () => {
  assert.equal(openings.length, 12)
  for (const line of openings) {
    assert.equal(line.sanMoves.length, 8)
    const c = new Chess()
    for (const san of line.sanMoves) assert.ok(c.move(san), `${line.eco} ${san}`)
  }
  assert.deepEqual(findBook(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']), { eco: 'D37', name: "Queen's Gambit Declined", inBook: true })
  const left = findBook(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bg5'])
  assert.equal(left.inBook, false)
  assert.equal(left.leftAtPly, 9)
  assert.equal(left.leftAtMove, 5)
  const never = findBook(['a3'])
  assert.equal(never.inBook, false)
  assert.equal(never.leftAtPly, 1)
  assert.equal(findBook([]).inBook, true)
})

test('sea states and the station arithmetic', () => {
  assert.equal(seaStates.length, 9)
  assert.equal(seaStates[4].card, 'Small waves, becoming longer. Fairly frequent white horses.')
  assert.equal(seaStates[8].nominal, 2150)
  assert.equal(chairBudgetMs(8, 10 * 60 * 1000, 0), 10000)
  assert.equal(chairBudgetMs(8, 60 * 1000, 3000), 60 * 1000 / 25 + 2400)
  assert.equal(chairBudgetMs(4, 1000, 0), 300)
  assert.equal(chairBudgetMs(4, null, 0), 1200)
  assert.equal(ratingUpdate(1400, 0.5, 1400), 1400)
  assert.ok(ratingUpdate(1400, 1, 1650) > 1400)
  assert.ok(ratingUpdate(1400, 0, 800) < 1400)
})

test('watches and station time', () => {
  assert.equal(watches.length, 4)
  assert.equal(watchStartLabel(0), '04:00')
  assert.equal(watchStartLabel(5), '00:00')
  assert.equal(stationClock(0, 0), '04:00')
  assert.equal(stationClock(0, 250), '08:00')
  assert.equal(stationClock(3, 115), '17:50')
  assert.equal(readingDue(0, 82), false)
  assert.equal(readingDue(0, 83), true)
  assert.equal(readingDue(3, 114), false)
  assert.equal(readingDue(3, 115), true)
  assert.equal(readingDue(1, 200), false)
  assert.equal(isDusk(3), true)
  assert.equal(isDusk(2), false)
})

test('the tide', () => {
  assert.equal(tidePhase(0), 0)
  assert.equal(tidePhase(1550), 0)
  assert.ok(crossable(tidePhase(100)))
  assert.ok(crossable(tidePhase(1550 - 200)))
  assert.ok(!crossable(tidePhase(500)))
  assert.equal(secondsToNextWindowChange(0), 240)
  assert.ok(Math.abs(secondsToNextWindowChange(1550 - 240 - 200) - 200) < 1e-6)
  assert.equal(causewayCardText(200), 'Water over the causeway. 1 h 40 min.')
})

test('station strings', () => {
  assert.equal(dayName(1), 'Wednesday')
  assert.equal(dayName(30), 'Thursday')
  assert.equal(ledgerHeader(3, 'LONG WATCH', 4, 14), 'EXPEDITION 3     LONG WATCH     SEA STATE 4     14 SEPT 1965')
  assert.equal(crateLine(6, 'The Galley dresser, left', 21), 'CRATE 6.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.')
  const vols = earlierVolumeHeaders()
  assert.equal(vols.length, 12)
  assert.equal(vols[11], 'VOL. XII.  1964.  EXPEDITIONS 940 TO 999.')
  assert.match(vols[0], /^VOL\. I\.  1931/)
  assert.equal(readingText(3, 0), readingText(3, 3))
  assert.equal(readingText(3, 0), readingText(3, 0))
  assert.match(readingText(30, 0), /^Halyard\. [A-Z][a-z-]+, [a-z]+\. Sea [a-z]+\. .+ High water \d\d:\d\d, low water 16:12\. That is the reading\.$/)
  const w = wirelessTranscript(3, 0)
  assert.equal(w[w.length - 1], 'Halyard: four, moderate, rain later, good')
})
