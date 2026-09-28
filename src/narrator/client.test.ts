import { describe, expect, it } from 'vitest'
import { NARRATOR_RESET_PATH, NARRATOR_STREAM_PATH, type NarratorRequest, type NarratorStreamEvent } from '../contracts/narrator'
import { START_FEN } from '../contracts/chess'
import { SESSION_STORAGE_KEY, createSseParser, fetchNarratorHealth, getSessionId, resetNarratorSession, streamNarrator } from './client'

const request: NarratorRequest = {
  sessionId: 's',
  kind: 'ask',
  text: 'hello',
  context: { fen: START_FEN, pgn: '', lastMovesSan: [], turn: 'w', playerColor: 'w', gameStatus: 'idle', ply: 0, roomId: 'r', roomName: 'Room 1', hour: '18.00' },
}

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

async function collect(gen: AsyncIterable<NarratorStreamEvent>): Promise<NarratorStreamEvent[]> {
  const out: NarratorStreamEvent[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

describe('createSseParser', () => {
  it('parses data lines into events, across chunk boundaries, ignoring comments', () => {
    const p = createSseParser()
    expect(p.push(': open\n\ndata: {"type":"del')).toEqual([])
    expect(p.push('ta","text":"The "}\n\ndata: {"type":"delta","text":"river."}\n\n: ping\n\n')).toEqual([
      { type: 'delta', text: 'The ' },
      { type: 'delta', text: 'river.' },
    ])
    expect(p.push('data: {"type":"done","text":"The river.","silent":false}')).toEqual([])
    expect(p.end()).toEqual([{ type: 'done', text: 'The river.', silent: false }])
  })
  it('accepts CRLF and skips lines that are not events', () => {
    const p = createSseParser()
    expect(p.push('data: {"type":"delta","text":"a"}\r\n\r\ndata: nonsense\r\n\r\ndata: {"type":"other"}\n\n')).toEqual([{ type: 'delta', text: 'a' }])
  })
})

describe('streamNarrator', () => {
  it('POSTs the request and yields the events of the stream, stopping at done', async () => {
    let seen: { url: string; init?: RequestInit } | null = null
    const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      seen = { url, init }
      return new Response(
        sseBody([': open\n\n', 'data: {"type":"delta","text":"Item 1-03."}\n\n', 'data: {"type":"done","text":"Item 1-03.","silent":false}\n\n', 'data: {"type":"delta","text":"late"}\n\n']),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const events = await collect(streamNarrator(request, { fetch: fakeFetch }))
    expect(events).toEqual([
      { type: 'delta', text: 'Item 1-03.' },
      { type: 'done', text: 'Item 1-03.', silent: false },
    ])
    const s = seen as unknown as { url: string; init?: RequestInit }
    expect(s.url).toBe(NARRATOR_STREAM_PATH)
    expect(s.init?.method).toBe('POST')
    expect(JSON.parse(String(s.init?.body))).toEqual(request)
  })

  it('turns a failed fetch, a bad status and an early end into error events', async () => {
    const failing = async (): Promise<Response> => {
      throw new Error('offline')
    }
    expect(await collect(streamNarrator(request, { fetch: failing }))).toEqual([{ type: 'error', message: 'offline', retryable: true }])

    const bad = async (): Promise<Response> => new Response('nope', { status: 400 })
    expect(await collect(streamNarrator(request, { fetch: bad }))).toEqual([{ type: 'error', message: 'The narrator answered 400.', retryable: false }])

    const early = async (): Promise<Response> => new Response(sseBody(['data: {"type":"delta","text":"a"}\n\n']), { status: 200 })
    expect(await collect(streamNarrator(request, { fetch: early }))).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'error', message: 'The stream ended early.', retryable: true },
    ])
  })
})

describe('helpers', () => {
  it('keeps one session id per storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage
    const a = getSessionId(storage)
    expect(a.length).toBeGreaterThan(8)
    expect(getSessionId(storage)).toBe(a)
    expect(store.get(SESSION_STORAGE_KEY)).toBe(a)
    expect(getSessionId(null)).not.toBe(a)
  })

  it('reads health and resets a session', async () => {
    const calls: string[] = []
    const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`.trim())
      if (url === NARRATOR_RESET_PATH) return new Response('{"ok":true}', { status: 200 })
      return new Response(JSON.stringify({ ok: true, backend: 'mock', model: 'mock' }), { status: 200 })
    }
    expect(await fetchNarratorHealth({ fetch: fakeFetch })).toEqual({ ok: true, backend: 'mock', model: 'mock' })
    expect(await resetNarratorSession('abc', { fetch: fakeFetch })).toBe(true)
    expect(calls[1]).toBe(`POST ${NARRATOR_RESET_PATH} {"sessionId":"abc"}`)
  })
})
