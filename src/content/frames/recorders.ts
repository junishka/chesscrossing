// Frame 5: The Recorder's Room (first floor, left). Transcribed from docs/BIBLE.md §6, §12 (EE-12..14) and §14.6.
import type { FrameDef } from '../../types'

/** 40 mm at 35 mm gauge in a 1.85:1 frame. */
const FOV_40 = 26.61

/** The eleven books on Ida's shelf, spines painted by hand, titles as found (EE-12). */
export const BOOK_TITLES: readonly string[] = [
  'The Tide Book of Kettle Harbour',
  'A Girl of the Skerries',
  'Marion and the Lighthouse Boys',
  'The Weather Ship',
  'Signals for Beginners',
  'The Seventh Form at Crail',
  'Under Nine Lamps',
  'Pony Island',
  'The Latin Prize',
  'Elizabeth of the Point',
  'Field Notes of a Junior Hydrographer',
]

/** The four gramophone records, as their labels read (HS-0405). */
export const RECORD_LABELS: readonly string[] = [
  "1 · KETTLE HARBOUR SILVER BAND · 'THE ROAD TO THE ISLES' · 1938",
  '2 · BACH · CHORALE PRELUDES · 1951',
  "3 · ADMIRALTY · 'SIGNALS BY WHISTLE AND BELL' · training",
  '4',
]

/** The Recorder's Room: bed left, desk right, the Olivetti centred, eleven books, the gramophone, the harmonium. */
export const recorders: FrameDef = {
  id: 'recorders',
  title: "The Recorder's Room",
  region: 'house',
  card: { title: "The Recorder's Room" },
  camera: { position: [0, 2.1, 9.0], target: [0, 2.1, 0], fov: FOV_40 },
  lens: 40,
  aspect: 1.85,
  music: 'house',
  resident: 'ida',
  flaw: "A green glass float hangs a hand's breadth right of the line. It is never moved.",
  hotspots: [
    { id: 'recorders.ida', kind: 'resident', label: 'IDA HARDY', resident: 'ida' },
    {
      id: 'recorders.olivetti', kind: 'insert', label: 'OLIVETTI', action: 'olivetti', egg: 'EE-13',
      card: { kind: 'index', tag: 'HS-0401', title: 'OLIVETTI LETTERA 22', material: 'enamel · 1958', body: 'The log is typed here. Every page. Twice.' },
      insert: { kind: 'typed', holdMs: 600, title: 'AUGUST', lines: ['THE VISITOR. Expected Tuesday. Arrived Wednesday.'] },
    },
    {
      id: 'recorders.books', kind: 'insert', label: 'BOOKS', egg: 'EE-12',
      card: { kind: 'index', tag: 'HS-0403', title: 'BOOKS, 11', material: 'cloth', body: 'Spines painted by hand. Titles as found.' },
      insert: { kind: 'books', holdMs: 600, title: 'BOOKS, 11', lines: [...BOOK_TITLES] },
    },
    {
      id: 'recorders.gramophone', kind: 'action', label: 'GRAMOPHONE', action: 'gramophone', egg: 'EE-14',
      card: {
        kind: 'index', tag: 'HS-0405', title: 'GRAMOPHONE', material: 'oak, brass horn · 1949',
        body: "Four records. 1 · KETTLE HARBOUR SILVER BAND · 'THE ROAD TO THE ISLES' · 1938. 2 · BACH · CHORALE PRELUDES · 1951. 3 · ADMIRALTY · 'SIGNALS BY WHISTLE AND BELL' · training. 4 · a plain label, '4'.",
      },
    },
    {
      id: 'recorders.harmonium', kind: 'object', label: 'HARMONIUM',
      card: { kind: 'index', tag: 'HS-0406', title: 'HARMONIUM', material: 'walnut, reed · 1931', body: 'His. Not played since June. One stop out.' },
    },
    {
      id: 'recorders.badge', kind: 'object', label: "THE RECORDER'S BADGE",
      card: { kind: 'index', tag: 'HS-0409', title: "THE RECORDER'S BADGE", material: 'felt', body: 'Sewn by herself. Four hundred and six stitches, counted.' },
    },
    {
      id: 'recorders.postcard', kind: 'object', label: 'POSTCARD',
      card: { kind: 'index', tag: 'HS-0410', title: 'POSTCARD, ADDRESSED', material: 'card', body: 'To A. Hardy, c/o the Society, Kettle. Nothing typed.' },
    },
    { id: 'recorders.door.landing', kind: 'door', label: 'THE LANDING', to: 'landing', via: 'dolly-right' },
  ],
}

/** What the builder needs beyond the hotspots. */
export const dressing = {
  /** The eleven spines, in shelf order. */
  books: BOOK_TITLES,
  /** The four record labels; record 4 plays the Survey Theme with wow and crackle. */
  records: RECORD_LABELS,
  /** The raspberry cardigan on the chair (palette 3.2). */
  cardigan: 'raspberry' as const,
  /** The float: green glass, hung a hand's breadth right of the centre line (the flaw). */
  float: { offsetX: 0.1 },
  /** The August page in the Olivetti, the one place the ferry is mentioned. */
  augustPage: 'THE VISITOR. Expected Tuesday. Arrived Wednesday.',
  /** The harmonium: one stop out. */
  harmonium: { stopsOut: 1 },
}
