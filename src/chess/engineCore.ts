// Chesscrossing's own chess engine. Pure and DOM-free: it runs in a Worker and in node tests.
//
// Board: 0x88 mailbox (Int8Array of 128). Piece code = type | (color << 3); white 1..6, black 9..14.
// Moves: packed ints (from | to << 7 | promo << 14 | captured << 17 | flag << 21).
// Search: iterative deepening negamax, alpha-beta with PVS, quiescence, MVV-LVA, killers, history,
// transposition table (Zobrist, 2^20 entries), check extension, null-move pruning, aspiration windows.
// Evaluation: PeSTO tapered piece-square tables plus pawn structure, bishop pair, rook files,
// king shelter and cheap mobility.

import type { EngineLevel, EngineMessage, MoveInput, PieceType, Square } from '../types'

// ───────────────────────────── Public types ─────────────────────────────

/**
 * Options for `search`.
 * `seed` and `window` only matter for the randomised levels 1 and 2: `window` (centipawns) overrides the
 * level's fixed 150 or 60, and the pick among the root moves inside it is uniform under `seed`.
 * `multiPv` (default 1) asks for `multiPv - 1` further root lines by root-move exclusion (BIBLE.md 5.3).
 */
export interface SearchOptions {
  timeMs: number
  maxDepth?: number
  level?: EngineLevel
  seed?: number
  window?: number
  multiPv?: number
}

/** One alternative root line, as carried by the `result` message in types.ts (score from White's point of view). */
export type SearchLine = NonNullable<Extract<EngineMessage, { type: 'result' }>['lines']>[number]

/** Result of `search`. Score and mateIn are from White's point of view; mateIn counts moves, not plies. */
export interface SearchResult {
  move: MoveInput | null
  scoreCp: number
  mateIn?: number
  depth: number
  nodes: number
  pv: string[]
  timeMs: number
  /** Alternative root lines when `multiPv > 1`, best first, never including `move`. Absent when none were asked for. */
  lines?: SearchLine[]
}

/** Seed used when a randomised search names none, so a bare call is reproducible. */
export const DEFAULT_SEED = 1

/** Share of the main search's budget given to each multi-PV re-search (BIBLE.md 5.3: 40 percent). */
export const MULTI_PV_SHARE = 0.4

/** Most root moves a multi-PV search may exclude: `multiPv` is clamped to this plus one. */
export const MAX_EXCLUDED = 8

// ───────────────────────────── Constants ─────────────────────────────

const EMPTY = 0
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6
const WHITE = 0, BLACK = 1

const MAX_PLY = 64
const MAX_DEPTH = 40
const MOVES_PER_PLY = 256
const INF = 32000
const MATE = 30000
const MATE_BOUND = MATE - 2 * MAX_PLY

const FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DOUBLE = 3

const TT_SIZE = 1 << 20
const TT_MASK = TT_SIZE - 1
const TT_EXACT = 1, TT_ALPHA = 2, TT_BETA = 3

const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33]
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17]
const BISHOP_DIRS = [-17, -15, 15, 17]
const ROOK_DIRS = [-16, -1, 1, 16]

const A1 = 0x00, B1 = 0x01, C1 = 0x02, D1 = 0x03, E1 = 0x04, F1 = 0x05, G1 = 0x06, H1 = 0x07
const A8 = 0x70, B8 = 0x71, C8 = 0x72, D8 = 0x73, E8 = 0x74, F8 = 0x75, G8 = 0x76, H8 = 0x77

const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8

/** Material values by type index, used for ordering and delta pruning. */
const VALUE = [0, 100, 320, 330, 500, 900, 20000]

const PIECE_CHARS = ' pnbrqk'
const PIECE_TYPES: PieceType[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k']

// ───────────────────────────── PeSTO tables ─────────────────────────────
// Listed rank 8 first (index 0 = a8), as published; mirrored per colour below.

const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0]
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0]
const PHASE_INC = [0, 0, 1, 1, 2, 4, 0]
const PHASE_TOTAL = 24

const MG_PST: number[][] = [
  [],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14, 13, 6, 21, 23, 12, 17, -23,
    -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12, -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0 ],
  [ -167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22,
    -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23 ],
  [ -29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2, -4, 5, 19, 50, 37, 37, 7, -2,
    -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21 ],
  [ 32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16, -24, -11, 7, 26, 24, 35, -8, -20,
    -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26 ],
  [ -28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57, -27, -27, -16, -16, -1, 17, -2, 1,
    -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50 ],
  [ -65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22, -17, -20, -12, -27, -30, -25, -14, -36,
    -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14 ],
]

const EG_PST: number[][] = [
  [],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84, 32, 24, 13, 5, -2, 4, 17, 17,
    13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0 ],
  [ -58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18,
    -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64 ],
  [ -14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4, -3, 9, 12, 9, 14, 10, 3, 2,
    -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15, -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17 ],
  [ 13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13, 1, 2, 1, -1, 2,
    3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20 ],
  [ -9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9, 3, 22, 24, 45, 57, 40, 57, 36,
    -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5, -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41 ],
  [ -74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13, -8, 22, 24, 27, 26, 33, 26, 3,
    -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43 ],
]

/** Flat tapered tables indexed by piece code * 128 + square, material included. */
const MG = new Int16Array(16 * 128)
const EG = new Int16Array(16 * 128)
for (let c = 0; c < 2; c++) {
  for (let t = PAWN; t <= KING; t++) {
    const code = t | (c << 3)
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue
      const f = sq & 7, r = sq >> 4
      const idx = c === WHITE ? (7 - r) * 8 + f : r * 8 + f
      MG[code * 128 + sq] = MG_VALUE[t] + MG_PST[t][idx]
      EG[code * 128 + sq] = EG_VALUE[t] + EG_PST[t][idx]
    }
  }
}

