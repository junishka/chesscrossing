import { test } from 'node:test'
import assert from 'node:assert/strict'

// store.ts reads localStorage at import and uses window.setTimeout in save(): shim both before importing.
const memory = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}
;(globalThis as any).window = { setTimeout, clearTimeout }

const { store } = await import('../src/core/store')
const { bus } = await import('../src/core/bus')
const { ChapterEngine } = await import('../src/station/chapters')
const { chapterEntries } = await import('../src/content/chapters')
type Events = import('../src/types').Events

function fresh(crossable = () => false) {
  store.reset()
  const engine = new ChapterEngine({ season: store.ledger.season, crossable })
  return engine
}

function collect<K extends keyof Events>(event: K): { got: Events[K][]; off: () => void } {
  const got: Events[K][] = []
  const off = bus.on(event, (p) => { got.push(p) })
  return { got, off }
}

/** Runs check() `n` times and returns the chapter after each call. */
function checks(engine: InstanceType<typeof ChapterEngine>, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) { engine.check(); out.push(engine.current()) }
  return out
}

test('Chapter One unlocks at start with one chapter:unlock carrying the Recorder\'s page; the UI shows the card and cues the theme', () => {
  const engine = fresh()
  const titles = collect('ui:title'), music = collect('audio:music'), unlocks = collect('chapter:unlock')
  assert.equal(engine.started(), false)
  engine.check()
  assert.equal(engine.started(), true)
  assert.equal(engine.current(), 1)
  assert.equal(unlocks.got.length, 1)
  assert.equal(unlocks.got[0].chapter.number, 1)
  assert.equal(unlocks.got[0].chapter.id, 'one')
  assert.equal(unlocks.got[0].chapter.title, 'THE BOARD ROOM')
  assert.equal(unlocks.got[0].chapter.subtitle, 'The visitor came on Wednesday. The guest chair was given.')
  // ui/overlay.ts shows the chapter card on chapter:unlock and the card plays the Survey Theme once (§10):
  // a ui:title or audio:music from the engine would double both.
  assert.deepEqual(titles.got, [])
  assert.deepEqual(music.got, [])
  assert.deepEqual(store.ledger.chapters, ['one'])
  titles.off(); music.off(); unlocks.off(); engine.dispose()
})

