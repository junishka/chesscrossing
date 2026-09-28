import { afterEach, describe, expect, it, vi } from 'vitest'
import { START_FEN } from '../contracts/chess'
import type { Engine } from '../contracts/engine'
import { createEngine } from './engine'
import { EngineError, EngineStoppedError, EngineTimeoutError } from './errors'
import { FakeWorker, tick, type FakeWorkerOptions } from './fake-worker'
import { SKILL_LEVEL, THINK_TIME_MS } from './strength'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

function make(options: FakeWorkerOptions = {}, engineOptions: Record<string, unknown> = {}): { engine: Engine; worker: FakeWorker } {
  let worker: FakeWorker | null = null
  const engine = createEngine({
    workerFactory: (url) => {
      worker = new FakeWorker(url, options)
      return worker
    },
    ...engineOptions,
  })
  if (!worker) throw new Error('factory was not called')
  return { engine, worker }
}

/** Settles a promise into a tagged result so tests can assert on rejections without unhandled errors. */
function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('handshake', () => {
  it('loads the default script as a worker and resolves ready after uciok and readyok', async () => {
    const { engine, worker } = make()
    expect(worker.scriptUrl).toBe('/engine/stockfish-19-lite-single.js')
    expect(worker.sent).toEqual(['uci'])
    await engine.ready()
    expect(worker.sent).toEqual(['uci', 'ucinewgame', 'isready'])
    engine.dispose()
  })

  it('honours scriptUrl', () => {
    const { engine, worker } = make({}, { scriptUrl: '/elsewhere/sf.js' })
    expect(worker.scriptUrl).toBe('/elsewhere/sf.js')
    engine.dispose()
  })

  it('does not treat other lines as the handshake', async () => {
    const { engine, worker } = make({ autoHandshake: false })
    worker.emit('Stockfish 19 Lite WASM by the Stockfish developers (see AUTHORS file)')
    worker.emit('id name Stockfish 19')
    worker.emit('option name Skill Level type spin default 20 min 0 max 20')
    expect(worker.sent).toEqual(['uci'])
    worker.emit('uciok')
    expect(worker.sent).toEqual(['uci', 'ucinewgame', 'isready'])
    worker.emit('readyok')
    await expect(engine.ready()).resolves.toBeUndefined()
    engine.dispose()
  })

  it('rejects ready with EngineTimeoutError when the worker never answers', async () => {
    vi.useFakeTimers()
    const { engine, worker } = make({ autoHandshake: false }, { readyTimeoutMs: 1000 })
    const ready = settle(engine.ready())
    await vi.advanceTimersByTimeAsync(1001)
    const r = await ready
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineTimeoutError)
    expect(worker.terminated).toBe(true)
    const later = await settle(engine.bestMove(START_FEN, { strength: 1 }))
    expect(later.ok).toBe(false)
    if (!later.ok) expect(later.error).toBeInstanceOf(EngineTimeoutError)
  })

  it('rejects everything when the worker cannot be made', async () => {
    const engine = createEngine({
      workerFactory: () => {
        throw new Error('no workers here')
      },
    })
    const r = await settle(engine.ready())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineError)
    engine.dispose()
  })
})

