// Difficulty as a sea state on the Beaufort scale, docs/BIBLE.md §5.3 and §14.9. Pure data.
import type { EngineLevel, SeaState } from '../types'

/** One sea state: Beaufort's own description, the engine setting behind it, and the nominal rating. */
export interface SeaStateDef {
  state: SeaState
  name: string
  /** Beaufort's sea description, verbatim; the only text the barometer carries. */
  card: string
  level: EngineLevel
  /** Fixed think time for the timed levels. */
  timeMs?: number
  /** Centipawn window for the randomised levels. */
  windowCp?: number
  /** The rating the station's arithmetic assumes for this state. */
  nominal: number
}

/** The nine states, 0 Calm to 8 Gale. */
export const seaStates: SeaStateDef[] = [
  { state: 0, name: 'Calm', card: 'Sea like a mirror.', level: 1, windowCp: 150, nominal: 800 },
  { state: 1, name: 'Light Air', card: 'Ripples with the appearance of scales.', level: 1, windowCp: 90, nominal: 1000 },
  { state: 2, name: 'Light Breeze', card: 'Small wavelets. Crests do not break.', level: 2, windowCp: 60, nominal: 1200 },
  { state: 3, name: 'Gentle Breeze', card: 'Large wavelets. Scattered white horses.', level: 3, timeMs: 400, nominal: 1400 },
  { state: 4, name: 'Moderate Breeze', card: 'Small waves, becoming longer. Fairly frequent white horses.', level: 4, timeMs: 1200, nominal: 1650 },
  { state: 5, name: 'Fresh Breeze', card: 'Moderate waves. Many white horses.', level: 5, timeMs: 2000, nominal: 1850 },
  { state: 6, name: 'Strong Breeze', card: 'Large waves begin to form. Some spray.', level: 5, timeMs: 3500, nominal: 1950 },
  { state: 7, name: 'Near Gale', card: 'Sea heaps up. Foam blown in streaks.', level: 5, timeMs: 6000, nominal: 2050 },
  { state: 8, name: 'Gale', card: 'Moderately high waves. Spindrift.', level: 5, timeMs: 10000, nominal: 2150 },
]

/** The default state. */
export const DEFAULT_SEA_STATE: SeaState = 4
/** Where the barometer is found when the season begins. "It was left at eight." */
export const SEASON_START_SEA_STATE: SeaState = 8
/** The house game in Chapter Nine is played at this state. */
export const HOUSE_GAME_SEA_STATE: SeaState = 5
/** The Visitor's strength when the season begins. */
export const RATING_START = 1400
/** The station's K. */
export const RATING_K = 24
/** The floor of the chair's think budget under a watch, in milliseconds. */
export const CHAIR_BUDGET_FLOOR_MS = 300
/** The chair waits at least this long before it moves. */
export const CHAIR_MIN_WAIT_MS = 900
/** The soundings search behind the gauge and the Second: level 5 for this long, on its own worker. */
export const SOUNDINGS_MS = 600

/** The definition for a state. */
export function seaState(state: SeaState): SeaStateDef {
  return seaStates[state]
}

/** The barometer's label: `SEA STATE 4`. */
export function seaStateLabel(state: SeaState): string {
  return `SEA STATE ${state}`
}

/**
 * The chair's think time under a watch: `min(seaStateMs, max(300, remainingMs / 25 + 0.8 * incrementMs))`.
 * No Watch (`remainingMs` null or not finite) uses the sea-state time unchanged. The randomised
 * states, which search by depth rather than time, are given the floor.
 */
export function chairBudgetMs(state: SeaState, remainingMs: number | null, incrementMs: number): number {
  const fixed = seaStates[state].timeMs ?? CHAIR_BUDGET_FLOOR_MS
  if (remainingMs === null || !Number.isFinite(remainingMs)) return fixed
  return Math.min(fixed, Math.max(CHAIR_BUDGET_FLOOR_MS, remainingMs / 25 + 0.8 * incrementMs))
}

/** The expected score against a nominal rating: `1 / (1 + 10^((nominal − rating) / 400))`. */
export function expectedScore(rating: number, nominal: number): number {
  return 1 / (1 + Math.pow(10, (nominal - rating) / 400))
}

/** The station rating after a finished game: `rating + 24 × (score − expected)`, score 1, ½ or 0. */
export function ratingUpdate(rating: number, score: 0 | 0.5 | 1, nominal: number): number {
  return rating + RATING_K * (score - expectedScore(rating, nominal))
}
