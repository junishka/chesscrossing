// The game controller: the player's moves, the engine's replies, the clocks, and the events that tell the house.
import type {
  ClockState, Color, EngineLevel, GameEndReason, GameResult, GameSettings, GameStatus,
  MoveInput, MoveRecord, PositionBrief, SavedGame, SeaState,
} from '../types'
import { bus } from '../core/bus'
import { clock } from '../core/clock'
import { store } from '../core/store'
import { CHAIR_MIN_WAIT_MS, chairBudgetMs } from '../content/seaStates'
import { brief as buildBrief } from './analysis'
import { Engine } from './engine'
import { Position } from './rules'

/** Thinking budget per level. Levels 1 and 2 are depth-limited; the time is a ceiling. */
const LEVEL_BUDGET: Record<EngineLevel, { timeMs: number; maxDepth?: number }> = {
  1: { timeMs: 150, maxDepth: 1 },
  2: { timeMs: 300, maxDepth: 2 },
  3: { timeMs: 400 },
  4: { timeMs: 1200 },
  5: { timeMs: 3000 },
}
/** The engine never spends more than this share of its remaining clock on one move. */
const CLOCK_SHARE = 1 / 12
/** The chair waits at least this long after the player's move before it moves (docs/BIBLE.md §5.3). */
const REPLY_BEAT_MS = CHAIR_MIN_WAIT_MS
/** Minimum interval between `game:clock` emissions. */
const CLOCK_EMIT_MS = 200
/** Evaluation budgets for briefs: short after the player's move (the engine must still reply), full otherwise. */
const BRIEF_EVAL_MS = { quick: 250, full: 600 }
/** A draw offer is accepted only when the engine sees the endgame as this close. */
const DRAW_THRESHOLD_CP = 40

function other(c: Color): Color { return c === 'w' ? 'b' : 'w' }

/**
 * How the chair searches, from the barometer (docs/BIBLE.md §5.3). With a sea state the think time is
 * `chairBudgetMs(state, remaining, increment)`, the sea state's own time under No Watch; `window` is the
 * randomised levels' centipawn window. Without one, the level's fixed budget applies.
 */
export interface ChairSearch {
  /** The sea state the chair plays at; its time and the watch give the budget per move. */
  seaState?: SeaState
  /** A fixed think time overriding the level's budget when no sea state is given. */
  timeMs?: number
  /** Centipawn window for levels 1 and 2 (overrides the level's fixed 150 or 60). */
  window?: number
}

/** Whether a colour wins, loses or draws under a result. */
function outcomeFor(result: GameResult, c: Color): 'won' | 'lost' | 'drawn' {
  if (result === '1/2-1/2') return 'drawn'
  return (result === '1-0') === (c === 'w') ? 'won' : 'lost'
}

/**
 * One game against the engine. Owns the position, the clocks and the engine, and speaks to the
 * rest of the house only through the bus (`game:*` events).
 */
export class Game {
  readonly engine: Engine
  settings: GameSettings = { playerColor: 'w', opponent: { kind: 'engine', level: 3, name: 'The Engine' }, minutes: 0, incrementSec: 0 }
  clocks: ClockState = { w: 0, b: 0, running: null, incrementMs: 0 }
  state: 'idle' | 'playing' | 'over' = 'idle'
  /** The chair's search settings: sea state, time, window. Read at every reply. */
  chair: ChairSearch = {}
  /**
   * When true the chair's clock keeps running after its move is decided until `clampClosed()` (the davit's
   * clamp closes on the collar), and the player's clock starts only at `chairSeated()` (the lever clacks as
   * the piece seats). When false the clocks change hands as the move is made.
   */
  holdChairClock = false

  private pos = new Position()
  private thinking = false
  private paused = false
  private startedAt = 0
  /** Bumped on every event that invalidates in-flight engine work (new game, undo, resign, end). */
  private generation = 0
  private lastEval: { scoreCp: number; mateIn?: number } | undefined
  private lastTickAt = 0
  private lastClockEmitAt = 0
  private offTick: (() => void) | undefined
  /** Engine replies waiting for `resume` (the engine does not move while the game is paused). */
  private resumeWaiters: (() => void)[] = []
  /** The chair has moved and its clock is waiting for the clamp (1) or the seat (2); 0 when not held. */
  private hold: 0 | 1 | 2 = 0

  constructor(engine: Engine = new Engine()) {
    this.engine = engine
  }

  /** The live position. Replaced on `start`, so read it fresh rather than holding a reference. */
  get position(): Position { return this.pos }

