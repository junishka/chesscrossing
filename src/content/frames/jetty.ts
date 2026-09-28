// Frame O1: The Jetty. Transcribed from docs/BIBLE.md §7, §12 (EE-21) and §14.2/§14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/**
 * The Jetty (1:10 miniature, origin at the jetty's landward end): bollards in pairs to a vanishing point,
 * sea either side, the Tide Warden on his box at the end. Chapter Three starts here, so no first-visit card.
 */
export const jetty: FrameDef = {
  id: 'jetty',
  title: 'The Jetty',
  region: 'outside',
  camera: { position: [0, 1.2, 0], target: [0, 1.2, -3.7], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'none',
  resident: 'tuck',
  flaw: 'The third bollard on the left has no cap.',
  hotspots: [
    { id: 'jetty.tuck', kind: 'resident', label: 'MR TUCK', resident: 'tuck', egg: 'EE-21' },
    {
      id: 'jetty.jetty', kind: 'object', label: 'JETTY',
      card: { kind: 'index', tag: 'HS-0901', title: 'JETTY', material: '1931', body: 'Forty yards. Numbered every five.' },
    },
    {
      id: 'jetty.tideboard', kind: 'action', label: 'TIDE BOARD', action: 'tideboard',
      card: { kind: 'index', tag: 'HS-0905', title: 'TIDE BOARD', material: 'painted', body: "Today's water, chalked at 05:20." },
    },
    {
      id: 'jetty.box', kind: 'object', label: "THE WARDEN'S BOX",
      card: { kind: 'index', tag: 'HS-0907', title: "THE WARDEN'S BOX", body: 'He stands on it to be seen from the house.' },
    },
    { id: 'jetty.mooring', kind: 'action', label: 'TENDER No. 1', action: 'dinghy', requires: { warrant: 'rook' } },
    { id: 'jetty.door.path', kind: 'door', label: 'THE PATH', to: 'path', via: 'dolly-right' },
    { id: 'jetty.door.lamproom', kind: 'door', label: 'THE LAMP ROOM', to: 'lamproom', via: 'whip-right' },
    { id: 'jetty.door.boathouse', kind: 'door', label: 'THE BOATHOUSE', to: 'boathouse', via: 'whip-right', requires: { lowWater: true } },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The jetty at 1:10: 3.7 m long (forty yards), running from the camera toward −z. */
  length: 3.7,
  /** Bollards in pairs; the third on the left has no cap (the flaw). Numbered every five yards. */
  bollards: { pairs: 8, capless: { side: 'left' as const, index: 2 }, numberedEvery: 5 },
  /** The Tide Warden in a mustard oilskin on his box at the end, facing us. */
  warden: { oilskin: 'out.oilskin', onBox: true },
  /** The tide board's chalk lines: the water and the next low water. */
  tideBoard: { heading: 'TODAY’S WATER', chalkedAt: '05:20' },
  /** Readings are given to the camera in the first and fourth watches (EE-21). */
  readingWatches: [0, 3],
  /** The house miniature, 2.1 m wide, on the island's rock behind. */
  houseMiniature: { width: 2.1 },
}
