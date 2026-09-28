// The Sixty-Four as the station walks it: the warrants, the tide, the islet stage, the plates and the cairn
// tags (docs/BIBLE.md §7 O3–O7, §12 EE-24/EE-25/EE-27; docs/ARCHITECTURE.md "station/grid.ts").
// No three, no DOM: the chart and the islet stage are reached through the callbacks `main.ts` passes in,
// and the rest of the station through the bus.
import type { BadgeId, CairnTag, Season, Square, Warrant } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { copy } from '../content/copy'
import {
  ALL_SQUARES, FILES, cairnReadLine, cairnTag, fileRank, isHFile, plateText as platePlate, squareHash, surveyedYear,
} from '../content/survey'

/** What the walk needs of the SeasonClock: the live season and whether the causeway is crossable. */
export interface GridSeasonLike {
  /** Live object, the same reference as `store.ledger.season`. */
  season: Season
  /** True within two tide-hours of low water, when the grid may be crossed. */
  crossable(): boolean
}

/** The frames an islet is shown in: the re-dressed stage, or one of the three built islets (§7 O5–O7). */
export type IsletFrameId = 'grid' | 'eider' | 'cinder' | 'heron'

/** How the world answers the walk. Every callback resolves when its cut or travel is done. */
export interface GridWalkHooks {
  /** Cut to the islet stage (or the islet's own frame), dressed for `sq`. */
  onIslet(sq: Square, frameId: IsletFrameId): Promise<void>
  /** Cut to the chart and travel the brass pin from `from` to `to` at half a second per islet. */
  onChart(from: Square, to: Square): Promise<void>
  /** Leave the grid: back to the Point from a1, or the dinghy to the jetty when the tide came in. */
  onLeave(): Promise<void>
}

/** The pin travels at 350 mm/s on the chart: half a second per islet (§7 O4). */
export const PIN_MS_PER_ISLET = 500
/** The chapter from which the h-file is surveyed and may be walked (§7 O4, O7; EE-27). */
export const H_FILE_CHAPTER = 8
/** Plates read for the SURVEYOR badge (§9, Chapter Six). */
export const SURVEYOR_PLATES = 16
/** Games the visitor must have finished before Mr Tuck lends the dinghy (§8.5). */
export const ROOK_GAMES = 2
/** The day of September from which the punt is lent (§7 O5: "Not lent before the twentieth"). */
export const BISHOP_DATE = 20
/** The islet the causeway lands on (§7 O3). */
export const LANDING: Square = 'a1'
/** The badge sewn at sixteen plates. */
const SURVEYOR: BadgeId = 'SURVEYOR'

/** The islets with their own frames (§7 O5–O7); every other square is the re-dressed stage. */
const OWN_FRAMES: Readonly<Partial<Record<Square, IsletFrameId>>> = { e4: 'eider', c6: 'cinder', h8: 'heron' }

/** The four flaws of the islet stage, in `hash mod 4` order (§7 O4). */
export const STAGE_FLAWS = ['a cairn stone out of true', 'a footprint line', 'a tag string', 'the plate set low'] as const
/** The six found objects of the islet stage, in `hash mod 6` order (§7 O4). */
export const STAGE_OBJECTS = ['a glass float', 'a ration tin', 'a chess-book page under a stone', 'shells in a row', 'a driftwood piece', 'an oar'] as const

/** The stage dressing of one islet: an index into STAGE_FLAWS and one into STAGE_OBJECTS. */
export interface Dressing { flaw: number; object: number }

/**
 * The four fixed dressings (§7 O4). a1 Alder Ness: a cairn stone out of true (the landing was built in a hurry),
 * an oar (the dinghy's spare). c6 Cinder Holm: the plate set low (it is the cracked one, EE-25), the green glass
 * float (HS-1105). e4 Eider Reach: a footprint line (the Surveyor's, hut to cairn), a chess-book page under a stone
 * (the Ruy Lopez). h8 Heron Head: a tag string (the cords to the chart table), a ration tin (the last one).
 */
export const FIXED_DRESSINGS: Readonly<Partial<Record<Square, Dressing>>> = {
  a1: { flaw: 0, object: 5 },
  c6: { flaw: 3, object: 0 },
  e4: { flaw: 1, object: 2 },
  h8: { flaw: 2, object: 1 },
}

