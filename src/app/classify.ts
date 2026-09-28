/**
 * Classifying a move from the engine's numbers. docs/architecture.md,
 * "Evaluation and classification". The engine reports from White's point of
 * view; the swing is converted to the mover's. The thresholds are generous on
 * purpose: the narrator wants a real blunder to speak about, not a coaching
 * report.
 */
import type { Color } from '../contracts/chess'
import type { MoveClassification } from '../contracts/events'

/** Below this swing (mover's view, centipawns) a move is a blunder. */
export const BLUNDER_CP = -300
/** Below this, down to the blunder line, a mistake. */
export const MISTAKE_CP = -120
/** Below this, down to the mistake line, an inaccuracy. */
export const INACCURACY_CP = -50
/** A move this much better than the engine's own choice is excellent. */
export const EXCELLENT_MARGIN_CP = 50
/** A forced mate scores this far outside the centipawn range, less one per move of distance. */
export const MATE_SCORE_CP = 100000
/** Scores at or beyond this magnitude are mates. */
export const MATE_THRESHOLD_CP = MATE_SCORE_CP - 1000

/** What the engine gives for a position: centipawns or a mate distance, White's point of view. */
export interface Score {
  cp?: number
  mate?: number
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

/**
 * A position's score from `pov`'s point of view, in centipawns, with mates far
 * outside the centipawn range. `sideToMove` is the side to move in the scored
 * position: the engine reports a delivered mate as `mate 0` without a sign,
 * and the side to move is the one who has been mated.
 */
export function scoreFor(pov: Color, score: Score, sideToMove: Color): number {
  const sign = pov === 'w' ? 1 : -1
  if (score.mate !== undefined) {
    if (score.mate === 0) return sideToMove === pov ? -MATE_SCORE_CP : MATE_SCORE_CP
    const distance = Math.min(Math.abs(score.mate), 999)
    return Math.sign(score.mate) * sign * (MATE_SCORE_CP - distance)
  }
  return sign * (score.cp ?? 0)
}

/** True when the score is a forced mate in the point of view's favour. */
export function isMateFor(pov: Color, score: Score, sideToMove: Color): boolean {
  return scoreFor(pov, score, sideToMove) >= MATE_THRESHOLD_CP
}

/**
 * The change the move caused, from the mover's point of view. `before` is the
 * position the mover faced; `after` is the position they left.
 */
export function swingFor(mover: Color, before: Score, after: Score): number {
  return scoreFor(mover, after, opposite(mover)) - scoreFor(mover, before, mover)
}

/** Classifies a swing already in the mover's point of view. */
export function classifySwing(swing: number): MoveClassification {
  if (swing < BLUNDER_CP) return 'blunder'
  if (swing < MISTAKE_CP) return 'mistake'
  if (swing < INACCURACY_CP) return 'inaccuracy'
  if (swing <= EXCELLENT_MARGIN_CP) return 'good'
  return 'excellent'
}

/**
 * Classifies the mover's move given the engine's scores before and after it.
 * A lost forced mate is a blunder and a found one is excellent, whatever the
 * centipawns say; a mate kept is good.
 */
export function classify(mover: Color, before: Score, after: Score): MoveClassification {
  const mateBefore = isMateFor(mover, before, mover)
  const mateAfter = isMateFor(mover, after, opposite(mover))
  if (mateBefore && !mateAfter) return 'blunder'
  if (mateAfter && !mateBefore) return 'excellent'
  if (mateAfter && mateBefore) return 'good'
  return classifySwing(swingFor(mover, before, after))
}
