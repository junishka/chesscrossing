import { bus } from './bus'

export type Easing = (t: number) => number
export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  /** Fast in, hard stop: the whip pan. */
  whip: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  /** Small overshoot for a piece settling on felt. */
  outBack: (t: number) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
} satisfies Record<string, Easing>

interface Tween { elapsed: number; duration: number; easing: Easing; update: (k: number) => void; resolve: () => void; delay: number }

/**
 * The house clock: one requestAnimationFrame loop, a global time scale (slow motion),
 * and a tween runner. Everything animated subscribes here so slow motion affects all of it.
 */
class Clock {
  scale = 1
  private tweens: Tween[] = []
  private ticks = new Set<(dt: number, elapsed: number) => void>()
  private last = 0
  private elapsed = 0
  private running = false

  constructor() {
    bus.on('time:scale', ({ scale }) => { this.scale = scale })
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const raw = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      const dt = raw * this.scale
      this.elapsed += dt
      this.step(dt)
      for (const t of Array.from(this.ticks)) t(dt, this.elapsed)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  onTick(fn: (dt: number, elapsed: number) => void): () => void {
    this.ticks.add(fn)
    return () => { this.ticks.delete(fn) }
  }

  /** Tween from 0..1 over `ms` (in scaled time). Resolves when done. */
  tween(ms: number, update: (k: number) => void, easing: Easing = ease.inOutCubic, delayMs = 0): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ elapsed: 0, duration: ms / 1000, easing, update, resolve, delay: delayMs / 1000 })
    })
  }

  wait(ms: number): Promise<void> {
    return this.tween(ms, () => {}, ease.linear)
  }

  /** Temporarily slow the world (e.g. 0.25 for checkmate) and ease back. */
  async slowMotion(scale: number, holdMs: number, easeBackMs = 600): Promise<void> {
    bus.emit('time:scale', { scale })
    await new Promise((r) => setTimeout(r, holdMs))
    const start = this.scale
    const t0 = performance.now()
    await new Promise<void>((r) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / easeBackMs)
        bus.emit('time:scale', { scale: start + (1 - start) * ease.outCubic(k) })
        if (k < 1) requestAnimationFrame(step); else r()
      }
      step()
    })
  }

  private step(dt: number): void {
    if (!this.tweens.length) return
    const done: Tween[] = []
    for (const t of this.tweens) {
      if (t.delay > 0) { t.delay -= dt; if (t.delay > 0) continue; t.elapsed += -t.delay; t.delay = 0 } else t.elapsed += dt
      const k = t.duration <= 0 ? 1 : Math.min(1, t.elapsed / t.duration)
      t.update(t.easing(k))
      if (k >= 1) done.push(t)
    }
    if (done.length) {
      this.tweens = this.tweens.filter((t) => !done.includes(t))
      for (const t of done) t.resolve()
    }
  }
}

export const clock = new Clock()
