/**
 * A narrator backend: something that turns a system prompt and a conversation
 * into a stream of text deltas. Three exist: the Anthropic SDK, the Claude
 * CLI in print mode, and a mock that reads docs/voice.md. The routes treat
 * them alike.
 */
import type { NarratorHealth } from '../../../src/contracts/narrator'

export interface BackendMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BackendInput {
  /** The system prompt, verbatim from docs/system-prompt.md. */
  system: string
  /** The conversation so far, oldest first, ending with the new user turn. */
  messages: BackendMessage[]
  /** Aborted when the browser disconnects. */
  signal: AbortSignal
}

export interface Backend {
  readonly name: NarratorHealth['backend']
  health(): Promise<NarratorHealth>
  /** Yields text deltas as they arrive. Throws a BackendError when the turn fails. */
  stream(input: BackendInput): AsyncIterable<string>
}

/** A failure the route reports to the browser. `retryable` says whether asking again may help. */
export class BackendError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'BackendError'
    this.retryable = retryable
  }
}

/** True when the signal was aborted, whatever the error object looks like. */
export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof Error && err.name === 'AbortError'
}
