/**
 * Flat clear-line SVG for every object in Room 1. docs/visual.md sections 1.7,
 * 5 and 12; bible section 9.
 *
 * Rules kept here: a uniform 1-rpx Iron Gall outline on every shape; one hard
 * shadow, a 1-rpx Iron Gall line along the object's lower edge; flat fills
 * from the six palette tokens only, named by role (never a hex); no gradient;
 * no type on the wall (type sits on Boxwood, and is HTML laid over the
 * symbol by the scene, not text inside the SVG). Every symbol is drawn in
 * reference pixels: the viewBox is the object's rect in rpx, so a stroke of 1
 * is 1 rpx at any stage size.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg'

/** A fill by palette role. The frame defines the tokens; nothing here is a colour. */
export type Tone = 'wall' | 'wood' | 'light' | 'dark' | 'wax' | 'ink' | 'none'

export interface SymbolSize {
  /** Width in reference pixels. */
  w: number
  /** Height in reference pixels. */
  h: number
}

/** The two clocks, fixed. They never run. */
export const CLOCK_LEFT_TIME = { hours: 21, minutes: 20 }
export const CLOCK_RIGHT_TIME = { hours: 21, minutes: 8 }
export const NAIL_COUNT = 14
export const BUTTON_COUNT = 11
export const BUTTON_POSITIONS = 12
export const ARCH_COUNT = 11
export const WINDOW_COLUMNS = 2
export const WINDOW_ROWS = 3

export const SYMBOL_IDS = [
  'door-escutcheon',
  'door-plain',
  'door-nailed',
  'window',
  'greatcoat',
  'clock-left',
  'clock-right',
  'tariff-board',
  'cabinet',
  'hook',
  'stove',
  'desk',
  'tray',
  'board',
  'typewriter',
  'stamp',
  'hours-card',
  'halm',
  'chair',
  'trap',
  'path',
] as const
export type SymbolId = (typeof SYMBOL_IDS)[number]

export function isSymbolId(id: string): id is SymbolId {
  return (SYMBOL_IDS as readonly string[]).includes(id)
}

/* ---------- primitives ---------- */

function tone(t: Tone): string {
  return t === 'none' ? 'none' : `var(--c-${t})`
}

function make<K extends keyof SVGElementTagNameMap>(doc: Document, name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG_NS, name)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

function paint(el: SVGElement, fill: Tone, stroke: Tone | null = 'ink', strokeWidth = 1): void {
  el.style.fill = tone(fill)
  if (stroke === null) {
    el.style.stroke = 'none'
  } else {
    el.style.stroke = tone(stroke)
    el.style.strokeWidth = String(strokeWidth)
  }
}

function num(n: number): string {
  return String(Math.round(n * 100) / 100)
}

class Sheet {
  readonly svg: SVGSVGElement
  constructor(
    readonly doc: Document,
    readonly w: number,
    readonly h: number,
    id: string,
  ) {
    this.svg = make(doc, 'svg', {
      viewBox: `0 0 ${num(w)} ${num(h)}`,
      width: '100%',
      height: '100%',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
      'data-symbol': id,
    })
    this.svg.style.display = 'block'
    this.svg.style.overflow = 'visible'
  }

