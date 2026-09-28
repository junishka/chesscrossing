// The season: station time, the watches, the tide, the readings, the date and the count.
// docs/BIBLE.md §2 "Station time", §7 "The tide", §9 (the date advances), §11 (the slow-motion rule).
// No three, no DOM: the world is reached through the bus and through the callbacks passed in.
import type { Season } from '../types'
import { bus } from '../core/bus'
import { clock } from '../core/clock'
import { store } from '../core/store'
import { crateLine, readingText } from '../content/station'
import {
  BELLS_BEFORE_SECONDS, DUSK_WATCH, LOW_WATER_ON_THE_THIRTIETH_MINUTES, READING_SECONDS, TIDE_DRIFT_MINUTES_PER_DAY, TIDE_PERIOD_SECONDS,
  TIME_SCALE, WATCH_COUNT, WATCH_SECONDS, crossable as crossableAt, secondsToNextWindowChange, stationClock, waterHeight,
} from '../content/watches'

/** The four reasons slow motion may be spent (§11). */
export type SlowMotionReason = 'checkmate' | 'photograph' | 'lasttide' | 'crating'
/** The four reasons, for the runtime check against callers outside the type system. */
export const SLOW_MOTION_REASONS: readonly SlowMotionReason[] = ['checkmate', 'photograph', 'lasttide', 'crating']
/** Slow motion is 0.4× on the world clock. */
export const SLOW_MOTION_SCALE = 0.4

/** `season:change` is emitted at most this often. */
export const SEASON_CHANGE_MS = 1000
/** The ledger is saved at most this often while the season ticks. */
export const SAVE_EVERY_MS = 10_000
/** The house bell's three strikes, and the gap between them. */
export const BELL_STRIKES = 3
export const BELL_GAP_MS = 900
/** Real seconds a single tick may advance, as the house clock caps its frames. */
export const MAX_TICK_SECONDS = 0.1
/** Station minutes from midnight to the first watch's start, 04:00. */
const FIRST_WATCH_MINUTES = 4 * 60
/** Station minutes in one watch. */
const WATCH_MINUTES = (WATCH_SECONDS * TIME_SCALE) / 60

/** One object of the count: the hotspot that leaves and the name the ledger types for it. */
export interface CrateEntry { id: string; name: string }

/**
 * The count (§9, Chapter Seven): one object per room leaves into a crate each day, the galley dresser first,
 * then the rooms in the bible's order. The board is never on this list; it goes last, in Chapter Nine.
 */
export const CRATE_ORDER: readonly CrateEntry[] = [
  { id: 'galley.tins', name: 'The galley dresser, left' },
  { id: 'boardroom.spares', name: 'The spares drawer' },
  { id: 'chartroom.tables', name: 'Tide tables, 1965' },
  { id: 'landing.badges', name: 'Badges, embroidered' },
  { id: 'recorders.harmonium', name: 'Harmonium' },
  { id: 'quarters.sextant', name: 'Sextant' },
  { id: 'lamproom.pane', name: 'The boarded pane' },
  { id: 'workshop.tools', name: 'Turning tools, 14' },
  { id: 'boathouse.lifebuoy', name: 'Lifebuoy' },
]

/** What the clock is given: wall time, the slow-motion hand, and whether this is a development build. */
export interface SeasonClockOptions {
  /** Wall time in milliseconds, `performance.now()`-style. Tests drive it. */
  now?: () => number
  /** The world's slow-motion hand; `clock.slowMotion` by default. */
  slowMotion?: (scale: number, holdMs: number) => Promise<void>
  /** Development build: an unlisted slow-motion reason throws. Defaults to `import.meta.env.DEV`. */
  dev?: boolean
}

/** Low water on a season day, in station minutes from that day's midnight, unwrapped so the phase is one continuous line. */
function lowWaterUnwrapped(date: number): number {
  return LOW_WATER_ON_THE_THIRTIETH_MINUTES + TIDE_DRIFT_MINUTES_PER_DAY * (date - 30)
}

/** Tide phase 0..1 at a station moment, 0 at low water, from the tide tables (HS-0119) and the 48-minute daily drift. */
export function tidePhaseAt(date: number, watch: number, watchElapsed: number): number {
  const sinceFirstWatch = watch * WATCH_MINUTES + (watchElapsed * TIME_SCALE) / 60
  const sinceLowWaterMinutes = sinceFirstWatch - (lowWaterUnwrapped(date) - FIRST_WATCH_MINUTES)
  const seconds = (sinceLowWaterMinutes * 60) / TIME_SCALE
  const p = (seconds / TIDE_PERIOD_SECONDS) % 1
  return p < 0 ? p + 1 : p
}

/** True whether the build declares itself a development one. Under node there is no `env`. */
function isDevBuild(): boolean {
  return import.meta.env?.DEV === true
}

/**
 * The season clock. It owns the live `Season` (the same object as `store.ledger.season`), advances it in wall time,
 * keeps the tide, gives the readings and the bells, turns the date, and holds the only hand on slow motion.
 */
export class SeasonClock {
  /** The live season, the same reference as `store.ledger.season`. */
  readonly season: Season
  private readonly now: () => number
  private readonly slow: (scale: number, holdMs: number) => Promise<void>
  private readonly dev: boolean
  private off: (() => void) | null = null
  private lastNow: number
  private lastChangeEmit: number
  private lastSave: number
  private lastCrossable: boolean
  private bellsRung: boolean
  private pendingBells: number[] = []

