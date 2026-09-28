// The cursor: the system pointer is hidden over the scene and replaced by a small ink circle with a
// paper ring; over a hotspot it opens into a ring with a centre dot. The cursor may change shape; nothing
// in the world moves on hover (docs/BIBLE.md §11). The hover label is a letterspaced plate that appears at
// the bottom of the frame, where the bible puts the card, and does not follow the pointer.
import { h } from './overlay'

/** Custom cursor and the hover label at the foot of the frame. */
export class CursorLayer {
  readonly dot: HTMLElement
  readonly label: HTMLElement
  private x = -100
  private y = -100
  private enabled = false
  private overUi = false
  private seen = false
  private text: string | null = null
  private container: HTMLElement

  constructor(parent: HTMLElement, container: HTMLElement) {
    this.container = container
    this.dot = h('div', 'cc-cursor')
    this.label = h('div', 'cc-hover cc-caps')
    parent.append(this.label, this.dot)
    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('pointerdown', this.onMove, { passive: true })
    document.addEventListener('pointerleave', this.onLeave)
    window.addEventListener('blur', this.onLeave)
  }

  /** Enables the custom cursor (hides the system one over the container). */
  enable(on: boolean): void {
    this.enabled = on
    this.container.style.cursor = on ? 'none' : ''
    this.apply()
  }

  /** Sets the hover label; `null` clears it and returns the cursor to its plain form. The position is ignored: the label lives at the foot of the frame. */
  setLabel(text: string | null, x?: number, y?: number): void {
    this.text = text && text.trim() ? text : null
    if (x !== undefined && y !== undefined) { this.x = x; this.y = y }
    this.label.textContent = this.text ?? ''
    this.dot.classList.toggle('is-hot', this.text !== null)
    this.apply()
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerdown', this.onMove)
    document.removeEventListener('pointerleave', this.onLeave)
    window.removeEventListener('blur', this.onLeave)
    this.container.style.cursor = ''
  }

  private onMove = (e: PointerEvent): void => {
    const r = this.container.getBoundingClientRect()
    this.x = e.clientX - r.left
    this.y = e.clientY - r.top
    this.seen = true
    const target = e.target as Element | null
    this.overUi = !!target?.closest('.cc-interactive')
    this.dot.style.transform = `translate(${this.x}px, ${this.y}px)`
    this.apply()
  }

  private onLeave = (): void => {
    this.dot.classList.remove('is-on')
    this.label.classList.remove('is-on')
  }

  private apply(): void {
    const visible = this.enabled && this.seen && !this.overUi
    this.dot.classList.toggle('is-on', visible)
    this.label.classList.toggle('is-on', this.text !== null && !this.overUi)
  }
}
