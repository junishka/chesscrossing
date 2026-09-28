import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { HISTORY_ADDENDUM, HISTORY_HEADING } from '../prompt'
import { cliArguments, cliEnvironment, createCliBackend, parseCliLine, parseCliStream, type SpawnLike } from './cli'
import { BackendError } from './types'

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'cli-stream.ndjson'), 'utf8')

async function* chunked(text: string, size: number): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
}

async function collect(chunks: AsyncIterable<string>): Promise<{ deltas: string[]; result: unknown }> {
  const parser = parseCliStream(chunks)
  const deltas: string[] = []
  for (;;) {
    const step = await parser.next()
    if (step.done) return { deltas, result: step.value }
    deltas.push(step.value)
  }
}

describe('parseCliLine', () => {
  it('reads a text delta from a stream_event', () => {
    const line = '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ledger"}}}'
    expect(parseCliLine(line)).toEqual({ kind: 'delta', text: 'ledger' })
  })
  it('reads the result event', () => {
    expect(parseCliLine('{"type":"result","subtype":"success","is_error":false,"result":"ledger"}')).toEqual({
      kind: 'result',
      isError: false,
      text: 'ledger',
      subtype: 'success',
    })
  })
  it('ignores other lines and junk', () => {
    expect(parseCliLine('{"type":"system","subtype":"init"}')).toEqual({ kind: 'other' })
    expect(parseCliLine('{"type":"stream_event","event":{"type":"message_stop"}}')).toEqual({ kind: 'other' })
    expect(parseCliLine('not json')).toEqual({ kind: 'other' })
    expect(parseCliLine('')).toEqual({ kind: 'other' })
  })
})

describe('parseCliStream on the real fixture', () => {
  it('yields the text deltas and finishes on the result event', async () => {
    const { deltas, result } = await collect(chunked(FIXTURE, 7))
    expect(deltas.join('')).toBe('ledger')
    expect(result).toMatchObject({ kind: 'result', isError: false, subtype: 'success', text: 'ledger' })
  })
  it('does not depend on chunk boundaries', async () => {
    const whole = await collect(chunked(FIXTURE, FIXTURE.length))
    const tiny = await collect(chunked(FIXTURE, 1))
    expect(whole.deltas.join('')).toBe('ledger')
    expect(tiny.deltas.join('')).toBe('ledger')
  })
  it('returns null when the stream ends without a result', async () => {
    const withoutResult = FIXTURE.split('\n').filter((l) => l && !l.includes('"type":"result"')).join('\n') + '\n'
    const { deltas, result } = await collect(chunked(withoutResult, 50))
    expect(deltas.join('')).toBe('ledger')
    expect(result).toBeNull()
  })
})

describe('cliEnvironment and cliArguments', () => {
  it('drops CLAUDECODE and CLAUDE_CODE_* and keeps the rest', () => {
    const env = cliEnvironment({ CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_SSE_PORT: '1', PATH: '/bin', HOME: '/h', ANTHROPIC_MODEL: 'x' })
    expect(env).toEqual({ PATH: '/bin', HOME: '/h', ANTHROPIC_MODEL: 'x' })
  })
  it('passes the flags the architecture names, prompt on stdin', () => {
    const args = cliArguments({ model: 'claude-opus-5-5', effort: 'low', system: 'SYS' })
    expect(args).toEqual([
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools', '',
      '--no-session-persistence',
      '--model', 'claude-opus-5-5',
      '--effort', 'low',
      '--system-prompt', 'SYS',
    ])
  })
})

interface FakeChild {
  child: ChildProcessWithoutNullStreams
  stdinText: () => string
  finish: (stdout: string, code: number, stderr?: string) => void
}

