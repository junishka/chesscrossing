/**
 * The Anthropic SDK backend. Streams claude-opus-5-5 with the effort from
 * config (thinking cannot be disabled on this model, so no thinking parameter
 * is sent), the system prompt cached across turns, and, when config allows,
 * server-side refusal fallbacks through the beta surface.
 *
 * The client is injectable so the backend can be tested with a fake; there is
 * no key in the development container.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { NarratorHealth } from '../../../src/contracts/narrator'
import type { Effort } from '../../config'
import { BackendError, isAbortError, type Backend, type BackendInput } from './types'

export const MAX_TOKENS = 1024
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** The slice of a stream event the backend reads. */
export interface StreamEventLike {
  type: string
  delta?: unknown
}

/** The text of a text_delta event, or null for any other event. */
export function textDelta(event: StreamEventLike): string | null {
  if (event.type !== 'content_block_delta' || !event.delta || typeof event.delta !== 'object') return null
  const delta = event.delta as { type?: unknown; text?: unknown }
  return delta.type === 'text_delta' && typeof delta.text === 'string' ? delta.text : null
}

export interface FinalMessageLike {
  stop_reason: string | null
  model?: string
}

export interface StreamLike extends AsyncIterable<StreamEventLike> {
  finalMessage(): Promise<FinalMessageLike>
}

export interface RequestOptionsLike {
  signal?: AbortSignal | null
}

/** The slice of the SDK client the backend uses. A real Anthropic instance satisfies it. */
export interface ClientLike {
  messages: {
    stream(params: Anthropic.MessageStreamParams, options?: RequestOptionsLike): StreamLike
  }
  beta: {
    messages: {
      stream(params: BetaMessageStreamParams, options?: RequestOptionsLike): StreamLike
    }
  }
}

export interface AnthropicBackendOptions {
  model: string
  effort: Effort
  fallbacks: boolean
  /** Makes the client. Default: `new Anthropic()`, which reads the environment. */
  createClient?: () => ClientLike
  /** Environment to read credentials from for health. Default process.env. */
  env?: NodeJS.ProcessEnv
}

function hasCredentials(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)
}

export function createAnthropicBackend(options: AnthropicBackendOptions): Backend {
  const { model, effort, fallbacks } = options
  const env = options.env ?? process.env
  let client: ClientLike | null = null

  function getClient(): ClientLike {
    if (!client) client = options.createClient ? options.createClient() : new Anthropic()
    return client
  }

  return {
    name: 'anthropic',

    async health(): Promise<NarratorHealth> {
      const ok = hasCredentials(env)
      const health: NarratorHealth = { ok, backend: 'anthropic', model }
      if (!ok) health.detail = 'No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment.'
      return health
    },

    async *stream(input: BackendInput): AsyncIterable<string> {
      const base = {
        model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text' as const, text: input.system, cache_control: { type: 'ephemeral' as const } }],
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
        output_config: { effort },
      }
      let stream: StreamLike
      try {
        const c = getClient()
        stream = fallbacks
          ? c.beta.messages.stream({ ...base, betas: [FALLBACK_BETA], fallbacks: 'default' }, { signal: input.signal })
          : c.messages.stream(base, { signal: input.signal })
      } catch (err) {
        throw toBackendError(err, input.signal)
      }

      try {
        for await (const event of stream) {
          const text = textDelta(event)
          if (text !== null) yield text
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') {
          throw new BackendError('The narrator declined to answer.', true)
        }
      } catch (err) {
        throw toBackendError(err, input.signal)
      }
    },
  }
}

function toBackendError(err: unknown, signal: AbortSignal): BackendError {
  if (err instanceof BackendError) return err
  if (isAbortError(err, signal)) return new BackendError('The request was abandoned.', false)
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0
    const retryable = status === 429 || status >= 500 || status === 408 || status === 0
    return new BackendError(`The narrator could not be reached (${status || 'network'}).`, retryable)
  }
  return new BackendError(err instanceof Error ? err.message : 'The narrator could not be reached.', true)
}
