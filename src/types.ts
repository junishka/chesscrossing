// Shared contracts. Every module imports from here. Nothing here imports three or the DOM.

// ───────────────────────────── Chess ─────────────────────────────
export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Square = `${File}${Rank}`

export interface PieceAt { type: PieceType; color: Color; square: Square }
export interface MoveInput { from: Square; to: Square; promotion?: PieceType }

export interface MoveRecord extends MoveInput {
  san: string
  lan: string
  color: Color
  piece: PieceType
  captured?: PieceType
  /** Square the captured piece stood on (differs from `to` on en passant). */
  capturedSquare?: Square
  isCheck: boolean
  isMate: boolean
  isCapture: boolean
  isCastleKing: boolean
  isCastleQueen: boolean
  isEnPassant: boolean
  isPromotion: boolean
  /** Rook path when castling. */
  rookFrom?: Square
  rookTo?: Square
  fenBefore: string
  fenAfter: string
  /** 1-based half-move index (1 = white's first move). */
  ply: number
  moveNumber: number
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2'
export type GameEndReason =
  | 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty-move'
  | 'resignation' | 'timeout' | 'agreement'

export interface GameStatus {
  fen: string
  turn: Color
  ply: number
  inCheck: boolean
  isGameOver: boolean
  result?: GameResult
  reason?: GameEndReason
}

/** Milliseconds remaining. `running` is whose clock is ticking, null when paused. */
export interface ClockState { w: number; b: number; running: Color | null; incrementMs: number }

export type EngineLevel = 1 | 2 | 3 | 4 | 5
export interface Opponent { kind: 'engine'; level: EngineLevel; name: string }
export interface GameSettings { playerColor: Color; opponent: Opponent; minutes: number; incrementSec: number }
export interface SavedGame { pgn: string; settings: GameSettings; clocks: ClockState; startedAt: number }

export type EngineRequest =
  | { id: number; type: 'search'; fen: string; timeMs: number; maxDepth?: number; level?: EngineLevel }
  | { id: number; type: 'eval'; fen: string; timeMs: number }
  | { id: number; type: 'perft'; fen: string; depth: number }
  | { type: 'stop' }

export interface EngineScore { scoreCp: number; mateIn?: number; depth: number; nodes: number; pv: string[]; timeMs: number }
export type EngineMessage =
  | ({ id: number; type: 'result'; move: MoveInput | null } & EngineScore)
  | ({ id: number; type: 'eval' } & EngineScore)
  | { id: number; type: 'perft'; nodes: number; timeMs: number }
  | { id: number; type: 'error'; message: string }

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

/** What the Second receives about the live position. Built by chess/analysis.ts. */
export interface PositionBrief {
  fen: string
  pgn: string
  turn: Color
  moveNumber: number
  ply: number
  playerColor: Color
  phase: GamePhase
  material: { w: number; b: number; diff: number; wPieces: string; bPieces: string }
  captured: { byWhite: PieceType[]; byBlack: PieceType[] }
  lastMoves: string[]
  inCheck: boolean
  /** Engine view from White's side, centipawns. */
  evalCp?: number
  mateIn?: number
  pv?: string[]
  hanging: { square: Square; piece: PieceType; color: Color }[]
  clocks?: ClockState
  status: GameStatus
  /** Plain-English one-liner, e.g. "Black just castled kingside." */
  narrative: string
}

// ───────────────────────────── World ─────────────────────────────
export type RegionId = 'boardroom' | 'house' | 'outside' | 'beyond'

export type Transition =
  | 'whip-left' | 'whip-right'
  | 'dolly-left' | 'dolly-right'
  | 'lift-up' | 'lift-down'
  | 'push-in' | 'pull-out'
  | 'cut'

export interface CameraStation {
  position: [number, number, number]
  target: [number, number, number]
  fov?: number
}

export type CardKind = 'index' | 'tag' | 'placard' | 'letter' | 'telegram' | 'label'
export interface CardDef { kind?: CardKind; title: string; body: string; footnote?: string }

export type HotspotKind = 'object' | 'door' | 'resident' | 'board' | 'egg'
export interface HotspotDef {
  id: string
  kind: HotspotKind
  /** Short label shown on hover, letterspaced caps. */
  label: string
  card?: CardDef
  /** Doors: destination frame id and how the camera gets there. */
  to?: string
  via?: Transition
  /** Egg id registered in content/eggs.ts (kind 'egg', or an object that also reveals one). */
  egg?: string
  /** Character id (kind 'resident'). */
  resident?: string
}

export interface FrameDef {
  id: string
  title: string
  region: RegionId
  /** Title card shown on first entry. */
  card?: { chapter?: string; title: string; subtitle?: string }
  camera: CameraStation
  hotspots: HotspotDef[]
  resident?: string
  /** Music theme id from audio/music.ts. */
  music?: string
  /** Letterbox ratio (e.g. 2.39, 1.85, 1.37). Undefined = none. */
  aspect?: number
}

export interface CharacterDef {
  id: string
  name: string
  role: string
  age?: string
  /** Frame id where they are found. */
  frame?: string
  voice: string
  sample: string[]
  systemPrompt: string
  greeting: string
  /** Topics declined in register. */
  refuses?: string[]
}

export interface EggDef {
  id: string
  title: string
  /** Frame id. */
  location: string
  trigger: string
  source?: string
  card?: CardDef
}

export type ChapterUnlock =
  | { kind: 'start' }
  | { kind: 'frame'; id: string }
  | { kind: 'eggs'; count: number }
  | { kind: 'games'; count: number }
  | { kind: 'win' }
  | { kind: 'converse'; id: string }

export interface ChapterDef { id: string; number: number; title: string; subtitle?: string; unlock: ChapterUnlock }

// ───────────────────────────── Conversation ─────────────────────────────
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ConverseRequest {
  personaId: string
  messages: ChatMessage[]
  /** Live context (position brief, world state) appended to the system prompt for this turn. */
  context?: string
  model?: string
}
export type ConverseEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; costUsd?: number; durationMs?: number }
  | { type: 'error'; message: string }
