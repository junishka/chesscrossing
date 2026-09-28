/**
 * The six figurines of docs/visual.md section 7 and docs/bible.md section 7:
 * turned bodies with carved heads, each head an object of a frontier post.
 * No face, eye, mouth or crown. Designed on a 100-unit box, baseline at 100,
 * centre at x 50. White is Boxwood filled, black Ebony filled, every piece
 * outlined 1 rpx in Iron Gall; carved marks are 1-rpx lines in the opposite
 * wood. Nothing here is a colour: fills and strokes are the frame's tokens.
 */
import type { Color, PieceKey, PieceType, Square } from '../contracts/chess'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Height of each piece as a fraction of the square (section 7 table). */
export const PIECE_HEIGHT: Readonly<Record<PieceType, number>> = {
  k: 0.88,
  q: 0.83,
  b: 0.76,
  n: 0.73,
  r: 0.71,
  p: 0.56,
}

/** The two singular pieces, told by shape: the b1 pearwood knight and black Stone 7. */
export type PieceVariant = 'standard' | 'pearwood' | 'notch'

/** Which variant a piece on its home square is, at the start of a game. */
export function variantFor(key: PieceKey, square: Square): PieceVariant {
  if (key === 'wN' && square === 'b1') return 'pearwood'
  if (key === 'bP' && square === 'g7') return 'notch'
  return 'standard'
}

export interface Shape {
  tag: 'path' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'line' | 'polyline'
  attrs: Record<string, string | number>
}

export interface PieceGeometry {
  /** Filled shapes in the piece's own wood, outlined in Iron Gall. Drawn in order. */
  body: Shape[]
  /** Carved marks: 1-rpx lines in the opposite wood, no fill. */
  marks: Shape[]
}

/** Base ellipse 46 by 6 on the baseline; its lower edge is the shadow line. */
const DISC: Shape = { tag: 'ellipse', attrs: { cx: 50, cy: 97, rx: 23, ry: 3 } }

function n(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
}

function pts(points: [number, number][]): string {
  return points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
}

function king(color: Color): PieceGeometry {
  const body: Shape[] = [DISC]
  // A column 8 wide rises from the disc to y 36; a socket collar 12 by 6.
  body.push({ tag: 'rect', attrs: { x: 46, y: 36, width: 8, height: 61 } })
  body.push({ tag: 'rect', attrs: { x: 44, y: 30, width: 12, height: 6 } })
  const marks: Shape[] = []
  if (color === 'w') {
    // The shade: a truncated cone 44 wide at y 30 narrowing to 24 at y 6; finial 8 by 6.
    body.push({ tag: 'polygon', attrs: { points: pts([[28, 30], [72, 30], [62, 6], [38, 6]]) } })
    body.push({ tag: 'rect', attrs: { x: 46, y: 0, width: 8, height: 6 } })
    // Rim line at y 24 (the cone is 39 wide there).
    marks.push({ tag: 'line', attrs: { x1: 30.5, y1: 24, x2: 69.5, y2: 24 } })
  } else {
    // Lamp, East: a tin shade 50 wide and 12 tall, no rim line, a 3-unit hole at the apex.
    body.push({ tag: 'polygon', attrs: { points: pts([[25, 30], [75, 30], [51.5, 18], [48.5, 18]]) } })
  }
  return { body, marks }
}

function queen(color: Color): PieceGeometry {
  const body: Shape[] = [DISC]
  // Stem 14 by 10; the well, 40 wide with 6-unit rounded shoulders, y 46 to 84.
  body.push({ tag: 'rect', attrs: { x: 43, y: 84, width: 14, height: 10 } })
  body.push({ tag: 'path', attrs: { d: 'M30,84 V52 Q30,46 36,46 H64 Q70,46 70,52 V84 Z' } })
  const marks: Shape[] = []
  // The lid: a domed half-ellipse 34 by 14 with a 6-unit knob.
  const lid: Shape = { tag: 'path', attrs: { d: 'M33,46 A17,14 0 0 1 67,46 Z' } }
  const knob: Shape = { tag: 'rect', attrs: { x: 47, y: 26, width: 6, height: 6 } }
  if (color === 'w') {
    body.push(lid, knob)
    // Carved shut: one seam line.
    marks.push({ tag: 'line', attrs: { x1: 33, y1: 46, x2: 67, y2: 46 } })
  } else {
    // Inkstand, East: the lid rotated 60 degrees back about its right-hand hinge; the mouth open.
    body.push(
      { tag: 'path', attrs: { d: lid.attrs.d as string, transform: 'rotate(60 67 46)' } },
      { tag: 'rect', attrs: { ...knob.attrs, transform: 'rotate(60 67 46)' } },
    )
    marks.push({ tag: 'line', attrs: { x1: 30, y1: 46, x2: 70, y2: 46 } })
  }
  return { body, marks }
}

