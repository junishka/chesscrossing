// The HUD. Left: the chronometer pair (an SVG double clock, brass rims, red fall flags, the dials labelled
// VISITOR and THE CHAIR) and THE RETURNED, a felt tray of two rows of cutouts with a count. Right: the roll
// of docs/BIBLE.md §4, typed, columns No. / VISITOR / THE CHAIR / ISLET / REMARK, one row per ply, remarks
// under the ply, the leader lines at the top reachable by scrolling up. Bottom, centred: the status line in
// letterspaced capitals and the board controls.
import type { ClockState, Color, LedgerRow, MoveRecord, PieceType } from '../types'
import { copy } from '../content/copy'
import { isletName } from '../content/survey'
import { h } from './overlay'
import { typed } from './titleCards'

/** Handlers for the control row. ADJOURN falls back to `onStandUp` when `onAdjourn` is not given. */
export interface BoardControlHandlers {
  onView(v: 'overhead' | 'seated' | 'side'): void
  onSecond(): void
  onResign(): void
  onDraw(): void
  onUndo(): void
  onStandUp(): void
  onAdjourn?(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const TRAY_SLOTS = 16

/** Small piece silhouettes (16×16) for THE RETURNED. */
const GLYPHS: Record<PieceType, string> = {
  p: 'M8 2.4a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 0 1 0-4.2ZM6.6 7.2h2.8l1.5 4.6H5.1ZM4 12.6h8V14H4Z',
  r: 'M4 2h2v2h1.3V2h1.4v2H10V2h2v4.2H4ZM5 7h6l.7 5H4.3ZM3.5 12.8h9V14h-9Z',
  b: 'M8 1.4l1.6 2.6-1.6 2.2-1.6-2.2ZM6 6.6h4c1.1 2 1.4 3.6.5 5.4h-5c-.9-1.8-.6-3.4.5-5.4ZM4 12.8h8V14H4Z',
  n: 'M4.8 14h7.6v-1.6c0-3-.9-5.2-2.6-6.8l1.4-2.4-2.6 1L7.2 1.8l-.6 2.8-3.1 3.2 1 1.6 2.1-1.1c.5 1.6-.4 2.8-1.8 4.6Z',
  q: 'M8 1.2l.9 1.6H7.1ZM2.8 3.6l1.7 4.2L6.5 4l1.5 3.4L9.5 4l2 3.8 1.7-4.2-1.1 8.4H3.9ZM4 12.8h8V14H4Z',
  k: 'M7.3.8h1.4v1.8h1.6v1.3H8.7v1.5H7.3V3.9H5.7V2.6h1.6ZM5 6.2h6l.9 5.8H4.1ZM4 12.8h8V14H4Z',
}

const HAND_TRANSITION = 'transform 220ms ease-out'

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

function glyph(type: PieceType, color: Color): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 16 16', class: `cc-glyph cc-glyph-${color}` })
  s.appendChild(svg('path', { d: GLYPHS[type] }))
  return s
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** One dial of the chronometer pair. */
class Dial {
  readonly g: SVGGElement
  private minute: SVGLineElement
  private second: SVGLineElement
  private flag: SVGGElement
  private plunger: SVGRectElement
  private flagged = false
  private lastSec = 0

  constructor(cx: number, cy: number, r: number, label: string) {
    this.g = svg('g', {})
    this.plunger = svg('rect', { x: cx - 9, y: cy - r - 22, width: 18, height: 12, rx: 1, fill: 'var(--cc-brass)' })
    this.g.append(
      this.plunger,
      svg('rect', { x: cx - 4, y: cy - r - 14, width: 8, height: 6, fill: 'var(--cc-brass)' }),
      svg('circle', { cx, cy, r: r + 3, fill: 'var(--cc-brass)' }),
      svg('circle', { cx, cy, r: r + 1.2, fill: 'var(--cc-ink)' }),
      svg('circle', { cx, cy, r, fill: 'var(--cc-paper)' }),
    )
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0
      const a = (i / 60) * Math.PI * 2
      const r0 = r - (major ? 6 : 3)
      this.g.appendChild(svg('line', {
        x1: cx + Math.sin(a) * r0, y1: cy - Math.cos(a) * r0,
        x2: cx + Math.sin(a) * (r - 1), y2: cy - Math.cos(a) * (r - 1),
        stroke: 'var(--cc-ink)', 'stroke-width': major ? 1.4 : 0.6, opacity: major ? 1 : 0.6,
      }))
    }
    const fy = cy - r + 16
    this.flag = svg('g', {})
    this.flag.append(
      svg('line', { x1: cx, y1: fy, x2: cx, y2: fy - 10, stroke: 'var(--cc-ink)', 'stroke-width': 1 }),
      svg('path', { d: `M${cx} ${fy - 10} L${cx + 8} ${fy - 7.5} L${cx} ${fy - 5} Z`, fill: 'var(--cc-accent)' }),
      svg('circle', { cx, cy: fy, r: 1.2, fill: 'var(--cc-ink)' }),
    )
    this.flag.style.transformOrigin = `${cx}px ${fy}px`
    this.flag.style.transition = 'transform 700ms cubic-bezier(0.3, 1.4, 0.5, 1)'
    this.minute = svg('line', { x1: cx, y1: cy + 5, x2: cx, y2: cy - r + 12, stroke: 'var(--cc-ink)', 'stroke-width': 2.2, 'stroke-linecap': 'round' })
    this.second = svg('line', { x1: cx, y1: cy + 8, x2: cx, y2: cy - r + 6, stroke: 'var(--cc-accent)', 'stroke-width': 0.8 })
    this.g.append(this.flag, this.minute, this.second, svg('circle', { cx, cy, r: 2.2, fill: 'var(--cc-ink)' }))
    // the engraved label on the plate under the dial
    const text = svg('text', { x: cx, y: cy + r + 15, 'text-anchor': 'middle', class: 'cc-dial-label' })
    text.textContent = label
    this.g.appendChild(text)
    this.minute.style.transformOrigin = this.second.style.transformOrigin = `${cx}px ${cy}px`
    this.minute.style.transition = this.second.style.transition = HAND_TRANSITION
    this.plunger.style.transition = 'transform 120ms ease'
  }

  /**
   * Hands read the time left: the flag falls when they reach twelve. Angles are continuous (never
   * wrapped), so a hand never spins the long way round as a minute turns over; a reset snaps instead.
   */
  set(ms: number, running: boolean): void {
    const totalSec = Math.max(0, ms / 1000)
    const minAngle = -(totalSec / 60) * 6
    const secAngle = -totalSec * 6
    const snap = ms <= 0 || Math.abs(secAngle - this.lastSec) > 90
    this.lastSec = secAngle
    this.minute.style.transition = this.second.style.transition = snap ? 'none' : HAND_TRANSITION
    this.minute.style.transform = `rotate(${minAngle.toFixed(2)}deg)`
    this.second.style.transform = `rotate(${secAngle.toFixed(2)}deg)`
    this.plunger.style.transform = running ? 'translateY(6px)' : ''
    const flagged = ms <= 0
    if (flagged !== this.flagged) {
      this.flagged = flagged
      this.flag.style.transform = flagged ? 'rotate(95deg)' : ''
    }
  }
}

/** The number cell of a ply: `1.` for the light side, `1...` for the dark. */
function plyNumber(row: LedgerRow): string {
  const n = row.moveNumber ?? (row.ply ? Math.ceil(row.ply / 2) : 0)
  return row.color === 'b' ? `${n}...` : `${n}.`
}

/**
 * The thin adapter from a move list to the roll: the leader, then one row per ply with the islet of the
 * destination and the rule remarks (`first return`, `flag U hoisted`). The station layer's LedgerRoll
 * replaces this with the full roll (headers, the Second's remarks, crates, results).
 */
export function rowsFromMoves(moves: MoveRecord[]): LedgerRow[] {
  const rows: LedgerRow[] = copy.ledger.leader.map((text) => ({ kind: 'leader', text }))
  let returned = false
  for (const m of moves) {
    const remarks: string[] = []
    if (m.isCapture && !returned) { returned = true; remarks.push(copy.ledger.remarks.firstReturn) }
    if (m.isCheck && !m.isMate) remarks.push(copy.ledger.remarks.flagU)
    const islet = isletName(m.to)
    rows.push({ kind: 'move', text: m.san, ply: m.ply, moveNumber: m.moveNumber, color: m.color, san: m.san, islet, remark: remarks[0], fen: m.fenAfter })
    for (const r of remarks.slice(1)) rows.push({ kind: 'remark', text: r, ply: m.ply })
  }
  return rows
}

/** Left column: the chronometer pair and THE RETURNED. Right column: the roll. Bottom: status and controls. */
export class Hud {
  readonly el: HTMLElement
  private dials: { left: Dial; right: Dial }
  private readouts: { left: HTMLElement; right: HTMLElement }
  private playerColor: Color = 'w'
  private roll: HTMLElement
  private rollEmpty: HTMLElement
  private rows: LedgerRow[] = []
  private rowEls: HTMLElement[] = []
  private latest: HTMLElement | null = null
  private rowClick: ((ply: number) => void) | null = null
  private tray: { light: HTMLElement; dark: HTMLElement; lightCount: HTMLElement; darkCount: HTMLElement }
  private status: HTMLElement
  private statusText: HTMLElement
  private controls: HTMLElement
  private handlers: BoardControlHandlers | null = null
  private activeView: 'overhead' | 'seated' | 'side' = 'seated'

