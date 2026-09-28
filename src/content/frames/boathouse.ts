// Frame 9: The Boathouse (below, right). Transcribed from docs/BIBLE.md §6, §12 (EE-20) and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The Boathouse: the slipway into the water, the launch's cradle empty and centred, Tender No. 1 on trestles, oars racked. */
export const boathouse: FrameDef = {
  id: 'boathouse',
  title: 'The Boathouse',
  region: 'house',
  card: { title: 'The Boathouse' },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'tuck',
  flaw: 'The empty cradle. It is enough.',
  hotspots: [
    // Rowan Tuck at high water only, coiling rope, silent here: `lowWater: false` reads as "not at low water".
    { id: 'boathouse.tuck', kind: 'resident', label: 'MR TUCK', resident: 'tuck', requires: { lowWater: false } },
    {
      id: 'boathouse.cradle', kind: 'object', label: 'CRADLE',
      card: { kind: 'index', tag: 'HS-0801', title: 'CRADLE, LAUNCH KITTIWAKE', material: 'oak · 1931', body: 'Departed 11 June 1965. Friday.' },
    },
    {
      id: 'boathouse.dinghy', kind: 'action', label: 'TENDER No. 1', action: 'dinghy', requires: { warrant: 'rook' },
      card: { kind: 'index', tag: 'HS-0803', title: 'TENDER No. 1', material: 'clinker, painted · 1952', body: 'Twelve foot. Two oars. Does not turn in a channel.' },
    },
    {
      id: 'boathouse.tideline', kind: 'object', label: 'TIDE LINE',
      card: { kind: 'index', tag: 'HS-0807', title: 'TIDE LINE', material: 'paint', body: 'High water springs. Painted by I. Hardy, aged nine.' },
    },
    {
      id: 'boathouse.lifebuoy', kind: 'object', label: 'LIFEBUOY',
      card: { kind: 'index', tag: 'HS-0809', title: 'LIFEBUOY', material: 'cork, canvas', body: 'H.I.H.S. Repainted 1961.' },
    },
    {
      id: 'boathouse.winch', kind: 'action', label: 'SLIPWAY WINCH', action: 'winch', egg: 'EE-20',
      ledgerLine: 'winch turned. nothing on the cable.',
      card: { kind: 'index', tag: 'HS-0811', title: 'SLIPWAY WINCH', material: 'iron', body: 'Turns. Nothing on the cable.' },
    },
    { id: 'boathouse.stair', kind: 'door', label: 'THE GALLEY', to: 'galley', via: 'lift-up' },
    { id: 'boathouse.passage', kind: 'door', label: 'THE WORKSHOP', to: 'workshop', via: 'dolly-left' },
    { id: 'boathouse.slipway', kind: 'door', label: 'THE JETTY', to: 'jetty', via: 'whip-right', requires: { chapter: 3, lowWater: true } },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** Engraved brass placard on the cradle (§4). */
  placard: 'LAUNCH KITTIWAKE.  CRADLE.  DEPARTED 11 JUNE 1965.',
  /** The dinghy's painted name, on trestles to the right. */
  dinghyName: 'TENDER No. 1',
  /** The lifebuoy's lettering. */
  lifebuoy: 'H.I.H.S.',
  /** The painted high-water line on the wall; the water in the slipway sits at the tide's level below it. */
  tideLine: { label: 'HIGH WATER SPRINGS' },
  /** Oars racked symmetrically; the tender carries two. */
  oars: 2,
  /** The cradle is empty; nothing is placed in it (the flaw). */
  cradleEmpty: true,
}
