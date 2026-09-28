/**
 * The engine: Stockfish 19 (lite, single-threaded) in a Web Worker.
 * Implemented in src/engine. The files it loads live in public/engine.
 */
import type { Strength } from './chess'

export interface EngineEvaluation {
  /** Centipawns from White's point of view. Absent when a mate is found. */
  cp?: number
  /** Mate in N from White's point of view: positive means White mates, negative means Black mates. */
  mate?: number
  depth: number
  /** Best move in UCI form, if the search produced one. */
  bestMove?: string
}

export interface BestMoveOptions {
  strength: Strength
  /** Override the strength's default think time. */
  movetimeMs?: number
}

export interface EvaluateOptions {
  depth?: number
  movetimeMs?: number
}

export interface Engine {
  /** Resolves once the worker has answered `uci` and `isready`. */
  ready(): Promise<void>
  /**
   * The opponent's move for this position. Weak strengths must play like a
   * person who is not very good, not like a strong engine with random noise.
   * Use Skill Level and limited think time or depth, per the engine's docs.
   */
  bestMove(fen: string, options: BestMoveOptions): Promise<string>
  /** A quick evaluation of the position. Used to classify the last move. */
  evaluate(fen: string, options?: EvaluateOptions): Promise<EngineEvaluation>
  /** Stops any running search. Pending promises reject with an EngineStoppedError. */
  stop(): void
  dispose(): void
}

export interface EngineOptions {
  /** URL of the engine script. Default '/engine/stockfish-19-lite-single.js'. */
  scriptUrl?: string
}

export interface EngineModule {
  createEngine(options?: EngineOptions): Engine
  /** Default think time per strength, in milliseconds. */
  readonly THINK_TIME_MS: Readonly<Record<Strength, number>>
  /** Stockfish Skill Level (0-20) per strength. */
  readonly SKILL_LEVEL: Readonly<Record<Strength, number>>
}
