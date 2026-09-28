/**
 * A stand-in for the Stockfish worker, for tests. Records every command it is
 * given and lets the test post lines back. With `autoHandshake` (the default)
 * it answers `uci` and `isready` on its own, one tick later, as the real
 * worker would; searches are answered by the test, or by a `onGo` script.
 */
import type { WorkerLike } from './engine'

export interface FakeWorkerOptions {
  autoHandshake?: boolean
  /** Called for every `go` command. Use `worker.emit` to answer. */
  onGo?: (command: string, worker: FakeWorker) => void
}

export class FakeWorker implements WorkerLike {
  readonly sent: string[] = []
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  terminated = false
  private readonly autoHandshake: boolean
  private readonly onGo: FakeWorkerOptions['onGo']

  constructor(readonly scriptUrl: string, options: FakeWorkerOptions = {}) {
    this.autoHandshake = options.autoHandshake ?? true
    this.onGo = options.onGo
  }

  postMessage(message: string): void {
    if (this.terminated) throw new Error('worker terminated')
    this.sent.push(message)
    if (this.autoHandshake) {
      if (message === 'uci') {
        this.later(() => {
          this.emit('id name Fake Engine')
          this.emit('uciok')
        })
      } else if (message === 'isready') {
        this.later(() => this.emit('readyok'))
      }
    }
    if (/^go\b/.test(message) && this.onGo) this.onGo(message, this)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Posts one output line to the engine, as the worker would. */
  emit(line: string): void {
    this.onmessage?.({ data: line } as MessageEvent)
  }

  /** Posts a non-string message, as the progress reporter in the real script can. */
  emitRaw(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent)
  }

  /** Raises a worker error. */
  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent)
  }

  /** Commands sent since the last call. */
  drainSent(): string[] {
    return this.sent.splice(0)
  }

  private later(fn: () => void): void {
    setTimeout(fn, 0)
  }
}

/** Waits for pending timers of zero delay and microtasks to run. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