  rect(x: number, y: number, w: number, h: number, fill: Tone, stroke: Tone | null = 'ink', part?: string): SVGRectElement {
    // Half-unit insets keep a 1-rpx stroke on whole reference pixels.
    const r = make(this.doc, 'rect', { x: num(x), y: num(y), width: num(Math.max(0, w)), height: num(Math.max(0, h)) })
    r.setAttribute('shape-rendering', 'crispEdges')
    paint(r, fill, stroke)
    if (part) r.setAttribute('data-part', part)
    this.svg.appendChild(r)
    return r
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Tone = 'ink', width = 1, part?: string): SVGLineElement {
    const l = make(this.doc, 'line', { x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2) })
    if (y1 === y2 || x1 === x2) l.setAttribute('shape-rendering', 'crispEdges')
    paint(l, 'none', stroke, width)
    if (part) l.setAttribute('data-part', part)
    this.svg.appendChild(l)
    return l
  }

  circle(cx: number, cy: number, r: number, fill: Tone, stroke: Tone | null = 'ink', part?: string): SVGCircleElement {
    const c = make(this.doc, 'circle', { cx: num(cx), cy: num(cy), r: num(r) })
    paint(c, fill, stroke)
    if (part) c.setAttribute('data-part', part)
    this.svg.appendChild(c)
    return c
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: Tone, stroke: Tone | null = 'ink', part?: string): SVGEllipseElement {
    const e = make(this.doc, 'ellipse', { cx: num(cx), cy: num(cy), rx: num(rx), ry: num(ry) })
    paint(e, fill, stroke)
    if (part) e.setAttribute('data-part', part)
    this.svg.appendChild(e)
    return e
  }

  polygon(points: readonly [number, number][], fill: Tone, stroke: Tone | null = 'ink', part?: string): SVGPolygonElement {
    const p = make(this.doc, 'polygon', { points: points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ') })
    paint(p, fill, stroke)
    if (part) p.setAttribute('data-part', part)
    this.svg.appendChild(p)
    return p
  }

  polyline(points: readonly [number, number][], stroke: Tone, width = 1, part?: string): SVGPolylineElement {
    const p = make(this.doc, 'polyline', { points: points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ') })
    paint(p, 'none', stroke, width)
    p.style.strokeLinejoin = 'miter'
    if (part) p.setAttribute('data-part', part)
    this.svg.appendChild(p)
    return p
  }

  path(d: string, fill: Tone, stroke: Tone | null = 'ink', width = 1, part?: string): SVGPathElement {
    const p = make(this.doc, 'path', { d })
    paint(p, fill, stroke, width)
    if (part) p.setAttribute('data-part', part)
    this.svg.appendChild(p)
    return p
  }

  /** The one flat shadow: a 1-rpx line along the lower edge, straight down. */
  shadow(x1: number, x2: number, y: number = this.h - 0.5): SVGLineElement {
    return this.line(x1, y, x2, y, 'ink', 1, 'shadow')
  }
}

/* ---------- objects ---------- */

function door(s: Sheet, opts: { knob: boolean; escutcheon: boolean }): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'door-leaf')
  // Four inset panels, two by two, each with its own hairline.
  const m = Math.max(6, w * 0.11)
  const gap = m
  const pw = (w - 2 * m - gap) / 2
  const top = m
  const ph1 = body * 0.36
  const ph2 = body - top - ph1 - 2 * gap - m
  for (let c = 0; c < 2; c++) {
    const px = m + c * (pw + gap)
    s.rect(px, top, pw, ph1, 'wood', 'ink', 'panel')
    s.rect(px, top + ph1 + gap, pw, ph2, 'wood', 'ink', 'panel')
  }
  if (opts.knob) {
    // Knob at y 46 of the stage: doors run 14 to 76, so 32/62 of the leaf.
    const ky = (32 / 62) * body
    const kx = w * 0.78
    s.circle(kx, ky, 5, 'light', 'ink', 'knob')
    if (opts.escutcheon) s.rect(kx - 3, ky + 10, 6, 10, 'light', 'ink', 'escutcheon')
  }
  s.shadow(0, w)
}

function doorNailed(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'door-leaf')
  // Fourteen nail heads in two columns of seven, y 30 to 70 of the stage.
  const y0 = (16 / 62) * body
  const y1 = (56 / 62) * body
  const step = (y1 - y0) / 6
  for (let i = 0; i < 7; i++) {
    const y = y0 + i * step
    s.circle(w * 0.33, y, 1.5, 'ink', null, 'nail')
    s.circle(w * 0.67, y, 1.5, 'ink', null, 'nail')
  }
  s.shadow(0, w)
}

