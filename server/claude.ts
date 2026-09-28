// The Second's voice: spawns the Claude CLI in print mode, feeds it a transcript on stdin and
// turns its stream-json output into ConverseEvents. Pure Node; no DOM, no three.
// Bible §5.11 "Bridge": no guard paragraph; the system prompt is the persona (which already
// begins with the Station Common Prompt) and the packet, and nothing else.
import { spawn, type ChildProcess } from 'node:child_process'
import type { CharacterDef, ChatMessage, ConverseEvent, ConverseRequest, Health, SecondMode } from '../src/types'

/** Model used when neither the request nor CLAUDE_MODEL names one. */
export const DEFAULT_MODEL = 'claude-opus-5-5'
/** Messages of transcript sent to the model per turn. */
export const TRANSCRIPT_WINDOW = 24
/** Hard ceiling on a single conversation turn (ms); the child is killed afterwards. */
export const CONVERSE_TIMEOUT_MS = 120_000
/** Ceiling on the startup probe, `claude -p "Reply READY."` (ms). */
export const STARTUP_PROBE_TIMEOUT_MS = 20_000
/** Ceiling on `claude --version` (ms). */
export const VERSION_TIMEOUT_MS = 5_000
/** How long a `claude --version` result is trusted (ms): health runs it at most once a minute. */
export const VERSION_CACHE_MS = 60_000
/** Budget ceiling for the startup probe (USD). */
export const STARTUP_PROBE_BUDGET = '0.02'

const CLI = process.env.CLAUDE_BIN || 'claude'

/** The bible's condition names for the Second's line; the client adds 'unreachable' when the port does not answer. */
export type HealthReason = 'ok' | 'missing' | 'unauthenticated' | 'slow' | 'unreachable'

/** Pattern the bible gives for a CLI that is installed but not signed in. */
export const AUTH_PATTERN = /log ?in|auth|credential|api key/i

/** Resolves the model for a turn: the request, then CLAUDE_MODEL, then the default. */
export function resolveModel(requested?: string): string {
  const fromRequest = requested?.trim()
  if (fromRequest) return fromRequest
  const fromEnv = process.env.CLAUDE_MODEL?.trim()
  return fromEnv || DEFAULT_MODEL
}

const MODE_LINE = /^.*\bMode: [A-Z-]+\s*$/m

/**
 * The packet with its Mode line: when a mode is given and the context does not already carry
 * a `Mode: <mode>` line, `\nMode: <mode>` is appended. Without a context the Mode line stands alone.
 */
export function withMode(context: string | undefined, mode?: SecondMode): string | undefined {
  const packet = context?.trim() ?? ''
  if (!mode) return packet || undefined
  if (MODE_LINE.test(packet)) return packet
  return packet ? `${packet}\nMode: ${mode}` : `Mode: ${mode}`
}

/**
 * The system prompt exactly as the bible orders it: the persona's prompt (which begins with the
 * Station Common Prompt), then a blank line and the packet when there is one. No other text.
 */
export function buildSystemPrompt(persona: CharacterDef, context?: string, mode?: SecondMode): string {
  const packet = withMode(context, mode)
  return packet ? `${persona.systemPrompt}\n\n${packet}` : persona.systemPrompt
}

/** The last 24 messages as a playscript, ending with the persona's empty cue line. */
export function formatTranscript(messages: ChatMessage[], personaName: string): string {
  const window = messages.slice(-TRANSCRIPT_WINDOW)
  const lines = window.map((m) => `${m.role === 'user' ? 'Player' : personaName}: ${m.content.trim()}`)
  lines.push(`${personaName}:`)
  return lines.join('\n\n')
}

/** What one stdout line of `claude --output-format stream-json` means to us. */
export type StreamLine =
  | { kind: 'delta'; text: string }
  | { kind: 'result'; text: string; costUsd?: number; durationMs?: number; isError: boolean }
  | { kind: 'other' }