export interface Health { ok: boolean; cli: boolean; version?: string; model: string; reason?: string }

// ───────────────────────────── Persistence ─────────────────────────────
export interface Settings {
  sound: boolean
  music: boolean
  letterbox: boolean
  grain: boolean
  model: string
  playerName: string
}
export interface Ledger {
  version: 1
  chapters: string[]
  eggs: string[]
  visited: string[]
  inspected: string[]
  games: { played: number; won: number; lost: number; drawn: number }
  settings: Settings
  savedGame?: SavedGame
  conversations: Record<string, ChatMessage[]>
}

// ───────────────────────────── Events ─────────────────────────────
export type SfxName =
  | 'pickup' | 'place' | 'slide' | 'capture' | 'check' | 'mate' | 'castle' | 'promote'
  | 'tick' | 'flag' | 'whip' | 'dolly' | 'lift' | 'paper' | 'door' | 'bell' | 'typewriter'
  | 'hover' | 'select' | 'illegal' | 'record' | 'telephone' | 'drawer' | 'chime'

export type UiMode = 'title' | 'menu' | 'board' | 'world' | 'converse'

export interface Events {
  'game:new': { settings: GameSettings; fen: string }
  'game:move': { move: MoveRecord; status: GameStatus; byPlayer: boolean }
  'game:over': { status: GameStatus; result: GameResult; reason: GameEndReason }
  'game:clock': ClockState
  'game:thinking': { thinking: boolean }
  'game:select': { square: Square | null; legal: Square[] }
  'game:brief': PositionBrief
  'game:undo': { fen: string }
  'world:enter': { frame: string; via: Transition; from?: string }
  'world:inspect': { hotspot: HotspotDef; frame: string; first: boolean }
  'world:egg': { egg: EggDef; first: boolean }
  'chapter:unlock': { chapter: ChapterDef }
  'ui:card': { card: CardDef | null }
  'ui:title': { chapter?: string; title: string; subtitle?: string; holdMs?: number }
  'ui:mode': { mode: UiMode }
  'ui:toast': { text: string }
  'audio:sfx': { name: SfxName; velocity?: number }
  'audio:music': { theme: string | null }
  'settings:change': Settings
  'time:scale': { scale: number }
}