/** File index 0..7 and rank index 0..7 of a square. */
function coords(sq: Square): { f: number; r: number } {
  const { file, rank } = fileRank(sq)
  return { f: FILES.indexOf(file), r: rank - 1 }
}

/** The islets between two squares as the pin counts them: the greater of the file and rank distances. */
export function isletDistance(from: Square, to: Square): number {
  const a = coords(from), b = coords(to)
  return Math.max(Math.abs(a.f - b.f), Math.abs(a.r - b.r))
}

/** Milliseconds the pin takes from one islet to another on the chart. */
export function pinTravelMs(from: Square, to: Square): number {
  return isletDistance(from, to) * PIN_MS_PER_ISLET
}

/**
 * The warrant under which a step is made, or null when no warrant covers it. On foot as a king (one islet,
 * any direction), in the dinghy as a rook (straight along a channel, any distance), in the punt as a bishop
 * (along the diagonal reefs). Nothing goes over anything, so there is no knight's warrant.
 */
export function warrantFor(from: Square, to: Square, held: readonly Warrant[]): Warrant | null {
  if (from === to) return null
  const a = coords(from), b = coords(to)
  const df = Math.abs(a.f - b.f), dr = Math.abs(a.r - b.r)
  if (held.includes('king') && df <= 1 && dr <= 1) return 'king'
  if (held.includes('rook') && (df === 0 || dr === 0)) return 'rook'
  if (held.includes('bishop') && df === dr) return 'bishop'
  return null
}

/**
 * The walk across the Sixty-Four. Owns where the visitor stands (`season.gridSquare`), which islets the
 * warrants allow, the plates, the cairn tags and the return in the dinghy when the tide comes in.
 */
export class GridWalk {
  private readonly clock: GridSeasonLike
  private readonly hooks: GridWalkHooks
  private readonly offs: Array<() => void> = []

  /** Listens for the window closing (`tide:window`) so the dinghy comes for a visitor still on the grid. */
  constructor(season: GridSeasonLike, hooks: GridWalkHooks) {
    this.clock = season
    this.hooks = hooks
    this.offs.push(bus.on('tide:window', ({ crossable }) => { if (!crossable) void this.tideCameIn() }))
  }

  private get season(): Season { return this.clock.season }

  /** The islet the visitor stands on, or null when ashore. */
  get square(): Square | null { return this.season.gridSquare }

  /** The warrants held this season. */
  warrants(): Warrant[] {
    return [...this.season.warrants]
  }

  /** True while the grid may be crossed: two tide-hours either side of low water. */
  crossable(): boolean {
    return this.clock.crossable()
  }

  /** True when a square may be stood on at all: the h-file is closed before Chapter Eight. */
  isOpen(sq: Square): boolean {
    return !isHFile(sq) || this.season.chapter >= H_FILE_CHAPTER
  }

  /**
   * The islets that may be reached from where the visitor stands, in the legend's order: the union over the
   * warrants held, less the h-file before Chapter Eight. Empty when ashore.
   */
  legalIslets(): Square[] {
    const from = this.square
    if (!from) return []
    const held = this.season.warrants
    return ALL_SQUARES.filter((sq) => this.isOpen(sq) && warrantFor(from, sq, held) !== null)
  }

  /** The frame an islet is shown in: eider for e4, cinder for c6, heron for h8, the stage for the rest. */
  frameOf(sq: Square): IsletFrameId {
    return OWN_FRAMES[sq] ?? 'grid'
  }

  /**
   * Crosses to an islet: the chart cut and the pin's travel, then the cut to the islet. Rejects when the islet is
   * not legal under the warrants or the water is over the grid. Sets the square, marks it visited, emits `grid:move`.
   */
  async moveTo(sq: Square): Promise<void> {
    const from = this.square
    if (!from) throw new Error('GridWalk.moveTo: not on the grid; use enter()')
    if (!this.crossable()) throw new Error('GridWalk.moveTo: the water is over the grid')
    const warrant = this.isOpen(sq) ? warrantFor(from, sq, this.season.warrants) : null
    if (!warrant) throw new Error(`GridWalk.moveTo: ${sq} is not reachable from ${from} under the warrants held`)
    await this.hooks.onChart(from, sq)
    await this.hooks.onIslet(sq, this.frameOf(sq))
    this.arrive(from, sq, warrant)
  }