  /**
   * Begins a game: fresh or from a saved PGN and clocks. Emits `game:new` and `game:clock`;
   * when it is the engine's turn (it has White, or the saved game left it to move) it moves first.
   */
  start(settings: GameSettings, pgn?: string, clocks?: ClockState): void {
    this.invalidate()
    this.settings = { ...settings, opponent: { ...settings.opponent } }
    this.pos = new Position()
    if (pgn && !this.pos.loadPgn(pgn)) this.pos = new Position()
    const total = settings.minutes * 60_000
    this.clocks = clocks
      ? { ...clocks }
      : { w: total, b: total, running: null, incrementMs: settings.incrementSec * 1000 }
    this.thinking = false
    this.paused = false
    this.lastEval = undefined
    this.startedAt = Date.now()
    this.state = 'playing'
    bus.emit('game:new', { settings: this.settings, fen: this.pos.fen() })
    const status = this.pos.status()
    if (status.isGameOver && status.result && status.reason) {
      this.finish(status, status.result, status.reason)
      return
    }
    this.setRunning(this.pos.turn())
    this.watchClocks()
    this.emitClock(true)
    this.save()
    if (this.pos.turn() !== this.settings.playerColor) void this.engineReply(performance.now())
    else this.scheduleBrief(BRIEF_EVAL_MS.full)
  }

  /**
   * Plays the player's move. Resolves to the record, or null when it is not the player's turn,
   * the engine is thinking, the game is not being played, or the move is illegal.
   * Emits `game:move` (byPlayer true) and then lets the engine reply.
   */
  async playerMove(input: MoveInput): Promise<MoveRecord | null> {
    if (this.state !== 'playing' || this.thinking || this.paused) return null
    if (this.pos.turn() !== this.settings.playerColor) return null
    if (this.hold) this.chairSeated()
    const record = this.pos.move(input)
    if (!record) return null
    const movedAt = performance.now()
    this.afterMove(record, true)
    if (this.state === 'playing') void this.engineReply(movedAt)
    return record
  }

  /** The player gives up; the engine wins. */
  resign(): void {
    if (this.state !== 'playing') return
    this.invalidate()
    const result: GameResult = this.settings.playerColor === 'w' ? '0-1' : '1-0'
    this.finish(this.pos.status(), result, 'resignation')
  }

  /**
   * Offers a draw. The engine accepts when the last evaluation it gave was within 40 centipawns
   * of level and the game has reached the endgame; otherwise it declines. Returns the answer.
   */
  offerDraw(): boolean {
    if (this.state !== 'playing' || !this.lastEval) return false
    const level = this.lastEval.mateIn === undefined && Math.abs(this.lastEval.scoreCp) < DRAW_THRESHOLD_CP
    if (!level || this.pos.phase() !== 'endgame') return false
    this.invalidate()
    this.finish(this.pos.status(), '1/2-1/2', 'agreement')
    return true
  }

  /**
   * Takes back the engine's reply and the player's move (two plies) so the player is to move again.
   * While the engine is still thinking only the player's move is taken back. Emits `game:undo`.
   */
  undo(): void {
    if (this.state !== 'playing') return
    const history = this.pos.history()
    const playerPlies = history.filter((m) => m.color === this.settings.playerColor).length
    if (playerPlies === 0) return
    this.invalidate()
    if (this.thinking) bus.emit('game:thinking', { thinking: false })
    this.thinking = false
    const plies = this.pos.turn() === this.settings.playerColor ? 2 : 1
    for (let i = 0; i < plies; i++) this.pos.undo()
    this.setRunning(this.pos.turn())
    bus.emit('game:undo', { fen: this.pos.fen() })
    this.emitClock(true)
    this.save()
    this.scheduleBrief(BRIEF_EVAL_MS.full)
  }

  /** Stops the clocks; moves are refused until `resume`. */
  pause(): void {
    if (this.state !== 'playing' || this.paused) return
    this.paused = true
    this.clocks.running = null
    this.emitClock(true)
  }

  /** Restarts the clock of the side to move. */
  resume(): void {
    if (this.state !== 'playing' || !this.paused) return
    this.paused = false
    this.lastTickAt = performance.now()
    this.setRunning(this.pos.turn())
    this.emitClock(true)
    this.wake()
  }

