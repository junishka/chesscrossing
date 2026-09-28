/**
 * The browser's side of the wire protocol in src/contracts/narrator.ts.
 * POST to the stream path and read the text/event-stream body with a
 * ReadableStream reader (EventSource cannot POST). The session id is kept in
 * sessionStorage so the server's memory follows the tab.
 */
import {
  NARRATOR_HEALTH_PATH,
  NARRATOR_RESET_PATH,
  NARRATOR_STREAM_PATH,
  type NarratorHealth,
  type NarratorRequest,
  type NarratorStreamEvent,
} from '../contracts/narrator'

export const SESSION_STORAGE_KEY = 'chesscrossing.narrator.session'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  fetch?: FetchLike
  signal?: AbortSignal
}

function defaultFetch(): FetchLike {
  return (input, init) => fetch(input, init)
}

/** A fresh session id. */
export function newSessionId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/** The session id for this tab, made on first use and kept in sessionStorage. */
export function getSessionId(storage: Storage | null = safeSessionStorage()): string {
  try {
    const existing = storage?.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const id = newSessionId()
    storage?.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return newSessionId()
  }
}

/** A stateful parser for text/event-stream: feed it text, get the JSON data events. */
export interface SseParser {
  push(chunk: string): NarratorStreamEvent[]
  end(): NarratorStreamEvent[]
}

function isStreamEvent(v: unknown): v is NarratorStreamEvent {
  if (!v || typeof v !== 'object') return false
  const t = (v as { type?: unknown }).type
  return t === 'delta' || t === 'done' || t === 'error'
}

function parseBlock(block: string): NarratorStreamEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data) return null
  try {
    const parsed: unknown = JSON.parse(data)
    return isStreamEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function createSseParser(): SseParser {
  let buffer = ''
  const drain = (final: boolean): NarratorStreamEvent[] => {
    const out: NarratorStreamEvent[] = []
    buffer = buffer.replace(/\r\n/g, '\n')
    let at = buffer.indexOf('\n\n')
    while (at >= 0) {
      const block = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      const ev = parseBlock(block)
      if (ev) out.push(ev)
      at = buffer.indexOf('\n\n')
    }
    if (final && buffer.trim()) {
      const ev = parseBlock(buffer)
      if (ev) out.push(ev)
      buffer = ''
    }
    return out
  }
  return {
    push(chunk) {
      buffer += chunk
      return drain(false)
    },
    end() {
      return drain(true)
    },
  }
}

function errorEvent(message: string, retryable: boolean): NarratorStreamEvent {
  return { type: 'error', message, retryable }
}

/**
 * Opens the stream for a request and yields its events. Network and HTTP
 * failures arrive as an error event, so the caller sees one shape. The
 * generator ends after `done` or `error`.
 */
export async function* streamNarrator(request: NarratorRequest, options: ClientOptions = {}): AsyncGenerator<NarratorStreamEvent> {
  const doFetch = options.fetch ?? defaultFetch()
  let response: Response
  try {
    response = await doFetch(NARRATOR_STREAM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal: options.signal,
    })
  } catch (err) {
    if (options.signal?.aborted) return
    yield errorEvent(err instanceof Error ? err.message : 'The narrator could not be reached.', true)
    return
  }
  if (!response.ok) {
    yield errorEvent(`The narrator answered ${response.status}.`, response.status >= 500 || response.status === 429)
    return
  }
  if (!response.body) {
    yield errorEvent('The narrator sent no stream.', true)
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  let finished = false
  try {
    while (!finished) {
      const { value, done } = await reader.read()
      const events = done ? parser.end() : parser.push(decoder.decode(value, { stream: true }))
      for (const ev of events) {
        // Marked before the yield: a consumer that stops at `done` resumes this
        // generator in its finally, and the stream must be known to have finished.
        if (ev.type === 'done' || ev.type === 'error') finished = true
        yield ev
        if (finished) break
      }
      if (done) break
    }
  } catch (err) {
    if (options.signal?.aborted) return
    yield errorEvent(err instanceof Error ? err.message : 'The stream failed.', true)
    return
  } finally {
    await release(reader, finished)
  }
  if (!finished && !options.signal?.aborted) yield errorEvent('The stream ended early.', true)
}

/** How long a finished stream is given to close on its own before it is cancelled. */
export const DRAIN_MS = 1500

/**
 * Lets go of the body. After `done` or `error` the server closes the stream
 * itself; reading it to its end, rather than cancelling at once, keeps the
 * browser from recording the request as aborted. The wait is bounded, and
 * anything unfinished is cancelled.
 */
async function release(reader: ReadableStreamDefaultReader<Uint8Array>, finished: boolean): Promise<void> {
  if (finished) {
    let timer: ReturnType<typeof setTimeout> | null = null
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), DRAIN_MS)
    })
    try {
      for (;;) {
        const result = await Promise.race([reader.read(), deadline])
        if (result === 'timeout') break
        if (result.done) return
      }
    } catch {
      return
    } finally {
      if (timer !== null) clearTimeout(timer)
    }
  }
  try {
    await reader.cancel()
  } catch {
    // the body may already be closed
  }
}

/** GET the health of the narrator's backend. */
export async function fetchNarratorHealth(options: ClientOptions = {}): Promise<NarratorHealth> {
  const doFetch = options.fetch ?? defaultFetch()
  const res = await doFetch(NARRATOR_HEALTH_PATH, { method: 'GET', signal: options.signal })
  if (!res.ok) throw new Error(`health answered ${res.status}`)
  return (await res.json()) as NarratorHealth
}

/** Clears the server-side history of a session. Resolves true when the server agreed. */
export async function resetNarratorSession(sessionId: string, options: ClientOptions = {}): Promise<boolean> {
  const doFetch = options.fetch ?? defaultFetch()
  try {
    const res = await doFetch(NARRATOR_RESET_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      signal: options.signal,
    })
    return res.ok
  } catch {
    return false
  }
}
