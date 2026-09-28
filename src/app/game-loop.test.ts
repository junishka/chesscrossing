import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game } from '../board'
import type { BoardController } from '../contracts/board'
import { createBus } from '../contracts/bus'
import type { Color, GameSnapshot, MoveRecord } from '../contracts/chess'
import type { BestMoveOptions, Engine, EngineEvaluation, EvaluateOptions } from '../contracts/engine'
import type { AppEvent, AppEventOf } from '../contracts/events'
import { EngineStoppedError } from '../engine'
import { createGameLoop } from './game-loop'

/** A board with the real rules and the contract's events, and no DOM. */
function fakeBoard(bus: ReturnType<typeof createBus>): BoardController & { interactive: boolean; game: Game; playing: boolean } {
  const game = new Game()
  const b = {
    interactive: true,
    game,
    playing: false,
    newGame(opts: { fen?: string; playerColor?: Color } = {}): GameSnapshot {
      game.reset({ fen: opts.fen, playerColor: opts.playerColor ?? game.playerColor })
      b.playing = true
      const snapshot = game.snapshot()
      bus.emit({ type: 'game:new', snapshot })
      return snapshot
    },
    snapshot: () => game.snapshot(),
    applyMove(uci: string, by: 'player' | 'opponent'): MoveRecord | null {
      if (!b.playing) return null
      const record = game.move(uci)
      if (!record) return null
      const snapshot = game.snapshot()
      bus.emit({ type: 'game:move', move: record, snapshot, by })
      if (snapshot.isGameOver && snapshot.result) {
        b.playing = false
        bus.emit({ type: 'game:over', result: snapshot.result, snapshot })
      } else if (record.check) {
        bus.emit({ type: 'game:check', color: game.turn(), snapshot })
      }
      return record
    },
    legalMoves: (from?: string) => game.legalMoves(from),
    setInteractive(on: boolean) {
      b.interactive = on
    },
    setOrientation() {},
    resign() {
      if (!b.playing) return
      const result = game.resign(game.playerColor)
      if (!result) return
      b.playing = false
      bus.emit({ type: 'game:over', result, snapshot: game.snapshot() })
    },
    setTrayVisible() {},
    destroy() {},
  }
  return b
}

interface Scripted {
  engine: Engine
  calls: { kind: 'evaluate' | 'bestMove'; fen: string; options?: BestMoveOptions | EvaluateOptions }[]
  readyNow: () => void
  failReady: (err: Error) => void
  stopped: number
  /** Answers the oldest unanswered evaluate. */
  answerEvaluate: (ev: EngineEvaluation) => void
  /** Answers the oldest unanswered bestMove. */
  answerBestMove: (uci: string) => void
  pending: () => number
}

/** An engine whose every answer the test gives, in order, as the real queue would. */
function scriptedEngine(opts: { ready?: boolean } = {}): Scripted {
  let resolveReady: () => void = () => undefined
  let rejectReady: (err: Error) => void = () => undefined
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  ready.catch(() => undefined)
  if (opts.ready !== false) resolveReady()
  const evaluations: { resolve: (ev: EngineEvaluation) => void; reject: (err: Error) => void }[] = []
  const moves: { resolve: (uci: string) => void; reject: (err: Error) => void }[] = []
  const s: Scripted = {
    calls: [],
    stopped: 0,
    readyNow: () => resolveReady(),
    failReady: (err) => rejectReady(err),
    answerEvaluate: (ev) => evaluations.shift()?.resolve(ev),
    answerBestMove: (uci) => moves.shift()?.resolve(uci),
    pending: () => evaluations.length + moves.length,
    engine: {
      ready: () => ready,
      evaluate(fen, options) {
        s.calls.push({ kind: 'evaluate', fen, options })
        return new Promise((resolve, reject) => evaluations.push({ resolve, reject }))
      },
      bestMove(fen, options) {
        s.calls.push({ kind: 'bestMove', fen, options })
        return new Promise((resolve, reject) => moves.push({ resolve, reject }))
      },
      stop() {
        s.stopped++
        const err = new EngineStoppedError()
        for (const e of evaluations.splice(0)) e.reject(err)
        for (const m of moves.splice(0)) m.reject(err)
      },
      dispose() {},
    },
  }
  return s
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

function harness(opts: { ready?: boolean } = {}) {
  const bus = createBus()
  const board = fakeBoard(bus)
  const scripted = scriptedEngine(opts)
  const events: AppEvent[] = []
  bus.onAny((e) => events.push(e))
  const loop = createGameLoop({ bus, board, engine: scripted.engine, initialStrength: 3 })
  const of = <T extends AppEvent['type']>(type: T): AppEventOf<T>[] => events.filter((e): e is AppEventOf<T> => e.type === type)
  return { bus, board, scripted, events, loop, of }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.useRealTimers()
})

