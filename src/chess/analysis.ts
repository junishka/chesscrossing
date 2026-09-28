// Position analysis for the Second: plain prose about moves, material, loose pieces, and a compact brief.
import type { ClockState, Color, MoveRecord, PieceType, PositionBrief, Square } from '../types'
import { PIECE_VALUES, Position } from './rules'

const PIECE_NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const PIECE_LETTERS: Record<PieceType, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }
const COLOR_NAMES: Record<Color, string> = { w: 'White', b: 'Black' }
/** Order pieces are listed in a material summary. */
const LISTING_ORDER: PieceType[] = ['q', 'r', 'b', 'n']
/** For "attacked by a lower-value piece" the king must count as the most valuable attacker, not the cheapest. */
const ATTACK_VALUE: Record<PieceType, number> = { ...PIECE_VALUES, k: 100 }

/** One unsentimental sentence about a move: "White's knight takes the bishop on f7. Check." */
export function describeMove(move: MoveRecord): string {
  const who = COLOR_NAMES[move.color]
  let body: string
  if (move.isCastleKing || move.isCastleQueen) {
    body = `${who} castles ${move.isCastleKing ? 'kingside' : 'queenside'}`
  } else {
    const piece = `${who}'s ${PIECE_NAMES[move.piece]}`
    const action = move.captured
      ? `takes the ${PIECE_NAMES[move.captured]} on ${move.capturedSquare ?? move.to}${move.isEnPassant ? ' en passant' : ''}`
      : `goes to ${move.to}`
    body = `${piece} ${action}`
    if (move.isPromotion && move.promotion) body += ` and becomes a ${PIECE_NAMES[move.promotion]}`
  }
  const suffix = move.isMate ? ' Checkmate.' : move.isCheck ? ' Check.' : ''
  return `${body}.${suffix}`
}

/** "Q R R B N, 6 pawns", "no pieces, 2 pawns", or "bare king". */
function listPieces(p: Position, color: Color): string {
  const own = p.board().filter((x) => x.color === color)
  const pieces = LISTING_ORDER.flatMap((t) => own.filter((x) => x.type === t).map(() => PIECE_LETTERS[t]))
  const pawns = own.filter((x) => x.type === 'p').length
  if (!pieces.length && !pawns) return 'bare king'
  const head = pieces.length ? pieces.join(' ') : 'no pieces'
  const tail = pawns === 0 ? 'no pawns' : pawns === 1 ? '1 pawn' : `${pawns} pawns`
  return `${head}, ${tail}`
}

/** Material count per side in pawn units, the difference from White's side, and a listing of each army. */
export function material(p: Position): PositionBrief['material'] {
  const sum = (c: Color) => p.board().filter((x) => x.color === c).reduce((s, x) => s + PIECE_VALUES[x.type], 0)
  const w = sum('w')
  const b = sum('b')
  return { w, b, diff: w - b, wPieces: listPieces(p, 'w'), bPieces: listPieces(p, 'b') }
}

/**
 * Pieces of the side not to move that the side to move can capture right now (legally) and that are
 * either undefended or attacked by something cheaper than themselves. Kings are never listed.
 */
export function hanging(p: Position): PositionBrief['hanging'] {
  const attacker = p.turn()
  const victim: Color = attacker === 'w' ? 'b' : 'w'
  const captures = new Map<Square, number>()
  for (const m of p.legalMoves()) {
    const moving = p.get(m.from)
    const target = p.get(m.to)
    if (!moving || !target || target.color !== victim) continue
    captures.set(m.to, Math.min(captures.get(m.to) ?? Infinity, ATTACK_VALUE[moving.type]))
  }
  const out: PositionBrief['hanging'] = []
  for (const [square, cheapest] of captures) {
    const piece = p.get(square)
    if (!piece || piece.type === 'k') continue
    const defended = p.isAttacked(square, victim)
    if (!defended || cheapest < PIECE_VALUES[piece.type]) out.push({ square, piece: piece.type, color: victim })
  }
  return out.sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece] || a.square.localeCompare(b.square))
}

/** "12. Nf3" for White's moves, "12... Nc6" for Black's. */
function numbered(m: MoveRecord): string {
  return m.color === 'w' ? `${m.moveNumber}. ${m.san}` : `${m.moveNumber}... ${m.san}`
}

/** Pieces each side has captured, in the order they were taken. */
function captured(history: MoveRecord[]): PositionBrief['captured'] {
  const byWhite: PieceType[] = []
  const byBlack: PieceType[] = []
  for (const m of history) if (m.captured) (m.color === 'w' ? byWhite : byBlack).push(m.captured)
  return { byWhite, byBlack }
}

