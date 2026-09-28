// The God's-eye insert (docs/BIBLE.md §11): a cut to a full-frame flat, a hold, a cut back. Kinds: a paper
// tag on felt for captures (`returned`), a photograph in a painted sepia frame with the caption below and
// nothing on the print (`photo`), a typed page (`page`), a chart sheet (`sheet`), a shelf of spines
// (`books`), a fan of postcards (`postcards`). Any key or click skips. Also the Tide Warden's reading, a
// typed strip at the bottom of the frame for six seconds. Subscribes to `ui:insert` and `reading`.
import { bus } from '../core/bus'
import { clock } from '../core/clock'
import { copy } from '../content/copy'
import { h } from './overlay'
import { typedEl } from './titleCards'

/** What an insert shows. `lines` are typed on the flat; `title` is the tag's first line, the sheet's heading, the print's caption. */
export interface InsertSpec { kind: string; title?: string; lines?: string[]; holdMs?: number }

const IN_MS = 260
const READING_MS = 6000
const SPINE_TONES = ['olive', 'raspberry', 'textile', 'brass', 'mustard', 'ink'] as const

/** Waits on the house clock (so slow motion applies) until `ms` have passed or `skip` fires. */
function hold(ms: number, skip: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    let elapsed = 0
    const finish = () => { if (done) return; done = true; off(); resolve() }
    const off = clock.onTick((dt) => { elapsed += dt * 1000; if (elapsed >= ms) finish() })
    void skip.then(finish)
  })
}

/** The paper tag on felt: the piece's cutout with its inventory number above, the tag sliding in below. */
function returned(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-returned')
  const cutout = h('div', 'cc-cutout')
  if (spec.title) cutout.appendChild(h('span', 'cc-cutout-number', spec.title))
  const tag = h('div', 'cc-insert-tag cc-mono')
  tag.appendChild(h('i', 'cc-tag-eyelet'))
  for (const line of spec.lines ?? []) tag.appendChild(typedEl('div', 'cc-insert-tag-line', line))
  el.append(cutout, tag)
  return el
}

/** A sepia print in a painted frame; the caption below; nothing written on the print. */
function photo(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-photo')
  const frame = h('div', 'cc-photo-frame')
  const print = h('div', 'cc-photo-print')
  // nine figures in a row: the print is painted, not labelled
  for (let i = 0; i < 9; i++) {
    const fig = h('i', 'cc-photo-figure')
    fig.style.setProperty('--i', String(i))
    print.appendChild(fig)
  }
  frame.appendChild(print)
  el.appendChild(frame)
  const caption = spec.title ?? spec.lines?.join('  ') ?? ''
  if (caption) el.appendChild(typedEl('div', 'cc-photo-caption', caption))
  return el
}

/** A plain typed page. */
function page(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-page')
  const paper = h('div', 'cc-insert-paper cc-mono')
  if (spec.title) paper.appendChild(typedEl('div', 'cc-insert-paper-title', spec.title))
  for (const line of spec.lines ?? []) paper.appendChild(typedEl('p', '', line))
  el.appendChild(paper)
  return el
}

/** A chart sheet: the grid of the Sixty-Four faint on linen-backed paper, the heading in capitals, the lines typed at the foot. */
function sheet(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-sheet')
  const paper = h('div', 'cc-insert-paper cc-sheet')
  if (spec.title) paper.appendChild(h('div', 'cc-sheet-title cc-caps', spec.title))
  paper.appendChild(h('div', 'cc-sheet-grid'))
  const foot = h('div', 'cc-sheet-foot cc-mono')
  for (const line of spec.lines ?? []) foot.appendChild(typedEl('p', '', line))
  paper.appendChild(foot)
  el.appendChild(paper)
  return el
}

/** A shelf of spines, each titled and stamped, in the colours the house owns. */
function books(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-books')
  const shelf = h('div', 'cc-shelf')
  ;(spec.lines ?? []).forEach((title, i) => {
    const spine = h('div', `cc-spine cc-spine-${SPINE_TONES[i % SPINE_TONES.length]}`)
    spine.style.setProperty('--h', String(0.82 + ((i * 37) % 7) / 40))
    spine.append(h('span', 'cc-spine-title', title), h('i', 'cc-spine-stamp'))
    shelf.appendChild(spine)
  })
  el.appendChild(shelf)
  if (spec.title) el.appendChild(h('div', 'cc-shelf-label cc-caps-light', spec.title))
  return el
}

