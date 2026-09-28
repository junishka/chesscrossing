// Palette tokens, transcribed from docs/BIBLE.md §3 and §14.4. Pure data; consumers read only these keys.
// Every hex here passes the Law VII lint: no #FFFFFF, no #000000, no HSV saturation above 0.62.
import type { RegionId } from '../types'

/** The colour roles every region supplies. Builders read only these keys. */
export interface RegionPalette {
  /** Floor. */ ground: string
  /** Main wall. */ wall: string
  /** Secondary wall / wallpaper figure. */ wallAlt: string
  /** Skirting, cornice, door frames. */ trim: string
  /** The region's one strong colour. */ accent: string
  /** The region's second colour, used sparingly. */ accent2: string
  /** Text and outlines. */ ink: string
  /** Cards, placards, tags. */ paper: string
  brass: string
  felt: string
  wood: string
  woodGrain: string
  /** Key light colour (temperature). */ light: string
  /** Sky / fog / background beyond the frame. */ sky: string
}

/** Every named token of §14.4, by its bible name. */
export const tokens = {
  'br.ground': '#6E4A2E',
  'br.wall': '#86A5AE',
  'br.lampRed': '#9C4E40',
  'br.sandMustard': '#B99A4E',
  'br.ink': '#23211E',
  'br.brass': '#B08D4A',
  'br.lightSquare': '#D9CBA8',
  'br.darkSquare': '#4A4E52',
  'br.lightBody': '#E3D6B4',
  'br.darkBody': '#2E2622',
  'br.hover': '#C9A55A',
  'hs.ground': '#8A6A3E',
  'hs.wall': '#C4A15C',
  'hs.olive': '#6F7A4A',
  'hs.raspberry': '#B6534B',
  'hs.textile': '#4E6B6E',
  'hs.ink': '#2B2620',
  'hs.brass': '#A9884B',
  'hs.paper': '#E9E0C4',
  'paper.white': '#E8DFC6',
  'out.turf': '#7C7A3F',
  'out.rock': '#6B665C',
  'out.sea': '#4F6E78',
  'out.foam': '#B7B9A8',
  'out.sky': '#C8C3A6',
  'out.oilskin': '#AD8A45',
  'out.pine': '#3E5A3A',
  'out.path': '#C2AB7E',
  'out.ink': '#2A2A26',
  'grid.lightIslet': '#D8C9A2',
  'grid.darkIslet': '#3B3F45',
  'grid.channel': '#2A5A61',
  'grid.beacon': '#A5503F',
  'grid.cairnBrass': '#B5934F',
  'grid.sky': '#9FB2AE',
  'grid.skyDusk': '#5A6B70',
  'grid.ink': '#1E2226',
  'ui.matte': '#141412',
  'ui.surround': '#1A1917',
} as const

/** A token name from §14.4. */
export type TokenName = keyof typeof tokens

/**
 * Colours the bible names by material but gives no hex for, derived from its own values:
 * the tongue-and-groove alternate board (the wall lightened 4 percent), darker grain lines,
 * lamp temperatures, driftwood and the outside timber. All under S 0.62.
 */
const derived = {
  /** `br.wall` at +4 percent value: the alternate board of the tongue-and-groove. */
  boardroomWallAlt: '#8BACB5',
  /** Teak, darker, for the seams and grain. */
  teakGrain: '#583B25',
  /** A warm cabin lamp. */
  boardroomLamp: '#E8D2A8',
  /** Painted pine, darker, for the grain. */
  pineGrain: '#6E5432',
  /** Flat September light from one side. */
  houseLight: '#E6D6B0',
  /** Weathered jetty and bollard timber, darker, for the grain. */
  jettyGrain: '#5E4A2C',
  /** Warm overcast. */
  outsideLight: '#E4D8B4',
  /** Driftwood: the hut and the tagged cords' posts. */
  driftwood: '#8F8570',
  /** Greenish overcast, the light on the grid. */
  gridLight: '#C9CDBE',
} as const

