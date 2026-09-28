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

export interface WorldObject {
  id: string
  /** Display name, as it appears in a caption's first line. */
  name: string
  /** The caption text, written out in full, as the bible has it. */
  caption: string
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
  opponent: {
    name: string
    /** One label per strength, from the bible. */
    strengthLabels: Record<Strength, string>
    defaultStrength: Strength
  }
  narrator: {
    name: string
    silenceMark: string
    placeholder: string
  }
}

export interface RoomScene {
  readonly el: HTMLElement
  /** The element for a slot, sized and positioned from room.slots. Throws if the room has no such slot. */
  slotEl(name: SlotName): HTMLElement
  destroy(): void
}

/**
 * Functions the world module must export from src/world/index.ts.
 * The scene emits 'object:inspect', 'door:tried', and 'room:enter' on the bus.
 */
export interface WorldModule {
  loadWorld(): World
  renderRoom(container: HTMLElement, room: Room, bus: EventBus): RoomScene
}