interface RawLine {
  type?: unknown
  event?: { type?: unknown; delta?: { type?: unknown; text?: unknown } }
  result?: unknown
  total_cost_usd?: unknown
  duration_ms?: unknown
  is_error?: unknown
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Classifies one line of CLI output; anything that is not JSON we care about is `other`. */
export function parseStreamLine(line: string): StreamLine {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return { kind: 'other' }
  let raw: RawLine
  try {
    raw = JSON.parse(trimmed) as RawLine
  } catch {
    return { kind: 'other' }
  }
  if (raw.type === 'stream_event') {
    const ev = raw.event
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
      return { kind: 'delta', text: ev.delta.text }
    }
    return { kind: 'other' }
  }
  if (raw.type === 'result') {
    return {
      kind: 'result',
      text: typeof raw.result === 'string' ? raw.result : '',
      costUsd: asNumber(raw.total_cost_usd),
      durationMs: asNumber(raw.duration_ms),
      isError: raw.is_error === true,
    }
  }
  return { kind: 'other' }
}

/** Splits a byte stream into lines, holding a partial line across chunk boundaries. */
export class LineSplitter {
  private rest = ''

  /** Returns the complete lines contained in the stream so far, consuming them. */
  push(chunk: string): string[] {
    const text = this.rest + chunk
    const parts = text.split('\n')
    this.rest = parts.pop() ?? ''
    return parts
  }

  /** Returns whatever partial line remains (the stream ended without a newline). */
  flush(): string[] {
    const tail = this.rest
    this.rest = ''
    return tail.length ? [tail] : []
  }
}

/** A subprocess environment without the markers that make the CLI think it is nested. */
export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  return env
}

// ───────────────────────────── Running a command ─────────────────────────────

/** How a spawned CLI command ended. */
export type Outcome =
  | { kind: 'spawn-error'; code?: string; message: string }
  | { kind: 'timeout' }
  | { kind: 'exit'; code: number | null; stdout: string; stderr: string }

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

function spawnError(err: unknown): Outcome {
  return { kind: 'spawn-error', code: errorCode(err), message: err instanceof Error ? err.message : String(err) }
}

/** Runs the CLI once with `args`, collecting its output, killing it after `timeoutMs`. */
function run(args: string[], timeoutMs: number): Promise<Outcome> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(CLI, args, { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve(spawnError(err))
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (o: Outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(o)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ kind: 'timeout' })
    }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-4000) })
    child.on('error', (err) => finish(spawnError(err)))
    child.on('close', (code) => finish({ kind: 'exit', code, stdout, stderr }))
  })
}

// ───────────────────────────── The startup probe ─────────────────────────────

/** The `--output-format json` result of the startup probe, as far as we read it. */
interface ProbeJson {
  is_error?: unknown
  result?: unknown
}

/**
 * Classifies the startup probe (§5.11): ENOENT is 'missing'; a non-zero exit or an `is_error`
 * result whose stderr or result matches the sign-in pattern is 'unauthenticated'; a timeout is
 * 'slow'; a clean exit is 'ok'. A failure that matches nothing is still a CLI that is present
 * and cannot answer, and is reported as 'unauthenticated', the nearest of the bible's conditions.
 */
export function classifyProbe(outcome: Outcome): HealthReason {
  if (outcome.kind === 'spawn-error') return outcome.code === 'ENOENT' ? 'missing' : 'unauthenticated'
  if (outcome.kind === 'timeout') return 'slow'
  let parsed: ProbeJson | undefined
  const body = outcome.stdout.trim()
  if (body.startsWith('{')) {
    try {
      parsed = JSON.parse(body) as ProbeJson
    } catch {
      parsed = undefined
    }
  }
  const isError = parsed?.is_error === true
  if (outcome.code === 0 && !isError) return 'ok'
  const text = `${outcome.stderr}\n${typeof parsed?.result === 'string' ? parsed.result : ''}`
  if (AUTH_PATTERN.test(text)) return 'unauthenticated'
  // Present, exited, and gave no sign-in message: still a CLI that cannot be consulted.
  return 'unauthenticated'
}

/** Arguments of the startup probe, exactly as the bible gives them, plus the JSON output format. */
export const STARTUP_PROBE_ARGS = [
  '-p', 'Reply READY.',
  '--max-budget-usd', STARTUP_PROBE_BUDGET,
  '--tools', '',
  '--no-session-persistence',
  '--output-format', 'json',
]

