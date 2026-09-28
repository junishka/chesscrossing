// The nine chapters of the September 1965 log, docs/BIBLE.md §9. Pure data.
import type { ChapterDef, ChapterUnlock, Square, Warrant } from '../types'

/** A condition that opens a chapter. Any one trigger suffices; every chapter carries a date fallback. */
export type ChapterTrigger =
  | ChapterUnlock
  | { kind: 'date'; day: number }
  | { kind: 'square'; square: Square }
  | { kind: 'adjourned'; moves: number }
  | { kind: 'spoken'; ids: string[] }
  | { kind: 'warrant'; warrant: Warrant }

/** A chapter as the station layer reads it: the Recorder's sentence, its triggers, and what it opens. Frame ids are those of content/frames. */
export interface ChapterEntry {
  id: string
  number: number
  title: string
  /** The Recorder's card sentence, verbatim. */
  sentence: string
  /** Any one of these opens the chapter; the last is always the date. */
  triggers: ChapterTrigger[]
  /** The nearest condition the shared `ChapterUnlock` can express, when no trigger is one of its kinds. */
  unlock?: ChapterUnlock
  unlocks: {
    /** Frame ids opened (§14.6). */
    frames: string[]
    /** Feature ids the station layer switches on. */
    features: string[]
  }
}

/** The nine chapters, in order. */
export const chapterEntries: ChapterEntry[] = [
  {
    id: 'one', number: 1, title: 'THE BOARD ROOM',
    sentence: 'The visitor came on Wednesday. The guest chair was given.',
    triggers: [{ kind: 'start' }],
    // The Chart Room and Galley doors open after the first move, not at the card.
    unlocks: { frames: ['boardroom', 'chartroom', 'galley'], features: ['second', 'first-card'] },
  },
  {
    id: 'two', number: 2, title: 'THE HOUSE, IN SECTION',
    sentence: 'The visitor was shown the stairs. Nine rooms, counting the lamp room.',
    triggers: [{ kind: 'games', count: 1 }, { kind: 'adjourned', moves: 10 }, { kind: 'date', day: 3 }],
    unlocks: { frames: ['landing', 'recorders', 'workshop', 'boathouse', 'lamproom', 'section'], features: ['section'] },
  },
  {
    id: 'three', number: 3, title: 'THE JETTY',
    sentence: 'Mr Tuck gave the reading at 17:50. The visitor was present. It was the same reading.',
    triggers: [{ kind: 'frame', id: 'lamproom' }, { kind: 'date', day: 6 }],
    unlocks: { frames: ['jetty', 'path', 'point', 'grid'], features: ['outside-door', 'king-warrant', 'badge:VISITOR'] },
  },
  {
    id: 'four', number: 4, title: 'QUARTERS',
    sentence: 'The door was opened. Nothing was moved. I have checked.',
    triggers: [{ kind: 'games', count: 3 }, { kind: 'spoken', ids: ['brace', 'ida', 'ferrier', 'lisle', 'tuck'] }, { kind: 'date', day: 10 }],
    unlocks: { frames: ['quarters'], features: ["badge:RECORDER'S ASSISTANT"] },
  },
  {
    id: 'five', number: 5, title: "THE ROOK'S WARRANT",
    sentence: 'Tender No. 1 went out in straight lines and stopped where she was told.',
    // Two games finished and Tuck asked: Tuck grants the Rook's warrant on that asking (§8.5).
    triggers: [{ kind: 'warrant', warrant: 'rook' }, { kind: 'date', day: 13 }],
    unlock: { kind: 'games', count: 2 },
    unlocks: { frames: [], features: ['dinghy', 'rook-warrant', 'grid-beyond-a-file'] },
  },
  {
    id: 'six', number: 6, title: 'EIDER REACH',
    sentence: 'The centre was occupied. Mr Voss has been at home since 1957.',
    triggers: [{ kind: 'square', square: 'e4' }, { kind: 'frame', id: 'eider' }, { kind: 'date', day: 16 }],
    unlocks: { frames: ['eider'], features: ['voss', 'postcards', 'slate', 'badge:SURVEYOR'] },
  },
  {
    id: 'seven', number: 7, title: 'THE COUNT',
    sentence: 'Mr Lisle numbered the crates. The board was to go last. He had decided this on the first.',
    triggers: [{ kind: 'games', count: 5 }, { kind: 'date', day: 20 }],
    // The punt is not lent before the twentieth (HS-1009), whichever trigger opened the chapter.
    unlocks: { frames: [], features: ['crates', 'bishop-warrant'] },
  },
  {
    id: 'eight', number: 8, title: 'HERON HEAD',
    sentence: 'The h-file was surveyed. It had been surveyed before. Nobody had read the sheet.',
    triggers: [{ kind: 'games', count: 7 }, { kind: 'square', square: 'h8' }, { kind: 'frame', id: 'heron' }, { kind: 'date', day: 25 }],
    unlocks: { frames: ['heron'], features: ['sheet-nine', 'h-file-plates', 'carry-card', 'house-game'] },
  },
  {
    id: 'nine', number: 9, title: 'THE LAST TIDE',
    sentence: 'Low water was at 16:12. The season was closed properly.',
    triggers: [{ kind: 'date', day: 30 }],
    unlocks: { frames: [], features: ['photograph', 'last-tide', 'crating', 'appendix'] },
  },
]

/** The chapter number as it reads on the card: ONE, TWO, ... NINE. */
export const CHAPTER_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const

/** The card heading: `CHAPTER ONE`. */
export function chapterHeading(n: number): string {
  return `CHAPTER ${CHAPTER_WORDS[n - 1] ?? n}`
}

/** The sign-off under the Recorder's sentence, given the station date text. */
export function chapterSignoff(dateText: string): [string, string] {
  return ['I. Hardy, Recorder', dateText]
}

/** The last page, typed after the crating. */
export const LAST_PAGE = 'The season is closed. The board is set. — I. Hardy, Recorder.'

/** The heading of the Appendix, after the ending. */
export const APPENDIX_HEADING = 'OCTOBER 1965 AND AFTER'

/** Menu entry and its card for the Appendix. */
export const APPENDIX = { label: 'THE APPENDIX', card: 'The Society can count it again.' } as const

const NARROW_KINDS = new Set(['start', 'frame', 'eggs', 'games', 'win', 'converse'])

/**
 * The first trigger expressible as a ChapterUnlock. Chapter Nine opens by the date alone, which the
 * narrow type cannot say; it is given `eggs: 32`, a count that includes the ending's own eggs and so
 * cannot fire before it.
 */
function narrowUnlock(entry: ChapterEntry): ChapterUnlock {
  if (entry.unlock) return entry.unlock
  for (const t of entry.triggers) if (NARROW_KINDS.has(t.kind)) return t as ChapterUnlock
  return { kind: 'eggs', count: 32 }
}

/** The chapters in the shared shape, for the UI and the store. Progression should read `chapterEntries`. */
export const chapters: ChapterDef[] = chapterEntries.map((e) => ({
  id: e.id, number: e.number, title: e.title, subtitle: e.sentence, unlock: narrowUnlock(e),
}))

/** Finds a chapter entry by number. */
export function chapterByNumber(n: number): ChapterEntry | undefined {
  return chapterEntries.find((c) => c.number === n)
}
