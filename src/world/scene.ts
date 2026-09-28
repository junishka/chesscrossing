/**
 * renderRoom: the scene (x 0 to 70) and the page (x 70 to 100) of a room.
 * docs/visual.md sections 5, 8, 12; docs/bible.md section 9; the contract in
 * src/contracts/world.ts. Every string shown comes from src/world/data.
 */
import type { Color } from '../contracts/chess'
import type { AppEvent, EventBus } from '../contracts/events'
import type { CaptionEntry, Room, RoomScene, SlotName, StageRect, WorldObject } from '../contracts/world'
import { LEDGER_MS_PER_CHAR, applyPaper, createDossierCard, createRule, typewrite } from '../frame'
import { drawFloor, drawSymbol, pathSymbol } from './art/symbols'
import {
  BOARD_HEIGHT_Y,
  CABINET_LABELS,
  COLUMN_HEADS,
  CONTROLS,
  DASH,
  HOURS,
  PAGE_PROPERTY_LINE,
  PATH_POLYGON,
  PIECES,
  ROSTER_COUNT,
  ROSTER_ITEM,
  ROSTER_LEFT,
  SCENE_WIDTH_X,
  TARIFF_CLASSES,
  TARIFF_NIL,
  THIRD_HAND_LINE,
  THIRD_HAND_LINE_MS,
  WALL_BOTTOM_Y,
  cardNumber,
  ledgerDate,
} from './data'

/** The stage in reference pixels (docs/visual.md, Units). */
export const STAGE_W_RPX = 1600
export const STAGE_H_RPX = 900
const PAGE_X = 70
const PAGE_W = 30

/** The page head, caption block and dossier layer (docs/visual.md section 5). */
export const PAGE_HEAD_RECT: StageRect = { x: 71.5, y: 2, w: 27, h: 6.5 }
export const CAPTION_BLOCK_RECT: StageRect = { x: 71.5, y: 9, w: 27, h: 21 }

/** Where the stamp's sound setting is remembered, per browser. */
export const SOUND_STORAGE_KEY = 'chesscrossing:sound'

function pct(n: number): string {
  return `${Math.round(n * 1000) / 1000}%`
}

/** Positions an element by a stage rect, relative to the room (which fills the stage). */
function place(el: HTMLElement, rect: StageRect): void {
  el.style.position = 'absolute'
  el.style.left = pct(rect.x)
  el.style.top = pct(rect.y)
  el.style.width = pct(rect.w)
  el.style.height = pct(rect.h)
}

/** Positions an element by a stage rect inside the page, which spans x 70 to 100. */
function placeInPage(el: HTMLElement, rect: StageRect): void {
  el.style.position = 'absolute'
  el.style.left = pct(((rect.x - PAGE_X) / PAGE_W) * 100)
  el.style.top = pct(rect.y)
  el.style.width = pct((rect.w / PAGE_W) * 100)
  el.style.height = pct(rect.h)
}

/** A rect's size in reference pixels. */
export function rectRpx(rect: StageRect): { w: number; h: number } {
  return { w: (rect.w / 100) * STAGE_W_RPX, h: (rect.h / 100) * STAGE_H_RPX }
}

function readSound(win: Window | null): boolean {
  try {
    const v = win?.localStorage.getItem(SOUND_STORAGE_KEY)
    return v === null || v === undefined ? true : v !== 'off'
  } catch {
    return true
  }
}

function writeSound(win: Window | null, on: boolean): void {
  try {
    win?.localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // The setting is a convenience; the page works without it.
  }
}

/* ---------- objects ---------- */

function ariaLabel(o: WorldObject): string {
  return o.entry.item ? `${o.entry.item}. ${o.name}` : o.name
}

function tariffOverlay(doc: Document): HTMLElement {
  const rows = doc.createElement('div')
  rows.className = 'tariff-rows'
  rows.setAttribute('data-tariff-rows', '')
  for (const cls of TARIFF_CLASSES) {
    const row = doc.createElement('div')
    row.className = 'tariff-row'
    const label = doc.createElement('span')
    label.className = 'tariff-class t-caption'
    label.setAttribute('data-tariff-class', '')
    label.textContent = cls
    const nil = doc.createElement('span')
    nil.className = 'tariff-nil t-nil'
    nil.setAttribute('data-tariff-nil', '')
    nil.textContent = TARIFF_NIL
    row.append(label, nil)
    rows.appendChild(row)
  }
  return rows
}

