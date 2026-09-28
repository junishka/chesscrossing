// The UI root: mounts the layers over the stage, sets the palette as CSS custom properties, and
// subscribes to bus events. Plain DOM and CSS; the scene is never imported here.
import './styles.css'
import type { CardDef, CharacterDef, ClockState, Color, LedgerRow, MoveRecord, PieceType, UiMode } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { tokens, ui as uiTokens } from '../content/palette'
import { chapterHeadingText, copy, errorCard, resultText, toMoveText, type ErrorCardKey } from '../content/copy'
import { TitleLayer, typed, type TitleSpec } from './titleCards'
import { Hud, type BoardControlHandlers } from './hud'
import { CardLayer } from './cards'
import { ConverseLayer, type ContextProvider } from './converse'
import { InsertLayer, type InsertSpec } from './insert'
import { MenuLayer, type MenuSpec } from './menu'
import { CursorLayer } from './cursor'

const TOAST_MS = 2400

/** Creates an element with a class list and optional text. Shared by every layer. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

/** `#rgb` or `#rrggbb` → packed 24-bit integer. */
function hexInt(hex: string): number {
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = s.replace(/./g, (c) => c + c)
  return parseInt(s.slice(0, 6), 16) || 0
}

function rgba(hex: string, alpha: number): string {
  const n = hexInt(hex)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function mix(a: string, b: string, k: number): string {
  const na = hexInt(a)
  const nb = hexInt(b)
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - k) + ((nb >> s) & 255) * k)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

/** Writes the palette tokens the stylesheet reads to :root as `--cc-*` custom properties (§14.4). */
function applyTokens(): void {
  const s = document.documentElement.style
  const set = (name: string, value: string) => s.setProperty(`--cc-${name}`, value)
  set('ink', uiTokens.ink)
  set('paper', uiTokens.paper)
  set('paper-white', uiTokens.paperWhite)
  set('paper-dark', uiTokens.paperDark)
  set('accent', uiTokens.accent)
  set('brass', uiTokens.brass)
  set('brass-hi', mix(uiTokens.brass, uiTokens.paperWhite, 0.28))
  set('brass-lo', mix(uiTokens.brass, uiTokens.ink, 0.38))
  set('matte', uiTokens.matte)
  set('surround', uiTokens.surround)
  set('bg', uiTokens.bg)
  set('felt', tokens['br.darkSquare'])
  set('mustard', tokens['br.sandMustard'])
  set('olive', tokens['hs.olive'])
  set('raspberry', tokens['hs.raspberry'])
  set('textile', tokens['hs.textile'])
  set('sepia', mix(tokens['hs.ground'], uiTokens.paper, 0.45))
  set('sepia-dark', mix(tokens['hs.ground'], uiTokens.ink, 0.3))
  set('hairline', uiTokens.hairline)
  set('hairline-paper', rgba(uiTokens.paper, 0.35))
  set('veil', rgba(uiTokens.ink, 0.62))
  set('accent-paper', mix(uiTokens.accent, uiTokens.paper, 0.35))
  set('ink-soft', rgba(uiTokens.ink, 0.55))
  set('paper-shade', rgba(uiTokens.ink, 0.08))
  set('paper-glint', rgba(uiTokens.paperWhite, 0.45))
}

/** The whole overlay. See docs/ARCHITECTURE.md → ui, extended by the station layer's roll and inserts. */
export class UI {
  readonly el: HTMLElement
  readonly hud: {
    setClocks(c: ClockState): void
    /** The thin adapter: a move list becomes rows of the roll. */
    setLedger(moves: MoveRecord[]): void
    /** The roll itself, from the station layer; append-only diffing by index. */
    setRows(rows: LedgerRow[]): void
    /** Clicking a move row rewinds the board to that ply; the row itself is passed too. */
    onRowClick(fn: (ply: number, row: LedgerRow) => void): void
    /** Which colour the Visitor plays; the dials and the columns follow it. */
    setPlayerColor(c: Color): void
    setStatus(text: string): void
    setThinking(on: boolean): void
    setCaptured(byWhite: PieceType[], byBlack: PieceType[]): void
  }
  readonly converse: { open(persona: CharacterDef, contextProvider: ContextProvider): void; close(): void; readonly isOpen: boolean }
  readonly menu: { open(o: MenuSpec): void; close(): void }
  readonly boardControls: { show(o: BoardControlHandlers): void; hide(): void; setView(v: 'overhead' | 'seated' | 'side'): void }

