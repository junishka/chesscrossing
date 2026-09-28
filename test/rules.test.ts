import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Position, START_FEN, squareToXY, xyToSquare, FILES, RANKS } from '../src/chess/rules'

test('square coordinates round trip', () => {
  assert.deepEqual(squareToXY('a1'), { file: 0, rank: 0 })
  assert.deepEqual(squareToXY('h8'), { file: 7, rank: 7 })
  assert.equal(xyToSquare(4, 3), 'e4')
  for (const f of FILES) for (const r of RANKS) {
    const { file, rank } = squareToXY(`${f}${r}`)
    assert.equal(xyToSquare(file, rank), `${f}${r}`)
  }
  assert.throws(() => xyToSquare(8, 0))
})

test('legal move generation on known positions', () => {
  const start = new Position()
  assert.equal(start.fen(), START_FEN)
  assert.equal(start.legalMoves().length, 20)
  assert.deepEqual(start.legalTargets('e2').sort(), ['e3', 'e4'])
  assert.deepEqual(start.legalTargets('g1').sort(), ['f3', 'h3'])
  assert.deepEqual(start.legalTargets('a1'), [])

  const kiwipete = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1')
  assert.equal(kiwipete.legalMoves().length, 48)

  const pinned = new Position('4k3/8/8/8/8/8/4R3/4K2r w - - 0 1')
  assert.ok(pinned.legalMoves('e2').every((m) => m.to[0] === 'e'), 'a pinned rook slides only along the pin')
})

test('en passant record names the captured pawn square', () => {
  const p = new Position()
  for (const san of ['e4', 'a6', 'e5', 'd5']) assert.ok(p.move(sanToInput(p, san)))
  const rec = p.move({ from: 'e5', to: 'd6' })
  assert.ok(rec)
  assert.equal(rec.san, 'exd6')
  assert.equal(rec.isEnPassant, true)
  assert.equal(rec.isCapture, true)
  assert.equal(rec.captured, 'p')
  assert.equal(rec.capturedSquare, 'd5')
  assert.equal(p.get('d5'), null)
  assert.equal(rec.ply, 5)
  assert.equal(rec.moveNumber, 3)
})

test('castling records carry the rook path', () => {
  const p = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  const k = p.move({ from: 'e1', to: 'g1' })
  assert.ok(k)
  assert.equal(k.isCastleKing, true)
  assert.equal(k.isCastleQueen, false)
  assert.equal(k.rookFrom, 'h1')
  assert.equal(k.rookTo, 'f1')
  assert.equal(p.get('f1')?.type, 'r')
  const q = p.move({ from: 'e8', to: 'c8' })
  assert.ok(q)
  assert.equal(q.isCastleQueen, true)
  assert.equal(q.rookFrom, 'a8')
  assert.equal(q.rookTo, 'd8')
  assert.equal(q.san, 'O-O-O')
})

test('promotion variants are generated and the record marks them; queen by default', () => {
  const p = new Position('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1')
  const promos = p.legalMoves('b7').map((m) => m.promotion).sort()
  assert.deepEqual(promos, ['b', 'n', 'q', 'r'])
  assert.deepEqual(p.legalTargets('b7'), ['b8'])
  const knight = p.clone().move({ from: 'b7', to: 'b8', promotion: 'n' })
  assert.equal(knight?.isPromotion, true)
  assert.equal(knight?.promotion, 'n')
  assert.equal(knight?.san, 'b8=N')
  const rec = p.move({ from: 'b7', to: 'b8' })
  assert.equal(rec?.promotion, 'q')
  assert.equal(p.get('b8')?.type, 'q')
})

test('illegal moves return null and leave the position alone', () => {
  const p = new Position()
  assert.equal(p.move({ from: 'e2', to: 'e5' }), null)
  assert.equal(p.move({ from: 'e7', to: 'e5' }), null)
  assert.equal(p.history().length, 0)
  assert.equal(p.fen(), START_FEN)
})