// Evaluation terms beyond the tables (mg, eg).
const DOUBLED_MG = -10, DOUBLED_EG = -20
const ISOLATED_MG = -12, ISOLATED_EG = -15
const PASSED_MG = [0, 5, 10, 20, 35, 60, 100, 0]
const PASSED_EG = [0, 12, 22, 40, 70, 120, 200, 0]
const BISHOP_PAIR_MG = 30, BISHOP_PAIR_EG = 45
const ROOK_OPEN_MG = 22, ROOK_OPEN_EG = 10
const ROOK_SEMI_MG = 10, ROOK_SEMI_EG = 5
const SHIELD_NEAR = 9, SHIELD_FAR = 4
const KING_SEMI_FILE = -12, KING_OPEN_FILE = -8
const MOB_MG = [0, 0, 3, 3, 2, 1, 0]
const MOB_EG = [0, 0, 3, 3, 4, 2, 0]

// ───────────────────────────── Zobrist keys ─────────────────────────────

let rngState = 0x9e3779b9
function rand32(): number {
  let x = rngState
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5
  rngState = x
  return x | 0
}
const ZOB_LO = new Int32Array(16 * 128)
const ZOB_HI = new Int32Array(16 * 128)
const ZOB_CASTLE_LO = new Int32Array(16)
const ZOB_CASTLE_HI = new Int32Array(16)
const ZOB_EP_LO = new Int32Array(8)
const ZOB_EP_HI = new Int32Array(8)
for (let i = 0; i < ZOB_LO.length; i++) { ZOB_LO[i] = rand32(); ZOB_HI[i] = rand32() }
for (let i = 0; i < 16; i++) { ZOB_CASTLE_LO[i] = rand32(); ZOB_CASTLE_HI[i] = rand32() }
for (let i = 0; i < 8; i++) { ZOB_EP_LO[i] = rand32(); ZOB_EP_HI[i] = rand32() }
const ZOB_SIDE_LO = rand32()
const ZOB_SIDE_HI = rand32()

/** Castling rights that survive a piece leaving or arriving on each square. */
const CASTLE_MASK = new Int8Array(128).fill(15)
CASTLE_MASK[E1] = 15 & ~(CASTLE_WK | CASTLE_WQ)
CASTLE_MASK[H1] = 15 & ~CASTLE_WK
CASTLE_MASK[A1] = 15 & ~CASTLE_WQ
CASTLE_MASK[E8] = 15 & ~(CASTLE_BK | CASTLE_BQ)
CASTLE_MASK[H8] = 15 & ~CASTLE_BK
CASTLE_MASK[A8] = 15 & ~CASTLE_BQ

// ───────────────────────────── Position ─────────────────────────────

const board = new Int8Array(128)
const kings = new Int32Array(2)
const pieceCount = new Int32Array(16)
const mg = new Int32Array(2)
const eg = new Int32Array(2)
let side = WHITE
let castle = 0
let ep = -1
let half = 0
let full = 1
let phase = 0
let hashLo = 0
let hashHi = 0

// Undo stack, one slot per ply of make().
const UNDO_STRIDE = 10
const undo = new Int32Array(MAX_PLY * 2 * UNDO_STRIDE)
let undoLen = 0
// Position history for repetition detection (index 0 = root).
const histLo = new Int32Array(MAX_PLY * 2 + 1)
const histHi = new Int32Array(MAX_PLY * 2 + 1)
let histLen = 0

const mvFrom = (m: number): number => m & 0x7f
const mvTo = (m: number): number => (m >> 7) & 0x7f
const mvPromo = (m: number): number => (m >> 14) & 7
const mvCaptured = (m: number): number => (m >> 17) & 0xf
const mvFlag = (m: number): number => (m >> 21) & 3
const encode = (from: number, to: number, promo: number, captured: number, flag: number): number =>
  from | (to << 7) | (promo << 14) | (captured << 17) | (flag << 21)

const colorOf = (p: number): number => p >> 3
const typeOf = (p: number): number => p & 7
const pawnDir = (c: number): number => (c === WHITE ? 16 : -16)

function placePiece(sq: number, code: number): void {
  board[sq] = code
  const c = colorOf(code), i = code * 128 + sq
  mg[c] += MG[i]; eg[c] += EG[i]
  phase += PHASE_INC[typeOf(code)]
  pieceCount[code]++
  hashLo ^= ZOB_LO[i]; hashHi ^= ZOB_HI[i]
  if (typeOf(code) === KING) kings[c] = sq
}

function removePiece(sq: number): void {
  const code = board[sq]
  board[sq] = EMPTY
  const c = colorOf(code), i = code * 128 + sq
  mg[c] -= MG[i]; eg[c] -= EG[i]
  phase -= PHASE_INC[typeOf(code)]
  pieceCount[code]--
  hashLo ^= ZOB_LO[i]; hashHi ^= ZOB_HI[i]
}

function squareIndex(name: string): number {
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97)
}

function squareName(sq: number): Square {
  return (String.fromCharCode(97 + (sq & 7)) + String.fromCharCode(49 + (sq >> 4))) as Square
}

function pieceCodeFromChar(ch: string): number {
  const t = PIECE_CHARS.indexOf(ch.toLowerCase())
  if (t <= 0) throw new Error(`bad piece "${ch}"`)
  return t | ((ch === ch.toLowerCase() ? BLACK : WHITE) << 3)
}

/** Loads a FEN into the module-level position and recomputes hash and evaluation terms. */
function setFen(fen: string): void {
  board.fill(EMPTY); pieceCount.fill(0); mg.fill(0); eg.fill(0)
  phase = 0; hashLo = 0; hashHi = 0; kings[0] = -1; kings[1] = -1
  const parts = fen.trim().split(/\s+/)
  const rows = (parts[0] ?? '').split('/')
  if (rows.length !== 8) throw new Error(`bad FEN "${fen}"`)
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i
    let file = 0
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') { file += ch.charCodeAt(0) - 48; continue }
      if (file > 7) throw new Error(`bad FEN rank "${rows[i]}"`)
      placePiece(rank * 16 + file, pieceCodeFromChar(ch))
      file++
    }
    if (file !== 8) throw new Error(`bad FEN rank "${rows[i]}"`)
  }
  if (kings[0] < 0 || kings[1] < 0) throw new Error('FEN needs both kings')
  side = parts[1] === 'b' ? BLACK : WHITE
  castle = 0
  const rights = parts[2] ?? '-'
  if (rights.includes('K')) castle |= CASTLE_WK
  if (rights.includes('Q')) castle |= CASTLE_WQ
  if (rights.includes('k')) castle |= CASTLE_BK
  if (rights.includes('q')) castle |= CASTLE_BQ
  ep = parts[3] && parts[3] !== '-' ? squareIndex(parts[3]) : -1
  half = Number.parseInt(parts[4] ?? '0', 10) || 0
  full = Number.parseInt(parts[5] ?? '1', 10) || 1
  hashLo ^= ZOB_CASTLE_LO[castle]; hashHi ^= ZOB_CASTLE_HI[castle]
  if (ep >= 0) { hashLo ^= ZOB_EP_LO[ep & 7]; hashHi ^= ZOB_EP_HI[ep & 7] }
  if (side === BLACK) { hashLo ^= ZOB_SIDE_LO; hashHi ^= ZOB_SIDE_HI }
  undoLen = 0
  histLen = 0
  histLo[histLen] = hashLo; histHi[histLen] = hashHi; histLen++
}

