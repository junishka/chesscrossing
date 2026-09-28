// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createBus } from '../contracts/bus'
import type { GameSnapshot, MoveRecord } from '../contracts/chess'
import { START_FEN } from '../contracts/chess'
import { loadWorld } from '../world'
import { createContextProvider, objectDisplayName, roomName } from './context'

const world = loadWorld()
const room = world.rooms[0]!

function move(over: Partial<MoveRecord> = {}): MoveRecord {
  return { moveNumber: 1, color: 'w', piece: 'p', from: 'e2', to: 'e4', san: 'e4', uci: 'e2e4', flags: 'b', fen: START_FEN, check: false, ...over }
}

function snapshot(over: Partial<GameSnapshot> = {}): GameSnapshot {
  return { fen: START_FEN, pgn: '', history: [], turn: 'w', inCheck: false, isGameOver: false, captured: { w: [], b: [] }, playerColor: 'w', ...over }
}

function harness() {
  const bus = createBus()
  const provider = createContextProvider({ bus, world, room })
  return { bus, provider }
}

describe('roomName', () => {
  it('names Room 1 the way the narrator tests expect', () => {
    expect(roomName(room)).toBe('Room 1, the Declarations Room')
  })
})

describe('objectDisplayName', () => {
  it('carries the item number so the entry can be found', () => {
    const coat = room.objects.find((o) => o.id === '1-03')!
    expect(objectDisplayName(coat)).toBe('Greatcoat, west hook (1-03)')
  })

  it('leaves an object without an item number alone', () => {
    const halm = room.objects.find((o) => o.id === 'halm')!
    expect(objectDisplayName(halm)).toBe(halm.name)
  })
})

describe('createContextProvider', () => {
  it('describes an idle room before any game', () => {
    const { provider } = harness()
    const c = provider.getContext()
    expect(c.fen).toBe(START_FEN)
    expect(c.pgn).toBe('')
    expect(c.lastMovesSan).toEqual([])
    expect(c.turn).toBe('w')
    expect(c.playerColor).toBe('w')
    expect(c.gameStatus).toBe('idle')
    expect(c.ply).toBe(0)
    expect(c.roomId).toBe('room-1')
    expect(c.roomName).toBe('Room 1, the Declarations Room')
    expect(c.hour).toBe(world.opponent.hours[world.opponent.defaultHour]!.label)
    expect(c.inspecting).toBeUndefined()
    expect(c.door).toBeUndefined()
    expect(c.result).toBeUndefined()
  })

  it('follows the game through new, move, eval and over', () => {
    const { bus, provider } = harness()
    bus.emit({ type: 'game:new', snapshot: snapshot({ playerColor: 'b', turn: 'w' }) })
    expect(provider.getContext().gameStatus).toBe('playing')
    expect(provider.getContext().playerColor).toBe('b')

    const history = Array.from({ length: 12 }, (_, i) => move({ san: `m${i + 1}` }))
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    bus.emit({ type: 'game:move', by: 'player', move: history[11]!, snapshot: snapshot({ fen, history, turn: 'b', pgn: '1. e4', playerColor: 'b' }) })
    let c = provider.getContext()
    expect(c.fen).toBe(fen)
    expect(c.pgn).toBe('1. e4')
    expect(c.turn).toBe('b')
    expect(c.ply).toBe(12)
    expect(c.lastMovesSan).toEqual(['m3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'])

    bus.emit({ type: 'game:eval', fen, cp: 35 })
    c = provider.getContext()
    expect(c.evalCp).toBe(35)
    expect(c.lastMoveClassification).toBeUndefined()

    bus.emit({ type: 'game:eval', fen, cp: -320, swing: -355, classification: 'blunder', by: 'player' })
    c = provider.getContext()
    expect(c.evalCp).toBe(-320)
    expect(c.lastMoveClassification).toBe('blunder')

    bus.emit({ type: 'game:eval', fen, mate: 2, by: 'opponent' })
    c = provider.getContext()
    expect(c.evalCp).toBeUndefined()
    expect(c.evalMate).toBe(2)

    const result = { outcome: 'resignation' as const, winner: 'w' as const }
    bus.emit({ type: 'game:over', result, snapshot: snapshot({ isGameOver: true, result }) })
    c = provider.getContext()
    expect(c.gameStatus).toBe('over')
    expect(c.result).toEqual(result)

    bus.emit({ type: 'game:new', snapshot: snapshot() })
    c = provider.getContext()
    expect(c.gameStatus).toBe('playing')
    expect(c.result).toBeUndefined()
    expect(c.lastMoveClassification).toBeUndefined()
    expect(c.evalMate).toBeUndefined()
  })

  it('takes the hour from the card and the colour from the page head', () => {
    const { bus, provider } = harness()
    bus.emit({ type: 'player:hour', index: 3, strength: 8 })
    expect(provider.getContext().hour).toBe('After')
    bus.emit({ type: 'player:hour', index: 9, strength: 8 })
    expect(provider.getContext().hour).toBe('After')
    bus.emit({ type: 'player:color', color: 'b' })
    expect(provider.getContext().playerColor).toBe('b')
    bus.emit({ type: 'game:new', snapshot: snapshot({ playerColor: 'w' }) })
    expect(provider.getContext().playerColor).toBe('w')
  })

  it('names the object or piece being inspected, and forgets it on leaving', () => {
    const { bus, provider } = harness()
    bus.emit({ type: 'object:inspect', objectId: '1-03' })
    expect(provider.getContext().inspecting).toBe('Greatcoat, west hook (1-03)')
    bus.emit({ type: 'object:inspect', objectId: null })
    expect(provider.getContext().inspecting).toBeUndefined()

    bus.emit({ type: 'piece:inspect', key: 'wK', square: 'e1' })
    expect(provider.getContext().inspecting).toBe(world.pieces.wK.name)
    // The pointer leaving an object does not forget a raised card.
    bus.emit({ type: 'object:inspect', objectId: null })
    expect(provider.getContext().inspecting).toBe(world.pieces.wK.name)
    bus.emit({ type: 'piece:inspect', key: null })
    expect(provider.getContext().inspecting).toBeUndefined()
  })

  it('names a tried door until the pointer leaves it', () => {
    const { bus, provider } = harness()
    bus.emit({ type: 'object:inspect', objectId: '1-13' })
    bus.emit({ type: 'door:tried', doorId: '1-13', locked: true, leadsTo: 'room-3' })
    expect(provider.getContext().door).toBe('Door to Room 3 (1-13)')
    bus.emit({ type: 'object:inspect', objectId: '1-13' })
    expect(provider.getContext().door).toBe('Door to Room 3 (1-13)')
    bus.emit({ type: 'object:inspect', objectId: null })
    expect(provider.getContext().door).toBeUndefined()
  })

  it('stops listening when destroyed', () => {
    const { bus, provider } = harness()
    provider.destroy()
    bus.emit({ type: 'player:hour', index: 3, strength: 8 })
    expect(provider.getContext().hour).toBe(world.opponent.hours[world.opponent.defaultHour]!.label)
  })
})
