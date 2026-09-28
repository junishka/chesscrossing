/**
 * The application event bus. Modules talk to each other only through this
 * bus and through the interfaces in this directory. No module imports another
 * module's internals.
 */
import type { Color, GameResult, GameSnapshot, MoveRecord, PieceKey } from './chess'

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
  | { type: 'piece:inspect'; key: PieceKey | null }
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
  | { type: 'player:new-game'; color?: Color }

export type AppEventType = AppEvent['type']
export type AppEventOf<T extends AppEventType> = Extract<AppEvent, { type: T }>

export interface EventBus {
  emit(event: AppEvent): void
  /** Returns an unsubscribe function. */
  on<T extends AppEventType>(type: T, handler: (event: AppEventOf<T>) => void): () => void
  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(handler: (event: AppEvent) => void): () => void
}