function windowSymbol(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'frame')
  const f = 4 // frame
  const bar = 3 // muntin
  const gx = f
  const gy = f
  const gw = w - 2 * f
  const gh = body - 2 * f
  // Night behind the glass.
  s.rect(gx, gy, gw, gh, 'ink', null, 'night')
  // The bridge: eleven arches in Boxwood line across the glass, grass under it.
  const deckY = gy + gh * 0.55
  const archW = gw / ARCH_COUNT
  const archH = Math.min(archW * 0.9, gh * 0.12)
  s.line(gx, deckY, gx + gw, deckY, 'light', 1, 'deck')
  const arches: string[] = []
  for (let i = 0; i < ARCH_COUNT; i++) {
    const x0 = gx + i * archW
    const x1 = x0 + archW
    arches.push(`M${num(x0)},${num(deckY + archH)} L${num(x0)},${num(deckY + archH * 0.4)} A${num(archW / 2)},${num(archH * 0.4)} 0 0 1 ${num(x1)},${num(deckY + archH * 0.4)} L${num(x1)},${num(deckY + archH)}`)
  }
  const bridge = s.path(arches.join(' '), 'none', 'light', 1, 'arches')
  bridge.setAttribute('data-arches', String(ARCH_COUNT))
  const grassY = deckY + archH + 2
  for (let x = gx + 1; x < gx + gw - 1; x += 3) {
    s.line(x, grassY + 3, x, grassY, 'light', 1, 'grass')
  }
  // Muntins: two columns, three rows.
  const cw = (gw - bar) / WINDOW_COLUMNS
  const rh = (gh - 2 * bar) / WINDOW_ROWS
  s.rect(gx + cw, gy, bar, gh, 'wood', 'ink', 'muntin')
  for (let r = 1; r < WINDOW_ROWS; r++) s.rect(gx, gy + r * rh + (r - 1) * bar, gw, bar, 'wood', 'ink', 'muntin')
  // The lower-left pane is cracked: a 1-rpx zigzag.
  const px0 = gx
  const py0 = gy + 2 * (rh + bar)
  s.polyline(
    [
      [px0 + cw * 0.15, py0 + rh * 0.95],
      [px0 + cw * 0.35, py0 + rh * 0.62],
      [px0 + cw * 0.28, py0 + rh * 0.48],
      [px0 + cw * 0.55, py0 + rh * 0.3],
      [px0 + cw * 0.5, py0 + rh * 0.12],
    ],
    'light',
    1,
    'crack',
  )
  s.shadow(0, w)
}

function greatcoat(s: Sheet): void {
  const { w, h } = s
  // The west hook, Boxwood, y 18 to 20 of the stage: the first 18 rpx.
  const hookH = 18
  s.rect(w / 2 - 2, 0.5, 4, 8, 'light', 'ink', 'hook')
  s.path(`M${num(w / 2 - 2)},${num(8)} v6 a4,4 0 0 0 8,0`, 'none', 'light', 3, 'hook')
  // The coat, Service Green, to the floor.
  const top = hookH
  const hem = h - 1
  const shoulder = top + 14
  s.polygon(
    [
      [w / 2, top],
      [w - 1, shoulder],
      [w - 0.5, hem],
      [0.5, hem],
      [1, shoulder],
    ],
    'wall',
    'ink',
    'coat',
  )
  // Collar.
  s.polygon(
    [
      [w / 2, top + 2],
      [w / 2 + 5, shoulder + 6],
      [w / 2, shoulder + 14],
      [w / 2 - 5, shoulder + 6],
    ],
    'wall',
    'ink',
    'collar',
  )
  // Eleven Boxwood buttons in one row, and the empty twelfth position.
  const by0 = shoulder + 24
  const by1 = hem - 60
  const step = (by1 - by0) / (BUTTON_POSITIONS - 1)
  const bx = w / 2 - 2
  for (let i = 0; i < BUTTON_POSITIONS; i++) {
    const y = by0 + i * step
    if (i < BUTTON_COUNT) s.circle(bx, y, 2.5, 'light', 'ink', 'button')
    else s.circle(bx, y, 1, 'none', 'ink', 'button-missing')
  }
  s.shadow(0, w)
}

function clock(s: Sheet, time: { hours: number; minutes: number }): void {
  const { w, h } = s
  const cx = w / 2
  const cy = (h - 1) / 2
  const r = Math.min(w, h - 1) / 2 - 0.5
  s.circle(cx, cy, r, 'wood', 'ink', 'case')
  s.circle(cx, cy, r - 7, 'light', 'ink', 'face')
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r1 = r - 9
    const r2 = r - 13
    s.line(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2, 'ink', 1, 'tick')
  }
  const hourA = ((time.hours % 12) / 12 + time.minutes / 720) * Math.PI * 2
  const minA = (time.minutes / 60) * Math.PI * 2
  const hr = r * 0.5
  const mr = r * 0.74
  const hour = s.line(cx, cy, cx + Math.sin(hourA) * hr, cy - Math.cos(hourA) * hr, 'ink', 2, 'hand-hour')
  const minute = s.line(cx, cy, cx + Math.sin(minA) * mr, cy - Math.cos(minA) * mr, 'ink', 1, 'hand-minute')
  hour.setAttribute('data-time', `${time.hours}.${String(time.minutes).padStart(2, '0')}`)
  minute.setAttribute('data-time', `${time.hours}.${String(time.minutes).padStart(2, '0')}`)
  s.circle(cx, cy, 1.5, 'ink', null, 'pivot')
  s.shadow(cx - r * 0.3, cx + r * 0.3)
}

