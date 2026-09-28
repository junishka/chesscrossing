/**
 * The game: a chess.js wrapper that speaks the contract's vocabulary.
 * Produces GameSnapshot and MoveRecord exactly as src/contracts/chess.ts
 * defines them. Knows nothing of the DOM.
 */
import { Chess, type Move } from 'chess.js'
import type { Color, GameResult, GameSnapshot, MoveRecord, PieceType, Square } from '../contracts/chess'
import { START_FEN } from '../contracts/chess'

export interface UciParts {
  from: Square
  to: Square
  promotion?: PieceType
}

const SQUARE_RE = /^[a-h][1-8]$/
const PROMOTION_RE = /^[qrbn]$/

/** 'e7e8q' to its parts. Null when the string is not a UCI move. */
export function parseUci(uci: string): UciParts | null {
  if (typeof uci !== 'string') return null
  const s = uci.trim().toLowerCase()
  if (s.length !== 4 && s.length !== 5) return null
  const from = s.slice(0, 2)
  const to = s.slice(2, 4)
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to)) return null
  const parts: UciParts = { from: from as Square, to: to as Square }
  if (s.length === 5) {
    const p = s[4] as string
    if (!PROMOTION_RE.test(p)) return null
    parts.promotion = p as PieceType
  }
  return parts
}

