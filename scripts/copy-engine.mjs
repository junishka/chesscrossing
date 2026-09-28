// Copies the single-threaded Stockfish 19 lite build into public/engine so the
// browser can load it in a Web Worker without cross-origin isolation headers.
// Runs on postinstall. The copied files are gitignored.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'stockfish', 'bin')
const dest = join(root, 'public', 'engine')
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']

if (!existsSync(src)) {
  console.warn('[copy-engine] stockfish package not found; skipping')
  process.exit(0)
}
mkdirSync(dest, { recursive: true })
for (const f of files) {
  const from = join(src, f)
  if (!existsSync(from)) {
    console.warn(`[copy-engine] missing ${from}`)
    continue
  }
  copyFileSync(from, join(dest, f))
}
console.log('[copy-engine] copied', files.join(', '), '->', dest)