  constructor(parent: HTMLElement) {
    this.el = h('div', 'cc-hud')
    const left = h('div', 'cc-hud-col cc-hud-left')
    const right = h('div', 'cc-hud-col cc-hud-right')
    const bottom = h('div', 'cc-hud-bottom')

    // the chronometer pair
    const clocks = svg('svg', { viewBox: '0 0 232 146', class: 'cc-clocks' })
    clocks.appendChild(svg('rect', { x: 2, y: 22, width: 228, height: 122, rx: 3, fill: 'var(--cc-ink)' }))
    clocks.appendChild(svg('rect', { x: 2, y: 22, width: 228, height: 122, rx: 3, fill: 'none', stroke: 'var(--cc-brass)', 'stroke-width': 1 }))
    clocks.appendChild(svg('line', { x1: 116, y1: 30, x2: 116, y2: 136, stroke: 'var(--cc-brass)', 'stroke-width': 0.6, opacity: 0.5 }))
    this.dials = { left: new Dial(60, 76, 40, copy.hud.visitor), right: new Dial(172, 76, 40, copy.hud.chair) }
    clocks.append(this.dials.left.g, this.dials.right.g)
    const readouts = h('div', 'cc-clock-readouts cc-mono')
    this.readouts = { left: h('span', 'cc-clock-time', '0:00'), right: h('span', 'cc-clock-time', '0:00') }
    readouts.append(this.readouts.left, this.readouts.right)

    // THE RETURNED
    const tray = h('div', 'cc-tray')
    const light = h('div', 'cc-tray-row')
    const dark = h('div', 'cc-tray-row')
    const lightCount = h('span', 'cc-tray-count cc-mono', '')
    const darkCount = h('span', 'cc-tray-count cc-mono', '')
    tray.append(this.heading(copy.hud.returned, 'cc-tray-heading'), light, dark)
    light.appendChild(lightCount)
    dark.appendChild(darkCount)
    this.tray = { light, dark, lightCount, darkCount }
    this.fillTray(light, [], 'w')
    this.fillTray(dark, [], 'b')
    left.append(this.heading(copy.hud.clocks), clocks, readouts, tray)

    // the roll
    this.roll = h('div', 'cc-roll cc-mono cc-interactive')
    this.rollEmpty = h('div', 'cc-roll-empty', copy.ledger.empty)
    this.roll.appendChild(this.rollEmpty)
    right.append(this.heading(copy.hud.ledger), this.roll)

    // status and controls
    this.status = h('div', 'cc-status cc-caps')
    this.statusText = h('span', 'cc-status-text', copy.status.visitorToMove)
    this.status.appendChild(this.statusText)
    this.controls = h('div', 'cc-controls cc-caps cc-interactive')
    bottom.append(this.status, this.controls)

    this.el.append(left, right, bottom)
    parent.appendChild(this.el)
  }

