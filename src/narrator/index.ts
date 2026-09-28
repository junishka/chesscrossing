/**
 * The narrator panel. Implements src/contracts/narrator-panel.ts.
 * Imports shared visuals from '../frame' only.
 */
import './panel.css'

import type { NarratorPanelModule } from '../contracts/narrator-panel'
import { createNarratorPanel } from './panel'

export { createNarratorPanel, REMARKS_HEAD, REMARKS_SUB } from './panel'
export type { PanelInternals } from './panel'
export { NARRATOR_POLICY, OBJECT_DWELL_MS, createPolicy } from './policy'
export type { NarratorPolicy, Policy, PolicyDecision } from './policy'
export {
  SESSION_STORAGE_KEY,
  createSseParser,
  fetchNarratorHealth,
  getSessionId,
  newSessionId,
  resetNarratorSession,
  streamNarrator,
} from './client'
export type { ClientOptions, SseParser } from './client'

/** The module as the contract names it. */
export const narrator: NarratorPanelModule = { createNarratorPanel }
