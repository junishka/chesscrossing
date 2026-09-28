/**
 * The narrator's context: what the app shell knows, assembled from the latest
 * events on the bus and handed to the panel at send time. Nothing here is read
 * by the player; the names go to the model as state.
 */
import type { Color, GameResult, GameSnapshot, PieceKey } from '../contracts/chess'
import { START_FEN } from '../contracts/chess'
import type { EventBus, MoveClassification } from '../contracts/events'
import type { NarratorContext } from '../contracts/narrator'
import type { Room, World, WorldObject } from '../contracts/world'
import { roomLabel } from '../world'

/** At most this many half-moves are handed over in SAN. */
export const LAST_MOVES = 10

export interface ContextProviderDeps {
  bus: EventBus
  world: World
  /** The room the player is in. */
  room: Room
  /** The colour the visitor takes when no game is on. Default white. */
  initialColor?: Color
}

export interface ContextProvider {
  getContext(): NarratorContext
  destroy(): void
}

/** 'ROOM 1' as 'Room 1'. */
function titleCase(label: string): string {
  return label
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** The room's name for the model, e.g. 'Room 1, the Declarations Room'. */
export function roomName(room: Room): string {
  const title = room.title.startsWith('The ') ? `the ${room.title.slice(4)}` : room.title
  return `${titleCase(roomLabel(room))}, ${title}`
}

/** An object's name for the model, with its item number so the entry can be found. */
export function objectDisplayName(o: WorldObject): string {
  return o.entry.item ? `${o.name} (${o.entry.item})` : o.name
}

export function createContextProvider(deps: ContextProviderDeps): ContextProvider {
  const { bus, world } = deps
  let room = deps.room
  let snapshot: GameSnapshot | null = null
  let status: NarratorContext['gameStatus'] = 'idle'
  let result: GameResult | undefined
  let evalCp: number | undefined
  let evalMate: number | undefined
  let classification: MoveClassification | undefined
  let hourIndex = world.opponent.defaultHour
  let nextColor: Color = deps.initialColor ?? 'w'
  let inspecting: { source: 'object' | 'piece'; name: string } | null = null
  let door: string | undefined

  const objectById = (id: string): WorldObject | undefined => room.objects.find((o) => o.id === id)

  const offs: (() => void)[] = [
    bus.on('room:enter', (e) => {
      const found = world.rooms.find((r) => r.id === e.roomId)
      if (found) room = found
      door = undefined
      inspecting = null
    }),
    bus.on('game:new', (e) => {
      snapshot = e.snapshot
      status = 'playing'
      result = undefined
      evalCp = undefined
      evalMate = undefined
      classification = undefined
    }),
    bus.on('game:move', (e) => {
      snapshot = e.snapshot
      if (status === 'idle') status = 'playing'
    }),
    bus.on('game:over', (e) => {
      snapshot = e.snapshot
      status = 'over'
      result = e.result
    }),
    bus.on('game:eval', (e) => {
      evalCp = e.cp
      evalMate = e.mate
      if (e.by) classification = e.classification
    }),
    bus.on('player:hour', (e) => {
      if (world.opponent.hours[e.index]) hourIndex = e.index
    }),
    bus.on('player:color', (e) => {
      nextColor = e.color
    }),
    bus.on('object:inspect', (e) => {
      if (e.objectId) {
        const o = objectById(e.objectId)
        inspecting = { source: 'object', name: o ? objectDisplayName(o) : e.objectId }
        if (door !== undefined && (!o || objectDisplayName(o) !== door)) door = undefined
      } else {
        if (inspecting?.source === 'object') inspecting = null
        door = undefined
      }
    }),
    bus.on('piece:inspect', (e) => {
      if (e.key) inspecting = { source: 'piece', name: world.pieces[e.key as PieceKey].name }
      else if (inspecting?.source === 'piece') inspecting = null
    }),
    bus.on('door:tried', (e) => {
      const o = objectById(e.doorId)
      door = o ? objectDisplayName(o) : e.doorId
    }),
  ]

  function getContext(): NarratorContext {
    const history = snapshot?.history ?? []
    const context: NarratorContext = {
      fen: snapshot?.fen ?? START_FEN,
      pgn: snapshot?.pgn ?? '',
      lastMovesSan: history.slice(-LAST_MOVES).map((m) => m.san),
      turn: snapshot?.turn ?? 'w',
      playerColor: snapshot?.playerColor ?? nextColor,
      gameStatus: status,
      ply: history.length,
      roomId: room.id,
      roomName: roomName(room),
      hour: world.opponent.hours[hourIndex]?.label ?? world.opponent.hours[world.opponent.defaultHour]?.label ?? '',
    }
    if (result) context.result = result
    if (evalCp !== undefined) context.evalCp = evalCp
    if (evalMate !== undefined) context.evalMate = evalMate
    if (classification) context.lastMoveClassification = classification
    if (inspecting) context.inspecting = inspecting.name
    if (door !== undefined) context.door = door
    return context
  }

  return {
    getContext,
    destroy() {
      for (const off of offs) off()
    },
  }
}
