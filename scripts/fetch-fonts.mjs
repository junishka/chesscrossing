// Downloads Google Fonts families into public/fonts and writes public/fonts/fonts.css
// with @font-face rules that point at the local files. Latin and latin-ext only.
//
//   node scripts/fetch-fonts.mjs "Jost:ital,wght@0,300;0,400;0,500;0,600;1,400" "Cormorant Garamond:ital,wght@0,400;1,400"
//
// Uses fetch, and falls back to curl (which honours HTTPS_PROXY and the system CA bundle).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'public', 'fonts')
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

async function get(url, binary = false) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return binary ? Buffer.from(await res.arrayBuffer()) : await res.text()
  } catch {
    const out = execFileSync('curl', ['-sS', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 })
    return binary ? out : out.toString('utf8')
  }
}

const specs = process.argv.slice(2)
if (!specs.length) {
  console.error('usage: node scripts/fetch-fonts.mjs "Family:ital,wght@0,400;0,700" ...')
  process.exit(1)
}
mkdirSync(dir, { recursive: true })

const manifestPath = join(dir, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}

for (const spec of specs) {
  const family = spec.split(':')[0]
  const slug = family.toLowerCase().replace(/\s+/g, '-')
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%3B/g, ';').replace(/%40/g, '@')}&display=swap`
  const css = await get(url)
  const blocks = css.split('@font-face').slice(1)
  const kept = []
  let n = 0
  for (const raw of blocks) {
    const block = '@font-face' + raw
    const subset = (block.match(/\/\*\s*([a-z-]+)\s*\*\//) ?? [])[1] ?? ''
    if (subset && subset !== 'latin' && subset !== 'latin-ext') continue
    const src = block.match(/url\((https:[^)]+)\)/)?.[1]
    if (!src) continue
    const style = block.match(/font-style:\s*(\w+)/)?.[1] ?? 'normal'
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1] ?? '400'
    const file = `${slug}-${weight}-${style}-${subset || 'all'}.woff2`
    const bin = await get(src, true)
    mkdirSync(join(dir, slug), { recursive: true })
    writeFileSync(join(dir, slug, file), bin)
    kept.push(block.replace(src, `/fonts/${slug}/${file}`).replace(/\/\*\s*[a-z-]+\s*\*\/\s*/, ''))
    n++
  }
  manifest[family] = { spec, files: n }
  console.log(`[fonts] ${family}: ${n} faces`)
  writeFileSync(join(dir, `${slug}.css`), `/* ${family}. Downloaded from Google Fonts. See manifest.json. */\n` + kept.join('\n'))
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const all = Object.keys(manifest).map((f) => `@import url("/fonts/${f.toLowerCase().replace(/\s+/g, '-')}.css");`).join('\n')
writeFileSync(join(dir, 'fonts.css'), all + '\n')
console.log('[fonts] wrote public/fonts/fonts.css')