// ───────────────────────────── Attacks ─────────────────────────────

/** True when `sq` is attacked by any piece of colour `by`. */
function isAttacked(sq: number, by: number): boolean {
  const pawn = PAWN | (by << 3)
  if (by === WHITE) {
    if (!((sq - 15) & 0x88) && board[sq - 15] === pawn) return true
    if (!((sq - 17) & 0x88) && board[sq - 17] === pawn) return true
  } else {
    if (!((sq + 15) & 0x88) && board[sq + 15] === pawn) return true
    if (!((sq + 17) & 0x88) && board[sq + 17] === pawn) return true
  }
  const knight = KNIGHT | (by << 3)
  for (let i = 0; i < 8; i++) {
    const to = sq + KNIGHT_OFFSETS[i]
    if (!(to & 0x88) && board[to] === knight) return true
  }
  const king = KING | (by << 3)
  for (let i = 0; i < 8; i++) {
    const to = sq + KING_OFFSETS[i]
    if (!(to & 0x88) && board[to] === king) return true
  }
  const bishop = BISHOP | (by << 3), rook = ROOK | (by << 3), queen = QUEEN | (by << 3)
  for (let i = 0; i < 4; i++) {
    const d = BISHOP_DIRS[i]
    for (let to = sq + d; !(to & 0x88); to += d) {
      const p = board[to]
      if (p) { if (p === bishop || p === queen) return true; break }
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = ROOK_DIRS[i]
    for (let to = sq + d; !(to & 0x88); to += d) {
      const p = board[to]
      if (p) { if (p === rook || p === queen) return true; break }
    }
  }
  return false
}

const inCheckNow = (): boolean => isAttacked(kings[side], side ^ 1)

// ───────────────────────────── Make / unmake ─────────────────────────────

function pushUndo(captured: number): void {
  const u = undoLen * UNDO_STRIDE
  undo[u] = castle; undo[u + 1] = ep; undo[u + 2] = half
  undo[u + 3] = hashLo; undo[u + 4] = hashHi
  undo[u + 5] = mg[0]; undo[u + 6] = mg[1]; undo[u + 7] = eg[0]; undo[u + 8] = eg[1]
  undo[u + 9] = captured
  undoLen++
}

function popUndo(): void {
  undoLen--
  const u = undoLen * UNDO_STRIDE
  castle = undo[u]; ep = undo[u + 1]; half = undo[u + 2]
  hashLo = undo[u + 3]; hashHi = undo[u + 4]
  mg[0] = undo[u + 5]; mg[1] = undo[u + 6]; eg[0] = undo[u + 7]; eg[1] = undo[u + 8]
  histLen--
}

/** Plays a pseudo-legal move. Legality (own king safety) is checked by the caller afterwards. */
function make(m: number): void {
  pushUndo(0)
  const from = mvFrom(m), to = mvTo(m), promo = mvPromo(m), captured = mvCaptured(m), flag = mvFlag(m)
  const us = side, them = us ^ 1
  const piece = board[from]
  hashLo ^= ZOB_CASTLE_LO[castle]; hashHi ^= ZOB_CASTLE_HI[castle]
  if (ep >= 0) { hashLo ^= ZOB_EP_LO[ep & 7]; hashHi ^= ZOB_EP_HI[ep & 7] }
  if (captured) removePiece(flag === FLAG_EP ? to - pawnDir(us) : to)
  removePiece(from)
  placePiece(to, promo ? promo | (us << 3) : piece)
  if (flag === FLAG_CASTLE) {
    if (to > from) { const r = board[to + 1]; removePiece(to + 1); placePiece(to - 1, r) }
    else { const r = board[to - 2]; removePiece(to - 2); placePiece(to + 1, r) }
  }
  ep = flag === FLAG_DOUBLE ? from + pawnDir(us) : -1
  if (ep >= 0) { hashLo ^= ZOB_EP_LO[ep & 7]; hashHi ^= ZOB_EP_HI[ep & 7] }
  castle &= CASTLE_MASK[from] & CASTLE_MASK[to]
  hashLo ^= ZOB_CASTLE_LO[castle]; hashHi ^= ZOB_CASTLE_HI[castle]
  half = captured || typeOf(piece) === PAWN ? 0 : half + 1
  if (us === BLACK) full++
  side = them
  hashLo ^= ZOB_SIDE_LO; hashHi ^= ZOB_SIDE_HI
  histLo[histLen] = hashLo; histHi[histLen] = hashHi; histLen++
}

/** Reverses `make(m)`. Board edits are direct; hash and evaluation are restored from the undo stack. */
function unmake(m: number): void {
  side ^= 1
  const us = side
  const from = mvFrom(m), to = mvTo(m), promo = mvPromo(m), captured = mvCaptured(m), flag = mvFlag(m)
  const moved = board[to]
  const piece = promo ? PAWN | (us << 3) : moved
  if (promo) { pieceCount[moved]--; pieceCount[piece]++; phase -= PHASE_INC[promo] }
  board[from] = piece
  board[to] = EMPTY
  if (captured) {
    board[flag === FLAG_EP ? to - pawnDir(us) : to] = captured
    pieceCount[captured]++
    phase += PHASE_INC[typeOf(captured)]
  }
  if (flag === FLAG_CASTLE) {
    if (to > from) { board[to + 1] = board[to - 1]; board[to - 1] = EMPTY }
    else { board[to - 2] = board[to + 1]; board[to + 1] = EMPTY }
  }
  if (typeOf(piece) === KING) kings[us] = from
  if (us === BLACK) full--
  popUndo()
}

function makeNull(): void {
  pushUndo(0)
  if (ep >= 0) { hashLo ^= ZOB_EP_LO[ep & 7]; hashHi ^= ZOB_EP_HI[ep & 7] }
  ep = -1
  side ^= 1
  hashLo ^= ZOB_SIDE_LO; hashHi ^= ZOB_SIDE_HI
  histLo[histLen] = hashLo; histHi[histLen] = hashHi; histLen++
}

function unmakeNull(): void {
  side ^= 1
  popUndo()
}

// ───────────────────────────── Move generation ─────────────────────────────

const moves = new Int32Array(MAX_PLY * 2 * MOVES_PER_PLY)
const moveScores = new Int32Array(MAX_PLY * 2 * MOVES_PER_PLY)

function addPawnMoves(n: number, from: number, to: number, captured: number, flag: number, promoting: boolean): number {
  if (promoting) {
    moves[n++] = encode(from, to, QUEEN, captured, 0)
    moves[n++] = encode(from, to, ROOK, captured, 0)
    moves[n++] = encode(from, to, BISHOP, captured, 0)
    moves[n++] = encode(from, to, KNIGHT, captured, 0)
    return n
  }
  moves[n++] = encode(from, to, 0, captured, flag)
  return n
}

function genPawn(n: number, sq: number, us: number, capturesOnly: boolean): number {
  const them = us ^ 1
  const dir = pawnDir(us)
  const rank = sq >> 4
  const promoting = us === WHITE ? rank === 6 : rank === 1
  const startRank = us === WHITE ? 1 : 6
  const to = sq + dir
  if (to & 0x88) return n   // pawn on its last rank: only reachable from a malformed FEN
  if (!board[to]) {
    if (promoting) n = addPawnMoves(n, sq, to, 0, 0, true)
    else if (!capturesOnly) {
      n = addPawnMoves(n, sq, to, 0, 0, false)
      if (rank === startRank && !board[to + dir]) n = addPawnMoves(n, sq, to + dir, 0, FLAG_DOUBLE, false)
    }
  }
  for (let d = -1; d <= 1; d += 2) {
    const c = to + d
    if (c & 0x88) continue
    const q = board[c]
    if (q) { if (colorOf(q) === them) n = addPawnMoves(n, sq, c, q, 0, promoting) }
    else if (c === ep) n = addPawnMoves(n, sq, c, PAWN | (them << 3), FLAG_EP, false)
  }
  return n
}

function genSteps(n: number, sq: number, us: number, offsets: number[], capturesOnly: boolean): number {
  for (let i = 0; i < 8; i++) {
    const to = sq + offsets[i]
    if (to & 0x88) continue
    const q = board[to]
    if (!q) { if (!capturesOnly) moves[n++] = encode(sq, to, 0, 0, 0) }
    else if (colorOf(q) !== us) moves[n++] = encode(sq, to, 0, q, 0)
  }
  return n
}

function genSlides(n: number, sq: number, us: number, dirs: number[], capturesOnly: boolean): number {
  for (let i = 0; i < 4; i++) {
    const d = dirs[i]
    for (let to = sq + d; !(to & 0x88); to += d) {
      const q = board[to]
      if (!q) { if (!capturesOnly) moves[n++] = encode(sq, to, 0, 0, 0); continue }
      if (colorOf(q) !== us) moves[n++] = encode(sq, to, 0, q, 0)
      break
    }
  }
  return n
}

function genCastling(n: number, us: number): number {
  const them = us ^ 1
  if (us === WHITE) {
    if (castle & CASTLE_WK && !board[F1] && !board[G1] && !isAttacked(E1, them) && !isAttacked(F1, them))
      moves[n++] = encode(E1, G1, 0, 0, FLAG_CASTLE)
    if (castle & CASTLE_WQ && !board[D1] && !board[C1] && !board[B1] && !isAttacked(E1, them) && !isAttacked(D1, them))
      moves[n++] = encode(E1, C1, 0, 0, FLAG_CASTLE)
  } else {
    if (castle & CASTLE_BK && !board[F8] && !board[G8] && !isAttacked(E8, them) && !isAttacked(F8, them))
      moves[n++] = encode(E8, G8, 0, 0, FLAG_CASTLE)
    if (castle & CASTLE_BQ && !board[D8] && !board[C8] && !board[B8] && !isAttacked(E8, them) && !isAttacked(D8, them))
      moves[n++] = encode(E8, C8, 0, 0, FLAG_CASTLE)
  }
  return n
}

/** Writes pseudo-legal moves for the side to move into `moves` from `start`; returns the end index. */
function generate(start: number, capturesOnly: boolean): number {
  let n = start
  const us = side
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue }
    const p = board[sq]
    if (!p || colorOf(p) !== us) continue
    switch (typeOf(p)) {
      case PAWN: n = genPawn(n, sq, us, capturesOnly); break
      case KNIGHT: n = genSteps(n, sq, us, KNIGHT_OFFSETS, capturesOnly); break
      case BISHOP: n = genSlides(n, sq, us, BISHOP_DIRS, capturesOnly); break
      case ROOK: n = genSlides(n, sq, us, ROOK_DIRS, capturesOnly); break
      case QUEEN: n = genSlides(genSlides(n, sq, us, BISHOP_DIRS, capturesOnly), sq, us, ROOK_DIRS, capturesOnly); break
      case KING:
        n = genSteps(n, sq, us, KING_OFFSETS, capturesOnly)
        if (!capturesOnly) n = genCastling(n, us)
        break
    }
  }
  return n
}

