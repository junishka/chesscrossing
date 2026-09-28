// Dev-only config for /dev/world.html: alias content modules the navigator depends on to stubs
// under dev/stubs while they are still being written. Real files win once they exist.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import base from '../vite.config'

const root = fileURLToPath(new URL('..', import.meta.url))
const alias: { find: RegExp; replacement: string }[] = []
if (!existsSync(root + 'src/content/eggs.ts')) alias.push({ find: /^\.\.\/content\/eggs$/, replacement: root + 'dev/stubs/eggs.ts' })

export default mergeConfig(base, defineConfig({ resolve: { alias } }))
