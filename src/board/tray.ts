/**
 * The tray insert, item 1-06, docs/visual.md section 6. 190 by 144 rpx
 * overhead: a Service Green tin with a rolled edge, HELD PENDING DUTY in Seal
 * Wax with stencil bridges drawn as 1-rpx gaps, captured pieces left to right
 * in two rows on face-down Boxwood cards, a tally card, and the twelfth
 * button. Cuts in with a piece and holds two seconds; stays while pinned.
 */
import type { Color, PieceKey } from '../contracts/chess'
import { applyPaper } from '../frame'
import { createPieceElement, type PieceVariant } from './pieces'

export const TRAY_HOLD_MS = 2000
export const STENCIL_TEXT = 'HELD PENDING DUTY'
export const TALLY_PREFIX = 'Detained.'
/** The box of a tray silhouette, in rpx. */
export const TRAY_PIECE_BOX_RPX = 34
export const TRAY_CARD_W_RPX = 28
export const TRAY_CARD_H_RPX = 18
/** Row width available for cards, in rpx (190 less 12 each side). */
export const TRAY_ROW_W_RPX = 166
export const TRAY_CARD_STEP_RPX = 30

export function tallyText(w: number, e: number): string {
  return `${TALLY_PREFIX} W ${w}. E ${e}.`
}

/** Left offsets of n cards in a row: 30 rpx apart until they must overlap. */
export function cardOffsets(n: number): number[] {
  if (n <= 0) return []
  const step = n === 1 ? 0 : Math.min(TRAY_CARD_STEP_RPX, (TRAY_ROW_W_RPX - TRAY_CARD_W_RPX) / (n - 1))
  return Array.from({ length: n }, (_, i) => i * step)
}

export interface TrayOptions {
  pieceNames: Record<PieceKey, string>
  /** A tray piece was clicked. The world raises its face-down card. */
  onInspect?: (key: PieceKey) => void
}

export interface Tray {
  readonly el: HTMLElement
  /** Empties the tray and hides it. */
  reset(): void
  /** Shelves a captured piece: cuts the insert in and holds it. */
  add(key: PieceKey, variant?: PieceVariant): void
  /** Keeps the insert visible while true (the tray in the scene is hovered). */
  setPinned(on: boolean): void
  isVisible(): boolean
  counts(): { w: number; b: number }
  destroy(): void
}

export function createTray(container: HTMLElement, options: TrayOptions): Tray {
  const doc = container.ownerDocument

  const root = doc.createElement('div')
  root.className = 'tray-insert'
  root.setAttribute('data-tray', '')
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', STENCIL_TEXT)
  root.hidden = true
  root.setAttribute('data-tray-visible', 'false')

  const edge = doc.createElement('div')
  edge.className = 'tray-rolled-edge'
  edge.setAttribute('aria-hidden', 'true')

  const stencil = doc.createElement('div')
  stencil.className = 'tray-stencil'
  stencil.setAttribute('data-tray-stencil', '')
  const stencilText = doc.createElement('span')
  stencilText.className = 'tray-stencil-text t-stencil'
  stencilText.textContent = STENCIL_TEXT
  // Stencil bridges: 1-rpx gaps in the tin's own colour across the letters.
  for (const top of [0.38, 0.64]) {
    const bridge = doc.createElement('span')
    bridge.className = 'tray-bridge'
    bridge.setAttribute('aria-hidden', 'true')
    bridge.style.top = `${top * 100}%`
    stencilText.appendChild(bridge)
  }
  stencil.appendChild(stencilText)

  // The twelfth button, lower left, half under the first card of the second row. Never moved.
  const button = doc.createElement('div')
  button.className = 'tray-button'
  button.setAttribute('data-tray-button', '')
  button.setAttribute('aria-hidden', 'true')

  const rows: Record<Color, HTMLElement> = {
    w: doc.createElement('div'),
    b: doc.createElement('div'),
  }
  for (const c of ['w', 'b'] as Color[]) {
    rows[c].className = 'tray-row'
    rows[c].setAttribute('data-tray-row', c)
  }

  const tally = applyPaper(doc.createElement('div'))
  tally.classList.add('tray-tally', 'shadow-line')
  tally.setAttribute('data-tray-tally', '')
  const tallyText_ = doc.createElement('span')
  tallyText_.className = 't-label'
  tallyText_.textContent = tallyText(0, 0)
  tally.appendChild(tallyText_)

  root.append(edge, stencil, button, rows.w, rows.b, tally)
  container.appendChild(root)

  const held: Record<Color, PieceKey[]> = { w: [], b: [] }
  let pinned = false
  let holdTimer: ReturnType<typeof setTimeout> | null = null

  const setVisible = (on: boolean): void => {
    root.hidden = !on
    root.setAttribute('data-tray-visible', on ? 'true' : 'false')
  }

  const layout = (color: Color): void => {
    const slots = Array.from(rows[color].children) as HTMLElement[]
    const offsets = cardOffsets(slots.length)
    slots.forEach((slot, i) => {
      slot.style.left = `calc(${offsets[i] ?? 0} * var(--rpx))`
    })
  }

  const updateTally = (): void => {
    tallyText_.textContent = tallyText(held.w.length, held.b.length)
  }

  return {
    el: root,
    reset() {
      held.w = []
      held.b = []
      rows.w.textContent = ''
      rows.b.textContent = ''
      updateTally()
      if (holdTimer !== null) clearTimeout(holdTimer)
      holdTimer = null
      setVisible(pinned)
    },
    add(key, variant = 'standard') {
      const color = key[0] as Color
      held[color].push(key)
      const slot = doc.createElement('button')
      slot.type = 'button'
      slot.className = 'tray-slot'
      slot.setAttribute('data-tray-piece', key)
      slot.setAttribute('data-tray-index', String(held[color].length - 1))
      slot.setAttribute('aria-label', options.pieceNames[key])
      const card = applyPaper(doc.createElement('span'))
      card.classList.add('tray-card', 'shadow-line')
      card.setAttribute('data-tray-card', '')
      card.setAttribute('aria-hidden', 'true')
      const piece = createPieceElement(key, {
        label: options.pieceNames[key],
        variant,
        boxRpx: TRAY_PIECE_BOX_RPX,
      })
      piece.setAttribute('aria-hidden', 'true')
      piece.removeAttribute('role')
      slot.append(card, piece)
      slot.addEventListener('click', () => options.onInspect?.(key))
      rows[color].appendChild(slot)
      layout(color)
      updateTally()
      setVisible(true)
      if (holdTimer !== null) clearTimeout(holdTimer)
      holdTimer = setTimeout(() => {
        holdTimer = null
        if (!pinned) setVisible(false)
      }, TRAY_HOLD_MS)
    },
    setPinned(on) {
      pinned = on
      if (on) setVisible(true)
      else if (holdTimer === null) setVisible(false)
    },
    isVisible() {
      return !root.hidden
    },
    counts() {
      return { w: held.w.length, b: held.b.length }
    },
    destroy() {
      if (holdTimer !== null) clearTimeout(holdTimer)
      root.remove()
    },
  }
}
