/**
 * The engine module. Implements src/contracts/engine.ts.
 * Nothing here is visible and nothing here speaks, so there is no CSS and no copy.
 */
import type { EngineModule } from '../contracts/engine'
import { createEngine } from './engine'
import { SKILL_LEVEL, THINK_TIME_MS } from './strength'

export { createEngine, DEFAULT_EVAL_DEPTH, DEFAULT_SCRIPT_URL } from './engine'
export type { CreateEngineOptions, WorkerFactory, WorkerLike } from './engine'
export { EngineError, EngineStoppedError, EngineTimeoutError } from './errors'
export { FULL_SKILL_LEVEL, SKILL_LEVEL, STRENGTH_TABLE, THINK_TIME_MS } from './strength'
export type { StrengthSetting } from './strength'
export {
  goCommand,
  isCompleteInfo,
  isUciMove,
  normalizeScore,
  parseBestMove,
  parseInfo,
  positionCommand,
  setOptionCommand,
  sideToMove,
  skillLevelCommand,
} from './protocol'
export type { BestMoveLine, CompleteInfo, InfoLine, SearchLimits, UciScore, WhiteScore } from './protocol'

/** The module as the contract sees it. */
export const engineModule: EngineModule = { createEngine, THINK_TIME_MS, SKILL_LEVEL }
