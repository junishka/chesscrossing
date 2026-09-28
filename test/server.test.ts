import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import {
  AUTH_PATTERN,
  LineSplitter,
  STARTUP_PROBE_ARGS,
  buildSystemPrompt,
  classifyProbe,
  classifyVersion,
  converseArgs,
  formatTranscript,
  parseStreamLine,
  resolveModel,
  withMode,
} from '../server/claude'
import { createServer } from '../server/index'
import { findCharacter } from '../src/content/characters'
import type { ChatMessage, ConverseEvent, Health } from '../src/types'

const persona = findCharacter('second')!

// Real lines captured from `claude -p --output-format stream-json --include-partial-messages --verbose`.
const SAMPLE = [
  '{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s","tools":[],"mcp_servers":[],"model":"claude-opus-5-5"}',
  '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-5-5","role":"assistant","content":[]}},"session_id":"s"}',
  '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}},"session_id":"s"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"h"}},"session_id":"s"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ello"}},"session_id":"s"}',
  '{"type":"assistant","message":{"model":"claude-opus-5-5","role":"assistant","content":[{"type":"text","text":"hello"}]},"session_id":"s"}',
  '{"type":"stream_event","event":{"type":"content_block_stop","index":0},"session_id":"s"}',
  '{"type":"stream_event","event":{"type":"message_stop"},"session_id":"s"}',
  'not json at all',
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}',
  '{"duration_api_ms":1352,"stop_reason":"end_turn","session_id":"s","total_cost_usd":0.0053360000000000005,"is_error":false,"num_turns":1,"subtype":"success","result":"hello","type":"result","duration_ms":1400}',
]

test('formatTranscript: Player / persona lines, blank-line separated, ends with the cue', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Is my knight safe?' },
    { role: 'assistant', content: 'It is not.' },
    { role: 'user', content: '  Why?  ' },
  ]
  assert.equal(
    formatTranscript(messages, 'The Second'),
    'Player: Is my knight safe?\n\nThe Second: It is not.\n\nPlayer: Why?\n\nThe Second:',
  )
})

test('formatTranscript: keeps only the last 24 messages', () => {
  const messages: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }))
  const out = formatTranscript(messages, 'X')
  assert.ok(!out.includes('m5\n'))
  assert.ok(out.startsWith('Player: m6\n\n'))
  assert.ok(out.endsWith('X: m29\n\nX:'))
  assert.equal(out.split('\n\n').length, 25)
})

test('buildSystemPrompt: exactly the persona, then a blank line and the packet; no guard text', () => {
  const plain = buildSystemPrompt(persona)
  assert.equal(plain, persona.systemPrompt)
  assert.ok(!/Stay in character|Never mention being an AI|LIVE CONTEXT/.test(plain))
  const packet = 'STATION REPORT.  EXPEDITION 3.  MOVE 9.  14 SEPT 1965.\nFEN: 8/8/8/8/8/8/8/8 w - - 0 1'
  assert.equal(buildSystemPrompt(persona, packet), `${persona.systemPrompt}\n\n${packet}`)
  assert.equal(buildSystemPrompt(persona, '   '), persona.systemPrompt)
})

test('withMode / buildSystemPrompt: the Mode line is appended once', () => {
  assert.equal(withMode(undefined), undefined)
  assert.equal(withMode(undefined, 'REMARK'), 'Mode: REMARK')
  assert.equal(withMode('FEN: x', 'FEEDBACK'), 'FEN: x\nMode: FEEDBACK')
  const packet = 'FEN: x\nGame state: in progress.  Mode: POST-MORTEM\nQuestion, if any: "Why?"'
  assert.equal(withMode(packet, 'POST-MORTEM'), packet)
  assert.equal(buildSystemPrompt(persona, 'FEN: x', 'DISCUSSION'), `${persona.systemPrompt}\n\nFEN: x\nMode: DISCUSSION`)
  const args = converseArgs({ personaId: 'second', messages: [{ role: 'user', content: 'hi' }], context: 'FEN: x', mode: 'REMARK' }, persona)
  const prompt = args[args.indexOf('--system-prompt') + 1]
  assert.equal(prompt, `${persona.systemPrompt}\n\nFEN: x\nMode: REMARK`)
  assert.ok(args.includes('--no-session-persistence'))
  assert.equal(args[args.indexOf('--tools') + 1], '')
})