  constructor(options: SeasonClockOptions = {}) {
    this.season = store.ledger.season
    this.now = options.now ?? (() => performance.now())
    this.slow = options.slowMotion ?? ((scale, holdMs) => clock.slowMotion(scale, holdMs))
    this.dev = options.dev ?? isDevBuild()
    const t = this.now()
    this.lastNow = t
    this.lastChangeEmit = t
    this.lastSave = t
    this.season.tide = tidePhaseAt(this.season.date, this.season.watch, this.season.watchElapsed)
    this.lastCrossable = this.crossable()
    this.bellsRung = this.lastCrossable && this.secondsToWindowChange() <= BELLS_BEFORE_SECONDS
  }

  /** Ticks on the house clock, in wall time, until `stop()`. */
  start(): void {
    if (this.off) return
    this.lastNow = this.now()
    this.off = clock.onTick(() => this.tick())
  }

  /** Leaves the house clock. */
  stop(): void {
    this.off?.()
    this.off = null
  }

  /** Advances the season by the wall time since the last tick, at most `MAX_TICK_SECONDS`; tests call it directly. */
  tick(): void {
    const t = this.now()
    const dt = Math.min(MAX_TICK_SECONDS, Math.max(0, t - this.lastNow) / 1000)
    this.lastNow = t
    this.advance(dt)
    this.settle(t)
  }

  /** The clock face: the watch's start plus real elapsed time at 57.6×, `HH:MM`. */
  clockLabel(): string {
    return stationClock(this.season.watch, this.season.watchElapsed)
  }

  /** True in the fourth watch, 16:00 to 20:00, when the lamp may be lit. */
  isDusk(): boolean {
    return this.season.watch === DUSK_WATCH
  }

  /** The water, 0 at low water and 1 at high, `h = hi − (hi − lo)(1 + cos 2πφ)/2`. */
  tideHeight(): number {
    return waterHeight(this.season.tide, 0, 1)
  }

  /** True within two tide-hours, ±4.0 real minutes, of low water. */
  crossable(): boolean {
    return crossableAt(this.season.tide)
  }

  /** Real seconds until the crossable state next changes: until the window closes, or until it next opens. */
  secondsToWindowChange(): number {
    return secondsToNextWindowChange(this.season.tide * TIDE_PERIOD_SECONDS)
  }

  /** After a finished game: the date turns, the watch is 04:00, `season:change` is emitted and, in Chapter Seven, one object is crated. */
  advanceDay(): void {
    this.season.watch = 0
    this.season.watchElapsed = 0
    this.newDay()
    this.season.tide = tidePhaseAt(this.season.date, this.season.watch, this.season.watchElapsed)
    const t = this.now()
    this.lastChangeEmit = t
    bus.emit('season:change', this.season)
    this.lastSave = t
    store.save()
  }

  /**
   * Spends slow motion, 0.4× on the world clock for `ms`, for one of the four reasons (§11).
   * Any other reason throws in development and is ignored in production. Never for the player's own moves.
   */
  async spendSlowMotion(reason: SlowMotionReason, ms: number): Promise<void> {
    if (!SLOW_MOTION_REASONS.includes(reason)) {
      if (this.dev) throw new Error(`spendSlowMotion: "${String(reason)}" is not one of the four reasons`)
      return
    }
    await this.slow(SLOW_MOTION_SCALE, ms)
  }

  /** Moves station time on by `dt` real seconds: the readings, the watches, the natural turn of the date. */
  private advance(dt: number): void {
    const s = this.season
    const before = s.watchElapsed
    s.watchElapsed += dt
    const at = READING_SECONDS[s.watch]
    if (at !== undefined && before < at && s.watchElapsed >= at) {
      bus.emit('reading', { text: readingText(s.date, s.watch), watch: s.watch })
    }
    while (s.watchElapsed >= WATCH_SECONDS) {
      s.watchElapsed -= WATCH_SECONDS
      s.watch += 1
      if (s.watch >= WATCH_COUNT) {
        s.watch = 0
        this.newDay()
      }
    }
    s.tide = tidePhaseAt(s.date, s.watch, s.watchElapsed)
  }

  /** After the season has moved: the tide window, the bells, the throttled `season:change` and the save. */
  private settle(t: number): void {
    const crossable = this.crossable()
    if (crossable !== this.lastCrossable) {
      this.lastCrossable = crossable
      this.bellsRung = false
      bus.emit('tide:window', { crossable, secondsToChange: this.secondsToWindowChange() })
    }
    if (crossable && !this.bellsRung && this.secondsToWindowChange() <= BELLS_BEFORE_SECONDS) {
      this.bellsRung = true
      for (let i = 0; i < BELL_STRIKES; i++) this.pendingBells.push(t + i * BELL_GAP_MS)
    }
    while (this.pendingBells.length && this.pendingBells[0] <= t) {
      this.pendingBells.shift()
      bus.emit('audio:sfx', { name: 'tidebell' })
    }
    if (t - this.lastChangeEmit >= SEASON_CHANGE_MS) {
      this.lastChangeEmit = t
      bus.emit('season:change', this.season)
    }
    if (t - this.lastSave >= SAVE_EVERY_MS) {
      this.lastSave = t
      store.save()
    }
  }

  /** The date turns; in Chapter Seven one object leaves into a crate and the ledger enters it. */
  private newDay(): void {
    this.season.date += 1
    if (this.season.chapter >= 7) this.crateNext()
  }

  /** Crates the next object of the count that is still in the house, and types the crate on the roll. */
  private crateNext(): void {
    const next = CRATE_ORDER.find((entry) => !this.season.crated.includes(entry.id))
    if (!next) return
    this.season.crated.push(next.id)
    bus.emit('ledger:line', { text: crateLine(this.season.crated.length, next.name, this.season.date) })
  }
}
