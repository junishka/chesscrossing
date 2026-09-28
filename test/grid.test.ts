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
const { GridWalk, FIXED_DRESSINGS, pinTravelMs, warrantFor } = await import('../src/station/grid')
const { squareHash, cairnTag } = await import('../src/content/survey')
type Events = import('../src/types').Events
type Square = import('../src/types').Square
type Warrant = import('../src/types').Warrant

interface Calls { islet: [Square, string][]; chart: [Square, Square][]; leave: number }

function fresh(o: { crossable?: boolean; warrants?: Warrant[]; chapter?: number; square?: Square | null } = {}) {
  store.reset()
  const season = store.ledger.season
  season.warrants = o.warrants ?? ['king']
  season.chapter = o.chapter ?? 3
  season.gridSquare = o.square ?? null
  const state = { crossable: o.crossable ?? true }
  const calls: Calls = { islet: [], chart: [], leave: 0 }
  const grid = new GridWalk({ season, crossable: () => state.crossable }, {
    onIslet: async (sq, frame) => { calls.islet.push([sq, frame]) },
    onChart: async (from, to) => { calls.chart.push([from, to]) },
    onLeave: async () => { calls.leave += 1 },
  })
  return { grid, season, state, calls }
}

function collect<K extends keyof Events>(event: K): { got: Events[K][]; off: () => void } {
  const got: Events[K][] = []
  const off = bus.on(event, (p) => { got.push(p) })
  return { got, off }
}

