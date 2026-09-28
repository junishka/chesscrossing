/// <reference types="node" />
/**
 * Plays the real Stockfish 19 lite build under Node through createEngine, with
 * the package's Node loader standing in for the Web Worker. Skipped when the
 * stockfish package is not installed.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { START_FEN } from '../contracts/chess'
import { createEngine, type WorkerLike } from './engine'
import { isUciMove } from './protocol'

const require = createRequire(import.meta.url)
const loaderPath = fileURLToPath(new URL('../../node_modules/stockfish/index.js', import.meta.url))
const enginePath = fileURLToPath(new URL('../../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url))
const present = existsSync(loaderPath) && existsSync(enginePath)

interface NodeStockfish {
  listener?: (line: string) => void
  sendCommand: (command: string) => void
}

/** Wraps the Node build as a WorkerLike: commands wait until the engine has loaded. */
function nodeWorker(): WorkerLike {
  const pending: string[] = []
  let engine: NodeStockfish | null = null
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message: string) {
      if (engine) engine.sendCommand(message)
      else pending.push(message)
    },
    terminate() {
      engine = null
    },
  }
  const init = require(loaderPath) as (path: string) => Promise<NodeStockfish>
  init(enginePath).then(
    (e) => {
      e.listener = (line: string) => worker.onmessage?.({ data: line } as MessageEvent)
      engine = e
      for (const c of pending.splice(0)) e.sendCommand(c)
    },
    (err: unknown) => worker.onerror?.({ message: String(err) } as ErrorEvent),
  )
  return worker
}

describe.skipIf(!present)('Stockfish 19 lite under Node', () => {
  it('answers position startpos, go depth 6 with a legal-looking best move and a score', { timeout: 60000 }, async () => {
    const engine = createEngine({ workerFactory: nodeWorker })
    await engine.ready()

    const evaluation = await engine.evaluate(START_FEN, { depth: 6 })
    expect(evaluation.depth).toBeGreaterThanOrEqual(6)
    expect(typeof evaluation.cp).toBe('number')
    expect(evaluation.mate).toBeUndefined()
    // From the start, White is a little better, and not by much.
    expect(evaluation.cp as number).toBeGreaterThan(-100)
    expect(evaluation.cp as number).toBeLessThan(150)
    expect(evaluation.bestMove).toBeDefined()
    expect(isUciMove(evaluation.bestMove as string)).toBe(true)
    // Only a pawn or a knight can move first, from the second rank or the back rank.
    expect(evaluation.bestMove as string).toMatch(/^([a-h]2[a-h][34]|[bg]1[a-h]3)$/)

    const move = await engine.bestMove(START_FEN, { strength: 1 })
    expect(isUciMove(move)).toBe(true)
    expect(move).toMatch(/^([a-h]2[a-h][34]|[bg]1[a-h]3)$/)

    // Black to move: the score is reported from White's side.
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    const black = await engine.evaluate(afterE4, { depth: 6 })
    expect(typeof black.cp).toBe('number')
    expect(black.cp as number).toBeGreaterThan(-100)
    expect(black.cp as number).toBeLessThan(150)

    engine.dispose()
  })
})
