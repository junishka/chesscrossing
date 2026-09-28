// Palette tokens. PLACEHOLDER VALUES — replaced from docs/BIBLE.md by the content stage.
// Structure is fixed by docs/ARCHITECTURE.md; consumers read only these keys.
import type { RegionId } from '../types'

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

export const palette: Record<RegionId, RegionPalette> = {
  boardroom: {
    ground: '#7a4a2e', wall: '#b9584f', wallAlt: '#c98a6a', trim: '#f0dcc0', accent: '#2f5d50', accent2: '#e0b04a',
    ink: '#2a1d16', paper: '#efe3c8', brass: '#c9a45c', felt: '#2f5d50', wood: '#b07a4a', woodGrain: '#6b3f22', light: '#ffe9c8', sky: '#e5cfa9',
  },
  house: {
    ground: '#8a5a3c', wall: '#d9b48a', wallAlt: '#c7996f', trim: '#f2e6cf', accent: '#a4423a', accent2: '#4a6b8a',
    ink: '#2a1d16', paper: '#efe3c8', brass: '#c9a45c', felt: '#6b2f2f', wood: '#a06a3c', woodGrain: '#5c3617', light: '#ffe4c0', sky: '#e5cfa9',
  },
  outside: {
    ground: '#8c8a4e', wall: '#c9a55a', wallAlt: '#7c6b3d', trim: '#efe2c4', accent: '#c25a2b', accent2: '#3f5a3a',
    ink: '#2a2418', paper: '#efe3c8', brass: '#c9a45c', felt: '#3f5a3a', wood: '#8f6a3e', woodGrain: '#4f3617', light: '#ffe2b0', sky: '#cfc39a',
  },
  beyond: {
    ground: '#d8b58f', wall: '#e2c2a0', wallAlt: '#b98d68', trim: '#f4e8d3', accent: '#3fa2a6', accent2: '#d9694a',
    ink: '#3a2a20', paper: '#f2e8d4', brass: '#c9a45c', felt: '#3fa2a6', wood: '#b48a5a', woodGrain: '#7a5a34', light: '#fff0d8', sky: '#bfe0e0',
  },
}

export const ui = {
  ink: '#2a1d16',
  paper: '#efe3c8',
  paperDark: '#d9c9a6',
  accent: '#a4423a',
  brass: '#c9a45c',
  bg: '#1a1411',
  hairline: 'rgba(42,29,22,0.35)',
}

/** The society colours painted on each side's pieces. */
export const sides = {
  w: { body: '#efe4cc', band: '#a4423a', felt: '#2f5d50' },
  b: { body: '#2b2320', band: '#e0b04a', felt: '#6b2f2f' },
}
