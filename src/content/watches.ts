// Watches (time controls), station time and the tide, docs/BIBLE.md §2, §5.6, §7 and §14.3. Pure data and arithmetic.
import type { WatchId } from '../types'

/** One watch on the chronometer plate. */
export interface WatchDef {
  id: WatchId
  name: string
  /** Minutes on each clock; 0 for No Watch, untimed. */
  minutes: number
  /** Seconds added per move. */
  incrementSec: number
  /** As engraved: `DOG WATCH  5 + 3`. */
  label: string
}

/** The four watches on the plate. */
export const watches: WatchDef[] = [
  { id: 'dog', name: 'Dog Watch', minutes: 5, incrementSec: 3, label: 'DOG WATCH  5 + 3' },
  { id: 'middle', name: 'Middle Watch', minutes: 15, incrementSec: 10, label: 'MIDDLE WATCH  15 + 10' },
  { id: 'long', name: 'Long Watch', minutes: 30, incrementSec: 0, label: 'LONG WATCH  30 + 0' },
  { id: 'none', name: 'No Watch', minutes: 0, incrementSec: 0, label: 'NO WATCH' },
]

/** The definition for a watch id. */
export function watchDef(id: WatchId): WatchDef {
  return watches.find((w) => w.id === id) ?? watches[3]
}

/** The watch name in ledger capitals: `LONG WATCH`. */
export function watchLabel(id: WatchId): string {
  return watchDef(id).name.toUpperCase()
}

// ───────────────────────────── Station time ─────────────────────────────

/** A station day is 25 real minutes. */
export const STATION_DAY_SECONDS = 1500
/** Six watches of 250 real seconds. */
export const WATCH_SECONDS = 250
/** Watches per day. */
export const WATCH_COUNT = 6
/** Station time runs at 57.6× real time. */
export const TIME_SCALE = 57.6
/** The station hour at which each watch begins: 04:00, 08:00, 12:00, 16:00, 20:00, 00:00. */
export const WATCH_START_HOURS = [4, 8, 12, 16, 20, 0] as const
/** Real seconds into a watch at which the readings fire: 05:20 at +83 s of watch 0, 17:50 at +115 s of watch 3. */
export const READING_SECONDS: Readonly<Partial<Record<number, number>>> = { 0: 83, 3: 115 }
/** The reading times as the Orders give them. */
export const READING_TIMES: Readonly<Partial<Record<number, string>>> = { 0: '05:20', 3: '17:50' }
/** The dusk watch, 16:00 to 20:00, in which the lamp may be lit. */
export const DUSK_WATCH = 3