describe('createGameLoop', () => {
  it('starts a game at the named strength when no game is on, with the chosen colour', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    expect(h.loop.strength()).toBe(3)
    h.bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    expect(h.loop.strength()).toBe(1)
    await flush()
    expect(h.of('player:new-game')).toHaveLength(1)
    expect(h.of('player:new-game')[0]!.color).toBe('w')
    expect(h.of('game:new')).toHaveLength(1)
    expect(h.loop.isPlaying()).toBe(true)
    expect(h.board.interactive).toBe(true)
    // The starting position is evaluated; the engine is not asked to move for White.
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate'])
    h.scripted.answerEvaluate({ depth: 12, cp: 20, bestMove: 'e2e4' })
    await flush()
    const evals = h.of('game:eval')
    expect(evals).toHaveLength(1)
    expect(evals[0]!.cp).toBe(20)
    expect(evals[0]!.classification).toBeUndefined()
    expect(evals[0]!.by).toBeUndefined()
  })

  it('waits for the engine when an hour is named before it is ready', async () => {
    const h = harness({ ready: false })
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 1, strength: 3 })
    await flush()
    expect(h.loop.isStarting()).toBe(true)
    expect(h.of('game:new')).toHaveLength(0)
    // A second hour named while waiting changes the strength and starts nothing extra.
    h.bus.emit({ type: 'player:hour', index: 3, strength: 8 })
    await flush()
    h.scripted.readyNow()
    await flush()
    expect(h.of('game:new')).toHaveLength(1)
    expect(h.loop.isStarting()).toBe(false)
    expect(h.loop.strength()).toBe(8)
  })

  it('does not start when the engine never becomes ready, and says so', async () => {
    const h = harness({ ready: false })
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 1, strength: 3 })
    h.scripted.failReady(new Error('no wasm'))
    await flush()
    expect(h.of('game:new')).toHaveLength(0)
    const errors = h.of('engine:status').filter((e) => e.status === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.detail).toBe('no wasm')
    expect(h.loop.isStarting()).toBe(false)
  })

  it('asks the engine for the first move when the player takes black', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:color', color: 'b' })
    expect(h.loop.nextColor()).toBe('b')
    h.bus.emit({ type: 'player:hour', index: 2, strength: 6 })
    await flush()
    expect(h.of('game:new')[0]!.snapshot.playerColor).toBe('b')
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate', 'bestMove'])
    expect((h.scripted.calls[1]!.options as BestMoveOptions).strength).toBe(6)
    expect(h.of('engine:status').at(-1)!.status).toBe('thinking')
    h.scripted.answerEvaluate({ depth: 12, cp: 20 })
    h.scripted.answerBestMove('e2e4')
    await flush()
    const moves = h.of('game:move')
    expect(moves).toHaveLength(1)
    expect(moves[0]!.by).toBe('opponent')
    expect(moves[0]!.move.uci).toBe('e2e4')
    // The new position is evaluated and reported for the opponent.
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate', 'bestMove', 'evaluate'])
    h.scripted.answerEvaluate({ depth: 12, cp: 30 })
    await flush()
    const evals = h.of('game:eval')
    expect(evals).toHaveLength(2)
    expect(evals[1]!.by).toBe('opponent')
    expect(evals[1]!.classification).toBe('good')
  })

  it('classifies the player\'s move and answers it at the current strength', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    await flush()
    h.scripted.answerEvaluate({ depth: 12, cp: 20 })
    await flush()

    // During a game, naming another hour only changes the strength.
    h.bus.emit({ type: 'player:hour', index: 3, strength: 8 })
    await flush()
    expect(h.of('game:new')).toHaveLength(1)
    expect(h.of('player:new-game')).toHaveLength(1)

    const record = h.board.applyMove('f2f3', 'player')
    expect(record).not.toBeNull()
    await flush()
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate', 'evaluate'])
    expect(h.scripted.calls[1]!.fen).toBe(record!.fen)
    h.scripted.answerEvaluate({ depth: 12, cp: -340 })
    await flush()
    const evals = h.of('game:eval')
    expect(evals).toHaveLength(2)
    expect(evals[1]).toMatchObject({ type: 'game:eval', fen: record!.fen, cp: -340, swing: -360, classification: 'blunder', by: 'player' })

    // Then the opponent is asked, at the strength named last.
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate', 'evaluate', 'bestMove'])
    expect((h.scripted.calls[2]!.options as BestMoveOptions).strength).toBe(8)
    h.scripted.answerBestMove('e7e5')
    await flush()
    const moves = h.of('game:move')
    expect(moves).toHaveLength(2)
    expect(moves[1]).toMatchObject({ by: 'opponent', move: { uci: 'e7e5' } })
    expect(h.scripted.calls.map((c) => c.kind)).toEqual(['evaluate', 'evaluate', 'bestMove', 'evaluate'])
    h.scripted.answerEvaluate({ depth: 12, cp: -300 })
    await flush()
    expect(h.of('game:eval')).toHaveLength(3)
    expect(h.of('game:eval')[2]).toMatchObject({ by: 'opponent', swing: -40, classification: 'good' })
  })

  it('locks the board at game over and does not ask for a move in a finished position', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    await flush()
    h.scripted.answerEvaluate({ depth: 12, cp: 20 })
    await flush()
    // Fool's mate, with the opponent's replies applied by hand.
    for (const uci of ['f2f3', 'e7e5', 'g2g4']) h.board.applyMove(uci, uci.startsWith('e7') ? 'opponent' : 'player')
    await flush()
    // Answer the evaluations so far, and the bestMove the loop asked for after f3.
    while (h.scripted.pending() > 0) {
      const last = h.scripted.calls.filter((c) => c.kind === 'bestMove').length
      h.scripted.answerEvaluate({ depth: 12, cp: -50 })
      if (last > 0) h.scripted.answerBestMove('e7e5')
      await flush()
    }
    const before = h.scripted.calls.length
    const mate = h.board.applyMove('d8h4', 'opponent')
    expect(mate).not.toBeNull()
    expect(h.of('game:over')).toHaveLength(1)
    expect(h.board.interactive).toBe(false)
    expect(h.loop.isPlaying()).toBe(false)
    await flush()
    // The mating position is evaluated but nobody is asked to move.
    expect(h.scripted.calls.slice(before).map((c) => c.kind)).toEqual(['evaluate'])
    h.scripted.answerEvaluate({ depth: 0, mate: 0 })
    await flush()
    const last = h.of('game:eval').at(-1)!
    expect(last.by).toBe('opponent')
    expect(last.classification).toBe('excellent')
    expect(last.mate).toBe(0)
  })

  it('resigns on player:resign and stops a search in flight', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    await flush()
    h.scripted.answerEvaluate({ depth: 12, cp: 20 })
    await flush()
    h.board.applyMove('e2e4', 'player')
    await flush()
    h.scripted.answerEvaluate({ depth: 12, cp: 30 })
    await flush()
    expect(h.scripted.calls.at(-1)!.kind).toBe('bestMove')
    h.bus.emit({ type: 'player:resign' })
    expect(h.of('game:over')).toHaveLength(1)
    expect(h.of('game:over')[0]!.result).toEqual({ outcome: 'resignation', winner: 'b' })
    expect(h.scripted.stopped).toBe(1)
    await flush()
    // The stopped search is not an error.
    expect(h.of('engine:status').filter((e) => e.status === 'error')).toHaveLength(0)
    expect(h.of('game:move')).toHaveLength(1)
  })

  it('starts a fresh game after the last has ended and drops stale replies', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    h.bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    await flush()
    h.scripted.answerEvaluate({ depth: 12, cp: 20 })
    await flush()
    h.board.applyMove('e2e4', 'player')
    await flush()
    h.bus.emit({ type: 'player:resign' })
    await flush()
    h.bus.emit({ type: 'player:color', color: 'b' })
    h.bus.emit({ type: 'player:hour', index: 1, strength: 3 })
    await flush()
    expect(h.of('game:new')).toHaveLength(2)
    expect(h.of('game:new')[1]!.snapshot.playerColor).toBe('b')
    expect(h.board.interactive).toBe(true)
    // Nothing from the first game reached the second.
    expect(h.of('game:move')).toHaveLength(0 + 1)
    expect(h.board.game.history()).toHaveLength(0)
  })

  it('reports an engine failure as a status and keeps the game', async () => {
    const h = harness()
    cleanups.push(() => h.loop.destroy())
    const bad: Engine = {
      ...h.scripted.engine,
      evaluate: () => Promise.reject(new Error('the search ended without a score')),
      bestMove: () => Promise.reject(new Error('worker gone')),
    }
    const bus = createBus()
    const board = fakeBoard(bus)
    const events: AppEvent[] = []
    bus.onAny((e) => events.push(e))
    const loop = createGameLoop({ bus, board, engine: bad, initialStrength: 3 })
    cleanups.push(() => loop.destroy())
    bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    await flush()
    board.applyMove('e2e4', 'player')
    await flush()
    const errors = events.filter((e): e is AppEventOf<'engine:status'> => e.type === 'engine:status' && e.status === 'error')
    expect(errors.map((e) => e.detail)).toEqual(['the search ended without a score', 'the search ended without a score'])
    expect(loop.isPlaying()).toBe(true)
    expect(events.filter((e) => e.type === 'game:eval')).toHaveLength(0)
  })
})
