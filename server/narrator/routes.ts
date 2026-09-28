/**
 * PLACEHOLDER. The narrator module replaces this file.
 * It must export registerNarratorRoutes(router) and serve:
 *   GET  NARRATOR_HEALTH_PATH  -> NarratorHealth JSON
 *   POST NARRATOR_STREAM_PATH  -> SSE of NarratorStreamEvent, body NarratorRequest
 *   POST NARRATOR_RESET_PATH   -> { ok: true }, body { sessionId }
 */
import { NARRATOR_HEALTH_PATH, NARRATOR_RESET_PATH, NARRATOR_STREAM_PATH } from '../../src/contracts/narrator'
import type { NarratorHealth } from '../../src/contracts/narrator'
import { config } from '../config'
import { openSse, sendJson, type Router } from '../router'

export function registerNarratorRoutes(router: Router): void {
  router.get(NARRATOR_HEALTH_PATH, (_req, res) => {
    const health: NarratorHealth = {
      ok: false,
      backend: config.narrator.backend,
      model: config.narrator.model,
      detail: 'narrator not implemented yet',
    }
    sendJson(res, 200, health)
  })
  router.post(NARRATOR_STREAM_PATH, (req, res) => {
    const sse = openSse(req, res)
    sse.send({ type: 'error', message: 'narrator not implemented yet', retryable: false })
    sse.close()
  })
  router.post(NARRATOR_RESET_PATH, (_req, res) => sendJson(res, 200, { ok: true }))
}