test('the king walks one islet in any direction, and nowhere when ashore', () => {
  const { grid } = fresh({ square: 'd4' })
  assert.deepEqual(grid.legalIslets().sort(), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5'])
  const ashore = fresh()
  assert.deepEqual(ashore.grid.legalIslets(), [])
  grid.dispose(); ashore.grid.dispose()
})

test('the rook goes straight along a channel any distance; the bishop along the diagonals; the union is taken', () => {
  const rook = fresh({ square: 'd4', warrants: ['rook'] })
  const rookIslets = rook.grid.legalIslets()
  assert.equal(rookIslets.length, 13) // seven on the d-file, seven on the fourth rank, less h4: the h-file is closed in Chapter Three
  assert.ok(rookIslets.includes('d8') && rookIslets.includes('a4') && rookIslets.includes('g4'))
  assert.ok(!rookIslets.includes('e5') && !rookIslets.includes('h4'))

  const bishop = fresh({ square: 'd4', warrants: ['bishop'] })
  const bishopIslets = bishop.grid.legalIslets()
  assert.deepEqual(bishopIslets.sort(), ['a1', 'a7', 'b2', 'b6', 'c3', 'c5', 'e3', 'e5', 'f2', 'f6', 'g1', 'g7'])

  const all = fresh({ square: 'd4', warrants: ['king', 'rook', 'bishop'] })
  const union = new Set([...rookIslets, ...bishopIslets, ...fresh({ square: 'd4' }).grid.legalIslets()])
  assert.deepEqual(all.grid.legalIslets().sort(), [...union].sort())
  rook.grid.dispose(); bishop.grid.dispose(); all.grid.dispose()
})

test('the h-file is closed before Chapter Eight and open from it; h8 is reached along the file, the rank or the long diagonal', () => {
  const before = fresh({ square: 'g7', warrants: ['king', 'rook', 'bishop'], chapter: 7 })
  assert.ok(before.grid.legalIslets().every((sq) => sq[0] !== 'h'))
  assert.equal(before.grid.plateText('h8'), 'h8 · HERON HEAD · NOT SURVEYED')
  assert.equal(before.grid.plateText('c4'), 'c4 · CINDER REACH · SURVEYED 1931 · A.H.')

  const after = fresh({ square: 'g7', warrants: ['king', 'rook', 'bishop'], chapter: 8 })
  assert.ok(after.grid.legalIslets().includes('h8'))
  assert.ok(after.grid.legalIslets().includes('h7'))
  assert.equal(after.grid.plateText('h8'), 'h8 · HERON HEAD · SURVEYED 1965 · A.H.')
  assert.equal(warrantFor('a1', 'h8', ['bishop']), 'bishop')
  assert.equal(warrantFor('h1', 'h8', ['rook']), 'rook')
  assert.equal(warrantFor('a8', 'h8', ['rook']), 'rook')
  assert.equal(warrantFor('g6', 'h8', ['king', 'rook', 'bishop']), null) // no knight's warrant
  before.grid.dispose(); after.grid.dispose()
})

test('moveTo travels the pin on the chart, cuts to the islet, marks the visit and emits grid:move', async () => {
  const { grid, season, calls } = fresh({ square: 'd4', warrants: ['king', 'rook'] })
  const moves = collect('grid:move')
  await grid.moveTo('d7')
  assert.deepEqual(calls.chart, [['d4', 'd7']])
  assert.deepEqual(calls.islet, [['d7', 'grid']])
  assert.equal(season.gridSquare, 'd7')
  assert.equal(grid.square, 'd7')
  assert.ok(store.has('visited', 'islet:d7'))
  assert.deepEqual(moves.got, [{ from: 'd4', to: 'd7', warrant: 'rook' }])
  assert.equal(pinTravelMs('d4', 'd7'), 1500)

  await grid.moveTo('e7')
  assert.deepEqual(moves.got[1], { from: 'd7', to: 'e7', warrant: 'king' })
  moves.off(); grid.dispose()
})

test('e4, c6 and h8 are their own frames; the rest is the stage', async () => {
  const { grid, calls } = fresh({ square: 'e5', warrants: ['king', 'rook', 'bishop'], chapter: 8 })
  await grid.moveTo('e4') // one islet down, on foot
  await grid.moveTo('c6') // the punt, along the diagonal
  await grid.moveTo('c8') // the dinghy, up the c-file
  await grid.moveTo('h8') // the dinghy, along the eighth rank
  assert.deepEqual(calls.islet.map((c) => c[1]), ['eider', 'cinder', 'grid', 'heron'])
  assert.equal(grid.frameOf('d4'), 'grid')
  grid.dispose()
})

test('moveTo rejects an islet outside the warrants, and any islet when the water is over the grid', async () => {
  const { grid, state, calls } = fresh({ square: 'd4' })
  await assert.rejects(grid.moveTo('d6'), /not reachable/)
  state.crossable = false
  await assert.rejects(grid.moveTo('d5'), /water/)
  assert.deepEqual(calls.chart, [])
  assert.equal(grid.square, 'd4')
  grid.dispose()
})

test('enter() lands on a1 from the causeway at low water only; leave() goes back from a1 only', async () => {
  const { grid, state, calls, season } = fresh()
  const moves = collect('grid:move')
  state.crossable = false
  await assert.rejects(grid.enter(), /causeway/)
  state.crossable = true
  await grid.enter()
  assert.equal(season.gridSquare, 'a1')
  assert.deepEqual(calls.islet, [['a1', 'grid']])
  assert.deepEqual(moves.got, [{ from: null, to: 'a1', warrant: 'king' }])
  await assert.rejects(grid.enter(), /already/)
  await grid.moveTo('b2')
  await assert.rejects(grid.leave(), /a1 only/)
  await grid.moveTo('a1')
  await grid.leave()
  assert.equal(season.gridSquare, null)
  assert.equal(calls.leave, 1)
  moves.off(); grid.dispose()
})

test('dressing is deterministic: hash mod 4 and mod 6, with a1, c6, e4 and h8 fixed', () => {
  const { grid } = fresh()
  for (const sq of ['b3', 'f7', 'g2', 'd5'] as Square[]) {
    const h = squareHash(sq)
    assert.deepEqual(grid.dressing(sq), { flaw: h % 4, object: h % 6 })
    assert.deepEqual(grid.dressing(sq), grid.dressing(sq))
  }
  assert.deepEqual(grid.dressing('a1'), FIXED_DRESSINGS.a1)
  assert.deepEqual(grid.dressing('c6'), { flaw: 3, object: 0 })
  assert.deepEqual(grid.dressing('e4'), { flaw: 1, object: 2 })
  assert.deepEqual(grid.dressing('h8'), FIXED_DRESSINGS.h8)
  for (const d of Object.values(FIXED_DRESSINGS)) { assert.ok(d.flaw >= 0 && d.flaw < 4); assert.ok(d.object >= 0 && d.object < 6) }
  grid.dispose()
})

test('reading a plate types the ledger line, adds to platesRead once, and sews SURVEYOR at sixteen', async () => {
  const { grid, season } = fresh({ square: 'c4', warrants: ['king', 'rook', 'bishop'] })
  const lines = collect('ledger:line'), badges = collect('badge:grant')
  assert.equal(grid.readPlate(), true)
  assert.deepEqual(lines.got, [{ text: 'Cairn c4 (Cinder Reach) read.' }])
  assert.deepEqual(season.platesRead, ['c4'])
  grid.readPlate()
  assert.deepEqual(season.platesRead, ['c4'])
  assert.equal(lines.got.length, 2)

  // Walk the c-file and the fourth rank as a rook, reading each plate, to sixteen.
  const route: Square[] = ['c1', 'c2', 'c3', 'c5', 'c6', 'c7', 'c8', 'a8', 'b8', 'd8', 'e8', 'f8', 'g8', 'g4', 'a4']
  for (const sq of route) {
    await grid.moveTo(sq)
    grid.readPlate()
    if (season.platesRead.length < 16) assert.deepEqual(badges.got, [])
  }
  assert.equal(season.platesRead.length, 16)
  assert.deepEqual(badges.got, [{ badge: 'SURVEYOR' }])
  assert.ok(season.badges.includes('SURVEYOR'))
  grid.readPlate()
  assert.equal(badges.got.length, 1)

  const ashore = fresh()
  assert.equal(ashore.grid.readPlate(), false)
  lines.off(); badges.off(); grid.dispose(); ashore.grid.dispose()
})

test('cairn tags come from the season and read RETURNED  EXPEDITION n  MOVE m', () => {
  const { grid, season } = fresh()
  season.cairnTags = [
    { square: 'e4', expedition: 3, move: 17, piece: 'n', color: 'b' },
    { square: 'd5', expedition: 1, move: 9, piece: 'p', color: 'w' },
    { square: 'e4', expedition: 4, move: 22, piece: 'b', color: 'w' },
  ]
  assert.equal(grid.cairnTags('e4').length, 2)
  assert.deepEqual(grid.cairnTagLines('e4'), ['RETURNED  EXPEDITION 3  MOVE 17', cairnTag(4, 22)])
  assert.deepEqual(grid.cairnTags('a1'), [])
  grid.dispose()
})

test('the tide came in: the ledger line, the dinghy, the square cleared; nothing when ashore', async () => {
  const { grid, season, calls } = fresh({ square: 'f5' })
  const lines = collect('ledger:line')
  await grid.tideCameIn()
  assert.deepEqual(lines.got, [{ text: 'The tide came in. Mr Tuck came for you in the dinghy. It is entered in the log.' }])
  assert.equal(season.gridSquare, null)
  assert.equal(calls.leave, 1)
  await grid.tideCameIn()
  assert.equal(lines.got.length, 1)
  assert.equal(calls.leave, 1)
  lines.off(); grid.dispose()
})

test('the window closing on the bus brings the dinghy for a visitor still on the grid', async () => {
  const { grid, season, calls } = fresh({ square: 'b2' })
  bus.emit('tide:window', { crossable: true, secondsToChange: 240 })
  assert.equal(season.gridSquare, 'b2')
  bus.emit('tide:window', { crossable: false, secondsToChange: 1310 })
  await Promise.resolve()
  assert.equal(season.gridSquare, null)
  assert.equal(calls.leave, 1)
  grid.dispose()
  season.gridSquare = 'b2'
  bus.emit('tide:window', { crossable: false, secondsToChange: 1310 })
  assert.equal(season.gridSquare, 'b2') // disposed: no longer listening
})

test('warrants: Tuck after two games, Voss from the twentieth, each granted once with warrant:grant', () => {
  const { grid, season } = fresh()
  const grants = collect('warrant:grant')
  assert.equal(grid.tuckGrantsRook(1), false)
  assert.equal(grid.tuckGrantsRook(2), true)
  assert.equal(grid.tuckGrantsRook(3), false)
  assert.equal(grid.vossGrantsBishop(19), false)
  assert.equal(grid.vossGrantsBishop(20), true)
  assert.equal(grid.vossGrantsBishop(25), false)
  assert.equal(grid.grantWarrant('king'), false)
  assert.deepEqual(season.warrants, ['king', 'rook', 'bishop'])
  assert.deepEqual(grid.warrants(), ['king', 'rook', 'bishop'])
  assert.deepEqual(grants.got, [{ warrant: 'rook' }, { warrant: 'bishop' }])
  grants.off(); grid.dispose()
})
