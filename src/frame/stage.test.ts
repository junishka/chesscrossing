// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Palette } from '../contracts/frame'
import { CARD_HOLD_MS, FADE_MS, WHIP_MS } from './motion'
import { cardLayout, cardLineClass, createStage, type StageExtras } from './stage'
import type { Stage } from '../contracts/frame'

const ROOM_ONE: Palette = {
  wall: '#6E7D69',
  wood: '#5A4530',
  light: '#D8BE8C',
  dark: '#2B1F19',
  wax: '#A0281E',
  ink: '#202834',
}

describe('createStage', () => {
  let root: HTMLElement
  let stage: Stage & StageExtras
  beforeEach(() => {
    vi.useFakeTimers()
    root = document.createElement('div')
    document.body.appendChild(root)
    stage = createStage(root)
  })
  afterEach(() => {
    stage.destroy()
    root.remove()
    vi.useRealTimers()
  })

  it('mounts the stage with its hooks', () => {
    expect(stage.el.hasAttribute('data-stage')).toBe(true)
    expect(stage.content.hasAttribute('data-stage-content')).toBe(true)
    expect(root.querySelector('[data-stage] [data-stage-plane] [data-stage-content]')).toBe(stage.content)
    expect(root.classList.contains('frame-root')).toBe(true)
    expect(stage.el.querySelector('filter#frame-grain feTurbulence')?.getAttribute('baseFrequency')).toBe('0.9')
    expect(stage.el.querySelector('filter#frame-grain feTurbulence')?.getAttribute('numOctaves')).toBe('2')
  })

  it('sets the root font size to stage height / 50 and --rpx to one reference pixel', () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const scale = Math.min(w / 1600, h / 900)
    expect(document.documentElement.style.fontSize).toBe(`${(900 * scale) / 50}px`)
    expect(document.documentElement.style.getPropertyValue('--rpx')).toBe(`${scale}px`)
    expect(stage.el.style.width).toBe(`${1600 * scale}px`)
    expect(stage.el.style.height).toBe(`${900 * scale}px`)
  })

  it('setPalette writes the six room tokens on the stage element', () => {
    stage.setPalette(ROOM_ONE)
    const s = stage.el.style
    expect(s.getPropertyValue('--c-wall')).toBe('#6E7D69')
    expect(s.getPropertyValue('--c-wood')).toBe('#5A4530')
    expect(s.getPropertyValue('--c-light')).toBe('#D8BE8C')
    expect(s.getPropertyValue('--c-dark')).toBe('#2B1F19')
    expect(s.getPropertyValue('--c-wax')).toBe('#A0281E')
    expect(s.getPropertyValue('--c-ink')).toBe('#202834')
  })

  it('showCard fades the first card up over 600 ms, holds 4000 ms, then resolves and keeps the card as the held frame', async () => {
    let resolved = false
    const p = stage.showCard(['REPUBLIC OF VARDENNE', 'MINISTRY OF WAYS AND FRONTIERS. FRONTIER PROPERTY DIVISION']).then(() => {
      resolved = true
    })
    const card = stage.el.querySelector<HTMLElement>('[data-card]')
    expect(card).not.toBeNull()
    expect(card?.getAttribute('data-card-kind')).toBe('title')
    expect(card?.getAttribute('data-card-fade')).toBe('up')
    expect(card?.querySelector('.t-card-1')?.textContent).toBe('REPUBLIC OF VARDENNE')
    expect(card?.querySelector('.t-card-ministry')?.textContent).toBe('MINISTRY OF WAYS AND FRONTIERS. FRONTIER PROPERTY DIVISION')

    await vi.advanceTimersByTimeAsync(FADE_MS + CARD_HOLD_MS - 1)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(resolved).toBe(true)
    expect(stage.el.querySelector('[data-card]')).toBe(card)
    expect(card?.getAttribute('data-card-state')).toBe('held')
  })

  it('the second card cuts in and holds without a fade', async () => {
    const first = stage.showCard(['A'])
    await vi.advanceTimersByTimeAsync(FADE_MS + CARD_HOLD_MS)
    await first
    let resolved = false
    const second = stage.showCard(['B'], { holdMs: 1000 }).then(() => {
      resolved = true
    })
    const cards = stage.el.querySelectorAll('[data-card]')
    expect(cards.length).toBe(1)
    expect(cards[0]?.hasAttribute('data-card-fade')).toBe(false)
    await vi.advanceTimersByTimeAsync(999)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await second
    expect(resolved).toBe(true)
  })

  it('a click advances the card', async () => {
    let resolved = false
    const p = stage.showCard(['A']).then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(FADE_MS + 100)
    stage.el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await p
    expect(resolved).toBe(true)
  })

  it('a key advances the card, a modifier alone does not', async () => {
    const first = stage.showCard(['A'])
    await vi.advanceTimersByTimeAsync(FADE_MS + CARD_HOLD_MS)
    await first
    let resolved = false
    const p = stage.showCard(['B'], { waitForInput: true }).then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(10000)
    expect(resolved).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    await p
    expect(resolved).toBe(true)
  })

  it('chapter cards carry the chapter classes', async () => {
    const p = stage.showCard(['I.', 'ROOM 1', 'THE DECLARATIONS ROOM', '', 'Goods were declared here until 1961.'], {
      kind: 'chapter',
      holdMs: 1,
    })
    const card = stage.el.querySelector<HTMLElement>('[data-card]')
    expect(card?.getAttribute('data-card-kind')).toBe('chapter')
    expect(card?.querySelector('.t-chapter-numeral')?.textContent).toBe('I.')
    expect(card?.querySelector('.t-chapter-room')?.textContent).toBe('ROOM 1')
    expect(card?.querySelector('.t-chapter-title')?.textContent).toBe('THE DECLARATIONS ROOM')
    expect(card?.querySelector('.t-chapter-line')?.textContent).toBe('Goods were declared here until 1961.')
    expect(card?.querySelectorAll('.stage-card-gap').length).toBe(1)
    await vi.advanceTimersByTimeAsync(FADE_MS + 10)
    await p
  })

  it('a body card is a left-aligned block with labels in 500 and the text unchanged', () => {
    const lines = ['Property: Frontier Post No. 7 (Marle-on-Lisk), known locally as the Crossing.', 'Post vacated: 2 March 1977.']
    expect(cardLayout('title', lines)).toBe('block')
    expect(cardLayout('title', ['REPUBLIC OF VARDENNE'])).toBe('centred')
    void stage.showCard(lines, { holdMs: 1 })
    const inner = stage.el.querySelector('[data-card-layout]')
    expect(inner?.getAttribute('data-card-layout')).toBe('block')
    const ps = inner?.querySelectorAll('p.t-card-body') ?? []
    expect(ps.length).toBe(2)
    expect(ps[0]?.textContent).toBe(lines[0])
    expect(ps[0]?.querySelector('.t-card-label')?.textContent).toBe('Property:')
    expect(ps[1]?.querySelector('.t-card-label')?.textContent).toBe('Post vacated:')
  })

  it('cardLineClass follows the typography table', () => {
    expect(cardLineClass('title', 'centred', 0, 0)).toBe('t-card-1')
    expect(cardLineClass('title', 'centred', 0, 1)).toBe('t-card-ministry')
    expect(cardLineClass('title', 'centred', 1, 0)).toBe('t-card-form')
    expect(cardLineClass('title', 'centred', 1, 1)).toBe('t-card-body')
    expect(cardLineClass('title', 'block', 0, 0)).toBe('t-card-body')
    expect(cardLineClass('chapter', 'centred', 1, 0)).toBe('t-chapter-line')
    expect(cardLineClass('intertitle', 'centred', 0, 0)).toBe('t-card-form')
  })

  it('whipPan moves the plane one stage width in 380 ms, calls swap at the midpoint and removes the card', async () => {
    const first = stage.showCard(['I.'], { kind: 'chapter' })
    await vi.advanceTimersByTimeAsync(FADE_MS + CARD_HOLD_MS)
    await first
    const card = stage.el.querySelector('[data-card]')
    expect(card).not.toBeNull()

    let swappedAt = -1
    let settled = false
    const start = Date.now()
    const pan = stage.whipPan('left', () => {
      swappedAt = Date.now() - start
      stage.content.textContent = 'room'
    }).then(() => {
      settled = true
    })
    expect(stage.plane.style.transform).toBe('translateX(-100%)')
    expect(stage.plane.style.transition).toContain('380ms')
    expect(stage.plane.style.transition).toContain('cubic-bezier(0.65, 0, 0.35, 1)')
    expect(stage.content.style.transform).toBe('translateX(100%)')
    expect(stage.el.getAttribute('data-stage-motion')).toBe('whip')

    await vi.advanceTimersByTimeAsync(WHIP_MS / 2 - 1)
    expect(swappedAt).toBe(-1)
    await vi.advanceTimersByTimeAsync(1)
    expect(swappedAt).toBe(WHIP_MS / 2)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(WHIP_MS / 2)
    await pan
    expect(settled).toBe(true)
    expect(stage.el.querySelector('[data-card]')).toBeNull()
    expect(stage.plane.style.transform).toBe('translateX(0)')
    expect(stage.content.style.transform).toBe('translateX(0%)')
    expect(stage.content.textContent).toBe('room')
    expect(stage.el.hasAttribute('data-stage-motion')).toBe(false)
  })

  it('track slides the content by a fraction of the stage width', async () => {
    const p = stage.track(-0.5, 700)
    expect(stage.content.style.transform).toBe('translateX(-50%)')
    expect(stage.content.style.transition).toContain('700ms')
    await vi.advanceTimersByTimeAsync(700)
    await p
    const q = stage.track(-0.5)
    expect(stage.content.style.transform).toBe('translateX(-100%)')
    await vi.advanceTimersByTimeAsync(700)
    await q
  })
})
