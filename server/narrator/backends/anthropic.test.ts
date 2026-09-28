import { describe, expect, it } from 'vitest'
import { FALLBACK_BETA, MAX_TOKENS, createAnthropicBackend, type ClientLike, type StreamEventLike, type StreamLike } from './anthropic'
import { BackendError } from './types'

interface Call {
  surface: 'messages' | 'beta'
  params: Record<string, unknown>
  signal: AbortSignal | null | undefined
}

function fakeClient(events: StreamEventLike[], stopReason = 'end_turn'): { client: ClientLike; calls: Call[] } {
  const calls: Call[] = []
  const make = (surface: Call['surface']) => (params: unknown, options?: { signal?: AbortSignal | null }): StreamLike => {
    calls.push({ surface, params: params as Record<string, unknown>, signal: options?.signal })
    return {
      async *[Symbol.asyncIterator]() {
        for (const e of events) yield e
      },
      finalMessage: async () => ({ stop_reason: stopReason, model: 'claude-opus-5-5' }),
    }
  }
  const client = {
    messages: { stream: make('messages') },
    beta: { messages: { stream: make('beta') } },
  } as unknown as ClientLike
  return { client, calls }
}

const EVENTS: StreamEventLike[] = [
  { type: 'message_start' },
  { type: 'content_block_start' },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The river ' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'stands.' } },
  { type: 'content_block_stop' },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  { type: 'message_stop' },
]

async function run(backend: ReturnType<typeof createAnthropicBackend>, signal = new AbortController().signal): Promise<string> {
  let out = ''
  for await (const d of backend.stream({ system: 'SYSTEM', messages: [{ role: 'user', content: 'hello' }], signal })) out += d
  return out
}

describe('createAnthropicBackend', () => {
  it('streams text deltas through the beta surface with fallbacks, caching the system prompt', async () => {
    const { client, calls } = fakeClient(EVENTS)
    const backend = createAnthropicBackend({ model: 'claude-opus-5-5', effort: 'low', fallbacks: true, createClient: () => client })
    const controller = new AbortController()
    expect(await run(backend, controller.signal)).toBe('The river stands.')
    expect(calls).toHaveLength(1)
    const call = calls[0] as Call
    expect(call.surface).toBe('beta')
    expect(call.signal).toBe(controller.signal)
    expect(call.params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(call.params).not.toHaveProperty('thinking')
    expect(call.params).not.toHaveProperty('tool_choice')
  })

  it('uses the plain messages surface when fallbacks are off', async () => {
    const { client, calls } = fakeClient(EVENTS)
    const backend = createAnthropicBackend({ model: 'claude-opus-5-5', effort: 'medium', fallbacks: false, createClient: () => client })
    expect(await run(backend)).toBe('The river stands.')
    const call = calls[0] as Call
    expect(call.surface).toBe('messages')
    expect(call.params).not.toHaveProperty('betas')
    expect(call.params).not.toHaveProperty('fallbacks')
    expect(call.params.output_config).toEqual({ effort: 'medium' })
  })

  it('treats a refusal as a retryable error', async () => {
    const { client } = fakeClient([], 'refusal')
    const backend = createAnthropicBackend({ model: 'm', effort: 'low', fallbacks: true, createClient: () => client })
    await expect(run(backend)).rejects.toMatchObject({ retryable: true })
    await expect(run(backend)).rejects.toBeInstanceOf(BackendError)
  })

  it('reports health from the environment', async () => {
    const { client } = fakeClient(EVENTS)
    const none = createAnthropicBackend({ model: 'm', effort: 'low', fallbacks: true, createClient: () => client, env: {} })
    expect(await none.health()).toMatchObject({ ok: false, backend: 'anthropic', model: 'm' })
    const keyed = createAnthropicBackend({ model: 'm', effort: 'low', fallbacks: true, createClient: () => client, env: { ANTHROPIC_API_KEY: 'k' } })
    expect(await keyed.health()).toEqual({ ok: true, backend: 'anthropic', model: 'm' })
  })
})
