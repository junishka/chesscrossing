// Rules of the game: a thin, typed wrapper over chess.js 1.4 that produces full MoveRecords.
import { Chess, type Move } from 'chess.js'
import type {
  Color, File, GameEndReason, GamePhase, GameResult, GameStatus,
  MoveInput, MoveRecord, PieceAt, PieceType, Rank, Square,
} from '../types'

/** The standard starting position. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Conventional piece values in pawns; the king is priceless and therefore worth nothing here. */
export const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Files a..h in board order. */
export const FILES: File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
/** Ranks 1..8 in board order. */
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8]

/** All 64 squares, a1 first, h8 last. */
const SQUARES: Square[] = RANKS.flatMap((r) => FILES.map((f) => `${f}${r}` as Square))

/** Square name → zero-based coordinates; a1 = (0, 0), h8 = (7, 7). */
export function squareToXY(sq: Square): { file: number; rank: number } {
  return { file: sq.charCodeAt(0) - 97, rank: Number(sq[1]) - 1 }
}

/** Zero-based coordinates → square name. Throws when off the board. */
export function xyToSquare(file: number, rank: number): Square {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) throw new RangeError(`off board: ${file},${rank}`)
  return `${FILES[file]}${RANKS[rank]}`
}

/** Half-moves played since the start of a game, derived from a FEN's move number and side to move. */
function plyFromFen(fen: string): number {
  const parts = fen.split(' ')
  const moveNumber = Number(parts[5] ?? 1)
  return (moveNumber - 1) * 2 + (parts[1] === 'b' ? 1 : 0)
}

/** Rook path for a castling move, on the rank the king started on. */
function rookPath(m: Move): { rookFrom: Square; rookTo: Square } | undefined {
  const rank = m.from[1]
  if (m.isKingsideCastle()) return { rookFrom: `h${rank}` as Square, rookTo: `f${rank}` as Square }
  if (m.isQueensideCastle()) return { rookFrom: `a${rank}` as Square, rookTo: `d${rank}` as Square }
  return undefined
}

/** Builds a complete MoveRecord from a chess.js Move; check and mate come from the SAN suffix chess.js appends. */
function toRecord(m: Move, ply: number): MoveRecord {
  const ep = m.isEnPassant()
  const castle = rookPath(m)
  return {
    from: m.from,
    to: m.to,
    ...(m.promotion ? { promotion: m.promotion } : {}),
    san: m.san,
    lan: m.lan,
    color: m.color,
    piece: m.piece,
    ...(m.captured ? { captured: m.captured } : {}),
    ...(m.captured ? { capturedSquare: ep ? (`${m.to[0]}${m.from[1]}` as Square) : m.to } : {}),
    isCheck: m.san.endsWith('+') || m.san.endsWith('#'),
    isMate: m.san.endsWith('#'),
    isCapture: m.isCapture() || ep,
    isCastleKing: m.isKingsideCastle(),
    isCastleQueen: m.isQueensideCastle(),
    isEnPassant: ep,
    isPromotion: m.isPromotion(),
    ...(castle ?? {}),
    fenBefore: m.before,
    fenAfter: m.after,
    ply,
    moveNumber: Number(m.before.split(' ')[5] ?? 1),
  }
}

/** Non-pawn, non-king material of one side in pawn units. */
function heavyMaterial(board: PieceAt[], color: Color): number {
  return board
    .filter((p) => p.color === color && p.type !== 'p' && p.type !== 'k')
    .reduce((sum, p) => sum + PIECE_VALUES[p.type], 0)
}

/**
 * A chess position with its move history. Wraps chess.js so the rest of the house only ever
 * sees the shared types from `src/types.ts`.
 */
export class Position {
  private chess: Chess
  private records: MoveRecord[] = []
  private startFen: string

  constructor(fen: string = START_FEN) {
    this.chess = new Chess(fen)
    this.startFen = fen
  }

  /** Current position in Forsyth–Edwards notation. */
  fen(): string { return this.chess.fen() }

  /** The game so far as PGN (with a SetUp/FEN header when it did not start from the initial position). */
  pgn(): string { return this.chess.pgn() }

  /** Side to move. */
  turn(): Color { return this.chess.turn() }

  /** Half-moves played since the start of the game (0 at the initial position). */
  ply(): number { return plyFromFen(this.chess.fen()) }

  /** Full-move number, as printed in the FEN. */
  moveNumber(): number { return this.chess.moveNumber() }

  /** Every piece on the board, a1 first. */
  board(): PieceAt[] {
    const out: PieceAt[] = []
    for (const square of SQUARES) {
      const p = this.chess.get(square)
      if (p) out.push({ type: p.type, color: p.color, square })
    }
    return out
  }

  /** Piece on a square, or null when empty. */
  get(sq: Square): PieceAt | null {
    const p = this.chess.get(sq)
    return p ? { type: p.type, color: p.color, square: sq } : null
  }

