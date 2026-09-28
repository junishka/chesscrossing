/**
 * Room 1, the Declarations Room. docs/bible.md section 9 (captions and the
 * north wall), section 8 (door captions), docs/visual.md section 5 (the
 * coordinate table). Every string a player reads is the bible's, verbatim.
 *
 * The bible abbreviates captions to description, ownership, disposition, dash,
 * annotation; the six columns are split from that line without changing a
 * word, and where the bible names no material or condition the column is
 * empty. `caption` keeps the bible's one-line form untouched.
 */
import type { CaptionEntry, Room, StageRect, WorldObject } from '../../contracts/world'
import { ROOM_1_PALETTE } from './palettes'

export const ROOM_1_ID = 'room-1'

/** A rect from the coordinate table: x from-to, y from-to, in per cent of the stage. */
function span(x0: number, x1: number, y0: number, y1: number): StageRect {
  return { x: x0, y: y0, w: round(x1 - x0), h: round(y1 - y0) }
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

interface Spec {
  id: string
  name: string
  caption: string
  entry: CaptionEntry
  rect: StageRect
  kind: WorldObject['kind']
  layer: WorldObject['layer']
  symbol: string
  leadsTo?: string
}

function object(spec: Spec): WorldObject {
  const o: WorldObject = {
    id: spec.id,
    name: spec.name,
    caption: spec.caption,
    entry: spec.entry,
    rect: spec.rect,
    kind: spec.kind,
    layer: spec.layer,
    symbol: spec.symbol,
  }
  if (spec.kind === 'door') {
    // Every door in Room 1 holds: the room beyond is typed and not yet annotated.
    o.locked = true
    o.lockedCaption = spec.caption
    if (spec.leadsTo) o.leadsTo = spec.leadsTo
  }
  return o
}

/* ---------- The wall, left to right ---------- */

const DOOR_13 = object({
  id: '1-13',
  name: 'Door to Room 3',
  caption:
    '1-13. Door to Room 3, oak. Locked. Ministry key 7/3, held at the Keys Registry, Sallenau. R. — Requested 1977 and 1979. Not located. Room 3 is typed. It is not yet annotated.',
  entry: {
    item: '1-13',
    description: 'Door to Room 3',
    material: 'oak',
    condition: 'Locked. Ministry key 7/3, held at the Keys Registry, Sallenau.',
    ownership: 'R',
    disposition: '',
    annotation: 'Requested 1977 and 1979. Not located.',
    lockedSentence: 'Room 3 is typed. It is not yet annotated.',
  },
  rect: span(0, 4.9, 14, 76),
  kind: 'door',
  layer: 'wall',
  symbol: 'door-escutcheon',
  leadsTo: 'room-3',
})

const WINDOW_11 = object({
  id: '1-11',
  name: 'Window, north-west',
  caption:
    '1-11. Window, north-west, six panes, one cracked. R. To remain. — The crack is from 1978. The bridge is visible. The grass under it is visible.',
  entry: {
    item: '1-11',
    description: 'Window, north-west, six panes',
    material: '',
    condition: 'one cracked',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'The crack is from 1978. The bridge is visible. The grass under it is visible.',
  },
  rect: span(4.9, 8.4, 20, 48),
  kind: 'object',
  layer: 'wall',
  symbol: 'window',
})

const GREATCOAT_03 = object({
  id: '1-03',
  name: 'Greatcoat, west hook',
  caption:
    '1-03. Greatcoat, Frontier Service pattern 1938, wool, grey-green, brass buttons, 11 of 12. R. To be returned. — Not returned.',
  entry: {
    item: '1-03',
    description: 'Greatcoat, Frontier Service pattern 1938, brass buttons',
    material: 'wool, grey-green',
    condition: '11 of 12',
    ownership: 'R',
    disposition: 'To be returned.',
    annotation: 'Not returned.',
  },
  rect: span(8.4, 9.8, 18, 76),
  kind: 'object',
  layer: 'wall',
  symbol: 'greatcoat',
})

const DOOR_12 = object({
  id: '1-12',
  name: 'Door, west, to bridge deck',
  caption:
    '1-12. Door, west, to bridge deck, oak. Nailed shut 1978 by the Bridge Authority on closure of the deck, 14 nails. Notice affixed outside. R. — The deck is reached from the garden. The Authority has not been asked about the nails. Grounds 1 is typed. It is not yet annotated.',
  entry: {
    item: '1-12',
    description: 'Door, west, to bridge deck',
    material: 'oak',
    condition: 'Nailed shut 1978 by the Bridge Authority on closure of the deck, 14 nails. Notice affixed outside.',
    ownership: 'R',
    disposition: '',
    annotation: 'The deck is reached from the garden. The Authority has not been asked about the nails.',
    lockedSentence: 'Grounds 1 is typed. It is not yet annotated.',
  },
  rect: span(9.8, 11.2, 14, 76),
  kind: 'door',
  layer: 'wall',
  symbol: 'door-nailed',
  leadsTo: 'grounds-1',
})

const CLOCKS_CAPTION =
  '1-04. Clocks, wall, 2, Sallenau Clockworks 1911. Left: Vardenne time. Right: Helder time, twelve minutes behind, as kept on the far bank until 1961. R. To remain. — Both wound by Mr Halm. He rises by the right one.'
const CLOCKS_ENTRY: CaptionEntry = {
  item: '1-04',
  description:
    'Clocks, wall, 2, Sallenau Clockworks 1911. Left: Vardenne time. Right: Helder time, twelve minutes behind, as kept on the far bank until 1961.',
  material: '',
  condition: '',
  ownership: 'R',
  disposition: 'To remain.',
  annotation: 'Both wound by Mr Halm. He rises by the right one.',
}

/** The two clocks share item 1-04; ids must not collide, so the side is appended. */
const CLOCK_LEFT = object({
  id: '1-04-left',
  name: 'Clock, left, Vardenne time',
  caption: CLOCKS_CAPTION,
  entry: CLOCKS_ENTRY,
  rect: span(15.4, 23.8, 12, 27),
  kind: 'object',
  layer: 'wall',
  symbol: 'clock-left',
})

const TARIFF_05 = object({
  id: '1-05',
  name: 'Tariff Board',
  caption:
    '1-05. Tariff Board, painted pine, 1.1 by 0.8 m. Duties on spirits, tobacco, timber, salt, printed matter, live animals. Amended 1961, all classes: NIL. R. To remain. — The NIL is in the Keeper\'s hand. He used seal wax because the red paint had been returned to stores.',
  entry: {
    item: '1-05',
    description: 'Tariff Board, 1.1 by 0.8 m. Duties on spirits, tobacco, timber, salt, printed matter, live animals.',
    material: 'painted pine',
    condition: 'Amended 1961, all classes: NIL.',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'The NIL is in the Keeper\'s hand. He used seal wax because the red paint had been returned to stores.',
  },
  rect: span(23.8, 46.2, 8, 36),
  kind: 'object',
  layer: 'wall',
  symbol: 'tariff-board',
})

/** The six classes of duty on the Tariff Board, in the bible's order, each struck NIL. */
export const TARIFF_CLASSES: readonly string[] = ['spirits', 'tobacco', 'timber', 'salt', 'printed matter', 'live animals']
export const TARIFF_NIL = 'NIL'

const CLOCK_RIGHT = object({
  id: '1-04-right',
  name: 'Clock, right, Helder time',
  caption: CLOCKS_CAPTION,
  entry: CLOCKS_ENTRY,
  rect: span(46.2, 54.6, 12, 27),
  kind: 'object',
  layer: 'wall',
  symbol: 'clock-right',
})

const CABINET_08 = object({
  id: '1-08',
  name: 'Filing cabinet',
  caption:
    '1-08. Filing cabinet, steel, 4 drawers. R.; contents H. Drawers 1 to 3: game ledgers, 1949 to 1977, 28 volumes. Drawer 4: Correspondence. Exempt under Reg. 12(c). — Not opened.',
  entry: {
    item: '1-08',
    description:
      'Filing cabinet, 4 drawers; contents H. Drawers 1 to 3: game ledgers, 1949 to 1977, 28 volumes. Drawer 4: Correspondence. Exempt under Reg. 12(c).',
    material: 'steel',
    condition: '',
    ownership: 'R',
    disposition: '',
    annotation: 'Not opened.',
  },
  rect: span(47.5, 53.5, 32, 56),
  kind: 'furniture',
  layer: 'wall',
  symbol: 'cabinet',
})

/** The four drawer labels, typed. The fourth as the bible gives it. */
export const CABINET_LABELS: readonly string[] = ['1', '2', '3', 'Correspondence. Exempt.']

const HOOK_03A = object({
  id: '1-03a',
  name: 'Hook, east',
  caption: '1-03a. Hook, east, brass. R. To remain. — Empty. I hang my coat on the landing.',
  entry: {
    item: '1-03a',
    description: 'Hook, east',
    material: 'brass',
    condition: '',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'Empty. I hang my coat on the landing.',
  },
  rect: span(58.8, 60.2, 18, 20),
  kind: 'object',
  layer: 'wall',
  symbol: 'hook',
})

const DOOR_14 = object({
  id: '1-14',
  name: 'Door to stair',
  caption:
    '1-14. Door to stair, oak. Locked at nine by Mr Halm, who holds the key. R. — It is after nine. Rooms 4 to 8 are typed. They are not yet annotated.',
  entry: {
    item: '1-14',
    description: 'Door to stair',
    material: 'oak',
    condition: 'Locked at nine by Mr Halm, who holds the key.',
    ownership: 'R',
    disposition: '',
    annotation: 'It is after nine.',
    lockedSentence: 'Rooms 4 to 8 are typed. They are not yet annotated.',
  },
  rect: span(60.2, 65.1, 14, 76),
  kind: 'door',
  layer: 'wall',
  symbol: 'door-escutcheon',
  leadsTo: 'room-4',
})

const DOOR_15 = object({
  id: '1-15',
  name: 'Door to Room 2',
  caption:
    '1-15. Door to Room 2, east, oak. Closed. R. — Mr Halm prefers this shut while the game is on. Room 2 is typed. It is not yet annotated.',
  entry: {
    item: '1-15',
    description: 'Door to Room 2, east',
    material: 'oak',
    condition: 'Closed.',
    ownership: 'R',
    disposition: '',
    annotation: 'Mr Halm prefers this shut while the game is on.',
    lockedSentence: 'Room 2 is typed. It is not yet annotated.',
  },
  rect: span(65.1, 70, 14, 76),
  kind: 'door',
  layer: 'wall',
  symbol: 'door-plain',
  leadsTo: 'room-2',
})

const STOVE_09 = object({
  id: '1-09',
  name: 'Stove',
  caption: '1-09. Stove, Marle Foundry 1888, cast iron. R. To remain. — Lit. Mr Halm lays it at five.',
  entry: {
    item: '1-09',
    description: 'Stove, Marle Foundry 1888',
    material: 'cast iron',
    condition: '',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'Lit. Mr Halm lays it at five.',
  },
  rect: span(66, 69.5, 56, 76),
  kind: 'furniture',
  layer: 'front',
  symbol: 'stove',
})

/* ---------- Furniture ---------- */

const DESK_01 = object({
  id: '1-01',
  name: 'Desk, declarations',
  caption:
    '1-01. Desk, declarations, oak, 2.4 m, brass rail, brass line let into top. R. To remain. — The line was for goods. The board sits across it. It has since 1949.',
  entry: {
    item: '1-01',
    description: 'Desk, declarations, 2.4 m, brass rail, brass line let into top',
    material: 'oak',
    condition: '',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'The line was for goods. The board sits across it. It has since 1949.',
  },
  rect: span(21, 49, 58, 76),
  kind: 'furniture',
  layer: 'front',
  symbol: 'desk',
})

/**
 * Mr Halm has no item number; he is a person present. His caption is the
 * header's Present line for him, verbatim, and the third hand adds nothing:
 * the annotation is the dash alone, which is how the form records silence.
 */
export const HALM_ID = 'halm'
const HALM = object({
  id: HALM_ID,
  name: 'Mr Halm',
  caption: 'W. Halm, Customs Officer Second Class, Helder Confederation Frontier Guard, by invitation of the Household.',
  entry: {
    item: '',
    description: 'W. Halm, Customs Officer Second Class, Helder Confederation Frontier Guard, by invitation of the Household.',
    material: '',
    condition: '',
    ownership: '',
    disposition: '',
    annotation: '',
  },
  rect: span(31, 39, 38, 58),
  kind: 'object',
  layer: 'front',
  symbol: 'halm',
})

export const HOURS_CARD_ID = '1-17'
/**
 * The coordinate table gives the card 40.5 to 42.5 by 55.5 to 58. Four lines
 * of 0.5rem type need 36 rpx; the card is drawn 40.5 to 43 by 54 to 58,
 * bottom on the desk rail, so the four hours can be read and named.
 */
const HOURS_17 = object({
  id: HOURS_CARD_ID,
  name: 'Hours card',
  caption:
    '1-17. Card, index, pinned above the east chair, in Mr Halm\'s hand: "18.00. 20.00. 22.00. After." H. — The visitor names the hour. At six he plays quickly and from memory. After ten he plays as he plays. The ledgers bear this out.',
  entry: {
    item: '1-17',
    description: 'Card, index, pinned above the east chair, in Mr Halm\'s hand: "18.00. 20.00. 22.00. After."',
    material: '',
    condition: '',
    ownership: 'H',
    disposition: '',
    annotation: 'The visitor names the hour. At six he plays quickly and from memory. After ten he plays as he plays. The ledgers bear this out.',
  },
  rect: span(40.5, 43, 54, 58),
  kind: 'text',
  layer: 'front',
  symbol: 'hours-card',
})

export const TRAY_ID = '1-06'
const TRAY_06 = object({
  id: TRAY_ID,
  name: 'Tray',
  caption:
    '1-06. Tray, tin, stencilled HELD PENDING DUTY, 30 by 20 cm. R. To remain. — In use nightly. Nothing has been released from it since 1961, and nothing has been paid.',
  entry: {
    item: '1-06',
    description: 'Tray, stencilled HELD PENDING DUTY, 30 by 20 cm',
    material: 'tin',
    condition: '',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'In use nightly. Nothing has been released from it since 1961, and nothing has been paid.',
  },
  rect: span(22.5, 26, 56, 58),
  kind: 'object',
  layer: 'front',
  symbol: 'tray',
})

const SET_10 = object({
  id: '1-10',
  name: 'Chess set',
  caption:
    '1-10. Chess set, boxwood and Macassar ebony, 31 pieces and 1 replacement, with board, 45 cm. D. Pending. — See cards, 6-09. I do not touch them.',
  entry: {
    item: '1-10',
    description: 'Chess set, 31 pieces and 1 replacement, with board, 45 cm',
    material: 'boxwood and Macassar ebony',
    condition: '',
    ownership: 'D',
    disposition: 'Pending.',
    annotation: 'See cards, 6-09. I do not touch them.',
  },
  rect: span(32.4, 37.6, 57, 58),
  kind: 'object',
  layer: 'front',
  symbol: 'board',
})

const TYPEWRITER_07 = object({
  id: '1-07',
  name: 'Typewriter',
  caption:
    '1-07. Typewriter, Sallenau Standard No. 5, 1949. H. To remain. — Ribbon changed 1976. Strikes the lower-case e faintly. The ledgers can be dated by the e.',
  entry: {
    item: '1-07',
    description: 'Typewriter, Sallenau Standard No. 5, 1949',
    material: '',
    condition: '',
    ownership: 'H',
    disposition: 'To remain.',
    annotation: 'Ribbon changed 1976. Strikes the lower-case e faintly. The ledgers can be dated by the e.',
  },
  rect: span(39.5, 44, 51, 58),
  kind: 'object',
  layer: 'front',
  symbol: 'typewriter',
})

const STAMP_18 = object({
  id: '1-18',
  name: 'Date-stamp',
  caption:
    '1-18. Date-stamp, rubber, DETAINED, with pad, Frontier Service issue. R. To remain. — In use nightly. It is the one thing in this room that makes a noise on purpose.',
  entry: {
    item: '1-18',
    description: 'Date-stamp, DETAINED, with pad, Frontier Service issue',
    material: 'rubber',
    condition: '',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'In use nightly. It is the one thing in this room that makes a noise on purpose.',
  },
  rect: span(45, 47.5, 55.5, 58),
  kind: 'object',
  layer: 'front',
  symbol: 'stamp',
})

const CHAIR_02 = object({
  id: '1-02',
  name: 'Chair, bentwood',
  caption:
    '1-02. Chair, bentwood, Republic pattern, one of two. Seat worn to the left. R. To remain. — He sat with his weight to the left. I have this from Mr Halm, who has said it once.',
  entry: {
    item: '1-02',
    description: 'Chair, Republic pattern, one of two',
    material: 'bentwood',
    condition: 'Seat worn to the left.',
    ownership: 'R',
    disposition: 'To remain.',
    annotation: 'He sat with his weight to the left. I have this from Mr Halm, who has said it once.',
  },
  rect: span(32, 38, 62, 76),
  kind: 'furniture',
  layer: 'front',
  symbol: 'chair',
})

/* ---------- Floor ---------- */

const TRAP_16 = object({
  id: '1-16',
  name: 'Trap to cellar',
  caption:
    '1-16. Trap to cellar, Room 9, oak, iron ring. Padlocked. Contents: see Schedule B. R. — Schedule B was not located. I have looked in the places a Schedule B would be.',
  entry: {
    item: '1-16',
    description: 'Trap to cellar, Room 9, iron ring',
    material: 'oak',
    condition: 'Padlocked. Contents: see Schedule B.',
    ownership: 'R',
    disposition: '',
    annotation: 'Schedule B was not located. I have looked in the places a Schedule B would be.',
  },
  rect: span(52, 58, 78, 84),
  kind: 'door',
  layer: 'floor',
  symbol: 'trap',
  leadsTo: 'room-9',
})

/**
 * S-4 runs from door 1-14 (62.5, 76) to the near chair (35, 84), a band four
 * per cent of the stage wide. The rect is its bounding box; the scene clips it
 * to the band with `PATH_POLYGON`.
 */
export const PATH_ID = 'S-4'
export const PATH_POLYGON: readonly [number, number][] = [
  [60.5, 76],
  [64.5, 76],
  [37, 84],
  [33, 84],
]
const PATH_S4 = object({
  id: PATH_ID,
  name: 'Path, worn',
  caption: 'S-4. Path, worn, floorboards, from door 1-14 to the near chair. — Not an item. Entered because it is there.',
  entry: {
    item: 'S-4',
    description: 'Path, from door 1-14 to the near chair',
    material: 'floorboards',
    condition: 'worn',
    ownership: '',
    disposition: '',
    annotation: 'Not an item. Entered because it is there.',
  },
  rect: span(33, 64.5, 76, 84),
  kind: 'object',
  layer: 'floor',
  symbol: 'path',
})

/** Every object of Room 1, wall to front, in the order the scene draws them. */
export const ROOM_1_OBJECTS: WorldObject[] = [
  DOOR_13,
  WINDOW_11,
  GREATCOAT_03,
  DOOR_12,
  CLOCK_LEFT,
  TARIFF_05,
  CLOCK_RIGHT,
  CABINET_08,
  HOOK_03A,
  DOOR_14,
  DOOR_15,
  PATH_S4,
  TRAP_16,
  STOVE_09,
  HALM,
  DESK_01,
  HOURS_17,
  TRAY_06,
  SET_10,
  TYPEWRITER_07,
  STAMP_18,
  CHAIR_02,
]

/** The wall ends at y 76; the floor is below. */
export const WALL_BOTTOM_Y = 76
export const SCENE_WIDTH_X = 70
/** Floor boards 3 per cent of the stage tall, joints 1 rpx. */
export const BOARD_HEIGHT_Y = 3

export const ROOM_1: Room = {
  id: ROOM_1_ID,
  chapter: 'I',
  title: 'The Declarations Room',
  oneLine:
    'Goods were declared here until 1961; chess has been played here since 1949. The board sits on the desk across the declarations line.',
  palette: ROOM_1_PALETTE,
  objects: ROOM_1_OBJECTS,
  unlocked: true,
  slots: {
    board: span(18.125, 51.875, 14, 74),
    tray: span(18.125, 30, 44, 60),
    ledger: span(71.5, 98.5, 31, 65),
    narrator: span(71.5, 98.5, 66, 98.5),
  },
}
