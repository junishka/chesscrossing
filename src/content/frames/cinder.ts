// Frame O6: Cinder Holm (c6). Transcribed from docs/BIBLE.md §7, §12 (EE-25) and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 2.40:1 frame. */
const FOV_40 = 20.66

/** Cinder Holm: a basalt islet with a low ledge across the frame; thirteen cormorants in a row in one held pose. */
export const cinder: FrameDef = {
  id: 'cinder',
  title: 'Cinder Holm',
  region: 'beyond',
  card: { title: 'Cinder Holm' },
  camera: { position: [0, 1.5, 6], target: [0, 0.6, 0], fov: FOV_40 },
  lens: 40,
  aspect: 2.40,
  music: 'grid',
  flaw: 'The seventh faces the sea; the others face the house.',
  hotspots: [
    {
      id: 'cinder.ledge', kind: 'action', label: 'THE LEDGE', action: 'watchbirds',
      card: { kind: 'index', tag: 'HS-1101', title: 'LEDGE', body: 'Thirteen at 15:00. Twelve at 15:10. Nobody has seen the one leave.' },
    },
    {
      id: 'cinder.float', kind: 'action', label: 'A GLASS FLOAT', action: 'float',
      card: { kind: 'index', tag: 'HS-1105', title: 'A GLASS FLOAT, GREEN', body: 'Kettle net. 1958.' },
    },
    { id: 'cinder.plate', kind: 'action', label: 'THE PLATE', action: 'plate', egg: 'EE-25', ledgerLine: 'Cairn c6 (Cinder Holm) read.' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** Thirteen cormorants at exact intervals, wings half-spread; the seventh (index 6) faces the sea (the flaw). */
  cormorants: { count: 13, facingSea: 6 },
  /** The watch: the camera holds; the birds turn their heads once, at 12 fps, over 40 s. */
  watch: { seconds: 40, fps: 12 },
  /** The plate on c6, cracked exactly as the square on the board (EE-25). */
  plate: 'c6 · CINDER HOLM · SURVEYED 1931 · A.H.',
  cracked: true,
  /** The float goes only to the Keeper's shelf (EE-19); nothing in the house is corrected by it. */
  float: { goesTo: 'workshop.turnings' },
}
