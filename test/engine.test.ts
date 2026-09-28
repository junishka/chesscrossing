import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { perft, search, legalMoves, evaluateFen } from '../src/chess/engineCore'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'
const POS5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'

const perftCases: [string, string, number[]][] = [
  ['start position', START, [20, 400, 8902, 197281]],
  ['kiwipete', KIWIPETE, [48, 2039, 97862]],
  ['position 3', POS3, [14, 191, 2812, 43238]],
  ['position 4', POS4, [6, 264, 9467]],
  ['position 5', POS5, [44, 1486, 62379]],
]

for (const [name, fen, expected] of perftCases) {
  test(`perft ${name}`, () => {
    expected.forEach((n, i) => assert.equal(perft(fen, i + 1), n, `depth ${i + 1}`))
  })
}

test('perft is repeatable (make/unmake restores the position)', () => {
  assert.equal(perft(KIWIPETE, 2), 2039)
  assert.equal(perft(KIWIPETE, 2), 2039)
})

test('finds mate in 1 (Ra8#)', () => {
  const r = search('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { timeMs: 1000 })
  assert.deepEqual(r.move, { from: 'a1', to: 'a8' })
  assert.equal(r.mateIn, 1)
  assert.ok(r.scoreCp > 20000)
})

test('finds mate in 1 for Black, signed from White', () => {
  const r = search('r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', { timeMs: 1000 })
  assert.deepEqual(r.move, { from: 'a8', to: 'a1' })
  assert.equal(r.mateIn, -1)
  assert.ok(r.scoreCp < -20000)
})

test('finds mate in 2 (ladder mate with two rooks)', () => {
  // 1.Ra7 Kg8 2.Rb8# (or the mirror). No mate in 1 exists.
  const r = search('7k/8/8/8/8/8/8/RR4K1 w - - 0 1', { timeMs: 2000 })
  assert.equal(r.mateIn, 2, `expected mate in 2, got ${JSON.stringify(r)}`)
  assert.ok(r.move && (r.move.to === 'a7' || r.move.to === 'b7'), `first move ${JSON.stringify(r.move)}`)
  assert.ok(r.pv.length >= 3)
})

test('does not hang the queen', () => {
  // White queen on d4 is attacked by the knight on c6; the engine must move or defend it sensibly.
  const r = search('r1bqkb1r/pppp1ppp/2n2n2/4p3/3QP3/8/PPP2PPP/RNB1KBNR w KQkq - 0 4', { timeMs: 600 })
  assert.ok(r.move, 'a move is returned')
  const to = r.move!.to
  assert.notEqual(to, 'e5', 'Qxe5 loses the queen to Nxe5')
  assert.ok(r.scoreCp > -300, `white should not be losing heavily: ${r.scoreCp}`)
})

test('respects timeMs within 150ms', () => {
  const t0 = performance.now()
  const r = search(KIWIPETE, { timeMs: 400, level: 5 })
  const elapsed = performance.now() - t0
  assert.ok(elapsed < 550, `took ${elapsed}ms`)
  assert.ok(r.move)
  assert.ok(r.depth >= 3)
})

test('levels 3 and 4 use their own time budgets', () => {
  const t0 = performance.now()
  search(KIWIPETE, { timeMs: 5000, level: 3 })
  assert.ok(performance.now() - t0 < 550)
})

test('level 1 returns a legal move, reproducibly per seed', () => {
  const legal = legalMoves(KIWIPETE)
  const a = search(KIWIPETE, { timeMs: 200, level: 1, seed: 7 })
  const b = search(KIWIPETE, { timeMs: 200, level: 1, seed: 7 })
  assert.ok(a.move)
  assert.ok(legal.some((m) => m.from === a.move!.from && m.to === a.move!.to && m.promotion === a.move!.promotion))
  assert.deepEqual(a.move, b.move)
  assert.equal(a.depth, 1)
})

test('level 2 returns a legal move', () => {
  const legal = legalMoves(POS4)
  const r = search(POS4, { timeMs: 200, level: 2, seed: 3 })
  assert.ok(r.move)
  assert.ok(legal.some((m) => m.from === r.move!.from && m.to === r.move!.to && m.promotion === r.move!.promotion))
})

test('returns null move in checkmated and stalemated positions', () => {
  const mated = search('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', { timeMs: 100, maxDepth: 3 })
  assert.equal(mated.move, null)
  assert.equal(mated.mateIn, 0)
  assert.ok(mated.scoreCp > 20000)
  const stalemate = search('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', { timeMs: 100 })
  assert.equal(stalemate.move, null)
  assert.equal(stalemate.scoreCp, 0)
})

test('promotion moves carry the promotion piece', () => {
  const r = search('8/1P4k1/8/8/8/8/8/K7 w - - 0 1', { timeMs: 200, maxDepth: 4 })
  assert.deepEqual(r.move, { from: 'b7', to: 'b8', promotion: 'q' })
  assert.equal(r.pv[0], 'b7b8q')
})

test('evaluation is symmetric and material-aware', () => {
  assert.equal(evaluateFen(START), 0)
  assert.ok(evaluateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1') < -300)
})

test('node rate is at least 300k nodes/s', () => {
  search(KIWIPETE, { timeMs: 1000, level: 5 }) // warm up the JIT
  const r = search(KIWIPETE, { timeMs: 1500, level: 5 })
  const rate = r.nodes / (r.timeMs / 1000)
  assert.ok(rate >= 300_000, `rate ${Math.round(rate)} nodes/s at depth ${r.depth}`)
})

// ───────────────────────────── Multi-PV and window (BIBLE.md 5.3) ─────────────────────────────

const sameMove = (a: { from: string; to: string; promotion?: string }, b: { from: string; to: string; promotion?: string }): boolean =>
  a.from === b.from && a.to === b.to && a.promotion === b.promotion

test('multiPv 3 on the start position returns two distinct alternative lines with legal first moves', () => {
  // Depth is pinned so the main search and both re-searches complete the same depth: scores from different
  // depths sit on either side of an odd/even swing and cannot be ordered, so a timed search would be flaky here.
  const legal = legalMoves(START)
  const r = search(START, { timeMs: 3000, level: 5, multiPv: 3, maxDepth: 5 })
  assert.ok(r.move)
  assert.equal(r.depth, 5)
  assert.ok(r.lines, 'lines are present')
  assert.equal(r.lines!.length, 2)
  const [a, b] = r.lines!
  assert.ok(!sameMove(a.move, r.move!), 'first line differs from the main move')
  assert.ok(!sameMove(b.move, r.move!), 'second line differs from the main move')
  assert.ok(!sameMove(a.move, b.move), 'the two lines differ from each other')
  for (const line of r.lines!) {
    assert.ok(legal.some((m) => sameMove(m, line.move)), `legal first move ${JSON.stringify(line.move)}`)
    assert.ok(line.pv.length >= 1)
    assert.equal(line.pv[0], line.move.from + line.move.to + (line.move.promotion ?? ''))
    assert.equal(typeof line.scoreCp, 'number')
  }
  assert.ok(a.scoreCp >= b.scoreCp, `lines are best first: ${a.scoreCp} then ${b.scoreCp}`)
  assert.ok(r.scoreCp >= a.scoreCp, `the main move is at least as good as the first line: ${r.scoreCp} vs ${a.scoreCp}`)
})

test('multiPv alternatives do not claim the only mate', () => {
  // Ra8# is the only mate in 1; the alternative must be a different move and must not claim one.
  const r = search('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { timeMs: 600, multiPv: 2 })
  assert.equal(r.mateIn, 1)
  assert.equal(r.lines!.length, 1)
  assert.ok(!sameMove(r.lines![0].move, { from: 'a1', to: 'a8' }))
  assert.notEqual(r.lines![0].mateIn, 1)
  assert.ok(r.lines![0].scoreCp < 20000, `the alternative is not a mate: ${r.lines![0].scoreCp}`)
})

test('multiPv lines carry mate scores in White\'s view', () => {
  // Black has two mates in 1, Ra1# and Rb1#; the main move takes one and the line the other, both signed from White.
  const r = search('rr4k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', { timeMs: 600, multiPv: 2 })
  assert.equal(r.mateIn, -1)
  assert.ok(r.scoreCp < -20000)
  assert.equal(r.lines!.length, 1)
  const line = r.lines![0]
  const mates = ['a8a1', 'b8b1']
  assert.ok(mates.includes(r.pv[0]), `main ${r.pv[0]}`)
  assert.ok(mates.includes(line.pv[0]) && line.pv[0] !== r.pv[0], `line ${line.pv[0]}`)
  assert.equal(line.mateIn, -1)
  assert.ok(line.scoreCp < -20000, `line score from White's side: ${line.scoreCp}`)
})

test('multiPv asks for more lines than there are moves and returns what exists', () => {
  // Black has a king in the corner and one pawn: four legal moves, so at most three lines.
  const fen = 'k7/1p6/8/8/8/8/8/1R2K3 b - - 0 1'
  const legal = legalMoves(fen)
  assert.equal(legal.length, 4)
  const r = search(fen, { timeMs: 300, multiPv: 8 })
  assert.ok(r.move)
  assert.equal(r.lines!.length, legal.length - 1)
  const seen = new Set(r.lines!.map((l) => l.move.from + l.move.to))
  assert.equal(seen.size, legal.length - 1, 'every line is a different move')
  assert.ok(!seen.has(r.move!.from + r.move!.to))
})

test('multiPv 1 leaves lines absent', () => {
  const r = search(KIWIPETE, { timeMs: 200, level: 5 })
  assert.equal(r.lines, undefined)
})

test('time budget with multiPv 3 stays within timeMs + 150ms', () => {
  search(KIWIPETE, { timeMs: 300, level: 5 }) // warm up the JIT
  const t0 = performance.now()
  const r = search(KIWIPETE, { timeMs: 800, level: 5, multiPv: 3 })
  const elapsed = performance.now() - t0
  assert.ok(elapsed < 950, `took ${elapsed}ms`)
  assert.equal(r.lines!.length, 2)
  assert.ok(r.depth >= 3)
})

/** Score of the position after `move` for the side that just moved, from a depth-3 search. */
function scoreAfter(fen: string, move: { from: string; to: string; promotion?: string }): number {
  const chess = new Chess(fen)
  chess.move({ from: move.from, to: move.to, promotion: move.promotion })
  const r = search(chess.fen(), { timeMs: 2000, maxDepth: 3, level: 5 })
  return fen.split(' ')[1] === 'w' ? r.scoreCp : -r.scoreCp
}

// The black queen on g5 stands en prise to the bishop on c1; nothing else comes close.
const FREE_QUEEN = 'rnb1kbnr/pppp1ppp/8/4p1q1/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3'

test('window 150 at level 1 returns only moves within 150 cp of the best', () => {
  const legal = legalMoves(FREE_QUEEN)
  const byMove = new Map(legal.map((m) => [m.from + m.to + (m.promotion ?? ''), scoreAfter(FREE_QUEEN, m)]))
  const best = Math.max(...byMove.values())
  assert.ok(best > 500, `a queen is there for the taking: best ${best}`)
  for (let seed = 1; seed <= 20; seed++) {
    const r = search(FREE_QUEEN, { timeMs: 200, level: 1, window: 150, seed })
    assert.ok(r.move)
    const key = r.move!.from + r.move!.to + (r.move!.promotion ?? '')
    const score = byMove.get(key)
    assert.ok(score !== undefined, `legal ${key}`)
    assert.ok(score >= best - 150, `seed ${seed}: ${key} scores ${score}, best ${best}`)
  }
})

test('window overrides the level\'s fixed window in both directions', () => {
  const wide = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const r = search(FREE_QUEEN, { timeMs: 200, level: 1, window: 5000, seed })
    wide.add(r.move!.from + r.move!.to)
  }
  assert.ok(wide.size >= 2, `a wide window spreads the pick: ${[...wide].join(' ')}`)
  const tight = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    const r = search(POS4, { timeMs: 200, level: 2, window: 0, seed })
    tight.add(r.move!.from + r.move!.to + (r.move!.promotion ?? ''))
  }
  assert.equal(tight.size, 1, `window 0 always plays the best: ${[...tight].join(' ')}`)
})

test('randomised levels rank the remaining moves as lines', () => {
  const r = search(FREE_QUEEN, { timeMs: 200, level: 1, multiPv: 3, seed: 2 })
  assert.deepEqual(r.move, { from: 'c1', to: 'g5' })
  assert.equal(r.lines!.length, 2)
  for (const line of r.lines!) assert.ok(!sameMove(line.move, r.move!))
  assert.ok(r.lines![0].scoreCp >= r.lines![1].scoreCp)
  assert.ok(r.scoreCp > r.lines![0].scoreCp)
})
