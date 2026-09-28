/**
 * The stage. docs/visual.md sections 1, 4 and 11.
 * 1600 by 900 reference pixels, scaled uniformly by min(vw/1600, vh/900),
 * centred on the Iron Gall matte, never cropped or reflowed. The root font
 * size is stage height / 50 and --rpx is one reference pixel in CSS pixels.
 */
import type { CardKind, CardOptions, Palette, Stage, StageOptions } from '../contracts/frame'
import { CARD_HOLD_MS, FADE_MS, PAN_EASING, TRACK_MS, WHIP_MS, motionMs, wait } from './motion'
import { ensureGrainFilter } from './paper'

export const STAGE_W = 1600
export const STAGE_H = 900
export const DEFAULT_ASPECT = 16 / 9
/** 1rem is stage height divided by this. */
export const REM_DIVISOR = 50

export interface StageExtras {
  /** The plane that carries the content and any card; it is what a whip pan moves. */
  readonly plane: HTMLElement
  /** Re-measures the root and re-applies scale, root font size and --rpx. */
  relayout(): void
  /** Removes the held card, if any, at once. */
  clearCard(): void
  /** The card currently on the stage, held or in its hold, or null. */
  currentCard(): HTMLElement | null
  /** Stops observing and removes the stage from the root. */
  destroy(): void
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'Dead'])

function isUpper(line: string): boolean {
  return /[A-Z]/.test(line) && line === line.toUpperCase()
}

/** Which typography class a card line gets, by kind, layout and position. */
export function cardLineClass(kind: CardKind, layout: 'centred' | 'block', block: number, index: number): string {
  if (kind === 'chapter') {
    if (block === 0) {
      if (index === 0) return 't-chapter-numeral'
      if (index === 1) return 't-chapter-room'
      if (index === 2) return 't-chapter-title'
    }
    return 't-chapter-line'
  }
  if (kind === 'intertitle') {
    return block === 0 && index === 0 ? 't-card-form' : 't-card-body'
  }
  if (layout === 'block') return 't-card-body'
  if (block === 0) {
    if (index === 0) return 't-card-1'
    if (index === 1) return 't-card-ministry'
    return 't-card-body'
  }
  return index === 0 ? 't-card-form' : 't-card-body'
}

/** The card's layout: centred, or a left-aligned block when no line is set in capitals (Card 2). */
export function cardLayout(kind: CardKind, lines: readonly string[]): 'centred' | 'block' {
  if (kind !== 'title') return 'centred'
  const text = lines.filter((l) => l.trim() !== '')
  return text.length > 0 && !text.some(isUpper) ? 'block' : 'centred'
}

/** Fills a body line, setting a leading "Label:" in 500 without changing a character. */
function fillBodyLine(p: HTMLElement, line: string, labelled: boolean): void {
  const m = labelled ? /^([^:]{1,60}:)(\s)/.exec(line) : null
  if (!m) {
    p.textContent = line
    return
  }
  const label = p.ownerDocument.createElement('span')
  label.className = 't-card-label'
  label.textContent = m[1] as string
  p.appendChild(label)
  p.appendChild(p.ownerDocument.createTextNode(line.slice((m[1] as string).length)))
}

export function buildCard(doc: Document, lines: readonly string[], kind: CardKind): HTMLElement {
  const card = doc.createElement('section')
  card.className = 'stage-card'
  card.setAttribute('data-card', '')
  card.setAttribute('data-card-kind', kind)
  card.setAttribute('role', 'group')
  const first = lines.find((l) => l.trim() !== '')
  if (first) card.setAttribute('aria-label', first)

  const layout = cardLayout(kind, lines)
  const inner = doc.createElement('div')
  inner.className = 'stage-card-inner'
  inner.setAttribute('data-card-layout', layout)

  let block = 0
  let index = 0
  for (const line of lines) {
    if (line.trim() === '') {
      const gap = doc.createElement('div')
      gap.className = 'stage-card-gap'
      gap.setAttribute('aria-hidden', 'true')
      inner.appendChild(gap)
      block++
      index = 0
      continue
    }
    const cls = cardLineClass(kind, layout, block, index)
    const p = doc.createElement('p')
    p.className = cls
    p.setAttribute('data-card-line', String(index))
    if (cls === 't-card-body') fillBodyLine(p, line, layout === 'block')
    else p.textContent = line
    inner.appendChild(p)
    index++
  }
  card.appendChild(inner)
  return card
}