  /** The davit's clamp has closed on the chair's piece: the chair's clock stops, its increment is added. */
  clampClosed(): void {
    if (this.hold !== 1) return
    const chair = other(this.settings.playerColor)
    if (this.clocks.running === chair) this.clocks[chair] += this.clocks.incrementMs
    this.hold = 2
    this.clocks.running = null
    this.lastTickAt = performance.now()
    this.emitClock(true)
  }

  /** The chair's piece has seated: the lever clacks over and the player's clock starts. */
  chairSeated(): void {
    if (!this.hold) return
    if (this.hold === 1) this.clampClosed()
    this.hold = 0
    if (this.state !== 'playing') return
    this.setRunning(this.pos.turn())
    this.emitClock(true)
  }

  /** The Second's brief for the current position, with a fresh 600ms evaluation. */
  async brief(): Promise<PositionBrief> {
    return this.makeBrief(BRIEF_EVAL_MS.full)
  }

  /** Snapshot of a game in progress, also written to the Ledger; undefined when nothing is being played. */
  save(): SavedGame | undefined {
    if (this.state !== 'playing') return undefined
    const saved: SavedGame = { pgn: this.pos.pgn(), settings: this.settings, clocks: { ...this.clocks }, startedAt: this.startedAt }
    store.ledger.savedGame = saved
    store.save()
    return saved
  }

  // ───────────────────────────── internals ─────────────────────────────

  /** Common tail of every move: clocks, events, end-of-game detection, and the brief. */
  private afterMove(record: MoveRecord, byPlayer: boolean): void {
    const mover = record.color
    const status = this.pos.status()
    if (!byPlayer && this.holdChairClock && !status.isGameOver && this.clocks.running === mover) {
      // The chair's clock runs on until the clamp closes; see `clampClosed` and `chairSeated`.
      this.hold = 1
    } else {
      if (this.clocks.running === mover) this.clocks[mover] += this.clocks.incrementMs
      this.setRunning(other(mover))
    }
    bus.emit('game:move', { move: record, status, byPlayer })
    this.emitClock(true)
    if (status.isGameOver && status.result && status.reason) {
      this.finish(status, status.result, status.reason)
      return
    }
    this.save()
    this.scheduleBrief(byPlayer ? BRIEF_EVAL_MS.quick : BRIEF_EVAL_MS.full)
  }

  /** Asks the engine for a move and plays it no sooner than a beat after the player's move landed. */
  private async engineReply(playerMovedAt: number): Promise<void> {
    const gen = this.generation
    this.thinking = true
    bus.emit('game:thinking', { thinking: true })
    try {
      const move = await this.searchReply()
      if (gen !== this.generation) return
      const elapsed = performance.now() - playerMovedAt
      if (elapsed < REPLY_BEAT_MS) await new Promise<void>((r) => setTimeout(r, REPLY_BEAT_MS - elapsed))
      // A paused game shows no moves: hold the reply until `resume` (or until the game moves on).
      while (this.paused && gen === this.generation) await new Promise<void>((r) => this.resumeWaiters.push(r))
      if (gen !== this.generation) return
      this.thinking = false
      bus.emit('game:thinking', { thinking: false })
      if (this.state !== 'playing') return
      const record = move ? this.pos.move(move) : null
      if (!record) {
        this.resignEngine()
        return
      }
      this.afterMove(record, false)
    } catch (err) {
      console.error('[game] engine reply failed', err)
      if (gen === this.generation && this.thinking) {
        this.thinking = false
        bus.emit('game:thinking', { thinking: false })
      }
    }
  }

  /** The engine's chosen move, within its budget; a legal fallback when the engine fails. */
  private async searchReply(): Promise<MoveInput | null> {
    const level = this.settings.opponent.level
    const budget = LEVEL_BUDGET[level]
    const remaining = this.clocks[this.pos.turn()]
    let timeMs: number
    if (this.chair.seaState !== undefined) {
      timeMs = chairBudgetMs(this.chair.seaState, this.timed ? remaining : null, this.clocks.incrementMs)
    } else {
      const base = this.chair.timeMs ?? budget.timeMs
      timeMs = this.clocks.running ? Math.max(50, Math.min(base, remaining * CLOCK_SHARE)) : base
    }
    const fen = this.pos.fen()
    try {
      const result = await this.engine.search(fen, { timeMs, maxDepth: budget.maxDepth, level, window: this.chair.window })
      this.lastEval = { scoreCp: result.scoreCp, mateIn: result.mateIn }
      const chosen = result.move
      if (chosen && this.pos.legalMoves(chosen.from).some((m) => m.to === chosen.to)) return chosen
    } catch (err) {
      console.error('[game] engine search failed', err)
    }
    // A legal fallback, chosen by the ply so every player sees the same one.
    const legal = this.pos.legalMoves()
    return legal.length ? legal[this.pos.ply() % legal.length] : null
  }

