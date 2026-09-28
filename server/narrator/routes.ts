/**
 * The narrator's three routes. docs/architecture.md, "Narrator protocol".
 *   GET  /api/narrator/health  -> NarratorHealth
 *   POST /api/narrator/stream  -> server-sent events of NarratorStreamEvent
 *   POST /api/narrator/reset   -> { ok: true }
 *
 * The stream route validates the body, builds the user turn with the Current
 * state block, streams the backend, holds back deltas while the reply may
 * still be silence, and ends with `done` (or `error`). The backend is aborted
 * when the browser goes away. History is appended only after a complete
 * reply.
 */
import type { IncomingMessage } from 'node:http'
import {
  NARRATOR_HEALTH_PATH,
  NARRATOR_RESET_PATH,
  NARRATOR_STREAM_PATH,
  SILENCE_TOKEN,
  type NarratorContext,
  type NarratorEventKind,
  type NarratorHealth,
  type NarratorRequest,
  type NarratorStreamEvent,
} from '../../src/contracts/narrator'
import { config } from '../config'
import { openSse, readJson, sendJson, type Router } from '../router'
import { createBackend } from './backends'
import { BackendError, type Backend } from './backends/types'
import { buildUserTurn, loadSystemPrompt } from './prompt'
import { createSessions, type Sessions } from './sessions'
import { mayStillBeSilence, normalizeReply, stripLeadingDash } from './silence'

export const EVENT_KINDS: readonly NarratorEventKind[] = [
  'first-launch',
  'game-start',
  'player-move',
  'opponent-move',
  'capture',
  'check',
  'checkmate-for-player',
  'checkmate-against-player',
  'draw',
  'resignation',
  'blunder',
  'good-move',
  'inspect-object',
  'inspect-piece',
  'door-locked',
  'leave-room',
  'idle',
]

export interface NarratorRouteOptions {
  backend?: Backend
  sessions?: Sessions
  /** The system prompt. Default: docs/system-prompt.md from "Identity". */
  system?: string
  /** Logger for failures. Default console.error. */
  log?: (message: string, err?: unknown) => void
}

const isString = (v: unknown): v is string => typeof v === 'string'
const isColor = (v: unknown): v is 'w' | 'b' => v === 'w' || v === 'b'

/** Checks a request body. Returns the reason it is bad, or null. */
export function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'body must be an object'
  const b = body as Record<string, unknown>
  if (!isString(b.sessionId) || !b.sessionId.trim()) return 'sessionId is required'
  if (b.sessionId.length > 200) return 'sessionId is too long'
  if (b.kind !== 'ask' && b.kind !== 'event') return 'kind must be ask or event'
  if (b.kind === 'ask' && (!isString(b.text) || !b.text.trim())) return 'text is required for an ask'
  if (b.kind === 'ask' && (b.text as string).length > 4000) return 'text is too long'
  if (b.kind === 'event' && !EVENT_KINDS.includes(b.event as NarratorEventKind)) return 'event is not a known kind'
  const c = b.context
  if (!c || typeof c !== 'object') return 'context is required'
  const ctx = c as Record<string, unknown>
  if (!isString(ctx.fen)) return 'context.fen is required'
  if (!isString(ctx.pgn)) return 'context.pgn is required'
  if (!Array.isArray(ctx.lastMovesSan) || !ctx.lastMovesSan.every(isString)) return 'context.lastMovesSan must be strings'
  if (!isColor(ctx.turn)) return 'context.turn must be w or b'
  if (!isColor(ctx.playerColor)) return 'context.playerColor must be w or b'
  if (ctx.gameStatus !== 'idle' && ctx.gameStatus !== 'playing' && ctx.gameStatus !== 'over') return 'context.gameStatus is invalid'
  if (typeof ctx.ply !== 'number' || !Number.isFinite(ctx.ply) || ctx.ply < 0) return 'context.ply must be a number'
  if (!isString(ctx.roomId) || !isString(ctx.roomName) || !isString(ctx.hour)) return 'context.roomId, roomName and hour are required'
  for (const key of ['inspecting', 'door'] as const) {
    if (ctx[key] !== undefined && !isString(ctx[key])) return `context.${key} must be a string`
  }
  return null
}