  /** Which colour the Visitor plays: the left dial and the VISITOR column follow it. */
  setPlayerColor(c: Color): void {
    this.playerColor = c
    this.rebuild()
  }

  /** Updates hands, plungers, flags and readouts. Cheap: a few style writes. */
  setClocks(c: ClockState): void {
    const chair: Color = this.playerColor === 'w' ? 'b' : 'w'
    const sides: { dial: Dial; readout: HTMLElement; color: Color }[] = [
      { dial: this.dials.left, readout: this.readouts.left, color: this.playerColor },
      { dial: this.dials.right, readout: this.readouts.right, color: chair },
    ]
    for (const s of sides) {
      s.dial.set(c[s.color], c.running === s.color)
      s.readout.textContent = mmss(c[s.color])
      s.readout.classList.toggle('is-running', c.running === s.color)
      s.readout.classList.toggle('is-flagged', c[s.color] <= 0)
    }
  }

  /** The thin adapter: a move list becomes the roll's rows. */
  setLedger(moves: MoveRecord[]): void {
    this.setRows(rowsFromMoves(moves))
  }

  /**
   * Sets the roll's rows. Rows already on the roll are diffed by index: an unchanged prefix stays, new
   * rows are appended; a changed row and everything after it is rebuilt. The latest ply is underlined.
   */
  setRows(rows: LedgerRow[]): void {
    let keep = 0
    while (keep < rows.length && keep < this.rows.length && sameRow(rows[keep], this.rows[keep])) keep++
    for (const el of this.rowEls.splice(keep)) el.remove()
    this.rows = this.rows.slice(0, keep)
    for (let i = keep; i < rows.length; i++) {
      const el = this.rowEl(rows[i])
      this.roll.appendChild(el)
      this.rowEls.push(el)
      this.rows.push(rows[i])
    }
    this.rollEmpty.style.display = this.rows.some((r) => r.kind !== 'leader' && r.kind !== 'volume') ? 'none' : ''
    this.markLatest()
    this.roll.scrollTop = this.roll.scrollHeight
  }