/** Pads a number to two figures. */
function two(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Formats station minutes since midnight as `HH:MM`. */
export function hhmm(minutes: number): string {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440
  return `${two(Math.floor(m / 60))}:${two(m % 60)}`
}

/** The label at which watch `i` begins: `04:00`, `08:00`, ... `00:00`. */
export function watchStartLabel(i: number): string {
  return hhmm(WATCH_START_HOURS[((i % WATCH_COUNT) + WATCH_COUNT) % WATCH_COUNT] * 60)
}

/** Station minutes since midnight at `elapsedSec` real seconds into watch `i`. */
export function stationMinutes(watch: number, elapsedSec: number): number {
  const start = WATCH_START_HOURS[((watch % WATCH_COUNT) + WATCH_COUNT) % WATCH_COUNT] * 60
  return start + (elapsedSec * TIME_SCALE) / 60
}

/** The clock face: the watch's start plus real elapsed time at 57.6×, as `HH:MM`. */
export function stationClock(watch: number, elapsedSec: number): string {
  return hhmm(stationMinutes(watch, elapsedSec))
}

/** True once the watch's reading time has passed: 05:20 in watch 0 (83 s), 17:50 in watch 3 (115 s). */
export function readingDue(watch: number, elapsedSec: number): boolean {
  const at = READING_SECONDS[watch]
  return at !== undefined && elapsedSec >= at
}

/** True in the fourth watch, 16:00 to 20:00, which is dusk. */
export function isDusk(watch: number): boolean {
  return watch === DUSK_WATCH
}

/** True in the watches with a wireless bulletin: the first and the fourth. */
export function hasBulletin(watch: number): boolean {
  return READING_SECONDS[watch] !== undefined
}

// ───────────────────────────── The tide ─────────────────────────────

/** One tide over 25 min 50 s of real time, drifting 48 station-minutes a day. */
export const TIDE_PERIOD_SECONDS = 1550
/** One tide-hour is 2.0 real minutes. */
export const TIDE_HOUR_SECONDS = 120
/** The grid is crossable within two tide-hours either side of low water. */
export const CROSSABLE_SECONDS = 240
/** The water plane covers and uncovers over these seconds at each edge of the window. */
export const TIDE_EDGE_SECONDS = 120
/** The house bell strikes three times this long before the crossable state ends. */
export const BELLS_BEFORE_SECONDS = 90
/** Low water on the 30th, from the tide tables (HS-0119), in station minutes since midnight. */
export const LOW_WATER_ON_THE_THIRTIETH_MINUTES = 16 * 60 + 12
/** The tide's daily drift against the station day, in station minutes. */
export const TIDE_DRIFT_MINUTES_PER_DAY = 48

/** Tide phase 0..1 for real seconds since the season's first low water; 0 is low water. */
export function tidePhase(seconds: number): number {
  const p = (seconds / TIDE_PERIOD_SECONDS) % 1
  return p < 0 ? p + 1 : p
}

/** Real seconds from the nearest low water, signed: negative on the ebb, positive on the flood. */
export function secondsFromLowWater(phase: number): number {
  const p = ((phase % 1) + 1) % 1
  const s = p * TIDE_PERIOD_SECONDS
  return s > TIDE_PERIOD_SECONDS / 2 ? s - TIDE_PERIOD_SECONDS : s
}

/** Water height between `lo` and `hi`: `h = hi − (hi − lo) · (1 + cos 2πφ) / 2`. */
export function waterHeight(phase: number, lo: number, hi: number): number {
  return hi - (hi - lo) * (1 + Math.cos(2 * Math.PI * phase)) / 2
}

/** True within ±4.0 real minutes of low water. */
export function crossable(phase: number): boolean {
  return Math.abs(secondsFromLowWater(phase)) <= CROSSABLE_SECONDS
}

/** How much of the grid stands clear, 0..1: whole inside ±2 min, fading to nothing at the window's ±4 min edges. */
export function gridExposure(phase: number): number {
  const d = Math.abs(secondsFromLowWater(phase))
  if (d <= CROSSABLE_SECONDS - TIDE_EDGE_SECONDS) return 1
  if (d >= CROSSABLE_SECONDS) return 0
  return (CROSSABLE_SECONDS - d) / TIDE_EDGE_SECONDS
}

/** Real seconds until the crossable state next changes: until the window closes, or until it next opens. */
export function secondsToNextWindowChange(seconds: number): number {
  const d = secondsFromLowWater(tidePhase(seconds))
  if (Math.abs(d) <= CROSSABLE_SECONDS) return CROSSABLE_SECONDS - d
  if (d < 0) return -d - CROSSABLE_SECONDS
  return TIDE_PERIOD_SECONDS - d - CROSSABLE_SECONDS
}

/** True while the window is open and closes within 90 s: the house bell's three strikes. */
export function bellsDue(seconds: number): boolean {
  const phase = tidePhase(seconds)
  return crossable(phase) && secondsToNextWindowChange(seconds) <= BELLS_BEFORE_SECONDS
}

/** Real seconds to the crossable state as tide-hours and tens of minutes: `1 h 40 min`. */
export function tideHoursText(secondsUntil: number): string {
  const tideHours = Math.max(0, secondsUntil) / TIDE_HOUR_SECONDS
  const h = Math.floor(tideHours)
  const m = Math.floor(((tideHours - h) * 60) / 10) * 10
  return `${h} h ${m} min`
}

/** The causeway card at high water: `Water over the causeway. 1 h 40 min.` */
export function causewayCardText(secondsUntilCrossable: number): string {
  return `Water over the causeway. ${tideHoursText(secondsUntilCrossable)}.`
}

/** The card when the player stays past the bells. */
export const TIDE_CAME_IN = 'The tide came in. Mr Tuck came for you in the dinghy. It is entered in the log.'

/** Low water on a day of September, in station minutes since midnight: 16:12 on the 30th, 48 minutes earlier each day before. */
export function lowWaterMinutes(day: number): number {
  const m = LOW_WATER_ON_THE_THIRTIETH_MINUTES + TIDE_DRIFT_MINUTES_PER_DAY * (day - 30)
  return ((m % 1440) + 1440) % 1440
}

/** High water on a day of September, half a tide (12 h 24 min) before low water. */
export function highWaterMinutes(day: number): number {
  const half = (TIDE_PERIOD_SECONDS * TIME_SCALE) / 60 / 2
  return ((lowWaterMinutes(day) - half) % 1440 + 1440) % 1440
}
