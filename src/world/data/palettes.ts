/**
 * Palettes, docs/visual.md section 2. Six colours to a room, Iron Gall always
 * the sixth. Room 1 is canon; the later chapters are the visual document's
 * proposals mapped onto the six roles the frame exposes (wall, wood, light,
 * dark, wax, ink). These strings are data the frame turns into tokens; no
 * module reads them as colours.
 */
import type { Palette } from '../../contracts/frame'

export const IRON_GALL = '#202834'
export const SERVICE_GREEN = '#6E7D69'
export const MARLE_OAK = '#5A4530'
export const BOXWOOD = '#D8BE8C'
export const MACASSAR_EBONY = '#2B1F19'
export const SEAL_WAX = '#A0281E'
export const FORM_WHITE = '#F5F2EB'
export const MARCH_SKY = '#B9BFC0'

/** I. The Declarations Room. Canon (bible section 9). */
export const ROOM_1_PALETTE: Palette = {
  wall: SERVICE_GREEN,
  wood: MARLE_OAK,
  light: BOXWOOD,
  dark: MACASSAR_EBONY,
  wax: SEAL_WAX,
  ink: IRON_GALL,
}

/**
 * Later chapters, proposed. The mapping onto roles: wall is the large ground;
 * wood the joinery; light the pale object that carries type; dark the iron or
 * bakelite; wax the one accent that is left over.
 */
export const LATER_PALETTES: Record<string, Palette> = {
  /** II. Kitchen: Service Green, Range Iron, Cup Enamel, Kettle Copper, Dresser Oak. */
  'room-2': { wall: SERVICE_GREEN, wood: MARLE_OAK, light: '#E8E1D2', dark: MACASSAR_EBONY, wax: '#9C5A33', ink: IRON_GALL },
  /** III. Keeper's Office: Service Green, Marle Oak, Ledger Buff, Keeper's Ink, Ruling Red. */
  'room-3': { wall: SERVICE_GREEN, wood: MARLE_OAK, light: '#C9B99A', dark: '#35507A', wax: SEAL_WAX, ink: IRON_GALL },
  /** IV. Stair and Landing: Distemper Cream above a Service Green dado, Tread Oak, Hook Brass, Barometer Glass. */
  'room-4': { wall: '#DDD4BE', wood: MARLE_OAK, light: BOXWOOD, dark: '#9AA5A8', wax: SERVICE_GREEN, ink: IRON_GALL },
  /** V. Parlour: Service Green, Marle Oak, Bakelite, Sleeve Yellow, Cloth Grey-Blue. */
  'room-5': { wall: SERVICE_GREEN, wood: MARLE_OAK, light: '#D6B24C', dark: '#3D2A22', wax: '#7C8C99', ink: IRON_GALL },
  /** VI. Children's Room: Service Green, Bed Enamel, Card Buff, Pencil, Marle Oak. */
  'room-6': { wall: SERVICE_GREEN, wood: MARLE_OAK, light: '#E6E0D1', dark: '#6E6C66', wax: BOXWOOD, ink: IRON_GALL },
  /** VII. Sickroom: Service Green, Walnut, Bottle Brown, Sheet, Boxwood. */
  'room-7': { wall: SERVICE_GREEN, wood: '#4A2F26', light: '#EFEAE0', dark: '#5C3A1E', wax: BOXWOOD, ink: IRON_GALL },
  /** VIII. Lookout: Limewash, Lamp Brass, Suitcase Leather, Field Grey, Seal Wax. */
  'room-8': { wall: '#D7D2C4', wood: '#7A4A2A', light: BOXWOOD, dark: '#9AA5A8', wax: SEAL_WAX, ink: IRON_GALL },
  /** IX. Bonded Store: Cellar Stone, Crate Deal, Boxwood, Macassar Ebony, Bond Wax. */
  'room-9': { wall: '#6F6A60', wood: '#B89A6A', light: BOXWOOD, dark: MACASSAR_EBONY, wax: SEAL_WAX, ink: IRON_GALL },
  /** X. Bridge: Bridge Stone, Form White, Deck Grass, March Sky, Marle Oak. */
  'grounds-1': { wall: MARCH_SKY, wood: MARLE_OAK, light: FORM_WHITE, dark: '#8C857A', wax: '#7B8A4E', ink: IRON_GALL },
  /** XI. Field: Cleared Ground, Sign Enamel, Hedge, Stone Grey, March Sky. */
  'grounds-2': { wall: MARCH_SKY, wood: '#A08F6C', light: '#8E8B80', dark: '#5D6E45', wax: '#3F5F82', ink: IRON_GALL },
  /** XII. River, Where It Is Now: Lisk, Prefab Grey, Gauge White, Reed, March Sky. */
  beyond: { wall: MARCH_SKY, wood: '#8A8F5C', light: FORM_WHITE, dark: '#4F6B73', wax: '#C4C7C3', ink: IRON_GALL },
}
