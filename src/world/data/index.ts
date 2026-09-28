/**
 * The World object of src/contracts/world.ts, assembled from the data files.
 * Nothing here is invented; every string traces to docs/bible.md.
 */
import type { World } from '../../contracts/world'
import { HOUSEHOLD } from './household'
import { YEAR, ledgerDate } from './ledger-date'
import { CONTROLS, NARRATOR, OPPONENT } from './persons'
import { PIECES } from './pieces'
import { ROOMS, chapterCard } from './rooms'
import { TITLE_CARDS } from './title-cards'

export const WORLD_TITLE = 'Chess Crossing'

export function buildWorld(): World {
  return {
    title: WORLD_TITLE,
    titleCards: TITLE_CARDS.map((card) => [...card]),
    chapterCard,
    rooms: ROOMS,
    pieces: PIECES,
    household: HOUSEHOLD,
    year: YEAR,
    ledgerDate: (date: Date) => ledgerDate(date, YEAR),
    opponent: OPPONENT,
    narrator: NARRATOR,
    controls: CONTROLS,
  }
}

export { ROOM_1, ROOM_1_ID, ROOM_1_OBJECTS, HALM_ID, HOURS_CARD_ID, TRAY_ID, PATH_ID, PATH_POLYGON, TARIFF_CLASSES, TARIFF_NIL, CABINET_LABELS, WALL_BOTTOM_Y, SCENE_WIDTH_X, BOARD_HEIGHT_Y } from './room1'
export { ROOMS, chapterCard, roomLabel } from './rooms'
export { PIECES, cardNumber, pieceNames } from './pieces'
export { HOUSEHOLD } from './household'
export { HOURS, DEFAULT_HOUR, OPPONENT, NARRATOR, CONTROLS } from './persons'
export { YEAR, ledgerDate, romanMonth } from './ledger-date'
export { TITLE_CARDS, CARD_1, CARD_2, CARD_3 } from './title-cards'
export { ROOM_1_PALETTE, LATER_PALETTES } from './palettes'
export * from './page'