describe('bestMove', () => {
  it('sets the skill level, the position, and go movetime for the strength', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const p = engine.bestMove(START_FEN, { strength: 3 })
    expect(worker.sent).toEqual([
      `setoption name Skill Level value ${SKILL_LEVEL[3]}`,
      `position fen ${START_FEN}`,
      `go movetime ${THINK_TIME_MS[3]}`,
    ])
    worker.emit('info depth 1 seldepth 1 multipv 1 score cp 20 nodes 20 nps 2000 time 1 pv e2e4')
    worker.emit('info depth 1 seldepth 1 multipv 2 score cp 15 nodes 20 nps 2000 time 1 pv d2d4')
    worker.emit('bestmove e2e4 ponder e7e5')
    await expect(p).resolves.toBe('e2e4')
    engine.dispose()
  })

  it('does not resend the skill level when it has not changed, and does when it has', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const a = engine.bestMove(START_FEN, { strength: 5 })
    worker.emit('bestmove e2e4')
    await a
    worker.drainSent()
    const b = engine.bestMove(AFTER_E4, { strength: 5 })
    expect(worker.sent).toEqual([`position fen ${AFTER_E4}`, `go movetime ${THINK_TIME_MS[5]}`])
    worker.emit('bestmove e7e5')
    await b
    worker.drainSent()
    const c = engine.bestMove(START_FEN, { strength: 8, movetimeMs: 40 })
    expect(worker.sent).toEqual([`setoption name Skill Level value ${SKILL_LEVEL[8]}`, `position fen ${START_FEN}`, 'go movetime 40'])
    worker.emit('bestmove d2d4')
    await expect(c).resolves.toBe('d2d4')
    engine.dispose()
  })

  it('waits for the handshake before searching', async () => {
    const { engine, worker } = make({ autoHandshake: false })
    const p = engine.bestMove(START_FEN, { strength: 1 })
    expect(worker.sent).toEqual(['uci'])
    worker.emit('uciok')
    worker.emit('readyok')
    expect(worker.sent.slice(-1)[0]).toBe(`go movetime ${THINK_TIME_MS[1]}`)
    worker.emit('bestmove g1f3')
    await expect(p).resolves.toBe('g1f3')
    engine.dispose()
  })

  it('rejects with EngineError when the engine has no move', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = settle(engine.bestMove(START_FEN, { strength: 1 }))
    worker.emit('info depth 0 score mate 0')
    worker.emit('bestmove (none)')
    const r = await p
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(EngineError)
      expect(r.error).not.toBeInstanceOf(EngineStoppedError)
    }
    engine.dispose()
  })

  it('rejects a fen it cannot read without touching the worker', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const r = await settle(engine.bestMove('garbage', { strength: 1 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineError)
    expect(worker.sent).toEqual([])
    engine.dispose()
  })

  it('ignores messages that are not strings', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.bestMove(START_FEN, { strength: 1 })
    worker.emitRaw({ percent: 0.5 })
    worker.emitRaw(42)
    worker.emit('bestmove e2e4')
    await expect(p).resolves.toBe('e2e4')
    engine.dispose()
  })
})

describe('queue', () => {
  it('runs one search at a time, in order', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const first = engine.bestMove(START_FEN, { strength: 2 })
    const second = engine.evaluate(AFTER_E4, { depth: 8 })
    const third = engine.bestMove(AFTER_E4, { strength: 2 })
    // Only the first search has been sent.
    expect(worker.sent.filter((c) => c.startsWith('go'))).toEqual([`go movetime ${THINK_TIME_MS[2]}`])
    worker.emit('bestmove e2e4')
    await expect(first).resolves.toBe('e2e4')
    // Then the evaluation, at full strength.
    expect(worker.sent.slice(-3)).toEqual(['setoption name Skill Level value 20', `position fen ${AFTER_E4}`, 'go depth 8'])
    worker.emit('info depth 8 seldepth 10 multipv 1 score cp 30 nodes 100 nps 1000 time 10 pv e7e5')
    worker.emit('bestmove e7e5')
    await expect(second).resolves.toEqual({ depth: 8, cp: -30, bestMove: 'e7e5' })
    // Then the third, back at the strength's level.
    expect(worker.sent.slice(-3)).toEqual([`setoption name Skill Level value ${SKILL_LEVEL[2]}`, `position fen ${AFTER_E4}`, `go movetime ${THINK_TIME_MS[2]}`])
    worker.emit('bestmove c7c5')
    await expect(third).resolves.toBe('c7c5')
    engine.dispose()
  })

  it('a stray bestmove with nothing running is ignored', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.emit('bestmove e2e4')
    const p = engine.bestMove(START_FEN, { strength: 1 })
    worker.emit('bestmove d2d4')
    await expect(p).resolves.toBe('d2d4')
    engine.dispose()
  })
})

