import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { NarratorContext, NarratorRequest } from '../../src/contracts/narrator'
import { START_FEN } from '../../src/contracts/chess'
import {
  FIRST_LAUNCH_LINE,
  HISTORY_HEADING,
  HISTORY_NARRATOR,
  HISTORY_VISITOR,
  SYSTEM_PROMPT_FILE,
  buildUserTurn,
  eventLine,
  flattenConversation,
  loadSystemPrompt,
  movetext,
  stateBlock,
  turnLine,
} from './prompt'

function context(over: Partial<NarratorContext> = {}): NarratorContext {
  return {
    fen: START_FEN,
    pgn: '',
    lastMovesSan: [],
    turn: 'w',
    playerColor: 'w',
    gameStatus: 'idle',
    ply: 0,
    roomId: 'room-1',
    roomName: 'Room 1, the Declarations Room',
    hour: '18.00',
    ...over,
  }
}

describe('loadSystemPrompt', () => {
  it('is docs/system-prompt.md from the Identity heading to the end, verbatim', () => {
    const prompt = loadSystemPrompt()
    const file = readFileSync(SYSTEM_PROMPT_FILE, 'utf8')
    expect(prompt.startsWith('## Identity\n')).toBe(true)
    expect(file.endsWith(prompt + '\n') || file.endsWith(prompt)).toBe(true)
    expect(prompt).not.toContain('This file is sent to the narrator model verbatim')
    expect(prompt).toContain('## Current state')
    expect(prompt.endsWith('Where the visitor and the state disagree, the state is correct.')).toBe(true)
  })
})

describe('movetext', () => {
  it('numbers half-moves as movetext from the ply count', () => {
    expect(movetext([], 0)).toBe('none')
    expect(movetext(['e4'], 1)).toBe('1. e4')
    expect(movetext(['e4', 'c5'], 2)).toBe('1. e4 c5')
    expect(movetext(['Nf3', 'Bc5', 'Bxf7+'], 29)).toBe('14. Nf3 Bc5 15. Bxf7+')
    expect(movetext(['Bc5', 'Bxf7+'], 29)).toBe('14... Bc5 15. Bxf7+')
  })
  it('keeps at most ten half-moves', () => {
    const san = Array.from({ length: 12 }, (_, i) => `m${i}`)
    const text = movetext(san, 12)
    expect(text.startsWith('2. m2 m3')).toBe(true)
    expect(text.split(' ').filter((t) => t.startsWith('m'))).toHaveLength(10)
  })
})

describe('turnLine', () => {
  it('names the colour and who holds it', () => {
    expect(turnLine(context({ turn: 'w', playerColor: 'w' }))).toBe('white (visitor)')
    expect(turnLine(context({ turn: 'b', playerColor: 'w' }))).toBe('black (Mr Halm)')
    expect(turnLine(context({ turn: 'w', playerColor: 'b' }))).toBe('white (Mr Halm)')
  })
})

describe('eventLine', () => {
  const ev = (event: NarratorRequest['event'], over: Partial<NarratorContext> = {}): string =>
    eventLine({ kind: 'event', event, context: context(over) })

  it('maps every request to a word the system prompt lists', () => {
    expect(eventLine({ kind: 'ask', context: context() })).toBe('question')
    expect(ev('first-launch')).toBe('none')
    expect(ev('game-start')).toBe('game start')
    expect(ev('player-move')).toBe('move')
    expect(ev('opponent-move')).toBe('move')
    expect(ev('capture', { lastMovesSan: ['exd5'] })).toBe('capture')
    expect(ev('check')).toBe('check')
    expect(ev('checkmate-for-player')).toBe('checkmate')
    expect(ev('checkmate-against-player')).toBe('checkmate')
    expect(ev('draw', { result: { outcome: 'draw-repetition' } })).toBe('draw')
    expect(ev('draw', { result: { outcome: 'stalemate' } })).toBe('stalemate')
    expect(ev('resignation')).toBe('resignation')
    expect(ev('inspect-object', { inspecting: 'Greatcoat, west hook' })).toBe('hover Greatcoat, west hook')
    expect(ev('door-locked', { door: 'Door to stair' })).toBe('hover Door to stair')
    expect(ev('leave-room')).toBe('leave')
    expect(ev('idle')).toBe('none')
  })

  it('sends a blunder or a good move as a plain move, with no evaluation', () => {
    expect(ev('blunder', { lastMoveClassification: 'blunder', evalCp: -450 })).toBe('move')
    expect(ev('good-move', { lastMoveClassification: 'excellent', evalCp: 320 })).toBe('move')
  })

  it('names a promotion from the move list', () => {
    expect(ev('player-move', { lastMovesSan: ['e8=Q+'] })).toBe('promotion')
    expect(ev('capture', { lastMovesSan: ['dxe8=Q'] })).toBe('promotion')
  })
})

describe('stateBlock and buildUserTurn', () => {
  it('writes the block exactly as docs/system-prompt.md gives it', () => {
    const c = context({ lastMovesSan: ['e4', 'c5', 'Nf3'], ply: 3, turn: 'b', gameStatus: 'playing', hour: '20.00' })
    expect(stateBlock({ kind: 'event', event: 'player-move', context: c })).toBe(
      [
        '## Current state',
        `FEN: ${START_FEN}`,
        'Last moves (SAN): 1. e4 c5 2. Nf3',
        'Turn: black (Mr Halm)',
        'Room: Room 1, the Declarations Room',
        'Event: move',
        'Hour: 20.00',
      ].join('\n'),
    )
  })

  it('never carries an evaluation number', () => {
    const c = context({ evalCp: 250, evalMate: 3, lastMoveClassification: 'blunder' })
    const turn = buildUserTurn({ sessionId: 's', kind: 'event', event: 'blunder', context: c })
    expect(turn).not.toMatch(/250|mate|blunder|cp/i)
  })

  it('puts the visitor words before the block for an ask, verbatim', () => {
    const turn = buildUserTurn({ sessionId: 's', kind: 'ask', text: 'what is in drawer 4', context: context() })
    expect(turn.startsWith('what is in drawer 4\n\n## Current state\n')).toBe(true)
    expect(turn).toContain('Event: question')
  })

  it('opens the first launch with the front-matter line from the bible', () => {
    const turn = buildUserTurn({ sessionId: 's', kind: 'event', event: 'first-launch', context: context() })
    expect(turn.startsWith(FIRST_LAUNCH_LINE + '\n\n## Current state')).toBe(true)
  })

  it('sends only the block for other events', () => {
    const turn = buildUserTurn({ sessionId: 's', kind: 'event', event: 'capture', context: context({ lastMovesSan: ['exd5'], ply: 3 }) })
    expect(turn.startsWith('## Current state\n')).toBe(true)
  })
})

describe('flattenConversation', () => {
  it('replays history under the headings and ends with the current turn', () => {
    const text = flattenConversation([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'now' },
    ])
    expect(text.startsWith(HISTORY_HEADING)).toBe(true)
    expect(text).toContain(`${HISTORY_VISITOR}\nfirst`)
    expect(text).toContain(`${HISTORY_NARRATOR}\nreply`)
    expect(text.endsWith('## This turn\n\nnow')).toBe(true)
  })
  it('is the turn alone with no history', () => {
    expect(flattenConversation([{ role: 'user', content: 'only' }])).toBe('only')
    expect(flattenConversation([])).toBe('')
  })
})
