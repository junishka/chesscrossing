/**
 * Prompt assembly. The system prompt is docs/system-prompt.md from the
 * heading "Identity" to the end, verbatim, read once. Each user turn is the
 * player's words (an ask) or nothing (an event), followed by the Current
 * state block in the exact format that document gives.
 *
 * The narrator cites; he does not evaluate. No evaluation number ever
 * reaches this file's output. A blunder or an excellent move is sent as the
 * plain event "move": the system prompt permits nothing more.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../config'
import type { NarratorContext, NarratorEventKind, NarratorRequest } from '../../src/contracts/narrator'
import type { BackendMessage } from './backends/types'

export const SYSTEM_PROMPT_FILE = join(ROOT, 'docs', 'system-prompt.md')
export const SYSTEM_PROMPT_START = '## Identity'
export const STATE_HEADING = '## Current state'

/** The front matter of the form, as the bible gives it: the first user turn of a session. */
export const FIRST_LAUNCH_LINE = 'Visitor (1), admitted under Standing Order 11. Received in Room 1.'

/** Headings under which a single-turn backend replays the conversation. */
export const HISTORY_HEADING = '## Earlier turns'
export const HISTORY_VISITOR = 'Visitor:'
export const HISTORY_NARRATOR = 'Edmund Prell:'
export const CURRENT_HEADING = '## This turn'

/**
 * Appended to the system prompt only by a backend that cannot carry history
 * as separate turns (the CLI). Defines the headings above.
 */
export const HISTORY_ADDENDUM = [
  '',
  '## Transcript form',
  '',
  `When the user turn opens with "${HISTORY_HEADING}", the exchanges under it have already happened, in order: "${HISTORY_VISITOR}" introduces the visitor's words or an event's Current state, "${HISTORY_NARRATOR}" introduces what you answered. Reply only to the part under "${CURRENT_HEADING}". Do not repeat the headings.`,
].join('\n')

let cached: string | null = null

/** The system prompt, read once from docs/system-prompt.md. */
export function loadSystemPrompt(file: string = SYSTEM_PROMPT_FILE): string {
  if (cached !== null && file === SYSTEM_PROMPT_FILE) return cached
  const text = readFileSync(file, 'utf8')
  const at = text.indexOf(SYSTEM_PROMPT_START)
  if (at < 0) throw new Error(`${file} has no "${SYSTEM_PROMPT_START}" heading`)
  const prompt = text.slice(at).replace(/\s+$/, '')
  if (file === SYSTEM_PROMPT_FILE) cached = prompt
  return prompt
}

/** Forgets the cached prompt (tests). */
export function resetSystemPromptCache(): void {
  cached = null
}

/** Whose turn it is, as the state block words it. */
export function turnLine(context: NarratorContext): string {
  const colour = context.turn === 'w' ? 'white' : 'black'
  const who = context.turn === context.playerColor ? 'visitor' : 'Mr Halm'
  return `${colour} (${who})`
}

/**
 * The last half-moves as movetext: "14. Nf3 Bc5 15. Bxf7+". A run starting on
 * a black move opens "14... Bc5". At most ten half-moves. "none" when empty.
 */
export function movetext(lastMovesSan: readonly string[], ply: number): string {
  const moves = lastMovesSan.slice(-10)
  if (moves.length === 0) return 'none'
  const firstIndex = Math.max(0, ply - moves.length)
  const parts: string[] = []
  moves.forEach((san, i) => {
    const index = firstIndex + i
    const number = Math.floor(index / 2) + 1
    if (index % 2 === 0) parts.push(`${number}. ${san}`)
    else if (i === 0) parts.push(`${number}... ${san}`)
    else parts.push(san)
  })
  return parts.join(' ')
}

/** Whether the last recorded move was a promotion. */
function lastMoveIsPromotion(context: NarratorContext): boolean {
  const last = context.lastMovesSan[context.lastMovesSan.length - 1]
  return typeof last === 'string' && last.includes('=')
}

/**
 * The Event value for the state block. Only words the system prompt lists.
 * A blunder or a good move is "move" and nothing more.
 */
export function eventLine(request: Pick<NarratorRequest, 'kind' | 'event' | 'context'>): string {
  const { context } = request
  if (request.kind === 'ask') return 'question'
  const event: NarratorEventKind | undefined = request.event
  switch (event) {
    case 'game-start':
      return 'game start'
    case 'player-move':
    case 'opponent-move':
    case 'blunder':
    case 'good-move':
      return lastMoveIsPromotion(context) ? 'promotion' : 'move'
    case 'capture':
      return lastMoveIsPromotion(context) ? 'promotion' : 'capture'
    case 'check':
      return 'check'
    case 'checkmate-for-player':
    case 'checkmate-against-player':
      return 'checkmate'
    case 'draw':
      return context.result?.outcome === 'stalemate' ? 'stalemate' : 'draw'
    case 'resignation':
      return 'resignation'
    case 'inspect-object':
    case 'inspect-piece':
      return context.inspecting ? `hover ${context.inspecting}` : 'none'
    case 'door-locked':
      return context.door ? `hover ${context.door}` : 'none'
    case 'leave-room':
      return 'leave'
    case 'first-launch':
    case 'idle':
    case undefined:
      return 'none'
  }
}

/** The Current state block, exactly as docs/system-prompt.md gives it. */
export function stateBlock(request: Pick<NarratorRequest, 'kind' | 'event' | 'context'>): string {
  const c = request.context
  return [
    STATE_HEADING,
    `FEN: ${c.fen}`,
    `Last moves (SAN): ${movetext(c.lastMovesSan, c.ply)}`,
    `Turn: ${turnLine(c)}`,
    `Room: ${c.roomName}`,
    `Event: ${eventLine(request)}`,
    `Hour: ${c.hour}`,
  ].join('\n')
}

/** The user turn: the player's words, or the front-matter line on first launch, or nothing; then the state. */
export function buildUserTurn(request: NarratorRequest): string {
  const body = request.kind === 'ask' ? (request.text ?? '').trim() : request.event === 'first-launch' ? FIRST_LAUNCH_LINE : ''
  const state = stateBlock(request)
  return body ? `${body}\n\n${state}` : state
}

/**
 * One prompt for a single-turn backend: the history under plain headings,
 * then the current turn. With no history, the current turn alone.
 */
export function flattenConversation(messages: readonly BackendMessage[]): string {
  if (messages.length === 0) return ''
  const current = messages[messages.length - 1] as BackendMessage
  const earlier = messages.slice(0, -1)
  if (earlier.length === 0) return current.content
  const lines: string[] = [HISTORY_HEADING, '']
  for (const m of earlier) {
    lines.push(m.role === 'user' ? HISTORY_VISITOR : HISTORY_NARRATOR)
    lines.push(m.content)
    lines.push('')
  }
  lines.push(CURRENT_HEADING, '', current.content)
  return lines.join('\n')
}