/** A chess.js move to UCI: from, to, and the promotion letter when there is one. */
export function moveToUci(move: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

/** SAN without its check or mate suffix: the ledger types check as a remark. */
export function stripSanSuffix(san: string): string {
  return san.replace(/[+#]+$/, '')
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

/** The full-move number a FEN string is at. */
export function fenMoveNumber(fen: string): number {
  const field = fen.split(' ')[5]
  const n = field ? parseInt(field, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Movetext without headers or a result token. */
export function movetext(pgn: string): string {
  return pgn
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('['))
    .join(' ')
    .replace(/\s+\*$/, '')
    .trim()
}

function toRecord(move: Move, check: boolean): MoveRecord {
  const record: MoveRecord = {
    moveNumber: fenMoveNumber(move.before),
    color: move.color,
    piece: move.piece,
    from: move.from as Square,
    to: move.to as Square,
    san: move.san,
    uci: moveToUci(move),
    flags: move.flags,
    fen: move.after,
    check,
  }
  if (move.captured) record.captured = move.captured
  if (move.promotion) record.promotion = move.promotion
  return record
}

export interface GameOptions {
  fen?: string
  playerColor?: Color
}

export class Game {
  private chess: Chess
  private records: MoveRecord[] = []
  /** A result reached outside the rules of movement: resignation or agreement. */
  private declared: GameResult | undefined
  private start: string
  playerColor: Color

  constructor(options: GameOptions = {}) {
    this.start = options.fen ?? START_FEN
    this.chess = new Chess(this.start)
    this.playerColor = options.playerColor ?? 'w'
  }

  /** Starts over from a position. Throws on an invalid FEN, as chess.js does. */
  reset(options: GameOptions = {}): void {
    const fen = options.fen ?? START_FEN
    this.chess = new Chess(fen)
    this.start = fen
    this.records = []
    this.declared = undefined
    if (options.playerColor) this.playerColor = options.playerColor
  }

  get startFen(): string {
    return this.start
  }

  fen(): string {
    return this.chess.fen()
  }

  turn(): Color {
    return this.chess.turn()
  }

  inCheck(): boolean {
    return this.chess.inCheck()
  }

  history(): readonly MoveRecord[] {
    return this.records
  }

  /** The piece on a square, if any. */
  pieceAt(square: string): { type: PieceType; color: Color } | null {
    const p = this.chess.get(square as Square)
    return p ? { type: p.type, color: p.color } : null
  }

  /** Every occupied square with its piece. */
  pieces(): { square: Square; type: PieceType; color: Color }[] {
    const out: { square: Square; type: PieceType; color: Color }[] = []
    for (const rank of this.chess.board()) {
      for (const cell of rank) {
        if (cell) out.push({ square: cell.square as Square, type: cell.type, color: cell.color })
      }
    }
    return out
  }

  /**
   * Plays a UCI move. Returns the record, or null and leaves the position
   * alone when the move is illegal, malformed, or the game has ended.
   */
  move(uci: string): MoveRecord | null {
    if (this.isGameOver()) return null
    const parts = parseUci(uci)
    if (!parts) return null
    let played: Move
    try {
      played = this.chess.move(
        parts.promotion ? { from: parts.from, to: parts.to, promotion: parts.promotion } : { from: parts.from, to: parts.to },
      )
    } catch {
      return null
    }
    const record = toRecord(played, this.chess.inCheck())
    this.records.push(record)
    return record
  }

  /** Whether the move needs a promotion letter it does not have. */
  needsPromotion(from: string, to: string): boolean {
    const moves = this.chess.moves({ square: from as Square, verbose: true })
    return moves.some((m) => m.to === to && m.promotion !== undefined)
  }

  /** Legal moves in UCI form, from one square or from all. */
  legalMoves(from?: string): string[] {
    if (this.isGameOver()) return []
    const moves = from
      ? this.chess.moves({ square: from as Square, verbose: true })
      : this.chess.moves({ verbose: true })
    return moves.map(moveToUci)
  }

  /** Squares a piece may move to from `from`, each once (promotions collapse). */
  destinations(from: string): Square[] {
    const set = new Set<Square>()
    for (const uci of this.legalMoves(from)) set.add(uci.slice(2, 4) as Square)
    return [...set]
  }

  isGameOver(): boolean {
    return this.declared !== undefined || this.chess.isGameOver()
  }

  result(): GameResult | undefined {
    if (this.declared) return this.declared
    const c = this.chess
    if (c.isCheckmate()) return { outcome: 'checkmate', winner: opposite(c.turn()) }
    if (c.isStalemate()) return { outcome: 'stalemate' }
    if (c.isInsufficientMaterial()) return { outcome: 'draw-insufficient-material' }
    if (c.isThreefoldRepetition()) return { outcome: 'draw-repetition' }
    if (c.isDrawByFiftyMoves()) return { outcome: 'draw-fifty-moves' }
    return undefined
  }

  /** A side resigns. Default: the player. Returns the result; null if the game had already ended. */
  resign(color: Color = this.playerColor): GameResult | null {
    if (this.isGameOver()) return null
    this.declared = { outcome: 'resignation', winner: opposite(color) }
    return this.declared
  }

  /** A draw by agreement. Returns the result; null if the game had already ended. */
  agreeDraw(): GameResult | null {
    if (this.isGameOver()) return null
    this.declared = { outcome: 'agreement' }
    return this.declared
  }

  /** Pieces off the board, by the colour they belong to, in capture order. */
  captured(): { w: PieceType[]; b: PieceType[] } {
    const out: { w: PieceType[]; b: PieceType[] } = { w: [], b: [] }
    for (const r of this.records) {
      if (r.captured) out[opposite(r.color)].push(r.captured)
    }
    return out
  }

  snapshot(): GameSnapshot {
    const snap: GameSnapshot = {
      fen: this.chess.fen(),
      pgn: movetext(this.chess.pgn()),
      history: [...this.records],
      turn: this.chess.turn(),
      inCheck: this.chess.inCheck(),
      isGameOver: this.isGameOver(),
      captured: this.captured(),
      playerColor: this.playerColor,
    }
    const result = this.result()
    if (result) snap.result = result
    return snap
  }
}

/** The king's square for a colour, or null. */
export function kingSquare(game: Game, color: Color): Square | null {
  const found = game.pieces().find((p) => p.type === 'k' && p.color === color)
  return found ? found.square : null
}

/** '1–0', '0–1' or '½–½', with en dashes, as the ledger types a result. */
export function scoreText(result: GameResult): string {
  if (result.winner === 'w') return '1–0'
  if (result.winner === 'b') return '0–1'
  return '½–½'
}
