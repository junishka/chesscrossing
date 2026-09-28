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
  | { id: number; type: 'search'; fen: string; timeMs: number; maxDepth?: number; level?: EngineLevel; /** Centipawn window for the randomised levels (overrides the level's fixed window). */ window?: number; /** Extra root lines by root-move exclusion (1 = best only). */ multiPv?: number; seed?: number }
  | { id: number; type: 'eval'; fen: string; timeMs: number }
  | { id: number; type: 'perft'; fen: string; depth: number }
  | { type: 'stop' }

export interface EngineScore { scoreCp: number; mateIn?: number; depth: number; nodes: number; pv: string[]; timeMs: number }
export type EngineMessage =
  | ({ id: number; type: 'result'; move: MoveInput | null; /** Alternative root lines when multiPv > 1, best first, excluding `move`. */ lines?: { move: MoveInput; scoreCp: number; mateIn?: number; pv: string[] }[] } & EngineScore)
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
  // Packet fields (docs/BIBLE.md 5.11). All optional; filled by the station layer.
  expedition?: number
  stationDate?: string
  seaState?: SeaState
  timeControl?: WatchId
  /** Alternative lines from multi-PV, best first. */
  alternatives?: { san: string; scoreCp: number }[]
  /** The chair's best reply if the player passed. */
  chairBestIfPass?: string
  /** Player's last three moves with the sounding change each caused (centipawns, from the player's side). */
  recentPlayerMoves?: { san: string; delta: number }[]
  book?: { eco: string; name: string; leftAtMove?: number }
  rating?: number
  record?: { played: number; won: number; lost: number; drawn: number }
  mode?: SecondMode
  question?: string
  /** Islet name for each of the last moves' destination squares. */
  islets?: string[]
}

export type SecondMode = 'FEEDBACK' | 'DISCUSSION' | 'POST-MORTEM' | 'REMARK'

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

export type CardKind = 'index' | 'tag' | 'placard' | 'letter' | 'telegram' | 'label' | 'typed'
export interface CardDef {
  kind?: CardKind
  title: string
  body: string
  footnote?: string
  /** Inventory tag painted on the object, e.g. HS-0001. */
  tag?: string
  /** Material and year line, e.g. "ebonised pear, brass, lacquer · 1931". */
  material?: string
}

export type HotspotKind = 'object' | 'door' | 'resident' | 'board' | 'egg' | 'insert' | 'action'

/** Conditions for a hotspot to be active; all given conditions must hold. */
export interface Requirement {
  chapter?: number
  warrant?: Warrant
  lowWater?: boolean
  /** Watch indices (0..5) during which the hotspot is active. */
  watches?: number[]
  gamesFinished?: number
}
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
  /** God's-eye insert (kind 'insert'): what is shown flat, and for how long. */
  insert?: { kind: string; holdMs?: number; lines?: string[]; title?: string }
  /** Action id handled by the station layer (kind 'action'), e.g. 'sit', 'barometer', 'lamp', 'cross', 'winch'. */
  action?: string
  requires?: Requirement
  /** Line typed into the ledger when this hotspot is used, e.g. "winch turned. nothing on the cable." */
  ledgerLine?: string
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
  /** Letterbox ratio (e.g. 2.40, 1.85). Undefined = none. */
  aspect?: number
  /** The one deliberate asymmetry in the frame (Law III). Never pointed at. */
  flaw?: string
  /** Focal length in mm at 35 mm gauge (Law: 40 room, 22 table, 80 chart, 35 profile, 135 telescope). */
  lens?: number
  /** Additional named camera stations in this frame (e.g. table, chart, profile, telescope1..3), relative to the frame origin. */
  stations?: Record<string, CameraStation>
  /** Locked until this chapter number. */
  lockedUntilChapter?: number
  /** Card shown on the locked door. */
  lockedCard?: CardDef
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

// ───────────────────────────── The Season (station time, tide, warrants) ─────────────────────────────
export type SeaState = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
/** Time controls: Dog 5+3, Middle 15+10, Long 30+0, none = untimed. */
export type WatchId = 'dog' | 'middle' | 'long' | 'none'
export type Warrant = 'king' | 'rook' | 'bishop'
export type BadgeId = 'PROVISIONAL' | 'VISITOR' | "RECORDER'S ASSISTANT" | 'SURVEYOR' | 'THIRTY-THIRD'
export interface CairnTag { square: Square; expedition: number; move: number; piece: PieceType; color: Color }

