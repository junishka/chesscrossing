/**
 * The world: the inventory of rooms, objects, doors, the set, the household,
 * and the scene renderer for a room. Implements src/contracts/world.ts.
 * Imports shared visuals from '../frame' only.
 */
import './scene.css'

import type { World, WorldModule } from '../contracts/world'
import { buildWorld } from './data'
import { renderRoom } from './scene'

export function loadWorld(): World {
  return buildWorld()
}

export { renderRoom }
export { SOUND_STORAGE_KEY, CAPTION_BLOCK_RECT, PAGE_HEAD_RECT, STAGE_W_RPX, STAGE_H_RPX, rectRpx } from './scene'
export {
  ROOM_1,
  ROOM_1_ID,
  ROOM_1_OBJECTS,
  HALM_ID,
  HOURS_CARD_ID,
  TRAY_ID,
  PATH_ID,
  ROOMS,
  PIECES,
  HOUSEHOLD,
  HOURS,
  DEFAULT_HOUR,
  OPPONENT,
  NARRATOR,
  CONTROLS,
  YEAR,
  ledgerDate,
  chapterCard,
  roomLabel,
  cardNumber,
  pieceNames,
  TITLE_CARDS,
  CARD_1,
  CARD_2,
  CARD_3,
  THIRD_HAND_LINE,
  THIRD_HAND_LINE_MS,
  PAGE_PROPERTY_LINE,
  COLUMN_HEADS,
  ROSTER_LEFT,
  ROSTER_ITEM,
  ROSTER_COUNT,
  DASH,
} from './data'
export { drawSymbol, drawFloor, pathSymbol, SYMBOL_IDS, isSymbolId } from './art/symbols'

/** The module as the contract names it. */
export const world: WorldModule = { loadWorld, renderRoom }