/** Narrows a validated body to the request type, keeping only the fields the prompt uses. */
export function toRequest(body: Record<string, unknown>): NarratorRequest {
  const ctx = body.context as Record<string, unknown>
  const context: NarratorContext = {
    fen: ctx.fen as string,
    pgn: ctx.pgn as string,
    lastMovesSan: (ctx.lastMovesSan as string[]).slice(-10),
    turn: ctx.turn as 'w' | 'b',
    playerColor: ctx.playerColor as 'w' | 'b',
    gameStatus: ctx.gameStatus as NarratorContext['gameStatus'],
    ply: ctx.ply as number,
    roomId: ctx.roomId as string,
    roomName: ctx.roomName as string,
    hour: ctx.hour as string,
  }
  if (ctx.result && typeof ctx.result === 'object') context.result = ctx.result as NarratorContext['result']
  if (isString(ctx.inspecting)) context.inspecting = ctx.inspecting
  if (isString(ctx.door)) context.door = ctx.door
  if (isString(ctx.lastMoveClassification)) context.lastMoveClassification = ctx.lastMoveClassification as NarratorContext['lastMoveClassification']
  const request: NarratorRequest = { sessionId: body.sessionId as string, kind: body.kind as 'ask' | 'event', context }
  if (request.kind === 'ask') request.text = body.text as string
  else request.event = body.event as NarratorEventKind
  return request
}

export function registerNarratorRoutes(router: Router, options: NarratorRouteOptions = {}): void {
  const backend = options.backend ?? createBackend(config.narrator)
  const sessions = options.sessions ?? createSessions(config.narrator.historyTurns)
  const log = options.log ?? ((message: string, err?: unknown) => console.error(`[narrator] ${message}`, err ?? ''))
  let system: string | null = options.system ?? null
  const getSystem = (): string => {
    if (system === null) system = loadSystemPrompt()
    return system
  }

  router.get(NARRATOR_HEALTH_PATH, async (_req, res) => {
    let health: NarratorHealth
    try {
      health = await backend.health()
    } catch (err) {
      health = { ok: false, backend: backend.name, model: config.narrator.model, detail: err instanceof Error ? err.message : 'health check failed' }
    }
    sendJson(res, 200, health)
  })

  router.post(NARRATOR_STREAM_PATH, async (req, res) => {
    let body: unknown
    try {
      body = await readJson(req)
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'bad json' })
      return
    }
    const problem = validateRequest(body)
    if (problem) {
      sendJson(res, 400, { error: problem })
      return
    }
    const request = toRequest(body as Record<string, unknown>)

    const sse = openSse(req, res)
    const send = (event: NarratorStreamEvent): void => sse.send(event)
    const controller = new AbortController()
    const onClose = (): void => controller.abort()
    ;(req as IncomingMessage).on('close', onClose)

    const userTurn = buildUserTurn(request)
    const messages = [...sessions.history(request.sessionId), { role: 'user' as const, content: userTurn }]

    let full = ''
    let holding = true
    try {
      for await (const delta of backend.stream({ system: getSystem(), messages, signal: controller.signal })) {
        if (controller.signal.aborted) break
        full += delta
        if (holding) {
          if (mayStillBeSilence(full)) continue
          holding = false
          send({ type: 'delta', text: stripLeadingDash(full) })
          continue
        }
        send({ type: 'delta', text: delta })
      }
      if (controller.signal.aborted) return
      const reply = normalizeReply(full)
      const done: NarratorStreamEvent = { type: 'done', text: reply.text, silent: reply.silent }
      const health = backend.name === 'mock' ? null : config.narrator.model
      if (health) done.model = health
      send(done)
      sessions.append(request.sessionId, userTurn, reply.silent ? SILENCE_TOKEN : reply.text)
    } catch (err) {
      if (controller.signal.aborted) return
      const retryable = err instanceof BackendError ? err.retryable : true
      const message = err instanceof Error ? err.message : 'The narrator could not be reached.'
      log(`stream failed for ${request.sessionId}: ${message}`, err instanceof BackendError ? undefined : err)
      send({ type: 'error', message, retryable })
    } finally {
      req.off('close', onClose)
      sse.close()
    }
  })

  router.post(NARRATOR_RESET_PATH, async (req, res) => {
    let body: unknown
    try {
      body = await readJson(req)
    } catch {
      sendJson(res, 400, { error: 'bad json' })
      return
    }
    const sessionId = body && typeof body === 'object' ? (body as Record<string, unknown>).sessionId : undefined
    if (!isString(sessionId) || !sessionId.trim()) {
      sendJson(res, 400, { error: 'sessionId is required' })
      return
    }
    sessions.reset(sessionId)
    sendJson(res, 200, { ok: true })
  })
}
