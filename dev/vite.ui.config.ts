// Dev-only config for /dev/ui.html: while other modules are still being written, alias the
// contract imports the UI depends on to stubs under dev/stubs. Real files win once they exist.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import base from '../vite.config'

const root = fileURLToPath(new URL('..', import.meta.url))
const alias: { find: RegExp; replacement: string }[] = []
if (!existsSync(root + 'src/api/second.ts')) alias.push({ find: /^\.\.\/api\/second$/, replacement: root + 'dev/stubs/second.ts' })
if (!existsSync(root + 'src/content/frames/index.ts')) alias.push({ find: /^\.\.\/content\/frames\/index$/, replacement: root + 'dev/stubs/frames.ts' })

export default mergeConfig(base, defineConfig({ resolve: { alias } }))