  /** Crosses the causeway from the Point to Alder Ness (a1) on foot; requires low water and being ashore. */
  async enter(): Promise<void> {
    if (this.square) throw new Error('GridWalk.enter: already on the grid')
    if (!this.crossable()) throw new Error('GridWalk.enter: the water is over the causeway')
    await this.hooks.onIslet(LANDING, this.frameOf(LANDING))
    this.arrive(null, LANDING, 'king')
  }

  /** Walks back over the causeway to the Point; allowed from a1 only (§7 O4). */
  async leave(): Promise<void> {
    if (this.square !== LANDING) throw new Error('GridWalk.leave: the causeway leaves from a1 only')
    await this.hooks.onLeave()
    this.season.gridSquare = null
    store.save()
  }

  /** Records a landing: the square, the visit, the season, the event. */
  private arrive(from: Square | null, to: Square, warrant: Warrant): void {
    this.season.gridSquare = to
    store.mark('visited', `islet:${to}`)
    store.save()
    bus.emit('grid:move', { from, to, warrant })
  }

  /** The plate on the cairn where the visitor stands, or on `sq`; NOT SURVEYED on the h-file before Chapter Eight. */
  plateText(sq: Square | null = this.square): string {
    if (!sq) return ''
    return platePlate(sq, surveyedYear(sq), this.isOpen(sq))
  }

  /**
   * Reads the plate underfoot: the square joins `platesRead`, the ledger types `Cairn c4 (Cinder Reach) read.`,
   * and at sixteen plates SURVEYOR is sewn. Returns false when ashore.
   */
  readPlate(): boolean {
    const sq = this.square
    if (!sq) return false
    if (!this.season.platesRead.includes(sq)) this.season.platesRead.push(sq)
    bus.emit('ledger:line', { text: cairnReadLine(sq) })
    if (this.season.platesRead.length >= SURVEYOR_PLATES && !this.season.badges.includes(SURVEYOR)) {
      this.season.badges.push(SURVEYOR)
      bus.emit('badge:grant', { badge: SURVEYOR })
    }
    store.save()
    return true
  }

  /** The stage dressing for a square: `hash mod 4` and `hash mod 6`, except the four fixed islets. */
  dressing(sq: Square): Dressing {
    const fixed = FIXED_DRESSINGS[sq]
    if (fixed) return { ...fixed }
    const h = squareHash(sq)
    return { flaw: h % 4, object: h % 6 }
  }

  /** The tags on a cairn: one per capture that landed on the square this season (EE-24). */
  cairnTags(sq: Square): CairnTag[] {
    return this.season.cairnTags.filter((t) => t.square === sq)
  }

  /** The tags' paper text, `RETURNED  EXPEDITION 3  MOVE 17`, in the order they were tied on. */
  cairnTagLines(sq: Square): string[] {
    return this.cairnTags(sq).map((t) => cairnTag(t.expedition, t.move))
  }

  /**
   * The window has closed with the visitor still on the grid: the ledger's line, the dinghy to the jetty,
   * the square cleared. Nothing happens when ashore.
   */
  async tideCameIn(): Promise<void> {
    if (!this.square) return
    bus.emit('ledger:line', { text: copy.ledger.lines.tideCameIn })
    this.season.gridSquare = null
    store.save()
    await this.hooks.onLeave()
  }

  /** Grants a warrant once, with the event. Returns true when it was new. */
  grantWarrant(w: Warrant): boolean {
    if (this.season.warrants.includes(w)) return false
    this.season.warrants.push(w)
    store.save()
    bus.emit('warrant:grant', { warrant: w })
    return true
  }

  /** Mr Tuck lends the dinghy once two games are finished: "Take her. She goes and she stops." Returns true when granted now. */
  tuckGrantsRook(gamesFinished: number): boolean {
    if (gamesFinished < ROOK_GAMES) return false
    return this.grantWarrant('rook')
  }

  /** Mr Voss lends the punt from 20 September. Returns true when granted now. */
  vossGrantsBishop(date: number): boolean {
    if (date < BISHOP_DATE) return false
    return this.grantWarrant('bishop')
  }

  /** Releases the bus subscription (tests, or leaving the season). */
  dispose(): void {
    for (const off of this.offs.splice(0)) off()
  }
}
