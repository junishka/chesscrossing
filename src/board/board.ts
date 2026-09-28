/**
 * The board insert, docs/visual.md section 6, and how the pieces move,
 * section 7. 540 by 540 rpx: a 30-rpx Marle Oak band, eight ranks of 60-rpx
 * squares, light squares solid Boxwood, dark squares a 45 degree Ebony hatch
 * over Boxwood, the declarations line between the fourth and fifth ranks,
 * coordinates once in the lower and left bands. Input by click, drag and
 * keyboard. Every indicator is Iron Gall, no colour, no transition.
 */
import type { Color, MoveRecord, PieceKey, PieceType, Square } from '../contracts/chess'
import { pieceKey } from '../contracts/chess'
import { applyPaper, motionMs, wait } from '../frame'
import { PIECE_HEIGHT, createPieceElement, variantFor, type PieceVariant } from './pieces'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const INSERT_RPX = 540
export const BAND_RPX = 30
export const SQUARE_RPX = 60
export const STRIP_RPX = 4
/** Where a piece's baseline sits in its square: 3.6 rpx above the lower edge, so the king clears the top by the same. */
export const BASELINE_RPX = SQUARE_RPX - (SQUARE_RPX - SQUARE_RPX * PIECE_HEIGHT.k) / 2
/** A captured piece slides to a point 20 rpx beyond the frame on the a-file side. */
export const EXIT_RPX = 20
export const PIECE_MS = 240
export const CAPTURE_MS = 320
export const CAPTURE_STAGGER_MS = 80
export const RETURN_MS = 600
export const PROMOTION_W_RPX = 168
export const PROMOTION_H_RPX = 100
export const PROMOTION_PIECE_RPX = 44
export const PROMOTION_ROSTER = 'RE-ENTERED AS'
export const PROMOTION_CHOICES: readonly PieceType[] = ['q', 'r', 'b', 'n']
/** Pixels of pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 3

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export const ALL_SQUARES: readonly Square[] = RANKS.flatMap((r) => FILES.map((f) => `${f}${r}` as Square))

export function fileIndex(square: Square): number {
  return square.charCodeAt(0) - 97
}
export function rankIndex(square: Square): number {
  return Number(square[1]) - 1
}
export function isDark(square: Square): boolean {
  return (fileIndex(square) + rankIndex(square)) % 2 === 0
}

/** Top-left corner of a square in board units, for an orientation. */
export function squareOrigin(square: Square, orientation: Color): { x: number; y: number } {
  const f = fileIndex(square)
  const r = rankIndex(square)
  const col = orientation === 'w' ? f : 7 - f
  const row = orientation === 'w' ? 7 - r : r
  return { x: BAND_RPX + col * SQUARE_RPX, y: BAND_RPX + row * SQUARE_RPX }
}

/** The square at a point in board units, or null in the band. */
export function squareAtPoint(x: number, y: number, orientation: Color): Square | null {
  const col = Math.floor((x - BAND_RPX) / SQUARE_RPX)
  const row = Math.floor((y - BAND_RPX) / SQUARE_RPX)
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  const f = orientation === 'w' ? col : 7 - col
  const r = orientation === 'w' ? 7 - row : row
  return `${FILES[f]}${RANKS[r]}` as Square
}

/** The neighbour of a square in a screen direction, for an orientation. */
export function neighbour(square: Square, key: string, orientation: Color): Square | null {
  let f = fileIndex(square)
  let r = rankIndex(square)
  const sign = orientation === 'w' ? 1 : -1
  switch (key) {
    case 'ArrowUp':
      r += sign
      break
    case 'ArrowDown':
      r -= sign
      break
    case 'ArrowRight':
      f += sign
      break
    case 'ArrowLeft':
      f -= sign
      break
    default:
      return null
  }
  if (f < 0 || f > 7 || r < 0 || r > 7) return null
  return `${FILES[f]}${RANKS[r]}` as Square
}

export interface PiecePlacement {
  square: Square
  key: PieceKey
  variant?: PieceVariant
}