/** The Tariff Board: Marle Oak frame, Boxwood face. The six struck classes are HTML over it. */
export const TARIFF_FRAME_RPX = 6
function tariffBoard(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'frame')
  const f = TARIFF_FRAME_RPX
  s.rect(f, f, w - 2 * f, body - 2 * f, 'light', 'ink', 'face')
  s.shadow(0, w)
}

/** The filing cabinet: steel in Service Green, four drawers. Labels are HTML over it. */
export const CABINET_DRAWERS = 4
function cabinet(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wall', 'ink', 'body')
  const dh = (body - 2) / CABINET_DRAWERS
  for (let i = 0; i < CABINET_DRAWERS; i++) {
    const y = 1 + i * dh
    s.rect(3, y + 2, w - 6, dh - 4, 'wall', 'ink', 'drawer')
    // Boxwood handle, low in the drawer front; the label sits above it.
    s.rect(w / 2 - 7, y + dh * 0.68, 14, 3, 'light', 'ink', 'handle')
  }
  s.shadow(0, w)
}

function hook(s: Sheet): void {
  const { w, h } = s
  s.rect(w / 2 - 2, 0.5, 4, 8, 'light', 'ink', 'plate')
  s.path(`M${num(w / 2 - 2)},${num(8)} v${num(h - 14)} a4,3 0 0 0 8,0`, 'none', 'light', 3, 'hook')
  s.shadow(w / 2 - 6, w / 2 + 6)
}

function stove(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  // Pipe up from the top plate, within the rect.
  s.rect(w / 2 - 5, 0.5, 10, 20, 'dark', 'ink', 'pipe')
  s.rect(0.5, 20, w - 1, 6, 'dark', 'ink', 'plate')
  s.rect(3, 26, w - 6, body - 34, 'dark', 'ink', 'body')
  // The grate, Seal Wax: 67.2 to 68.3 of 66 to 69.5, y 66 to 70 of 56 to 76.
  const gx0 = ((67.2 - 66) / 3.5) * w
  const gx1 = ((68.3 - 66) / 3.5) * w
  const gy0 = ((66 - 56) / 20) * body
  const gy1 = ((70 - 56) / 20) * body
  s.rect(gx0 - 3, gy0 - 3, gx1 - gx0 + 6, gy1 - gy0 + 6, 'dark', 'ink', 'door')
  s.rect(gx0, gy0, gx1 - gx0, gy1 - gy0, 'wax', 'ink', 'grate')
  // Feet.
  s.rect(5, body - 8, 8, 8, 'dark', 'ink', 'foot')
  s.rect(w - 13, body - 8, 8, 8, 'dark', 'ink', 'foot')
  s.shadow(0, w)
}

function desk(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  // The desk runs y 58 to 76: rail 58 to 58.5, top edge, front panel to 74, legs to 76.
  const railH = (0.5 / 18) * body
  const panelBottom = (16 / 18) * body
  s.rect(0.5, 0.5, w - 1, railH, 'light', 'ink', 'rail')
  s.rect(0.5, railH + 0.5, w - 1, 8, 'wood', 'ink', 'top')
  // The declarations line, brass, let flush into the top: seen edge-on.
  s.line(0.5, railH + 4.5, w - 0.5, railH + 4.5, 'light', 1, 'declarations-line')
  s.rect(0.5, railH + 8.5, w - 1, panelBottom - railH - 8.5, 'wood', 'ink', 'front')
  s.rect(10, railH + 18, w - 20, panelBottom - railH - 28, 'wood', 'ink', 'panel')
  s.rect(6, panelBottom, 12, body - panelBottom, 'wood', 'ink', 'leg')
  s.rect(w - 18, panelBottom, 12, body - panelBottom, 'wood', 'ink', 'leg')
  s.shadow(6, 18)
  s.shadow(w - 18, w - 6)
}

function tray(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 1.5, w - 1, body - 2, 'wall', 'ink', 'tin')
  s.line(0.5, 4.5, w - 0.5, 4.5, 'ink', 1, 'rolled-edge')
  s.shadow(0, w)
}

function board(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'frame')
  const inner = body - 4
  const sq = (w - 8) / 8
  for (let i = 0; i < 8; i++) {
    s.rect(4 + i * sq, 2, sq, inner, i % 2 === 0 ? 'light' : 'dark', 'ink', 'square')
  }
  s.shadow(0, w)
}

