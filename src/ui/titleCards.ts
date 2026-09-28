// Title cards: the Recorder's typed page. A chapter card is Courier Prime on paper, the format of
// docs/BIBLE.md §4 exactly: the chapter and the room centred in letterspaced capitals, the one past-tense
// sentence left-aligned and ragged at 62 characters, then `I. Hardy, Recorder` and the date right-aligned.
// Cut in, held 3200 ms, cut out; no fade. A plain typed variant carries the tutorial card and the ending's
// lines. The Survey Theme is the audio layer's job: `audio:music 'survey'` is emitted when a chapter card shows.
import { bus } from '../core/bus'
import { store } from '../core/store'
import { copy, TYPED_WIDTH } from '../content/copy'
import { dateText } from '../content/station'
import { h } from './overlay'

/** A title card. `chapter` makes it the Recorder's chapter page; `lines` alone makes a plain typed card. */
export interface TitleSpec {
  chapter?: string
  title: string
  subtitle?: string
  holdMs?: number
  /** `chapter` (default when `chapter` is given) or `typed`: a plain typed page of `lines`. */
  kind?: 'chapter' | 'typed'
  /** The date under the sign-off, every date with a year; defaults to the station date. */
  date?: string
  /** The sign-off line; defaults to `I. Hardy, Recorder`. */
  signoff?: string
  /** Typed lines for the plain variant, one paragraph each. */
  lines?: string[]
}

const DEFAULT_HOLD = copy.chapterCard.holdMs
const TYPED_HOLD = 2400

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/**
 * Typed text as the Olivetti leaves it (Law VII, §4 rule 3): every lower-case `e` is wrapped in a span the
 * stylesheet sets 0.04 em low and rotated 4 degrees; `~~a correction~~` is struck through, never erased.
 * Applied to chapter cards, the ledger, index cards and the Second's card, and to nothing else.
 */
export function typed(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const parts = text.split(/(~~[^~]+~~)/)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
      const s = document.createElement('s')
      s.className = 'cc-struck'
      s.appendChild(bentE(part.slice(2, -2)))
      frag.appendChild(s)
    } else {
      frag.appendChild(bentE(part))
    }
  }
  return frag
}

/**
 * Bends every `e` in a run of text. A word that holds one is wrapped so the line breaks only at the spaces
 * between words, never beside the bent glyph, which is an inline block and would otherwise offer a break.
 */
function bentE(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue
    if (/^\s+$/.test(token) || !token.includes('e')) { frag.appendChild(document.createTextNode(token)); continue }
    const word = document.createElement('span')
    word.className = 'cc-word'
    let run = ''
    for (const ch of token) {
      if (ch === 'e') {
        if (run) { word.appendChild(document.createTextNode(run)); run = '' }
        const e = document.createElement('span')
        e.className = 'cc-e'
        e.textContent = 'e'
        word.appendChild(e)
      } else {
        run += ch
      }
    }
    if (run) word.appendChild(document.createTextNode(run))
    frag.appendChild(word)
  }
  return frag
}

/** A typed element: text with the bent `e`, in the mono face. */
export function typedEl<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const el = h(tag, className ? `${className} cc-mono` : 'cc-mono')
  el.appendChild(typed(text))
  return el
}

/** The title layer. One card at a time; overlapping requests play in order. */
export class TitleLayer {
  readonly el: HTMLElement
  private page: HTMLElement
  private queue: Promise<void> = Promise.resolve()

  constructor(parent: HTMLElement) {
    this.el = h('div', 'cc-title')
    this.page = h('div', 'cc-page cc-mono')
    this.page.style.width = `${TYPED_WIDTH}ch`
    this.el.appendChild(this.page)
    parent.appendChild(this.el)
  }

  /** Shows a card and resolves once it has been cut away again. */
  show(spec: TitleSpec): Promise<void> {
    const run = this.queue.then(() => this.play(spec))
    this.queue = run.catch(() => undefined)
    return run
  }

  /** True while a card is on screen. */
  get isOn(): boolean { return this.el.classList.contains('is-on') }

  private async play(spec: TitleSpec): Promise<void> {
    const kind = spec.kind ?? (spec.chapter ? 'chapter' : 'typed')
    this.page.replaceChildren()
    this.el.classList.toggle('is-chapter', kind === 'chapter')
    if (kind === 'chapter') this.chapterPage(spec)
    else this.typedPage(spec)
    this.el.classList.add('is-on')
    if (kind === 'chapter') bus.emit('audio:music', { theme: 'survey' })
    await sleep(Math.max(0, spec.holdMs ?? (kind === 'chapter' ? DEFAULT_HOLD : TYPED_HOLD)))
    this.el.classList.remove('is-on')
  }

  /** The Recorder's page: heading, room, sentence, sign-off, date. */
  private chapterPage(spec: TitleSpec): void {
    const head = h('div', 'cc-page-head')
    head.append(h('div', 'cc-page-chapter', spec.chapter ?? ''), h('div', 'cc-page-title', spec.title))
    const body = h('div', 'cc-page-body')
    for (const line of (spec.lines ?? [spec.subtitle ?? '']).filter((l) => l.length)) body.appendChild(typedEl('p', '', line))
    const sign = h('div', 'cc-page-sign')
    sign.append(
      typedEl('div', '', spec.signoff ?? copy.chapterCard.signoff),
      typedEl('div', '', spec.date ?? dateText(store.ledger.season.date)),
    )
    this.page.append(head, body, sign)
  }

  /** The plain typed card: a heading, if any, and the lines. */
  private typedPage(spec: TitleSpec): void {
    const body = h('div', 'cc-page-body')
    if (spec.chapter) body.appendChild(h('div', 'cc-page-chapter', spec.chapter))
    const lines = spec.lines ?? [spec.title, ...(spec.subtitle ? [spec.subtitle] : [])]
    for (const line of lines) body.appendChild(typedEl('p', '', line))
    this.page.append(body)
  }
}