/** Makes `m`; returns false (after unmaking) when it leaves the mover's king in check. */
function tryMake(m: number): boolean {
  make(m)
  if (isAttacked(kings[side ^ 1], side)) { unmake(m); return false }
  return true
}

// ───────────────────────────── Evaluation ─────────────────────────────

const pawnFiles = new Int32Array(2 * 8)
const pawnMaxRank = new Int32Array(8)   // black pawns: highest rank per file
const pawnMinRank = new Int32Array(8)   // white pawns: lowest rank per file

function mobilityCount(sq: number, t: number, us: number): number {
  let count = 0
  if (t === KNIGHT) {
    for (let i = 0; i < 8; i++) {
      const to = sq + KNIGHT_OFFSETS[i]
      if (!(to & 0x88) && (!board[to] || colorOf(board[to]) !== us)) count++
    }
    return count
  }
  if (t !== ROOK) count += rayCount(sq, BISHOP_DIRS, us)
  if (t !== BISHOP) count += rayCount(sq, ROOK_DIRS, us)
  return count
}

function rayCount(sq: number, dirs: number[], us: number): number {
  let count = 0
  for (let i = 0; i < 4; i++) {
    const d = dirs[i]
    for (let to = sq + d; !(to & 0x88); to += d) {
      const q = board[to]
      if (!q) { count++; continue }
      if (colorOf(q) !== us) count++
      break
    }
  }
  return count
}

