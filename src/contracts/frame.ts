/**
 * The frame: stage, palette, typography, cards, captions, dossiers, motion.
 * Implemented in src/frame. Everything visual that is shared lives there.
 */

/** One room's palette. Roles, not colors. Hex strings. */
export interface Palette {
  wall: string
  floor: string
  wood: string
  boardLight: string
  boardDark: string
  accent: string
  ink: string
  paper: string
}

export type CardKind = 'title' | 'chapter' | 'intertitle'

export interface CardOptions {
  kind?: CardKind
  /** How long the card holds after it has fully appeared, before resolving. */
  holdMs?: number
  /** If true, the card waits for a click or key instead of a timer. */
  waitForInput?: boolean
}

export interface Stage {
  /** The letterboxed stage element with the fixed aspect ratio. Everything visible is inside it. */
  readonly el: HTMLElement
  /** The content layer. Rooms are mounted here. */
  readonly content: HTMLElement
  /** Applies a palette by setting CSS custom properties on the stage. */
  setPalette(palette: Palette): void
  /** Shows a full-stage typographic card. Resolves when the card has gone. */
  showCard(lines: string[], options?: CardOptions): Promise<void>
  /**
   * A whip pan. Calls `swap` at the midpoint, while the stage is in motion,
   * so the caller can replace the content. Resolves when settled.
   */
  whipPan(direction: 'left' | 'right', swap: () => void | Promise<void>): Promise<void>
  /** A lateral track: slides `content` horizontally by a fraction of stage width. */
  track(dx: number, durationMs?: number): Promise<void>
}

export interface StageOptions {
  /** Width / height. The visual document decides. */
  aspect?: number
}

export interface TypewriteOptions {
  /** Characters per second. */
  cps?: number
  /** Whether to append or replace the element's text. */
  append?: boolean
  /** An AbortSignal to cut the reveal short and print the rest at once. */
  signal?: AbortSignal
}

/**
 * Functions the frame module must export from src/frame/index.ts.
 * Other modules import from '../frame' only.
 */
export interface FrameModule {
  createStage(root: HTMLElement, options?: StageOptions): Stage
  /** A caption element: small, tracked, centered, in the frame's caption style. */
  createCaption(text: string): HTMLElement
  /** A dossier card: a title line and two or more lines, hairline framed. */
  createDossierCard(title: string, lines: readonly string[]): HTMLElement
  /** Reveals text character by character. Resolves when done. */
  typewrite(el: HTMLElement, text: string, options?: TypewriteOptions): Promise<void>
  /** A hairline rule element. */
  createRule(): HTMLElement
}
