// Collects every builder in this folder into one registry keyed by frame id.
// A builder file is `./<frameId>.ts` exporting `build` (or a default export) of type FrameBuilder;
// it may export `id` to register under a different frame id than its filename.
import type { FrameBuilder } from '../frames'

interface BuilderModule {
  build?: FrameBuilder
  default?: FrameBuilder
  id?: string
}

/** Every sibling file except this registry and the placeholder room. */
const modules = import.meta.glob<BuilderModule>(['./*.ts', '!./index.ts', '!./_placeholder.ts'], { eager: true })

function idFromPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\.ts$/, '')
}

function collect(): Record<string, FrameBuilder> {
  const out: Record<string, FrameBuilder> = {}
  for (const [path, mod] of Object.entries(modules)) {
    const fileId = idFromPath(path)
    const build = mod.build ?? mod.default
    if (typeof build !== 'function') {
      console.warn(`[builders] ${path} exports no builder`)
      continue
    }
    out[mod.id ?? fileId] = build
  }
  return out
}

/** Every registered frame builder by frame id. */
export const registry: Record<string, FrameBuilder> = collect()