test('startup probe: the bible\'s command line, and the classifier on fake outcomes', () => {
  assert.deepEqual(STARTUP_PROBE_ARGS.slice(0, 2), ['-p', 'Reply READY.'])
  assert.equal(STARTUP_PROBE_ARGS[STARTUP_PROBE_ARGS.indexOf('--max-budget-usd') + 1], '0.02')
  assert.ok(STARTUP_PROBE_ARGS.includes('--no-session-persistence'))

  assert.equal(classifyProbe({ kind: 'spawn-error', code: 'ENOENT', message: 'spawn claude ENOENT' }), 'missing')
  assert.equal(classifyProbe({ kind: 'timeout' }), 'slow')
  const ready = '{"type":"result","subtype":"success","is_error":false,"result":"READY","total_cost_usd":0.001}'
  assert.equal(classifyProbe({ kind: 'exit', code: 0, stdout: ready, stderr: '' }), 'ok')
  assert.equal(classifyProbe({ kind: 'exit', code: 1, stdout: '', stderr: 'Not logged in. Please run /login' }), 'unauthenticated')
  assert.equal(classifyProbe({ kind: 'exit', code: 1, stdout: '', stderr: 'Invalid API key' }), 'unauthenticated')
  const isError = '{"type":"result","subtype":"error","is_error":true,"result":"Authentication failed: no credentials found"}'
  assert.equal(classifyProbe({ kind: 'exit', code: 0, stdout: isError, stderr: '' }), 'unauthenticated')
  assert.equal(classifyProbe({ kind: 'exit', code: 2, stdout: '', stderr: 'segmentation fault' }), 'unauthenticated')
  for (const sample of ['Please log in', 'please login', 'auth required', 'no credentials', 'set your API key']) {
    assert.ok(AUTH_PATTERN.test(sample), sample)
  }
  assert.ok(!AUTH_PATTERN.test('READY'))
})

test('claude --version: classified by its outcome', () => {
  assert.deepEqual(classifyVersion({ kind: 'exit', code: 0, stdout: '2.1.283 (Claude Code)\n', stderr: '' }), { version: '2.1.283 (Claude Code)' })
  assert.deepEqual(classifyVersion({ kind: 'spawn-error', code: 'ENOENT', message: 'x' }), { reason: 'missing' })
  assert.deepEqual(classifyVersion({ kind: 'timeout' }), { reason: 'slow' })
  assert.deepEqual(classifyVersion({ kind: 'exit', code: 1, stdout: '', stderr: 'boom' }), { reason: 'missing' })
})

test('resolveModel: request, then CLAUDE_MODEL, then default', () => {
  const before = process.env.CLAUDE_MODEL
  delete process.env.CLAUDE_MODEL
  assert.equal(resolveModel(), 'claude-opus-5-5')
  assert.equal(resolveModel('claude-sonnet-4-6'), 'claude-sonnet-4-6')
  process.env.CLAUDE_MODEL = 'claude-haiku-4-5'
  assert.equal(resolveModel(), 'claude-haiku-4-5')
  assert.equal(resolveModel('  '), 'claude-haiku-4-5')
  if (before === undefined) delete process.env.CLAUDE_MODEL
  else process.env.CLAUDE_MODEL = before
})

test('parseStreamLine: classifies the real sample lines', () => {
  const kinds = SAMPLE.map((l) => parseStreamLine(l))
  const deltas = kinds.filter((k) => k.kind === 'delta').map((k) => (k.kind === 'delta' ? k.text : ''))
  assert.deepEqual(deltas, ['h', 'ello'])
  const result = kinds[kinds.length - 1]
  assert.equal(result.kind, 'result')
  if (result.kind === 'result') {
    assert.equal(result.text, 'hello')
    assert.equal(result.isError, false)
    assert.ok(Math.abs((result.costUsd ?? 0) - 0.005336) < 1e-6)
    assert.equal(result.durationMs, 1400)
  }
  assert.equal(kinds.filter((k) => k.kind === 'other').length, SAMPLE.length - 3)
  assert.equal(parseStreamLine('').kind, 'other')
  assert.equal(parseStreamLine('{"type":"result","is_error":true,"result":"budget exceeded"}').kind, 'result')
})

