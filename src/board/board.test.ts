// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PieceKey, Square } from '../contracts/chess'
import { PIECE_KEYS } from '../contracts/chess'
import { ALL_SQUARES, createBoardView, isDark, neighbour, squareAtPoint, squareOrigin, type BoardHandlers, type BoardView } from './board'
import { Game } from './game'

const names = Object.fromEntries(PIECE_KEYS.map((k) => [k, `Name ${k}`])) as Record<PieceKey, string>

describe('board geometry', () => {
  it('lays squares out from the band, white at the bottom or black', () => {
    expect(squareOrigin('a1', 'w')).toEqual({ x: 30, y: 450 })
    expect(squareOrigin('h8', 'w')).toEqual({ x: 450, y: 30 })
    expect(squareOrigin('a1', 'b')).toEqual({ x: 450, y: 30 })
    expect(squareOrigin('e4', 'w')).toEqual({ x: 270, y: 270 })
    expect(squareAtPoint(31, 451, 'w')).toBe('a1')
    expect(squareAtPoint(31, 451, 'b')).toBe('h8')
    expect(squareAtPoint(10, 10, 'w')).toBeNull()
    expect(squareAtPoint(535, 300, 'w')).toBeNull()
  })
  it('tones squares as a board does', () => {
    expect(isDark('a1')).toBe(true)
    expect(isDark('h1')).toBe(false)
    expect(isDark('e4')).toBe(false)
    expect(isDark('d4')).toBe(true)
    expect(ALL_SQUARES.length).toBe(64)
  })
  it('walks the cursor in screen directions for either orientation', () => {
    expect(neighbour('e2', 'ArrowUp', 'w')).toBe('e3')
    expect(neighbour('e2', 'ArrowUp', 'b')).toBe('e1')
    expect(neighbour('a1', 'ArrowLeft', 'w')).toBeNull()
    expect(neighbour('a1', 'ArrowLeft', 'b')).toBe('b1')
    expect(neighbour('h8', 'ArrowRight', 'w')).toBeNull()
    expect(neighbour('e2', 'Tab', 'w')).toBeNull()
  })
})