export function createStage(root: HTMLElement, options: StageOptions = {}): Stage & StageExtras {
  const doc = root.ownerDocument
  const win = doc.defaultView as (Window & typeof globalThis) | null
  const aspect = options.aspect && options.aspect > 0 ? options.aspect : DEFAULT_ASPECT
  const refH = STAGE_W / aspect

  root.classList.add('frame-root')

  const el = doc.createElement('div')
  el.className = 'stage'
  el.setAttribute('data-stage', '')
  el.setAttribute('data-stage-aspect', String(aspect))

  const plane = doc.createElement('div')
  plane.className = 'stage-plane'
  plane.setAttribute('data-stage-plane', '')

  const content = doc.createElement('div')
  content.className = 'stage-content'
  content.setAttribute('data-stage-content', '')

  plane.appendChild(content)
  el.appendChild(plane)
  root.appendChild(el)
  ensureGrainFilter(el)

  // ---- scale -------------------------------------------------------------

  function measure(): { w: number; h: number } {
    let w = root.clientWidth
    let h = root.clientHeight
    if ((!w || !h) && win) {
      w = win.innerWidth
      h = win.innerHeight
    }
    return { w, h }
  }

  function relayout(): void {
    const { w, h } = measure()
    if (!w || !h) return
    const scale = Math.min(w / STAGE_W, h / refH)
    const sw = STAGE_W * scale
    const sh = refH * scale
    el.style.width = `${sw}px`
    el.style.height = `${sh}px`
    el.setAttribute('data-stage-scale', String(scale))
    const html = doc.documentElement
    html.style.fontSize = `${sh / REM_DIVISOR}px`
    html.style.setProperty('--rpx', `${scale}px`)
  }

  relayout()

  let observer: ResizeObserver | null = null
  const onResize = (): void => relayout()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(onResize)
    observer.observe(root)
  }
  win?.addEventListener('resize', onResize)

  // ---- palette -----------------------------------------------------------

  function setPalette(palette: Palette): void {
    el.style.setProperty('--c-wall', palette.wall)
    el.style.setProperty('--c-wood', palette.wood)
    el.style.setProperty('--c-light', palette.light)
    el.style.setProperty('--c-dark', palette.dark)
    el.style.setProperty('--c-wax', palette.wax)
    el.style.setProperty('--c-ink', palette.ink)
  }

  // ---- cards -------------------------------------------------------------

  let cardEl: HTMLElement | null = null
  let firstCard = true
  let settleActive: (() => void) | null = null

  function clearCard(): void {
    settleActive?.()
    cardEl?.remove()
    cardEl = null
  }

  function showCard(lines: string[], cardOptions: CardOptions = {}): Promise<void> {
    const kind = cardOptions.kind ?? 'title'
    const holdMs = cardOptions.holdMs ?? CARD_HOLD_MS
    const waitForInput = cardOptions.waitForInput ?? false

    // A card still holding is settled now; the new card cuts in over it.
    settleActive?.()
    cardEl?.remove()

    const card = buildCard(doc, lines, kind)
    const fade = firstCard
    firstCard = false
    if (fade) card.setAttribute('data-card-fade', 'in')
    plane.appendChild(card)
    cardEl = card

    return new Promise<void>((resolve) => {
      let done = false
      let fadeTimer: ReturnType<typeof setTimeout> | null = null
      let holdTimer: ReturnType<typeof setTimeout> | null = null

      const onClick = (): void => settle()
      const onKey = (e: KeyboardEvent): void => {
        if (MODIFIER_KEYS.has(e.key)) return
        settle()
      }

      function settle(): void {
        if (done) return
        done = true
        if (fadeTimer !== null) clearTimeout(fadeTimer)
        if (holdTimer !== null) clearTimeout(holdTimer)
        el.removeEventListener('click', onClick)
        win?.removeEventListener('keydown', onKey)
        if (settleActive === settle) settleActive = null
        card.setAttribute('data-card-state', 'held')
        resolve()
      }

      settleActive = settle
      el.addEventListener('click', onClick)
      win?.addEventListener('keydown', onKey)
      card.setAttribute('data-card-state', fade ? 'fading' : 'holding')

      const begin = (): void => {
        if (done) return
        card.setAttribute('data-card-state', 'holding')
        if (!waitForInput) holdTimer = setTimeout(settle, holdMs)
      }

      if (fade) {
        const ms = motionMs(FADE_MS)
        // Flush the initial style so the transition to opacity 1 runs.
        if (win) void win.getComputedStyle(card).opacity
        card.setAttribute('data-card-fade', 'up')
        fadeTimer = setTimeout(begin, ms)
      } else {
        begin()
      }
    })
  }

  // ---- motion ------------------------------------------------------------

  let trackX = 0

  function contentRest(): string {
    return `translateX(${trackX * 100}%)`
  }

  async function whipPan(direction: 'left' | 'right', swap: () => void | Promise<void>): Promise<void> {
    const ms = motionMs(WHIP_MS)
    const sign = direction === 'left' ? -1 : 1
    const incoming = -sign * 100
    const outgoing = cardEl

    plane.style.transition = 'none'
    plane.style.transform = 'translateX(0)'
    if (outgoing) {
      // The room lies beside the card on one plane.
      content.style.transition = 'none'
      content.style.transform = `translateX(${incoming}%)`
    }
    if (win) void win.getComputedStyle(plane).transform
    plane.style.transition = ms > 0 ? `transform ${ms}ms ${PAN_EASING}` : 'none'
    plane.style.transform = `translateX(${sign * 100}%)`
    el.setAttribute('data-stage-motion', 'whip')

    const started = Date.now()
    await wait(ms / 2)
    if (!outgoing) {
      // No card: the content itself is swapped in motion and arrives from the far side.
      content.style.transition = 'none'
      content.style.transform = `translateX(${incoming}%)`
    }
    await swap()
    await wait(Math.max(0, ms - (Date.now() - started)))

    // Settle: a cut back to rest that changes nothing on screen.
    plane.style.transition = 'none'
    plane.style.transform = 'translateX(0)'
    trackX = 0
    content.style.transition = 'none'
    content.style.transform = contentRest()
    if (outgoing) {
      outgoing.remove()
      if (cardEl === outgoing) cardEl = null
    }
    el.removeAttribute('data-stage-motion')
  }

  async function track(dx: number, durationMs: number = TRACK_MS): Promise<void> {
    const ms = motionMs(durationMs)
    trackX += dx
    if (win) void win.getComputedStyle(content).transform
    content.style.transition = ms > 0 ? `transform ${ms}ms ${PAN_EASING}` : 'none'
    content.style.transform = contentRest()
    el.setAttribute('data-stage-motion', 'track')
    await wait(ms)
    content.style.transition = 'none'
    el.removeAttribute('data-stage-motion')
  }

  function destroy(): void {
    clearCard()
    observer?.disconnect()
    win?.removeEventListener('resize', onResize)
    el.remove()
  }

  return {
    el,
    content,
    plane,
    setPalette,
    showCard,
    whipPan,
    track,
    relayout,
    clearCard,
    currentCard: () => cardEl,
    destroy,
  }
}