/** One line on the state of play: the last move, or how the game ended. */
function narrative(p: Position, last: MoveRecord | undefined): string {
  const status = p.status()
  if (status.isGameOver && status.reason) {
    if (status.reason === 'checkmate') return `${COLOR_NAMES[status.turn === 'w' ? 'b' : 'w']} has delivered checkmate.`
    const how: Record<string, string> = {
      stalemate: 'stalemate', insufficient: 'insufficient material', threefold: 'threefold repetition', 'fifty-move': 'the fifty-move rule',
    }
    return `The game is drawn by ${how[status.reason] ?? status.reason}.`
  }
  if (!last) return p.ply() === 0 ? 'The game has not begun.' : 'The position was set up; no moves have been played from it.'
  return describeMove(last)
}

/** Everything the Second is told about the live position. */
export function brief(
  p: Position,
  opts: { playerColor: Color; evalResult?: { scoreCp: number; mateIn?: number; pv: string[] }; clocks?: ClockState },
): PositionBrief {
  const history = p.history()
  const last = history[history.length - 1]
  const ev = opts.evalResult
  return {
    fen: p.fen(),
    pgn: p.pgn(),
    turn: p.turn(),
    moveNumber: p.moveNumber(),
    ply: p.ply(),
    playerColor: opts.playerColor,
    phase: p.phase(),
    material: material(p),
    captured: captured(history),
    lastMoves: history.slice(-6).map(numbered),
    inCheck: p.inCheck(),
    ...(ev ? { evalCp: ev.scoreCp, pv: ev.pv } : {}),
    ...(ev?.mateIn !== undefined ? { mateIn: ev.mateIn } : {}),
    hanging: hanging(p),
    ...(opts.clocks ? { clocks: opts.clocks } : {}),
    status: p.status(),
    narrative: narrative(p, last),
  }
}

/** The engine's opinion in words. `mateIn` is signed from White's side, like `evalCp`. */
function evalWords(b: PositionBrief): string {
  if (b.mateIn !== undefined && b.mateIn !== 0) {
    const side = b.mateIn > 0 ? 'White' : 'Black'
    return `mate in ${Math.abs(b.mateIn)} for ${side}`
  }
  if (b.evalCp === undefined) return 'not evaluated'
  const cp = b.evalCp
  const abs = Math.abs(cp)
  if (abs < 25) return 'roughly equal'
  const side = cp > 0 ? 'White' : 'Black'
  if (abs < 70) return `${side} is slightly better`
  if (abs >= 500) return `${side} is winning`
  const pawns = abs / 100
  const amount = pawns < 1.5 ? 'about a pawn' : `about ${pawns.toFixed(pawns >= 3 ? 0 : 1).replace(/\.0$/, '')} pawns`
  return `${side} is better by ${amount}`
}

/** "3:24" from milliseconds; hours shown only when needed. */
function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mmss = `${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${mmss}` : mmss
}

/** Material in words: "White is up a pawn", "material is level". */
function materialWords(m: PositionBrief['material']): string {
  if (m.diff === 0) return 'level'
  const side = m.diff > 0 ? 'White' : 'Black'
  const n = Math.abs(m.diff)
  return `${side} up ${n === 1 ? 'a pawn' : `${n} pawns' worth`}`
}

/** A compact, plain-text rendering of a brief, appended to the Second's system prompt. */
export function briefToText(b: PositionBrief): string {
  const you = COLOR_NAMES[b.playerColor]
  const toMove = b.turn === b.playerColor ? `${COLOR_NAMES[b.turn]} (the player) to move` : `${COLOR_NAMES[b.turn]} (the opponent) to move`
  const lines = [
    `Position (FEN): ${b.fen}`,
    `The player has ${you}. Move ${b.moveNumber}, ${b.phase}. ${b.status.isGameOver ? 'The game is over.' : toMove + '.'}`,
    `Last moves: ${b.lastMoves.length ? b.lastMoves.join(' ') : 'none yet'}`,
    `Material: White ${b.material.wPieces}; Black ${b.material.bPieces}; ${materialWords(b.material)}.`,
    `Loose pieces: ${b.hanging.length ? b.hanging.map((h) => `${COLOR_NAMES[h.color]} ${PIECE_NAMES[h.piece]} on ${h.square}`).join(', ') : 'none'}.`,
    `Engine: ${evalWords(b)}${b.pv?.length ? `, line ${b.pv.slice(0, 4).join(' ')}` : ''}.`,
  ]
  if (b.inCheck) lines.push(`${COLOR_NAMES[b.turn]} is in check.`)
  if (b.clocks) lines.push(`Clocks: White ${clockText(b.clocks.w)}, Black ${clockText(b.clocks.b)}.`)
  lines.push(b.narrative)
  return lines.join('\n')
}
