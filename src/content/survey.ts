// The survey of the Sixty-Four: file words, rank words, islet names, plates, tags. docs/BIBLE.md §5.1, §7 (O4, O5). Pure data.
import type { File, Rank, Square } from '../types'

/** The eight file words, engraved along the near and far rim bands. */
export const FILE_WORDS: Record<File, string> = {
  a: 'Alder', b: 'Bramble', c: 'Cinder', d: 'Dunlin', e: 'Eider', f: 'Fennel', g: 'Gannet', h: 'Heron',
}

/** The eight rank words, engraved along the left and right rim bands. */
export const RANK_WORDS: Record<Rank, string> = {
  1: 'Ness', 2: 'Shoal', 3: 'Flat', 4: 'Reach', 5: 'Sound', 6: 'Holm', 7: 'Skerry', 8: 'Head',
}

/** The files, a to h. */
export const FILES: File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
/** The ranks, 1 to 8. */
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8]

/** The Kettle boats' older names for the h-file, kept on the Surveyor's slate (HS-1003). */
export const SLATE_NAMES: Record<Square & `h${Rank}`, string> = {
  h1: 'Haaf Ness', h2: 'Hask Shoal', h3: 'Hallan Flat', h4: 'Heugh Reach', h5: 'Hirst Sound', h6: 'Howe Holm', h7: 'Hoy Skerry', h8: 'Hough Head',
}

/** The year the h-file was surveyed (Sheet 9, 14 June 1965); every other file was surveyed in 1931. */
export const H_FILE_SURVEY_YEAR = 1965
/** The founding survey. */
export const SURVEY_YEAR = 1931

/** Splits a square into its file and rank. */
export function fileRank(sq: Square): { file: File; rank: Rank } {
  return { file: sq[0] as File, rank: Number(sq[1]) as Rank }
}

/** The compound survey name: file word then rank word. e4 is Eider Reach. */
export function isletName(sq: Square): string {
  const { file, rank } = fileRank(sq)
  return `${FILE_WORDS[file]} ${RANK_WORDS[rank]}`
}

/** True for a square on the h-file, whose plates read NOT SURVEYED until Chapter Eight. */
export function isHFile(sq: Square): boolean {
  return sq[0] === 'h'
}

/** The name on the Surveyor's slate: the older Kettle name on the h-file, the survey name elsewhere. */
export function slateName(sq: Square): string {
  return isHFile(sq) ? SLATE_NAMES[sq as Square & `h${Rank}`] : isletName(sq)
}

/** The year on an islet's plate: 1931, or 1965 on the h-file. */
export function surveyedYear(sq: Square): number {
  return isHFile(sq) ? H_FILE_SURVEY_YEAR : SURVEY_YEAR
}

/** The cairn plate: `e4 · EIDER REACH · SURVEYED 1931 · A.H.`, or `h8 · HERON HEAD · NOT SURVEYED` before the sheet is read. */
export function plateText(sq: Square, year: number, surveyed: boolean): string {
  const name = isletName(sq).toUpperCase()
  return surveyed ? `${sq} · ${name} · SURVEYED ${year} · A.H.` : `${sq} · ${name} · NOT SURVEYED`
}

/** The ledger line typed when a plate is read: `Cairn c4 (Cinder Reach) read.` */
export function cairnReadLine(sq: Square): string {
  return `Cairn ${sq} (${isletName(sq)}) read.`
}

/** The paper tag that slides into THE RETURNED: `RETURNED  MOVE 23  EIDER REACH`. */
export function returnedTag(move: number, sq: Square): string {
  return `RETURNED  MOVE ${move}  ${isletName(sq).toUpperCase()}`
}

/** The tag a promoted pawn leaves in THE RETURNED: `PROMOTED  MOVE 41  HERON HEAD`. */
export function promotedTag(move: number, sq: Square): string {
  return `PROMOTED  MOVE ${move}  ${isletName(sq).toUpperCase()}`
}

/** The tag on a cairn where a capture happened this season: `RETURNED  EXPEDITION 3  MOVE 17`. */
export function cairnTag(expedition: number, move: number): string {
  return `RETURNED  EXPEDITION ${expedition}  MOVE ${move}`
}

/** The second tag a piece left in the tray overnight acquires. */
export const COUNTED_TAG = 'COUNTED.  B.L.'

/** One entry of the brass legend plate at the Point. */
export interface LegendEntry { square: Square; name: string }

/** All sixty-four names, file by file from Alder Ness to Heron Head. */
export const legend: LegendEntry[] = FILES.flatMap((f) => RANKS.map((r): LegendEntry => {
  const square = `${f}${r}` as Square
  return { square, name: isletName(square) }
}))

/** Every square, in the legend's order. */
export const ALL_SQUARES: Square[] = legend.map((e) => e.square)

/** A small deterministic hash of a square, for the islet stage's dressing (`hash(square) mod 4`, `mod 6`). */
export function squareHash(sq: Square): number {
  const { file, rank } = fileRank(sq)
  const i = FILES.indexOf(file) * 8 + (rank - 1)
  let h = (i + 1) * 2654435761
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return h >>> 0
}

/** The islet stage's flaw for a square (§7 O4): a cairn stone out of true; a footprint line; a tag string; the plate set low. */
export function isletFlaw(sq: Square): 'stone' | 'footprint' | 'string' | 'plateLow' {
  return (['stone', 'footprint', 'string', 'plateLow'] as const)[squareHash(sq) % 4]
}

/** The islet stage's found object for a square (§7 O4). */
export function isletObject(sq: Square): 'float' | 'tin' | 'page' | 'shells' | 'driftwood' | 'oar' {
  return (['float', 'tin', 'page', 'shells', 'driftwood', 'oar'] as const)[squareHash(sq) % 6]
}

/** Squares with fixed dressings rather than the hashed stage: a1, c6, e4 and h8. */
export const FIXED_ISLETS: Square[] = ['a1', 'c6', 'e4', 'h8']