function bishop(color: Color): PieceGeometry {
  const body: Shape[] = [DISC]
  // A column tapering from 16 to 10 wide up to y 34.
  body.push({ tag: 'polygon', attrs: { points: pts([[42, 94], [58, 94], [55, 34], [45, 34]]) } })
  const marks: Shape[] = []
  if (color === 'w') {
    // A round head, circle of diameter 30 centred at y 22, with a vertical slot 3 by 14.
    body.push({ tag: 'circle', attrs: { cx: 50, cy: 22, r: 15 } })
    marks.push({ tag: 'rect', attrs: { x: 48.5, y: 15, width: 3, height: 14 } })
  } else {
    // Seal, Helder: a square head 28 by 28, corners rounded 2; the slot a square 8 by 8.
    body.push({ tag: 'rect', attrs: { x: 36, y: 8, width: 28, height: 28, rx: 2, ry: 2 } })
    marks.push({ tag: 'rect', attrs: { x: 46, y: 18, width: 8, height: 8 } })
  }
  return { body, marks }
}

/**
 * The Ferry. A neck 22 wide leaning forward-right to y 30 with two ears at
 * the poll; the head an elongated block at 45 degrees down and forward, the
 * muzzle ending near y 60, x 78. The b1 replacement is 4 units shorter, its
 * neck 2 units thicker, its ears rounded.
 */
function knight(variant: PieceVariant): PieceGeometry {
  const dy = variant === 'pearwood' ? 4 : 0
  const t = variant === 'pearwood' ? 2 : 0
  const y = (v: number): number => v + dy
  const back = `M${n(30 - t)},94 C${n(28 - t)},70 ${n(36 - t)},${n(y(40))} 46,${n(y(28))}`
  const earL =
    variant === 'pearwood'
      ? `Q49,${n(y(21))} 52,${n(y(28))}`
      : `L49,${n(y(22))} L52,${n(y(28))}`
  const earR =
    variant === 'pearwood'
      ? `Q55,${n(y(21))} 58,${n(y(28))}`
      : `L55,${n(y(22))} L58,${n(y(28))}`
  const head = `L82,${n(y(52))} L74,${n(y(60))} L50,${n(y(36))}`
  const throat = `C56,${n(y(55))} 60,75 64,94 Z`
  const silhouette = `${back} ${earL} ${earR} ${head} ${throat}`
  const body: Shape[] = [DISC, { tag: 'path', attrs: { d: silhouette } }]
  const marks: Shape[] = [
    // Bridle: one line across the nose, one down the cheek, meeting.
    { tag: 'line', attrs: { x1: 74, y1: y(44), x2: 66, y2: y(52) } },
    { tag: 'line', attrs: { x1: 54, y1: y(32), x2: 70, y2: y(48) } },
    // One line along the neck's back edge.
    { tag: 'path', attrs: { d: `M${n(33 - t)},92 C${n(31 - t)},70 ${n(39 - t)},${n(y(42))} 47,${n(y(31))}` } },
  ]
  return { body, marks }
}

function rook(color: Color): PieceGeometry {
  const body: Shape[] = [DISC]
  // A shaft 34 wide to y 12.
  body.push({ tag: 'rect', attrs: { x: 33, y: 12, width: 34, height: 82 } })
  const marks: Shape[] = []
  if (color === 'w') {
    // Home Tower: a flat parapet 40 by 5; the window offset 6 right of centre, facing the bridge.
    body.push({ tag: 'rect', attrs: { x: 30, y: 7, width: 40, height: 5 } })
    marks.push({ tag: 'rect', attrs: { x: 52, y: 32, width: 8, height: 10 } })
  } else {
    // East Tower: an isosceles roof 40 by 10; the window on the axis.
    body.push({ tag: 'polygon', attrs: { points: pts([[30, 12], [70, 12], [50, 2]]) } })
    marks.push({ tag: 'rect', attrs: { x: 46, y: 32, width: 8, height: 10 } })
  }
  // A door line 10 tall at the foot.
  marks.push({ tag: 'line', attrs: { x1: 50, y1: 84, x2: 50, y2: 94 } })
  return { body, marks }
}