test('LineSplitter: holds a partial line across chunk boundaries', () => {
  const text = SAMPLE.join('\n') + '\n'
  const cut = text.indexOf('"text":"ell') + 8 // inside the second delta's payload
  const a = text.slice(0, cut)
  const b = text.slice(cut, cut + 40)
  const c = text.slice(cut + 40)
  const splitter = new LineSplitter()
  const lines = [...splitter.push(a), ...splitter.push(b), ...splitter.push(c), ...splitter.flush()]
  assert.deepEqual(lines, SAMPLE)
  const deltas = lines.map(parseStreamLine).filter((k) => k.kind === 'delta')
  assert.equal(deltas.length, 2)
})

test('LineSplitter: flush returns an unterminated tail once', () => {
  const s = new LineSplitter()
  assert.deepEqual(s.push('a\nb'), ['a'])
  assert.deepEqual(s.flush(), ['b'])
  assert.deepEqual(s.flush(), [])
})

/** Reads a whole SSE response into ConverseEvents. */
async function readEvents(res: Response): Promise<ConverseEvent[]> {
  const body = await res.text()
  return body
    .split('\n\n')
    .filter((f) => f.startsWith('data:'))
    .map((f) => JSON.parse(f.slice(5).trim()) as ConverseEvent)
}

test('server: health shape, validation, and a real turn when the CLI is present', { timeout: 100_000 }, async () => {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  const base = `http://127.0.0.1:${port}`
  try {
    const health = (await (await fetch(`${base}/api/health`)).json()) as Health
    assert.equal(typeof health.ok, 'boolean')
    assert.equal(typeof health.cli, 'boolean')
    assert.equal(typeof health.model, 'string')
    assert.ok(['ok', 'missing', 'unauthenticated', 'slow'].includes(health.reason ?? ''), `reason ${health.reason}`)
    if (health.cli) assert.equal(typeof health.version, 'string')
    assert.equal(health.ok, health.cli && health.reason === 'ok')

    const cors = await fetch(`${base}/api/health`, { headers: { origin: 'http://localhost:5173' } })
    assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:5173')

    const nobody = await fetch(`${base}/api/converse`, { method: 'POST', body: '{"personaId":"nobody","messages":[{"role":"user","content":"hi"}]}' })
    assert.equal(nobody.status, 404)
    const malformed = await fetch(`${base}/api/converse`, { method: 'POST', body: '{"personaId":"second"}' })
    assert.equal(malformed.status, 400)
    const huge = await fetch(`${base}/api/converse`, { method: 'POST', body: 'x'.repeat(300 * 1024) })
    assert.equal(huge.status, 413)
    const bad = await fetch(`${base}/api/converse`, { method: 'POST', body: '{"personaId":"second","messages":[]}' })
    assert.equal(bad.status, 400)
    const badMode = await fetch(`${base}/api/converse`, { method: 'POST', body: '{"personaId":"second","messages":[{"role":"user","content":"hi"}],"mode":"LOUD"}' })
    assert.equal(badMode.status, 400)

    if (!health.ok) {
      console.log(`claude CLI not usable (${health.reason}); skipping the live converse test`)
      return
    }
    const res = await fetch(`${base}/api/converse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId: 'second', mode: 'DISCUSSION', messages: [{ role: 'user', content: 'Answer with one short sentence: are you ready?' }] }),
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers.get('content-type')?.startsWith('text/event-stream'))
    const events = await readEvents(res)
    const deltas = events.filter((e) => e.type === 'delta')
    const last = events[events.length - 1]
    assert.ok(deltas.length >= 1, `expected deltas, got ${JSON.stringify(events)}`)
    assert.equal(last.type, 'done')

    // A newer turn for the same persona displaces the running one, whose stream must end with an error
    // (not hang until the client gives up).
    const ask = (content: string) => fetch(`${base}/api/converse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId: 'second', messages: [{ role: 'user', content }] }),
    })
    const first = await ask('Count slowly from one to thirty, one number per line.')
    const firstEvents = readEvents(first)
    await new Promise((r) => setTimeout(r, 300))
    const second = await ask('Answer with one word: ready?')
    const ended = await Promise.race([
      firstEvents.then((evs) => evs[evs.length - 1]),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 15_000)),
    ])
    assert.ok(ended, 'the displaced turn should end promptly')
    assert.equal(ended?.type, 'error')
    assert.equal((await readEvents(second)).at(-1)?.type, 'done')
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