function fakeChild(): FakeChild {
  const emitter = new EventEmitter() as EventEmitter & Record<string, unknown>
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  let received = ''
  stdin.on('data', (d: Buffer) => {
    received += d.toString('utf8')
  })
  emitter.stdout = stdout
  emitter.stderr = stderr
  emitter.stdin = stdin
  emitter.exitCode = null
  emitter.killed = false
  emitter.kill = () => {
    emitter.killed = true
    stdout.end()
    return true
  }
  return {
    child: emitter as unknown as ChildProcessWithoutNullStreams,
    stdinText: () => received,
    finish(out, code, err = '') {
      if (err) stderr.write(err)
      stdout.end(out)
      emitter.exitCode = code
      setTimeout(() => emitter.emit('close', code), 0)
    },
  }
}

describe('createCliBackend', () => {
  it('spawns the CLI with a cleaned environment, replays history in the prompt, and streams deltas', async () => {
    const fake = fakeChild()
    let spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv } | null = null
    const spawn: SpawnLike = (command, args, options) => {
      spawned = { command, args, env: options.env }
      setTimeout(() => fake.finish(FIXTURE, 0), 0)
      return fake.child
    }
    const backend = createCliBackend({ cliPath: 'claude', model: 'claude-opus-5-5', effort: 'low', spawn, env: { CLAUDECODE: '1', PATH: '/bin' } })
    const out: string[] = []
    for await (const d of backend.stream({
      system: 'SYSTEM',
      messages: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'answered' },
        { role: 'user', content: 'now' },
      ],
      signal: new AbortController().signal,
    })) {
      out.push(d)
    }
    expect(out.join('')).toBe('ledger')
    expect(spawned).not.toBeNull()
    const s = spawned as unknown as { command: string; args: string[]; env: NodeJS.ProcessEnv }
    expect(s.command).toBe('claude')
    expect(s.env).toEqual({ PATH: '/bin' })
    expect(s.args.slice(0, 3)).toEqual(['-p', '--output-format', 'stream-json'])
    expect(s.args[s.args.length - 1]).toBe('SYSTEM' + HISTORY_ADDENDUM)
    const prompt = fake.stdinText()
    expect(prompt.startsWith(HISTORY_HEADING)).toBe(true)
    expect(prompt).toContain('earlier')
    expect(prompt).toContain('answered')
    expect(prompt.endsWith('now')).toBe(true)
  })

  it('treats a non-zero exit as a retryable error', async () => {
    const fake = fakeChild()
    const spawn: SpawnLike = () => {
      setTimeout(() => fake.finish('', 1, 'Not logged in'), 0)
      return fake.child
    }
    const backend = createCliBackend({ cliPath: 'claude', model: 'm', effort: 'low', spawn, env: {} })
    const run = async (): Promise<void> => {
      for await (const _ of backend.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], signal: new AbortController().signal })) {
        void _
      }
    }
    await expect(run()).rejects.toBeInstanceOf(BackendError)
    await expect(run().catch((e: BackendError) => e.retryable)).resolves.toBe(true)
  })

  it('treats an is_error result as a retryable error', async () => {
    const fake = fakeChild()
    const spawn: SpawnLike = () => {
      setTimeout(() => fake.finish('{"type":"result","subtype":"error_during_execution","is_error":true,"result":"rate limited"}\n', 0), 0)
      return fake.child
    }
    const backend = createCliBackend({ cliPath: 'claude', model: 'm', effort: 'low', spawn, env: {} })
    const run = async (): Promise<void> => {
      for await (const _ of backend.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], signal: new AbortController().signal })) {
        void _
      }
    }
    await expect(run()).rejects.toMatchObject({ retryable: true, message: 'rate limited' })
  })

  it('kills the child when the signal aborts', async () => {
    const fake = fakeChild()
    const spawn: SpawnLike = () => fake.child
    const backend = createCliBackend({ cliPath: 'claude', model: 'm', effort: 'low', spawn, env: {} })
    const controller = new AbortController()
    const run = async (): Promise<void> => {
      for await (const _ of backend.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], signal: controller.signal })) {
        void _
      }
    }
    const p = run()
    setTimeout(() => {
      controller.abort()
      setTimeout(() => (fake.child as unknown as EventEmitter).emit('close', null), 0)
    }, 5)
    await expect(p).rejects.toMatchObject({ retryable: false })
    expect(fake.child.killed).toBe(true)
  })
})
