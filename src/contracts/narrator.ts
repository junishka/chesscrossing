/**
 * The narrator: the shared wire protocol between the browser panel
 * (src/narrator) and the server (server/narrator). Keep this file free of
 * DOM and Node types; both sides import it.
 */
import type { Color, GameResult } from './chess'
import type { MoveClassification } from './events'

/** Game events the narrator may be told about. The policy decides which are sent. */
export type NarratorEventKind =
  | 'first-launch'
  | 'game-start'
  | 'player-move'
  | 'opponent-move'
  | 'capture'
  | 'check'
  | 'checkmate-for-player'
  | 'checkmate-against-player'
  | 'draw'
  | 'resignation'
  | 'blunder'
  | 'good-move'
  | 'inspect-object'
  | 'inspect-piece'
  | 'door-locked'
  | 'leave-room'
  | 'idle'

export interface NarratorContext {
  /** Current position. */
  fen: string
  /** Full game so far, PGN movetext without headers. Empty string if no game. */
  pgn: string
  /** The last half-moves in SAN, oldest first. At most 10. */
  lastMovesSan: string[]
  turn: Color
  playerColor: Color
  gameStatus: 'idle' | 'playing' | 'over'
  result?: GameResult
  /** Move count in half-moves. */
  ply: number
  /** Last evaluation, White's point of view, if known. */
  evalCp?: number
  evalMate?: number
  lastMoveClassification?: MoveClassification
  roomId: string
  /** e.g. 'Room 1, the Declarations Room'. */
  roomName: string
  /** The hour named on card 1-17, e.g. '18.00' or 'After'. */
  hour: string
  /** The object or piece being inspected, by display name, if any. */
  inspecting?: string
  /** A door the player just tried, by display name, if any. */
  door?: string
}

export interface NarratorRequest {
  /** Stable per browser session. The server keeps conversation history under it. */
  sessionId: string
  /** 'ask' carries the player's words. 'event' carries a game or world event. */
  kind: 'ask' | 'event'
  text?: string
  event?: NarratorEventKind
  context: NarratorContext
}

/** Server-sent events on the stream endpoint. Each is one `data:` line of JSON. */
export type NarratorStreamEvent =
  | { type: 'delta'; text: string }
  /** The full text, and whether the narrator chose silence. Silent answers have empty text. */
  | { type: 'done'; text: string; silent: boolean; model?: string }
  | { type: 'error'; message: string; retryable: boolean }

export type NarratorBackendName = 'anthropic' | 'cli' | 'mock'

export interface NarratorHealth {
  ok: boolean
  backend: NarratorBackendName
  model: string
  detail?: string
}

export const NARRATOR_STREAM_PATH = '/api/narrator/stream'
export const NARRATOR_HEALTH_PATH = '/api/narrator/health'
export const NARRATOR_RESET_PATH = '/api/narrator/reset'

/**
 * The narrator may answer with silence. The system prompt tells the model that
 * its entire output is then one em dash. The server treats an output that is
 * empty, or only dashes (em, en, or hyphen) and whitespace, as silence and
 * sends { type: 'done', text: '', silent: true }. The panel then types the
 * world's silence mark (also an em dash) on its own line.
 */
export const SILENCE_TOKEN = '\u2014'