test('check() unlocks at most one chapter per call and never skips', () => {
  const engine = fresh()
  store.ledger.season.date = 30
  // Every date fallback holds; the chapters still come one per call, in order.
  assert.deepEqual(checks(engine, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 9])
  assert.deepEqual(store.ledger.chapters, ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'])
  engine.dispose()
})

test('games finished open Two, Four, Seven and Eight but not the chapters between them', () => {
  const engine = fresh()
  engine.check()
  store.ledger.games.played = 7
  engine.check()
  assert.equal(engine.current(), 2)
  // Chapter Three needs the Lamp Room or 6 September; games alone leave it shut.
  assert.deepEqual(checks(engine, 3), [2, 2, 2])
  store.mark('visited', 'lamproom')
  engine.check()
  assert.equal(engine.current(), 3)
  engine.check()
  assert.equal(engine.current(), 4)
  // Chapter Five needs the Rook's warrant from Tuck, or 13 September.
  assert.deepEqual(checks(engine, 2), [4, 4])
  store.ledger.season.warrants.push('rook')
  engine.check()
  assert.equal(engine.current(), 5)
  // Chapter Six needs e4, or 16 September; GridWalk marks a square stood on as `islet:e4`.
  engine.check()
  assert.equal(engine.current(), 5)
  store.mark('visited', 'e4')
  engine.check()
  assert.equal(engine.current(), 5)
  store.mark('visited', 'islet:e4')
  engine.check()
  assert.equal(engine.current(), 6)
  engine.check()
  assert.equal(engine.current(), 7)
  engine.check()
  assert.equal(engine.current(), 8)
  // Chapter Nine is the thirtieth, however it arrives.
  assert.deepEqual(checks(engine, 2), [8, 8])
  store.ledger.season.date = 30
  engine.check()
  assert.equal(engine.current(), 9)
  engine.dispose()
})

test('date fallbacks open each chapter on its day and not before', () => {
  const engine = fresh()
  engine.check()
  const days = chapterEntries.slice(1).map((c) => {
    const d = c.triggers.find((t) => t.kind === 'date')
    return d && d.kind === 'date' ? d.day : 0
  })
  assert.deepEqual(days, [3, 6, 10, 13, 16, 20, 25, 30])
  days.forEach((day, i) => {
    store.ledger.season.date = day - 1
    engine.check()
    assert.equal(engine.current(), i + 1, `day ${day - 1} keeps chapter ${i + 1}`)
    store.ledger.season.date = day
    engine.check()
    assert.equal(engine.current(), i + 2, `day ${day} opens chapter ${i + 2}`)
  })
  engine.dispose()
})

const TEN_MOVES = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7'
const NINE_MOVES = TEN_MOVES.slice(0, TEN_MOVES.indexOf(' 10.'))

function saveGame(pgn: string): void {
  store.ledger.savedGame = {
    pgn,
    settings: { playerColor: 'w', opponent: { kind: 'engine', level: 2, name: 'the chair' }, minutes: 0, incrementSec: 0 },
    clocks: { w: 0, b: 0, running: null, incrementMs: 0 },
    startedAt: 0,
  }
}

test('a game saved mid-play is not adjourned until the board is left; ten moves are needed', () => {
  const engine = fresh()
  engine.check()
  const settings = { playerColor: 'w' as const, opponent: { kind: 'engine' as const, level: 2 as const, name: 'the chair' }, minutes: 0, incrementSec: 0 }
  bus.emit('game:new', { settings, fen: '' })
  bus.emit('game:move', { move: {} as any, status: {} as any, byPlayer: true })
  saveGame(TEN_MOVES)
  engine.check()
  assert.equal(engine.current(), 1, 'still at the board: not adjourned')
  bus.emit('world:enter', { frame: 'chartroom', via: 'dolly-left' })
  saveGame(NINE_MOVES)
  engine.check()
  assert.equal(engine.current(), 1, 'nine moves adjourned do not open Two')
  saveGame(TEN_MOVES)
  engine.check()
  assert.equal(engine.current(), 2, 'left the board with ten moves saved: adjourned')
  engine.dispose()
})

test('the residents spoken to open Quarters; an adjourned game of ten moves opens Chapter Two', () => {
  const engine = fresh()
  engine.check()
  // No game has begun this session: the saved game was adjourned (the log is the save file).
  saveGame(TEN_MOVES)
  engine.check()
  assert.equal(engine.current(), 2)
  store.mark('visited', 'lamproom')
  engine.check()
  assert.equal(engine.current(), 3)
  store.ledger.season.spokenTo = ['brace', 'ida', 'ferrier', 'lisle']
  engine.check()
  assert.equal(engine.current(), 3)
  store.ledger.season.spokenTo.push('tuck')
  engine.check()
  assert.equal(engine.current(), 4)
  engine.dispose()
})

test('unlock() grants what the page confers: VISITOR at Three, the warrants at Five and Seven, once', () => {
  const engine = fresh()
  const badges = collect('badge:grant'), warrants = collect('warrant:grant')
  store.ledger.season.date = 30
  checks(engine, 9)
  assert.deepEqual(badges.got, [{ badge: 'VISITOR' }])
  assert.deepEqual(warrants.got, [{ warrant: 'rook' }, { warrant: 'bishop' }])
  assert.deepEqual(store.ledger.season.warrants, ['king', 'rook', 'bishop'])
  assert.ok(store.ledger.season.badges.includes('VISITOR'))
  badges.off(); warrants.off(); engine.dispose()
})

test('the constructor reads marked chapters back into the season', () => {
  store.reset()
  store.ledger.chapters = ['one', 'two', 'three']
  const engine = new ChapterEngine({ season: store.ledger.season, crossable: () => false })
  assert.equal(engine.current(), 3)
  engine.dispose()
})

test('isFrameOpen follows the chapter lists, the locks, the first move and the squares reached', () => {
  const engine = fresh()
  engine.check()
  assert.equal(engine.isFrameOpen('boardroom'), true)
  assert.equal(engine.isFrameOpen('chartroom'), false)
  assert.equal(engine.isFrameOpen('galley'), false)
  bus.emit('game:move', { move: {} as any, status: {} as any, byPlayer: true })
  assert.equal(engine.isFrameOpen('chartroom'), true)
  assert.equal(engine.isFrameOpen('galley'), true)
  for (const id of ['landing', 'recorders', 'workshop', 'boathouse', 'lamproom', 'section', 'jetty', 'quarters', 'heron', 'eider', 'grid']) {
    assert.equal(engine.isFrameOpen(id), false, `${id} shut in Chapter One`)
  }
  store.ledger.season.date = 30
  engine.check()
  for (const id of ['landing', 'recorders', 'workshop', 'boathouse', 'lamproom', 'section']) {
    assert.equal(engine.isFrameOpen(id), true, `${id} open in Chapter Two`)
  }
  assert.equal(engine.isFrameOpen('jetty'), false)
  engine.check()
  for (const id of ['jetty', 'path', 'point', 'grid', 'cinder']) assert.equal(engine.isFrameOpen(id), true, `${id} open in Chapter Three`)
  assert.equal(engine.isFrameOpen('quarters'), false)
  assert.equal(engine.isFrameOpen('eider'), false)
  store.ledger.season.gridSquare = 'e4'
  assert.equal(engine.isFrameOpen('eider'), true, 'reaching e4 opens Eider Reach')
  store.ledger.season.gridSquare = null
  engine.check()
  assert.equal(engine.isFrameOpen('quarters'), true)
  checks(engine, 2)
  assert.equal(engine.current(), 6)
  assert.equal(engine.isFrameOpen('eider'), true)
  assert.equal(engine.isFrameOpen('heron'), false)
  checks(engine, 2)
  assert.equal(engine.isFrameOpen('heron'), true)
  engine.dispose()
})

test('the first move persists through the roll and the game count', () => {
  const engine = fresh()
  engine.check()
  assert.equal(engine.isFrameOpen('chartroom'), false)
  store.ledger.rows.push({ kind: 'move', text: '1. e4', ply: 1 })
  assert.equal(engine.isFrameOpen('chartroom'), true)
  engine.dispose()
})

test('requirementMet evaluates chapter, warrant, lowWater, watches and gamesFinished', () => {
  let low = false
  const engine = fresh(() => low)
  engine.check()
  assert.equal(engine.requirementMet(undefined), true)
  assert.equal(engine.requirementMet({}), true)
  assert.equal(engine.requirementMet({ chapter: 1 }), true)
  assert.equal(engine.requirementMet({ chapter: 2 }), false)
  assert.equal(engine.requirementMet({ warrant: 'king' }), true)
  assert.equal(engine.requirementMet({ warrant: 'rook' }), false)
  assert.equal(engine.requirementMet({ lowWater: true }), false)
  assert.equal(engine.requirementMet({ lowWater: false }), true)
  low = true
  assert.equal(engine.requirementMet({ lowWater: true }), true)
  assert.equal(engine.requirementMet({ lowWater: false }), false)
  store.ledger.season.watch = 3
  assert.equal(engine.requirementMet({ watches: [3, 4] }), true)
  assert.equal(engine.requirementMet({ watches: [0, 1] }), false)
  assert.equal(engine.requirementMet({ gamesFinished: 1 }), false)
  store.ledger.games.played = 1
  assert.equal(engine.requirementMet({ gamesFinished: 1 }), true)
  // All given conditions must hold together.
  assert.equal(engine.requirementMet({ chapter: 1, warrant: 'king', lowWater: true, watches: [3], gamesFinished: 1 }), true)
  assert.equal(engine.requirementMet({ chapter: 1, warrant: 'bishop', lowWater: true, watches: [3], gamesFinished: 1 }), false)
  engine.dispose()
})
