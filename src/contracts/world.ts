/**
 * The world: the inventory of rooms, objects, doors, the set, the household,
 * and the scene renderer for a room. Implemented in src/world. All data comes
 * from docs/bible.md and is typed here.
 */
import type { PieceKey, Strength } from './chess'
import type { EventBus } from './events'
import type { Palette } from './frame'

/** A rectangle in percent of stage width and height. */
export interface StageRect {
  x: number
  y: number
  w: number
  h: number
}

export type ObjectKind = 'object' | 'furniture' | 'door' | 'text'
export type Layer = 'wall' | 'floor' | 'front'

/** One typed entry of Form F.P. 22: six columns, then the dash and the annotation. */
export interface CaptionEntry {
  /** Item number, e.g. '1-03' or 'S-4'. */
  item: string
  description: string
  material: string
  condition: string
  /** R Republic, H Household, D Disputed. Empty when the bible gives none. */
  ownership: '' | 'R' | 'H' | 'D'
  disposition: string
  /** The third hand, after the dash. Without the dash. */
  annotation: string
  /**
   * Doors only: the last sentence of a locked door's caption ("Room 3 is
   * typed. It is not yet annotated."), set at 60 per cent and dropped when the
   * room is annotated. Kept separate so the data can drop it.
   */
  lockedSentence?: string
}

export interface WorldObject {
  id: string
  /** Display name for aria labels, e.g. 'Greatcoat, west hook'. */
  name: string
  /** The whole caption as one line, as the bible has it: columns, dash, annotation. */
  caption: string
  /** The caption in its six columns. */
  entry: CaptionEntry
  /** Extra lines shown when inspected. */
  dossier?: readonly string[]
  rect: StageRect
  kind: ObjectKind
  layer: Layer
  /** Doors only. */
  locked?: boolean
  lockedCaption?: string
  leadsTo?: string
  /** An SVG symbol id in the room's sprite sheet, if the object is drawn. Otherwise the scene draws a labelled shape. */
  symbol?: string
}

export type SlotName = 'board' | 'ledger' | 'tray' | 'narrator'

export interface Room {
  id: string
  /** e.g. 'Chapter One' or 'I' as the bible has it. */
  chapter: string
  title: string
  oneLine: string
  palette: Palette
  objects: WorldObject[]
  unlocked: boolean
  /** Where the app shell mounts modules. Only the chess room has all four. */
  slots?: Partial<Record<SlotName, StageRect>>
}

export interface PieceDossier {
  key: PieceKey
  name: string
  lines: readonly [string, string]
}

export interface Household {
  name: string
  role: string
  lines: readonly string[]
}

export interface World {
  title: string
  /** The cards shown at launch, in order. Each card is a list of lines. */
  titleCards: string[][]
  /** The chapter card for a room: usually [chapter, title]. */
  chapterCard(room: Room): string[]
  rooms: Room[]
  pieces: Record<PieceKey, PieceDossier>
  household: Household[]
  /** The game's year for the ledger, e.g. 1990. */
  year: number
  /** Formats a date for the ledger and the stamp: day, month in roman numerals, two-digit year, e.g. '14 III 90'. */
  ledgerDate(date: Date): string
  opponent: {
    name: string
    /** The hours card, item 1-17, in order. Naming an hour starts a game or sets the strength. */
    hours: readonly { label: string; strength: Strength }[]
    /** Index into hours. */
    defaultHour: number
    /** His fixed words, as the ledger enters them. */
    lines: { please: string; thankYou: string; thankYouHelder: string; positionKeeps: string }
  }
  narrator: {
    name: string
    /** The mark typed when he is silent. An em dash. */
    silenceMark: string
    /** The input placeholder: 'Ask.' */
    placeholder: string
    /** The prefix before the player's words: 'Visitor (1).' */
    visitorLabel: string
  }
  /**
   * Page-head controls. Not in the bible; a design decision recorded in
   * docs/architecture.md. Written in the house's register.
   */
  controls: { resign: string; takeBlack: string; takeWhite: string; soundOn: string; soundOff: string }
}

export interface RoomScene {
  readonly el: HTMLElement
  /** The element for a slot, sized and positioned from room.slots. Throws if the room has no such slot. */
  slotEl(name: SlotName): HTMLElement
  destroy(): void
}

/**
 * Functions the world module must export from src/world/index.ts.
 * The scene owns the page (x 70 to 100): head, caption block, and the slots
 * for the ledger and the narrator. It emits 'object:inspect', 'door:tried',
 * 'room:enter', 'player:hour', 'player:color', 'player:resign', and
 * 'settings:sound'. It listens to 'piece:inspect' to raise dossier cards over
 * the caption block, to 'game:move' and clicks to dismiss them, and to
 * 'player:hour' to underline the chosen hour.
 */
export interface WorldModule {
  loadWorld(): World
  renderRoom(container: HTMLElement, room: Room, bus: EventBus): RoomScene
}
