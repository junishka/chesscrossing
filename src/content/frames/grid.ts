// Frame O4: The Sixty-Four, the re-dressed islet stage and the chart. Transcribed from docs/BIBLE.md §7, §12 (EE-24, EE-26) and §14.2/§14.6.
import type { FrameDef } from '../../types'
import { FIXED_ISLETS, legend } from '../survey'

/** 40 mm and 80 mm at 35 mm gauge in a 2.40:1 frame. */
const FOV_40 = 20.66
const FOV_80 = 10.42

/** The chart table stands at world (400, 0, 0), 100 m along x from the stage; its top is taken at 0.72 m like the house tables. */
const CHART_TABLE: [number, number, number] = [100, 0.72, 0]

/**
 * The grid (origin at the islet stage's cairn): the tableau of the islet you stand on, the cairn dead centre
 * with its plate, channels either side, neighbours as flat shapes, the house miniature small on the left horizon.
 * The `chart` station is the founder's chart on paper, straight down from 5.9 m through the 80 mm lens.
 */
export const grid: FrameDef = {
  id: 'grid',
  title: 'The Sixty-Four',
  region: 'beyond',
  card: { title: 'The Sixty-Four' },
  camera: { position: [0, 1.5, 6], target: [0, 0.6, 0], fov: FOV_40 },
  lens: 40,
  aspect: 2.40,
  music: 'grid',
  flaw: 'One of four by hash(square) mod 4: a cairn stone out of true; a footprint line; a tag string; the plate set low.',
  stations: {
    chart: { position: [CHART_TABLE[0], CHART_TABLE[1] + 5.9, CHART_TABLE[2]], target: CHART_TABLE, fov: FOV_80 },
  },
  hotspots: [
    // Every plate reads `[ALGEBRAIC] · [SURVEY NAME] · SURVEYED [YEAR] · A.H.`; the station layer fills the square.
    { id: 'grid.plate', kind: 'action', label: 'THE PLATE', action: 'plate', ledgerLine: 'Cairn {square} ({name}) read.' },
    { id: 'grid.cairn', kind: 'object', label: 'CAIRN', egg: 'EE-24' },
    { id: 'grid.chart', kind: 'action', label: 'THE CHART', action: 'chart' },
    // Back to the Point from a1 only; the station layer enforces the square.
    { id: 'grid.causeway', kind: 'door', label: 'THE POINT', to: 'point', via: 'cut' },
  ],
}

/** What the builder and the station layer need beyond the hotspots. */
export const dressing = {
  /** At 1:10: each islet 9.1 m square, channels 1.1 m, a cairn 0.6 m. */
  islet: { size: 9.1, channel: 1.1, cairn: 0.6 },
  /** The Society's measurement, as every plate and card states it: islets one hundred yards square, channels twelve yards. */
  stated: { isletYards: 100, channelYards: 12 },
  /** The chart: 1.4 m of paper on a table, the pin at 0.350 m/s, half a second per islet. */
  chart: { size: 1.4, pinSpeed: 0.35, secondsPerIslet: 0.5, table: CHART_TABLE },
  /** The plate's form; h-file plates read NOT SURVEYED until Chapter Eight. */
  plate: { form: '[ALGEBRAIC] · [SURVEY NAME] · SURVEYED [YEAR] · A.H.', unsurveyed: 'NOT SURVEYED', hFileOpensAtChapter: 8 },
  /** The four flaws, by hash(square) mod 4. */
  flaws: ['a cairn stone out of true', 'a footprint line', 'a tag string', 'the plate set low'],
  /** The six found objects, by hash(square) mod 6. */
  objects: ['a glass float', 'a ration tin', 'a chess-book page under a stone', 'shells in a row', 'a driftwood piece', 'an oar'],
  /** Squares with fixed dressings rather than the hashed stage. */
  fixed: FIXED_ISLETS,
  /** All sixty-four names, for the chart. */
  legend,
  /** The cairn tag: `RETURNED  EXPEDITION 3  MOVE 17`, persisting across sessions (EE-24). */
  tagForm: 'RETURNED  EXPEDITION [N]  MOVE [M]',
  /** Typed when the player stays past the bells. */
  tideCameIn: 'The tide came in. Mr Tuck came for you in the dinghy. It is entered in the log.',
  /** The house bell strikes three times 90 s before the crossable state ends. */
  bells: { strikes: 3, beforeMs: 90_000 },
  /** The house miniature, small on the left horizon. */
  houseMiniature: { side: 'left' as const, width: 2.1 },
}
