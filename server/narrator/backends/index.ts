import type { config as Config } from '../../config'
import { createAnthropicBackend } from './anthropic'
import { createCliBackend } from './cli'
import { createMockBackend } from './mock'
import type { Backend } from './types'

export type NarratorConfig = typeof Config.narrator

/** The backend named by config. */
export function createBackend(narrator: NarratorConfig): Backend {
  switch (narrator.backend) {
    case 'mock':
      return createMockBackend({ model: narrator.model })
    case 'cli':
      return createCliBackend({ cliPath: narrator.cliPath, model: narrator.model, effort: narrator.effort })
    case 'anthropic':
      return createAnthropicBackend({ model: narrator.model, effort: narrator.effort, fallbacks: narrator.fallbacks })
  }
}

export type { Backend, BackendInput, BackendMessage } from './types'
export { BackendError } from './types'
export { createAnthropicBackend } from './anthropic'
export { createCliBackend } from './cli'
export { createMockBackend } from './mock'
