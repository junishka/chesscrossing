/**
 * Words on the page that are not an object's caption. All from docs/bible.md
 * section 1 (the front matter) and section 7 (the roster).
 */

/** The property line of the header; the page head repeats it. */
export const PAGE_PROPERTY_LINE = 'Property: Frontier Post No. 7 (Marle-on-Lisk), known locally as the Crossing.'

/**
 * The header's Columns line becomes the page's column heads. The bible names
 * them Item No., Description, Material, Condition, Ownership, Disposition;
 * the two narrow columns are abbreviated as docs/visual.md section 8 prints them.
 */
export const COLUMN_HEADS: readonly [string, string, string, string, string, string] = [
  'No.',
  'Description',
  'Material',
  'Condition',
  'Own.',
  'Disposition',
]

/** Column widths as fractions of the caption block (visual section 8). */
export const COLUMN_WIDTHS: readonly [number, number, number, number, number, number] = [0.1, 0.38, 0.16, 0.14, 0.06, 0.16]

/** Typed onto the page as the first annotation when the room arrives, over 1.4 s. */
export const THIRD_HAND_LINE =
  'Persons present, continued, in the third hand: Visitor (1), admitted under Standing Order 11. Received in Room 1.'
export const THIRD_HAND_LINE_MS = 1400

/** The dossier roster line, left and the item it belongs to. */
export const ROSTER_LEFT = 'Marle Chess Club. Roster.'
export const ROSTER_ITEM = '6-09'
export const ROSTER_COUNT = 32

/** The em dash that opens every annotation, and stands alone for silence. */
export const DASH = '—'
