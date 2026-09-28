import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { config, ROOT } from './config'
import { createRouter } from './router'
import { registerNarratorRoutes } from './narrator/routes'

type StaticHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

/** Serves dist/ in production with an SPA fallback to index.html. */
function serveDist(dir: string): StaticHandler {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let file = join(dir, normalize(decodeURIComponent(url.pathname)))
    if (!file.startsWith(dir)) {
      res.writeHead(403)
      res.end()
      return
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html')
    const type = MIME[extname(file)] ?? 'application/octet-stream'
    const immutable = /\/assets\//.test(file)
    res.writeHead(200, {
      'content-type': type,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    createReadStream(file).pipe(res)
  }
}

async function main(): Promise<void> {
  const router = createRouter()
  registerNarratorRoutes(router)

  let handleStatic: StaticHandler
  if (config.isDev) {
    const { createServer } = await import('vite')
    const vite = await createServer({
      root: ROOT,
      appType: 'spa',
      server: { middlewareMode: true },
    })
    handleStatic = (req, res) =>
      vite.middlewares(req, res, () => {
        res.writeHead(404)
        res.end('not found')
      })
  } else {
    const dist = join(ROOT, 'dist')
    if (!existsSync(join(dist, 'index.html'))) {
      console.error('dist/index.html not found. Run `npm run build` first.')
      process.exit(1)
    }
    handleStatic = serveDist(dist)
  }

  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/api/')) {
      const handled = await router.handle(req, res)
      if (!handled) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('{"error":"not found"}')
      }
      return
    }
    handleStatic(req, res)
  })

  server.listen(config.port, () => {
    const mode = config.isDev ? 'development' : 'production'
    console.log(`Chess Crossing  http://localhost:${config.port}  (${mode}, narrator: ${config.narrator.backend}, ${config.narrator.model})`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
