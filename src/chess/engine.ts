// Main-thread client for the engine Worker. One request id per call; each call is a promise.
//
// The station runs two of these at once (BIBLE.md 5.3): `chair` searches the opponent's move and
// `soundings` runs the 600 ms gauge and the packet's multi-PV search, so a sounding is never queued
// behind a ten-second think. Each client owns its own Worker and therefore its own engine tables.

import type { EngineLevel, EngineMessage, EngineRequest } from '../types'

type Result = Extract<EngineMessage, { type: 'result' }>
type Eval = Extract<EngineMessage, { type: 'eval' }>
type Perft = Extract<EngineMessage, { type: 'perft' }>
type Reply = Exclude<EngineMessage, { type: 'error' }>

interface Pending { resolve: (msg: Reply) => void; reject: (err: Error) => void }

/** The two worker roles of BIBLE.md 5.3. */
export type EngineName = 'chair' | 'soundings'

/** Constructor options for `Engine`. */
export interface EngineOptions {
  /** Role of this worker, for logging and error messages; the Worker itself is named after it. Default 'chair'. */
  name?: EngineName
}

/** Options for `Engine.search`; see `EngineRequest` in types.ts for the meaning of each field. */
export interface EngineSearchOptions {
  timeMs: number
  maxDepth?: number
  level?: EngineLevel
  /** Centipawn window for the randomised levels 1 and 2, overriding the level's fixed 150 or 60. */
  window?: number
  /** Number of root lines wanted; lines beyond the first come back in `lines`, best first. Default 1. */
  multiPv?: number
  /** Seed for the randomised levels. The worker picks a fresh one per request when absent. */
  seed?: number
}

/** Own-engine client. Requests are serialised by the worker; `stop()` asks a running search to end early. */
export class Engine {
  /** Role of this worker: 'chair' or 'soundings'. */
  readonly name: EngineName
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private disposed = false
  /** Set once the worker itself failed (script failed to load, uncaught error): later requests reject at once instead of hanging. */
  private fatal: Error | null = null

  constructor(opts: EngineOptions = {}) {
    this.name = opts.name ?? 'chair'
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: `engine:${this.name}` })
    this.worker.onmessage = (e: MessageEvent<EngineMessage>) => { this.receive(e.data) }
    this.worker.onerror = (e: ErrorEvent) => {
      this.fatal = new Error(`engine ${this.name}: ${e.message || 'worker error'}`)
      this.failAll(this.fatal)
    }
    this.worker.onmessageerror = () => { this.failAll(new Error(`engine ${this.name}: undecodable message`)) }
  }

  /**
   * Best move and score for `fen`. Level 1-2 are randomised (see `window` and `seed`); 3-5 use time budgets
   * per ARCHITECTURE.md. With `multiPv > 1` the result's `lines` carries the alternative root lines, best first.
   */
  search(fen: string, opts: EngineSearchOptions): Promise<Result> {
    return this.request<Result>({
      id: 0,
      type: 'search',
      fen,
      timeMs: opts.timeMs,
      maxDepth: opts.maxDepth,
      level: opts.level,
      window: opts.window,
      multiPv: opts.multiPv,
      seed: opts.seed,
    })
  }

  /** Score of `fen` from White's point of view after a search of `timeMs`. */
  evaluate(fen: string, timeMs: number): Promise<Eval> {
    return this.request<Eval>({ id: 0, type: 'eval', fen, timeMs })
  }

  /** Leaf-node count at `depth`, for validating the generator from the browser. */
  async perft(fen: string, depth: number): Promise<number> {
    const r = await this.request<Perft>({ id: 0, type: 'perft', fen, depth })
    return r.nodes
  }

  /** Asks the worker to stop; see engine.worker.ts for the single-threaded limitation. */
  stop(): void {
    if (!this.disposed) this.worker.postMessage({ type: 'stop' } satisfies EngineRequest)
  }

  /** Terminates the worker and rejects every pending request. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.terminate()
    this.failAll(new Error(`engine ${this.name} disposed`))
  }

  private request<T extends Reply>(req: Exclude<EngineRequest, { type: 'stop' }>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error(`engine ${this.name} disposed`))
    if (this.fatal) return Promise.reject(this.fatal)
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (msg) => resolve(msg as T), reject })
      try {
        this.worker.postMessage({ ...req, id })
      } catch (err) {
        // A request that cannot be posted (e.g. not cloneable) must not hang forever.
        this.pending.delete(id)
        reject(err instanceof Error ? err : new Error(`engine ${this.name}: ${String(err)}`))
      }
    })
  }

  private receive(msg: EngineMessage): void {
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    if (msg.type === 'error') p.reject(new Error(`engine ${this.name}: ${msg.message}`))
    else p.resolve(msg)
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }
}
