/**
 * The board: game state (chess.js), the SVG board and figurines, move input,
 * the typewritten ledger, the captured tray, the promotion card.
 * Implemented in src/board.
 */
import type { Color, GameSnapshot, MoveRecord, PieceKey } from './chess'
import type { EventBus } from './events'

export interface BoardMounts {
  /** Where the board itself goes. */
  board: HTMLElement
  /** Where the typewritten move list goes. */
  ledger: HTMLElement
  /** Where captured pieces are shelved. */
  tray: HTMLElement
}

export interface BoardOptions {
  /** Which side the player controls. Default 'w'. */
  playerColor?: Color
  /** Which side is at the bottom. Default: the player's color. */
  orientation?: Color
  /** Whether the player may move. Default true. */
  interactive?: boolean
  /** Dossier names for the twelve piece types, used for hover dossiers and accessibility labels. */
  pieceNames: Record<PieceKey, string>
  /** Full dossier lines per piece type, shown on hover. */
  pieceDossiers?: Record<PieceKey, readonly string[]>
}

export interface BoardController {
  /** Starts a new game. Emits 'game:new'. */
  newGame(options?: { fen?: string; playerColor?: Color }): GameSnapshot
  snapshot(): GameSnapshot
  /**
   * Applies a move from outside, normally the opponent's. UCI form, e.g.
   * 'e2e4' or 'e7e8q'. Returns null and does nothing if the move is illegal.
   * Emits 'game:move', then 'game:check' or 'game:over' as appropriate.
   */
  applyMove(uci: string, by: 'player' | 'opponent'): MoveRecord | null
  /** Legal moves from a square in UCI form. */
  legalMoves(from?: string): string[]
  setInteractive(on: boolean): void
  setOrientation(color: Color): void
  /** The player resigns. Emits 'game:over'. */
  resign(): void
  destroy(): void
}

/**
 * Function the board module must export from src/board/index.ts.
 * The player's own moves are handled inside the board (click, drag, keyboard)
 * and reported through the bus as 'game:move' with by: 'player'.
 */
export interface BoardModule {
  createBoard(mounts: BoardMounts, options: BoardOptions, bus: EventBus): BoardController
}
