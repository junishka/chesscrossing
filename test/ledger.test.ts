// The ledger roll under node: rows are typed from real MoveRecords, the bus is listened to, nothing is rendered.
// store.ts reaches for window.setTimeout in save() and localStorage on load, so both are shimmed before it is imported.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const memory = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = { setTimeout, clearTimeout }
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}

const { bus } = await import('../src/core/bus')
const { store } = await import('../src/core/store')
const { LEDGER_LEADER, earlierVolumeHeaders, crateLine } = await import('../src/content/station')
const { isletName, cairnReadLine } = await import('../src/content/survey')
const { Position } = await import('../src/chess/rules')
const { LEADER_INK_EXPEDITION, LedgerRoll, REMARK_COLUMN, REMARK_MAX_CHARS, leaderRows } = await import('../src/station/ledger')
type Events = import('../src/types').Events
type LedgerRow = import('../src/types').LedgerRow
type MoveRecord = import('../src/types').MoveRecord
type Square = import('../src/types').Square

/** Plays a line of moves on a fresh position and returns the records. */
function play(moves: [Square, Square][]): MoveRecord[] {
  const pos = new Position()
  return moves.map(([from, to]) => {
    const rec = pos.move({ from, to })
    assert.ok(rec, `${from}-${to} is legal`)
    return rec
  })
}

/** Sicilian to the first capture and a check: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Bb5+ */
const LINE: [Square, Square][] = [['e2', 'e4'], ['c7', 'c5'], ['g1', 'f3'], ['d7', 'd6'], ['d2', 'd4'], ['c5', 'd4'], ['f3', 'd4'], ['g8', 'f6'], ['f1', 'b5']]

function fresh(): { roll: InstanceType<typeof LedgerRoll>; changes: LedgerRow[][] } {
  store.reset()
  const changes: LedgerRow[][] = []
  const roll = new LedgerRoll({ onChange: (rows) => { changes.push(rows) } })
  return { roll, changes }
}

function collect<K extends keyof Events>(event: K): { got: Events[K][]; off: () => void } {
  const got: Events[K][] = []
  const off = bus.on(event, (p) => { got.push(p) })
  return { got, off }
}

test('the leader is fixed at the top: the earlier volumes, then the three lines, the 1959 line in ink', () => {
  const { roll } = fresh()
  const volumes = earlierVolumeHeaders()
  assert.equal(roll.rows, store.ledger.rows, 'the live array is the persisted one')
  assert.deepEqual(roll.rows.slice(0, volumes.length).map((r) => r.text), volumes)
  assert.ok(roll.rows.slice(0, volumes.length).every((r) => r.kind === 'volume'))
  assert.equal(volumes[volumes.length - 1], 'VOL. XII.  1964.  EXPEDITIONS 940 TO 999.')
  assert.ok(volumes[0].startsWith('VOL. I.  1931'))
  const leader = roll.rows.slice(volumes.length, volumes.length + 3)
  assert.deepEqual(leader.map((r) => r.text), [...LEDGER_LEADER])
  assert.equal(leader[0].text, 'VOL. XIII ENDS.')
  assert.equal(leader[2].text, 'VOL. XIV.  SEPTEMBER 1965.  I. HARDY, RECORDER.')
  assert.ok(leader.every((r) => r.kind === 'leader'))
  assert.equal(leader[1].expedition, LEADER_INK_EXPEDITION, 'the 1959 line is marked for Jost')
  assert.equal(leader[0].expedition, undefined)
  assert.equal(roll.rows.length, volumes.length + 3, 'nothing else on a fresh roll')
  assert.deepEqual(leaderRows(), leaderRows(), 'the seeded table is deterministic')
})

test('the leader survives a stale or missing head in the persisted rows', () => {
  store.reset()
  store.ledger.rows = [
    { kind: 'leader', text: 'an old leader' },
    { kind: 'header', text: 'EXPEDITION 1     NO WATCH     SEA STATE 4     1 SEPT 1965', expedition: 1 },
    { kind: 'volume', text: 'a volume in the wrong place' },
  ]
  const roll = new LedgerRoll()
  const head = leaderRows()
  assert.deepEqual(roll.rows.slice(0, head.length), head)
  assert.equal(roll.rows.length, head.length + 1)
  assert.equal(roll.rows[head.length].kind, 'header')
  assert.equal(roll.rows, store.ledger.rows)
  const again = new LedgerRoll()
  assert.equal(again.rows, roll.rows, 'an intact head is kept as it is')
})