let startup: Promise<HealthReason> | undefined

/**
 * The startup probe: `claude -p "Reply READY."` once per process with a 20 s timeout. Its
 * classification is remembered for the life of the server; later calls return it at once.
 */
export function startupProbe(): Promise<HealthReason> {
  if (!startup) startup = run(STARTUP_PROBE_ARGS, STARTUP_PROBE_TIMEOUT_MS).then(classifyProbe)
  return startup
}

// ───────────────────────────── claude --version ─────────────────────────────

/** What `claude --version` said, when it did. */
export interface Version { version?: string; reason?: 'missing' | 'slow' | 'unauthenticated' }

/** Reads the first line of `claude --version` output as the version string. */
export function classifyVersion(outcome: Outcome): Version {
  if (outcome.kind === 'spawn-error') return { reason: outcome.code === 'ENOENT' ? 'missing' : 'unauthenticated' }
  if (outcome.kind === 'timeout') return { reason: 'slow' }
  const version = outcome.stdout.trim().split('\n')[0] ?? ''
  if (outcome.code === 0 && version) return { version }
  return { reason: 'missing' }
}

let versionCache: { at: number; result: Version } | undefined
let versionInFlight: Promise<Version> | undefined

/** `claude --version`, at most once a minute; concurrent callers share one run. */
export function version(): Promise<Version> {
  const now = Date.now()
  if (versionCache && now - versionCache.at < VERSION_CACHE_MS) return Promise.resolve(versionCache.result)
  if (!versionInFlight) {
    versionInFlight = run(['--version'], VERSION_TIMEOUT_MS).then((outcome) => {
      const result = classifyVersion(outcome)
      versionCache = { at: Date.now(), result }
      versionInFlight = undefined
      return result
    })
  }
  return versionInFlight
}

/**
 * Health of the Second's line, for GET /api/health: the startup probe's verdict (taken once) and
 * `claude --version` (taken at most once a minute). `ok` when both pass; `reason` is always set.
 */
export async function probe(): Promise<Health> {
  const model = resolveModel()
  const [startupReason, v] = await Promise.all([startupProbe(), version()])
  const cli = v.version !== undefined
  const reason: HealthReason = !cli ? (v.reason ?? 'missing') : startupReason
  return { ok: cli && startupReason === 'ok', cli, version: v.version, model, reason }
}

// ───────────────────────────── Conversation ─────────────────────────────

/** Handle on a running conversation turn. */
export interface ConverseHandle {
  /** Kills the child. `reason` (when given) is delivered to the listener as an error event. */
  abort(reason?: string): void
}

/** Message delivered to a turn that a newer turn for the same persona displaced. */
export const REPLACED_MESSAGE = 'A newer question arrived; this answer was set aside.'
/** Grace period after the result line before a lingering child is killed (ms). */
const EXIT_GRACE_MS = 5_000

const active = new Map<string, ConverseHandle>()

function describeError(err: unknown): string {
  if (errorCode(err) === 'ENOENT') return 'The command "claude" was not found on this machine.'
  return err instanceof Error ? err.message : String(err)
}

/** The CLI arguments for one turn: the bible's Bridge line, with the model and the stream flags. */
export function converseArgs(req: ConverseRequest, persona: CharacterDef): string[] {
  return [
    '-p',
    '--model', resolveModel(req.model),
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--system-prompt', buildSystemPrompt(persona, req.context, req.mode),
    '--tools', '',
    '--no-session-persistence',
    '--max-budget-usd', '1.00',
    '--permission-mode', 'dontAsk',
  ]
}

/** One attempt at a turn. `onEmpty` is consulted when the CLI finishes with zero characters. */
interface Attempt {
  abort(): void
}