function cabinetOverlay(doc: Document): HTMLElement {
  const labels = doc.createElement('div')
  labels.className = 'cabinet-labels'
  for (const text of CABINET_LABELS) {
    const cell = doc.createElement('div')
    cell.className = 'cabinet-label-cell'
    const label = doc.createElement('span')
    label.className = 'cabinet-label t-label'
    label.setAttribute('data-cabinet-label', '')
    label.textContent = text
    cell.appendChild(label)
    labels.appendChild(cell)
  }
  return labels
}

function hoursCard(doc: Document, o: WorldObject, onHour: (index: number) => void): HTMLElement {
  const card = applyPaper(doc.createElement('div'))
  card.classList.add('scene-object', 'hours-card', 'outlined')
  card.setAttribute('role', 'group')
  card.setAttribute('aria-label', ariaLabel(o))
  HOURS.forEach((hour, index) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.className = 'hour t-label'
    b.setAttribute('data-hour', hour.label)
    b.setAttribute('data-hour-index', String(index))
    b.setAttribute('aria-label', hour.label)
    b.setAttribute('aria-pressed', 'false')
    b.textContent = hour.label
    b.addEventListener('click', () => onHour(index))
    card.appendChild(b)
  })
  return card
}

/* ---------- caption block ---------- */

interface CaptionBlock {
  el: HTMLElement
  /** Prints the columns at once and types the annotation. */
  show(entry: CaptionEntry, msPerChar?: number): void
  currentItem(): string | null
  destroy(): void
}

const COLUMN_KEYS = ['item', 'description', 'material', 'condition', 'ownership', 'disposition'] as const

function createCaptionBlock(doc: Document): CaptionBlock {
  const el = doc.createElement('section')
  el.className = 'caption-block'
  el.setAttribute('data-caption-block', '')
  el.setAttribute('aria-live', 'polite')
  placeInPage(el, CAPTION_BLOCK_RECT)

  const heads = doc.createElement('div')
  heads.className = 'caption-heads t-column-head'
  heads.setAttribute('data-caption-heads', '')
  for (const head of COLUMN_HEADS) {
    const span = doc.createElement('span')
    span.textContent = head
    heads.appendChild(span)
  }
  el.appendChild(heads)
  el.appendChild(createRule())

  const columns = doc.createElement('div')
  columns.className = 'caption-columns t-caption'
  columns.setAttribute('data-caption-columns', '')
  const cells: Record<(typeof COLUMN_KEYS)[number], HTMLElement> = {} as Record<(typeof COLUMN_KEYS)[number], HTMLElement>
  for (const key of COLUMN_KEYS) {
    const span = doc.createElement('span')
    span.setAttribute('data-col', key)
    cells[key] = span
    columns.appendChild(span)
  }
  el.appendChild(columns)

  const annotation = doc.createElement('p')
  annotation.className = 'caption-annotation t-annotation'
  annotation.setAttribute('data-caption-annotation', '')
  el.appendChild(annotation)

  let generation = 0
  let controller: AbortController | null = null
  let item: string | null = null

  async function type(entry: CaptionEntry, msPerChar: number): Promise<void> {
    const gen = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    annotation.textContent = ''
    // The dash, a space, then the third hand. The dash alone is silence.
    const text = entry.annotation ? `${DASH} ${entry.annotation}` : DASH
    await typewrite(annotation, text, { msPerChar, faintE: true, signal })
    if (gen !== generation || !entry.lockedSentence) return
    annotation.appendChild(doc.createTextNode(' '))
    const locked = doc.createElement('span')
    locked.className = 'locked-sentence'
    locked.setAttribute('data-locked-sentence', '')
    annotation.appendChild(locked)
    await typewrite(locked, entry.lockedSentence, { msPerChar, faintE: true, signal })
  }

  return {
    el,
    show(entry, msPerChar = LEDGER_MS_PER_CHAR) {
      item = entry.item || null
      el.setAttribute('data-caption-item', entry.item)
      for (const key of COLUMN_KEYS) cells[key].textContent = entry[key]
      void type(entry, msPerChar)
    },
    currentItem: () => item,
    destroy() {
      generation++
      controller?.abort()
    },
  }
}