  /** Clicking a move row rewinds the board to it; the handler receives the ply. */
  onRowClick(fn: (ply: number) => void): void {
    this.rowClick = fn
  }

  setStatus(text: string): void {
    this.statusText.textContent = text
  }

  /** The clock's second hand is the only spinner; this marks the status line and nothing else moves. */
  setThinking(on: boolean): void {
    this.status.classList.toggle('is-thinking', on)
  }

  /** THE RETURNED: light pieces above, dark below, each with a count; `byWhite` are the dark pieces taken. */
  setCaptured(byWhite: PieceType[], byBlack: PieceType[]): void {
    this.fillTray(this.tray.light, byBlack, 'w')
    this.fillTray(this.tray.dark, byWhite, 'b')
    this.tray.lightCount.textContent = byBlack.length ? String(byBlack.length) : ''
    this.tray.darkCount.textContent = byWhite.length ? String(byWhite.length) : ''
    this.tray.light.appendChild(this.tray.lightCount)
    this.tray.dark.appendChild(this.tray.darkCount)
  }

  /** Shows the control row and binds its handlers. */
  showControls(o: BoardControlHandlers): void {
    this.handlers = o
    this.renderControls()
    this.controls.style.display = ''
  }

  hideControls(): void {
    this.handlers = null
    this.controls.style.display = 'none'
    this.controls.replaceChildren()
  }

  /** Marks the current camera view in the control row. */
  setView(v: 'overhead' | 'seated' | 'side'): void {
    this.activeView = v
    for (const b of this.controls.querySelectorAll<HTMLElement>('[data-view]')) {
      b.classList.toggle('is-active', b.dataset.view === v)
    }
  }

  private heading(text: string, cls = ''): HTMLElement {
    const el = h('div', cls ? `cc-hud-heading ${cls}` : 'cc-hud-heading')
    el.appendChild(h('span', 'cc-caps', text))
    return el
  }

  private rebuild(): void {
    const rows = this.rows
    this.rows = []
    for (const el of this.rowEls) el.remove()
    this.rowEls = []
    this.setRows(rows)
  }

  /** One element per row of the roll. */
  private rowEl(row: LedgerRow): HTMLElement {
    switch (row.kind) {
      case 'leader': {
        const ink = row.text === copy.ledger.leader[copy.ledger.leaderInkLine]
        const el = h('div', ink ? 'cc-roll-line cc-roll-leader cc-roll-ink' : 'cc-roll-line cc-roll-leader')
        if (ink) el.textContent = row.text
        else el.appendChild(typed(row.text))
        return el
      }
      case 'volume': {
        const el = h('div', 'cc-roll-line cc-roll-volume')
        el.appendChild(typed(row.text))
        return el
      }
      case 'header': {
        const el = h('div', 'cc-roll-header')
        const head = h('div', 'cc-roll-line')
        head.appendChild(typed(row.text))
        el.append(head, this.columnsRow())
        return el
      }
      case 'move': {
        const el = h('div', 'cc-roll-row')
        const visitor = row.color === this.playerColor
        const san = row.san ?? row.text
        el.append(
          h('span', 'cc-roll-no', plyNumber(row)),
          h('span', 'cc-roll-san', visitor ? san : ''),
          h('span', 'cc-roll-san', visitor ? '' : san),
        )
        const islet = h('span', 'cc-roll-islet')
        islet.appendChild(typed(row.islet ?? ''))
        const remark = h('span', 'cc-roll-remark')
        remark.appendChild(typed(row.remark ?? ''))
        el.append(islet, remark)
        if (row.ply !== undefined) {
          const ply = row.ply
          el.classList.add('is-ply')
          el.addEventListener('click', () => this.rowClick?.(ply))
        }
        return el
      }
      case 'remark':
      case 'result': {
        const el = h('div', row.kind === 'remark' ? 'cc-roll-row cc-roll-remark-row' : 'cc-roll-row cc-roll-result')
        const remark = h('span', 'cc-roll-remark')
        remark.appendChild(typed(row.text))
        el.append(h('span', 'cc-roll-under'), remark)
        return el
      }
      case 'crate':
      case 'line':
      default: {
        const el = h('div', `cc-roll-line cc-roll-${row.kind}`)
        el.appendChild(typed(row.text))
        return el
      }
    }
  }

