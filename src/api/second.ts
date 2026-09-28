// Client for the Second: the local server that talks to Claude. Health probe and SSE conversation.
import type { ConverseEvent, ConverseRequest, Health } from '../types'

const HEALTH_TIMEOUT_MS = 3000
/** Time without a first delta after which THE SECOND IS THINKING LONGER THAN IS USEFUL is shown (ms). */
export const SLOW_MS = 12_000

/**
 * Asks the server whether the Claude CLI is available; never throws, 3s timeout. When the port
 * does not answer (no connection, a non-JSON or non-200 answer, or the 3 s pass) the reason is
 * 'unreachable': PORT 4664 DOES NOT ANSWER. Otherwise the reason is the server's own:
 * 'ok', 'missing', 'unauthenticated' or 'slow'.
 */
export async function health(): Promise<Health> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch('/api/health', { signal: ctl.signal })
    if (!res.ok) return unreachable()
    const body = (await res.json()) as Partial<Health>
    return {
      ok: body.ok === true,
      cli: body.cli === true,
      version: typeof body.version === 'string' ? body.version : undefined,
      model: typeof body.model === 'string' ? body.model : '',
      reason: typeof body.reason === 'string' ? body.reason : 'unreachable',
    }
  } catch {
    return unreachable()
  } finally {
    clearTimeout(timer)
  }
}

function unreachable(): Health {
  return { ok: false, cli: false, model: '', reason: 'unreachable' }
}

/** Callbacks a caller may attach to a turn beyond the deltas. */
export interface ConverseOptions {
  /** Fired once when 12 s pass without a first delta; the turn goes on and the reply is still delivered. */
  onSlow?: () => void
}

/**
 * Sends a conversation turn and streams the reply. Resolves with the full text on `done` (an
 * empty string when the Second said nothing; the server has already asked her once more),
 * rejects on an `error` event, a network failure or when `signal` aborts. `options.onSlow`
 * fires at 12 s without a first delta.
 */
export async function converse(
  req: ConverseRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  options: ConverseOptions = {},
): Promise<{ text: string; costUsd?: number }> {
  let started = false
  const slowTimer = setTimeout(() => { if (!started && !signal?.aborted) options.onSlow?.() }, SLOW_MS)
  try {
    const res = await fetch('/api/converse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    if (!res.ok) throw new Error(await errorText(res))
    if (!res.body) throw new Error('the Second sent no body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let cut = buffer.indexOf('\n\n')
      while (cut !== -1) {
        const frame = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        const event = parseFrame(frame)
        if (event?.type === 'delta') {
          if (event.text) {
            started = true
            text += event.text
            onDelta(event.text)
          }
        } else if (event?.type === 'done') {
          void reader.cancel()
          return { text, costUsd: event.costUsd }
        } else if (event?.type === 'error') {
          void reader.cancel()
          throw new Error(event.message)
        }
        cut = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    throw new Error('the Second stopped mid-sentence')
  } finally {
    clearTimeout(slowTimer)
  }
}

/** Reads one SSE frame's `data:` lines into a ConverseEvent, ignoring anything else. */
export function parseFrame(frame: string): ConverseEvent | undefined {
  const data = frame
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
    .join('\n')
  if (!data) return undefined
  try {
    const raw = JSON.parse(data) as Partial<ConverseEvent> & { type?: string }
    if (raw.type === 'delta' && typeof raw.text === 'string') return { type: 'delta', text: raw.text }
    if (raw.type === 'done') return { type: 'done', costUsd: numberOrUndefined(raw.costUsd), durationMs: numberOrUndefined(raw.durationMs) }
    if (raw.type === 'error') return { type: 'error', message: typeof raw.message === 'string' ? raw.message : 'unknown error' }
  } catch {
    /* not JSON: ignore the frame */
  }
  return undefined
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    /* no JSON body */
  }
  return `the Second answered ${res.status}`
}
