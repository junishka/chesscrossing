// Frame O5: Eider Reach (e4). Transcribed from docs/BIBLE.md §7, §12 (EE-27, EE-28) and §14.6.
import type { FrameDef } from '../../types'
import { SLATE_NAMES } from '../survey'

/** 40 mm at 35 mm gauge in a 2.40:1 frame. */
const FOV_40 = 20.66

/** The 9 June card from Kettle, in the Olivetti's bent `e` (EE-28). */
export const JUNE_CARD = '40. Rc8   your move, then. A.H.'

/**
 * Eider Reach, the centre of the grid: a driftwood hut painted sand mustard, exactly square, dead centre,
 * door open; the Surveyor on a stool outside, on the left. Chapter Six starts here, so no first-visit card.
 */
export const eider: FrameDef = {
  id: 'eider',
  title: 'Eider Reach',
  region: 'beyond',
  camera: { position: [0, 1.5, 6], target: [0, 0.6, 0], fov: FOV_40 },
  lens: 40,
  aspect: 2.40,
  music: 'grid',
  resident: 'voss',
  flaw: 'The Surveyor sits on a stool outside, on the left: the hut is the symmetry and the man the flaw.',
  hotspots: [
    { id: 'eider.voss', kind: 'resident', label: 'MR VOSS', resident: 'voss' },
    {
      id: 'eider.hut', kind: 'object', label: 'HUT',
      card: { kind: 'index', tag: 'HS-1001', title: 'HUT', material: 'driftwood · 1957', body: 'Voss. Not on the roster since 1957. On the chart since 1931.' },
    },
    {
      id: 'eider.slate', kind: 'action', label: 'THE SLATE', action: 'slate', egg: 'EE-27',
      card: { kind: 'index', tag: 'HS-1003', title: "THE SURVEYOR'S SLATE", body: "Sixty-four names in his hand. The h-file carries the Kettle boats' names, the older ones: Haaf Ness, Hask Shoal, Hallan Flat, Heugh Reach, Hirst Sound, Howe Holm, Hoy Skerry, Hough Head." },
    },
    {
      id: 'eider.postcards', kind: 'insert', label: 'POSTCARDS', action: 'postcards', egg: 'EE-28',
      card: { kind: 'index', tag: 'HS-1007', title: 'POSTCARDS, 79', body: 'Each with one move. From A. Hardy, via Kettle, via Tuck, via the dinghy. The last is dated 9 June.' },
      insert: { kind: 'postcards', holdMs: 4000, title: 'POSTCARDS, 79', lines: [JUNE_CARD] },
    },
    {
      id: 'eider.punt', kind: 'action', label: 'PUNT AND POLE', action: 'punt', requires: { chapter: 7 },
      card: { kind: 'index', tag: 'HS-1009', title: 'PUNT AND POLE', body: "Bishop's warrant. Diagonals only. Not lent before the twentieth." },
    },
    { id: 'eider.plate', kind: 'action', label: 'THE PLATE', action: 'plate', ledgerLine: 'Cairn e4 (Eider Reach) read.' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The hut: driftwood, sand mustard, exactly square, door open; inside, seen frontally, a table with a slate board. */
  hut: { paint: 'br.sandMustard', square: true, doorOpen: true },
  /** Tagged cords run from the hut's corners to the cairn. */
  cords: { fromCorners: 4, to: 'cairn' },
  /** The Surveyor's stool, outside, on the left (the flaw). */
  stool: { side: 'left' as const },
  /** The older Kettle names on the slate, h1 to h8. */
  slate: SLATE_NAMES,
  /** The postcards: 79, one move each; the insert shows the game from Black's side, White to move at 41. */
  postcards: { count: 79, lastDated: '9 June', juneCard: JUNE_CARD, fromBlacksSide: true, whiteToMoveAt: 41 },
  /** The plate on e4. */
  plate: 'e4 · EIDER REACH · SURVEYED 1931 · A.H.',
  /** The punt is lent from 20 September (Chapter Seven). */
  puntFromDay: 20,
}
