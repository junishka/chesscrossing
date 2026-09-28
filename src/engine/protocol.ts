/**
 * The UCI protocol as pure functions: parse what Stockfish posts, build what
 * we post. No worker, no timers, no state.
 *
 * Verified against node_modules/stockfish/bin/stockfish-19-lite-single.js:
 * the worker accepts one command string per postMessage and posts each output
 * line back as one string message.
 */
import type { Color } from '../contracts/chess'

// Commands -------------------------------------------------------------

export const UCI = 'uci'
export const ISREADY = 'isready'
export const UCINEWGAME = 'ucinewgame'
export const STOP = 'stop'
export const QUIT = 'quit'

export const UCIOK = 'uciok'
export const READYOK = 'readyok'

export function setOptionCommand(name: string, value: string | number | boolean): string {
  return `setoption name ${name} value ${String(value)}`
}

/** Skill Level is an integer from 0 to 20. Anything else is clamped and floored. */
export function skillLevelCommand(level: number): string {
  const n = Math.min(20, Math.max(0, Math.floor(level)))
  return setOptionCommand('Skill Level', n)
}

export function positionCommand(fen: string): string {
  return `position fen ${fen.trim()}`
}

export interface SearchLimits {
  movetimeMs?: number
  depth?: number
}

/**
 * `go movetime N`, `go depth D`, or both, in which case the search stops at
 * whichever comes first. Throws when neither is given: an unlimited search
 * would never answer.
 */
export function goCommand(limits: SearchLimits): string {
  const parts: string[] = ['go']
  if (limits.depth !== undefined && Number.isFinite(limits.depth)) {
    parts.push('depth', String(Math.max(1, Math.floor(limits.depth))))
  }
  if (limits.movetimeMs !== undefined && Number.isFinite(limits.movetimeMs)) {
    parts.push('movetime', String(Math.max(1, Math.floor(limits.movetimeMs))))
  }
  if (parts.length === 1) throw new Error('goCommand needs a depth or a movetime')
  return parts.join(' ')
}

// FEN ------------------------------------------------------------------

const FEN_PLACEMENT = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/

/** The side to move from a FEN. Throws on a FEN it cannot read. */
export function sideToMove(fen: string): Color {
  const fields = fen.trim().split(/\s+/)
  const placement = fields[0]
  const turn = fields[1]
  if (!placement || !FEN_PLACEMENT.test(placement)) throw new Error(`malformed fen: ${fen}`)
  if (turn === 'w' || turn === 'b') return turn
  throw new Error(`malformed fen: ${fen}`)
}

// Output lines ---------------------------------------------------------

export type ScoreBound = 'lower' | 'upper'

/** A score as Stockfish reports it: from the side to move. */
export interface UciScore {
  kind: 'cp' | 'mate'
  value: number
  /** Present on fail-high or fail-low lines, which are not final. */
  bound?: ScoreBound
}

export interface InfoLine {
  depth?: number
  seldepth?: number
  multipv?: number
  score?: UciScore
  nodes?: number
  nps?: number
  time?: number
  hashfull?: number
  currmove?: string
  currmovenumber?: number
  pv?: string[]
  /** `info string ...`, the engine talking about itself. */
  string?: string
}

const ONE_INT = new Set(['depth', 'seldepth', 'multipv', 'nodes', 'nps', 'time', 'hashfull', 'tbhits', 'currmovenumber', 'cpuload'])
const CONSUME_REST = new Set(['pv', 'string', 'refutation', 'currline'])

function int(token: string | undefined): number | undefined {
  if (token === undefined) return undefined
  const n = Number(token)
  return Number.isInteger(n) ? n : undefined
}

/** Parses an `info` line. Returns null for anything that is not one. */
export function parseInfo(line: string): InfoLine | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return null
  const info: InfoLine = {}
  let i = 1
  while (i < tokens.length) {
    const key = tokens[i]
    if (key === undefined) break
    if (ONE_INT.has(key)) {
      const n = int(tokens[i + 1])
      if (n !== undefined) {
        switch (key) {
          case 'depth': info.depth = n; break
          case 'seldepth': info.seldepth = n; break
          case 'multipv': info.multipv = n; break
          case 'nodes': info.nodes = n; break
          case 'nps': info.nps = n; break
          case 'time': info.time = n; break
          case 'hashfull': info.hashfull = n; break
          case 'currmovenumber': info.currmovenumber = n; break
          default: break
        }
      }
      i += 2
      continue
    }
    if (key === 'score') {
      const kind = tokens[i + 1]
      const value = int(tokens[i + 2])
      i += 3
      if ((kind === 'cp' || kind === 'mate') && value !== undefined) {
        const score: UciScore = { kind, value }
        const bound = tokens[i]
        if (bound === 'lowerbound') { score.bound = 'lower'; i += 1 }
        else if (bound === 'upperbound') { score.bound = 'upper'; i += 1 }
        info.score = score
      }
      continue
    }
    if (key === 'currmove') {
      info.currmove = tokens[i + 1]
      i += 2
      continue
    }
    if (key === 'wdl') {
      i += 4
      continue
    }
    if (CONSUME_REST.has(key)) {
      const rest = tokens.slice(i + 1)
      if (key === 'pv') info.pv = rest
      else if (key === 'string') info.string = rest.join(' ')
      break
    }
    i += 1
  }
  return info
}

export type CompleteInfo = InfoLine & { depth: number; score: UciScore }

/**
 * A line worth keeping as an evaluation: it has a depth and a final score
 * (no bound), and it is the principal line (multipv 1 or unstated). With a
 * Skill Level below 20 Stockfish reports four lines per depth; only the
 * first is the evaluation.
 */
export function isCompleteInfo(info: InfoLine): info is CompleteInfo {
  return (
    info.depth !== undefined &&
    info.score !== undefined &&
    info.score.bound === undefined &&
    (info.multipv === undefined || info.multipv === 1)
  )
}

export interface BestMoveLine {
  /** Null when the engine answered `bestmove (none)`: no legal move. */
  move: string | null
  ponder?: string
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/

export function isUciMove(s: string): boolean {
  return UCI_MOVE.test(s)
}

/** Parses a `bestmove` line. Returns null for anything that is not one. */
export function parseBestMove(line: string): BestMoveLine | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'bestmove') return null
  const move = tokens[1]
  const out: BestMoveLine = { move: move !== undefined && isUciMove(move) ? move : null }
  if (tokens[2] === 'ponder' && tokens[3] !== undefined && isUciMove(tokens[3])) out.ponder = tokens[3]
  return out
}

// Scores ---------------------------------------------------------------

export interface WhiteScore {
  /** Centipawns from White's point of view. Absent when a mate is found. */
  cp?: number
  /** Mate in N from White's point of view. Positive: White mates. Negative: Black mates. */
  mate?: number
}

/**
 * Stockfish scores are from the side to move. This turns one into White's
 * point of view. `mate 0` means the side to move is already checkmated; it
 * has no sign to flip and is returned as 0.
 */
export function normalizeScore(score: UciScore, turn: Color): WhiteScore {
  const sign = turn === 'w' ? 1 : -1
  if (score.kind === 'mate') {
    return { mate: score.value === 0 ? 0 : sign * score.value }
  }
  return { cp: score.value === 0 ? 0 : sign * score.value }
}