export interface Season {
  /** Day of September 1965, 1..30; 31 and beyond are October and after (the Appendix). */
  date: number
  /** Watch index 0..5: 04:00, 08:00, 12:00, 16:00, 20:00, 00:00. */
  watch: number
  /** Real seconds elapsed in the current watch (250 per watch). */
  watchElapsed: number
  /** Tide phase 0..1, 0 = low water. Period 25 min 50 s. */
  tide: number
  seaState: SeaState
  timeControl: WatchId
  /** Station rating; starts 1400, K = 24. */
  rating: number
  /** Games started this season. */
  expeditions: number
  warrants: Warrant[]
  badges: BadgeId[]
  platesRead: Square[]
  cairnTags: CairnTag[]
  /** Where the player stands on the grid, or null when ashore. */
  gridSquare: Square | null
  /** The 41. Kf3 postcard from Heron Head is being carried. */
  carriedCard: boolean
  /** Hotspot ids crated in Chapter Seven. */
  crated: string[]
  chapter: number
  ended: boolean
  lampLit: boolean
  /** Residents spoken to (character ids). */
  spokenTo: string[]
}

// ───────────────────────────── Conversation ─────────────────────────────
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ConverseRequest {
  personaId: string
  messages: ChatMessage[]
  mode?: SecondMode
  /** Live context (position brief, world state) appended to the system prompt for this turn. */
  context?: string
  model?: string
}
export type ConverseEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; costUsd?: number; durationMs?: number }
  | { type: 'error'; message: string }
export interface Health { ok: boolean; cli: boolean; version?: string; model: string; reason?: string }

// ───────────────────────────── The ledger roll ─────────────────────────────
export type LedgerRowKind = 'leader' | 'volume' | 'header' | 'move' | 'remark' | 'line' | 'crate' | 'result'
/** One row of the ruled roll. Moves carry the islet; remarks belong to the ply above them. */
export interface LedgerRow {
  kind: LedgerRowKind
  text: string
  ply?: number
  moveNumber?: number
  color?: Color
  san?: string
  islet?: string
  remark?: string
  expedition?: number
  /** FEN after this move, for rewinding the board by clicking the row. */
  fen?: string
}

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
  season: Season
  /** The roll, Vol. XIV, September 1965. */
  rows: LedgerRow[]
}

// ───────────────────────────── Events ─────────────────────────────
export type SfxName =
  // generic (kept for the UI and navigator)
  | 'pickup' | 'place' | 'slide' | 'capture' | 'check' | 'mate' | 'castle' | 'promote'
  | 'tick' | 'flag' | 'whip' | 'dolly' | 'lift' | 'paper' | 'door' | 'bell' | 'typewriter'
  | 'hover' | 'select' | 'illegal' | 'record' | 'telephone' | 'drawer' | 'chime'
  // the station's recipes (docs/BIBLE.md §10): pieces and davit
  | 'rise' | 'glide' | 'seat' | 'pin' | 'knight' | 'ratchet' | 'creak' | 'clamp' | 'hoist' | 'tray'
  // clock, ledger, board furniture
  | 'lever' | 'flagfall' | 'knock' | 'adjourn' | 'key' | 'marginbell' | 'carriage' | 'spares'
  // rooms and outside
  | 'floorboard' | 'shell' | 'lamp' | 'pulleys' | 'photo' | 'tidebell' | 'wind' | 'gull'

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
  'season:change': Season
  'tide:window': { crossable: boolean; secondsToChange: number }
  'grid:move': { from: Square | null; to: Square; warrant: Warrant }
  'warrant:grant': { warrant: Warrant }
  'badge:grant': { badge: BadgeId }
  /** A remark from the Second for the ledger's margin. */
  'ledger:remark': { ply: number; text: string }
  /** A non-move line on the roll: crates, cairns read, the winch. */
  'ledger:line': { text: string }
  /** The Tide Warden's reading, given to the camera. */
  'reading': { text: string; watch: number }
  'ui:insert': { kind: string; holdMs?: number; lines?: string[]; title?: string } | null
}