describe('createBoardView', () => {
  let container: HTMLElement
  let view: BoardView
  let game: Game
  let moves: string[]
  let inspected: string[]
  let accept: boolean

  const handlers: BoardHandlers = {
    onMove: (from, to, promotion) => {
      moves.push(`${from}${to}${promotion ?? ''}`)
      return accept
    },
    onInspect: (key, square) => {
      inspected.push(`${key}@${square}`)
    },
    canPick: (square) => {
      const p = game.pieceAt(square)
      return p !== null && p.color === game.turn()
    },
    destinations: (from) => game.destinations(from),
    needsPromotion: (from, to) => game.needsPromotion(from, to),
  }

  const placements = (): { square: Square; key: PieceKey }[] =>
    game.pieces().map((p) => ({ square: p.square, key: `${p.color}${p.type.toUpperCase()}` as PieceKey }))

  const square = (sq: string): HTMLButtonElement => container.querySelector(`button.square[data-square="${sq}"]`) as HTMLButtonElement
  const piece = (sq: string): SVGSVGElement => container.querySelector(`.piece[data-square="${sq}"]`) as SVGSVGElement

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    game = new Game()
    moves = []
    inspected = []
    accept = true
    view = createBoardView(container, { orientation: 'w', interactive: true, pieceNames: names }, handlers)
    view.setPosition(placements())
  })
  afterEach(() => {
    view.destroy()
    container.remove()
    vi.useRealTimers()
  })

  it('is hidden until shown and carries its hooks', () => {
    expect(view.el.hasAttribute('data-board')).toBe(true)
    expect(view.el.hidden).toBe(true)
    view.show()
    expect(view.el.hidden).toBe(false)
    expect(view.el.getAttribute('data-board-visible')).toBe('true')
    view.hide()
    expect(view.el.getAttribute('data-board-visible')).toBe('false')
  })

  it('draws 64 squares with data-square, 32 tones each, the hatch, the strip and one set of coordinates', () => {
    const squares = container.querySelectorAll('button.square[data-square]')
    expect(squares.length).toBe(64)
    expect(container.querySelectorAll('[data-board-tone="dark"]').length).toBe(32)
    expect(container.querySelectorAll('[data-board-tone="light"]').length).toBe(32)
    const pattern = container.querySelector('pattern[data-board-hatch]')
    expect(pattern?.getAttribute('patternTransform')).toBe('rotate(45)')
    expect(pattern?.getAttribute('width')).toBe('5')
    expect(pattern?.querySelector('.board-hatch-line')?.getAttribute('width')).toBe('3')
    const dark = container.querySelector('[data-board-tone="dark"]')
    expect(dark?.getAttribute('fill')).toMatch(/^url\(#board-hatch-\d+\)$/)
    const strip = container.querySelector('[data-board-strip]')
    expect(strip?.getAttribute('y')).toBe('268.5')
    expect(strip?.getAttribute('height')).toBe('3')
    expect(container.querySelectorAll('[data-board-coord="file"]').length).toBe(8)
    expect(container.querySelectorAll('[data-board-coord="rank"]').length).toBe(8)
    const a = container.querySelector('[data-board-coord="file"]')
    expect(a?.textContent).toBe('a')
    expect(a?.getAttribute('x')).toBe('60')
    expect(a?.getAttribute('y')).toBe('525')
    expect(a?.classList.contains('t-coords')).toBe(true)
    expect(square('a1').style.left).toBe('calc(30 * var(--rpx))')
    expect(square('a1').style.top).toBe('calc(450 * var(--rpx))')
  })

  it('places 32 pieces with keys, squares, labels and the two singular shapes', () => {
    const pieces = container.querySelectorAll('.piece[data-piece]')
    expect(pieces.length).toBe(32)
    expect(piece('e1').getAttribute('data-piece')).toBe('wK')
    expect(piece('e1').getAttribute('aria-label')).toBe('Name wK')
    expect(piece('b1').getAttribute('data-piece-variant')).toBe('pearwood')
    expect(piece('g1').hasAttribute('data-piece-variant')).toBe(false)
    expect(piece('g7').getAttribute('data-piece-variant')).toBe('notch')
    expect(square('e1').getAttribute('aria-label')).toBe('e1. Name wK')
    expect(square('e4').getAttribute('aria-label')).toBe('e4')
    // The king's box is 52.8 rpx, centred in its square, standing on the baseline.
    expect(piece('e1').style.transform).toBe('translate(calc(273.6 * var(--rpx)), calc(453.6 * var(--rpx)))')
  })

  it('flips for black and keeps the strip where it is', () => {
    view.setOrientation('b')
    expect(view.el.getAttribute('data-board-orientation')).toBe('b')
    expect(square('a1').style.left).toBe('calc(450 * var(--rpx))')
    expect(square('a1').style.top).toBe('calc(30 * var(--rpx))')
    expect(container.querySelector('[data-board-strip]')?.getAttribute('y')).toBe('268.5')
    const h = [...container.querySelectorAll('[data-board-coord="file"]')].find((e) => e.textContent === 'h')
    expect(h?.getAttribute('x')).toBe('60')
    expect(piece('e8').style.transform).toBe('translate(calc(213.6 * var(--rpx)), calc(453.6 * var(--rpx)))')
  })

  it('selects an own piece on click, shows discs and rings in ink, and clears on a second click', () => {
    piece('e2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(view.el.getAttribute('data-board-selected')).toBe('e2')
    expect(inspected).toEqual(['wP@e2'])
    const sel = container.querySelector('[data-board-mark="selection"]')
    expect(sel?.getAttribute('x')).toBe('273.5')
    expect(sel?.getAttribute('width')).toBe('53')
    expect(container.querySelectorAll('[data-board-mark="disc"]').length).toBe(2)
    expect(container.querySelector('[data-board-mark="disc"]')?.getAttribute('r')).toBe('5.5')
    expect(container.querySelectorAll('[data-board-mark="ring"]').length).toBe(0)
    piece('e2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(view.el.hasAttribute('data-board-selected')).toBe(false)
    expect(container.querySelectorAll('[data-board-mark]').length).toBe(0)
  })

  it('rings an occupied destination', () => {
    game.move('e2e4')
    game.move('d7d5')
    view.setPosition(placements())
    piece('e4').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const ring = container.querySelector('[data-board-mark="ring"]')
    expect(ring?.getAttribute('data-square')).toBe('d5')
    expect(ring?.getAttribute('r')).toBe('26')
  })

  it('asks for the move on click-then-click and slides the piece; ticks mark the last move', async () => {
    piece('e2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    square('e4').click()
    expect(moves).toEqual(['e2e4'])
    const record = game.move('e2e4')
    if (!record) throw new Error('no record')
    const done = view.animateMove(record)
    expect(piece('e4')).not.toBeNull()
    expect(piece('e4').style.transitionDuration).toBe('240ms')
    await vi.advanceTimersByTimeAsync(240)
    await done
    expect(piece('e2')).toBeNull()
    const ticks = container.querySelectorAll('[data-board-mark="last-move"]')
    expect(ticks.length).toBe(2)
    expect(ticks[0]?.querySelectorAll('path').length).toBe(4)
    expect(ticks[0]?.classList.contains('board-mark-tick')).toBe(true)
    expect(square('e4').getAttribute('aria-label')).toBe('e4. Name wP')
  })

  it('puts the piece back when the move is refused', () => {
    accept = false
    piece('e2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    square('e4').click()
    expect(moves).toEqual(['e2e4'])
    expect(piece('e2')).not.toBeNull()
    expect(view.el.hasAttribute('data-board-selected')).toBe(false)
  })

  it('does nothing for a square that is not a destination, and only inspects when not interactive', () => {
    piece('e2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    square('e5').click()
    expect(moves).toEqual([])
    expect(view.el.hasAttribute('data-board-selected')).toBe(false)
    view.setInteractive(false)
    piece('d2').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(view.el.hasAttribute('data-board-selected')).toBe(false)
    expect(inspected).toEqual(['wP@e2', 'wP@d2'])
    square('d4').click()
    expect(moves).toEqual([])
  })

  it('moves by keyboard: arrows walk the cursor, Enter selects and moves, Escape cancels', () => {
    const e2 = square('e2')
    expect(square('e1').tabIndex).toBe(0)
    square('e1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(view.cursor()).toBe('e2')
    expect(e2.tabIndex).toBe(0)
    expect(square('e1').tabIndex).toBe(-1)
    e2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(view.el.getAttribute('data-board-selected')).toBe('e2')
    e2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(view.el.hasAttribute('data-board-selected')).toBe(false)
    e2.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    e2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    square('e3').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(view.cursor()).toBe('e4')
    square('e4').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(moves).toEqual(['e2e4'])
  })

  it('drags a piece and drops it on a square', () => {
    const p = piece('e2')
    p.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }))
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: -30 }))
    expect(p.hasAttribute('data-dragging')).toBe(true)
    expect(view.el.getAttribute('data-board-selected')).toBe('e2')
    expect(p.style.transform).toContain('10px')
    square('e4').dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: -30 }))
    expect(moves).toEqual(['e2e4'])
    expect(p.hasAttribute('data-dragging')).toBe(false)
  })

  it('returns a dragged piece dropped off its destinations', () => {
    const p = piece('e2')
    p.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }))
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0 }))
    square('h5').dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 0 }))
    expect(moves).toEqual([])
    expect(p.style.transform).toBe('translate(calc(283.2 * var(--rpx)), calc(412.8 * var(--rpx)))')
  })

  it('raises the promotion card and waits; a choice completes the move, Escape cancels', async () => {
    game = new Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' })
    view.setPosition(placements())
    piece('a7').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    square('a8').click()
    await vi.advanceTimersByTimeAsync(0)
    const card = container.querySelector('[data-promotion]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.getAttribute('data-promotion')).toBe('a8')
    expect(card.classList.contains('paper')).toBe(true)
    expect(card.querySelector('.t-roster')?.textContent).toBe('RE-ENTERED AS')
    const choices = [...card.querySelectorAll('[data-promotion-choice]')].map((b) => b.getAttribute('data-promotion-choice'))
    expect(choices).toEqual(['q', 'r', 'b', 'n'])
    expect(card.querySelectorAll('.piece[data-piece-color="w"]').length).toBe(4)
    expect(card.style.top).toBe('calc(90 * var(--rpx))')
    expect(moves).toEqual([])
    ;(card.querySelector('[data-promotion-choice="n"]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(0)
    expect(moves).toEqual(['a7a8n'])
    expect(container.querySelector('[data-promotion]')).toBeNull()

    piece('a7').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    square('a8').click()
    await vi.advanceTimersByTimeAsync(0)
    const card2 = container.querySelector('[data-promotion]') as HTMLElement
    card2.querySelector('[data-promotion-choice="q"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(container.querySelector('[data-promotion]')).toBeNull()
    expect(moves).toEqual(['a7a8n'])
  })

  it('slides both pieces on castling, exits a taken piece toward the a-file and reports it', async () => {
    for (const m of ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5']) game.move(m)
    view.setPosition(placements())
    const castle = game.move('e1g1')
    if (!castle) throw new Error('no castle')
    const done = view.animateMove(castle)
    expect(piece('g1').getAttribute('data-piece')).toBe('wK')
    expect(piece('f1').getAttribute('data-piece')).toBe('wR')
    await vi.advanceTimersByTimeAsync(240)
    await done

    game.move('f6e4')
    view.setPosition(placements())
    const take = game.move('c4f7')
    if (!take) throw new Error('no capture')
    const bishop = piece('c4')
    const pawn = piece('f7')
    const p = view.animateMove(take)
    expect(pawn.style.transitionDuration).toBe('320ms')
    expect(pawn.style.transform).toBe('translate(calc(-53.6 * var(--rpx)), calc(112.8 * var(--rpx)))')
    expect(pawn.hasAttribute('data-piece-taken')).toBe(true)
    expect(bishop.style.transform).toBe('translate(calc(157.2 * var(--rpx)), calc(280.8 * var(--rpx)))')
    await vi.advanceTimersByTimeAsync(80)
    expect(bishop.getAttribute('data-square')).toBe('f7')
    await vi.advanceTimersByTimeAsync(320)
    const outcome = await p
    expect(outcome.taken).toEqual({ key: 'bP', variant: 'standard' })
    expect(pawn.isConnected).toBe(false)
    expect(container.querySelectorAll('.piece[data-piece]').length).toBe(30)
  })

  it('doubles the hairline on a king in check and clears it', () => {
    view.setCheck('e8')
    const check = container.querySelector('[data-board-mark="check"]')
    expect(check?.querySelectorAll('rect').length).toBe(2)
    expect(check?.querySelectorAll('rect')[0]?.getAttribute('x')).toBe('272.5')
    expect(check?.querySelectorAll('rect')[1]?.getAttribute('x')).toBe('275.5')
    expect(view.el.getAttribute('data-board-check')).toBe('e8')
    view.setCheck(null)
    expect(container.querySelector('[data-board-mark="check"]')).toBeNull()
  })

  it('returns every piece home in 600 ms, including those taken', async () => {
    game.move('e2e4')
    game.move('d7d5')
    view.setPosition(placements())
    const take = game.move('e4d5')
    if (!take) throw new Error('no capture')
    const a = view.animateMove(take)
    await vi.advanceTimersByTimeAsync(400)
    await a
    expect(container.querySelectorAll('.piece[data-piece]').length).toBe(31)
    const r = view.returnPieces()
    await vi.advanceTimersByTimeAsync(0)
    expect(container.querySelectorAll('.piece[data-piece]').length).toBe(32)
    // Homes are the squares held when the position was set: d5 and e4 here.
    expect(piece('d5').getAttribute('data-piece')).toBe('bP')
    expect(piece('e4').getAttribute('data-piece')).toBe('wP')
    expect(piece('e4').style.transitionDuration).toBe('600ms')
    await vi.advanceTimersByTimeAsync(600)
    await r
    expect(container.querySelectorAll('[data-board-mark]').length).toBe(0)
  })
})