export interface BoardHandlers {
  /**
   * The player asks for a move. Return true when it was played (the view then
   * expects animateMove) or false to put the piece back.
   */
  onMove(from: Square, to: Square, promotion?: PieceType): boolean
  /** A piece was clicked or activated. */
  onInspect(key: PieceKey, square: Square): void
  /** Whether the player may pick up the piece on a square now. */
  canPick(square: Square): boolean
  /** Legal destinations from a square for the player, now. */
  destinations(from: Square): Square[]
  /** Whether from to to is a promotion. */
  needsPromotion(from: Square, to: Square): boolean
}

export interface BoardViewOptions {
  orientation: Color
  interactive: boolean
  pieceNames: Record<PieceKey, string>
}

interface PieceView {
  el: SVGSVGElement
  key: PieceKey
  variant: PieceVariant
  square: Square
  home: Square
}

export interface MoveOutcome {
  /** The piece that left the board, if the move was a capture. */
  taken?: { key: PieceKey; variant: PieceVariant }
}

export interface BoardView {
  readonly el: HTMLElement
  /** Places pieces at once, with no motion. Clears every mark. */
  setPosition(pieces: readonly PiecePlacement[]): void
  setOrientation(color: Color): void
  orientation(): Color
  setInteractive(on: boolean): void
  show(): void
  hide(): void
  isVisible(): boolean
  /** Slides the pieces of a played move. Resolves when they have arrived, naming the figurine taken, if one was. */
  animateMove(record: MoveRecord): Promise<MoveOutcome>
  /** The doubled hairline on a king's square, or none. */
  setCheck(square: Square | null): void
  /** Corner ticks on the last move's squares, or none. */
  setLastMove(from: Square | null, to: Square | null): void
  clearSelection(): void
  /** Every piece, including those taken, slides to its home square. */
  returnPieces(): Promise<void>
  /** The square the keyboard cursor is on. */
  cursor(): Square
  destroy(): void
}

let hatchCounter = 0

