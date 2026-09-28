/**
 * Motion constants from docs/visual.md section 11, and the one question the
 * frame asks the browser: whether motion should collapse to instant.
 */

export const FADE_MS = 600
export const CARD_HOLD_MS = 4000
export const WHIP_MS = 380
export const TRACK_MS = 700
export const CARD_APPEAR_MS = 160
export const PAN_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)'

/** True when the viewer has asked for reduced motion. Holds are not motion and stay. */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** A motion duration: the stated one, or 0 under reduced motion. */
export function motionMs(ms: number): number {
  return reducedMotion() ? 0 : ms
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
