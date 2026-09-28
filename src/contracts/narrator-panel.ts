/**
 * The narrator panel in the browser. Implemented in src/narrator.
 */
import type { EventBus } from './events'
import type { NarratorContext, NarratorEventKind } from './narrator'

export interface NarratorPanelOptions {
  /** The narrator's display name, from the world. */
  name: string
  /** The typographic mark shown when the narrator chooses silence. */
  silenceMark: string
  /** Supplies the current context on every request. Wired by the app shell. */
  getContext: () => NarratorContext
  /** Placeholder text for the input field, from the world. */
  placeholder?: string
}

export interface NarratorPanel {
  readonly el: HTMLElement
  /** Sends the player's words. Resolves when the reply has fully appeared. */
  ask(text: string): Promise<void>
  /** Tells the narrator about an event. The panel's policy may drop it. */
  notify(event: NarratorEventKind): Promise<void>
  /** Clears the visible transcript and the server-side history for this session. */
  reset(): Promise<void>
  destroy(): void
}

/**
 * The panel subscribes to the bus itself and applies the event policy in
 * src/narrator/policy.ts (which game events are worth a word). The app shell
 * only supplies context.
 */
export interface NarratorPanelModule {
  createNarratorPanel(container: HTMLElement, options: NarratorPanelOptions, bus: EventBus): NarratorPanel
}