  /** The column heads under an expedition header: No. / VISITOR / THE CHAIR / ISLET / REMARK. */
  private columnsRow(): HTMLElement {
    const el = h('div', 'cc-roll-row cc-roll-columns')
    const [no, visitor, chair, islet, remark] = copy.ledger.columns
    el.append(h('span', 'cc-roll-no', no), h('span', 'cc-roll-san', visitor), h('span', 'cc-roll-san', chair), h('span', 'cc-roll-islet', islet), h('span', 'cc-roll-remark', remark))
    return el
  }

  private markLatest(): void {
    this.latest?.classList.remove('is-latest')
    this.latest = null
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i].kind === 'move') { this.latest = this.rowEls[i]; break }
    }
    this.latest?.classList.add('is-latest')
  }

  /** Sixteen cutouts per row; pieces lie in order taken, each in its cutout. */
  private fillTray(row: HTMLElement, pieces: PieceType[], color: Color): void {
    const count = row.querySelector('.cc-tray-count')
    row.replaceChildren()
    for (let i = 0; i < TRAY_SLOTS; i++) {
      const slot = h('span', 'cc-tray-slot')
      const p = pieces[i]
      if (p) { slot.classList.add('is-filled'); slot.appendChild(glyph(p, color)) }
      row.appendChild(slot)
    }
    if (count) row.appendChild(count)
  }

  private button(label: string, onClick: () => void, cls = ''): HTMLElement {
    const b = h('button', cls, label)
    b.setAttribute('type', 'button')
    b.addEventListener('click', onClick)
    return b
  }

  private group(...buttons: HTMLElement[]): HTMLElement {
    const g = h('div', 'cc-controls-group')
    g.append(...buttons)
    return g
  }

  /** `TABLE · CHART · PROFILE ┃ CONSULT ┃ TAKE BACK · OFFER A DRAW · RESIGN ┃ ADJOURN`. */
  private renderControls(): void {
    const o = this.handlers
    if (!o) return
    const c = copy.hud.controls
    const view = (v: 'overhead' | 'seated' | 'side', label: string) => {
      const b = this.button(label, () => { this.setView(v); o.onView(v) })
      b.dataset.view = v
      b.classList.toggle('is-active', v === this.activeView)
      return b
    }
    this.controls.replaceChildren(
      this.group(view('seated', c.table), view('overhead', c.chart), view('side', c.profile)),
      this.group(this.button(c.consult, () => o.onSecond())),
      this.group(
        this.button(c.takeBack, () => this.confirm(copy.hud.confirm.takeBack, () => o.onUndo())),
        this.button(c.draw, () => this.confirm(copy.hud.confirm.draw, () => o.onDraw())),
        this.button(c.resign, () => this.confirm(copy.hud.confirm.resign, () => o.onResign()), 'is-danger'),
      ),
      this.group(this.button(c.adjourn, () => (o.onAdjourn ? o.onAdjourn() : o.onStandUp()))),
    )
  }

  /** Replaces the control row with a statement and the two ways on, then restores it. */
  private confirm(statement: string, yes: () => void): void {
    this.controls.replaceChildren(
      h('span', 'cc-confirm-q', statement),
      this.group(
        this.button(copy.hud.confirm.yes, () => { this.renderControls(); yes() }),
        this.button(copy.hud.confirm.no, () => this.renderControls()),
      ),
    )
  }
}

function sameRow(a: LedgerRow, b: LedgerRow): boolean {
  return a.kind === b.kind && a.text === b.text && a.ply === b.ply && a.remark === b.remark && a.islet === b.islet
    && a.san === b.san && a.color === b.color && a.moveNumber === b.moveNumber
}
