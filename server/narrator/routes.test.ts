import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  NARRATOR_HEALTH_PATH,
  NARRATOR_RESET_PATH,
  NARRATOR_STREAM_PATH,
  SILENCE_TOKEN,
  type NarratorContext,
  type NarratorRequest,
  type NarratorStreamEvent,
} from '../../src/contracts/narrator'
import { START_FEN } from '../../src/contracts/chess'
import { createRouter } from '../router'
import { createMockBackend } from './backends/mock'
import type { Backend, BackendInput } from './backends/types'
import { BackendError } from './backends/types'
import { registerNarratorRoutes, validateRequest } from './routes'
import { createSessions } from './sessions'

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

/** Parses a text/event-stream body into its JSON data events. */
function parseSse(body: string): NarratorStreamEvent[] {
  const events: NarratorStreamEvent[] = []
  for (const block of body.split('\n\n')) {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n')
    if (data) events.push(JSON.parse(data) as NarratorStreamEvent)
  }
  return events
}

async function post(base: string, path: string, body: unknown): Promise<{ status: number; type: string; text: string }> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() }
}

describe('narrator routes with the mock backend', () => {
  let server: http.Server
  let base: string
  const sessions = createSessions(40)

  beforeAll(async () => {
    const router = createRouter()
    registerNarratorRoutes(router, { backend: createMockBackend({ model: 'mock' }), sessions, system: 'SYSTEM', log: () => {} })
    server = http.createServer(async (req, res) => {
      if (!(await router.handle(req, res))) {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('reports health', async () => {
    const res = await fetch(base + NARRATOR_HEALTH_PATH)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, backend: 'mock', model: 'mock' })
  })

  it('streams deltas then done for an ask, and remembers the exchange', async () => {
    const req: NarratorRequest = { sessionId: 'route-test', kind: 'ask', text: 'What is in Drawer 4?', context: context() }
    const { status, type, text } = await post(base, NARRATOR_STREAM_PATH, req)
    expect(status).toBe(200)
    expect(type).toContain('text/event-stream')
    const events = parseSse(text)
    const deltas = events.filter((e) => e.type === 'delta')
    expect(deltas.length).toBeGreaterThan(1)
    const done = events[events.length - 1]
    expect(done?.type).toBe('done')
    if (done?.type !== 'done') throw new Error('no done')
    expect(done.silent).toBe(false)
    expect(done.text).toMatch(/^Correspondence\. It is exempt under Regulation 12\(c\)\./)
    expect(deltas.map((d) => (d.type === 'delta' ? d.text : '')).join('')).toBe(done.text)
    const history = sessions.history('route-test')
    expect(history).toHaveLength(2)
    expect(history[0]?.content).toContain('What is in Drawer 4?')
    expect(history[0]?.content).toContain('Event: question')
    expect(history[1]?.content).toBe(done.text)
  })

  it('sends a silent done with no deltas for an event the narrator lets pass, and stores the dash', async () => {
    const req: NarratorRequest = { sessionId: 'route-silent', kind: 'event', event: 'player-move', context: context({ lastMovesSan: ['e4'], ply: 1, turn: 'b', gameStatus: 'playing' }) }
    const { text } = await post(base, NARRATOR_STREAM_PATH, req)
    const events = parseSse(text)
    expect(events).toEqual([{ type: 'done', text: '', silent: true }])
    expect(sessions.history('route-silent')[1]?.content).toBe(SILENCE_TOKEN)
  })

  it('rejects a bad body with 400', async () => {
    expect((await post(base, NARRATOR_STREAM_PATH, { kind: 'ask' })).status).toBe(400)
    expect((await post(base, NARRATOR_STREAM_PATH, { sessionId: 's', kind: 'ask', text: '', context: context() })).status).toBe(400)
    expect((await post(base, NARRATOR_STREAM_PATH, { sessionId: 's', kind: 'event', event: 'nope', context: context() })).status).toBe(400)
    expect((await post(base, NARRATOR_STREAM_PATH, { sessionId: 's', kind: 'event', event: 'capture' })).status).toBe(400)
  })

  it('resets a session', async () => {
    sessions.append('route-reset', 'u', 'a')
    const { status, text } = await post(base, NARRATOR_RESET_PATH, { sessionId: 'route-reset' })
    expect(status).toBe(200)
    expect(JSON.parse(text)).toEqual({ ok: true })
    expect(sessions.history('route-reset')).toEqual([])
    expect((await post(base, NARRATOR_RESET_PATH, {})).status).toBe(400)
  })
})

describe('narrator routes with a failing backend', () => {
  it('sends an error event with retryable and keeps no history', async () => {
    const failing: Backend = {
      name: 'mock',
      health: async () => ({ ok: false, backend: 'mock', model: 'x' }),
      // eslint-disable-next-line require-yield
      async *stream(_input: BackendInput) {
        throw new BackendError('The narrator declined to answer.', true)
      },
    }
    const sessions = createSessions(40)
    const router = createRouter()
    registerNarratorRoutes(router, { backend: failing, sessions, system: 'SYSTEM', log: () => {} })
    const server = http.createServer((req, res) => void router.handle(req, res))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const { text } = await post(base, NARRATOR_STREAM_PATH, { sessionId: 'f', kind: 'ask', text: 'hello', context: context() })
      expect(parseSse(text)).toEqual([{ type: 'error', message: 'The narrator declined to answer.', retryable: true }])
      expect(sessions.history('f')).toEqual([])
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it('strips a leading dash line from a hesitant reply before forwarding', async () => {
    const hesitant: Backend = {
      name: 'mock',
      health: async () => ({ ok: true, backend: 'mock', model: 'x' }),
      async *stream() {
        yield '—'
        yield '\n'
        yield 'Item 1-03.'
        yield ' Not returned.'
      },
    }
    const router = createRouter()
    registerNarratorRoutes(router, { backend: hesitant, sessions: createSessions(4), system: 'SYSTEM', log: () => {} })
    const server = http.createServer((req, res) => void router.handle(req, res))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const { text } = await post(base, NARRATOR_STREAM_PATH, { sessionId: 'h', kind: 'ask', text: 'the coat', context: context() })
      const events = parseSse(text)
      expect(events).toEqual([
        { type: 'delta', text: 'Item 1-03.' },
        { type: 'delta', text: ' Not returned.' },
        { type: 'done', text: 'Item 1-03. Not returned.', silent: false },
      ])
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })
})

describe('validateRequest', () => {
  it('accepts a full request and names the first problem otherwise', () => {
    const good: NarratorRequest = { sessionId: 's', kind: 'event', event: 'capture', context: context() }
    expect(validateRequest(good)).toBeNull()
    expect(validateRequest(null)).toBe('body must be an object')
    expect(validateRequest({ sessionId: 's', kind: 'ask', text: 'x', context: { ...context(), turn: 'x' } })).toBe('context.turn must be w or b')
    expect(validateRequest({ sessionId: 's', kind: 'ask', text: 'x', context: { ...context(), lastMovesSan: [1] } })).toBe('context.lastMovesSan must be strings')
  })
})