function pawn(color: Color, variant: PieceVariant): PieceGeometry {
  // A shaft 26 wide from the baseline to y 14; a bevelled cap narrowing over 8 units to 18 wide, then flat.
  const cap =
    variant === 'notch'
      ? // Black Stone 7: a 4-unit notch out of the cap's right corner.
        'M37,100 V14 L41,6 H55 V10 H60 L63,14 V100 Z'
      : 'M37,100 V14 L41,6 H59 L63,14 V100 Z'
  const body: Shape[] = [{ tag: 'path', attrs: { d: cap } }]
  // A numeral 12 units tall, 1-unit strokes, centred at y 34: V on white, H on black.
  const marks: Shape[] =
    color === 'w'
      ? [{ tag: 'polyline', attrs: { points: pts([[44, 28], [50, 40], [56, 28]]) } }]
      : [
          { tag: 'line', attrs: { x1: 45, y1: 28, x2: 45, y2: 40 } },
          { tag: 'line', attrs: { x1: 55, y1: 28, x2: 55, y2: 40 } },
          { tag: 'line', attrs: { x1: 45, y1: 34, x2: 55, y2: 34 } },
        ]
  return { body, marks }
}

export function pieceGeometry(key: PieceKey, variant: PieceVariant = 'standard'): PieceGeometry {
  const color = key[0] as Color
  const type = (key[1] as string).toLowerCase() as PieceType
  switch (type) {
    case 'k':
      return king(color)
    case 'q':
      return queen(color)
    case 'b':
      return bishop(color)
    case 'n':
      return knight(variant)
    case 'r':
      return rook(color)
    case 'p':
      return pawn(color, variant)
  }
}

export interface PieceElementOptions {
  /** The bible's name for this piece type, for the aria-label. */
  label: string
  /** The square it stands on, if any. */
  square?: Square
  variant?: PieceVariant
  /** The height of the 100-unit box in reference pixels. Decides the 1-rpx stroke. */
  boxRpx: number
}

function shapeEl(doc: Document, shape: Shape): SVGElement {
  const el = doc.createElementNS(SVG_NS, shape.tag)
  for (const [k, v] of Object.entries(shape.attrs)) el.setAttribute(k, String(v))
  return el
}

/**
 * A figurine as an inline SVG. The element carries data-piece (its key),
 * data-square and an aria-label. Fills and strokes come from the frame's
 * tokens through board.css; --sw is the stroke width that equals 1 rpx.
 */
export function createPieceElement(key: PieceKey, options: PieceElementOptions): SVGSVGElement {
  const doc = document
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'piece')
  svg.setAttribute('role', 'img')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('data-piece', key)
  svg.setAttribute('data-piece-color', key[0] as string)
  svg.setAttribute('data-piece-type', (key[1] as string).toLowerCase())
  const variant = options.variant ?? 'standard'
  if (variant !== 'standard') svg.setAttribute('data-piece-variant', variant)
  if (options.square) svg.setAttribute('data-square', options.square)
  svg.setAttribute('aria-label', options.label)
  svg.style.setProperty('--sw', n(100 / options.boxRpx))
  svg.style.setProperty('--box', String(options.boxRpx))

  const geometry = pieceGeometry(key, variant)
  const body = doc.createElementNS(SVG_NS, 'g')
  body.setAttribute('class', 'piece-body')
  for (const s of geometry.body) body.appendChild(shapeEl(doc, s))
  const marks = doc.createElementNS(SVG_NS, 'g')
  marks.setAttribute('class', 'piece-marks')
  for (const s of geometry.marks) marks.appendChild(shapeEl(doc, s))
  svg.append(body, marks)
  return svg
}

/** Reads a piece key off an element. */
export function pieceKeyOf(el: Element): PieceKey | null {
  const k = el.getAttribute('data-piece')
  return k && /^[wb][KQRBNP]$/.test(k) ? (k as PieceKey) : null
}
