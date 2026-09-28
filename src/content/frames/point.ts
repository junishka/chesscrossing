// Frame O3: The Point and the Causeway. Transcribed from docs/BIBLE.md §7 and §14.2/§14.6.
import type { FrameDef } from '../../types'
import { legend } from '../survey'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The warning board at the causeway's head, as painted. */
export const WARNING_BOARD = 'THE GRID IS SURVEYED. IT IS NOT SAFE. STANDING ORDER 9.'

/**
 * The Point (1:10 miniature, origin on the Point's rock): the camera 2.0 m up looks along the causeway,
 * dead straight to Alder Ness (a1); the grid fills the frame to the horizon, centred on the a-file.
 */
export const point: FrameDef = {
  id: 'point',
  title: 'The Point and the Causeway',
  region: 'outside',
  card: { title: 'The Point and the Causeway' },
  camera: { position: [0, 2.0, 0], target: [0, 2.0, -18], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'none',
  flaw: 'The last flagstone before Alder Ness is missing; there is a plank.',
  hotspots: [
    {
      id: 'point.causeway', kind: 'object', label: 'CAUSEWAY',
      card: { kind: 'index', tag: 'HS-0920', title: 'CAUSEWAY', material: '1933', body: 'Alder Ness. 200 yards. Two hours either side of low water.' },
    },
    {
      id: 'point.plank', kind: 'object', label: 'THE PLANK',
      card: { kind: 'index', tag: 'HS-0922', title: 'THE PLANK', body: 'Since 1957.' },
    },
    {
      id: 'point.warning', kind: 'object', label: 'WARNING BOARD',
      card: { kind: 'placard', tag: 'HS-0924', title: 'WARNING BOARD', body: WARNING_BOARD },
    },
    {
      id: 'point.legend', kind: 'action', label: 'THE LEGEND', action: 'legend',
      card: { kind: 'placard', title: 'THE SIXTY-FOUR', body: 'SIXTY-FOUR NAMES. ALDER NESS TO HERON HEAD.' },
    },
    // Crossing is a door that the station layer opens only at low water; otherwise it shows the causeway card with the time.
    { id: 'point.cross', kind: 'door', label: 'THE SIXTY-FOUR', to: 'grid', via: 'cut', action: 'cross', requires: { chapter: 3, lowWater: true } },
    { id: 'point.door.path', kind: 'door', label: 'THE PATH', to: 'path', via: 'dolly-left' },
  ],
}

/** What the builder and the station layer need beyond the hotspots. */
export const dressing = {
  /** The causeway at 1:10: 18 m, dead straight to a1; the last flagstone replaced by a plank (the flaw). */
  causeway: { length: 18, plankAtEnd: true },
  /** The brass legend plate with all sixty-four names, file by file. */
  legend,
  /** The warning board's text. */
  warningBoard: WARNING_BOARD,
  /** The causeway card when the water is over it: tide-hours and tens of minutes to the next crossable state. */
  waterCard: 'Water over the causeway. {hours} h {minutes} min.',
  /** The grid is crossable within two tide-hours either side of low water; one tide-hour is 2.0 real minutes. */
  crossable: { tideHours: 2, realMinutesPerTideHour: 2.0 },
  /** The matte widens from 1.85 to 2.40 over 900 ms as the player crosses. */
  matteMs: 900,
}