function kingShelter(c: number): number {
  const k = kings[c]
  const r = k >> 4, f = k & 7
  const home = c === WHITE ? r <= 1 : r >= 6
  let score = 0
  const ownPawn = PAWN | (c << 3)
  const fwd = pawnDir(c)
  for (let df = -1; df <= 1; df++) {
    const file = f + df
    if (file < 0 || file > 7) continue
    if (home) {
      const near = k + fwd + df, far = k + 2 * fwd + df
      if (!(near & 0x88) && board[near] === ownPawn) score += SHIELD_NEAR
      if (!(far & 0x88) && board[far] === ownPawn) score += SHIELD_FAR
    }
    if (pawnFiles[c * 8 + file] === 0) {
      score += KING_SEMI_FILE
      if (pawnFiles[(c ^ 1) * 8 + file] === 0) score += KING_OPEN_FILE
    }
  }
  return score
}

// Scratch outputs of pawnStructure (avoids allocating a tuple per pawn at every evaluated node).
let psMg = 0, psEg = 0

function pawnStructure(sq: number, c: number): void {
  const f = sq & 7, r = sq >> 4
  let sMg = 0, sEg = 0
  const own = c * 8
  if (pawnFiles[own + f] > 1) { sMg += DOUBLED_MG; sEg += DOUBLED_EG }
  const leftOwn = f > 0 ? pawnFiles[own + f - 1] : 0
  const rightOwn = f < 7 ? pawnFiles[own + f + 1] : 0
  if (leftOwn === 0 && rightOwn === 0) { sMg += ISOLATED_MG; sEg += ISOLATED_EG }
  let passed = true
  for (let df = -1; df <= 1 && passed; df++) {
    const file = f + df
    if (file < 0 || file > 7) continue
    if (c === WHITE ? pawnMaxRank[file] > r : pawnMinRank[file] < r) passed = false
  }
  if (passed) {
    const rel = c === WHITE ? r : 7 - r
    sMg += PASSED_MG[rel]; sEg += PASSED_EG[rel]
  }
  psMg = sMg; psEg = sEg
}

/** King + at most one minor piece each, no pawns, rooks or queens: no mate is possible. */
function insufficientMaterial(): boolean {
  if (pieceCount[PAWN] | pieceCount[PAWN | 8] | pieceCount[ROOK] | pieceCount[ROOK | 8] | pieceCount[QUEEN] | pieceCount[QUEEN | 8]) return false
  return pieceCount[KNIGHT] + pieceCount[BISHOP] <= 1 && pieceCount[KNIGHT | 8] + pieceCount[BISHOP | 8] <= 1
}

/** Static evaluation from the side to move's point of view, in centipawns. */
function evaluate(): number {
  if (insufficientMaterial()) return 0
  pawnFiles.fill(0)
  pawnMaxRank.fill(-1)
  pawnMinRank.fill(8)
  let mgW = mg[WHITE] - mg[BLACK]
  let egW = eg[WHITE] - eg[BLACK]
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue }
    const p = board[sq]
    if (typeOf(p) !== PAWN) continue
    const f = sq & 7, r = sq >> 4
    if (colorOf(p) === WHITE) { pawnFiles[f]++; if (r < pawnMinRank[f]) pawnMinRank[f] = r }
    else { pawnFiles[8 + f]++; if (r > pawnMaxRank[f]) pawnMaxRank[f] = r }
  }
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue }
    const p = board[sq]
    if (!p) continue
    const c = colorOf(p), t = typeOf(p), sign = c === WHITE ? 1 : -1
    if (t === PAWN) {
      pawnStructure(sq, c)
      mgW += sign * psMg; egW += sign * psEg
    } else if (t === ROOK) {
      const f = sq & 7
      if (pawnFiles[c * 8 + f] === 0) {
        const open = pawnFiles[(c ^ 1) * 8 + f] === 0
        mgW += sign * (open ? ROOK_OPEN_MG : ROOK_SEMI_MG)
        egW += sign * (open ? ROOK_OPEN_EG : ROOK_SEMI_EG)
      }
      const mob = mobilityCount(sq, t, c)
      mgW += sign * mob * MOB_MG[t]; egW += sign * mob * MOB_EG[t]
    } else if (t !== KING) {
      const mob = mobilityCount(sq, t, c)
      mgW += sign * mob * MOB_MG[t]; egW += sign * mob * MOB_EG[t]
    }
  }
  if (pieceCount[BISHOP] >= 2) { mgW += BISHOP_PAIR_MG; egW += BISHOP_PAIR_EG }
  if (pieceCount[BISHOP | 8] >= 2) { mgW -= BISHOP_PAIR_MG; egW -= BISHOP_PAIR_EG }
  mgW += kingShelter(WHITE) - kingShelter(BLACK)
  const mgPhase = phase > PHASE_TOTAL ? PHASE_TOTAL : phase
  const score = ((mgW * mgPhase + egW * (PHASE_TOTAL - mgPhase)) / PHASE_TOTAL) | 0
  return side === WHITE ? score : -score
}

function hasNonPawnMaterial(c: number): boolean {
  const b = c << 3
  return pieceCount[KNIGHT | b] + pieceCount[BISHOP | b] + pieceCount[ROOK | b] + pieceCount[QUEEN | b] > 0
}

