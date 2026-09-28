// Frame 2: The Chart Room (ground, left). Transcribed from docs/BIBLE.md §6 and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The Chart Room: the great chart, the Predictor, the gauge and the barometer, Miss Brace at the table. */
export const chartroom: FrameDef = {
  id: 'chartroom',
  title: 'The Chart Room',
  region: 'house',
  card: { title: 'The Chart Room' },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'brace',
  flaw: 'One tube empty, labeled SHEET 9 · OUT WITH THE LAUNCH.',
  hotspots: [
    { id: 'chartroom.brace', kind: 'resident', label: 'MISS BRACE', resident: 'brace' },
    {
      id: 'chartroom.chart', kind: 'action', label: 'THE CHART', action: 'chart',
      card: { kind: 'index', tag: 'HS-0102', title: 'CHART OF THE SIXTY-FOUR, SHEET 1', material: 'linen-backed paper · 1931', body: 'Drawn by A. Hardy. Corrected 1948, 1957.' },
    },
    {
      id: 'chartroom.predictor', kind: 'insert', label: 'THE PREDICTOR', egg: 'EE-07',
      card: { kind: 'index', tag: 'HS-0110', title: 'THE PREDICTOR', material: 'brass, 41 pulleys · 1931, geared 1948', body: 'Predicts the tide to 1970. Wound on Sundays.' },
      insert: { kind: 'predictor', holdMs: 4000, title: 'THE PREDICTOR' },
    },
    {
      id: 'chartroom.barometer', kind: 'action', label: 'BAROMETER', action: 'barometer',
      card: { kind: 'index', tag: 'HS-0113', title: 'BAROMETER', material: 'brass, glass · 1931', body: 'Tapped on Sundays. Reads the sea state.' },
    },
    {
      id: 'chartroom.tables', kind: 'object', label: 'TIDE TABLES',
      card: { kind: 'index', tag: 'HS-0119', title: 'TIDE TABLES, 1965', material: 'paper', body: 'Low water on the 30th at 16:12.' },
    },
    {
      id: 'chartroom.navchair', kind: 'object', label: "NAVIGATOR'S CHAIR",
      card: { kind: 'index', tag: 'HS-0121', title: "NAVIGATOR'S CHAIR", material: 'oak · 1931', body: 'Hers since 1954.' },
    },
    {
      id: 'chartroom.tube', kind: 'object', label: 'SHEET 9', egg: 'EE-06',
      card: { kind: 'label', title: 'SHEET 9', body: 'SHEET 9 · OUT WITH THE LAUNCH' },
    },
    { id: 'chartroom.door.boardroom', kind: 'door', label: 'THE BOARD ROOM', to: 'boardroom', via: 'dolly-right' },
    { id: 'chartroom.trap', kind: 'door', label: 'THE WORKSHOP', to: 'workshop', via: 'lift-down' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The great chart of the Sixty-Four on the table: 1.4 m, all names. */
  chart: { size: 1.4 },
  /** The Predictor: 1.6 m long, 41 pulleys in a row, a paper drum, one dial. */
  predictor: { length: 1.6, pulleys: 41 },
  /** Engraved brass placard on the Predictor (§4). */
  placard: 'THE PREDICTOR.  WOUND ON SUNDAYS.  IT HOLDS A WEEK.',
  /** The label on the one empty tube in the rack (the flaw). */
  emptyTube: 'SHEET 9 · OUT WITH THE LAUNCH',
  /** The barometer's dial: Beaufort sea states 0..8, found at 8 when the season begins (§5.3). */
  barometer: { states: ['CALM', 'LIGHT AIR', 'LIGHT BREEZE', 'GENTLE BREEZE', 'MODERATE BREEZE', 'FRESH BREEZE', 'STRONG BREEZE', 'NEAR GALE', 'GALE'], foundAt: 8 },
  /** The Predictor insert: the pulleys turn once, 4 s at 12 fps; the drum advances one line. */
  insert: { ms: 4000, fps: 12 },
}