function attempt(
  req: ConverseRequest,
  persona: CharacterDef,
  emit: (e: ConverseEvent) => void,
  onEmpty: () => boolean,
): Attempt {
  const args = converseArgs(req, persona)
  let child: ChildProcess
  try {
    child = spawn(CLI, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    queueMicrotask(() => emit({ type: 'error', message: describeError(err) }))
    return { abort() { /* nothing started */ } }
  }

  let finished = false
  let sawDelta = false
  let stderr = ''
  const done = () => {
    finished = true
    clearTimeout(killer)
    // The CLI exits on its own after the result line; make sure it cannot linger.
    if (child.exitCode === null && child.signalCode === null) {
      setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }, EXIT_GRACE_MS).unref()
    }
  }
  const end = (e: ConverseEvent) => {
    if (finished) return
    done()
    emit(e)
  }
  const killer = setTimeout(() => {
    child.kill('SIGKILL')
    end({ type: 'error', message: 'The Second took too long to answer (120s).' })
  }, CONVERSE_TIMEOUT_MS)

  const splitter = new LineSplitter()
  const handleLine = (line: string) => {
    if (finished) return
    const parsed = parseStreamLine(line)
    if (parsed.kind === 'delta') {
      if (parsed.text) sawDelta = true
      emit({ type: 'delta', text: parsed.text })
    } else if (parsed.kind === 'result') {
      if (parsed.isError) {
        end({ type: 'error', message: shortMessage(parsed.text || stderr || 'The CLI reported an error.') })
        return
      }
      if (!sawDelta && parsed.text) {
        sawDelta = true
        emit({ type: 'delta', text: parsed.text })
      }
      if (!sawDelta && onEmpty()) {
        // The reply was empty. She is asked again; this attempt ends without a word to the listener.
        done()
        return
      }
      end({ type: 'done', costUsd: parsed.costUsd, durationMs: parsed.durationMs })
    }
  }

  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { for (const line of splitter.push(chunk)) handleLine(line) })
  child.stdout?.on('end', () => { for (const line of splitter.flush()) handleLine(line) })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000) })
  child.on('error', (err) => end({ type: 'error', message: describeError(err) }))
  child.on('close', (code) => {
    if (finished) return
    if (code === 0) {
      if (!sawDelta && onEmpty()) { done(); return }
      end({ type: 'done' })
    } else {
      end({ type: 'error', message: shortMessage(stderr || `claude exited with code ${code ?? 'null'}`) })
    }
  })

  const stdin = child.stdin
  if (stdin) {
    stdin.on('error', () => { /* the child went away; close reports it */ })
    stdin.end(formatTranscript(req.messages, persona.name))
  }
  return {
    abort() {
      if (finished) return
      finished = true
      clearTimeout(killer)
      child.kill('SIGKILL')
    },
  }
}

/**
 * Runs one turn of conversation with a persona through the CLI and streams events back.
 * One turn per persona at a time: a new call aborts the previous one for the same persona.
 * A `done` with zero characters is retried once, silently, with the same request; if the
 * second attempt is also empty, `done` is delivered so the client can say SAID NOTHING.
 */
export function converse(
  req: ConverseRequest,
  persona: CharacterDef,
  onEvent: (e: ConverseEvent) => void,
): ConverseHandle {
  active.get(persona.id)?.abort(REPLACED_MESSAGE)

  let finished = false
  let retried = false
  let current: Attempt
  const emit = (e: ConverseEvent) => {
    if (finished) return
    if (e.type !== 'delta') {
      finished = true
      if (active.get(persona.id) === handle) active.delete(persona.id)
    }
    onEvent(e)
  }
  const onEmpty = (): boolean => {
    if (retried || finished) return false
    retried = true
    current = attempt(req, persona, emit, onEmpty)
    return true
  }
  const handle: ConverseHandle = {
    abort(reason?: string) {
      if (finished) return
      finished = true
      if (active.get(persona.id) === handle) active.delete(persona.id)
      current.abort()
      if (reason) onEvent({ type: 'error', message: reason })
    },
  }
  current = attempt(req, persona, emit, onEmpty)
  active.set(persona.id, handle)
  return handle
}

function shortMessage(text: string): string {
  const line = text.trim().split('\n').filter(Boolean).pop() ?? 'Unknown error'
  return line.length > 200 ? `${line.slice(0, 197)}...` : line
}
