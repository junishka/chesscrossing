// Frame 7: The Lamp Room (top). Transcribed from docs/BIBLE.md §6, §12 (EE-17, EE-26) and §14.2/§14.6.
import type { CardDef, FrameDef } from '../../types'

/** 40 mm and 135 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61
const FOV_135 = 8.02

/** The telescope's card, shared by its three pinned bearings. */
const TELESCOPE_CARD: CardDef = { kind: 'index', tag: 'HS-0603', title: 'TELESCOPE', material: 'brass · 1931', body: 'Three bearings, pinned. The Point. The Holms. The Head.' }

/** The telescope at the left rail: three fixed 135 mm bearings toward the 1:10 outside, where the builder places painted views. */
const RAIL: [number, number, number] = [-3.3, 1.6, 0]

/** The Lamp Room: octagonal glazing, the lamp centred, sea on all sides, the telescope at the left rail. Frame origin (0, 12.6, 0); camera inside the octagon. */
export const lamproom: FrameDef = {
  id: 'lamproom',
  title: 'The Lamp Room',
  region: 'house',
  card: { title: 'The Lamp Room' },
  camera: { position: [0, 1.6, 3.0], target: [0, 1.6, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'ferrier',
  flaw: 'One pane, upper right, replaced by a painted board chalked 1959.',
  stations: {
    telescope1: { position: RAIL, target: [3.859, 0.380, -6.875], fov: FOV_135 },
    telescope2: { position: RAIL, target: [6.689, 1.132, 0], fov: FOV_135 },
    telescope3: { position: RAIL, target: [5.293, 1.198, -5.099], fov: FOV_135 },
  },
  hotspots: [
    { id: 'lamproom.ferrier', kind: 'resident', label: 'THE KEEPER', resident: 'ferrier', requires: { watches: [3] } },
    {
      id: 'lamproom.lamp', kind: 'action', label: 'THE LAMP', action: 'lamp', egg: 'EE-26', requires: { watches: [3] },
      card: { kind: 'index', tag: 'HS-0601', title: 'THE LAMP', material: 'brass, glass · 1931', body: 'Lit at dusk. Two white, one red. The red is for the Sixty-Four.' },
    },
    { id: 'lamproom.telescope1', kind: 'action', label: 'THE POINT', action: 'telescope1', card: TELESCOPE_CARD },
    { id: 'lamproom.telescope2', kind: 'action', label: 'THE HOLMS', action: 'telescope2', card: TELESCOPE_CARD },
    { id: 'lamproom.telescope3', kind: 'action', label: 'THE HEAD', action: 'telescope3', card: TELESCOPE_CARD },
    {
      id: 'lamproom.pane', kind: 'object', label: 'THE BOARDED PANE', egg: 'EE-17',
      card: { kind: 'index', tag: 'HS-0607', title: 'THE BOARDED PANE', material: 'pine, paint · 1959', body: 'A gull.' },
    },
    { id: 'lamproom.stair', kind: 'door', label: 'THE LANDING', to: 'landing', via: 'lift-down' },
    { id: 'lamproom.door.jetty', kind: 'door', label: 'THE JETTY', to: 'jetty', via: 'whip-left', requires: { chapter: 3 } },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The octagon: 7 m across; the lamp centred with two white lenses and one red. */
  octagon: { across: 7.0 },
  lamp: { lenses: ['white', 'white', 'red'] as const },
  /** The painted sea cylinder: 4096 × 512, one turn per 240 s. */
  sea: { width: 4096, height: 512, turnSeconds: 240 },
  /** The boarded pane, upper right, chalked (the flaw). */
  pane: { chalk: '1959', where: 'upper right' as const },
  /** The three pinned bearings on the telescope, in order. */
  bearings: ['THE POINT', 'THE HOLMS', 'THE HEAD'],
  /** Heron Head's beacon as seen through the telescope: 4.8 m at about 110 m, three-fifths of the frame's height. */
  beaconThroughTelescope: { height: 4.8, distance: 110, frameFraction: 0.6 },
  /** The lamp may be lit in the fourth watch (index 3, 16:00 to 20:00), which is dusk. */
  duskWatch: 3,
}