function typewriter(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  // The sheet stands in the platen: Boxwood, ruled faintly.
  const sheetW = w * 0.44
  const sx = (w - sheetW) / 2
  const sheetBottom = body * 0.58
  s.rect(sx, 0.5, sheetW, sheetBottom, 'light', 'ink', 'sheet')
  for (let y = 6; y < sheetBottom - 4; y += 5) s.line(sx + 3, y, sx + sheetW - 3, y, 'ink', 1, 'sheet-line').style.opacity = 'var(--tint-card-rule)'
  // Ebony body.
  s.rect(0.5, body * 0.52, w - 1, body * 0.14, 'dark', 'ink', 'platen')
  s.rect(0.5, body * 0.66, w - 1, body - body * 0.66, 'dark', 'ink', 'body')
  // Keys: two rows of Boxwood discs.
  const keyR = 1.6
  const rows = 2
  const perRow = 8
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      const kx = 6 + ((w - 12) / (perRow - 1)) * k
      const ky = body * 0.78 + r * 6
      s.circle(kx, ky, keyR, 'light', 'ink', 'key')
    }
  }
  s.shadow(0, w)
}

function stamp(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  // Oak handle: knob, shaft, base plate; Iron Gall pad.
  const hx = w * 0.32
  s.rect(hx - 6, 0.5, 12, 4, 'wood', 'ink', 'knob')
  s.rect(hx - 2.5, 4.5, 5, body * 0.45, 'wood', 'ink', 'shaft')
  s.rect(hx - 8, 4.5 + body * 0.45, 16, 3, 'wood', 'ink', 'base')
  const padY = 4.5 + body * 0.45 + 3
  s.rect(0.5, padY + 2, w - 1, body - padY - 2, 'ink', 'ink', 'pad')
  s.shadow(0, w)
}

function halm(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  const cx = w / 2
  // His chair, behind him: the far bentwood chair, Marle Oak, top rail and uprights.
  s.rect(cx - 30, body * 0.1, 60, 8, 'wood', 'ink', 'chair-rail')
  s.rect(cx - 30, body * 0.1 + 8, 6, body * 0.42, 'wood', 'ink', 'chair-upright')
  s.rect(cx + 24, body * 0.1 + 8, 6, body * 0.42, 'wood', 'ink', 'chair-upright')
  // Tunic, Service Green, shoulders to the rail.
  const shoulderY = body * 0.5
  s.polygon(
    [
      [cx - 44, shoulderY + 8],
      [cx - 30, shoulderY],
      [cx + 30, shoulderY],
      [cx + 44, shoulderY + 8],
      [cx + 42, body],
      [cx - 42, body],
    ],
    'wall',
    'ink',
    'tunic',
  )
  // Collar, closed.
  s.polygon(
    [
      [cx - 8, shoulderY],
      [cx, shoulderY + 10],
      [cx + 8, shoulderY],
    ],
    'wall',
    'ink',
    'collar',
  )
  for (let i = 0; i < 4; i++) s.circle(cx, shoulderY + 20 + i * 12, 2, 'light', 'ink', 'tunic-button')
  // Head: Boxwood, without features. Neck below it.
  const headR = 20
  const headY = shoulderY - headR - 6
  s.rect(cx - 6, headY + headR - 2, 12, 10, 'light', 'ink', 'neck')
  s.circle(cx, headY, headR, 'light', 'ink', 'head')
  // Hands on the rail: two Boxwood ovals at the lower edge.
  s.ellipse(cx - 24, body - 5, 9, 4.5, 'light', 'ink', 'hand')
  s.ellipse(cx + 24, body - 5, 9, 4.5, 'light', 'ink', 'hand')
  s.shadow(cx - 42, cx + 42)
}

function chair(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  // The visitor's bentwood chair, back to the camera: hoop back, seat, four legs.
  const seatY = body * 0.66
  s.rect(w * 0.16, body * 0.08, w * 0.68, 8, 'wood', 'ink', 'top-rail')
  s.rect(w * 0.16, body * 0.08 + 8, 7, seatY - body * 0.08 - 8, 'wood', 'ink', 'upright')
  s.rect(w * 0.84 - 7, body * 0.08 + 8, 7, seatY - body * 0.08 - 8, 'wood', 'ink', 'upright')
  s.rect(w / 2 - 5, body * 0.08 + 8, 10, seatY - body * 0.08 - 8, 'wood', 'ink', 'splat')
  s.rect(w * 0.06, seatY, w * 0.88, 8, 'wood', 'ink', 'seat')
  const legs = [w * 0.09, w * 0.27, w * 0.66, w * 0.84]
  for (const x of legs) s.rect(x, seatY + 8, 6, body - seatY - 8, 'wood', 'ink', 'leg')
  for (const x of legs) s.shadow(x, x + 6)
}

