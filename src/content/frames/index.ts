// The frame registry: every tableau of THE HALYARD SURVEY as data (docs/BIBLE.md §6, §7, §14.6), the world
// layout in metres, and the adjacency derived from the door hotspots. Pure data; nothing here imports three.
import type { FrameDef } from '../../types'
import { boardroom } from './boardroom'
import { chartroom } from './chartroom'
import { galley } from './galley'
import { landing } from './landing'
import { recorders } from './recorders'
import { quarters } from './quarters'
import { lamproom } from './lamproom'
import { workshop } from './workshop'
import { boathouse } from './boathouse'
import { section } from './section'
import { jetty } from './jetty'
import { path } from './path'
import { point } from './point'
import { grid } from './grid'
import { eider } from './eider'
import { cinder } from './cinder'
import { heron } from './heron'

/** Every frame, in the bible's order: F1–F9, S, O1–O7. */
export const frames: FrameDef[] = [
  boardroom, chartroom, galley, landing, recorders, quarters, lamproom, workshop, boathouse,
  section, jetty, path, point, grid, eider, cinder, heron,
]

/**
 * World origin of each frame in metres (the floor centre of a room; the landward end of the jetty; the path's
 * midpoint; the Point's rock; the islet stage's cairn; the beacon's foot). House rooms are 7.0 wide × 4.2 tall
 * × 6.0 deep, centred at x ∈ {−7, 0, 7} on floors y ∈ {−4.2, 0, 4.2, 8.4}, the lamp room at 12.6. Outside is
 * a separate 1:10 miniature far from the house; the grid's chart table stands at (400, 0, 0).
 */
export const layout: Record<string, [number, number, number]> = {
  boardroom: [0, 0, 0],
  chartroom: [-7, 0, 0],
  galley: [7, 0, 0],
  landing: [0, 4.2, 0],
  recorders: [-7, 4.2, 0],
  quarters: [7, 4.2, 0],
  lamproom: [0, 12.6, 0],
  workshop: [-7, -4.2, 0],
  boathouse: [7, -4.2, 0],
  section: [0, 0, 0],
  jetty: [80, 0, 0],
  path: [80, 0, -40],
  point: [80, 0, -80],
  grid: [300, 0, 0],
  eider: [300, 0, -60],
  cinder: [300, 0, -120],
  heron: [300, 0, -180],
}

/** Where the season begins. */
export const START_FRAME = 'boardroom'
/** The frame that holds the board. */
export const BOARD_FRAME = 'boardroom'

/** Film gauge in mm on every camera (§14). */
export const FILM_GAUGE = 35

/** Frame ids by their bible codes (F1–F9, S, O1–O7), for anything that still speaks in codes. */
export const FRAME_CODES: Record<string, string> = {
  F1: 'boardroom', F2: 'chartroom', F3: 'galley', F4: 'landing', F5: 'recorders', F6: 'quarters',
  F7: 'lamproom', F8: 'workshop', F9: 'boathouse', S: 'section',
  O1: 'jetty', O2: 'path', O3: 'point', O4: 'grid', O5: 'eider', O6: 'cinder', O7: 'heron',
}

const byId = new Map<string, FrameDef>(frames.map((f) => [f.id, f]))

/** Looks a frame up by id (or by its bible code such as `F4`); undefined when unknown. */
export function frameById(id: string): FrameDef | undefined {
  return byId.get(id) ?? byId.get(FRAME_CODES[id] ?? '')
}

/**
 * Vertical field of view in degrees for a focal length at 35 mm gauge, as Three.js computes it: the film
 * height is the gauge divided by the frame's aspect, so 22 mm at 1.85:1 gives the bible's 46.5°.
 */
export function fovOf(lensMm: number, aspect = 1.85): number {
  return (2 * Math.atan((FILM_GAUGE / aspect / 2) / lensMm) * 180) / Math.PI
}

/** Which frames each frame's doors lead to, in hotspot order, without duplicates. Warrant moves on the grid are not doors. */
export const adjacency: Record<string, string[]> = Object.fromEntries(
  frames.map((f) => [
    f.id,
    Array.from(new Set(f.hotspots.filter((h) => h.kind === 'door' && h.to).map((h) => h.to as string))),
  ]),
)

export { boardroom, chartroom, galley, landing, recorders, quarters, lamproom, workshop, boathouse, section, jetty, path, point, grid, eider, cinder, heron }
