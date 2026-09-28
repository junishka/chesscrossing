// The menu: the brass plate on the pale blue wall (docs/BIBLE.md §4). Jost capitals letterspaced on a
// brass gradient, the text inset in ink; the title, the two subtitle lines, the items as rows, the
// station's line at the foot. Navigable with the keyboard (arrows, Enter, Escape) and the pointer.
import { bus } from '../core/bus'
import { copy } from '../content/copy'
import { h } from './overlay'

/** One row of the plate. `hint`, when given, is engraved small under the label. */
export interface MenuItem { id: string; label: string; hint?: string; disabled?: boolean }
/** The plate. `title`, `subtitle` and `footer` default to the main menu's lines. */
export interface MenuSpec { items: MenuItem[]; title?: string; subtitle?: string[]; footer?: string; onPick(id: string): void; onClose?(): void }

/** The menu layer. */
export class MenuLayer {
  readonly el: HTMLElement
  private plate: HTMLElement
  private title: HTMLElement
  private subtitle: HTMLElement
  private list: HTMLElement
  private footer: HTMLElement
  private rows: HTMLElement[] = []
  private spec: MenuSpec | null = null
  private focus = -1

  constructor(parent: HTMLElement) {
    this.el = h('div', 'cc-menu cc-interactive')
    this.plate = h('div', 'cc-plate')
    for (const corner of ['tl', 'tr', 'bl', 'br']) this.plate.appendChild(h('i', `cc-screw cc-screw-${corner}`))
    this.title = h('div', 'cc-plate-title')
    this.subtitle = h('div', 'cc-plate-subtitle')
    this.list = h('div', 'cc-plate-list')
    this.footer = h('div', 'cc-plate-footer')
    this.plate.append(this.title, this.subtitle, this.list, this.footer)
    this.el.appendChild(this.plate)
    parent.appendChild(this.el)
    window.addEventListener('keydown', this.onKey)
  }

  get isOpen(): boolean { return this.spec !== null }

  /** Opens (or replaces) the plate. */
  open(spec: MenuSpec): void {
    this.spec = spec
    this.title.textContent = spec.title ?? copy.menu.title
    this.subtitle.replaceChildren(...(spec.subtitle ?? copy.menu.subtitle).map((line) => h('div', '', line)))
    this.footer.textContent = spec.footer ?? copy.menu.footer
    this.list.replaceChildren()
    this.rows = spec.items.map((item, i) => this.row(item, i))
    this.list.append(...this.rows)
    this.setFocus(spec.items.findIndex((it) => !it.disabled))
    this.el.classList.add('is-open')
  }

  close(): void {
    this.spec = null
    this.el.classList.remove('is-open')
  }

  private row(item: MenuItem, i: number): HTMLElement {
    const el = h('button', 'cc-plate-item' + (item.disabled ? ' is-disabled' : ''))
    el.setAttribute('type', 'button')
    if (item.disabled) el.setAttribute('aria-disabled', 'true')
    el.appendChild(h('span', 'cc-plate-label', item.label))
    if (item.hint) el.appendChild(h('span', 'cc-plate-hint', item.hint))
    el.addEventListener('pointerenter', () => { if (!item.disabled) this.setFocus(i) })
    // keyboard activation of a focused button arrives here as a click with detail 0; onKey already handles it
    el.addEventListener('click', (e) => { if (e.detail !== 0) this.pick(i) })
    return el
  }

  private setFocus(i: number): void {
    this.focus = i
    this.rows.forEach((r, j) => r.classList.toggle('is-focus', j === i))
  }

  private move(dir: 1 | -1): void {
    if (!this.spec) return
    const n = this.spec.items.length
    let i = this.focus
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n
      if (!this.spec.items[i].disabled) { this.setFocus(i); bus.emit('audio:sfx', { name: 'tick', velocity: 0.3 }); return }
    }
  }

  private pick(i: number): void {
    const spec = this.spec
    if (!spec) return
    const item = spec.items[i]
    if (!item || item.disabled) return
    bus.emit('audio:sfx', { name: 'seat', velocity: 0.6 })
    spec.onPick(item.id)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.spec) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.move(1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.move(-1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(this.focus) }
    else if (e.key === 'Escape' && this.spec.onClose) { e.preventDefault(); this.spec.onClose() }
  }
}
