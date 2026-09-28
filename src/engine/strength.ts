/**
 * The eight strengths, mapped to Stockfish's Skill Level and to think time.
 *
 * Why Skill Level and not UCI_Elo
 * -------------------------------
 * Stockfish offers two knobs. `Skill Level` (0 to 20) and `UCI_LimitStrength`
 * with `UCI_Elo` (1320 to 3190). They drive the same mechanism: an Elo figure
 * is converted inside the engine to a fractional Skill Level, and the search
 * behaves the same either way. At a level below 20 the engine searches its
 * four best candidate moves (MultiPV 4), and at depth level + 1 it picks one
 * of them with a weighting that favours the best but does not insist on it,
 * the weaker the level the flatter the weighting. The move that is played is
 * the one picked at that shallow depth, whatever the search finds later.
 *
 * That is the behaviour of a person who sees a little way ahead and chooses a
 * plausible move, not a strong engine that occasionally throws a piece away.
 * Nothing here adds noise of our own.
 *
 * We use Skill Level directly because:
 *   1. The Elo scale was calibrated on the full engine and full network at
 *      tournament time controls. This is the lite network, single threaded,
 *      in WASM, given a fraction of a second. An Elo label would be false
 *      precision. Integer levels claim nothing they cannot keep.
 *   2. Elo 1320 is Skill Level 0. Elo offers no weaker floor.
 *   3. The contract asks for Skill Level per strength, and it is one option
 *      to set instead of two.
 *
 * Think time scales with strength for two reasons. A weak level picks its
 * move at a shallow depth that is reached in a few milliseconds, so longer
 * thought is wasted. And the bible has it that at six he plays quickly and
 * from memory; after ten, as he plays. A gentle opponent answers at once. The
 * strong one takes his time.
 *
 * | strength | Skill Level | think ms | how it plays                                   |
 * | -------- | ----------- | -------- | ---------------------------------------------- |
 * | 1        | 0           | 150      | picks at depth 1 among four; misses tactics    |
 * | 2        | 2           | 250      | picks at depth 3; sees one-move threats        |
 * | 3        | 4           | 350      | picks at depth 5; a club beginner              |
 * | 4        | 6           | 500      | picks at depth 7; an ordinary club player      |
 * | 5        | 9           | 700      | picks at depth 10; a good club player          |
 * | 6        | 12          | 1000     | picks at depth 13; a strong amateur            |
 * | 7        | 16          | 1500     | picks at depth 17; near the engine's own move  |
 * | 8        | 20          | 2500     | the engine's own move, no weakening            |
 *
 * The levels are not evenly spaced because the scale is not: the difference
 * between 0 and 2 is felt, the difference between 17 and 19 is not.
 */
import type { Strength } from '../contracts/chess'

export interface StrengthSetting {
  /** Stockfish Skill Level, 0 to 20. */
  skillLevel: number
  /** Default `go movetime`, in milliseconds. */
  thinkTimeMs: number
}

export const STRENGTH_TABLE: Readonly<Record<Strength, Readonly<StrengthSetting>>> = {
  1: { skillLevel: 0, thinkTimeMs: 150 },
  2: { skillLevel: 2, thinkTimeMs: 250 },
  3: { skillLevel: 4, thinkTimeMs: 350 },
  4: { skillLevel: 6, thinkTimeMs: 500 },
  5: { skillLevel: 9, thinkTimeMs: 700 },
  6: { skillLevel: 12, thinkTimeMs: 1000 },
  7: { skillLevel: 16, thinkTimeMs: 1500 },
  8: { skillLevel: 20, thinkTimeMs: 2500 },
}

/** Stockfish Skill Level (0-20) per strength. */
export const SKILL_LEVEL: Readonly<Record<Strength, number>> = {
  1: STRENGTH_TABLE[1].skillLevel,
  2: STRENGTH_TABLE[2].skillLevel,
  3: STRENGTH_TABLE[3].skillLevel,
  4: STRENGTH_TABLE[4].skillLevel,
  5: STRENGTH_TABLE[5].skillLevel,
  6: STRENGTH_TABLE[6].skillLevel,
  7: STRENGTH_TABLE[7].skillLevel,
  8: STRENGTH_TABLE[8].skillLevel,
}

/** Default think time per strength, in milliseconds. */
export const THINK_TIME_MS: Readonly<Record<Strength, number>> = {
  1: STRENGTH_TABLE[1].thinkTimeMs,
  2: STRENGTH_TABLE[2].thinkTimeMs,
  3: STRENGTH_TABLE[3].thinkTimeMs,
  4: STRENGTH_TABLE[4].thinkTimeMs,
  5: STRENGTH_TABLE[5].thinkTimeMs,
  6: STRENGTH_TABLE[6].thinkTimeMs,
  7: STRENGTH_TABLE[7].thinkTimeMs,
  8: STRENGTH_TABLE[8].thinkTimeMs,
}

/** The level at which Stockfish plays its own move. Used for evaluation. */
export const FULL_SKILL_LEVEL = 20
