// The nine chapters of the September 1965 log as the station runs them (docs/BIBLE.md §9, §14.6;
// docs/ARCHITECTURE.md "station/chapters.ts"). No three, no DOM: the world is reached through the bus.
import type { ChapterDef, Requirement, Season, Warrant, BadgeId } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { chapterEntries, chapters, type ChapterEntry, type ChapterTrigger } from '../content/chapters'
import { frames } from '../content/frames/index'

/** What the engine needs of the SeasonClock: the live season and whether the causeway is crossable. */
export interface SeasonLike {
  /** Live object, the same reference as `store.ledger.season`. */
  season: Season
  /** True at low water, when the causeway can be crossed. */
  crossable(): boolean
}

/** The number of chapters in the log. */
export const CHAPTER_COUNT = 9

/** Frames whose doors open after the first move of the season, not at the Chapter One card (§9). */
const FIRST_MOVE_FRAMES: readonly string[] = ['chartroom', 'galley']

/** Frame opened by standing on a square, before its chapter card (§9: "reaching e4"). */
const SQUARE_FRAMES: Readonly<Record<string, string>> = { eider: 'e4', heron: 'h8' }

/** The `visited` id GridWalk marks for a square stood on (station/grid.ts). */
function isletId(square: string): string { return `islet:${square}` }

/** Chapter each region opens at, for frames named on no chapter's list and carrying no lock. */
const REGION_CHAPTER: Readonly<Record<string, number>> = { boardroom: 1, house: 2, outside: 3, beyond: 3 }

/** Feature ids that grant something on the card itself, rather than switching a system on. */
const FEATURE_WARRANTS: Readonly<Record<string, Warrant>> = {
  'king-warrant': 'king', 'rook-warrant': 'rook', 'bishop-warrant': 'bishop',
}
const FEATURE_BADGES: Readonly<Record<string, BadgeId>> = { 'badge:VISITOR': 'VISITOR' }

/** Counts the numbered moves in a PGN movetext, without a parser. */
function movesInPgn(pgn: string): number {
  const body = pgn.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '')
  const numbers = body.match(/(?:^|\s)(\d+)\.(?!\.)/g)
  return numbers ? numbers.length : 0
}

/**
 * The chapter engine. Reads the ledger and the season, decides when the next page of the log is typed,
 * and tells the world which doors are open. Chapters open in order, one per `check()`, never by winning.
 */
export class ChapterEngine {
  private readonly clock: SeasonLike
  private firstMove = false
  /** A game has begun in this session and not yet finished. */
  private live = false
  /** A frame was entered since the last move: the board was left with the game saved, which is adjournment. */
  private leftBoard = false
  private readonly offs: Array<() => void> = []

  /** Reads the ledger's chapters into the season so `current()` agrees with what was marked. */
  constructor(season: SeasonLike) {
    this.clock = season
    const marked = store.ledger.chapters
      .map((id) => chapterEntries.find((c) => c.id === id)?.number ?? 0)
      .reduce((a, b) => Math.max(a, b), 0)
    if (marked > this.season.chapter) this.season.chapter = marked
    this.offs.push(bus.on('game:move', () => { this.firstMove = true; this.leftBoard = false }))
    this.offs.push(bus.on('game:new', () => { this.firstMove = false; this.live = true; this.leftBoard = false }))
    this.offs.push(bus.on('game:over', () => { this.live = false }))
    this.offs.push(bus.on('world:enter', () => { this.leftBoard = true }))
  }

  private get season(): Season { return this.clock.season }

  /** The chapter the log is on, 1..9. */
  current(): number {
    return Math.max(1, Math.min(CHAPTER_COUNT, this.season.chapter))
  }

  /** True once the Chapter One card has been shown (the id is marked in the ledger). */
  started(): boolean {
    return store.has('chapters', chapterEntries[0].id)
  }

  /** Whether the first move of the season has been made: this game, a played game, or a move on the roll. */
  firstMoveMade(): boolean {
    return this.firstMove
      || store.ledger.games.played > 0
      || this.current() >= 2
      || store.ledger.rows.some((r) => r.kind === 'move')
  }

  /** The chapter a frame opens at: its `lockedUntilChapter`, else the chapter whose list names it, else its region. */
  chapterOfFrame(frameId: string): number {
    const def = frames.find((f) => f.id === frameId)
    if (def?.lockedUntilChapter !== undefined) return def.lockedUntilChapter
    const listed = chapterEntries.find((c) => c.unlocks.frames.includes(frameId))
    if (listed) return listed.number
    return REGION_CHAPTER[def?.region ?? 'boardroom'] ?? 1
  }

