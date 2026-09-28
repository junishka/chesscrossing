// Frame 3: The Galley (ground, right). Transcribed from docs/BIBLE.md §6 and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The Galley: the range, copper pans, two dressers of labeled tins, Mr Lisle at the long table. */
export const galley: FrameDef = {
  id: 'galley',
  title: 'The Galley',
  region: 'house',
  card: { title: 'The Galley' },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'lisle',
  flaw: 'One tin on the right dresser turned label-in.',
  hotspots: [
    { id: 'galley.lisle', kind: 'resident', label: 'MR LISLE', resident: 'lisle' },
    {
      id: 'galley.tins', kind: 'object', label: 'TINS',
      card: { kind: 'index', tag: 'HS-0206', title: 'TINS, LABELED, 41', material: 'tin, paper', body: 'Everything in this room is counted on Sundays.' },
    },
    {
      id: 'galley.inventory', kind: 'action', label: 'INVENTORY BOOK', action: 'inventory',
      card: { kind: 'index', tag: 'HS-0210', title: 'INVENTORY BOOK', material: 'paper · 1965', body: 'Flour 22 lb. Tea 4 lb. Chess pieces 32 (one spare set, 40).' },
    },
    {
      id: 'galley.ration', kind: 'object', label: 'THE RATION CARD',
      card: { kind: 'index', tag: 'HS-0214', title: 'THE RATION CARD', material: 'card', body: 'Visitor: one egg, four biscuits, tea without limit.' },
    },
    {
      id: 'galley.crate', kind: 'object', label: 'A CRATE',
      card: { kind: 'index', tag: 'HS-0219', title: 'A CRATE, NAILED', material: 'pine · 1965', body: 'Station effects. For Kettle. Do not open.' },
    },
    {
      id: 'galley.turnedtin', kind: 'object', label: 'THE TURNED TIN', egg: 'EE-08',
      card: { kind: 'index', tag: 'HS-0222', title: 'THE TURNED TIN', material: 'tin', body: 'Label in. Contents: buttons, 31. One is a pawn’s.' },
    },
    {
      // The range has no card in the bible; this one is filled in its register from Standing Order 7.
      id: 'galley.range', kind: 'action', label: 'THE RANGE', action: 'range',
      card: { kind: 'index', tag: 'HS-0201', title: 'THE RANGE', material: 'iron, enamel · 1931', body: 'Lit at 05:00 and out at 21:00. Standing Order 7.' },
    },
    { id: 'galley.door.boardroom', kind: 'door', label: 'THE BOARD ROOM', to: 'boardroom', via: 'dolly-left' },
    { id: 'galley.stair', kind: 'door', label: 'THE BOATHOUSE', to: 'boathouse', via: 'lift-down' },
  ],
}

/**
 * The forty-one tin labels, painted in letterspaced capitals; the bible counts them and names none,
 * so these are 1965 stores in the station's register. The last, BUTTONS, is the one turned label-in
 * on the right dresser (the flaw): its label is never seen.
 */
export const TIN_LABELS: readonly string[] = [
  'FLOUR', 'TEA', 'SUET', 'RAISINS', 'BEEF', 'PILCHARDS', 'SUGAR', 'SALT',
  'OATS', 'RICE', 'LENTILS', 'SPLIT PEAS', 'BARLEY', 'COCOA', 'LARD', 'DRIPPING',
  'TREACLE', 'SYRUP', 'JAM', 'MARMALADE', 'BISCUITS', 'CURRANTS', 'SULTANAS', 'PRUNES',
  'DRIED APPLE', 'CONDENSED MILK', 'DRIED MILK', 'DRIED EGG', 'HERRINGS', 'SARDINES', 'CORNED BEEF', 'TONGUE',
  'BAKING POWDER', 'BICARBONATE', 'MUSTARD', 'PEPPER', 'CLOVES', 'CANDLES', 'MATCHES', 'TWINE',
  'BUTTONS',
]

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The 41 tin labels; index 40 is the turned tin. */
  tins: TIN_LABELS,
  /** Which dresser holds the turned tin and its index in TIN_LABELS. */
  turnedTin: { dresser: 'right' as const, index: 40 },
  /** The ration card as it hangs by the range. */
  rationCard: ['VISITOR', 'ONE EGG.  FOUR BISCUITS.  TEA WITHOUT LIMIT.'],
  /** The range warms the room's light for this long when lit. */
  rangeWarmMs: 30_000,
  /** The crate's stencil. */
  crateStencil: ['STATION EFFECTS', 'FOR KETTLE', 'DO NOT OPEN'],
}
