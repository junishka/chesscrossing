import { describe, expect, it } from 'vitest'
import type { GameSnapshot, MoveRecord } from '../contracts/chess'
import { START_FEN } from '../contracts/chess'
import type { AppEvent } from '../contracts/events'
import { NARRATOR_POLICY, OBJECT_DWELL_MS, createPolicy } from './policy'

const snapshot = (over: Partial<GameSnapshot> = {}): GameSnapshot => ({
  fen: START_FEN,
  pgn: '',
  history: [],
  turn: 'w',
  inCheck: false,
  isGameOver: false,
  captured: { w: [], b: [] },
  playerColor: 'w',
  ...over,
})

const move = (over: Partial<MoveRecord> = {}): MoveRecord => ({
  moveNumber: 1,
  color: 'w',
  piece: 'p',
  from: 'e2',
  to: 'e4',
  san: 'e4',
  uci: 'e2e4',
  flags: 'b',
  fen: START_FEN,
  check: false,
  ...over,
})

const kind = (e: AppEvent, p = createPolicy()) => p.decide(e)?.kind ?? null

describe('NARRATOR_POLICY', () => {
  it('is readable data with the documented defaults', () => {
    expect(NARRATOR_POLICY).toMatchObject({
      firstGameStart: true,
      laterGameStarts: false,
      captures: ['q', 'r'],
      check: false,
      blunder: true,
      excellent: true,
      good: false,
      checkmate: true,
      draw: true,
      resignation: true,
      doorLocked: true,
      objectInspect: true,
      objectInspectOnce: true,
      objectDwellMs: OBJECT_DWELL_MS,
      pieceInspect: false,
      idle: false,
    })
    expect(Object.isFrozen(NARRATOR_POLICY)).toBe(true)
  })
})

describe('createPolicy().decide', () => {
  it('lets the first game start through and not later ones', () => {
    const p = createPolicy()
    expect(kind({ type: 'game:new', snapshot: snapshot() }, p)).toBe('game-start')
    expect(kind({ type: 'game:new', snapshot: snapshot() }, p)).toBeNull()
    p.reset()
    expect(kind({ type: 'game:new', snapshot: snapshot() }, p)).toBe('game-start')
  })

  it('remarks on captures of a queen or rook only, and on promotions', () => {
    expect(kind({ type: 'game:move', move: move({ captured: 'q', san: 'Qxd8' }), snapshot: snapshot(), by: 'player' })).toBe('capture')
    expect(kind({ type: 'game:move', move: move({ captured: 'r' }), snapshot: snapshot(), by: 'opponent' })).toBe('capture')
    expect(kind({ type: 'game:move', move: move({ captured: 'p' }), snapshot: snapshot(), by: 'player' })).toBeNull()
    expect(kind({ type: 'game:move', move: move({ captured: 'n' }), snapshot: snapshot(), by: 'player' })).toBeNull()
    expect(kind({ type: 'game:move', move: move(), snapshot: snapshot(), by: 'player' })).toBeNull()
    expect(kind({ type: 'game:move', move: move({ promotion: 'q', san: 'e8=Q' }), snapshot: snapshot(), by: 'player' })).toBe('player-move')
    expect(kind({ type: 'game:move', move: move({ promotion: 'q' }), snapshot: snapshot(), by: 'opponent' })).toBe('opponent-move')
  })

  it('is silent on check', () => {
    expect(kind({ type: 'game:check', color: 'b', snapshot: snapshot() })).toBeNull()
  })

  it('names the ending', () => {
    expect(kind({ type: 'game:over', result: { outcome: 'checkmate', winner: 'w' }, snapshot: snapshot({ playerColor: 'w' }) })).toBe('checkmate-for-player')
    expect(kind({ type: 'game:over', result: { outcome: 'checkmate', winner: 'b' }, snapshot: snapshot({ playerColor: 'w' }) })).toBe('checkmate-against-player')
    expect(kind({ type: 'game:over', result: { outcome: 'resignation', winner: 'b' }, snapshot: snapshot() })).toBe('resignation')
    expect(kind({ type: 'game:over', result: { outcome: 'stalemate' }, snapshot: snapshot() })).toBe('draw')
    expect(kind({ type: 'game:over', result: { outcome: 'draw-repetition' }, snapshot: snapshot() })).toBe('draw')
  })

  it('passes a blunder and an excellent move by the player, not a good one or the opponent', () => {
    expect(kind({ type: 'game:eval', fen: START_FEN, classification: 'blunder', by: 'player' })).toBe('blunder')
    expect(kind({ type: 'game:eval', fen: START_FEN, classification: 'excellent', by: 'player' })).toBe('good-move')
    expect(kind({ type: 'game:eval', fen: START_FEN, classification: 'good', by: 'player' })).toBeNull()
    expect(kind({ type: 'game:eval', fen: START_FEN, classification: 'mistake', by: 'player' })).toBeNull()
    expect(kind({ type: 'game:eval', fen: START_FEN, classification: 'blunder', by: 'opponent' })).toBeNull()
    expect(kind({ type: 'game:eval', fen: START_FEN, cp: 20 })).toBeNull()
  })

  it('remarks on a locked door, not an open one', () => {
    expect(kind({ type: 'door:tried', doorId: 'd', locked: true })).toBe('door-locked')
    expect(kind({ type: 'door:tried', doorId: 'd', locked: false })).toBeNull()
  })

  it('remarks on an object after a dwell, once per object, and never on a piece', () => {
    const p = createPolicy()
    const first = p.decide({ type: 'object:inspect', objectId: '1-03' })
    expect(first).toMatchObject({ kind: 'inspect-object', delayMs: OBJECT_DWELL_MS })
    // not yet committed: asking again still yields a decision
    expect(p.decide({ type: 'object:inspect', objectId: '1-03' })?.kind).toBe('inspect-object')
    first?.commit?.()
    expect(p.decide({ type: 'object:inspect', objectId: '1-03' })).toBeNull()
    expect(p.decide({ type: 'object:inspect', objectId: '1-04' })?.kind).toBe('inspect-object')
    expect(p.decide({ type: 'object:inspect', objectId: null })).toBeNull()
    expect(p.decide({ type: 'piece:inspect', key: 'wK' })).toBeNull()
  })

  it('ignores the rest', () => {
    expect(kind({ type: 'engine:status', status: 'ready' })).toBeNull()
    expect(kind({ type: 'player:hour', index: 0, strength: 1 })).toBeNull()
    expect(kind({ type: 'player:leave-room' })).toBe('leave-room')
  })

  it('allowsKind follows the flags', () => {
    const p = createPolicy()
    expect(p.allowsKind('check')).toBe(false)
    expect(p.allowsKind('idle')).toBe(false)
    expect(p.allowsKind('inspect-piece')).toBe(false)
    expect(p.allowsKind('blunder')).toBe(true)
    expect(p.allowsKind('first-launch')).toBe(true)
    expect(p.allowsKind('draw')).toBe(true)
  })
})
