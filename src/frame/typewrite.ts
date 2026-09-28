/**
 * Character-by-character reveal with a 1-rpx caret that disappears when done.
 * docs/visual.md sections 9 and 10. The typewriter is a behaviour, not a font.
 */
import type { TypewriteOptions as ContractOptions } from '../contracts/frame'

/** Ledger rate: 55 ms per character, 18 per second. */
export const LEDGER_MS_PER_CHAR = 55
/** Narrator rate: 36 ms per character, 28 per second. */
export const NARRATOR_MS_PER_CHAR = 36
/** Pause after a full stop. */
export const PAUSE_STOP_MS = 180
/** Pause after a comma or semicolon. */
export const PAUSE_COMMA_MS = 90
/** Opacity of the faint lower-case e (class .e-faint). */
export const E_FAINT_OPACITY = 0.72

export interface TypewriteOptions extends ContractOptions {
  /** Milliseconds per character. Overrides cps. Default LEDGER_MS_PER_CHAR. */
  msPerChar?: number
  /**
   * Pause 180 ms after a full stop and 90 ms after a comma or semicolon.
   * Default: on at the narrator rate, off otherwise.
   */
  pauses?: boolean
  /** Wrap every lower-case e in a span with the e-faint class. Default false. */
  faintE?: boolean
  /** Show the caret while typing. Default true. */
  caret?: boolean
}

/** The extra delay a character earns after it is struck. */
export function pauseAfter(ch: string): number {
  if (ch === '.' || ch === '?') return PAUSE_STOP_MS
  if (ch === ',' || ch === ';') return PAUSE_COMMA_MS
  return 0
}

/** Resolves the rate from the options: msPerChar wins, then cps, then the ledger rate. */
export function resolveMsPerChar(options: TypewriteOptions): number {
  if (typeof options.msPerChar === 'number' && options.msPerChar >= 0) return options.msPerChar
  if (typeof options.cps === 'number' && options.cps > 0) return 1000 / options.cps
  return LEDGER_MS_PER_CHAR
}

export function createCaret(doc: Document = document): HTMLElement {
  const caret = doc.createElement('span')
  caret.className = 'caret'
  caret.setAttribute('data-caret', '')
  caret.setAttribute('aria-hidden', 'true')
  return caret
}

/** Appends one character before `before` (or at the end), merging plain text into the last text node. */
function strike(el: HTMLElement, ch: string, faintE: boolean, before: Node | null): void {
  const doc = el.ownerDocument
  if (faintE && ch === 'e') {
    const span = doc.createElement('span')
    span.className = 'e-faint'
    span.textContent = 'e'
    el.insertBefore(span, before)
    return
  }
  const prev = before ? before.previousSibling : el.lastChild
  if (prev && prev.nodeType === Node.TEXT_NODE) {
    prev.textContent = (prev.textContent ?? '') + ch
  } else {
    el.insertBefore(doc.createTextNode(ch), before)
  }
}

/**
 * Reveals `text` in `el` one character at a time. Resolves when done. An
 * aborted signal prints the rest at once. Text is inserted as text nodes
 * (and e-faint spans); the element's own styling decides the face.
 */
export function typewrite(el: HTMLElement, text: string, options: TypewriteOptions = {}): Promise<void> {
  const msPerChar = resolveMsPerChar(options)
  const pauses = options.pauses ?? msPerChar === NARRATOR_MS_PER_CHAR
  const faintE = options.faintE ?? false
  const showCaret = options.caret ?? true
  const signal = options.signal

  if (!options.append) el.textContent = ''

  const chars = Array.from(text)
  const caret = showCaret ? createCaret(el.ownerDocument) : null
  if (caret) el.appendChild(caret)

  let index = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let finished = false

  return new Promise<void>((resolve) => {
    const finish = (): void => {
      if (finished) return
      finished = true
      if (timer !== null) clearTimeout(timer)
      while (index < chars.length) {
        strike(el, chars[index] as string, faintE, caret)
        index++
      }
      caret?.remove()
      signal?.removeEventListener('abort', finish)
      resolve()
    }

    if (signal?.aborted) {
      finish()
      return
    }
    signal?.addEventListener('abort', finish)

    const step = (): void => {
      if (finished) return
      if (index >= chars.length) {
        finish()
        return
      }
      const ch = chars[index] as string
      strike(el, ch, faintE, caret)
      index++
      if (index >= chars.length) {
        finish()
        return
      }
      const delay = msPerChar + (pauses ? pauseAfter(ch) : 0)
      timer = setTimeout(step, delay)
    }

    if (chars.length === 0) {
      finish()
      return
    }
    timer = setTimeout(step, msPerChar)
  })
}