/** Region palettes: boardroom = §3.1, house = §3.2, outside = §3.3, beyond = §3.4. */
export const palette: Record<RegionId, RegionPalette> = {
  boardroom: {
    ground: tokens['br.ground'],
    wall: tokens['br.wall'],
    wallAlt: derived.boardroomWallAlt,
    trim: tokens['hs.paper'],
    accent: tokens['br.lampRed'],
    accent2: tokens['br.sandMustard'],
    ink: tokens['br.ink'],
    paper: tokens['hs.paper'],
    brass: tokens['br.brass'],
    felt: tokens['br.darkSquare'],
    wood: tokens['br.ground'],
    woodGrain: derived.teakGrain,
    light: derived.boardroomLamp,
    sky: tokens['out.sea'],
  },
  house: {
    ground: tokens['hs.ground'],
    wall: tokens['hs.wall'],
    wallAlt: tokens['hs.olive'],
    trim: tokens['hs.paper'],
    accent: tokens['hs.raspberry'],
    accent2: tokens['hs.textile'],
    ink: tokens['hs.ink'],
    paper: tokens['hs.paper'],
    brass: tokens['hs.brass'],
    felt: tokens['hs.textile'],
    wood: tokens['hs.ground'],
    woodGrain: derived.pineGrain,
    light: derived.houseLight,
    sky: tokens['out.sky'],
  },
  outside: {
    ground: tokens['out.turf'],
    wall: tokens['out.rock'],
    wallAlt: tokens['out.pine'],
    trim: tokens['out.path'],
    accent: tokens['out.oilskin'],
    accent2: tokens['out.sea'],
    ink: tokens['out.ink'],
    paper: tokens['hs.paper'],
    brass: tokens['hs.brass'],
    felt: tokens['out.pine'],
    wood: tokens['hs.ground'],
    woodGrain: derived.jettyGrain,
    light: derived.outsideLight,
    sky: tokens['out.sky'],
  },
  beyond: {
    ground: tokens['grid.lightIslet'],
    wall: tokens['grid.darkIslet'],
    wallAlt: tokens['grid.channel'],
    trim: tokens['out.foam'],
    accent: tokens['grid.beacon'],
    accent2: tokens['br.sandMustard'],
    ink: tokens['grid.ink'],
    paper: tokens['hs.paper'],
    brass: tokens['grid.cairnBrass'],
    felt: tokens['grid.darkIslet'],
    wood: derived.driftwood,
    woodGrain: tokens['out.rock'],
    light: derived.gridLight,
    sky: tokens['grid.sky'],
  },
}

/** A region's post grade (§3.5): grain amplitude, lift in the blacks, warm gain, vignette. */
export interface Grade {
  grain: number
  lift: number
  gain: [number, number, number]
  vignette: number
}

/** Grades per region, applied after ACES: `c = c * gain + lift`, then grain, then the vignette. */
export const grades: Record<RegionId, Grade> = {
  boardroom: { grain: 0.035, lift: 0.02, gain: [1.03, 1.0, 0.96], vignette: 0 },
  house: { grain: 0.04, lift: 0.03, gain: [1.04, 1.01, 0.95], vignette: 0 },
  outside: { grain: 0.05, lift: 0.04, gain: [1.05, 1.01, 0.94], vignette: 0.15 },
  beyond: { grain: 0.045, lift: 0.02, gain: [1.0, 1.02, 1.0], vignette: 0 },
}

/** The two sides' pieces: body lacquer and felt collar (the light side lamp red, the dark side sand mustard). */
export const sides = {
  w: { body: tokens['br.lightBody'], felt: tokens['br.lampRed'], band: tokens['br.lampRed'] },
  b: { body: tokens['br.darkBody'], felt: tokens['br.sandMustard'], band: tokens['br.sandMustard'] },
}

/** The board's lacquers and the one hover colour (the rim word under the cursor; nothing else). */
export const squares = {
  light: tokens['br.lightSquare'],
  dark: tokens['br.darkSquare'],
  hover: tokens['br.hover'],
}

/** Overlay tokens: ink, papers, the letterbox matte and viewport surround, brass, the one accent, a hairline. */
export const ui = {
  ink: tokens['br.ink'],
  paper: tokens['hs.paper'],
  paperWhite: tokens['paper.white'],
  /** A darker paper for rules and card backs: the light-square lacquer. */
  paperDark: tokens['br.lightSquare'],
  matte: tokens['ui.matte'],
  surround: tokens['ui.surround'],
  /** Alias of `surround` for the page background. */
  bg: tokens['ui.surround'],
  brass: tokens['br.brass'],
  accent: tokens['br.lampRed'],
  hairline: 'rgba(35,33,30,0.35)',
}

/** HSV saturation of a `#RRGGBB` string, 0..1. */
export function saturationOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** Every hex the palette module exports, with the name it is exported under. */
export function allHexes(): { name: string; hex: string }[] {
  const out: { name: string; hex: string }[] = []
  for (const [k, v] of Object.entries(tokens)) out.push({ name: `tokens.${k}`, hex: v })
  for (const [k, v] of Object.entries(derived)) out.push({ name: `derived.${k}`, hex: v })
  for (const [region, p] of Object.entries(palette)) for (const [k, v] of Object.entries(p)) out.push({ name: `palette.${region}.${k}`, hex: v })
  for (const [side, s] of Object.entries(sides)) for (const [k, v] of Object.entries(s)) out.push({ name: `sides.${side}.${k}`, hex: v })
  for (const [k, v] of Object.entries(squares)) out.push({ name: `squares.${k}`, hex: v })
  for (const [k, v] of Object.entries(ui)) if (v.startsWith('#')) out.push({ name: `ui.${k}`, hex: v })
  return out
}

/** Law VII's lint: throws if any exported hex is pure white, pure black, malformed, or saturated above 0.62. Run by test/content.test.ts; never at import. */
export function assertPalette(): void {
  const bad: string[] = []
  for (const { name, hex } of allHexes()) {
    const h = hex.toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(h)) bad.push(`${name} ${hex} is not #RRGGBB`)
    else if (h === '#FFFFFF' || h === '#000000') bad.push(`${name} ${hex} is pure`)
    else if (saturationOf(h) > 0.62 + 1e-9) bad.push(`${name} ${hex} S ${saturationOf(h).toFixed(3)}`)
  }
  if (bad.length) throw new Error(`Law VII: ${bad.join('; ')}`)
}

