/**
 * The chapters, docs/bible.md section 8. Room 1 is built; every other chapter
 * is a locked room stub: chapter, title, one line, and its proposed palette.
 */
import type { Room } from '../../contracts/world'
import { LATER_PALETTES, ROOM_1_PALETTE } from './palettes'
import { ROOM_1 } from './room1'

interface Stub {
  id: string
  chapter: string
  /** The chapter card's room line, as the table heads it: ROOM 2, GROUNDS 1, BEYOND. */
  label: string
  title: string
  oneLine: string
}

const STUBS: readonly Stub[] = [
  { id: 'room-2', chapter: 'II', label: 'Room 2', title: 'The Kitchen', oneLine: 'Cups, 4. Saucers, 3.' },
  {
    id: 'room-3',
    chapter: 'III',
    label: 'Room 3',
    title: "The Keeper's Office",
    oneLine: "The post's paperwork, kept complete for sixteen years after there was anything to keep it for.",
  },
  { id: 'room-4', chapter: 'IV', label: 'Room 4', title: 'The Stair and Landing', oneLine: 'Eleven treads, a barometer, four hooks.' },
  {
    id: 'room-5',
    chapter: 'V',
    label: 'Room 5',
    title: 'The Parlour',
    oneLine: "The family's evening room; the wireless receives the Helder station, the only one that reaches.",
  },
  {
    id: 'room-6',
    chapter: 'VI',
    label: 'Room 6',
    title: "The Children's Room",
    oneLine: 'Two beds, a chalk line down the middle painted over, and the archive of the Marle Chess Club.',
  },
  { id: 'room-7', chapter: 'VII', label: 'Room 7', title: 'The Sickroom', oneLine: "The Keeper's bedroom from 1976, scheduled as found." },
  {
    id: 'room-8',
    chapter: 'VIII',
    label: 'Room 8',
    title: 'The Lookout',
    oneLine: "The tower room, Mr Halm's since 1978; the window faces the field where his post stood.",
  },
  {
    id: 'room-9',
    chapter: 'IX',
    label: 'Room 9 (Schedule B)',
    title: 'The Bonded Store',
    oneLine: 'The cellar where seized goods were held pending duty; Schedule B, which lists them, was not located.',
  },
  {
    id: 'grounds-1',
    chapter: 'X',
    label: 'Grounds 1',
    title: 'The Bridge',
    oneLine: 'Eleven arches, one hundred and forty metres, closed to traffic 1978, crossing grass since 1983.',
  },
  {
    id: 'grounds-2',
    chapter: 'XI',
    label: 'Grounds 2',
    title: 'The Field',
    oneLine: 'The site of Marle-East: cleared ground, one sign, one boundary stone.',
  },
  {
    id: 'beyond',
    chapter: 'XII',
    label: 'Beyond',
    title: 'The River, Where It Is Now',
    oneLine: 'Four hundred metres east: a new channel, a new frontier, a prefabricated post with one officer who does not play.',
  },
]

const LABELS: Record<string, string> = { [ROOM_1.id]: 'Room 1' }
for (const s of STUBS) LABELS[s.id] = s.label

/** The chapter card's room line for a room: ROOM 1, GROUNDS 1, BEYOND. */
export function roomLabel(room: Room): string {
  return (LABELS[room.id] ?? room.id).toUpperCase()
}

function stub(s: Stub): Room {
  return {
    id: s.id,
    chapter: s.chapter,
    title: s.title,
    oneLine: s.oneLine,
    palette: LATER_PALETTES[s.id] ?? ROOM_1_PALETTE,
    objects: [],
    unlocked: false,
  }
}

export const ROOMS: Room[] = [ROOM_1, ...STUBS.map(stub)]

/**
 * The chapter card, docs/visual.md section 4: numeral, room line, title in
 * capitals, a block gap, the one line.
 */
export function chapterCard(room: Room): string[] {
  return [`${room.chapter}.`, roomLabel(room), room.title.toUpperCase(), '', room.oneLine]
}
