// Engine Worker: a thin shell around engineCore. Receives EngineRequest, posts EngineMessage.
//
// Limitation: the worker is single-threaded and the search is synchronous, so a 'stop' message
// cannot be processed while a search is running; a running search ends when its own `timeMs`
// deadline is reached (always within timeMs + 100). A 'stop' that arrives between requests is
// discarded on purpose: `search` clears the flag on entry, so a stale stop never truncates the
// next search (e.g. the one posted right after an undo).
//
// Two instances run at once in the station, `chair` and `soundings` (BIBLE.md 5.3); each has its own
// engine state because a Worker has its own module scope. The instance's name is `self.name`.

import type { EngineMessage, EngineRequest } from '../types'
import { perft, requestStop, search } from './engineCore'

const post = (msg: EngineMessage): void => { self.postMessage(msg) }

/** Seed for the randomised levels when the request names none: distinct per request, so two games differ. */
const seedFor = (id: number): number => (Date.now() ^ Math.imul(id, 0x9e3779b1)) >>> 0

function handle(req: EngineRequest): void {
  if (req.type === 'stop') { requestStop(); return }
  try {
    if (req.type === 'perft') {
      const t0 = performance.now()
      const nodes = perft(req.fen, req.depth)
      post({ id: req.id, type: 'perft', nodes, timeMs: Math.round(performance.now() - t0) })
      return
    }
    if (req.type === 'eval') {
      const r = search(req.fen, { timeMs: req.timeMs, level: 5 })
      const { move: _move, lines: _lines, ...score } = r
      post({ id: req.id, type: 'eval', ...score })
      return
    }
    const r = search(req.fen, {
      timeMs: req.timeMs,
      maxDepth: req.maxDepth,
      level: req.level,
      seed: req.seed ?? seedFor(req.id),
      window: req.window,
      multiPv: req.multiPv,
    })
    post({ id: req.id, type: 'result', ...r })
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

self.onmessage = (e: MessageEvent<EngineRequest>): void => { handle(e.data) }
