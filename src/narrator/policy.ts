/**
 * Which bus events reach the narrator. docs/voice.md section 10: silence is a
 * move, and during play only recorded events (start, capture, check, mate,
 * draw, promotion, end) earn a word. The policy is data so the app shell can
 * read it; createPolicy adds the small amount of state it needs (the first
 * game, objects already remarked on).
 */
import type { PieceType } from '../contracts/chess'
import type { AppEvent } from '../contracts/events'
import type { NarratorEventKind } from '../contracts/narrator'

export interface NarratorPolicy {
  /** The opening line on room:enter, once per panel. */
  firstLaunch: boolean
  firstGameStart: boolean
  laterGameStarts: boolean
  /** Captured piece types worth a word. Default queen and rook. */
  captures: readonly PieceType[]
  promotion: boolean
  check: boolean
  blunder: boolean
  excellent: boolean
  good: boolean
  checkmate: boolean
  draw: boolean
  resignation: boolean
  doorLocked: boolean
  objectInspect: boolean
  /** At most once per object per session. */
  objectInspectOnce: boolean
  /** The pointer must rest on an object this long before the narrator is told. */
  objectDwellMs: number
  pieceInspect: boolean
  leaveRoom: boolean
  idle: boolean
}

/** No document names a dwell time; this is the panel's, and the shell may override it. */
export const OBJECT_DWELL_MS = 1200

export const NARRATOR_POLICY: Readonly<NarratorPolicy> = Object.freeze({
  firstLaunch: true,
  firstGameStart: true,
  laterGameStarts: false,
  captures: Object.freeze(['q', 'r'] as PieceType[]),
  promotion: true,
  check: false,
  blunder: true,
  excellent: true,
  good: false,
  checkmate: true,
  draw: true,
  resignation: true,
  doorLocked: true,
  objectInspect: true,
  objectInspectOnce: true,
  objectDwellMs: OBJECT_DWELL_MS,
  pieceInspect: false,
  leaveRoom: true,
  idle: false,
})

export interface PolicyDecision {
  kind: NarratorEventKind
  /** Wait this long before sending; cancelled if the pointer leaves. */
  delayMs?: number
  /** Called when the event is actually sent (marks an object as remarked on). */
  commit?: () => void
}

export interface Policy {
  readonly policy: Readonly<NarratorPolicy>
  /** The narrator event for a bus event, or null when the policy drops it. */
  decide(event: AppEvent): PolicyDecision | null
  /** Whether an event kind offered directly (NarratorPanel.notify) passes. */
  allowsKind(kind: NarratorEventKind): boolean
  /** Forgets the first game and the objects seen. */
  reset(): void
}

export function createPolicy(policy: Readonly<NarratorPolicy> = NARRATOR_POLICY): Policy {
  let gamesStarted = 0
  const objectsSeen = new Set<string>()

  function allowsKind(kind: NarratorEventKind): boolean {
    switch (kind) {
      case 'first-launch':
        return policy.firstLaunch
      case 'game-start':
        return policy.firstGameStart || policy.laterGameStarts
      case 'player-move':
      case 'opponent-move':
        return policy.promotion
      case 'capture':
        return policy.captures.length > 0
      case 'check':
        return policy.check
      case 'checkmate-for-player':
      case 'checkmate-against-player':
        return policy.checkmate
      case 'draw':
        return policy.draw
      case 'resignation':
        return policy.resignation
      case 'blunder':
        return policy.blunder
      case 'good-move':
        return policy.excellent || policy.good
      case 'inspect-object':
        return policy.objectInspect
      case 'inspect-piece':
        return policy.pieceInspect
      case 'door-locked':
        return policy.doorLocked
      case 'leave-room':
        return policy.leaveRoom
      case 'idle':
        return policy.idle
    }
  }

  function decide(event: AppEvent): PolicyDecision | null {
    switch (event.type) {
      case 'game:new': {
        gamesStarted++
        const first = gamesStarted === 1
        if (first ? policy.firstGameStart : policy.laterGameStarts) return { kind: 'game-start' }
        return null
      }
      case 'game:move': {
        const { move } = event
        if (move.captured && policy.captures.includes(move.captured)) return { kind: 'capture' }
        if (move.promotion && policy.promotion) return { kind: event.by === 'player' ? 'player-move' : 'opponent-move' }
        return null
      }
      case 'game:check':
        return policy.check ? { kind: 'check' } : null
      case 'game:over': {
        const { result, snapshot } = event
        if (result.outcome === 'checkmate') {
          if (!policy.checkmate) return null
          return { kind: result.winner === snapshot.playerColor ? 'checkmate-for-player' : 'checkmate-against-player' }
        }
        if (result.outcome === 'resignation') return policy.resignation ? { kind: 'resignation' } : null
        return policy.draw ? { kind: 'draw' } : null
      }
      case 'game:eval': {
        if (event.by === 'opponent') return null
        if (event.classification === 'blunder') return policy.blunder ? { kind: 'blunder' } : null
        if (event.classification === 'excellent') return policy.excellent ? { kind: 'good-move' } : null
        if (event.classification === 'good') return policy.good ? { kind: 'good-move' } : null
        return null
      }
      case 'door:tried':
        return event.locked && policy.doorLocked ? { kind: 'door-locked' } : null
      case 'object:inspect': {
        const id = event.objectId
        if (!id || !policy.objectInspect) return null
        if (policy.objectInspectOnce && objectsSeen.has(id)) return null
        return {
          kind: 'inspect-object',
          delayMs: policy.objectDwellMs,
          commit: () => {
            objectsSeen.add(id)
          },
        }
      }
      case 'piece:inspect':
        return event.key && policy.pieceInspect ? { kind: 'inspect-piece' } : null
      case 'player:leave-room':
        return policy.leaveRoom ? { kind: 'leave-room' } : null
      default:
        return null
    }
  }

  return {
    policy,
    decide,
    allowsKind,
    reset() {
      gamesStarted = 0
      objectsSeen.clear()
    },
  }
}