/* ---------- renderRoom ---------- */

export function renderRoom(container: HTMLElement, room: Room, bus: EventBus): RoomScene {
  const doc = container.ownerDocument
  const win = doc.defaultView
  const unsubscribe: (() => void)[] = []

  const root = doc.createElement('div')
  root.className = 'room'
  root.setAttribute('data-room', room.id)

  // ---- the scene ----------------------------------------------------------

  const scene = doc.createElement('div')
  scene.className = 'scene'
  scene.setAttribute('data-scene', '')

  const wall = doc.createElement('div')
  wall.className = 'scene-wall'
  wall.setAttribute('data-wall', '')
  wall.style.height = pct(WALL_BOTTOM_Y)
  scene.appendChild(wall)

  const floor = doc.createElement('div')
  floor.className = 'scene-floor'
  floor.setAttribute('data-floor', '')
  floor.style.top = pct(WALL_BOTTOM_Y)
  floor.style.height = pct(100 - WALL_BOTTOM_Y)
  const floorSize = rectRpx({ x: 0, y: WALL_BOTTOM_Y, w: SCENE_WIDTH_X, h: 100 - WALL_BOTTOM_Y })
  floor.appendChild(drawFloor(floorSize, (BOARD_HEIGHT_Y / 100) * STAGE_H_RPX, doc))
  scene.appendChild(floor)

  const caption = createCaptionBlock(doc)
  let inspecting: string | null = null

  function inspect(o: WorldObject | null): void {
    const id = o ? o.id : null
    if (id === inspecting) return
    inspecting = id
    if (o) caption.show(o.entry)
    bus.emit({ type: 'object:inspect', objectId: id })
  }

  function onHour(index: number): void {
    const hour = HOURS[index]
    if (!hour) return
    bus.emit({ type: 'player:hour', index, strength: hour.strength })
  }

  const objectEls = new Map<string, HTMLElement>()
  for (const o of room.objects) {
    const size = rectRpx(o.rect)
    let el: HTMLElement
    if (o.symbol === 'hours-card') {
      el = hoursCard(doc, o, onHour)
    } else {
      const b = doc.createElement('button')
      b.type = 'button'
      b.className = 'scene-object'
      b.setAttribute('aria-label', ariaLabel(o))
      if (o.symbol === 'path') {
        b.classList.add('scene-path')
        const poly = PATH_POLYGON.map(([x, y]): [number, number] => [
          ((x - o.rect.x) / 100) * STAGE_W_RPX,
          ((y - o.rect.y) / 100) * STAGE_H_RPX,
        ])
        b.appendChild(pathSymbol(doc, size, poly))
        b.style.clipPath = `polygon(${PATH_POLYGON.map(([x, y]) => `${pct(((x - o.rect.x) / o.rect.w) * 100)} ${pct(((y - o.rect.y) / o.rect.h) * 100)}`).join(', ')})`
      } else {
        b.classList.add('outlined')
        b.appendChild(drawSymbol(o.symbol ?? '', size, doc))
        if (o.symbol === 'tariff-board') b.appendChild(tariffOverlay(doc))
        if (o.symbol === 'cabinet') b.appendChild(cabinetOverlay(doc))
      }
      if (o.kind === 'door') {
        b.setAttribute('data-door-id', o.id)
        b.setAttribute('data-locked', o.locked ? 'true' : 'false')
        b.addEventListener('click', () => {
          // Nothing moves. The narrator may answer.
          const e: AppEvent = { type: 'door:tried', doorId: o.id, locked: o.locked ?? false }
          if (o.leadsTo) e.leadsTo = o.leadsTo
          bus.emit(e)
        })
      }
      el = b
    }
    el.setAttribute('data-object-id', o.id)
    el.setAttribute('data-layer', o.layer)
    el.setAttribute('data-kind', o.kind)
    place(el, o.rect)
    el.addEventListener('pointerenter', () => inspect(o))
    el.addEventListener('pointerleave', () => inspect(null))
    el.addEventListener('focusin', () => inspect(o))
    el.addEventListener('focusout', (e) => {
      const next = (e as FocusEvent).relatedTarget
      if (next instanceof Node && el.contains(next)) return
      inspect(null)
    })
    objectEls.set(o.id, el)
    scene.appendChild(el)
  }

  // ---- slots ---------------------------------------------------------------

  const slots = new Map<SlotName, HTMLElement>()
  function makeSlot(name: SlotName, rect: StageRect, inPage: boolean): HTMLElement {
    const el = doc.createElement('div')
    el.className = 'slot'
    el.setAttribute('data-slot', name)
    if (inPage) placeInPage(el, rect)
    else place(el, rect)
    slots.set(name, el)
    return el
  }
  const roomSlots = room.slots ?? {}
  if (roomSlots.board) scene.appendChild(makeSlot('board', roomSlots.board, false))
  if (roomSlots.tray) scene.appendChild(makeSlot('tray', roomSlots.tray, false))

  // ---- the page ------------------------------------------------------------

  const page = applyPaper(doc.createElement('aside'))
  page.classList.add('page')
  page.setAttribute('data-page', '')
  page.setAttribute('aria-label', PAGE_PROPERTY_LINE)

  const head = doc.createElement('header')
  head.className = 'page-head'
  head.setAttribute('data-page-head', '')
  placeInPage(head, PAGE_HEAD_RECT)
  const property = doc.createElement('p')
  property.className = 't-page-head'
  property.setAttribute('data-page-property', '')
  property.textContent = PAGE_PROPERTY_LINE
  head.appendChild(property)
  const row = doc.createElement('div')
  row.className = 'page-head-row'
  const date = doc.createElement('span')
  date.className = 't-page-head'
  date.setAttribute('data-page-date', '')
  date.textContent = ledgerDate(new Date())
  row.appendChild(date)

  const controls = doc.createElement('nav')
  controls.className = 'page-controls t-caption'
  controls.setAttribute('data-page-controls', '')
  function control(action: 'resign' | 'color' | 'sound', text: string): HTMLButtonElement {
    const b = doc.createElement('button')
    b.type = 'button'
    b.setAttribute('data-action', action)
    b.setAttribute('aria-label', text)
    b.textContent = text
    controls.appendChild(b)
    return b
  }
  const resignBtn = control('resign', CONTROLS.resign)
  resignBtn.addEventListener('click', () => bus.emit({ type: 'player:resign' }))

  let nextColor: Color = 'b'
  const colorBtn = control('color', CONTROLS.takeBlack)
  function renderColor(): void {
    const text = nextColor === 'b' ? CONTROLS.takeBlack : CONTROLS.takeWhite
    colorBtn.textContent = text
    colorBtn.setAttribute('aria-label', text)
    colorBtn.setAttribute('data-next-color', nextColor)
  }
  renderColor()
  colorBtn.addEventListener('click', () => {
    const color = nextColor
    nextColor = color === 'b' ? 'w' : 'b'
    renderColor()
    bus.emit({ type: 'player:color', color })
  })
  unsubscribe.push(
    bus.on('game:new', (e) => {
      nextColor = e.snapshot.playerColor === 'w' ? 'b' : 'w'
      renderColor()
    }),
  )

  let soundOn = readSound(win)
  const soundBtn = control('sound', soundOn ? CONTROLS.soundOn : CONTROLS.soundOff)
  function renderSound(): void {
    const text = soundOn ? CONTROLS.soundOn : CONTROLS.soundOff
    soundBtn.textContent = text
    soundBtn.setAttribute('aria-label', text)
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false')
    soundBtn.setAttribute('data-sound', soundOn ? 'on' : 'off')
  }
  renderSound()
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn
    writeSound(win, soundOn)
    renderSound()
    bus.emit({ type: 'settings:sound', on: soundOn })
  })

  row.appendChild(controls)
  head.appendChild(row)
  page.appendChild(head)
  page.appendChild(caption.el)

  if (roomSlots.ledger) page.appendChild(makeSlot('ledger', roomSlots.ledger, true))
  if (roomSlots.narrator) page.appendChild(makeSlot('narrator', roomSlots.narrator, true))

  // ---- dossiers over the caption block ------------------------------------

  const dossierLayer = doc.createElement('div')
  dossierLayer.className = 'page-dossier'
  dossierLayer.setAttribute('data-dossier-layer', '')
  placeInPage(dossierLayer, CAPTION_BLOCK_RECT)
  page.appendChild(dossierLayer)

  let dossier: HTMLElement | null = null
  let armed = false
  let armTimer: ReturnType<typeof setTimeout> | null = null

  function dismissDossier(): void {
    if (armTimer !== null) clearTimeout(armTimer)
    armTimer = null
    armed = false
    dossier?.remove()
    dossier = null
  }

  function raiseDossier(e: Extract<AppEvent, { type: 'piece:inspect' }>): void {
    dismissDossier()
    if (!e.key) return
    const piece = PIECES[e.key]
    const n = cardNumber(e.key, e.square)
    const card = createDossierCard(piece.name, piece.lines, {
      roster: { left: ROSTER_LEFT, right: `${ROSTER_ITEM}. ${n} of ${ROSTER_COUNT}` },
      faceDown: e.captured === true,
    })
    card.setAttribute('data-dossier-key', e.key)
    card.setAttribute('data-dossier-card', String(n))
    dossierLayer.appendChild(card)
    dossier = card
    // The click that raised the card is still travelling; clicks count from the next turn.
    armTimer = setTimeout(() => {
      armed = true
      armTimer = null
    }, 0)
  }

  const onDocClick = (e: Event): void => {
    if (!dossier || !armed) return
    const target = e.target
    if (target instanceof Node && dossier.contains(target)) return
    dismissDossier()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && dossier) dismissDossier()
  }
  doc.addEventListener('click', onDocClick)
  win?.addEventListener('keydown', onKey)

  unsubscribe.push(bus.on('piece:inspect', raiseDossier))
  unsubscribe.push(bus.on('game:move', () => dismissDossier()))

  // ---- the hour, underlined ----------------------------------------------

  unsubscribe.push(
    bus.on('player:hour', (e) => {
      const card = objectEls.get('1-17') ?? root
      card.querySelectorAll<HTMLElement>('[data-hour]').forEach((b) => {
        const chosen = b.getAttribute('data-hour-index') === String(e.index)
        if (chosen) b.setAttribute('data-hour-chosen', '')
        else b.removeAttribute('data-hour-chosen')
        b.setAttribute('aria-pressed', chosen ? 'true' : 'false')
      })
    }),
  )

  // ---- mount ---------------------------------------------------------------

  root.appendChild(scene)
  root.appendChild(page)
  container.appendChild(root)

  // On arrival the third hand continues the header, over 1.4 s. The page is never blank.
  const arrival: CaptionEntry = {
    item: '',
    description: '',
    material: '',
    condition: '',
    ownership: '',
    disposition: '',
    annotation: THIRD_HAND_LINE,
  }
  caption.show(arrival, THIRD_HAND_LINE_MS / (THIRD_HAND_LINE.length + 2))

  bus.emit({ type: 'room:enter', roomId: room.id })
  bus.emit({ type: 'settings:sound', on: soundOn })

  return {
    el: root,
    slotEl(name) {
      const el = slots.get(name)
      if (!el) throw new Error(`Room ${room.id} has no slot named ${name}`)
      return el
    },
    destroy() {
      for (const off of unsubscribe) off()
      doc.removeEventListener('click', onDocClick)
      win?.removeEventListener('keydown', onKey)
      dismissDossier()
      caption.destroy()
      root.remove()
    },
  }
}
