// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PieceKey } from '../contracts/chess'
import { PIECE_KEYS } from '../contracts/chess'
import { STENCIL_TEXT, TRAY_HOLD_MS, cardOffsets, createTray, tallyText, type Tray } from './tray'

const names = Object.fromEntries(PIECE_KEYS.map((k) => [k, `Name ${k}`])) as Record<PieceKey, string>

describe('tray helpers', () => {
  it('words the tally as the bible has it', () => {
    expect(tallyText(2, 3)).toBe('Detained. W 2. E 3.')
  })
  it('spaces cards 30 rpx apart until they must overlap', () => {
    expect(cardOffsets(0)).toEqual([])
    expect(cardOffsets(1)).toEqual([0])
    expect(cardOffsets(3)).toEqual([0, 30, 60])
    const many = cardOffsets(15)
    expect(many.length).toBe(15)
    expect(many[14]).toBeCloseTo(166 - 28)
  })
})

describe('createTray', () => {
  let container: HTMLElement
  let tray: Tray
  let inspected: PieceKey[]
  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    inspected = []
    tray = createTray(container, { pieceNames: names, onInspect: (k) => inspected.push(k) })
  })
  afterEach(() => {
    tray.destroy()
    container.remove()
    vi.useRealTimers()
  })

  it('is hidden until a piece enters, and shows its furniture', () => {
    expect(tray.el.hasAttribute('data-tray')).toBe(true)
    expect(tray.el.hidden).toBe(true)
    expect(tray.el.getAttribute('data-tray-visible')).toBe('false')
    expect(tray.el.querySelector('[data-tray-stencil]')?.textContent).toBe(STENCIL_TEXT)
    expect(tray.el.querySelectorAll('.tray-bridge').length).toBe(2)
    expect(tray.el.querySelector('[data-tray-button]')).not.toBeNull()
    expect(tray.el.querySelector('[data-tray-tally]')?.textContent).toBe('Detained. W 0. E 0.')
    expect(tray.el.querySelector('[data-tray-tally]')?.classList.contains('paper')).toBe(true)
  })

  it('cuts in with a piece, counts the tally, and cuts out after the hold', () => {
    tray.add('bP')
    expect(tray.isVisible()).toBe(true)
    expect(tray.el.getAttribute('data-tray-visible')).toBe('true')
    expect(tray.el.querySelector('[data-tray-tally]')?.textContent).toBe('Detained. W 0. E 1.')
    const slot = tray.el.querySelector('[data-tray-row="b"] [data-tray-piece="bP"]')
    expect(slot).not.toBeNull()
    expect(slot?.getAttribute('aria-label')).toBe('Name bP')
    expect(slot?.querySelector('[data-tray-card]')?.classList.contains('paper')).toBe(true)
    expect(slot?.querySelector('[data-piece="bP"]')).not.toBeNull()
    vi.advanceTimersByTime(TRAY_HOLD_MS - 1)
    expect(tray.isVisible()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(tray.isVisible()).toBe(false)
  })

  it('shelves white in the top row and black in the second, left to right, and restarts the hold', () => {
    tray.add('wN', 'pearwood')
    vi.advanceTimersByTime(1500)
    tray.add('bB')
    tray.add('wP')
    const top = [...tray.el.querySelectorAll('[data-tray-row="w"] [data-tray-piece]')].map((s) => s.getAttribute('data-tray-piece'))
    expect(top).toEqual(['wN', 'wP'])
    expect(tray.el.querySelector('[data-tray-row="w"] [data-piece-variant="pearwood"]')).not.toBeNull()
    expect(tray.el.querySelectorAll('[data-tray-row="b"] [data-tray-piece]').length).toBe(1)
    expect(tray.counts()).toEqual({ w: 2, b: 1 })
    expect(tray.el.querySelector('[data-tray-tally]')?.textContent).toBe(tallyText(2, 1))
    const slots = [...tray.el.querySelectorAll('[data-tray-row="w"] [data-tray-piece]')] as HTMLElement[]
    expect(slots[0]?.style.left).toBe('calc(0 * var(--rpx))')
    expect(slots[1]?.style.left).toBe('calc(30 * var(--rpx))')
    vi.advanceTimersByTime(1500)
    expect(tray.isVisible()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(tray.isVisible()).toBe(false)
  })

  it('stays while pinned and hides when unpinned after the hold', () => {
    tray.setPinned(true)
    expect(tray.isVisible()).toBe(true)
    tray.add('bQ')
    vi.advanceTimersByTime(TRAY_HOLD_MS + 10)
    expect(tray.isVisible()).toBe(true)
    tray.setPinned(false)
    expect(tray.isVisible()).toBe(false)
    tray.add('bR')
    tray.setPinned(true)
    tray.setPinned(false)
    expect(tray.isVisible()).toBe(true)
    vi.advanceTimersByTime(TRAY_HOLD_MS)
    expect(tray.isVisible()).toBe(false)
  })

  it('reports a clicked piece for its face-down card', () => {
    tray.add('wQ')
    const slot = tray.el.querySelector('[data-tray-piece="wQ"]') as HTMLElement
    slot.click()
    expect(inspected).toEqual(['wQ'])
  })

  it('reset empties it', () => {
    tray.add('wQ')
    tray.add('bP')
    tray.reset()
    expect(tray.counts()).toEqual({ w: 0, b: 0 })
    expect(tray.el.querySelectorAll('[data-tray-piece]').length).toBe(0)
    expect(tray.isVisible()).toBe(false)
  })
})