  /** Where a king stands. Throws if that king is missing (never in a legal position). */
  kingSquare(c: Color): Square {
    const sq = this.chess.findPiece({ type: 'k', color: c })[0]
    if (!sq) throw new Error(`no ${c} king on the board`)
    return sq
  }

  /** Legal moves, optionally from one square. Promotions appear once per promotion piece. */
  legalMoves(from?: Square): MoveInput[] {
    const moves = from ? this.chess.moves({ square: from, verbose: true }) : this.chess.moves({ verbose: true })
    return moves.map((m) => (m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to }))
  }

  /** Distinct destination squares reachable from a square. */
  legalTargets(from: Square): Square[] {
    return Array.from(new Set(this.legalMoves(from).map((m) => m.to)))
  }

  /**
   * Plays a move. Returns the full record, or null when the move is illegal.
   * A pawn reaching the last rank with no promotion given becomes a queen.
   */
  move(input: MoveInput): MoveRecord | null {
    const promotion = input.promotion ?? (this.needsPromotion(input) ? 'q' : undefined)
    let m: Move
    try {
      m = this.chess.move(promotion ? { from: input.from, to: input.to, promotion } : { from: input.from, to: input.to })
    } catch {
      return null
    }
    const record = toRecord(m, this.ply())
    this.records.push(record)
    return record
  }

  /** Takes back the last move. Returns its record, or null when there is nothing to undo. */
  undo(): MoveRecord | null {
    const m = this.chess.undo()
    if (!m) return null
    return this.records.pop() ?? null
  }

  /** Records of every move played, oldest first (a copy). */
  history(): MoveRecord[] { return this.records.slice() }

  /** Whether the side to move is in check. */
  inCheck(): boolean { return this.chess.inCheck() }

  /** Whether `by` attacks a square (ignoring pins). */
  isAttacked(sq: Square, by: Color): boolean { return this.chess.isAttacked(sq, by) }

  /** Result and reason when the game has ended by the rules; nothing while it is alive. */
  status(): GameStatus {
    const turn = this.turn()
    const base: GameStatus = { fen: this.fen(), turn, ply: this.ply(), inCheck: this.inCheck(), isGameOver: false }
    const ended = this.endedBy()
    if (!ended) return base
    const result: GameResult = ended === 'checkmate' ? (turn === 'w' ? '0-1' : '1-0') : '1/2-1/2'
    return { ...base, isGameOver: true, result, reason: ended }
  }

  /**
   * Loads a game from PGN, replacing the current one and rebuilding the move records.
   * Returns false and leaves the position untouched when the PGN does not parse.
   */
  loadPgn(pgn: string): boolean {
    const scratch = new Chess()
    try {
      scratch.loadPgn(pgn)
    } catch {
      return false
    }
    const moves = scratch.history({ verbose: true })
    this.chess = scratch
    this.startFen = moves.length ? moves[0].before : scratch.fen()
    const basePly = plyFromFen(this.startFen)
    this.records = moves.map((m, i) => toRecord(m, basePly + i + 1))
    return true
  }

  /** An independent copy with the same history. */
  clone(): Position {
    const copy = new Position(this.startFen)
    for (const r of this.records) copy.chess.move(r.san)
    copy.records = this.records.slice()
    return copy
  }

  /**
   * A rough phase of the game, from the material still on the board:
   * - opening: fewer than 20 plies played, both queens on the board, and each side still has
   *   at least six of its seven non-pawn pieces (so at most one minor or major piece traded);
   * - endgame: neither side has more than 13 pawn-units of non-pawn material, i.e. roughly a
   *   queen and a minor piece, or two rooks and a minor piece, or less;
   * - middlegame: everything in between.
   */
  phase(): GamePhase {
    const board = this.board()
    const heavy = { w: heavyMaterial(board, 'w'), b: heavyMaterial(board, 'b') }
    const count = (c: Color) => board.filter((p) => p.color === c && p.type !== 'p' && p.type !== 'k').length
    const queens = { w: board.some((p) => p.color === 'w' && p.type === 'q'), b: board.some((p) => p.color === 'b' && p.type === 'q') }
    if (this.ply() < 20 && queens.w && queens.b && count('w') >= 6 && count('b') >= 6) return 'opening'
    if (heavy.w <= 13 && heavy.b <= 13) return 'endgame'
    return 'middlegame'
  }

  private needsPromotion(input: MoveInput): boolean {
    const piece = this.chess.get(input.from)
    return piece?.type === 'p' && (input.to[1] === '8' || input.to[1] === '1')
  }

  private endedBy(): GameEndReason | undefined {
    if (this.chess.isCheckmate()) return 'checkmate'
    if (this.chess.isStalemate()) return 'stalemate'
    if (this.chess.isInsufficientMaterial()) return 'insufficient'
    if (this.chess.isThreefoldRepetition()) return 'threefold'
    if (this.chess.isDrawByFiftyMoves()) return 'fifty-move'
    return undefined
  }
}
