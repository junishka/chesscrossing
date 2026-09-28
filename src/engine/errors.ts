/**
 * Errors the engine rejects with. All extend EngineError so a caller can
 * catch one class; the subclasses say why.
 */

/** Base class. The worker failed, answered nonsense, or was asked something impossible. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineError'
  }
}

/** The search was stopped by stop() or dispose() before it produced a move. */
export class EngineStoppedError extends EngineError {
  constructor(message = 'engine stopped') {
    super(message)
    this.name = 'EngineStoppedError'
  }
}

/** The worker did not answer within the allowed time. */
export class EngineTimeoutError extends EngineError {
  constructor(message = 'engine timed out') {
    super(message)
    this.name = 'EngineTimeoutError'
  }
}
