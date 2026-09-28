// Frame 4: The Landing (first floor, centre). Transcribed from docs/BIBLE.md §6, §12 (EE-09..11) and §14.6.
import type { FrameDef } from '../../types'
import { orders, ORDERS_TITLE } from '../orders'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The six names on the roster board, one per brass hook, in the board's order. */
export const ROSTER_NAMES: readonly string[] = ['Hardy', 'Brace', 'Ferrier', 'Lisle', 'Tuck', 'Hardy (I.)']

/** The caption on the card of the 1959 group photograph; nothing is written on the print itself. */
export const PHOTOGRAPH_CAPTION = 'Left to right: Tuck, Lisle, Brace, M. Hardy, A. Hardy, I. Hardy (6), Ferrier, and two of the unit. August 1959.'

/** The Landing: the stair at centre, the roster with six hooks, a door either side, the 1959 photograph above. */
export const landing: FrameDef = {
  id: 'landing',
  title: 'The Landing',
  region: 'house',
  card: { title: 'The Landing' },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  flaw: 'The sixth hook is empty; its badge hangs from a nail below on a different string.',
  hotspots: [
    {
      id: 'landing.roster', kind: 'action', label: 'ROSTER', action: 'roster',
      card: { kind: 'index', tag: 'HS-0301', title: 'ROSTER BOARD', material: 'oak, brass · 1931', body: 'Hardy, Brace, Ferrier, Lisle, Tuck, Hardy (I.). Visitor: provisional.' },
    },
    {
      id: 'landing.nail', kind: 'object', label: 'BADGE', egg: 'EE-10',
      card: { kind: 'tag', title: 'BADGE', body: 'Moved. Not removed.' },
    },
    {
      id: 'landing.badges', kind: 'object', label: 'BADGES',
      card: { kind: 'index', tag: 'HS-0302', title: 'BADGES, EMBROIDERED', material: 'felt, thread', body: "One per rank. The Visitor's is sewn but not yet backed." },
    },
    {
      id: 'landing.photograph', kind: 'insert', label: 'PHOTOGRAPH', action: 'photograph', egg: 'EE-09',
      card: { kind: 'index', tag: 'HS-0304', title: 'GROUP PHOTOGRAPH, 1959', material: 'print', body: PHOTOGRAPH_CAPTION },
      insert: { kind: 'photograph', holdMs: 600, title: 'AUGUST 1959' },
    },
    {
      id: 'landing.orders', kind: 'action', label: 'THE STANDING ORDERS', action: 'orders',
      card: { kind: 'index', tag: 'HS-0306', title: 'THE STANDING ORDERS', material: 'card, framed · 1931', body: 'Twelve. Order 12 was added this June.' },
    },
    {
      id: 'landing.wireless', kind: 'action', label: 'THE WIRELESS', action: 'wireless', egg: 'EE-11', requires: { watches: [0, 3] },
      card: { kind: 'index', tag: 'HS-0308', title: 'THE WIRELESS CUPBOARD', material: 'under the stair', body: 'Bulletin 05:20 and 17:50. Do not touch the dial.' },
    },
    { id: 'landing.door.recorders', kind: 'door', label: "THE RECORDER'S ROOM", to: 'recorders', via: 'dolly-left' },
    { id: 'landing.door.quarters', kind: 'door', label: 'THE QUARTERS', to: 'quarters', via: 'dolly-right' },
    { id: 'landing.stair.up', kind: 'door', label: 'THE LAMP ROOM', to: 'lamproom', via: 'lift-up' },
    { id: 'landing.stair.down', kind: 'door', label: 'THE BOARD ROOM', to: 'boardroom', via: 'lift-down' },
    { id: 'landing.section', kind: 'door', label: 'SECTION', to: 'section', via: 'pull-out' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The roster: six brass hooks, six names; the sixth hook empty, its badge on a nail below (the flaw). */
  roster: { names: ROSTER_NAMES, hooks: 6, emptyHook: 5 },
  /** The Standing Orders, framed, Order 12 typed with the bent `e`. */
  orders,
  ordersTitle: ORDERS_TITLE,
  /** The 1959 photograph, painted sepia: nine figures as the card names them; Ida, aged six, looks off left at the operator. */
  photograph: { caption: PHOTOGRAPH_CAPTION, figures: 9, flaw: 'Ida, aged six, looking off left at the operator' },
  /** The badges by rank (Law X). THIRTY-THIRD is never listed. */
  badges: ['PROVISIONAL', 'VISITOR', "RECORDER'S ASSISTANT", 'SURVEYOR'],
  /** The wireless bulletin: Morse rhythm, no voice; the transcript's last line (EE-11). */
  wireless: { watches: [0, 3], times: ['05:20', '17:50'], lastLine: 'Halyard: four, moderate, rain later, good' },
  /** Ida crosses in profile carrying pages every 90 s while this frame is active and input has been idle 40 s or more. */
  idaCrossing: { everyMs: 90_000, idleMs: 40_000 },
}
