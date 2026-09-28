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
  /** Dossier names for the twelve piece types, used for accessibility labels. */
  pieceNames: Record<PieceKey, string>
  /**
   * The opponent's fixed words, entered in the ledger's Remarks by the clerk:
   * `please` on the start row; `thankYou` on the result row; when he has lost,
   * `thankYouHelder` first and then `thankYou`. From the world.
   */
  opponentLines: { please: string; thankYou: string; thankYouHelder: string }
  /** Formats the date for the result row and the stamp, e.g. '14 III 90'. From the world. */
  ledgerDate: (date: Date) => string
  /** Whether the date-stamp sound starts on. The board also listens to 'settings:sound'. */
  soundOn?: boolean
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
  /**
   * The tray insert cuts in for two seconds when a piece enters it. This keeps
   * it visible while the tray object in the scene is hovered (the app shell
   * bridges 'object:inspect' for the tray's item to this call).
   */
  setTrayVisible(on: boolean): void
  destroy(): void
}

/**
 * Function the board module must export from src/board/index.ts.
 * The player's own moves are handled inside the board (click, drag, keyboard)
 * and reported through the bus as 'game:move' with by: 'player'.
 * The board insert is hidden until newGame and cuts out after the pieces have
 * returned at game end (docs/visual.md sections 6, 7, 9, 11).
 */
export interface BoardModule {
  createBoard(mounts: BoardMounts, options: BoardOptions, bus: EventBus): BoardController
}