  /** Whether a frame may be entered: lock lists, chapter unlock lists, the first move, and squares reached. */
  isFrameOpen(frameId: string): boolean {
    const n = this.current()
    if (FIRST_MOVE_FRAMES.includes(frameId)) return this.firstMoveMade()
    const square = SQUARE_FRAMES[frameId]
    if (square && this.season.gridSquare === square) return true
    return n >= this.chapterOfFrame(frameId)
  }

  /** Evaluates a hotspot's Requirement: chapter, warrant, lowWater, watches, gamesFinished. All given must hold. */
  requirementMet(r?: Requirement): boolean {
    if (!r) return true
    if (r.chapter !== undefined && this.current() < r.chapter) return false
    if (r.warrant !== undefined && !this.season.warrants.includes(r.warrant)) return false
    if (r.lowWater !== undefined && this.clock.crossable() !== r.lowWater) return false
    if (r.watches !== undefined && !r.watches.includes(this.season.watch)) return false
    if (r.gamesFinished !== undefined && store.ledger.games.played < r.gamesFinished) return false
    return true
  }

  /**
   * Whether a game of at least `moves` numbered moves stands adjourned: saved to the log (game.ts writes
   * `savedGame` after every move) and not being played, because no game has begun in this session or the
   * board was left since the last move. The log is the save file; leaving the board is adjournment (§5.7).
   */
  adjourned(moves: number): boolean {
    const saved = store.ledger.savedGame
    if (!saved || movesInPgn(saved.pgn) < moves) return false
    return !this.live || this.leftBoard
  }

  /** Whether one trigger holds now. */
  triggerHolds(t: ChapterTrigger): boolean {
    const s = this.season
    const g = store.ledger.games
    switch (t.kind) {
      case 'start': return true
      case 'date': return s.date >= t.day
      case 'games': return g.played >= t.count
      case 'frame': return store.has('visited', t.id)
      case 'square': return s.gridSquare === t.square || store.has('visited', isletId(t.square))
      case 'spoken': return t.ids.every((id) => s.spokenTo.includes(id))
      case 'warrant': return s.warrants.includes(t.warrant)
      case 'adjourned': return this.adjourned(t.moves)
      case 'eggs': return store.ledger.eggs.length >= t.count
      case 'win': return g.won >= 1
      case 'converse': return s.spokenTo.includes(t.id)
    }
  }

  /** Whether any of a chapter's triggers holds (its date fallback included). */
  chapterReady(entry: ChapterEntry): boolean {
    return entry.triggers.some((t) => this.triggerHolds(t))
  }

  /** Evaluates the next chapter's triggers and unlocks it if one holds. One chapter per call, in order. */
  check(): void {
    if (!this.started()) { void this.unlock(1); return }
    const next = this.current() + 1
    if (next > CHAPTER_COUNT) return
    const entry = chapterEntries[next - 1]
    if (this.chapterReady(entry)) void this.unlock(next)
  }

  /**
   * Types the chapter's page: marks the ledger, sets the season's chapter, grants what the card itself
   * grants, and announces the chapter. The UI shows the Recorder's card (heading, title, sentence, 3200 ms)
   * on `chapter:unlock` and the card cues the Survey Theme once (ui/overlay.ts, ui/titleCards.ts), so the
   * engine emits neither `ui:title` nor `audio:music`: a second card or a second theme would be a violation
   * of §10 ("once at each chapter card").
   */
  unlock(n: number): Promise<void> {
    if (n < 1 || n > CHAPTER_COUNT) return Promise.resolve()
    const entry = chapterEntries[n - 1]
    const def: ChapterDef = chapters[n - 1]
    store.mark('chapters', entry.id)
    if (this.season.chapter < n) this.season.chapter = n
    store.save()
    this.grantFeatures(entry)
    bus.emit('chapter:unlock', { chapter: def })
    return Promise.resolve()
  }

  /** Grants the warrants and the badge the chapter's own page confers (§9), once each. */
  private grantFeatures(entry: ChapterEntry): void {
    for (const f of entry.unlocks.features) {
      const w = FEATURE_WARRANTS[f]
      if (w && !this.season.warrants.includes(w)) {
        this.season.warrants.push(w)
        bus.emit('warrant:grant', { warrant: w })
      }
      const b = FEATURE_BADGES[f]
      if (b && !this.season.badges.includes(b)) {
        this.season.badges.push(b)
        bus.emit('badge:grant', { badge: b })
      }
    }
  }

  /** Releases the bus subscriptions (tests, or leaving the season). */
  dispose(): void {
    for (const off of this.offs.splice(0)) off()
  }
}
