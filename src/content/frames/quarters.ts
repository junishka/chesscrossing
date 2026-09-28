// Frame 6: The Station Master's Quarters (first floor, right). Transcribed from docs/BIBLE.md §6, §12 (EE-15, EE-16) and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The Quarters: locked until Chapter Four; a made bed, two chairs facing it, the notebooks, the stopped clock. Chapter Four starts here, so no first-visit card. */
export const quarters: FrameDef = {
  id: 'quarters',
  title: "The Station Master's Quarters",
  region: 'house',
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'emptychair',
  lockedUntilChapter: 4,
  lockedCard: { kind: 'index', tag: 'HS-0500', title: 'QUARTERS', body: 'Made up. Standing Order 12.' },
  flaw: 'The right chair has his reading glasses, folded; the left has the travelling set; they do not balance.',
  hotspots: [
    {
      id: 'quarters.set', kind: 'action', label: 'TRAVELLING SET', action: 'set', egg: 'EE-15',
      card: { kind: 'index', tag: 'HS-0501', title: 'TRAVELLING SET', material: 'leather, boxwood · 1946', body: 'Hardy v. Voss. White to move. Has been White to move since June.' },
    },
    {
      id: 'quarters.notebook', kind: 'action', label: 'NOTEBOOKS', action: 'notebook',
      card: { kind: 'index', tag: 'HS-0503', title: 'NOTEBOOKS, 34', material: 'cloth · 1931–1965', body: 'One per season. The last is half full.' },
    },
    {
      id: 'quarters.sextant', kind: 'object', label: 'SEXTANT',
      card: { kind: 'index', tag: 'HS-0505', title: 'SEXTANT', material: 'brass · 1929', body: 'Cleaned 10 June 1965.' },
    },
    {
      id: 'quarters.glasses', kind: 'object', label: 'READING GLASSES',
      card: { kind: 'index', tag: 'HS-0507', title: 'READING GLASSES', material: 'steel, glass', body: 'Folded.' },
    },
    {
      id: 'quarters.clock', kind: 'object', label: 'MANTEL CLOCK', egg: 'EE-16',
      card: { kind: 'index', tag: 'HS-0508', title: 'MANTEL CLOCK', material: 'enamel', body: 'Stopped at 05:20. Not broken.' },
    },
    { id: 'quarters.door.landing', kind: 'door', label: 'THE LANDING', to: 'landing', via: 'dolly-left' },
  ],
}

/** What the builder and the station layer need beyond the hotspots. */
export const dressing = {
  /** Typed when the player tries to move a piece of the travelling set (EE-15). */
  setRefusal: 'White to move. Not you.',
  /** The set's position: Hardy v. Voss, White to move at 41 (§7, Frame O5). */
  setFen: '2R5/4rp2/6p1/7p/1k6/6PP/5PK1/8 w - - 0 41',
  /** Thirty-four identical notebooks on the shelf, one per season 1931–1965; the last half full. */
  notebooks: { count: 34, first: 1931, last: 1965 },
  /** The last notebook's final page: the h-file islets marked NOT SURVEYED, the ink changing colour at h5. */
  lastPage: {
    squares: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
    mark: 'NOT SURVEYED',
    inkChangesAt: 'h5',
  },
  /** The mantel clock's hands. */
  clockStoppedAt: '05:20',
  /** Curtains drawn; the palette darker. */
  curtains: 'drawn' as const,
  /** The bed: hospital corners, corduroy blanket. */
  bed: { blanket: 'corduroy' },
}
