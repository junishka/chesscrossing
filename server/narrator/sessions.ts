/**
 * Conversation memory per browser session. In memory, append-only, trimmed
 * to a number of turns in whole user-plus-assistant pairs so the history
 * always starts with a user turn and ends with an assistant turn.
 */
import type { BackendMessage } from './backends/types'

export interface Sessions {
  /** The history for a session, oldest first. A copy. */
  history(sessionId: string): BackendMessage[]
  /** Appends one exchange and trims. */
  append(sessionId: string, user: string, assistant: string): void
  /** Forgets a session. */
  reset(sessionId: string): void
  /** Number of sessions held. */
  size(): number
}

/**
 * `historyTurns` counts messages (a user turn and an assistant turn are two);
 * it is rounded down to whole pairs, so 40 keeps the last twenty exchanges.
 */
export function createSessions(historyTurns: number): Sessions {
  const maxPairs = Math.max(1, Math.floor(historyTurns / 2))
  const store = new Map<string, BackendMessage[]>()

  return {
    history(sessionId) {
      return [...(store.get(sessionId) ?? [])]
    },
    append(sessionId, user, assistant) {
      const list = store.get(sessionId) ?? []
      list.push({ role: 'user', content: user }, { role: 'assistant', content: assistant })
      const excess = list.length - maxPairs * 2
      if (excess > 0) list.splice(0, excess)
      store.set(sessionId, list)
    },
    reset(sessionId) {
      store.delete(sessionId)
    },
    size() {
      return store.size
    },
  }
}
