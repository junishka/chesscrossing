/**
 * The Claude CLI backend: `claude -p` in stream-json mode. The CLI is
 * single-turn, so the conversation is replayed inside the prompt under the
 * headings docs/system-prompt.md is told about (prompt.ts). The CLI refuses
 * to run inside another Claude Code session, so CLAUDECODE and every
 * CLAUDE_CODE_* variable are removed from its environment.
 *
 * Output is newline-delimited JSON. Text arrives as
 *   { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }
 * and the turn ends with { type: 'result', subtype: 'success' | ..., is_error }.
 * fixtures/cli-stream.ndjson is a real capture.
 */
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { NarratorHealth } from '../../../src/contracts/narrator'
import type { Effort } from '../../config'
import { HISTORY_ADDENDUM, flattenConversation } from '../prompt'
import { BackendError, type Backend, type BackendInput } from './types'

export type CliEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'result'; isError: boolean; text: string; subtype: string }
  | { kind: 'other' }

/** A spawn function with the shape of node:child_process.spawn that the backend needs. Injectable for tests. */
export type SpawnLike = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; stdio: ['pipe', 'pipe', 'pipe'] }) => ChildProcessWithoutNullStreams

export interface CliBackendOptions {
  cliPath: string
  model: string
  effort: Effort
  spawn?: SpawnLike
  env?: NodeJS.ProcessEnv
}

/** A copy of the environment without the variables that make the CLI refuse to nest. */
export function cliEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) continue
    copy[key] = value
  }
  return copy
}

/** The CLI's arguments. The prompt itself goes on stdin. */
export function cliArguments(options: { model: string; effort: Effort; system: string }): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--tools',
    '',
    '--no-session-persistence',
    '--model',
    options.model,
    '--effort',
    options.effort,
    '--system-prompt',
    options.system,
  ]
}

/** Classifies one line of the CLI's output. Lines that are not JSON are ignored. */
export function parseCliLine(line: string): CliEvent {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'other' }
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return { kind: 'other' }
  }
  if (!obj || typeof obj !== 'object') return { kind: 'other' }
  const o = obj as Record<string, unknown>
  if (o.type === 'stream_event') {
    const event = o.event as Record<string, unknown> | undefined
    if (event?.type === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') return { kind: 'delta', text: delta.text }
    }
    return { kind: 'other' }
  }
  if (o.type === 'result') {
    return {
      kind: 'result',
      isError: o.is_error === true,
      text: typeof o.result === 'string' ? o.result : '',
      subtype: typeof o.subtype === 'string' ? o.subtype : '',
    }
  }
  return { kind: 'other' }
}

/**
 * Splits a byte stream into lines and yields text deltas until the result
 * event. Returns the result event, or null if the stream ended without one.
 */
export async function* parseCliStream(chunks: AsyncIterable<Buffer | string>): AsyncGenerator<string, Extract<CliEvent, { kind: 'result' }> | null> {
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      const ev = parseCliLine(line)
      if (ev.kind === 'delta') yield ev.text
      else if (ev.kind === 'result') return ev
      nl = buffer.indexOf('\n')
    }
  }
  if (buffer.trim()) {
    const ev = parseCliLine(buffer)
    if (ev.kind === 'delta') yield ev.text
    else if (ev.kind === 'result') return ev
  }
  return null
}

export function createCliBackend(options: CliBackendOptions): Backend {
  const spawn: SpawnLike = options.spawn ?? (nodeSpawn as unknown as SpawnLike)
  const env = cliEnvironment(options.env ?? process.env)

  return {
    name: 'cli',

    health(): Promise<NarratorHealth> {
      return new Promise((resolve) => {
        const base: NarratorHealth = { ok: false, backend: 'cli', model: options.model }
        let child: ChildProcessWithoutNullStreams
        try {
          child = spawn(options.cliPath, ['--version'], { env, stdio: ['pipe', 'pipe', 'pipe'] })
        } catch (err) {
          resolve({ ...base, detail: err instanceof Error ? err.message : 'could not spawn the CLI' })
          return
        }
        let out = ''
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString('utf8')
        })
        child.on('error', (err) => resolve({ ...base, detail: err.message }))
        child.on('close', (code) => {
          if (code === 0) resolve({ ...base, ok: true, detail: out.trim() || undefined })
          else resolve({ ...base, detail: `${options.cliPath} --version exited with ${code}` })
        })
        child.stdin.end()
      })
    },

    async *stream(input: BackendInput): AsyncIterable<string> {
      const system = input.system + HISTORY_ADDENDUM
      const prompt = flattenConversation(input.messages)
      const args = cliArguments({ model: options.model, effort: options.effort, system })

      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(options.cliPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (err) {
        throw new BackendError(err instanceof Error ? err.message : 'could not spawn the CLI', true)
      }

      let stderr = ''
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString('utf8')
      })
      const exit = new Promise<number | null>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (code) => resolve(code))
      })
      const onAbort = (): void => {
        child.kill()
      }
      if (input.signal.aborted) {
        child.kill()
        throw new BackendError('The request was abandoned.', false)
      }
      input.signal.addEventListener('abort', onAbort, { once: true })

      try {
        child.stdin.on('error', () => {})
        child.stdin.end(prompt)
        const parser = parseCliStream(child.stdout)
        let result: Extract<CliEvent, { kind: 'result' }> | null = null
        for (;;) {
          const step = await parser.next()
          if (step.done) {
            result = step.value
            break
          }
          yield step.value
        }
        const code = await exit
        if (input.signal.aborted) throw new BackendError('The request was abandoned.', false)
        if (result?.isError) throw new BackendError(result.text || `The CLI reported ${result.subtype || 'an error'}.`, true)
        if (code !== 0) throw new BackendError(`The CLI exited with ${code}. ${stderr.trim()}`.trim(), true)
        if (!result) throw new BackendError('The CLI ended without a result.', true)
      } catch (err) {
        if (err instanceof BackendError) throw err
        throw new BackendError(err instanceof Error ? err.message : 'The CLI failed.', true)
      } finally {
        input.signal.removeEventListener('abort', onAbort)
        if (child.exitCode === null && !child.killed) child.kill()
      }
    },
  }
}
