// The Second: a small local server that lets the game talk to Claude through the Claude CLI.
// GET /api/health, POST /api/converse (SSE); in production it also serves dist/.
import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { pipeline } from 'node:stream'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConverseEvent, ConverseRequest, SecondMode } from '../src/types'
import { findCharacter } from '../src/content/characters'
import { converse, probe, resolveModel, startupProbe, version } from './claude'

/** Port the server listens on (PORT env, default 4664). */
export const PORT = Number(process.env.PORT || 4664)
const BODY_LIMIT = 256 * 1024
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
const DIST = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const PRODUCTION = process.env.NODE_ENV === 'production'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function cors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'Origin')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

class BodyTooLarge extends Error {
  constructor() { super('body too large') }
}

/** Reads the request body up to BODY_LIMIT; past it the rest is drained so the reply can still be sent. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > BODY_LIMIT) {
      reject(new BodyTooLarge())
      req.resume()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    let over = false
    req.on('data', (chunk: Buffer) => {
      if (over) return
      size += chunk.length
      if (size > BODY_LIMIT) {
        over = true
        chunks.length = 0
        reject(new BodyTooLarge())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { if (!over) resolvePromise(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

const MODES: ReadonlySet<string> = new Set<SecondMode>(['FEEDBACK', 'DISCUSSION', 'POST-MORTEM', 'REMARK'])

function isMode(v: unknown): v is SecondMode {
  return typeof v === 'string' && MODES.has(v)
}

function isChatMessage(v: unknown): v is ConverseRequest['messages'][number] {
  if (!v || typeof v !== 'object') return false
  const m = v as { role?: unknown; content?: unknown }
  return (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
}

/** Validates a JSON body into a ConverseRequest (personaId, messages, and optional mode, context, model). */
function parseConverseRequest(text: string): { req: ConverseRequest } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: 'body is not JSON' }
  }
  if (!raw || typeof raw !== 'object') return { error: 'body must be an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.personaId !== 'string' || !r.personaId) return { error: 'personaId is required' }
  if (!Array.isArray(r.messages) || !r.messages.every(isChatMessage)) return { error: 'messages must be an array of {role, content}' }
  if (r.messages.length === 0) return { error: 'messages must not be empty' }
  if (r.context !== undefined && typeof r.context !== 'string') return { error: 'context must be a string' }
  if (r.model !== undefined && typeof r.model !== 'string') return { error: 'model must be a string' }
  if (r.mode !== undefined && !isMode(r.mode)) return { error: 'mode must be FEEDBACK, DISCUSSION, POST-MORTEM or REMARK' }
  return { req: { personaId: r.personaId, messages: r.messages, context: r.context, model: r.model, mode: r.mode } }
}

async function handleConverse(req: http.IncomingMessage, res: http.ServerResponse): Promise<string> {
  let body: string
  try {
    body = await readBody(req)
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      res.setHeader('connection', 'close')
      sendJson(res, 413, { error: err.message })
      return '413'
    }
    if (!res.destroyed) sendJson(res, 400, { error: err instanceof Error ? err.message : 'bad body' })
    return '400 body'
  }
  const parsed = parseConverseRequest(body)
  if ('error' in parsed) {
    sendJson(res, 400, { error: parsed.error })
    return `400 ${parsed.error}`
  }
  const persona = findCharacter(parsed.req.personaId)
  if (!persona) {
    sendJson(res, 404, { error: `unknown persona '${parsed.req.personaId}'` })
    return '404 persona'
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.flushHeaders()

  const write = (e: ConverseEvent) => {
    if (res.writableEnded || res.destroyed) return
    res.write(`data: ${JSON.stringify(e)}\n\n`)
    if (e.type !== 'delta') res.end()
  }
  const handle = converse(parsed.req, persona, write)
  // The client went away mid-stream: stop paying for the answer.
  res.on('close', () => { if (!res.writableEnded) handle.abort() })
  return `200 sse ${persona.id}`
}

/** Maps a URL path onto dist/; undefined when it is malformed or would leave dist/. */
function safeDistPath(urlPath: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return undefined
  }
  if (decoded.includes('\0')) return undefined
  const full = resolve(join(DIST, normalize(decoded)))
  if (full !== DIST && !full.startsWith(DIST + sep)) return undefined
  return full
}

/** Serves a built file from dist/, falling back to index.html for SPA routes. */
function serveStatic(urlPath: string, method: string, res: http.ServerResponse): string {
  const candidate = safeDistPath(urlPath)
  if (!candidate) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); res.end('bad path')
    return '400 path'
  }
  let file = candidate
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html')
    statSync(file)
  } catch {
    file = join(DIST, 'index.html')
  }
  let size: number
  try {
    size = statSync(file).size
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('dist/ is not built. Run npm run build.')
    return '404 no dist'
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const immutable = file.includes(`${sep}assets${sep}`)
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (method === 'HEAD') {
    res.end()
    return `200 ${type.split(';')[0]} head`
  }
  // pipeline (not pipe) closes the file on a client disconnect and turns a read error into a dropped socket
  // instead of an uncaught exception.
  pipeline(createReadStream(file), res, (err) => { if (err && !res.destroyed) res.destroy() })
  return `200 ${type.split(';')[0]}`
}

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<string> {
  const url = req.url ?? '/'
  const path = url.split('?')[0] ?? '/'
  cors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end()
    return '204'
  }
  if (path === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, await probe())
    return '200'
  }
  if (path === '/api/converse' && req.method === 'POST') return handleConverse(req, res)
  if (path.startsWith('/api/')) {
    sendJson(res, 404, { error: 'no such endpoint' })
    return '404'
  }
  if (PRODUCTION && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(path, req.method, res)
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('The Second serves /api/health and /api/converse.')
  return '404'
}

/** Creates the HTTP server (not yet listening); tests bind it to a random port. */
export function createServer(): http.Server {
  return http.createServer((req, res) => {
    const started = Date.now()
    route(req, res)
      .then((note) => console.log(`${req.method} ${req.url} ${note} ${Date.now() - started}ms`))
      .catch((err: unknown) => {
        console.error(`${req.method} ${req.url} failed`, err)
        if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
        else if (!res.writableEnded) res.end()
      })
  })
}

async function main(): Promise<void> {
  // The startup probe runs once, before the port opens; health reports its verdict thereafter.
  const [reason, v] = await Promise.all([startupProbe(), version()])
  const server = createServer()
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is taken. Set PORT to another one.`)
    else console.error('The Second could not start:', err.message)
    process.exit(1)
  })
  server.listen(PORT, '127.0.0.1', () => {
    const cli = v.version ? `${v.version}, probe ${reason}` : `not found, ${v.reason ?? 'missing'}`
    console.log(`The Second is listening on http://127.0.0.1:${PORT} (model ${resolveModel()}, cli ${cli})`)
  })
}

const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) void main()
