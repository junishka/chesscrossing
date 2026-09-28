// Frame O2: The Path to the Point. Transcribed from docs/BIBLE.md §7, §12 (EE-22, EE-23) and §14.2/§14.6.
import type { FrameDef, HotspotDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The three signposts along the path, as painted. */
export const SIGNPOSTS: readonly { id: string; text: string; x: number }[] = [
  { id: 'point', text: 'THE POINT 340 YDS.', x: -12.0 },
  { id: 'station', text: 'THE STATION 120 YDS.', x: -2.0 },
  { id: 'sixtyfour', text: 'THE SIXTY-FOUR · LOW WATER ONLY', x: 10.0 },
]

/**
 * The nine survey stones, every 3.4 m along the path (x along the path, centred on the frame origin).
 * Eight are cut 1931 in the founder's hand; S-6 is cut 1957 in a different hand (the flaw, EE-23).
 */
export const STONES: readonly { id: string; year: number; x: number }[] = Array.from({ length: 9 }, (_, i) => ({
  id: `S-${i + 1}`,
  year: i === 5 ? 1957 : 1931,
  x: Number(((i - 4) * 3.4).toFixed(1)),
}))

const stoneHotspots: HotspotDef[] = STONES.map((s) => ({
  id: `path.stone.${s.id.toLowerCase().replace('-', '')}`,
  kind: 'action',
  label: s.id,
  action: 'stone',
  card: { kind: 'placard', title: s.id, body: `SURVEY STONE ${s.id}.  ${s.year}.` },
  ...(s.id === 'S-6' ? { egg: 'EE-23' } : {}),
}))

const signpostHotspots: HotspotDef[] = SIGNPOSTS.map((p) => ({
  id: `path.post.${p.id}`,
  kind: 'action',
  label: p.text,
  action: 'signpost',
  card: { kind: 'placard', title: 'SIGNPOST', body: p.text },
}))

/**
 * The Path (1:10 miniature, origin at the path's midpoint; the path runs along x): the one continuous
 * tracking shot, the camera 4 m off the path at 1.4 m, square to it, dollying right at 1.2 m/s for 24 s.
 */
export const path: FrameDef = {
  id: 'path',
  title: 'The Path to the Point',
  region: 'outside',
  card: { title: 'The Path to the Point' },
  camera: { position: [-14.4, 1.4, 4], target: [-14.4, 1.4, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'path',
  flaw: 'Stone S-6 is newer than the others, cut 1957, the figures in a different hand.',
  hotspots: [
    ...signpostHotspots,
    ...stoneHotspots,
    {
      id: 'path.tent', kind: 'insert', label: 'TENT', egg: 'EE-22',
      card: { kind: 'index', tag: 'HS-0914', title: 'TENT, KHAKI', body: 'Voss. Not struck.' },
      insert: { kind: 'tent', holdMs: 1200, title: 'TENT, KHAKI' },
    },
    { id: 'path.ahead', kind: 'action', label: 'AHEAD', action: 'resume' },
    { id: 'path.door.point', kind: 'door', label: 'THE POINT', to: 'point', via: 'dolly-right' },
    { id: 'path.door.jetty', kind: 'door', label: 'THE JETTY', to: 'jetty', via: 'dolly-left' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The path: 31 m of crushed shell at 1:10; the dolly covers 28.8 m of it at 1.2 m/s in 24 s. */
  path: { length: 31, dollyMetres: 28.8, speed: 1.2, seconds: 24 },
  /** Camera offset from the path and height. */
  camera: { offset: 4, height: 1.4 },
  /** Signposts with their painted texts and x positions along the path. */
  signposts: SIGNPOSTS,
  /** Survey stones S-1 to S-9 every 3.4 m; S-6 = 1957. */
  stones: STONES,
  stoneSpacing: 3.4,
  /** The pine windbreak behind: flat and conical. */
  windbreak: { form: 'conical', flat: true },
  /** The tent insert: a folded blanket, a tin, a chess book open at the Ruy Lopez; never entered (EE-22). */
  tent: { contents: ['a folded blanket', 'a tin', 'a chess book open at the Ruy Lopez'], opening: 'Ruy Lopez' },
  /** Shell underfoot at the dolly's cadence: one step every 625 ms (§10). */
  stepMs: 625,
}
