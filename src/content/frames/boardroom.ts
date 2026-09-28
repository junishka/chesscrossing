// Frame 1: The Board Room (ground, centre). Transcribed from docs/BIBLE.md §6, §5.9, §14.2 and §14.6.
// Pure data: no imports from three or the DOM.
import type { FrameDef } from '../../types'

/** Vertical field of view in degrees for a lens at 35 mm gauge in a 1.85:1 frame: 40 mm → 26.61°, 22 → 46.53°, 80 → 13.49°, 35 → 30.25°. */
const FOV_40 = 26.61
const FOV_22 = 46.53
const FOV_80 = 13.49
const FOV_35 = 30.25

/** The Board Room: the board on a teak table, the empty chair, the clock and the gauge. Chapter One starts here, so it has no first-visit card. */
export const boardroom: FrameDef = {
  id: 'boardroom',
  title: 'The Board Room',
  region: 'boardroom',
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'slackwater',
  flaw: "The Society's peaked cap, navy serge, its badge tarnished, on the far chair's post, right side.",
  stations: {
    table: { position: [0, 1.15, 0.642], target: [0, 0.751, -0.275], fov: FOV_22 },
    chart: { position: [0, 2.969, 0], target: [0, 0.729, -0.001], fov: FOV_80 },
    profile: { position: [-0.95, 0.80, 0], target: [0, 0.734, 0], fov: FOV_35 },
  },
  hotspots: [
    {
      id: 'boardroom.board', kind: 'board', label: 'THE BOARD', action: 'sit', egg: 'EE-01',
      card: { kind: 'index', tag: 'HS-0001', title: 'THE BOARD', material: 'ebonised pear, brass, lacquer · 1931', body: 'Never left unset.' },
    },
    {
      id: 'boardroom.chronometer', kind: 'action', label: 'CHRONOMETER PAIR', action: 'watch',
      card: { kind: 'index', tag: 'HS-0002', title: 'CHRONOMETER PAIR', material: 'walnut, brass · 1934', body: 'They disagree by a beat. They have since 1934.' },
    },
    {
      id: 'boardroom.ledger', kind: 'object', label: 'THE LEDGER', egg: 'EE-04',
      card: { kind: 'index', tag: 'HS-0003', title: 'THE LEDGER, VOL. XIV', material: 'ruled roll · 1965', body: 'Every game is an expedition. Every crate is entered after it.' },
    },
    {
      id: 'boardroom.mast', kind: 'object', label: 'SIGNAL MAST', egg: 'EE-02',
      card: { kind: 'index', tag: 'HS-0005', title: 'SIGNAL MAST', material: 'brass, felt · 1931', body: 'Flags U, N, C, P. Others were never needed.' },
    },
    {
      id: 'boardroom.davit', kind: 'object', label: 'THE DAVIT',
      card: { kind: 'index', tag: 'HS-0006', title: 'THE DAVIT', material: 'brass, felt, cable · 1948', body: 'Geared to the Predictor. It lifts and it puts down.' },
    },
    {
      id: 'boardroom.chair', kind: 'object', label: "STATION MASTER'S CHAIR",
      card: { kind: 'index', tag: 'HS-0008', title: "STATION MASTER'S CHAIR", material: 'beech, corduroy · 1931', body: 'It still plays.' },
    },
    {
      id: 'boardroom.spares', kind: 'object', label: 'SPARES', egg: 'EE-03',
      card: { kind: 'index', tag: 'HS-0009', title: 'THE SPARES DRAWER', material: 'pear, felt · 1948', body: 'Four of each colour. One rook has no slot and never had one.' },
    },
    {
      // The felt tray before the near rim (§5.8). The bible gives it no card; this one is filled in its register.
      id: 'boardroom.returned', kind: 'object', label: 'THE RETURNED', egg: 'EE-05',
      card: { kind: 'index', tag: 'HS-0007', title: 'THE RETURNED', material: 'pear, felt · 1948', body: 'Two rows of sixteen. Read by counting what is empty.' },
    },
    { id: 'boardroom.consult', kind: 'action', label: 'CONSULT', action: 'consult' },
    { id: 'boardroom.turn', kind: 'action', label: 'LAZY SUSAN', action: 'turn' },
    { id: 'boardroom.door.chartroom', kind: 'door', label: 'THE CHART ROOM', to: 'chartroom', via: 'dolly-left' },
    { id: 'boardroom.door.galley', kind: 'door', label: 'THE GALLEY', to: 'galley', via: 'dolly-right' },
    { id: 'boardroom.stair', kind: 'door', label: 'THE LANDING', to: 'landing', via: 'lift-up' },
  ],
}

/** What the builder needs beyond the hotspots: placards, the flags, the menu plate, the table numbers. */
export const dressing = {
  /** Table top height and size (§14.1). */
  table: { top: 0.72, width: 1.2, depth: 0.9 },
  /** Board tray: 484 mm square, lacquer surface at y 0.729, brass rim 22 mm. */
  board: { size: 0.484, surfaceY: 0.729, rim: 0.022 },
  /** Wall clock (left) and tide gauge (right), both centred at y 0.98 on the far wall. */
  wallCentreY: 0.98,
  /** Engraved brass placards (§4). */
  placards: [
    'TIDE GAUGE.  READ FROM THE LEFT.  DO NOT ADJUST.',
    'THE BOARD IS NEVER LEFT UNSET.  STANDING ORDER 4.',
  ],
  /** The four flags in the mast's felt pocket. */
  flags: ['U', 'N', 'C', 'P'],
  /** The chair's cap: navy serge, badge tarnished, on the far chair's post, right side (the flaw). */
  cap: { post: 'right' as const },
  /** The main menu, a brass plate on the pale blue wall (§4). */
  menuPlate: [
    'THE HALYARD SURVEY',
    'A CHESS GAME AND A SURVEY OF THE SIXTY-FOUR',
    'IN NINE CHAPTERS',
    '',
    'BEGIN THE SEASON',
    'CONTINUE',
    'THE LEDGER',
    'THE ROSTER',
    'THE STANDING ORDERS',
    '',
    'HALYARD ISLAND HYDROGRAPHIC STATION.  EST. 1931.',
  ],
  /** Chapter One's one typed card, the tutorial (§9). */
  firstCard: 'Standing Order 11. The guest has the first move.',
  /** The brass plates on the near rim: consult and the camera plate's three views. */
  rimPlates: { consult: 'CONSULT', views: ['TABLE', 'CHART', 'PROFILE'] },
  /** The chronometer plate's watches (§5.6). */
  watches: ['DOG WATCH  5 + 3', 'MIDDLE WATCH  15 + 10', 'LONG WATCH  30 + 0', 'NO WATCH'],
}