// ───────────────────────────── Transposition table ─────────────────────────────

const ttKey = new Int32Array(TT_SIZE)
const ttMove = new Int32Array(TT_SIZE)
const ttScore = new Int32Array(TT_SIZE)
const ttDepth = new Int8Array(TT_SIZE)
const ttFlag = new Int8Array(TT_SIZE)

function ttStore(idx: number, move: number, score: number, depth: number, flag: number, ply: number): void {
  if (score > MATE_BOUND) score += ply
  else if (score < -MATE_BOUND) score -= ply
  ttKey[idx] = hashHi; ttMove[idx] = move; ttScore[idx] = score; ttDepth[idx] = depth; ttFlag[idx] = flag
}

function ttScoreAt(idx: number, ply: number): number {
  const s = ttScore[idx]
  if (s > MATE_BOUND) return s - ply
  if (s < -MATE_BOUND) return s + ply
  return s
}

// ───────────────────────────── Search state ─────────────────────────────

const killers = new Int32Array(MAX_PLY * 2)
const history = new Int32Array(2 * 128 * 128)
const pvTable = new Int32Array(MAX_PLY * MAX_PLY)
const pvLen = new Int32Array(MAX_PLY)

let nodes = 0
let deadline = 0
let abortable = false
let aborted = false
let stopRequested = false

/** Root moves the current search must not play (multi-PV by exclusion). Only consulted at ply 0. */
const excluded = new Int32Array(MAX_EXCLUDED)
let excludedCount = 0

function isExcluded(m: number): boolean {
  for (let i = 0; i < excludedCount; i++) if (excluded[i] === m) return true
  return false
}

const now = (): number => performance.now()

function checkTime(): void {
  if (abortable && (stopRequested || now() >= deadline)) aborted = true
}

function resetSearchTables(): void {
  killers.fill(0); history.fill(0); pvLen.fill(0)
  nodes = 0; aborted = false
}

function updatePv(ply: number, m: number): void {
  pvTable[ply * MAX_PLY + ply] = m
  const childLen = pvLen[ply + 1]
  for (let i = ply + 1; i < childLen; i++) pvTable[ply * MAX_PLY + i] = pvTable[(ply + 1) * MAX_PLY + i]
  pvLen[ply] = childLen > ply + 1 ? childLen : ply + 1
}

function isRepetition(): boolean {
  const cur = histLen - 1
  const floor = cur - half < 0 ? 0 : cur - half
  for (let i = cur - 2; i >= floor; i -= 2) {
    if (histLo[i] === hashLo && histHi[i] === hashHi) return true
  }
  return false
}

function captureScore(m: number): number {
  const victim = typeOf(mvCaptured(m))
  const attacker = typeOf(board[mvFrom(m)])
  return 100000 + VALUE[victim] * 10 - attacker
}

function scoreMoves(start: number, end: number, ply: number, ttMv: number): void {
  const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1]
  for (let i = start; i < end; i++) {
    const m = moves[i]
    let s: number
    if (m === ttMv) s = 2000000
    else if (mvCaptured(m)) s = captureScore(m) + (mvPromo(m) === QUEEN ? 5000 : 0)
    else if (mvPromo(m)) s = mvPromo(m) === QUEEN ? 105000 : 50000
    else if (m === k1) s = 90000
    else if (m === k2) s = 89000
    else {
      const h = history[(side << 14) | (mvFrom(m) << 7) | mvTo(m)]
      s = h > 88000 ? 88000 : h
    }
    moveScores[i] = s
  }
}

/** Selection sort step: swaps the best-scored remaining move into slot `i`. */
function pickMove(i: number, end: number): number {
  let best = i
  for (let j = i + 1; j < end; j++) if (moveScores[j] > moveScores[best]) best = j
  if (best !== i) {
    const m = moves[i], s = moveScores[i]
    moves[i] = moves[best]; moveScores[i] = moveScores[best]
    moves[best] = m; moveScores[best] = s
  }
  return moves[i]
}

function recordCutoff(m: number, ply: number, depth: number): void {
  if (mvCaptured(m) || mvPromo(m)) return
  const k = ply * 2
  if (killers[k] !== m) { killers[k + 1] = killers[k]; killers[k] = m }
  const h = (side << 14) | (mvFrom(m) << 7) | mvTo(m)
  history[h] += depth * depth
  if (history[h] > 60000) for (let i = 0; i < history.length; i++) history[i] >>= 1
}

// ───────────────────────────── Quiescence ─────────────────────────────

function quiescence(alpha: number, beta: number, ply: number): number {
  nodes++
  if ((nodes & 2047) === 0) checkTime()
  pvLen[ply] = ply
  if (ply >= MAX_PLY - 1) return evaluate()
  const inCheck = inCheckNow()
  let best = -INF
  let stand = 0
  if (!inCheck) {
    stand = evaluate()
    if (stand >= beta) return stand
    if (stand > alpha) alpha = stand
    best = stand
  }
  const start = ply * MOVES_PER_PLY
  const end = generate(start, !inCheck)
  scoreMoves(start, end, ply, 0)
  let legal = 0
  for (let i = start; i < end; i++) {
    const m = pickMove(i, end)
    if (!inCheck && mvCaptured(m) && !mvPromo(m) && stand + VALUE[typeOf(mvCaptured(m))] + 200 < alpha) continue
    if (!tryMake(m)) continue
    legal++
    const score = -quiescence(-beta, -alpha, ply + 1)
    unmake(m)
    if (aborted) return 0
    if (score > best) {
      best = score
      if (score > alpha) {
        alpha = score
        updatePv(ply, m)
        if (score >= beta) return score
      }
    }
  }
  if (inCheck && legal === 0) return -MATE + ply
  return best
}

// ───────────────────────────── Negamax ─────────────────────────────

