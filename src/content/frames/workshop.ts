// Frame 8: The Workshop (below, left). Transcribed from docs/BIBLE.md §6, §12 (EE-18, EE-19) and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The Workshop: the lathe centred, tools racked in size order, painted shavings, the shelf of test-turnings. */
export const workshop: FrameDef = {
  id: 'workshop',
  title: 'The Workshop',
  region: 'house',
  card: { title: 'The Workshop' },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'ferrier',
  flaw: 'A thirty-third turning, a knight with its head on the wrong side.',
  hotspots: [
    { id: 'workshop.ferrier', kind: 'resident', label: 'THE KEEPER', resident: 'ferrier', requires: { watches: [0, 1, 2, 4, 5] } },
    {
      id: 'workshop.lathe', kind: 'insert', label: 'LATHE', egg: 'EE-18',
      card: { kind: 'index', tag: 'HS-0701', title: 'LATHE', material: 'iron, pine bed · 1930', body: 'Treadle. The pieces were turned here in 1931 and the replacements in 1948.' },
      insert: { kind: 'lathe', holdMs: 6000, title: 'LATHE' },
    },
    {
      id: 'workshop.tools', kind: 'object', label: 'TURNING TOOLS',
      card: { kind: 'index', tag: 'HS-0703', title: 'TURNING TOOLS, 14', material: 'steel, ash', body: 'In size order. Never lend the skew.' },
    },
    {
      id: 'workshop.turnings', kind: 'action', label: 'TEST-TURNINGS', action: 'turnings', egg: 'EE-19',
      card: { kind: 'index', tag: 'HS-0707', title: 'TEST-TURNINGS, 33', material: 'lime, pear', body: 'The thirty-third was a mistake he kept.' },
    },
    {
      id: 'workshop.profile', kind: 'object', label: 'THE PROFILE',
      card: { kind: 'index', tag: 'HS-0711', title: 'THE PROFILE', material: 'card template · 1931', body: 'One profile. Twelve crowns.' },
    },
    {
      id: 'workshop.dies', kind: 'object', label: 'COLLAR DIES',
      card: { kind: 'index', tag: 'HS-0713', title: 'COLLAR DIES, 64', material: 'brass · 1948', body: 'One per square.' },
    },
    { id: 'workshop.trap', kind: 'door', label: 'THE CHART ROOM', to: 'chartroom', via: 'lift-up' },
    { id: 'workshop.passage', kind: 'door', label: 'THE BOATHOUSE', to: 'boathouse', via: 'dolly-right' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** Fourteen turning tools racked above the lathe in size order. */
  toolCount: 14,
  /** Thirty-three test-turnings on the shelf; the thirty-third is a knight with its head on the wrong side (the flaw). */
  turningCount: 33,
  thirtyThird: { piece: 'n' as const, headSide: 'wrong' as const },
  /** Sixty-four brass collar dies, one per square. */
  dieCount: 64,
  /** The lathe insert: a blank becomes a pawn in 6 s, stop-motion at 12 fps (EE-18). */
  insert: { ms: 6000, fps: 12 },
  /** Bare rock and a mustard dado (palette 3.2, browner). */
  walls: { rock: 'out.rock', dado: 'br.sandMustard' },
  /** The badge sewn when the green float from c6 is brought to the thirty-third (EE-19); never listed. */
  floatBadge: 'THIRTY-THIRD' as const,
}