test('header, moves, remark and result are typed in order with the islets and rule remarks', () => {
  const { roll, changes } = fresh()
  const base = roll.rows.length
  roll.startExpedition(3, 'long', 4, 14)
  assert.equal(roll.rows[base].kind, 'header')
  assert.equal(roll.rows[base].text, 'EXPEDITION 3     LONG WATCH     SEA STATE 4     14 SEPT 1965')
  assert.equal(roll.currentExpedition(), 3)

  const recs = play(LINE)
  recs.forEach((m, i) => { roll.move(m, i === 7 ? { thinkMs: 1900 } : {}) })
  roll.remark(6, 'The bishop was loose since 3.')
  roll.result('1-0 by resignation.')

  const rows = roll.rowsOf(3)
  assert.deepEqual(rows.map((r) => r.kind), ['header', ...Array<string>(6).fill('move'), 'remark', 'move', 'move', 'move', 'result'])
  assert.deepEqual(rows.filter((r) => r.kind === 'move').map((r) => r.islet), recs.map((m) => isletName(m.to)))
  assert.equal(rows[1].text, ' 1.    e4                    Eider Reach')
  assert.equal(rows[2].text, ' 1...            c5          Cinder Sound')
  assert.equal(rows[6].text, ` 3...            cxd4        ${isletName('d4').padEnd(17)}first return`)
  assert.equal(rows[6].remark, 'first return')
  assert.equal(rows[7].kind, 'remark')
  assert.equal(rows[7].ply, 6)
  assert.equal(rows[7].remark, 'the bishop was loose since 3')
  assert.equal(rows[7].text, ' '.repeat(REMARK_COLUMN) + 'the bishop was loose since 3')
  assert.equal(rows[8].san, 'Nxd4')
  assert.equal(rows[8].remark, undefined, 'a second capture is not a first return')
  assert.equal(rows[9].remark, 'the chair thought for 1.9 s', 'the chair (Black) thought')
  assert.equal(rows[9].text, `${' 4...'.padEnd(7)}${''.padEnd(10)}${'Nf6'.padEnd(12)}${isletName('f6').padEnd(17)}the chair thought for 1.9 s`)
  assert.equal(rows[10].remark, 'flag U hoisted')
  assert.equal(rows[10].text, ` 5.    Bb5+                  ${isletName('b5').padEnd(17)}flag U hoisted`)
  assert.equal(rows[11].kind, 'result')
  assert.equal(rows[11].remark, '1-0 by resignation.')
  assert.equal(roll.currentExpedition(), null)
  const moves = rows.filter((r) => r.kind === 'move')
  assert.deepEqual(moves.map((r) => r.ply), recs.map((m) => m.ply))
  assert.deepEqual(moves.map((r) => r.fen), recs.map((m) => m.fenAfter))
  assert.ok(moves.every((r) => r.expedition === 3))
  assert.equal(changes.length, rows.length, 'onChange once per row typed')
})

test('the first return is remarked once, the visitor thinks in silence, checkGiven and returnsSoFar are honoured', () => {
  const { roll } = fresh()
  roll.startExpedition(1, 'none', 4, '1 SEPT 1965')
  assert.equal(roll.rowsOf(1)[0].text, 'EXPEDITION 1     NO WATCH     SEA STATE 4     1 SEPT 1965')
  const recs = play(LINE)
  recs.forEach((m) => { roll.move(m, { thinkMs: 2500 }) })
  const remarks = roll.rowsOf(1).filter((r) => r.kind === 'move').map((r) => r.remark)
  assert.equal(remarks.filter((r) => r?.includes('first return')).length, 1)
  assert.equal(remarks[5], 'first return, the chair thought for 2.5 s', 'the chair made the first return and thought about it')
  assert.equal(remarks[6], undefined, 'the visitor made the second return')
  assert.equal(remarks[0], undefined, 'the visitor is never said to have thought')
  assert.equal(remarks[1], 'the chair thought for 2.5 s')
  roll.result('1/2-1/2 by agreement.')

  const { roll: other } = fresh()
  other.startExpedition(2, 'dog', 5, 2, { visitor: 'b' })
  const two = play(LINE)
  other.move(two[0], { thinkMs: 1000 })
  other.move(two[1], { thinkMs: 1000 })
  other.move(two[5], { returnsSoFar: 1, checkGiven: true })
  const rows = other.rowsOf(2).filter((r) => r.kind === 'move')
  assert.equal(rows[0].remark, 'the chair thought for 1.0 s', 'on the dark side the chair plays White')
  assert.equal(rows[0].text, ` 1.              e4          ${isletName('e4').padEnd(17)}the chair thought for 1.0 s`)
  assert.equal(rows[1].remark, undefined)
  assert.equal(rows[1].text, ' 1...  c5                    Cinder Sound')
  assert.equal(rows[2].remark, 'flag U hoisted', 'a return already made is not the first; the check is flagged')
})