describe('evaluate', () => {
  it('uses the default depth and reports White to move as is', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const p = engine.evaluate(START_FEN)
    expect(worker.sent).toEqual(['setoption name Skill Level value 20', `position fen ${START_FEN}`, 'go depth 12'])
    worker.emit('info depth 10 seldepth 14 multipv 1 score cp 22 nodes 500 nps 5000 time 100 pv e2e4')
    worker.emit('info depth 11 seldepth 14 multipv 1 score cp 40 lowerbound nodes 600 nps 5000 time 120 pv e2e4')
    worker.emit('info depth 11 seldepth 15 multipv 1 score cp 35 nodes 700 nps 5000 time 140 pv e2e4 e7e5')
    worker.emit('info depth 12 currmove d2d4 currmovenumber 2')
    worker.emit('info depth 12 seldepth 16 multipv 1 score cp 10 upperbound nodes 800 nps 5000 time 160 pv e2e4')
    worker.emit('bestmove e2e4 ponder e7e5')
    await expect(p).resolves.toEqual({ depth: 11, cp: 35, bestMove: 'e2e4' })
    engine.dispose()
  })

  it('flips centipawns when Black is to move', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.evaluate(AFTER_E4, { depth: 6 })
    worker.emit('info depth 6 seldepth 8 multipv 1 score cp 35 nodes 500 nps 5000 time 10 pv e7e5')
    worker.emit('bestmove e7e5')
    await expect(p).resolves.toEqual({ depth: 6, cp: -35, bestMove: 'e7e5' })
    engine.dispose()
  })

  it('flips mate scores when Black is to move', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.evaluate(AFTER_E4, { depth: 6 })
    worker.emit('info depth 6 seldepth 8 multipv 1 score mate -2 nodes 500 nps 5000 time 10 pv e7e5')
    worker.emit('bestmove e7e5')
    await expect(p).resolves.toEqual({ depth: 6, mate: 2, bestMove: 'e7e5' })
    engine.dispose()
  })

  it('keeps mate scores when White is to move, without cp', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.evaluate(START_FEN, { depth: 6 })
    worker.emit('info depth 6 seldepth 8 multipv 1 score mate 3 nodes 500 nps 5000 time 10 pv f3f7')
    worker.emit('bestmove f3f7')
    const result = await p
    expect(result).toEqual({ depth: 6, mate: 3, bestMove: 'f3f7' })
    expect('cp' in result).toBe(false)
    engine.dispose()
  })

  it('takes only the principal line when several are reported', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.evaluate(START_FEN, { depth: 4 })
    worker.emit('info depth 4 seldepth 6 multipv 1 score cp 18 nodes 100 nps 1000 time 5 pv e2e4')
    worker.emit('info depth 4 seldepth 6 multipv 2 score cp 12 nodes 100 nps 1000 time 5 pv d2d4')
    worker.emit('info depth 4 seldepth 6 multipv 3 score cp 5 nodes 100 nps 1000 time 5 pv g1f3')
    worker.emit('bestmove e2e4')
    await expect(p).resolves.toEqual({ depth: 4, cp: 18, bestMove: 'e2e4' })
    engine.dispose()
  })

  it('reports a checkmated position with mate 0 and no best move', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = engine.evaluate('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', { depth: 6 })
    worker.emit('info depth 0 score mate 0')
    worker.emit('bestmove (none)')
    const result = await p
    expect(result).toEqual({ depth: 0, mate: 0 })
    expect('bestMove' in result).toBe(false)
    engine.dispose()
  })

  it('sends both limits when both are given, and only movetime when asked', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const a = engine.evaluate(START_FEN, { depth: 10, movetimeMs: 300 })
    expect(worker.sent.slice(-1)[0]).toBe('go depth 10 movetime 300')
    worker.emit('info depth 10 score cp 1 pv e2e4')
    worker.emit('bestmove e2e4')
    await a
    const b = engine.evaluate(START_FEN, { movetimeMs: 300 })
    expect(worker.sent.slice(-1)[0]).toBe('go movetime 300')
    worker.emit('info depth 10 score cp 1 pv e2e4')
    worker.emit('bestmove e2e4')
    await b
    engine.dispose()
  })

  it('rejects when the search ends without any score', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const p = settle(engine.evaluate(START_FEN, { depth: 6 }))
    worker.emit('bestmove e2e4')
    const r = await p
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineError)
    engine.dispose()
  })
})

describe('stop', () => {
  it('sends stop, rejects the running and queued searches, and resumes after the engine answers', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    const running = settle(engine.bestMove(START_FEN, { strength: 4 }))
    const queued = settle(engine.evaluate(START_FEN))
    engine.stop()
    expect(worker.sent.slice(-1)[0]).toBe('stop')
    const [r1, r2] = await Promise.all([running, queued])
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toBeInstanceOf(EngineStoppedError)
    if (!r2.ok) expect(r2.error).toBeInstanceOf(EngineStoppedError)

    // A new search waits for the interrupted one's bestmove.
    worker.drainSent()
    const next = engine.bestMove(AFTER_E4, { strength: 4 })
    expect(worker.sent).toEqual([])
    worker.emit('bestmove e2e4')
    expect(worker.sent.slice(-1)[0]).toBe(`go movetime ${THINK_TIME_MS[4]}`)
    worker.emit('bestmove e7e5')
    await expect(next).resolves.toBe('e7e5')
    engine.dispose()
  })

  it('leaves the handshake alone', async () => {
    const { engine, worker } = make({ autoHandshake: false })
    const ready = engine.ready()
    const search = settle(engine.bestMove(START_FEN, { strength: 1 }))
    engine.stop()
    expect(worker.sent).toEqual(['uci'])
    const r = await search
    expect(r.ok).toBe(false)
    worker.emit('uciok')
    worker.emit('readyok')
    await expect(ready).resolves.toBeUndefined()
    engine.dispose()
  })

  it('is harmless with nothing running', async () => {
    const { engine, worker } = make()
    await engine.ready()
    worker.drainSent()
    engine.stop()
    expect(worker.sent).toEqual([])
    engine.dispose()
  })

  it('declares the engine unresponsive when stop is never answered', async () => {
    vi.useFakeTimers()
    const { engine, worker } = make({ autoHandshake: false }, { drainTimeoutMs: 500 })
    worker.emit('uciok')
    worker.emit('readyok')
    await engine.ready()
    const running = settle(engine.bestMove(START_FEN, { strength: 1 }))
    engine.stop()
    await running
    const next = settle(engine.bestMove(START_FEN, { strength: 1 }))
    await vi.advanceTimersByTimeAsync(501)
    const r = await next
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineError)
    expect(worker.terminated).toBe(true)
  })
})

