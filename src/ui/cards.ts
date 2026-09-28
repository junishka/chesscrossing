// Paper: the index card (tag top left, the title, the material and year line, the one sentence, typed),
// the luggage tag, the engraved brass placard, the letter, the telegram, the label, and a plain typed page.
// Every card slides in over 260 ms and closes by a click or Escape; `audio:sfx 'paper'` on open.
// `buildCard` is also used inline by the Second's card.
import type { CardDef, CardKind } from '../types'
import { bus } from '../core/bus'
import { copy } from '../content/copy'
import { h } from './overlay'
import { typed, typedEl } from './titleCards'

const SVG_NS = 'http://www.w3.org/2000/svg'
const OUT_MS = 160

/** A deterministic small tilt per strip so the telegram looks pasted by hand. */
function tilt(i: number): string {
  const t = ((i * 7919) % 11) / 10 - 0.5
  return `${(t * 0.9).toFixed(2)}deg`
}

/** The string through a luggage tag's eyelet, in sand mustard. */
function tagString(): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg')
  s.setAttribute('class', 'cc-card-string')
  s.setAttribute('viewBox', '0 0 90 60')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', 'M84 30 C 60 30, 52 4, 30 8 S 2 40, 4 52')
  s.appendChild(p)
  return s
}

function telegramHead(title: string): HTMLElement {
  const f = copy.cards.telegramForm
  const head = h('div', 'cc-card-head')
  const left = h('div', 'cc-card-field')
  left.append(h('div', '', f.office), h('div', '', f.words))
  const right = h('div', 'cc-card-field')
  right.append(h('div', '', f.received), h('div', '', '—'))
  head.append(left, h('div', 'cc-card-title', title || f.header), right)
  return head
}

function telegramBody(body: string): HTMLElement {
  const el = h('div', 'cc-card-body cc-mono')
  const words = body.split(/\s+/).filter(Boolean)
  // strips of two or three words, like a tape cut with scissors
  let i = 0
  let n = 0
  while (i < words.length) {
    const take = n % 3 === 2 ? 3 : 2
    const strip = h('span', 'cc-strip', words.slice(i, i + take).join(' '))
    strip.style.setProperty('--tilt', tilt(n))
    el.appendChild(strip)
    i += take
    n++
  }
  return el
}

/** Paragraphs of typed text, one element per line of the body. */
function typedParagraphs(body: string, className = ''): HTMLElement {
  const el = h('div', className ? `cc-card-body ${className}` : 'cc-card-body')
  for (const line of body.split('\n')) {
    if (!line.trim()) { el.appendChild(h('div', 'cc-card-gap')); continue }
    el.appendChild(typedEl('p', '', line))
  }
  return el
}

/** The index card of Law IV: tag, title, material and year, the one sentence typed. */
function indexCard(el: HTMLElement, def: CardDef): void {
  const head = h('div', 'cc-card-index-head')
  head.append(h('span', 'cc-card-no cc-caps-light', def.tag ?? ''), h('span', 'cc-card-title', def.title))
  el.append(head)
  if (def.material) el.appendChild(h('div', 'cc-card-material cc-caps-light', def.material))
  el.appendChild(typedParagraphs(def.body))
}

/** The luggage tag: Jost, brass eyelet, string in sand mustard. */
function luggageTag(el: HTMLElement, def: CardDef): void {
  el.appendChild(tagString())
  el.append(h('div', 'cc-card-title', def.title), h('div', 'cc-card-body', def.body))
  if (def.tag) el.appendChild(h('div', 'cc-card-no cc-caps-light', def.tag))
}

/** An engraved brass placard: capitals, centred, a full stop after every sentence. */
function placard(el: HTMLElement, def: CardDef): void {
  for (const corner of ['tl', 'tr', 'bl', 'br']) el.appendChild(h('i', `cc-screw cc-screw-${corner}`))
  if (def.title) el.appendChild(h('div', 'cc-card-title', def.title))
  if (def.body) el.appendChild(h('div', 'cc-card-body', def.body))
}

/** A letter: letterhead in capitals, the body typed. */
function letter(el: HTMLElement, def: CardDef): void {
  el.append(h('div', 'cc-card-title', def.title), typedParagraphs(def.body))
}

/** A plain typed page: the heading in capitals, typed, then the lines. */
function typedPage(el: HTMLElement, def: CardDef): void {
  if (def.tag) el.appendChild(h('div', 'cc-card-no cc-caps-light', def.tag))
  if (def.title) el.appendChild(typedEl('div', 'cc-card-title', def.title))
  el.appendChild(typedParagraphs(def.body))
}

/** A small label, as on a tin. */
function label(el: HTMLElement, def: CardDef): void {
  el.append(h('div', 'cc-card-title', def.title), h('div', 'cc-card-body', def.body))
}

/** Builds the DOM for one card. The element carries `cc-card cc-card-<kind>`. */
export function buildCard(def: CardDef): HTMLElement {
  const kind: CardKind = def.kind ?? 'index'
  const el = h('div', `cc-card cc-card-${kind}`)
  switch (kind) {
    case 'telegram': el.append(telegramHead(def.title), telegramBody(def.body)); break
    case 'tag': luggageTag(el, def); break
    case 'placard': placard(el, def); break
    case 'letter': letter(el, def); break
    case 'typed': typedPage(el, def); break
    case 'label': label(el, def); break
    default: indexCard(el, def)
  }
  if (def.footnote) {
    const foot = h('div', 'cc-card-foot')
    if (kind === 'placard' || kind === 'tag' || kind === 'label') foot.textContent = def.footnote
    else { foot.classList.add('cc-mono'); foot.appendChild(typed(def.footnote)) }
    el.appendChild(foot)
  }
  return el
}

/** The cards layer: at most one card on screen. */
export class CardLayer {
  readonly el: HTMLElement
  private current: HTMLElement | null = null
  private hint: HTMLElement | null = null
  private onClose: (() => void) | null = null

  constructor(parent: HTMLElement) {
    this.el = h('div', 'cc-cards')
    parent.appendChild(this.el)
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.current) this.show(null) })
  }

  get isOpen(): boolean { return this.current !== null }

  /** Shows a card, replacing any on screen; `null` closes. `onClose` is called once when this card leaves. */
  show(def: CardDef | null, onClose?: () => void): void {
    if (this.current) this.retire(this.current)
    this.current = null
    const closed = this.onClose
    this.onClose = null
    closed?.()
    this.hint?.remove()
    this.hint = null
    this.el.classList.remove('is-centred')
    if (!def) return
    const card = buildCard(def)
    card.classList.add('cc-interactive')
    card.addEventListener('click', () => this.show(null))
    this.hint = h('div', 'cc-card-close cc-caps-light', copy.cards.close)
    this.el.classList.toggle('is-centred', def.kind === 'typed')
    this.el.append(card, this.hint)
    this.current = card
    this.onClose = onClose ?? null
    bus.emit('audio:sfx', { name: 'paper', velocity: 0.6 })
  }

  private retire(card: HTMLElement): void {
    card.classList.add('is-out')
    card.style.pointerEvents = 'none'
    window.setTimeout(() => card.remove(), OUT_MS)
  }
}