/** A fan of postcards, each with one typed line; the last lies on top. */
function postcards(spec: InsertSpec): HTMLElement {
  const el = h('div', 'cc-insert-flat cc-insert-postcards')
  const fan = h('div', 'cc-fan')
  const lines = spec.lines ?? []
  lines.forEach((line, i) => {
    const card = h('div', 'cc-postcard cc-mono')
    card.style.setProperty('--i', String(i))
    card.style.setProperty('--n', String(lines.length))
    card.append(h('i', 'cc-postcard-stamp'), h('i', 'cc-postcard-rule'))
    card.appendChild(typedEl('div', 'cc-postcard-line', line))
    fan.appendChild(card)
  })
  el.appendChild(fan)
  if (spec.title) el.appendChild(h('div', 'cc-fan-label cc-caps-light', spec.title))
  return el
}

/** Builds the flat for an insert kind; an unknown kind is a typed page. */
export function buildInsert(spec: InsertSpec): HTMLElement {
  switch (spec.kind) {
    case 'returned': return returned(spec)
    case 'photo': return photo(spec)
    case 'sheet': return sheet(spec)
    case 'books': return books(spec)
    case 'postcards': return postcards(spec)
    default: return page(spec)
  }
}

/** The insert layer: one flat at a time, and the reading strip. */
export class InsertLayer {
  readonly el: HTMLElement
  private strip: HTMLElement
  private current: HTMLElement | null = null
  private skip: (() => void) | null = null
  private stripTimer: number | null = null
  private offs: (() => void)[] = []

  constructor(parent: HTMLElement) {
    this.el = h('div', 'cc-insert')
    this.strip = h('div', 'cc-reading')
    parent.append(this.el, this.strip)
    const onKey = (e: KeyboardEvent) => { if (this.current && !e.repeat) this.skip?.() }
    const onClick = () => { if (this.current) this.skip?.() }
    window.addEventListener('keydown', onKey)
    this.el.addEventListener('pointerdown', onClick)
    this.offs.push(() => window.removeEventListener('keydown', onKey))
    this.offs.push(bus.on('ui:insert', (o) => { if (o) void this.show(o); else this.dismiss() }))
    this.offs.push(bus.on('reading', ({ text }) => this.reading(text)))
  }

  /** True while a flat is on screen. */
  get isOn(): boolean { return this.current !== null }

  /** Cuts to the flat, holds (600 ms by default, 500 ms for a capture), cuts back. Resolves after the cut back. */
  async show(spec: InsertSpec): Promise<void> {
    this.dismiss()
    const flat = buildInsert(spec)
    this.el.replaceChildren(flat)
    this.el.classList.add('is-on')
    this.current = flat
    const skipped = new Promise<void>((r) => { this.skip = r })
    const ms = spec.holdMs ?? (spec.kind === 'returned' ? copy.inserts.returnedHoldMs : copy.inserts.holdMs)
    await hold(ms + IN_MS, skipped)
    if (this.current === flat) this.dismiss()
  }

  /** Cuts back at once. */
  dismiss(): void {
    if (!this.current) return
    this.current = null
    this.el.classList.remove('is-on')
    this.el.replaceChildren()
    const skip = this.skip
    this.skip = null
    skip?.()
  }

  /** The Tide Warden's reading: a typed strip at the bottom of the frame for six seconds. */
  reading(text: string): void {
    if (this.stripTimer !== null) window.clearTimeout(this.stripTimer)
    this.strip.replaceChildren(h('div', 'cc-reading-title cc-caps-light', copy.cards.reading), typedEl('div', 'cc-reading-text', text))
    this.strip.classList.add('is-on')
    this.stripTimer = window.setTimeout(() => { this.strip.classList.remove('is-on'); this.stripTimer = null }, READING_MS)
  }

  dispose(): void {
    for (const off of this.offs) off()
    this.offs = []
    this.dismiss()
    this.el.remove()
    this.strip.remove()
  }
}
