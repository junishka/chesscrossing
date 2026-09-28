import type { IncomingMessage, ServerResponse } from 'node:http'

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void | Promise<void>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

export interface Router {
  get(path: string, handler: Handler): void
  post(path: string, handler: Handler): void
  /** Returns true if a route handled the request. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>
}

/** A very small router. Paths may contain :params. */
export function createRouter(): Router {
  const routes: Route[] = []

  function add(method: string, path: string, handler: Handler): void {
    const keys: string[] = []
    const source = path.replace(/:(\w+)/g, (_, k: string) => {
      keys.push(k)
      return '([^/]+)'
    })
    routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handler })
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    async handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost')
      for (const r of routes) {
        if (r.method !== req.method) continue
        const m = r.pattern.exec(url.pathname)
        if (!m) continue
        const params: Record<string, string> = {}
        r.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1] ?? '')
        })
        try {
          await r.handler(req, res, params)
        } catch (err) {
          console.error(`[router] ${req.method} ${url.pathname} failed`, err)
          if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
          else res.end()
        }
        return true
      }
      return false
    },
  }
}

export async function readJson<T = unknown>(req: IncomingMessage, limitBytes = 256 * 1024): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > limitBytes) throw new Error('request body too large')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

export interface SseStream {
  send(data: unknown): void
  close(): void
  readonly closed: boolean
}

/** Opens a server-sent events stream. Each `send` writes one JSON `data:` line. */
export function openSse(req: IncomingMessage, res: ServerResponse): SseStream {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': open\n\n')
  let closed = false
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n')
  }, 15000)
  const finish = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    res.end()
  }
  req.on('close', finish)
  return {
    send(data) {
      if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`)
    },
    close: finish,
    get closed() {
      return closed
    },
  }
}
