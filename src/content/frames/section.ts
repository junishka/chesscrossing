// Frame S: the Section, the God's-eye of the house. Transcribed from docs/BIBLE.md §6 and §14.2/§14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/**
 * The house in section: three storeys whole, the lamp room's base and the rock rooms cut by the frame,
 * every resident in place, facing the camera, still. Reached from the Landing by a 17 m pull-back
 * (1400 ms). Chapter Two starts here, so it has no first-visit card.
 */
export const section: FrameDef = {
  id: 'section',
  title: 'Section',
  region: 'house',
  camera: { position: [0, 6.3, 26], target: [0, 6.3, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'none',
  // The bible declares no flaw for the Section; this one is filled from Law XII.
  flaw: "The Station Master's chair is empty; every other figure is in place.",
  hotspots: [
    { id: 'section.door.landing', kind: 'door', label: 'THE LANDING', to: 'landing', via: 'push-in' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The Section frames 22.7 × 12.3 m from 26 m. */
  frames: { width: 22.7, height: 12.3 },
  /** The pull-back from the Landing station: 17 m in 1400 ms. */
  pullBack: { metres: 17, ms: 1400 },
  /** The plan of the cut (§6). */
  plan: [
    ['', 'lamproom', ''],
    ['recorders', 'landing', 'quarters'],
    ['chartroom', 'boardroom', 'galley'],
    ['workshop', 'stair', 'boathouse'],
  ],
  /** Residents shown in place, facing the camera, still: no one looks at anyone else. */
  tableau: ['brace', 'ida', 'ferrier', 'lisle', 'tuck'],
}
