import type { Events } from '../types'

type Handler<K extends keyof Events> = (payload: Events[K]) => void

class Bus {
  private handlers = new Map<keyof Events, Set<Handler<any>>>()

  on<K extends keyof Events>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event)
    if (!set) { set = new Set(); this.handlers.set(event, set) }
    set.add(handler)
    return () => { set!.delete(handler) }
  }

  once<K extends keyof Events>(event: K, handler: Handler<K>): () => void {
    const off = this.on(event, (p) => { off(); handler(p) })
    return off
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const h of Array.from(set)) {
      try { h(payload) } catch (err) { console.error(`[bus] handler for ${String(event)} threw`, err) }
    }
  }
}

/** The single application-wide event bus. */
export const bus = new Bus()
