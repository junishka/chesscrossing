/**
 * The engine: Stockfish in a Web Worker, behind a serialized command queue.
 * One search at a time. Every promise either settles or rejects on a timer;
 * nothing hangs.
 *
 * The worker script (public/engine/stockfish-19-lite-single.js) is loaded as a
 * classic Worker. It finds its .wasm next to itself, takes one UCI command per
 * postMessage, and posts each output line back as one string message.
 */
import type { Strength } from '../contracts/chess'
import type { BestMoveOptions, Engine, EngineEvaluation, EngineOptions, EvaluateOptions } from '../contracts/engine'
import { EngineError, EngineStoppedError, EngineTimeoutError } from './errors'
import {
  ISREADY,
  READYOK,
  STOP,
  UCI,
  UCINEWGAME,
  UCIOK,
  goCommand,
  isCompleteInfo,
  normalizeScore,
  parseBestMove,
  parseInfo,
  positionCommand,
  sideToMove,
  skillLevelCommand,
  type CompleteInfo,
} from './protocol'
import { FULL_SKILL_LEVEL, SKILL_LEVEL, THINK_TIME_MS } from './strength'

/** What the engine needs from a Worker. A real Worker satisfies it; so does a fake in tests. */
export interface WorkerLike {
  postMessage(message: string): void
  terminate(): void
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: ErrorEvent) => void) | null
}

export type WorkerFactory = (scriptUrl: string) => WorkerLike

export interface CreateEngineOptions extends EngineOptions {
  /** Makes the worker. Default: `new Worker(scriptUrl)`. Tests inject a fake. */
  workerFactory?: WorkerFactory
  /** How long the uci/isready handshake may take, wasm download included. Default 30000. */
  readyTimeoutMs?: number
  /** Added to a search's movetime to get its deadline. Default 5000. */
  searchGraceMs?: number
  /** Deadline for a search limited by depth alone. Default 20000. */
  depthSearchTimeoutMs?: number
  /** After `stop`, how long to wait for the engine's `bestmove` before declaring it wedged. Default 3000. */
  drainTimeoutMs?: number
  /** Depth for evaluate() when the caller gives neither depth nor movetime. Default 12. */
  defaultEvalDepth?: number
}

export const DEFAULT_SCRIPT_URL = '/engine/stockfish-19-lite-single.js'
export const DEFAULT_EVAL_DEPTH = 12

interface Job {
  kind: 'handshake' | 'search'
  timeoutMs: number
  /** Sends the job's commands. Called when the job reaches the front of the queue. */
  start(): void
  /** Handles one output line. Returns true when the job is finished. */
  onLine(line: string): boolean
  /** Rejects the job's promise. */
  fail(err: Error): void
}

function defaultWorkerFactory(scriptUrl: string): WorkerLike {
  if (typeof Worker === 'undefined') throw new EngineError('Web Workers are not available here')
  return new Worker(scriptUrl)
}

class StockfishEngine implements Engine {
  private worker: WorkerLike | null = null
  private readonly queue: Job[] = []
  private current: Job | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Set while a stopped or timed-out search is still to answer `bestmove`. */
  private draining = false
  private drainTimer: ReturnType<typeof setTimeout> | null = null
  /** Once set, everything rejects with this. */
  private failure: Error | null = null
  private disposed = false
  /** The Skill Level the worker currently holds, or null before it has been set. */
  private skillLevel: number | null = null
  private readonly readyPromise: Promise<void>

  private readonly scriptUrl: string
  private readonly readyTimeoutMs: number
  private readonly searchGraceMs: number
  private readonly depthSearchTimeoutMs: number
  private readonly drainTimeoutMs: number
  private readonly defaultEvalDepth: number

