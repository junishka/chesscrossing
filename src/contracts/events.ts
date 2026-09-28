/**
 * The application event bus. Modules talk to each other only through this
 * bus and through the interfaces in this directory. No module imports another
 * module's internals.
 */
import type { Color, GameResult, GameSnapshot, MoveRecord, PieceKey, Strength } from './chess'

export type MoveClassification = 'blunder' | 'mistake' | 'inaccuracy' | 'good' | 'excellent'

export type AppEvent =
  // Game
  | { type: 'game:new'; snapshot: GameSnapshot }
  | { type: 'game:move'; move: MoveRecord; snapshot: GameSnapshot; by: 'player' | 'opponent' }
  | { type: 'game:check'; color: Color; snapshot: GameSnapshot }
  | { type: 'game:over'; result: GameResult; snapshot: GameSnapshot }
  /**
   * Evaluation of the current position from White's point of view, in
   * centipawns, or a mate distance. `swing` is the change caused by the last
   * move from the mover's point of view (negative is bad for the mover).
   */
  | { type: 'game:eval'; fen: string; cp?: number; mate?: number; swing?: number; classification?: MoveClassification; by?: 'player' | 'opponent' }
  // Engine
  | { type: 'engine:status'; status: 'loading' | 'ready' | 'thinking' | 'error'; detail?: string }
  // Inspection
  /**
   * A piece was clicked (or its card dismissed, key null). `captured` when it
   * was clicked in the tray; its card is then face down. The world raises the
   * dossier card on the page; the board only reports.
   */
  | { type: 'piece:inspect'; key: PieceKey | null; captured?: boolean; square?: string }
  | { type: 'object:inspect'; objectId: string | null }
  | { type: 'door:tried'; doorId: string; locked: boolean; leadsTo?: string }
  | { type: 'room:enter'; roomId: string }
  // Narrator
  | { type: 'narrator:status'; status: 'idle' | 'thinking' | 'speaking' | 'silent' | 'error'; detail?: string }
  | { type: 'narrator:said'; text: string; inReplyTo?: string }
  | { type: 'player:asked'; text: string }
  // Player intent
  | { type: 'player:leave-room' }
  | { type: 'player:resign' }
  /** Emitted by the app shell when a game is to begin (after an hour is named). */
  | { type: 'player:new-game'; color?: Color }
  /**
   * The visitor named an hour on card 1-17. The world emits this; the app shell
   * starts a game if none is on, or changes the opponent's strength if one is.
   * The world underlines the chosen hour itself by listening to this event.
   */
  | { type: 'player:hour'; index: number; strength: Strength }
  /** The visitor chose which side to take for the next game. */
  | { type: 'player:color'; color: Color }
  // Settings
  /** The date-stamp sound. The world's page-head control emits it, also once on mount with the stored value. */
  | { type: 'settings:sound'; on: boolean }

export type AppEventType = AppEvent['type']
export type AppEventOf<T extends AppEventType> = Extract<AppEvent, { type: T }>

export interface EventBus {
  emit(event: AppEvent): void
  /** Returns an unsubscribe function. */
  on<T extends AppEventType>(type: T, handler: (event: AppEventOf<T>) => void): () => void
  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(handler: (event: AppEvent) => void): () => void
}