  private titles: TitleLayer
  private hudLayer: Hud
  private cards: CardLayer
  private converseLayer: ConverseLayer
  private insertLayer: InsertLayer
  private menuLayer: MenuLayer
  private cursor: CursorLayer
  private toasts: HTMLElement
  private bars: Record<'top' | 'bottom' | 'left' | 'right', HTMLElement>
  private currentMode: UiMode = 'title'
  private modeBeforeConverse: UiMode = 'world'
  private aspect: number | undefined
  private moves: MoveRecord[] = []
  private playerColor: Color = 'w'
  /** Once the station layer hands the HUD the roll (`hud.setRows`), game events no longer rebuild it from the move list. */
  private rollOwned = false
  private offs: (() => void)[] = []

  constructor(root: HTMLElement) {
    applyTokens()
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative'
    this.el = h('div', 'cc-ui')
    this.el.dataset.mode = this.currentMode
    root.appendChild(this.el)

    this.bars = {
      top: h('div', 'cc-bar cc-bar-top'), bottom: h('div', 'cc-bar cc-bar-bottom'),
      left: h('div', 'cc-bar cc-bar-left'), right: h('div', 'cc-bar cc-bar-right'),
    }
    this.el.append(this.bars.top, this.bars.bottom, this.bars.left, this.bars.right)

    this.hudLayer = new Hud(this.el)
    this.cards = new CardLayer(this.el)
    this.converseLayer = new ConverseLayer(this.el, () => this.leaveConverse(), (card) => this.card(card))
    this.menuLayer = new MenuLayer(this.el)
    this.toasts = h('div', 'cc-toasts')
    this.el.appendChild(this.toasts)
    this.insertLayer = new InsertLayer(this.el)
    this.titles = new TitleLayer(this.el)
    this.cursor = new CursorLayer(this.el, root)

    const hud = this.hudLayer
    this.hud = {
      setClocks: (c) => hud.setClocks(c),
      setLedger: (moves) => { this.moves = [...moves]; this.rollOwned = false; hud.setLedger(this.moves); this.refreshCaptured() },
      setRows: (rows) => { this.rollOwned = true; hud.setRows(rows) },
      onRowClick: (fn) => hud.onRowClick(fn),
      setPlayerColor: (c) => { this.playerColor = c; hud.setPlayerColor(c) },
      setStatus: (t) => hud.setStatus(t),
      setThinking: (on) => hud.setThinking(on),
      setCaptured: (w, b) => hud.setCaptured(w, b),
    }
    const conv = this.converseLayer
    this.converse = {
      open: (p, ctx) => conv.open(p, ctx, this.currentMode === 'board' || (this.currentMode === 'converse' && this.modeBeforeConverse === 'board')),
      close: () => conv.close(),
      get isOpen() { return conv.isOpen },
    }
    this.menu = { open: (o) => this.menuLayer.open(o), close: () => this.menuLayer.close() }
    this.boardControls = { show: (o) => hud.showControls(o), hide: () => hud.hideControls(), setView: (v) => hud.setView(v) }

    this.subscribe()
    window.addEventListener('resize', this.onResize)
  }

  /** Unsubscribes window listeners; the DOM is removed. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    for (const off of this.offs) off()
    this.offs = []
    this.cursor.dispose()
    this.insertLayer.dispose()
    this.el.remove()
  }

  private onResize = (): void => this.layoutBars()

  /** Shows a title card (the Recorder's chapter page, or a plain typed card); resolves after the cut back. */
  title(o: TitleSpec): Promise<void> {
    return this.titles.show(o)
  }

  /** Shows a paper card; `null` closes it. `onClose` is called once when this card leaves the screen. */
  card(card: CardDef | null, onClose?: () => void): void {
    this.cards.show(card, onClose)
  }

  /** One of the seven error-state cards of §4, typed, held until dismissed. The game continues behind it. */
  error(key: ErrorCardKey): void {
    const c = errorCard(key)
    this.card({ kind: 'typed', title: c.title, body: c.lines.join('\n') })
  }

  /** A God's-eye insert: cut to the flat, hold, cut back. Any key or click skips. */
  insert(o: InsertSpec): Promise<void> {
    return this.insertLayer.show(o)
  }

  /** The hover label at the foot of the frame; `null` clears it. */
  hoverLabel(text: string | null, x?: number, y?: number): void {
    this.cursor.setLabel(text, x, y)
  }

  /** A typed line at the bottom centre for 2.4 seconds. */
  toast(text: string): void {
    const el = h('div', 'cc-toast cc-mono')
    el.appendChild(typed(text))
    this.toasts.appendChild(el)
    window.setTimeout(() => el.remove(), TOAST_MS)
  }

  /** The matte, sized from a target aspect and animated over 900 ms; `undefined` opens it. Off when the setting is off. */
  letterbox(aspect?: number): void {
    this.aspect = aspect
    this.layoutBars()
  }