function negamax(alpha: number, beta: number, depth: number, ply: number, allowNull: boolean): number {
  pvLen[ply] = ply
  if (ply > 0) {
    if (half >= 100 || isRepetition()) return 0
    const mateLo = -MATE + ply, mateHi = MATE - ply - 1
    if (alpha < mateLo) alpha = mateLo
    if (beta > mateHi) beta = mateHi
    if (alpha >= beta) return alpha
  }
  const inCheck = inCheckNow()
  if (inCheck) depth++
  if (depth <= 0) return quiescence(alpha, beta, ply)
  nodes++
  if ((nodes & 2047) === 0) checkTime()
  if (ply >= MAX_PLY - 1) return evaluate()

  const idx = hashLo & TT_MASK
  const ttHit = ttFlag[idx] !== 0 && ttKey[idx] === hashHi
  const ttMv = ttHit ? ttMove[idx] : 0
  const pvNode = beta - alpha > 1
  if (ttHit && ply > 0 && !pvNode && ttDepth[idx] >= depth) {
    const s = ttScoreAt(idx, ply), f = ttFlag[idx]
    if (f === TT_EXACT) return s
    if (f === TT_ALPHA && s <= alpha) return s
    if (f === TT_BETA && s >= beta) return s
  }

  if (allowNull && !inCheck && !pvNode && depth >= 3 && ply > 0 && hasNonPawnMaterial(side) && evaluate() >= beta) {
    const r = depth > 6 ? 3 : 2
    makeNull()
    const score = -negamax(-beta, -beta + 1, depth - 1 - r, ply + 1, false)
    unmakeNull()
    if (aborted) return 0
    if (score >= beta && score < MATE_BOUND) return beta
  }

  const start = ply * MOVES_PER_PLY
  const end = generate(start, false)
  scoreMoves(start, end, ply, ttMv)
  let legal = 0
  let bestScore = -INF
  let bestMove = 0
  let flag = TT_ALPHA
  for (let i = start; i < end; i++) {
    const m = pickMove(i, end)
    if (ply === 0 && excludedCount > 0 && isExcluded(m)) continue
    if (!tryMake(m)) continue
    legal++
    let score: number
    if (legal === 1) score = -negamax(-beta, -alpha, depth - 1, ply + 1, true)
    else {
      score = -negamax(-alpha - 1, -alpha, depth - 1, ply + 1, true)
      if (score > alpha && score < beta && !aborted) score = -negamax(-beta, -alpha, depth - 1, ply + 1, true)
    }
    unmake(m)
    if (aborted) return 0
    if (score > bestScore) {
      bestScore = score
      bestMove = m
      if (score > alpha) {
        alpha = score
        flag = TT_EXACT
        updatePv(ply, m)
        if (score >= beta) {
          recordCutoff(m, ply, depth)
          flag = TT_BETA
          break
        }
      }
    }
  }
  if (legal === 0) return inCheck ? -MATE + ply : 0
  // A root searched with exclusions is not the real position: its entry must not survive into a later search.
  if (ply > 0 || excludedCount === 0) ttStore(idx, bestMove, bestScore, depth, flag, ply)
  return bestScore
}

// ───────────────────────────── Public API ─────────────────────────────

/** Asks a running search to stop at its next time check (only meaningful across async boundaries). */
export function requestStop(): void { stopRequested = true }

/** Move in long algebraic notation, e.g. "e2e4" or "e7e8q". */
function toLan(m: number): string {
  const promo = mvPromo(m)
  return squareName(mvFrom(m)) + squareName(mvTo(m)) + (promo ? PIECE_CHARS[promo] : '')
}

function toMoveInput(m: number): MoveInput {
  const promo = mvPromo(m)
  const input: MoveInput = { from: squareName(mvFrom(m)), to: squareName(mvTo(m)) }
  if (promo) input.promotion = PIECE_TYPES[promo]
  return input
}

/** Legal moves of the position, as MoveInput (promotions expanded). */
export function legalMoves(fen: string): MoveInput[] {
  setFen(fen)
  const end = generate(0, false)
  const out: MoveInput[] = []
  for (let i = 0; i < end; i++) {
    const m = moves[i]
    if (!tryMake(m)) continue
    unmake(m)
    out.push(toMoveInput(m))
  }
  return out
}

function perftNode(depth: number, ply: number): number {
  const start = ply * MOVES_PER_PLY
  const end = generate(start, false)
  let count = 0
  for (let i = start; i < end; i++) {
    const m = moves[i]
    if (!tryMake(m)) continue
    count += depth <= 1 ? 1 : perftNode(depth - 1, ply + 1)
    unmake(m)
  }
  return count
}

/** Number of leaf nodes at `depth` plies (depth 0 = 1). Validates the move generator. */
export function perft(fen: string, depth: number): number {
  setFen(fen)
  if (depth <= 0) return 1
  return perftNode(depth, 0)
}

/** Mulberry32, seeded: the randomised levels must be reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toWhitePov(scoreForMover: number): { scoreCp: number; mateIn?: number } {
  const sign = side === WHITE ? 1 : -1
  const scoreCp = (sign * scoreForMover) | 0
  if (scoreForMover > MATE_BOUND) {
    const plies = MATE - scoreForMover
    return { scoreCp, mateIn: (sign * ((plies + 1) >> 1)) | 0 }
  }
  if (scoreForMover < -MATE_BOUND) {
    const plies = MATE + scoreForMover
    return { scoreCp, mateIn: (-sign * ((plies + 1) >> 1)) | 0 }
  }
  return { scoreCp }
}

function finish(move: number, scoreForMover: number, depth: number, pv: number[], t0: number, lines: SearchLine[] | null): SearchResult {
  const pov = toWhitePov(scoreForMover)
  return {
    move: move ? toMoveInput(move) : null,
    scoreCp: pov.scoreCp,
    ...(pov.mateIn !== undefined ? { mateIn: pov.mateIn } : {}),
    depth,
    nodes,
    pv: pv.map(toLan),
    timeMs: Math.round(now() - t0),
    ...(lines ? { lines } : {}),
  }
}

function toLine(move: number, scoreForMover: number, pv: number[]): SearchLine {
  const pov = toWhitePov(scoreForMover)
  return {
    move: toMoveInput(move),
    scoreCp: pov.scoreCp,
    ...(pov.mateIn !== undefined ? { mateIn: pov.mateIn } : {}),
    pv: pv.map(toLan),
  }
}

/** How many alternative lines a request asks for beyond the main move, clamped to what exclusion can hold. */
function extraLines(multiPv: number | undefined): number {
  const n = Math.floor(multiPv ?? 1)
  if (!(n > 1)) return 0 // NaN and anything up to 1 ask for nothing extra; Infinity clamps below
  return Math.min(n - 1, MAX_EXCLUDED)
}