  constructor(options: CreateEngineOptions) {
    this.scriptUrl = options.scriptUrl ?? DEFAULT_SCRIPT_URL
    this.readyTimeoutMs = options.readyTimeoutMs ?? 30000
    this.searchGraceMs = options.searchGraceMs ?? 5000
    this.depthSearchTimeoutMs = options.depthSearchTimeoutMs ?? 20000
    this.drainTimeoutMs = options.drainTimeoutMs ?? 3000
    this.defaultEvalDepth = options.defaultEvalDepth ?? DEFAULT_EVAL_DEPTH

    const factory = options.workerFactory ?? defaultWorkerFactory
    try {
      this.worker = factory(this.scriptUrl)
      this.worker.onmessage = (ev) => this.onMessage(ev)
      this.worker.onerror = (ev) => this.onWorkerError(ev)
    } catch (err) {
      this.worker = null
      this.failure = err instanceof EngineError ? err : new EngineError(`could not start the engine worker: ${String(err)}`)
    }

    this.readyPromise = this.enqueueHandshake()
    // Somebody may never call ready(). The rejection is still delivered to whoever does.
    this.readyPromise.catch(() => undefined)
  }

  // Public ----------------------------------------------------------------

  ready(): Promise<void> {
    return this.readyPromise
  }

  bestMove(fen: string, options: BestMoveOptions): Promise<string> {
    let turnCheck: Error | null = null
    try {
      sideToMove(fen)
    } catch (err) {
      turnCheck = err as Error
    }
    if (turnCheck) return Promise.reject(new EngineError(turnCheck.message))

    const level = SKILL_LEVEL[options.strength as Strength]
    if (level === undefined) return Promise.reject(new EngineError(`unknown strength ${String(options.strength)}`))
    const movetimeMs = options.movetimeMs ?? THINK_TIME_MS[options.strength]

    return new Promise<string>((resolve, reject) => {
      const job: Job = {
        kind: 'search',
        timeoutMs: movetimeMs + this.searchGraceMs,
        start: () => {
          this.ensureSkillLevel(level)
          this.post(positionCommand(fen))
          this.post(goCommand({ movetimeMs }))
        },
        onLine: (line) => {
          const best = parseBestMove(line)
          if (!best) return false
          if (best.move === null) reject(new EngineError('no legal move in this position'))
          else resolve(best.move)
          return true
        },
        fail: reject,
      }
      this.enqueue(job)
    })
  }

  evaluate(fen: string, options: EvaluateOptions = {}): Promise<EngineEvaluation> {
    let turn: 'w' | 'b'
    try {
      turn = sideToMove(fen)
    } catch (err) {
      return Promise.reject(new EngineError((err as Error).message))
    }

    const limits = {
      depth: options.depth ?? (options.movetimeMs === undefined ? this.defaultEvalDepth : undefined),
      movetimeMs: options.movetimeMs,
    }
    const timeoutMs = limits.movetimeMs !== undefined ? limits.movetimeMs + this.searchGraceMs : this.depthSearchTimeoutMs

    return new Promise<EngineEvaluation>((resolve, reject) => {
      let last: CompleteInfo | null = null
      const job: Job = {
        kind: 'search',
        timeoutMs,
        start: () => {
          this.ensureSkillLevel(FULL_SKILL_LEVEL)
          this.post(positionCommand(fen))
          this.post(goCommand(limits))
        },
        onLine: (line) => {
          const info = parseInfo(line)
          if (info) {
            if (isCompleteInfo(info)) last = info
            return false
          }
          const best = parseBestMove(line)
          if (!best) return false
          if (!last) {
            reject(new EngineError('the search ended without a score'))
            return true
          }
          const result: EngineEvaluation = { depth: last.depth, ...normalizeScore(last.score, turn) }
          if (best.move !== null) result.bestMove = best.move
          resolve(result)
          return true
        },
        fail: reject,
      }
      this.enqueue(job)
    })
  }