  /** Switches the visible layers. */
  mode(mode: UiMode): void {
    if (mode !== 'converse' && this.converseLayer.isOpen) this.converseLayer.close()
    if (mode !== 'menu' && this.menuLayer.isOpen) this.menuLayer.close()
    if (mode === 'converse' && this.currentMode !== 'converse') this.modeBeforeConverse = this.currentMode
    if (mode === 'converse') this.el.dataset.hud = this.modeBeforeConverse === 'board' ? 'on' : 'off'
    this.currentMode = mode
    this.el.dataset.mode = mode
    this.cursor.enable(mode === 'board' || mode === 'world')
    if (mode !== 'world' && mode !== 'board') this.cursor.setLabel(null)
  }

  private leaveConverse(): void {
    this.converseLayer.close()
    bus.emit('ui:mode', { mode: this.modeBeforeConverse })
  }

  private layoutBars(): void {
    const on = this.aspect !== undefined && store.settings.letterbox
    const w = this.el.clientWidth
    const hgt = this.el.clientHeight
    let barH = 0
    let barW = 0
    if (on && this.aspect && w && hgt) {
      const viewAspect = w / hgt
      if (viewAspect > this.aspect) barW = (w - hgt * this.aspect) / 2
      else barH = (hgt - w / this.aspect) / 2
    }
    this.bars.top.style.height = this.bars.bottom.style.height = `${Math.round(barH)}px`
    this.bars.left.style.width = this.bars.right.style.width = `${Math.round(barW)}px`
    this.el.style.setProperty('--cc-bar-h', `${Math.round(barH)}px`)
    this.el.style.setProperty('--cc-bar-w', `${Math.round(barW)}px`)
  }

  private refreshCaptured(): void {
    const byWhite: PieceType[] = []
    const byBlack: PieceType[] = []
    for (const m of this.moves) {
      if (!m.captured) continue
      ;(m.color === 'w' ? byWhite : byBlack).push(m.captured)
    }
    this.hudLayer.setCaptured(byWhite, byBlack)
  }

  private subscribe(): void {
    const on: typeof bus.on = (event, handler) => { const off = bus.on(event, handler); this.offs.push(off); return off }
    on('ui:title', (o) => { void this.title(o) })
    on('ui:card', ({ card }) => this.card(card))
    on('ui:mode', ({ mode }) => this.mode(mode))
    on('ui:toast', ({ text }) => this.toast(text))
    on('ledger:line', ({ text }) => this.toast(text))

    on('game:new', ({ settings, fen }) => {
      this.moves = []
      this.hud.setPlayerColor(settings.playerColor)
      if (!this.rollOwned) this.hudLayer.setLedger([])
      this.hudLayer.setCaptured([], [])
      this.hudLayer.setThinking(false)
      const turn: Color = fen.split(' ')[1] === 'b' ? 'b' : 'w'
      this.hudLayer.setStatus(toMoveText(turn, false, this.playerColor))
    })
    on('game:move', ({ move, status }) => {
      this.moves.push(move)
      if (!this.rollOwned) this.hudLayer.setLedger(this.moves)
      if (move.captured) this.refreshCaptured()
      this.hudLayer.setThinking(false)
      if (!status.isGameOver) this.hudLayer.setStatus(toMoveText(status.turn, status.inCheck, this.playerColor))
    })
    on('game:undo', ({ fen }) => {
      while (this.moves.length && this.moves[this.moves.length - 1].fenAfter !== fen) this.moves.pop()
      if (!this.rollOwned) this.hudLayer.setLedger(this.moves)
      this.refreshCaptured()
      this.hudLayer.setThinking(false)
      const last = this.moves[this.moves.length - 1]
      const turn: Color = last ? (last.color === 'w' ? 'b' : 'w') : fen.split(' ')[1] === 'b' ? 'b' : 'w'
      this.hudLayer.setStatus(toMoveText(turn, last?.isCheck ?? false, this.playerColor))
    })
    on('game:over', ({ result, reason }) => {
      this.hudLayer.setThinking(false)
      const winner = result === '1-0' ? 'w' : result === '0-1' ? 'b' : null
      this.hudLayer.setStatus(resultText(reason, winner))
    })
    on('game:clock', (c) => this.hudLayer.setClocks(c))
    on('game:thinking', ({ thinking }) => {
      this.hudLayer.setThinking(thinking)
      if (thinking) this.hudLayer.setStatus(copy.status.thinking)
    })

    on('world:inspect', ({ hotspot }) => { if (hotspot.card) this.card(hotspot.card) })
    on('world:egg', ({ egg }) => { if (egg.card) this.card(egg.card) })
    on('chapter:unlock', ({ chapter }) => {
      void this.title({ chapter: chapterHeadingText(chapter.number), title: chapter.title, subtitle: chapter.subtitle })
    })
    on('settings:change', () => this.layoutBars())
  }
}