/** Levels 1 and 2: score every root move at a shallow depth and pick, seeded, inside a window of the best. */
function searchRandomised(level: EngineLevel, opts: SearchOptions, t0: number): SearchResult {
  const depth = level === 1 ? 1 : 2
  const fixed = level === 1 ? 150 : 60
  const window = opts.window !== undefined && opts.window >= 0 ? opts.window : fixed
  const seed = opts.seed ?? DEFAULT_SEED
  abortable = false
  const end = generate(0, false)
  const scored: { m: number; s: number; pv: number[] }[] = []
  for (let i = 0; i < end; i++) {
    const m = moves[i]
    if (!tryMake(m)) continue
    const s = -negamax(-INF, INF, depth - 1, 1, true)
    const pv = [m, ...Array.from(pvTable.subarray(MAX_PLY + 1, MAX_PLY + pvLen[1]))]
    unmake(m)
    scored.push({ m, s, pv })
  }
  const extra = extraLines(opts.multiPv)
  if (scored.length === 0) return finish(0, inCheckNow() ? -MATE : 0, depth, [], t0, extra > 0 ? [] : null)
  let best = -INF
  for (const e of scored) if (e.s > best) best = e.s
  const candidates = scored.filter((e) => e.s >= best - window)
  const pick = candidates[Math.floor(mulberry32(seed)() * candidates.length)]
  let lines: SearchLine[] | null = null
  if (extra > 0) {
    // The shallow scoring already ranks every root move: the lines are the best of the rest, in order.
    lines = scored
      .filter((e) => e.m !== pick.m)
      .sort((a, b) => b.s - a.s)
      .slice(0, extra)
      .map((e) => toLine(e.m, e.s, e.pv))
  }
  return finish(pick.m, pick.s, depth, pick.pv, t0, lines)
}

function timeBudget(level: EngineLevel, requested: number): number {
  const asked = requested > 0 ? requested : 3000
  if (level === 3) return Math.min(400, asked)
  if (level === 4) return Math.min(1200, asked)
  return asked
}

interface Deepened { move: number; score: number; depth: number; pv: number[] }

/**
 * Iterative deepening from the current position with the current root exclusions.
 * Runs until `maxDepth`, a mate no deeper than the depth, or `budgetMs` after `start`.
 */
function deepen(start: number, budgetMs: number, maxDepth: number): Deepened {
  deadline = start + budgetMs
  aborted = false
  pvLen.fill(0)
  let bestMove = 0, bestScore = 0, bestDepth = 0
  let pv: number[] = []
  let alpha = -INF, beta = INF
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (depth > 1 && now() - start > budgetMs * 0.6) break
    abortable = depth > 1
    let score = negamax(alpha, beta, depth, 0, false)
    if (!aborted && (score <= alpha || score >= beta)) score = negamax(-INF, INF, depth, 0, false)
    if (aborted) break
    bestScore = score
    bestDepth = depth
    pv = Array.from(pvTable.subarray(0, pvLen[0]))
    bestMove = pv[0] ?? 0
    if (!bestMove) break
    if (Math.abs(score) > MATE_BOUND && MATE - Math.abs(score) <= depth) break
    if (depth >= 4) { alpha = score - 40; beta = score + 40 } else { alpha = -INF; beta = INF }
  }
  return { move: bestMove, score: bestScore, depth: bestDepth, pv }
}

/**
 * Searches `fen` and returns the best move with its score (White's point of view).
 * Levels 1-2 are shallow and randomised; 3-5 use time (400ms, 1200ms, or the requested time).
 * Always returns the best move of the last completed depth, within roughly `timeMs`.
 *
 * With `multiPv > 1` the position is re-searched with the best root move excluded, then the best two, and so on;
 * each re-search has 40 percent of the main search's budget, and the whole call still fits `timeMs`: the main
 * search gets `timeMs / (1 + 0.4 * (multiPv - 1))`, the rest is split among the re-searches. A re-search never
 * deepens past the main search's completed depth, so when its budget suffices its score is comparable with the
 * main score; when it runs out of time first it reports the deeper of its own completed depths, which can sit
 * on the other side of an odd/even swing, so the lines are ranked by construction (each is the best of the rest),
 * not by re-sorting their scores.
 */
export function search(fen: string, opts: SearchOptions): SearchResult {
  const t0 = now()
  setFen(fen)
  resetSearchTables()
  stopRequested = false
  excludedCount = 0
  const level = opts.level ?? 5
  const timeMs = timeBudget(level, opts.timeMs)
  deadline = t0 + timeMs
  if (level <= 2) return searchRandomised(level, opts, t0)

  const maxDepth = Math.max(1, Math.min(MAX_DEPTH, opts.maxDepth ?? MAX_DEPTH))
  const extra = extraLines(opts.multiPv)
  const mainMs = timeMs / (1 + MULTI_PV_SHARE * extra)
  const main = deepen(t0, mainMs, maxDepth)
  if (extra === 0) return finish(main.move, main.score, main.depth, main.pv, t0, null)

  const lines: SearchLine[] = []
  const overall = t0 + timeMs
  const altDepth = Math.max(1, Math.min(maxDepth, main.depth))
  let last = main.move
  while (last && lines.length < extra) {
    excluded[excludedCount++] = last
    const start = now()
    const budget = Math.max(1, Math.min(mainMs * MULTI_PV_SHARE, overall - start))
    const alt = deepen(start, budget, altDepth)
    if (!alt.move) break
    lines.push(toLine(alt.move, alt.score, alt.pv))
    last = alt.move
  }
  excludedCount = 0
  return finish(main.move, main.score, main.depth, main.pv, t0, lines)
}

/** Static evaluation of a FEN from White's point of view (centipawns), for tests and tooling. */
export function evaluateFen(fen: string): number {
  setFen(fen)
  const s = evaluate()
  return side === WHITE ? s : -s
}
