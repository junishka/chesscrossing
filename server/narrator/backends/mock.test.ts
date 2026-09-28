import { describe, expect, it } from 'vitest'
import { SILENCE_TOKEN } from '../../../src/contracts/narrator'
import { answerFor, createMockBackend, loadVoiceBank, readTurn, tagsForEvent } from './mock'
import type { BackendInput } from './types'

async function say(backend: ReturnType<typeof createMockBackend>, messages: BackendInput['messages']): Promise<string> {
  let out = ''
  for await (const d of backend.stream({ system: '', messages, signal: new AbortController().signal })) out += d
  return out
}

const state = (event: string, words = ''): string =>
  `${words ? words + '\n\n' : ''}## Current state\nFEN: x\nLast moves (SAN): none\nTurn: white (visitor)\nRoom: Room 1, the Declarations Room\nEvent: ${event}\nHour: 18.00`

describe('the voice bank', () => {
  it('reads the forty tagged lines and the example answers from docs/voice.md', () => {
    const bank = loadVoiceBank()
    expect(bank.lines).toHaveLength(40)
    expect(bank.lines[0]?.tag).toBe('session start, evening')
    expect(bank.lines[14]).toEqual({ tag: 'blunder by player, during play', text: '—' })
    expect(bank.lines[39]?.tag).toBe('player says thank you, end of session')
    expect(bank.chess).toHaveLength(6)
    expect(bank.chess[0]).toMatch(/^The bishop on c4/)
    expect(bank.world).toHaveLength(6)
    expect(bank.world[1]?.answer).toMatch(/^Correspondence\. It is exempt/)
    expect(bank.philosophy).toHaveLength(4)
  })
  it('has no exclamation mark and no rhetorical question in any line', () => {
    const bank = loadVoiceBank()
    const all = [...bank.lines.map((l) => l.text), ...bank.chess, ...bank.world.map((w) => w.answer), ...bank.philosophy.map((p) => p.answer)].join('\n')
    expect(all).not.toMatch(/!/)
    expect(all).not.toMatch(/\?/)
  })
})

describe('readTurn and tagsForEvent', () => {
  it('finds the Event line and the words before the block', () => {
    expect(readTurn(state('capture'))).toEqual({ event: 'capture', words: '' })
    expect(readTurn(state('question', 'who are you'))).toEqual({ event: 'question', words: 'who are you' })
  })
  it('maps events to tags', () => {
    expect(tagsForEvent('game start', false)).toEqual(['game start', 'game start, hour 18.00', 'game start, hour After'])
    expect(tagsForEvent('none', true)).toEqual(['session start, evening', 'session start, morning'])
    expect(tagsForEvent('none', false)).toEqual([])
    expect(tagsForEvent('move', false)).toEqual([])
    expect(tagsForEvent('hover Greatcoat, west hook (1-03)', false)).toEqual(['hover:1-03:greatcoat, west hook (1-03)'])
  })
})

describe('createMockBackend', () => {
  it('opens a session with the river and the weather', async () => {
    const b = createMockBackend()
    const line = await say(b, [{ role: 'user', content: state('none', 'Visitor (1), admitted under Standing Order 11. Received in Room 1.') }])
    expect(line).toMatch(/^The river stands at one metre forty/)
  })

  it('cycles the game start lines', async () => {
    const b = createMockBackend()
    const history = [{ role: 'user' as const, content: 'x' }, { role: 'assistant' as const, content: 'y' }]
    const first = await say(b, [...history, { role: 'user', content: state('game start') }])
    const second = await say(b, [...history, { role: 'user', content: state('game start') }])
    const third = await say(b, [...history, { role: 'user', content: state('game start') }])
    const fourth = await say(b, [...history, { role: 'user', content: state('game start') }])
    expect(first).toMatch(/^Mr Halm has taken black/)
    expect(second).toMatch(/^You have named six o'clock/)
    expect(third).toMatch(/^You have named After/)
    expect(fourth).toBe(first)
  })

  it('answers a hover by item number, and is silent for an unknown item or a plain move', async () => {
    const b = createMockBackend()
    expect(await say(b, [{ role: 'user', content: state('hover Greatcoat, west hook (1-03)') }])).toMatch(/^Item 1-03\. Greatcoat/)
    expect(await say(b, [{ role: 'user', content: state('hover Door to stair (1-14)') }])).toMatch(/^The stair\./)
    expect(await say(b, [{ role: 'user', content: state('hover Desk, declarations (1-01)') }])).toBe(SILENCE_TOKEN)
    expect(await say(b, [{ role: 'user', content: state('move') }])).toBe(SILENCE_TOKEN)
  })

  it('answers questions with a fitting line', async () => {
    const b = createMockBackend()
    expect(await say(b, [{ role: 'user', content: state('question', 'Are you an AI?') }])).toMatch(/^I am a language model, and in this house I am Edmund Prell/)
    expect(await say(b, [{ role: 'user', content: state('question', 'Who are you?') }])).toMatch(/^Edmund Prell\./)
    expect(await say(b, [{ role: 'user', content: state('question', 'What is in Drawer 4?') }])).toMatch(/^Correspondence\./)
    expect(await say(b, [{ role: 'user', content: state('question', 'Can I have a hint?') }])).toMatch(/^I do not advise during play/)
    expect(await say(b, [{ role: 'user', content: state('question', 'What about the bishop?') }])).toMatch(/^The bishop on c4/)
    expect(await say(b, [{ role: 'user', content: state('question', 'ok') }])).toBe(SILENCE_TOKEN)
  })

  it('answerFor cycles the chess examples', () => {
    const bank = loadVoiceBank()
    let n = 0
    const cycle = (): number => n++ % bank.chess.length
    expect(answerFor(bank, 'the knight', cycle)).toBe(bank.chess[0])
    expect(answerFor(bank, 'the knight', cycle)).toBe(bank.chess[1])
  })

  it('reports health without network', async () => {
    const h = await createMockBackend({ model: 'mock' }).health()
    expect(h).toMatchObject({ ok: true, backend: 'mock', model: 'mock' })
  })
})