describe('timeouts', () => {
  it('rejects a search that outlives its movetime plus grace with EngineTimeoutError, and stops the engine', async () => {
    vi.useFakeTimers()
    const { engine, worker } = make({ autoHandshake: false }, { searchGraceMs: 100 })
    worker.emit('uciok')
    worker.emit('readyok')
    await engine.ready()
    worker.drainSent()
    const p = settle(engine.bestMove(START_FEN, { strength: 1, movetimeMs: 50 }))
    await vi.advanceTimersByTimeAsync(149)
    expect(worker.sent).not.toContain('stop')
    await vi.advanceTimersByTimeAsync(2)
    const r = await p
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineTimeoutError)
    expect(worker.sent.slice(-1)[0]).toBe('stop')
    // The engine is still usable once the late bestmove arrives.
    const next = engine.bestMove(START_FEN, { strength: 1 })
    worker.emit('bestmove e2e4')
    worker.emit('bestmove d2d4')
    await expect(next).resolves.toBe('d2d4')
    engine.dispose()
  })

  it('gives a depth-only evaluation its own deadline', async () => {
    vi.useFakeTimers()
    const { engine, worker } = make({ autoHandshake: false }, { depthSearchTimeoutMs: 700 })
    worker.emit('uciok')
    worker.emit('readyok')
    await engine.ready()
    const p = settle(engine.evaluate(START_FEN, { depth: 30 }))
    await vi.advanceTimersByTimeAsync(701)
    const r = await p
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineTimeoutError)
    engine.dispose()
  })

  it('the timer starts when the search starts, not when it is queued', async () => {
    vi.useFakeTimers()
    const { engine, worker } = make({ autoHandshake: false }, { searchGraceMs: 100 })
    worker.emit('uciok')
    worker.emit('readyok')
    await engine.ready()
    const first = engine.bestMove(START_FEN, { strength: 1, movetimeMs: 1000 })
    const second = engine.bestMove(START_FEN, { strength: 1, movetimeMs: 50 })
    await vi.advanceTimersByTimeAsync(900)
    worker.emit('bestmove e2e4')
    await expect(first).resolves.toBe('e2e4')
    await vi.advanceTimersByTimeAsync(100)
    worker.emit('bestmove d2d4')
    await expect(second).resolves.toBe('d2d4')
    engine.dispose()
  })
})

describe('worker errors and dispose', () => {
  it('a worker error rejects the running search and everything after', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const running = settle(engine.bestMove(START_FEN, { strength: 1 }))
    const queued = settle(engine.evaluate(START_FEN))
    worker.fail('RuntimeError: memory access out of bounds')
    const [r1, r2] = await Promise.all([running, queued])
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    if (!r1.ok) expect((r1.error as Error).message).toContain('memory access')
    expect(worker.terminated).toBe(true)
    const later = await settle(engine.bestMove(START_FEN, { strength: 1 }))
    expect(later.ok).toBe(false)
    if (!later.ok) expect(later.error).toBeInstanceOf(EngineError)
  })

  it('a worker error before the handshake rejects ready', async () => {
    const { engine, worker } = make({ autoHandshake: false })
    const ready = settle(engine.ready())
    worker.fail('failed to fetch wasm')
    const r = await ready
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBeInstanceOf(EngineError)
  })

  it('dispose terminates the worker and rejects pending work with EngineStoppedError', async () => {
    const { engine, worker } = make()
    await engine.ready()
    const running = settle(engine.bestMove(START_FEN, { strength: 1 }))
    const queued = settle(engine.evaluate(START_FEN))
    engine.dispose()
    expect(worker.terminated).toBe(true)
    const [r1, r2] = await Promise.all([running, queued])
    expect(r1.ok).toBe(false)
    expect(r2.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toBeInstanceOf(EngineStoppedError)
    if (!r2.ok) expect(r2.error).toBeInstanceOf(EngineStoppedError)
    const later = await settle(engine.bestMove(START_FEN, { strength: 1 }))
    expect(later.ok).toBe(false)
    if (!later.ok) expect(later.error).toBeInstanceOf(EngineStoppedError)
    engine.dispose()
    await tick()
  })
})
