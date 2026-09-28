import type { AppEvent, AppEventOf, AppEventType, EventBus } from './events'

/** A small synchronous event bus. Handlers that throw do not stop the others. */
export function createBus(): EventBus {
  const handlers = new Map<AppEventType, Set<(e: AppEvent) => void>>()
  const anyHandlers = new Set<(e: AppEvent) => void>()

  return {
    emit(event) {
      const set = handlers.get(event.type)
      if (set) {
        for (const h of [...set]) {
          try {
            h(event)
          } catch (err) {
            console.error(`[bus] handler for ${event.type} threw`, err)
          }
        }
      }
      for (const h of [...anyHandlers]) {
        try {
          h(event)
        } catch (err) {
          console.error(`[bus] any-handler threw on ${event.type}`, err)
        }
      }
    },
    on<T extends AppEventType>(type: T, handler: (event: AppEventOf<T>) => void) {
      let set = handlers.get(type)
      if (!set) {
        set = new Set()
        handlers.set(type, set)
      }
      const h = handler as (e: AppEvent) => void
      set.add(h)
      return () => {
        set?.delete(h)
      }
    },
    onAny(handler) {
      anyHandlers.add(handler)
      return () => {
        anyHandlers.delete(handler)
      }
    },
  }
}
