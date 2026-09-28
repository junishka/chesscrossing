import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NarratorBackendName } from '../src/contracts/narrator'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Loads .env from the repository root into process.env without overriding existing values. */
function loadDotEnv(): void {
  const file = join(ROOT, '.env')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadDotEnv()

function backendFromEnv(): NarratorBackendName {
  const v = (process.env.NARRATOR_BACKEND ?? 'anthropic').toLowerCase()
  if (v === 'cli' || v === 'mock' || v === 'anthropic') return v
  console.warn(`[config] unknown NARRATOR_BACKEND "${v}", using anthropic`)
  return 'anthropic'
}

export type Effort = 'low' | 'medium' | 'high'

function effortFromEnv(): Effort {
  const v = (process.env.NARRATOR_EFFORT ?? 'low').toLowerCase()
  if (v === 'low' || v === 'medium' || v === 'high') return v
  return 'low'
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isDev: process.env.NODE_ENV !== 'production',
  narrator: {
    backend: backendFromEnv(),
    model: process.env.NARRATOR_MODEL ?? 'claude-opus-5-5',
    effort: effortFromEnv(),
    fallbacks: (process.env.NARRATOR_FALLBACKS ?? 'true').toLowerCase() !== 'false',
    cliPath: process.env.CLAUDE_CLI_PATH ?? 'claude',
    /** Maximum conversation turns kept per session before the oldest are dropped. */
    historyTurns: Number(process.env.NARRATOR_HISTORY_TURNS ?? 40),
  },
} as const