export function createBoardView(container: HTMLElement, options: BoardViewOptions, handlers: BoardHandlers): BoardView {
  const doc = container.ownerDocument
  let orientation: Color = options.orientation
  let interactive = options.interactive
  let selected: Square | null = null
  let lastMove: { from: Square; to: Square } | null = null
  let checkSquare: Square | null = null
  let cursor: Square = orientation === 'w' ? 'e1' : 'e8'
  let promotion: { card: HTMLElement; from: Square; to: Square; resolve: (p: PieceType | null) => void } | null = null
  let suppressClick = false

  const views = new Map<Square, PieceView>()
  const taken: PieceView[] = []

  // ---------- Structure ----------

  const root = doc.createElement('div')
  root.className = 'board-insert hairline'
  root.setAttribute('data-board', '')
  root.setAttribute('data-board-orientation', orientation)
  root.hidden = true
  root.setAttribute('data-board-visible', 'false')

  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'board-svg')
  svg.setAttribute('viewBox', `0 0 ${INSERT_RPX} ${INSERT_RPX}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const hatchId = `board-hatch-${++hatchCounter}`
  const defs = doc.createElementNS(SVG_NS, 'defs')
  const pattern = doc.createElementNS(SVG_NS, 'pattern')
  pattern.setAttribute('id', hatchId)
  pattern.setAttribute('data-board-hatch', '')
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', '5')
  pattern.setAttribute('height', '5')
  pattern.setAttribute('patternTransform', 'rotate(45)')
  const ground = doc.createElementNS(SVG_NS, 'rect')
  ground.setAttribute('class', 'board-hatch-ground')
  ground.setAttribute('width', '5')
  ground.setAttribute('height', '5')
  const line = doc.createElementNS(SVG_NS, 'rect')
  line.setAttribute('class', 'board-hatch-line')
  line.setAttribute('width', '3')
  line.setAttribute('height', '5')
  pattern.append(ground, line)
  defs.appendChild(pattern)

  const band = doc.createElementNS(SVG_NS, 'rect')
  band.setAttribute('class', 'board-band')
  band.setAttribute('width', String(INSERT_RPX))
  band.setAttribute('height', String(INSERT_RPX))

  const tones = doc.createElementNS(SVG_NS, 'g')
  tones.setAttribute('data-board-tones', '')
  const toneRects = new Map<Square, SVGRectElement>()
  for (const sq of ALL_SQUARES) {
    const rect = doc.createElementNS(SVG_NS, 'rect') as SVGRectElement
    rect.setAttribute('width', String(SQUARE_RPX))
    rect.setAttribute('height', String(SQUARE_RPX))
    rect.setAttribute('data-board-tone', isDark(sq) ? 'dark' : 'light')
    if (isDark(sq)) rect.setAttribute('fill', `url(#${hatchId})`)
    else rect.setAttribute('class', 'board-square-light')
    tones.appendChild(rect)
    toneRects.set(sq, rect)
  }

  // The declarations line: a 4-rpx Boxwood strip between the fourth and fifth ranks, outlined 1 rpx, over the square edges.
  const strip = doc.createElementNS(SVG_NS, 'rect')
  strip.setAttribute('class', 'board-strip')
  strip.setAttribute('data-board-strip', '')
  strip.setAttribute('x', '0.5')
  strip.setAttribute('y', String(INSERT_RPX / 2 - STRIP_RPX / 2 + 0.5))
  strip.setAttribute('width', String(INSERT_RPX - 1))
  strip.setAttribute('height', String(STRIP_RPX - 1))

  const coords = doc.createElementNS(SVG_NS, 'g')
  coords.setAttribute('data-board-coords', '')
  const coordEls: { el: SVGTextElement; kind: 'file' | 'rank'; index: number }[] = []
  for (let i = 0; i < 8; i++) {
    const f = doc.createElementNS(SVG_NS, 'text') as SVGTextElement
    f.setAttribute('class', 'board-coord t-coords')
    f.setAttribute('data-board-coord', 'file')
    f.textContent = FILES[i] as string
    coords.appendChild(f)
    coordEls.push({ el: f, kind: 'file', index: i })
    const r = doc.createElementNS(SVG_NS, 'text') as SVGTextElement
    r.setAttribute('class', 'board-coord t-coords')
    r.setAttribute('data-board-coord', 'rank')
    r.textContent = String(RANKS[i])
    coords.appendChild(r)
    coordEls.push({ el: r, kind: 'rank', index: i })
  }

  const marks = doc.createElementNS(SVG_NS, 'g')
  marks.setAttribute('data-board-marks', '')

  svg.append(defs, band, tones, strip, coords, marks)

  const squaresLayer = doc.createElement('div')
  squaresLayer.className = 'board-squares'
  const squareEls = new Map<Square, HTMLButtonElement>()
  for (const sq of ALL_SQUARES) {
    const b = doc.createElement('button')
    b.type = 'button'
    b.className = 'square'
    b.setAttribute('data-square', sq)
    b.setAttribute('data-square-tone', isDark(sq) ? 'dark' : 'light')
    b.tabIndex = -1
    squaresLayer.appendChild(b)
    squareEls.set(sq, b)
  }

  const piecesLayer = doc.createElement('div')
  piecesLayer.className = 'board-pieces'
  piecesLayer.setAttribute('data-board-pieces', '')

  root.append(svg, squaresLayer, piecesLayer)
  container.appendChild(root)

  // ---------- Layout ----------

  const rpx = (n: number): string => `calc(${round(n)} * var(--rpx))`
  function round(n: number): number {
    return Math.round(n * 100) / 100
  }

  function pieceBox(key: PieceKey): number {
    return SQUARE_RPX * PIECE_HEIGHT[(key[1] as string).toLowerCase() as PieceType]
  }

  /** Top-left of a piece's box when it stands on a square. */
  function piecePlace(key: PieceKey, square: Square): { left: number; top: number } {
    const { x, y } = squareOrigin(square, orientation)
    const box = pieceBox(key)
    return { left: x + (SQUARE_RPX - box) / 2, top: y + BASELINE_RPX - box }
  }

  /** Where a taken piece goes: 20 rpx beyond the frame on the a-file side, level with its square. */
  function exitPlace(key: PieceKey, square: Square): { left: number; top: number } {
    const box = pieceBox(key)
    const { top } = piecePlace(key, square)
    const left = orientation === 'w' ? -EXIT_RPX - box : INSERT_RPX + EXIT_RPX
    return { left, top }
  }

  function transformFor(left: number, top: number, dxPx = 0, dyPx = 0): string {
    const x = dxPx ? `calc(${round(left)} * var(--rpx) + ${round(dxPx)}px)` : rpx(left)
    const y = dyPx ? `calc(${round(top)} * var(--rpx) + ${round(dyPx)}px)` : rpx(top)
    return `translate(${x}, ${y})`
  }

  function place(view: PieceView, square: Square, ms: number): void {
    const { left, top } = piecePlace(view.key, square)
    move(view.el, left, top, ms)
  }

  function move(el: SVGSVGElement, left: number, top: number, ms: number): void {
    const duration = motionMs(ms)
    el.style.transitionDuration = `${duration}ms`
    el.style.transform = transformFor(left, top)
  }

  function layoutSquares(): void {
    for (const sq of ALL_SQUARES) {
      const { x, y } = squareOrigin(sq, orientation)
      const tone = toneRects.get(sq)
      tone?.setAttribute('x', String(x))
      tone?.setAttribute('y', String(y))
      const b = squareEls.get(sq)
      if (b) {
        b.style.left = rpx(x)
        b.style.top = rpx(y)
      }
    }
    for (const { el, kind, index } of coordEls) {
      const pos = orientation === 'w' ? index : 7 - index
      if (kind === 'file') {
        el.setAttribute('x', String(BAND_RPX + pos * SQUARE_RPX + SQUARE_RPX / 2))
        el.setAttribute('y', String(INSERT_RPX - BAND_RPX / 2))
      } else {
        el.setAttribute('x', String(BAND_RPX / 2))
        el.setAttribute('y', String(INSERT_RPX - BAND_RPX - pos * SQUARE_RPX - SQUARE_RPX / 2))
      }
    }
    root.setAttribute('data-board-orientation', orientation)
  }

  function layoutPieces(): void {
    for (const view of views.values()) {
      view.el.style.transitionDuration = '0ms'
      const { left, top } = piecePlace(view.key, view.square)
      view.el.style.transform = transformFor(left, top)
    }
  }

  function labelSquares(): void {
    for (const sq of ALL_SQUARES) {
      const b = squareEls.get(sq)
      if (!b) continue
      const view = views.get(sq)
      b.setAttribute('aria-label', view ? `${sq}. ${options.pieceNames[view.key]}` : sq)
      if (view) b.setAttribute('data-square-piece', view.key)
      else b.removeAttribute('data-square-piece')
    }
  }

  function setCursor(square: Square, focus: boolean): void {
    const prev = squareEls.get(cursor)
    if (prev) prev.tabIndex = -1
    cursor = square
    const next = squareEls.get(square)
    if (next) {
      next.tabIndex = 0
      next.setAttribute('data-square-cursor', '')
      if (focus) next.focus()
    }
    prev?.removeAttribute('data-square-cursor')
    next?.setAttribute('data-square-cursor', '')
  }

  // ---------- Marks: selection, legal moves, last move, check ----------

  function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = doc.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
    return el
  }

  function renderMarks(): void {
    marks.textContent = ''
    if (lastMove) {
      for (const sq of [lastMove.from, lastMove.to]) {
        const { x, y } = squareOrigin(sq, orientation)
        const L = 8
        const g = svgEl('g', { class: 'board-mark board-mark-tick', 'data-board-mark': 'last-move', 'data-square': sq })
        const x0 = x + 1
        const y0 = y + 1
        const x1 = x + SQUARE_RPX - 1
        const y1 = y + SQUARE_RPX - 1
        g.append(
          svgEl('path', { d: `M${x0},${y0 + L} V${y0} H${x0 + L}` }),
          svgEl('path', { d: `M${x1 - L},${y0} H${x1} V${y0 + L}` }),
          svgEl('path', { d: `M${x1},${y1 - L} V${y1} H${x1 - L}` }),
          svgEl('path', { d: `M${x0 + L},${y1} H${x0} V${y1 - L}` }),
        )
        marks.appendChild(g)
      }
    }
    if (checkSquare) {
      const { x, y } = squareOrigin(checkSquare, orientation)
      const g = svgEl('g', { class: 'board-mark', 'data-board-mark': 'check', 'data-square': checkSquare })
      g.append(
        svgEl('rect', { x: x + 2.5, y: y + 2.5, width: SQUARE_RPX - 5, height: SQUARE_RPX - 5 }),
        svgEl('rect', { x: x + 5.5, y: y + 5.5, width: SQUARE_RPX - 11, height: SQUARE_RPX - 11 }),
      )
      marks.appendChild(g)
    }
    if (selected) {
      const { x, y } = squareOrigin(selected, orientation)
      marks.appendChild(
        svgEl('rect', {
          class: 'board-mark',
          'data-board-mark': 'selection',
          'data-square': selected,
          x: x + 3.5,
          y: y + 3.5,
          width: SQUARE_RPX - 7,
          height: SQUARE_RPX - 7,
        }),
      )
      for (const dest of handlers.destinations(selected)) {
        const o = squareOrigin(dest, orientation)
        const cx = o.x + SQUARE_RPX / 2
        const cy = o.y + SQUARE_RPX / 2
        if (views.has(dest)) {
          marks.appendChild(svgEl('circle', { class: 'board-mark', 'data-board-mark': 'ring', 'data-square': dest, cx, cy, r: 26 }))
        } else {
          marks.appendChild(svgEl('circle', { class: 'board-mark-disc', 'data-board-mark': 'disc', 'data-square': dest, cx, cy, r: 5.5 }))
        }
      }
    }
  }

  function select(square: Square | null): void {
    selected = square
    root.setAttribute('data-board-selected', square ?? '')
    if (!square) root.removeAttribute('data-board-selected')
    renderMarks()
  }

  // ---------- Pieces ----------

  function addPiece(p: PiecePlacement): PieceView {
    const variant = p.variant ?? variantFor(p.key, p.square)
    const el = createPieceElement(p.key, {
      label: options.pieceNames[p.key],
      square: p.square,
      variant,
      boxRpx: pieceBox(p.key),
    })
    el.setAttribute('tabindex', '-1')
    el.style.width = rpx(pieceBox(p.key))
    el.style.height = rpx(pieceBox(p.key))
    const view: PieceView = { el, key: p.key, variant, square: p.square, home: p.square }
    el.style.transitionDuration = '0ms'
    const { left, top } = piecePlace(p.key, p.square)
    el.style.transform = transformFor(left, top)
    piecesLayer.appendChild(el)
    views.set(p.square, view)
    attachPieceInput(view)
    return view
  }

  function setViewSquare(view: PieceView, square: Square): void {
    views.delete(view.square)
    view.square = square
    view.el.setAttribute('data-square', square)
    views.set(square, view)
  }

  function changeKey(view: PieceView, key: PieceKey): void {
    const fresh = createPieceElement(key, {
      label: options.pieceNames[key],
      square: view.square,
      variant: 'standard',
      boxRpx: pieceBox(key),
    })
    fresh.setAttribute('tabindex', '-1')
    fresh.style.width = rpx(pieceBox(key))
    fresh.style.height = rpx(pieceBox(key))
    fresh.style.transitionDuration = '0ms'
    const { left, top } = piecePlace(key, view.square)
    fresh.style.transform = transformFor(left, top)
    view.el.replaceWith(fresh)
    view.el = fresh
    view.key = key
    view.variant = 'standard'
    attachPieceInput(view)
  }

  // ---------- Input ----------

  function activate(square: Square, via: 'square' | 'piece'): void {
    if (promotion) return
    const view = views.get(square)
    if (!interactive) {
      if (via === 'piece' && view) handlers.onInspect(view.key, square)
      return
    }
    if (selected && selected !== square && handlers.destinations(selected).includes(square)) {
      void tryMove(selected, square)
      return
    }
    if (handlers.canPick(square)) {
      select(selected === square ? null : square)
      if (via === 'piece' && view) handlers.onInspect(view.key, square)
      return
    }
    select(null)
    if (via === 'piece' && view) handlers.onInspect(view.key, square)
  }

  async function tryMove(from: Square, to: Square): Promise<boolean> {
    let promo: PieceType | undefined
    if (handlers.needsPromotion(from, to)) {
      const view = views.get(from)
      if (view) place(view, from, PIECE_MS)
      const choice = await showPromotion(from, to)
      if (!choice) {
        select(null)
        return false
      }
      promo = choice
    }
    const ok = handlers.onMove(from, to, promo)
    if (!ok) {
      const view = views.get(from)
      if (view) place(view, from, PIECE_MS)
    }
    select(null)
    return ok
  }

  function onSquareClick(e: Event): void {
    if (suppressClick) return
    const target = e.currentTarget as HTMLElement
    const sq = target.getAttribute('data-square') as Square | null
    if (!sq) return
    setCursor(sq, false)
    activate(sq, 'square')
  }

  function onSquareKey(e: KeyboardEvent): void {
    const target = e.currentTarget as HTMLElement
    const sq = target.getAttribute('data-square') as Square | null
    if (!sq) return
    if (e.key === 'Escape') {
      if (promotion) cancelPromotion()
      select(null)
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(sq, views.has(sq) ? 'piece' : 'square')
      return
    }
    const next = neighbour(sq, e.key, orientation)
    if (next) {
      e.preventDefault()
      setCursor(next, true)
    }
  }

  for (const b of squareEls.values()) {
    b.addEventListener('click', onSquareClick)
    b.addEventListener('keydown', onSquareKey)
  }

  interface Drag {
    view: PieceView
    from: Square
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  }
  let drag: Drag | null = null

  function attachPieceInput(view: PieceView): void {
    view.el.addEventListener('click', (e) => {
      if (suppressClick) return
      e.stopPropagation()
      setCursor(view.square, false)
      activate(view.square, 'piece')
    })
    view.el.addEventListener('pointerdown', (e: Event) => {
      const pe = e as PointerEvent
      if (promotion || !interactive || drag) return
      if (typeof pe.button === 'number' && pe.button !== 0) return
      if (!handlers.canPick(view.square)) return
      drag = {
        view,
        from: view.square,
        pointerId: typeof pe.pointerId === 'number' ? pe.pointerId : 0,
        startX: pe.clientX,
        startY: pe.clientY,
        moved: false,
      }
      doc.addEventListener('pointermove', onPointerMove)
      doc.addEventListener('pointerup', onPointerUp)
      doc.addEventListener('pointercancel', onPointerCancel)
    })
  }

  function onPointerMove(e: Event): void {
    if (!drag) return
    const pe = e as PointerEvent
    const dx = pe.clientX - drag.startX
    const dy = pe.clientY - drag.startY
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      drag.view.el.setAttribute('data-dragging', '')
      select(drag.from)
    }
    const { left, top } = piecePlace(drag.view.key, drag.from)
    drag.view.el.style.transform = transformFor(left, top, dx, dy)
  }

  function dropSquare(pe: PointerEvent): Square | null {
    const rect = root.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      const x = ((pe.clientX - rect.left) / rect.width) * INSERT_RPX
      const y = ((pe.clientY - rect.top) / rect.height) * INSERT_RPX
      return squareAtPoint(x, y, orientation)
    }
    const target = pe.target as Element | null
    const hit = target?.closest?.('[data-square]')
    return (hit?.getAttribute('data-square') as Square | null) ?? null
  }

  function endDrag(): void {
    doc.removeEventListener('pointermove', onPointerMove)
    doc.removeEventListener('pointerup', onPointerUp)
    doc.removeEventListener('pointercancel', onPointerCancel)
    drag = null
  }

  function onPointerUp(e: Event): void {
    if (!drag) return
    const d = drag
    const pe = e as PointerEvent
    endDrag()
    if (!d.moved) return
    d.view.el.removeAttribute('data-dragging')
    suppressClick = true
    setTimeout(() => {
      suppressClick = false
    }, 0)
    const to = dropSquare(pe)
    if (to && to !== d.from && handlers.destinations(d.from).includes(to)) {
      setCursor(to, false)
      void tryMove(d.from, to)
    } else {
      place(d.view, d.from, PIECE_MS)
      if (to !== d.from) select(null)
    }
  }

  function onPointerCancel(): void {
    if (!drag) return
    const d = drag
    endDrag()
    d.view.el.removeAttribute('data-dragging')
    place(d.view, d.from, PIECE_MS)
  }

  // ---------- Promotion ----------

  function showPromotion(from: Square, to: Square): Promise<PieceType | null> {
    const color = (views.get(from)?.key[0] ?? 'w') as Color
    const card = applyPaper(doc.createElement('div'))
    card.classList.add('promotion')
    card.setAttribute('data-promotion', to)
    card.setAttribute('role', 'group')
    card.setAttribute('aria-label', PROMOTION_ROSTER)

    const roster = doc.createElement('div')
    roster.className = 'promotion-roster'
    const rosterText = doc.createElement('span')
    rosterText.className = 't-roster'
    rosterText.textContent = PROMOTION_ROSTER
    roster.appendChild(rosterText)
    const headRule = doc.createElement('div')
    headRule.className = 'promotion-head-rule'
    headRule.setAttribute('aria-hidden', 'true')
    const choices = doc.createElement('div')
    choices.className = 'promotion-choices'

    const buttons: HTMLButtonElement[] = []
    for (const type of PROMOTION_CHOICES) {
      const key = pieceKey(color, type)
      const b = doc.createElement('button')
      b.type = 'button'
      b.className = 'promotion-choice'
      b.setAttribute('data-promotion-choice', type)
      b.setAttribute('aria-label', options.pieceNames[key])
      const silhouette = createPieceElement(key, { label: options.pieceNames[key], boxRpx: PROMOTION_PIECE_RPX })
      silhouette.setAttribute('aria-hidden', 'true')
      silhouette.removeAttribute('role')
      b.appendChild(silhouette)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        resolvePromotion(type)
      })
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelPromotion()
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const i = buttons.indexOf(b)
          const n = buttons.length
          buttons[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]?.focus()
        }
      })
      choices.appendChild(b)
      buttons.push(b)
    }
    card.append(roster, headRule, choices)

    // At the promotion square's inner edge: below a top-rank square, above a bottom-rank square.
    const { x, y } = squareOrigin(to, orientation)
    const top = y < INSERT_RPX / 2 ? y + SQUARE_RPX : y - PROMOTION_H_RPX
    const left = Math.min(Math.max(x + SQUARE_RPX / 2 - PROMOTION_W_RPX / 2, BAND_RPX), INSERT_RPX - BAND_RPX - PROMOTION_W_RPX)
    card.style.left = rpx(left)
    card.style.top = rpx(top)
    root.appendChild(card)
    root.setAttribute('data-board-promotion', to)
    buttons[0]?.focus()

    return new Promise<PieceType | null>((resolve) => {
      promotion = { card, from, to, resolve }
    })
  }

  function resolvePromotion(type: PieceType | null): void {
    if (!promotion) return
    const p = promotion
    promotion = null
    p.card.remove()
    root.removeAttribute('data-board-promotion')
    squareEls.get(cursor)?.focus()
    p.resolve(type)
  }

  function cancelPromotion(): void {
    resolvePromotion(null)
  }

  // ---------- Motion ----------

  async function animateMove(record: MoveRecord): Promise<MoveOutcome> {
    const mover = views.get(record.from)
    if (!mover) return {}
    select(null)
    lastMove = { from: record.from, to: record.to }
    renderMarks()

    const jobs: Promise<void>[] = []
    let captured: PieceView | undefined
    if (record.captured) {
      const capSquare: Square = record.flags.includes('e')
        ? (`${record.to[0]}${record.from[1]}` as Square)
        : record.to
      captured = views.get(capSquare)
      if (captured) {
        views.delete(capSquare)
        captured.el.removeAttribute('data-square')
        captured.el.setAttribute('data-piece-taken', '')
        const { left, top } = exitPlace(captured.key, capSquare)
        move(captured.el, left, top, CAPTURE_MS)
        const cap = captured
        jobs.push(
          wait(motionMs(CAPTURE_MS)).then(() => {
            cap.el.remove()
            taken.push(cap)
          }),
        )
      }
    }

    const slideMover = (): void => {
      setViewSquare(mover, record.to)
      place(mover, record.to, PIECE_MS)
      labelSquares()
    }
    if (captured) {
      jobs.push(
        wait(motionMs(CAPTURE_STAGGER_MS)).then(async () => {
          slideMover()
          await wait(motionMs(PIECE_MS))
        }),
      )
    } else {
      slideMover()
      jobs.push(wait(motionMs(PIECE_MS)))
    }

    // Castling slides both pieces together.
    if (record.flags.includes('k') || record.flags.includes('q')) {
      const rank = record.from[1]
      const rookFrom = (record.flags.includes('k') ? `h${rank}` : `a${rank}`) as Square
      const rookTo = (record.flags.includes('k') ? `f${rank}` : `d${rank}`) as Square
      const rook = views.get(rookFrom)
      if (rook) {
        setViewSquare(rook, rookTo)
        place(rook, rookTo, PIECE_MS)
      }
    }

    await Promise.all(jobs)
    if (record.promotion) {
      changeKey(mover, pieceKey(record.color, record.promotion))
    }
    labelSquares()
    return captured ? { taken: { key: captured.key, variant: captured.variant } } : {}
  }

  async function returnPieces(): Promise<void> {
    select(null)
    lastMove = null
    checkSquare = null
    renderMarks()
    // Pieces that were taken come back from the a-file side.
    for (const view of taken.splice(0)) {
      view.el.style.transitionDuration = '0ms'
      const { left, top } = exitPlace(view.key, view.home)
      view.el.style.transform = transformFor(left, top)
      view.el.removeAttribute('data-piece-taken')
      piecesLayer.appendChild(view.el)
      if (!views.has(view.home)) views.set(view.home, view)
      view.square = view.home
      view.el.setAttribute('data-square', view.home)
    }
    const all = new Set<PieceView>(views.values())
    views.clear()
    for (const view of all) {
      view.square = view.home
      view.el.setAttribute('data-square', view.home)
      views.set(view.home, view)
    }
    await wait(0)
    for (const view of all) place(view, view.home, RETURN_MS)
    labelSquares()
    await wait(motionMs(RETURN_MS))
  }

  // ---------- Initial layout ----------

  layoutSquares()
  labelSquares()
  setCursor(cursor, false)

  return {
    el: root,
    setPosition(pieces) {
      if (promotion) cancelPromotion()
      for (const view of views.values()) view.el.remove()
      views.clear()
      taken.length = 0
      selected = null
      lastMove = null
      checkSquare = null
      root.removeAttribute('data-board-selected')
      for (const p of pieces) addPiece(p)
      renderMarks()
      labelSquares()
      setCursor(orientation === 'w' ? 'e1' : 'e8', false)
    },
    setOrientation(color) {
      if (color === orientation) return
      orientation = color
      layoutSquares()
      layoutPieces()
      renderMarks()
      if (promotion) cancelPromotion()
    },
    orientation() {
      return orientation
    },
    setInteractive(on) {
      interactive = on
      root.setAttribute('data-board-interactive', on ? 'true' : 'false')
      if (!on) {
        select(null)
        if (promotion) cancelPromotion()
        if (drag) onPointerCancel()
      }
    },
    show() {
      root.hidden = false
      root.setAttribute('data-board-visible', 'true')
    },
    hide() {
      root.hidden = true
      root.setAttribute('data-board-visible', 'false')
    },
    isVisible() {
      return !root.hidden
    },
    animateMove,
    setCheck(square) {
      checkSquare = square
      root.setAttribute('data-board-check', square ?? '')
      if (!square) root.removeAttribute('data-board-check')
      renderMarks()
    },
    setLastMove(from, to) {
      lastMove = from && to ? { from, to } : null
      renderMarks()
    },
    clearSelection() {
      select(null)
    },
    returnPieces,
    cursor() {
      return cursor
    },
    destroy() {
      if (promotion) cancelPromotion()
      endDrag()
      root.remove()
    },
  }
}
