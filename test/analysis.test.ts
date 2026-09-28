import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Position } from '../src/chess/rules'
import { brief, briefToText, describeMove, hanging, material } from '../src/chess/analysis'
import type { MoveInput, MoveRecord } from '../src/types'

/** Plays a SAN sequence from the start (test helper). */
function play(sans: string[], fen?: string): Position {
  const p = new Position(fen)
  for (const san of sans) {
    const clean = san.replace(/[+#]/g, '')
    const input = p.legalMoves().find((m: MoveInput) => p.clone().move(m)?.san.replace(/[+#]/g, '') === clean)
    if (!input) throw new Error(`no legal move ${san} in ${p.fen()}`)
    p.move(input)
  }
  return p
}

function last(p: Position): MoveRecord {
  const h = p.history()
  return h[h.length - 1]
}

test('describeMove samples', () => {
  assert.equal(describeMove(last(play(['e4']))), "White's pawn goes to e4.")
  assert.equal(describeMove(last(play(['e4', 'e5', 'Nf3']))), "White's knight goes to f3.")
  assert.equal(describeMove(last(play(['e4', 'd5', 'exd5']))), "White's pawn takes the pawn on d5.")
  assert.equal(
    describeMove(last(play(['e4', 'e5', 'Bc4', 'Nc6', 'Bxf7+']))),
    "White's bishop takes the pawn on f7. Check.",
  )
  assert.equal(
    describeMove(last(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'Nxf7']))),
    "White's knight takes the pawn on f7.",
  )
  assert.equal(describeMove(last(play(['f3', 'e5', 'g4', 'Qh4#']))), "Black's queen goes to h4. Checkmate.")
  assert.equal(describeMove(last(play(['e4', 'a6', 'e5', 'd5', 'exd6']))), "White's pawn takes the pawn on d5 en passant.")
  assert.equal(describeMove(last(play(['O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))), 'White castles kingside.')
  assert.equal(describeMove(last(play(['O-O', 'O-O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))), 'Black castles queenside.')
  assert.equal(describeMove(last(play(['b8=Q+'], '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1'))), "White's pawn goes to b8 and becomes a queen. Check.")
  assert.equal(describeMove(last(play(['bxa8=N'], 'r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1'))), "White's pawn takes the rook on a8 and becomes a knight.")
})

test('material counts and listings', () => {
  const start = material(new Position())
  assert.equal(start.w, 39)
  assert.equal(start.b, 39)
  assert.equal(start.diff, 0)
  assert.equal(start.wPieces, 'Q R R B B N N, 8 pawns')
  const m = material(new Position('4k3/8/8/8/8/8/P7/R3K3 w - - 0 1'))
  assert.equal(m.w, 6)
  assert.equal(m.diff, 6)
  assert.equal(m.wPieces, 'R, 1 pawn')
  assert.equal(m.bPieces, 'bare king')
  assert.equal(material(new Position('4k3/8/8/8/8/8/PP6/4K3 w - - 0 1')).wPieces, 'no pieces, 2 pawns')
})

test('hanging detection', () => {
  const undefended = new Position('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1')
  assert.deepEqual(hanging(undefended), [{ square: 'd5', piece: 'n', color: 'b' }])

  const defended = new Position('4k3/8/4p3/3n4/8/8/8/3RK3 w - - 0 1')
  assert.deepEqual(hanging(defended), [], 'a knight defended by a pawn and attacked by a rook is not loose')

  const cheapAttacker = new Position('4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1')
  assert.deepEqual(hanging(cheapAttacker), [{ square: 'd5', piece: 'r', color: 'b' }], 'a defended rook attacked by a pawn is loose')

  const notMyTurn = new Position('4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1')
  assert.deepEqual(hanging(notMyTurn), [], 'only what the side to move can take')

  const pinned = new Position('4k3/8/8/8/8/8/3N4/r2K4 w - - 0 1')
  assert.deepEqual(hanging(pinned), [], 'no piece can legally take: the knight would expose the king')

  const kingOnly = new Position('4k3/8/8/8/8/8/4n3/4K3 w - - 0 1')
  assert.deepEqual(hanging(kingOnly), [{ square: 'e2', piece: 'n', color: 'b' }], 'a king may take an undefended piece')
  const kingVsDefended = new Position('4k3/8/8/8/8/3p4/4n3/4K3 w - - 0 1')
  assert.deepEqual(hanging(kingVsDefended), [], 'the king does not count as a cheap attacker')
})

test('brief fields', () => {
  const p = play(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])
  const b = brief(p, { playerColor: 'w', evalResult: { scoreCp: 35, pv: ['e1e2'] }, clocks: { w: 300000, b: 295000, running: 'w', incrementMs: 2000 } })
  assert.equal(b.turn, 'w')
  assert.equal(b.moveNumber, 6)
  assert.equal(b.ply, 10)
  assert.equal(b.lastMoves.length, 6)
  assert.equal(b.lastMoves[0], '3. d4')
  assert.equal(b.lastMoves[1], '3... cxd4')
  assert.deepEqual(b.captured, { byWhite: ['p'], byBlack: ['p'] })
  assert.equal(b.evalCp, 35)
  assert.equal(b.mateIn, undefined)
  assert.equal(b.narrative, "Black's pawn goes to a6.")
  assert.equal(b.status.isGameOver, false)
  assert.equal(brief(new Position(), { playerColor: 'b' }).narrative, 'The game has not begun.')
  assert.equal(brief(play(['f3', 'e5', 'g4', 'Qh4#']), { playerColor: 'w' }).narrative, 'Black has delivered checkmate.')
})

test('briefToText is compact and says the right things', () => {
  const p = play(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3'])
  const clocks = { w: 4 * 60000 + 12000, b: 3 * 60000 + 7000, running: 'b' as const, incrementMs: 0 }
  const text = briefToText(brief(p, { playerColor: 'b', evalResult: { scoreCp: 110, pv: ['f8e7', 'f2f3'] }, clocks }))
  assert.ok(text.length <= 900, `too long: ${text.length}`)
  assert.ok(text.includes(p.fen()))
  assert.ok(text.includes('The player has Black'))
  assert.ok(text.includes('Black (the player) to move'))
  assert.ok(text.includes('5... a6 6. Be3 6... e5 7. Nb3'))
  assert.ok(text.includes('White is better by about a pawn'))
  assert.ok(text.includes('Clocks: White 4:12, Black 3:07'))
  assert.ok(text.includes('Move 7, opening'))
  assert.ok(text.includes("White's knight goes to b3."))

  const equal = briefToText(brief(new Position(), { playerColor: 'w', evalResult: { scoreCp: 10, pv: [] } }))
  assert.ok(equal.includes('roughly equal'))
  assert.ok(equal.includes('Last moves: none yet'))
  assert.ok(!equal.includes('Clocks'))

  const mate = briefToText(brief(new Position(), { playerColor: 'w', evalResult: { scoreCp: -10000, mateIn: -3, pv: [] } }))
  assert.ok(mate.includes('mate in 3 for Black'))
  const noEval = briefToText(brief(new Position(), { playerColor: 'w' }))
  assert.ok(noEval.includes('not evaluated'))
  assert.ok(briefToText(brief(new Position(), { playerColor: 'w', evalResult: { scoreCp: 260, pv: [] } })).includes('better by about 2.6 pawns'))
  assert.ok(briefToText(brief(new Position(), { playerColor: 'w', evalResult: { scoreCp: -700, pv: [] } })).includes('Black is winning'))
})
