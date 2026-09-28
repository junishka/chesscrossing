// Frame O7: Heron Head (h8). Transcribed from docs/BIBLE.md §7, §12 (EE-29) and §14.2/§14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 2.40:1 frame. */
const FOV_40 = 20.66

/** The last line of Sheet 9 (EE-29). */
export const SHEET_NINE_LAST_LINE = 'h8 Heron Head. Surveyed 14 June 1965. A.H. Sheet complete. I am going on.'

/** The typed card on the chart table (HS-1206). */
export const HERON_CARD = '41. Kf3   A.H.'

/**
 * Heron Head, the far corner: the beacon dead centre, at its foot a chart table weighted with stones;
 * Sheet 9, the travelling set with 41. Kf3 played, a typed card. Always dusk. From Chapter Eight.
 * Chapter Eight starts here, so no first-visit card.
 */
export const heron: FrameDef = {
  id: 'heron',
  title: 'Heron Head',
  region: 'beyond',
  camera: { position: [0, 2.4, 14], target: [0, 2.4, 0], fov: FOV_40 },
  lens: 40,
  aspect: 2.40,
  music: 'grid',
  lockedUntilChapter: 8,
  flaw: "The beacon's red lens is missing; sky shows through the housing.",
  hotspots: [
    {
      id: 'heron.beacon', kind: 'object', label: 'BEACON',
      card: { kind: 'index', tag: 'HS-1201', title: 'BEACON, HERON HEAD', material: '1931', body: 'Lit from the lamp room. The red is for the grid.' },
    },
    {
      id: 'heron.sheet9', kind: 'insert', label: 'SHEET 9', egg: 'EE-29',
      card: { kind: 'index', tag: 'HS-1203', title: 'SHEET 9', body: 'Complete. 11 June to — .' },
      insert: { kind: 'sheet9', holdMs: 4000, title: 'SHEET 9', lines: [SHEET_NINE_LAST_LINE] },
    },
    {
      id: 'heron.set', kind: 'action', label: 'TRAVELLING SET', action: 'set',
      card: { kind: 'index', tag: 'HS-1205', title: 'TRAVELLING SET', body: '41. Kf3. White has moved. The card was not posted.' },
    },
    {
      id: 'heron.postcard', kind: 'action', label: 'POSTCARD', action: 'postcard',
      card: { kind: 'index', tag: 'HS-1206', title: 'POSTCARD, TYPED', body: HERON_CARD },
    },
    { id: 'heron.plate', kind: 'action', label: 'THE PLATE', action: 'plate', ledgerLine: 'Cairn h8 (Heron Head) read.' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The beacon: the rook's silhouette at twenty times scale, 4.8 m at 1:10; the red lens missing (the flaw). */
  beacon: { height: 4.8, redLensMissing: true },
  /** The camera stands 14 m from the beacon at 2.4 m so the beacon fits. */
  camera: { distance: 14, height: 2.4 },
  /** Always dusk: palette 3.4's dusk sky. */
  sky: 'grid.skyDusk',
  /** The chart table at the beacon's foot, weighted with stones; nothing personal on it. */
  table: { weightedWithStones: true, items: ['Sheet 9', 'travelling set', 'typed card'] },
  /** The set's position after 41. Kf3. */
  setFen: '2R5/4rp2/6p1/7p/1k6/5KPP/5P2/8 b - - 1 41',
  /** The last line of Sheet 9 and the card. */
  sheetNineLastLine: SHEET_NINE_LAST_LINE,
  card: HERON_CARD,
  /** The plate on h8 once the sheet is read. */
  plate: 'h8 · HERON HEAD · SURVEYED 1965 · A.H.',
  /** The launch is not here. */
  launchPresent: false,
  /** No music until the player leaves the islet (EE-29). */
  musicOnLeaveOnly: true,
}