  /**
   * Stops the running search and rejects it and every queued search with
   * EngineStoppedError. The handshake, if it is still running, is left alone:
   * ready() keeps its promise.
   */
  stop(): void {
    const stopped = new EngineStoppedError()
    for (const job of this.queue.splice(0)) job.fail(stopped)
    if (this.current && this.current.kind === 'search') {
      const job = this.current
      this.current = null
      this.clearTimer()
      this.post(STOP)
      this.beginDrain()
      job.fail(stopped)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const stopped = new EngineStoppedError('engine disposed')
    this.failure = stopped
    this.failAll(stopped)
    this.terminate()
  }

  // Queue -----------------------------------------------------------------

  private enqueueHandshake(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let gotUciOk = false
      const job: Job = {
        kind: 'handshake',
        timeoutMs: this.readyTimeoutMs,
        start: () => {
          this.post(UCI)
        },
        onLine: (line) => {
          if (!gotUciOk) {
            if (line.trim() !== UCIOK) return false
            gotUciOk = true
            this.post(UCINEWGAME)
            this.post(ISREADY)
            return false
          }
          if (line.trim() !== READYOK) return false
          resolve()
          return true
        },
        fail: reject,
      }
      this.enqueue(job)
    })
  }

  private enqueue(job: Job): void {
    if (this.failure) {
      job.fail(this.failure)
      return
    }
    this.queue.push(job)
    this.pump()
  }

  private pump(): void {
    if (this.current || this.draining || this.failure) return
    const next = this.queue.shift()
    if (!next) return
    this.current = next
    this.timer = setTimeout(() => this.onTimeout(next), next.timeoutMs)
    try {
      next.start()
    } catch (err) {
      this.current = null
      this.clearTimer()
      next.fail(err instanceof EngineError ? err : new EngineError(String(err)))
      this.pump()
    }
  }

  private finishCurrent(): void {
    this.current = null
    this.clearTimer()
    this.pump()
  }

  private onTimeout(job: Job): void {
    if (this.current !== job) return
    this.current = null
    this.clearTimer()
    if (job.kind === 'handshake') {
      const err = new EngineTimeoutError(`the engine did not answer uci and isready within ${job.timeoutMs} ms`)
      this.failure = err
      job.fail(err)
      this.failAll(err)
      this.terminate()
      return
    }
    // A search that overran: tell the engine to stop, wait for its bestmove, carry on.
    this.post(STOP)
    this.beginDrain()
    job.fail(new EngineTimeoutError(`the search did not answer within ${job.timeoutMs} ms`))
  }

  private beginDrain(): void {
    this.draining = true
    if (this.drainTimer) clearTimeout(this.drainTimer)
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null
      if (!this.draining) return
      const err = new EngineError('the engine did not answer stop; it is unresponsive')
      this.failure = err
      this.failAll(err)
      this.terminate()
    }, this.drainTimeoutMs)
  }

  private endDrain(): void {
    this.draining = false
    if (this.drainTimer) {
      clearTimeout(this.drainTimer)
      this.drainTimer = null
    }
    this.pump()
  }

  private failAll(err: Error): void {
    this.clearTimer()
    if (this.drainTimer) {
      clearTimeout(this.drainTimer)
      this.drainTimer = null
    }
    this.draining = false
    const current = this.current
    this.current = null
    if (current) current.fail(err)
    for (const job of this.queue.splice(0)) job.fail(err)
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  // Worker ----------------------------------------------------------------

  private onMessage(ev: MessageEvent): void {
    const data: unknown = ev.data
    if (typeof data !== 'string') return
    if (this.draining) {
      if (parseBestMove(data)) this.endDrain()
      return
    }
    const job = this.current
    if (!job) return
    let done = false
    try {
      done = job.onLine(data)
    } catch (err) {
      this.current = null
      this.clearTimer()
      job.fail(err instanceof EngineError ? err : new EngineError(String(err)))
      this.pump()
      return
    }
    if (done) this.finishCurrent()
  }

  private onWorkerError(ev: ErrorEvent | { message?: string }): void {
    const detail = typeof ev.message === 'string' && ev.message ? ev.message : 'the engine worker failed'
    const err = new EngineError(detail)
    this.failure = err
    this.failAll(err)
    this.terminate()
  }

  private ensureSkillLevel(level: number): void {
    if (this.skillLevel === level) return
    this.skillLevel = level
    this.post(skillLevelCommand(level))
  }

  private post(command: string): void {
    if (!this.worker) return
    try {
      this.worker.postMessage(command)
    } catch (err) {
      this.onWorkerError({ message: `postMessage failed: ${String(err)}` })
    }
  }

  private terminate(): void {
    const w = this.worker
    this.worker = null
    if (!w) return
    w.onmessage = null
    w.onerror = null
    try {
      w.terminate()
    } catch {
      // Already gone.
    }
  }
}

export function createEngine(options: CreateEngineOptions = {}): Engine {
  return new StockfishEngine(options)
}