function trap(s: Sheet): void {
  const { w, h } = s
  const body = h - 1
  s.rect(0.5, 0.5, w - 1, body - 1, 'wood', 'ink', 'trap')
  s.rect(4, 4, w - 8, body - 8, 'wood', 'ink', 'trap-inner')
  // Boxwood ring, lying flat, seen as an annulus; an Iron Gall padlock at the hasp.
  const rcx = w * 0.42
  const rcy = body / 2
  const ring = s.path(
    `M${num(rcx - 12)},${num(rcy)} a12,6 0 1 0 24,0 a12,6 0 1 0 -24,0 Z M${num(rcx - 8)},${num(rcy)} a8,3 0 1 1 16,0 a8,3 0 1 1 -16,0 Z`,
    'light',
    'ink',
    1,
    'ring',
  )
  ring.setAttribute('fill-rule', 'evenodd')
  const px = w * 0.7
  const py = body / 2
  s.path(`M${num(px - 4)},${num(py)} v-6 a4,4 0 0 1 8,0 v6`, 'none', 'ink', 1.5, 'shackle')
  s.rect(px - 6, py - 1, 12, 9, 'ink', 'ink', 'padlock')
  s.shadow(0, w)
}

/** The worn path S-4: Boxwood over Marle Oak at 18 per cent, no joints drawn. */
export function pathSymbol(doc: Document, size: SymbolSize, polygon: readonly [number, number][]): SVGSVGElement {
  const s = new Sheet(doc, size.w, size.h, 'path')
  const band = s.polygon(polygon, 'light', 'ink', 'wear')
  band.style.fillOpacity = 'var(--tint-wear)'
  band.setAttribute('data-wear', '')
  return s.svg
}

/**
 * Draws the symbol for an object at the given size in reference pixels.
 * Returns an SVG that fills its container. Unknown ids get a plain outlined
 * shape in the room's wood, so nothing is invisible.
 */
export function drawSymbol(id: string, size: SymbolSize, doc: Document = document): SVGSVGElement {
  const s = new Sheet(doc, size.w, size.h, id)
  switch (id) {
    case 'door-escutcheon':
      door(s, { knob: true, escutcheon: true })
      break
    case 'door-plain':
      door(s, { knob: true, escutcheon: false })
      break
    case 'door-nailed':
      doorNailed(s)
      break
    case 'window':
      windowSymbol(s)
      break
    case 'greatcoat':
      greatcoat(s)
      break
    case 'clock-left':
      clock(s, CLOCK_LEFT_TIME)
      break
    case 'clock-right':
      clock(s, CLOCK_RIGHT_TIME)
      break
    case 'tariff-board':
      tariffBoard(s)
      break
    case 'cabinet':
      cabinet(s)
      break
    case 'hook':
      hook(s)
      break
    case 'stove':
      stove(s)
      break
    case 'desk':
      desk(s)
      break
    case 'tray':
      tray(s)
      break
    case 'board':
      board(s)
      break
    case 'typewriter':
      typewriter(s)
      break
    case 'stamp':
      stamp(s)
      break
    case 'halm':
      halm(s)
      break
    case 'chair':
      chair(s)
      break
    case 'trap':
      trap(s)
      break
    case 'hours-card':
    case 'path':
      // Drawn by the scene: the card is paper with typed lines; the path takes its polygon.
      break
    default:
      s.rect(0.5, 0.5, size.w - 1, size.h - 2, 'wood', 'ink', 'shape')
      s.shadow(0, size.w)
  }
  return s.svg
}

/**
 * The floor: Marle Oak boards, joints 1 rpx Iron Gall every `boardRpx`, a
 * skirting line along the top where the wall ends.
 */
export function drawFloor(size: SymbolSize, boardRpx: number, doc: Document = document): SVGSVGElement {
  const s = new Sheet(doc, size.w, size.h, 'floor')
  s.rect(0, 0, size.w, size.h, 'wood', null, 'boards')
  s.line(0, 0.5, size.w, 0.5, 'ink', 1, 'skirting')
  for (let y = boardRpx; y < size.h; y += boardRpx) s.line(0, y + 0.5, size.w, y + 0.5, 'ink', 1, 'joint')
  return s.svg
}
