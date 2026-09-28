/**
 * Shared chess vocabulary. Used by the board, the engine, the narrator, and the
 * server. Keep this file free of DOM and Node types.
 */

export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Square = `${File}${Rank}`

/** 'wK', 'bP', and so on. The key under which a piece type has a dossier. */
export type PieceKey = `${Color}${Uppercase<PieceType>}`

export const PIECE_KEYS: readonly PieceKey[] = [
  'wK', 'wQ', 'wR', 'wB', 'wN', 'wP',
  'bK', 'bQ', 'bR', 'bB', 'bN', 'bP',
]

export function pieceKey(color: Color, type: PieceType): PieceKey {
  return `${color}${type.toUpperCase() as Uppercase<PieceType>}`
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** One half-move, recorded after it has been played. */
export interface MoveRecord {
  /** 1-based full-move number this half-move belongs to. */
  moveNumber: number
  color: Color
  piece: PieceType
  from: Square
  to: Square
  /** Standard algebraic notation, e.g. 'Nf3', 'exd5', 'O-O', 'e8=Q+'. */
  san: string
  /** Long algebraic in UCI form, e.g. 'e2e4', 'e7e8q'. */
  uci: string
  captured?: PieceType
  promotion?: PieceType
  /** chess.js flags string: n, b, e, c, p, k, q. */
  flags: string
  /** Position after the move. */
  fen: string
  /** Whether the move gives check. */
  check: boolean
}

export type Outcome =
  | 'checkmate'
  | 'stalemate'
  | 'draw-repetition'
  | 'draw-fifty-moves'
  | 'draw-insufficient-material'
  | 'resignation'
  | 'agreement'

export interface GameResult {
  outcome: Outcome
  /** Absent for draws. */
  winner?: Color
}

export interface GameSnapshot {
  fen: string
  pgn: string
  history: MoveRecord[]
  turn: Color
  inCheck: boolean
  isGameOver: boolean
  result?: GameResult
  /** Pieces captured from each side, in capture order. captured.w are white pieces now off the board. */
  captured: { w: PieceType[]; b: PieceType[] }
  playerColor: Color
}

/** Engine strength, 1 (gentle) to 8 (strong). The world gives each a label. */
export type Strength = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export const STRENGTHS: readonly Strength[] = [1, 2, 3, 4, 5, 6, 7, 8]