test('checkmate and stalemate status', () => {
  const p = new Position()
  for (const san of ['f3', 'e5', 'g4']) p.move(sanToInput(p, san))
  const mate = p.move(sanToInput(p, 'Qh4#'))
  assert.ok(mate)
  assert.equal(mate.isCheck, true)
  assert.equal(mate.isMate, true)
  assert.equal(p.inCheck(), true)
  const s = p.status()
  assert.equal(s.isGameOver, true)
  assert.equal(s.result, '0-1')
  assert.equal(s.reason, 'checkmate')

  const stale = new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
  assert.deepEqual(stale.legalMoves(), [])
  assert.equal(stale.status().reason, 'stalemate')
  assert.equal(stale.status().result, '1/2-1/2')

  const bare = new Position('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
  assert.equal(bare.status().reason, 'insufficient')
  assert.equal(new Position().status().isGameOver, false)
})

test('check flag on ordinary checks and isAttacked', () => {
  const p = new Position('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
  const rec = p.move({ from: 'a1', to: 'a8' })
  assert.equal(rec?.isCheck, true)
  assert.equal(rec?.isMate, false)
  assert.equal(rec?.san, 'Ra8+')
  assert.equal(p.isAttacked('e8', 'w'), true)
  assert.equal(p.isAttacked('e1', 'b'), false)
  assert.equal(p.kingSquare('b'), 'e8')
})

test('undo restores the position and pops the record', () => {
  const p = new Position()
  p.move({ from: 'e2', to: 'e4' })
  p.move({ from: 'c7', to: 'c5' })
  const undone = p.undo()
  assert.equal(undone?.san, 'c5')
  assert.equal(p.history().length, 1)
  assert.equal(p.turn(), 'b')
  assert.equal(p.get('c7')?.type, 'p')
  p.undo()
  assert.equal(p.undo(), null)
  assert.equal(p.fen(), START_FEN)
})

test('PGN round trip rebuilds the records', () => {
  const p = new Position()
  for (const san of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) assert.ok(p.move(sanToInput(p, san)))
  const pgn = p.pgn()
  const q = new Position()
  assert.equal(q.loadPgn(pgn), true)
  assert.equal(q.fen(), p.fen())
  assert.deepEqual(q.history(), p.history())
  assert.equal(q.history()[5].captured, 'p')
  assert.equal(q.history()[5].capturedSquare, 'd4')
  assert.equal(q.history()[9].ply, 10)
  assert.equal(q.ply(), 10)
  assert.equal(q.moveNumber(), 6)
  assert.equal(q.pgn(), pgn)

  const bad = new Position()
  bad.move({ from: 'e2', to: 'e4' })
  assert.equal(bad.loadPgn('1. e4 e9 2. zz'), false)
  assert.equal(bad.history().length, 1, 'a bad PGN leaves the position untouched')
})

test('PGN from a set-up position keeps the start FEN', () => {
  const p = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
  p.move({ from: 'e1', to: 'g1' })
  const q = new Position()
  assert.ok(q.loadPgn(p.pgn()))
  assert.equal(q.history()[0].rookTo, 'f1')
  assert.equal(q.fen(), p.fen())
  assert.equal(q.clone().fen(), p.fen())
})

test('clone is independent', () => {
  const p = new Position()
  p.move({ from: 'e2', to: 'e4' })
  const c = p.clone()
  c.move({ from: 'e7', to: 'e5' })
  assert.equal(p.history().length, 1)
  assert.equal(c.history().length, 2)
  assert.equal(c.pgn().includes('1. e4 e5'), true)
})

test('phase heuristic', () => {
  assert.equal(new Position().phase(), 'opening')
  const afterQueens = new Position('rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 4')
  assert.equal(afterQueens.phase(), 'middlegame', 'queens off means the opening is over')
  const late = new Position('r1bq1rk1/pp2bppp/2n1pn2/2pp4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 12')
  assert.equal(late.phase(), 'middlegame', 'ply 22 is past the opening')
  const rookEnding = new Position('8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40')
  assert.equal(rookEnding.phase(), 'endgame')
  const queenAndMinor = new Position('4k3/8/8/8/8/8/8/2BQK3 w - - 0 40')
  assert.equal(queenAndMinor.phase(), 'endgame')
  const queenAndRook = new Position('4k3/8/8/8/8/8/8/R2QK3 w - - 0 40')
  assert.equal(queenAndRook.phase(), 'middlegame')
})

test('board listing', () => {
  const b = new Position().board()
  assert.equal(b.length, 32)
  assert.deepEqual(b[0], { type: 'r', color: 'w', square: 'a1' })
  assert.deepEqual(b[31], { type: 'r', color: 'b', square: 'h8' })
})

/** Finds the MoveInput for a SAN string among the legal moves (test helper). */
function sanToInput(p: Position, san: string) {
  const clean = san.replace(/[+#]/g, '')
  for (const m of p.legalMoves()) {
    const probe = p.clone()
    const rec = probe.move(m)
    if (rec && rec.san.replace(/[+#]/g, '') === clean) return m
  }
  throw new Error(`no legal move ${san} in ${p.fen()}`)
}