  /** The engine has no move to make in a position the rules say is alive: it concedes. */
  private resignEngine(): void {
    const result: GameResult = this.settings.playerColor === 'w' ? '1-0' : '0-1'
    this.finish(this.pos.status(), result, 'resignation')
  }

  /**
   * Builds a brief of the position as it stands now. The position is snapshotted before the
   * evaluation, so a brief asked for while a move lands never pairs one position with another's score.
   */
  private async makeBrief(evalMs: number): Promise<PositionBrief> {
    const p = this.pos.clone()
    const fen = p.fen()
    const playerColor = this.settings.playerColor
    const clocks = this.settings.minutes > 0 ? { ...this.clocks } : undefined
    let evalResult: { scoreCp: number; mateIn?: number; pv: string[] } | undefined
    try {
      const ev = await this.engine.evaluate(fen, evalMs)
      evalResult = { scoreCp: ev.scoreCp, mateIn: ev.mateIn, pv: ev.pv }
      if (this.pos.fen() === fen) this.lastEval = { scoreCp: ev.scoreCp, mateIn: ev.mateIn }
    } catch (err) {
      console.error('[game] engine evaluation failed', err)
    }
    return buildBrief(p, { playerColor, evalResult, clocks })
  }

  /** Emits `game:brief` once the evaluation is in, unless the position has moved on meanwhile. */
  private scheduleBrief(evalMs: number): void {
    const gen = this.generation
    const ply = this.pos.ply()
    this.makeBrief(evalMs)
      .then((b) => {
        if (gen === this.generation && this.state === 'playing' && this.pos.ply() === ply) bus.emit('game:brief', b)
      })
      .catch((err) => { console.error('[game] brief failed', err) })
  }

  /** Bumps the generation so in-flight engine work is discarded, and asks the engine to stop. */
  private invalidate(): void {
    this.generation++
    this.hold = 0
    this.engine.stop()
    this.wake()
  }

  /** Releases engine replies held back by a pause (they re-check pause and generation). */
  private wake(): void {
    const waiters = this.resumeWaiters
    this.resumeWaiters = []
    for (const w of waiters) w()
  }

  private finish(status: GameStatus, result: GameResult, reason: GameEndReason): void {
    if (this.state === 'over') return
    this.generation++
    this.hold = 0
    this.wake()
    this.state = 'over'
    if (this.thinking) bus.emit('game:thinking', { thinking: false })
    this.thinking = false
    this.clocks.running = null
    this.offTick?.()
    this.offTick = undefined
    const outcome = outcomeFor(result, this.settings.playerColor)
    store.ledger.games.played++
    store.ledger.games[outcome]++
    store.ledger.savedGame = undefined
    store.save()
    this.emitClock(true)
    bus.emit('game:over', { status: { ...status, isGameOver: true, result, reason }, result, reason })
  }

  // ───────────────────────────── clocks ─────────────────────────────

  private get timed(): boolean { return this.settings.minutes > 0 }

  private setRunning(c: Color): void {
    this.clocks.running = this.timed && !this.paused ? c : null
    this.lastTickAt = performance.now()
  }

  /** Subscribes the clocks to the house clock; deltas are wall time, so slow motion does not stretch a minute. */
  private watchClocks(): void {
    this.offTick?.()
    this.lastTickAt = performance.now()
    this.lastClockEmitAt = 0
    if (!this.timed) { this.offTick = undefined; return }
    this.offTick = clock.onTick(() => this.tick())
  }

  private tick(): void {
    const now = performance.now()
    const dt = now - this.lastTickAt
    this.lastTickAt = now
    const side = this.clocks.running
    if (this.state !== 'playing' || !side) return
    this.clocks[side] = Math.max(0, this.clocks[side] - dt)
    if (this.clocks[side] === 0) {
      this.engine.stop()
      const result: GameResult = side === 'w' ? '0-1' : '1-0'
      this.finish(this.pos.status(), result, 'timeout')
      return
    }
    this.emitClock(false)
  }

  private emitClock(force: boolean): void {
    const now = performance.now()
    if (!force && now - this.lastClockEmitAt < CLOCK_EMIT_MS) return
    this.lastClockEmitAt = now
    bus.emit('game:clock', { ...this.clocks })
  }
}