test('remarks are lower case, without a full stop, at most 140 characters, and sit under their ply', () => {
  const { roll } = fresh()
  roll.startExpedition(1, 'middle', 3, 5)
  const recs = play(LINE.slice(0, 4))
  recs.forEach((m) => { roll.move(m) })
  roll.remark(2, 'Nothing yet.')
  roll.remark(2, '  A second   thought...  ')
  roll.remark(4, 'x'.repeat(200))
  roll.remark(99, 'A ply the roll does not have')
  roll.remark(1, '')
  const rows = roll.rowsOf(1)
  assert.deepEqual(rows.map((r) => `${r.kind}${r.ply !== undefined ? ':' + r.ply : ''}`), [
    'header', 'move:1', 'remark:1', 'move:2', 'remark:2', 'remark:2', 'move:3', 'move:4', 'remark:4', 'remark:99',
  ])
  assert.equal(rows[4].remark, 'nothing yet')
  assert.equal(rows[5].remark, 'a second thought')
  assert.equal(rows[8].remark!.length, REMARK_MAX_CHARS)
  assert.equal(rows[2].remark, '-', 'a single dash if nothing is worth saying')
  assert.ok(rows.filter((r) => r.kind === 'remark').every((r) => !r.remark!.endsWith('.') && r.expedition === 1))
})

test('lines and crates are typed and toasted through ledger:line; the bus is heard without echo', () => {
  const { roll } = fresh()
  const lines = collect('ledger:line')
  const off = roll.listen()
  roll.startExpedition(1, 'none', 4, 3)
  roll.line(cairnReadLine('c4'))
  roll.result('0-1 by resignation.')
  roll.crate(crateLine(6, 'The galley dresser, left', 21))
  bus.emit('ledger:line', { text: 'winch turned. nothing on the cable.' })
  bus.emit('ledger:line', { text: crateLine(7, 'The chart table', 22) })
  bus.emit('ledger:remark', { ply: 1, text: 'Late.' })
  off()
  bus.emit('ledger:line', { text: 'after the hand was lifted' })
  lines.off()

  const tail = roll.rows.slice(leaderRows().length)
  assert.deepEqual(tail.map((r) => [r.kind, r.text, r.expedition]), [
    ['header', 'EXPEDITION 1     NO WATCH     SEA STATE 4     3 SEPT 1965', 1],
    ['line', 'Cairn c4 (Cinder Reach) read.', 1],
    ['result', ' '.repeat(REMARK_COLUMN) + '0-1 by resignation.', 1],
    ['crate', 'CRATE 6.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.', undefined],
    ['line', 'winch turned. nothing on the cable.', undefined],
    ['crate', 'CRATE 7.  THE CHART TABLE.  CRATED 22 SEPT 1965.  B.L.', undefined],
    ['remark', ' '.repeat(REMARK_COLUMN) + 'late', undefined],
  ])
  assert.deepEqual(lines.got.map((l) => l.text), [
    'Cairn c4 (Cinder Reach) read.',
    'CRATE 6.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.',
    'winch turned. nothing on the cable.',
    'CRATE 7.  THE CHART TABLE.  CRATED 22 SEPT 1965.  B.L.',
    'after the hand was lifted',
  ], 'line() and crate() emit once each; the bus is not re-emitted')
})

test('the PGN is rebuilt from the rows and loads back to the same position', () => {
  const { roll } = fresh()
  roll.startExpedition(1, 'long', 4, 14)
  const first = play(LINE)
  first.forEach((m) => { roll.move(m) })
  roll.remark(3, 'Book.')
  roll.line('Hold.')
  roll.result('1-0 by resignation.')
  roll.startExpedition(2, 'long', 4, 15)
  const second = play([['d2', 'd4'], ['d7', 'd5'], ['c2', 'c4']])
  second.forEach((m) => { roll.move(m) })

  assert.equal(roll.pgnOfExpedition(1), '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Bb5+ 1-0')
  assert.equal(roll.pgnOfExpedition(2), '1. d4 d5 2. c4', 'an unfinished expedition has no result token')
  assert.equal(roll.pgnOfExpedition(9), '')
  const pos = new Position()
  assert.ok(pos.loadPgn(roll.pgnOfExpedition(1)))
  assert.equal(pos.fen(), first[first.length - 1].fenAfter)
  assert.deepEqual(pos.history().map((m) => m.san), first.map((m) => m.san))
  const again = new Position()
  assert.ok(again.loadPgn(roll.pgnOfExpedition(2)))
  assert.equal(again.fen(), second[second.length - 1].fenAfter)
})

test('a roll put away mid-expedition resumes under the same header', () => {
  const { roll } = fresh()
  roll.startExpedition(4, 'dog', 2, 9)
  const recs = play(LINE)
  recs.slice(0, 6).forEach((m) => { roll.move(m) })
  const resumed = new LedgerRoll()
  assert.equal(resumed.currentExpedition(), 4)
  resumed.move(recs[6], { thinkMs: 800 })
  resumed.move(recs[7], { thinkMs: 800 })
  const moves = resumed.rowsOf(4).filter((r) => r.kind === 'move')
  assert.equal(moves.length, 8)
  assert.equal(moves[6].remark, undefined, 'the first return is remembered; the visitor is not said to have thought')
  assert.equal(moves[7].remark, 'the chair thought for 0.8 s')
  resumed.result('1/2-1/2 slack water.')
  assert.equal(new LedgerRoll().currentExpedition(), null)
})
