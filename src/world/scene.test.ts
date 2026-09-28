// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameSnapshot, MoveRecord } from '../contracts/chess'
import { createBus } from '../contracts/bus'
import type { AppEvent, EventBus } from '../contracts/events'
import type { Room, RoomScene } from '../contracts/world'
import { LEDGER_MS_PER_CHAR } from '../frame'
import { CARD_3, SOUND_STORAGE_KEY, THIRD_HAND_LINE, THIRD_HAND_LINE_MS, loadWorld, renderRoom, world } from './index'

function visible(el: Element | null): string {
  if (!el) return ''
  return Array.from(el.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.hasAttribute('data-caret')))
    .map((n) => n.textContent ?? '')
    .join('')
}

function fakeSnapshot(playerColor: 'w' | 'b' = 'w'): GameSnapshot {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    pgn: '1. e4',
    history: [],
    turn: 'b',
    inCheck: false,
    isGameOver: false,
    captured: { w: [], b: [] },
    playerColor,
  }
}

function fakeMove(): MoveRecord {
  return { moveNumber: 1, color: 'w', piece: 'p', from: 'e2', to: 'e4', san: 'e4', uci: 'e2e4', flags: 'b', fen: fakeSnapshot().fen, check: false }
}

describe('renderRoom', () => {
  let container: HTMLElement
  let bus: EventBus
  let events: AppEvent[]
  let room1: Room
  let scene: RoomScene

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    bus = createBus()
    events = []
    bus.onAny((e) => events.push(e))
    room1 = loadWorld().rooms[0] as Room
    scene = renderRoom(container, room1, bus)
  })
  afterEach(() => {
    scene.destroy()
    container.remove()
    vi.useRealTimers()
  })

  it('implements the module contract', () => {
    expect(world.loadWorld).toBe(loadWorld)
    expect(world.renderRoom).toBe(renderRoom)
    expect(loadWorld().chapterCard(room1)).toEqual(CARD_3)
  })

  it('mounts the scene and the page with their hooks, and announces the room', () => {
    expect(scene.el.getAttribute('data-room')).toBe('room-1')
    expect(container.querySelector('[data-scene]')).not.toBeNull()
    expect(container.querySelector('[data-page]')).not.toBeNull()
    expect(container.querySelector('[data-page]')?.classList.contains('paper')).toBe(true)
    expect(container.querySelector('[data-caption-block]')).not.toBeNull()
    expect(container.querySelector('[data-page-head] [data-page-property]')?.textContent).toBe(
      'Property: Frontier Post No. 7 (Marle-on-Lisk), known locally as the Crossing.',
    )
    expect(container.querySelector('[data-page-date]')?.textContent).toMatch(/^\d{1,2} [IVX]+ 90$/)
    for (const o of room1.objects) {
      const el = container.querySelector(`[data-object-id="${o.id}"]`) as HTMLElement
      expect(el, o.id).not.toBeNull()
      expect(el.getAttribute('aria-label'), o.id).toBeTruthy()
      expect(el.getAttribute('data-layer')).toBe(o.layer)
    }
    expect(container.querySelectorAll('button[data-object-id]')).toHaveLength(room1.objects.length - 1)
    expect(container.querySelectorAll('[data-door-id]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-hour]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-action]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-slot]')).toHaveLength(4)
    expect(events.some((e) => e.type === 'room:enter' && e.roomId === 'room-1')).toBe(true)
    const sound = events.find((e) => e.type === 'settings:sound')
    expect(sound).toEqual({ type: 'settings:sound', on: true })
  })

  it('draws the wall to y 76 and floor boards below, every object placed by its rect', () => {
    const wall = container.querySelector('[data-wall]') as HTMLElement
    expect(wall.style.height).toBe('76%')
    const floor = container.querySelector('[data-floor]') as HTMLElement
    expect(floor.style.top).toBe('76%')
    expect(floor.querySelectorAll('[data-part="joint"]').length).toBeGreaterThan(5)
    const coat = container.querySelector('[data-object-id="1-03"]') as HTMLElement
    expect(coat.style.left).toBe('8.4%')
    expect(coat.style.top).toBe('18%')
    expect(coat.style.width).toBe('1.4%')
    expect(coat.style.height).toBe('58%')
    expect(coat.classList.contains('outlined')).toBe(true)
    expect(coat.querySelectorAll('[data-part="button"]')).toHaveLength(11)
    const tariff = container.querySelector('[data-object-id="1-05"]') as HTMLElement
    expect(tariff.querySelectorAll('[data-tariff-nil]')).toHaveLength(6)
    expect(Array.from(tariff.querySelectorAll('[data-tariff-class]')).map((e) => e.textContent)).toEqual([
      'spirits', 'tobacco', 'timber', 'salt', 'printed matter', 'live animals',
    ])
    const cabinet = container.querySelector('[data-object-id="1-08"]') as HTMLElement
    expect(Array.from(cabinet.querySelectorAll('[data-cabinet-label]')).map((e) => e.textContent)).toEqual(['1', '2', '3', 'Correspondence. Exempt.'])
    const path = container.querySelector('[data-object-id="S-4"]') as HTMLElement
    expect(path.style.clipPath).toContain('polygon(')
  })

  it('never hard-codes a colour in what it renders', () => {
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/rgb\(/)
  })

  it('types the third-hand line as the first annotation over 1.4 s', async () => {
    const annotation = container.querySelector('[data-caption-annotation]') as HTMLElement
    expect(visible(annotation)).toBe('')
    await vi.advanceTimersByTimeAsync(THIRD_HAND_LINE_MS / 2)
    const half = visible(annotation)
    expect(half.length).toBeGreaterThan(10)
    expect(half.length).toBeLessThan(THIRD_HAND_LINE.length)
    await vi.advanceTimersByTimeAsync(THIRD_HAND_LINE_MS)
    expect(visible(annotation)).toBe(`— ${THIRD_HAND_LINE}`)
    expect(annotation.querySelector('[data-caret]')).toBeNull()
    expect(annotation.querySelectorAll('.e-faint').length).toBeGreaterThan(0)
  })

  it('types the entry into the caption block on hover, columns at once, and emits object:inspect', async () => {
    const coat = container.querySelector('[data-object-id="1-03"]') as HTMLElement
    coat.dispatchEvent(new Event('pointerenter'))
    expect(events.at(-1)).toEqual({ type: 'object:inspect', objectId: '1-03' })
    const block = container.querySelector('[data-caption-block]') as HTMLElement
    expect(block.getAttribute('data-caption-item')).toBe('1-03')
    expect(block.querySelector('[data-col="item"]')?.textContent).toBe('1-03')
    expect(block.querySelector('[data-col="description"]')?.textContent).toBe('Greatcoat, Frontier Service pattern 1938, brass buttons')
    expect(block.querySelector('[data-col="material"]')?.textContent).toBe('wool, grey-green')
    expect(block.querySelector('[data-col="ownership"]')?.textContent).toBe('R')
    expect(block.querySelector('[data-col="disposition"]')?.textContent).toBe('To be returned.')
    const annotation = block.querySelector('[data-caption-annotation]') as HTMLElement
    expect(visible(annotation)).toBe('')
    await vi.advanceTimersByTimeAsync(LEDGER_MS_PER_CHAR * 2)
    expect(visible(annotation)).toBe('— ')
    await vi.advanceTimersByTimeAsync(LEDGER_MS_PER_CHAR * 20)
    expect(visible(annotation)).toBe('— Not returned.')
    // The entry stays after the pointer leaves; the page is never blank.
    coat.dispatchEvent(new Event('pointerleave'))
    expect(events.at(-1)).toEqual({ type: 'object:inspect', objectId: null })
    expect(visible(annotation)).toBe('— Not returned.')
    expect(block.querySelector('[data-col="item"]')?.textContent).toBe('1-03')
  })

  it('types the caption on focus as well, and Mr Halm gets the dash alone', async () => {
    const halm = container.querySelector('[data-object-id="halm"]') as HTMLElement
    halm.dispatchEvent(new Event('focusin'))
    expect(events.at(-1)).toEqual({ type: 'object:inspect', objectId: 'halm' })
    const block = container.querySelector('[data-caption-block]') as HTMLElement
    expect(block.querySelector('[data-col="description"]')?.textContent).toContain('W. Halm, Customs Officer Second Class')
    await vi.advanceTimersByTimeAsync(LEDGER_MS_PER_CHAR * 3)
    expect(visible(block.querySelector('[data-caption-annotation]'))).toBe('—')
    halm.dispatchEvent(new Event('focusout'))
    expect(events.at(-1)).toEqual({ type: 'object:inspect', objectId: null })
  })

  it('sets the locked sentence of a door at 60 per cent and emits door:tried on click, nothing moving', async () => {
    const door = container.querySelector('[data-door-id="1-13"]') as HTMLButtonElement
    expect(door.tagName).toBe('BUTTON')
    expect(door.getAttribute('data-locked')).toBe('true')
    const before = door.getAttribute('style')
    door.dispatchEvent(new Event('pointerenter'))
    await vi.advanceTimersByTimeAsync(LEDGER_MS_PER_CHAR * 120)
    const annotation = container.querySelector('[data-caption-annotation]') as HTMLElement
    const locked = annotation.querySelector('[data-locked-sentence]') as HTMLElement
    expect(locked).not.toBeNull()
    expect(locked.classList.contains('locked-sentence')).toBe(true)
    expect(visible(locked)).toBe('Room 3 is typed. It is not yet annotated.')
    expect(annotation.textContent).toBe('— Requested 1977 and 1979. Not located. Room 3 is typed. It is not yet annotated.')
    door.click()
    expect(events.at(-1)).toEqual({ type: 'door:tried', doorId: '1-13', locked: true, leadsTo: 'room-3' })
    expect(door.getAttribute('style')).toBe(before)
    expect(container.querySelector('[data-room]')).toBe(scene.el)
  })

  it('emits door:tried for the trap too', () => {
    const trap = container.querySelector('[data-door-id="1-16"]') as HTMLButtonElement
    trap.click()
    expect(events.at(-1)).toEqual({ type: 'door:tried', doorId: '1-16', locked: true, leadsTo: 'room-9' })
  })

  it('names an hour with player:hour and underlines the chosen one from the bus', () => {
    const hours = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-hour]'))
    expect(hours.map((h) => h.getAttribute('data-hour'))).toEqual(['18.00', '20.00', '22.00', 'After'])
    expect(hours.every((h) => h.tagName === 'BUTTON')).toBe(true)
    const after = hours[3] as HTMLButtonElement
    after.click()
    expect(events.at(-1)).toEqual({ type: 'player:hour', index: 3, strength: 8 })
    expect(after.hasAttribute('data-hour-chosen')).toBe(true)
    expect(after.getAttribute('aria-pressed')).toBe('true')
    // The app shell may set the hour too; the underline follows the bus.
    bus.emit({ type: 'player:hour', index: 0, strength: 1 })
    expect(after.hasAttribute('data-hour-chosen')).toBe(false)
    expect((hours[0] as HTMLButtonElement).hasAttribute('data-hour-chosen')).toBe(true)
    expect(container.querySelectorAll('[data-hour-chosen]')).toHaveLength(1)
  })

  it('raises a dossier over the caption block on piece:inspect and dismisses it on Escape, a click elsewhere, or a move', async () => {
    bus.emit({ type: 'piece:inspect', key: 'wK', square: 'e1' })
    const layer = container.querySelector('[data-dossier-layer]') as HTMLElement
    const card = layer.querySelector('[data-dossier]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.getAttribute('data-dossier-face')).toBe('up')
    expect(card.querySelector('[data-dossier-title]')?.textContent).toBe('White King, e1. "The Lamp."')
    expect(card.querySelector('[data-dossier-roster="left"]')?.textContent).toBe('Marle Chess Club. Roster.')
    expect(card.querySelector('[data-dossier-roster="right"]')?.textContent).toBe('6-09. 1 of 32')
    expect(layer.style.top).toBe('9%')
    expect(layer.style.height).toBe('21%')

    // A click on the card keeps it; a click elsewhere, once the raising click has passed, dismisses it.
    await vi.advanceTimersByTimeAsync(0)
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(layer.querySelector('[data-dossier]')).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(layer.querySelector('[data-dossier]')).toBeNull()

    bus.emit({ type: 'piece:inspect', key: 'bR', square: 'h8' })
    expect(layer.querySelector('[data-dossier-roster="right"]')?.textContent).toBe('6-09. 20 of 32')
    expect(layer.querySelector('[data-dossier-pencil]')?.textContent).toBe('In pencil: now the only record of its roofline.')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(layer.querySelector('[data-dossier]')).toBeNull()

    bus.emit({ type: 'piece:inspect', key: 'wP', square: 'd2' })
    expect(layer.querySelector('[data-dossier]')).not.toBeNull()
    bus.emit({ type: 'game:move', move: fakeMove(), snapshot: fakeSnapshot(), by: 'player' })
    expect(layer.querySelector('[data-dossier]')).toBeNull()

    bus.emit({ type: 'piece:inspect', key: 'bN' })
    expect(layer.querySelector('[data-dossier]')).not.toBeNull()
    bus.emit({ type: 'piece:inspect', key: null })
    expect(layer.querySelector('[data-dossier]')).toBeNull()
  })

  it('raises a face-down card for a captured piece', () => {
    bus.emit({ type: 'piece:inspect', key: 'bP', captured: true, square: 'g7' })
    const card = container.querySelector('[data-dossier]') as HTMLElement
    expect(card.getAttribute('data-dossier-face')).toBe('down')
    expect(card.querySelector('[data-dossier-title]')).toBeNull()
    expect(card.querySelector('[data-dossier-roster="left"]')?.textContent).toBe('Marle Chess Club. Roster.')
    expect(card.querySelector('[data-dossier-roster="right"]')?.textContent).toBe('6-09. 31 of 32')
  })

  it('positions the four slots and returns them by name', () => {
    const board = scene.slotEl('board')
    expect(board.getAttribute('data-slot')).toBe('board')
    expect(board.style.left).toBe('18.125%')
    expect(board.style.top).toBe('14%')
    expect(board.style.width).toBe('33.75%')
    expect(board.style.height).toBe('60%')
    expect(board.parentElement?.hasAttribute('data-scene')).toBe(true)
    const ledger = scene.slotEl('ledger')
    expect(ledger.parentElement?.hasAttribute('data-page')).toBe(true)
    expect(ledger.style.left).toBe('5%')
    expect(ledger.style.width).toBe('90%')
    expect(ledger.style.top).toBe('31%')
    expect(ledger.style.height).toBe('34%')
    const narrator = scene.slotEl('narrator')
    expect(narrator.style.top).toBe('66%')
    expect(narrator.style.height).toBe('32.5%')
    expect(scene.slotEl('tray').style.left).toBe('18.125%')
  })

  it('throws for a slot a room does not have', () => {
    const stub = loadWorld().rooms[1] as Room
    const other = document.createElement('div')
    document.body.appendChild(other)
    const s2 = renderRoom(other, stub, createBus())
    expect(() => s2.slotEl('board')).toThrow()
    expect(other.querySelectorAll('[data-object-id]')).toHaveLength(0)
    s2.destroy()
    other.remove()
  })

  it('has the controls as typed words and emits their events', () => {
    const resign = container.querySelector('[data-action="resign"]') as HTMLButtonElement
    expect(resign.textContent).toBe('Resign.')
    resign.click()
    expect(events.at(-1)).toEqual({ type: 'player:resign' })

    const color = container.querySelector('[data-action="color"]') as HTMLButtonElement
    expect(color.textContent).toBe('Take black.')
    color.click()
    expect(events.at(-1)).toEqual({ type: 'player:color', color: 'b' })
    expect(color.textContent).toBe('Take white.')
    color.click()
    expect(events.at(-1)).toEqual({ type: 'player:color', color: 'w' })
    expect(color.textContent).toBe('Take black.')
    bus.emit({ type: 'game:new', snapshot: fakeSnapshot('b') })
    expect(color.textContent).toBe('Take white.')

    const sound = container.querySelector('[data-action="sound"]') as HTMLButtonElement
    expect(sound.textContent).toBe('Stamp: on.')
    sound.click()
    expect(events.at(-1)).toEqual({ type: 'settings:sound', on: false })
    expect(sound.textContent).toBe('Stamp: off.')
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('off')
    sound.click()
    expect(events.at(-1)).toEqual({ type: 'settings:sound', on: true })
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('on')
  })

  it('reads the remembered sound setting and emits it once on mount', () => {
    scene.destroy()
    localStorage.setItem(SOUND_STORAGE_KEY, 'off')
    const bus2 = createBus()
    const seen: AppEvent[] = []
    bus2.onAny((e) => seen.push(e))
    scene = renderRoom(container, room1, bus2)
    const sounds = seen.filter((e) => e.type === 'settings:sound')
    expect(sounds).toEqual([{ type: 'settings:sound', on: false }])
    expect(container.querySelector('[data-action="sound"]')?.textContent).toBe('Stamp: off.')
  })

  it('makes every interactive element a labelled button', () => {
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(25)
    for (const b of buttons) {
      expect(b.getAttribute('type')).toBe('button')
      expect(b.getAttribute('aria-label') || b.textContent, b.outerHTML.slice(0, 80)).toBeTruthy()
    }
    expect(container.querySelector('[data-object-id="1-13"]')?.getAttribute('aria-label')).toBe('1-13. Door to Room 3')
    expect(container.querySelector('[data-object-id="1-17"]')?.getAttribute('aria-label')).toBe('1-17. Hours card')
  })

  it('destroys cleanly: no element left, no listener answering', () => {
    scene.destroy()
    expect(container.querySelector('[data-room]')).toBeNull()
    const n = events.length
    bus.emit({ type: 'piece:inspect', key: 'wQ' })
    expect(document.querySelector('[data-dossier]')).toBeNull()
    expect(events.length).toBe(n + 1)
    scene = renderRoom(container, room1, bus)
  })
})
