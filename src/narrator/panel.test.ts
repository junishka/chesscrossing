// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBus } from '../contracts/bus'
import type { GameSnapshot, MoveRecord } from '../contracts/chess'
import { START_FEN } from '../contracts/chess'
import type { AppEvent, EventBus } from '../contracts/events'
import type { NarratorContext, NarratorRequest, NarratorStreamEvent } from '../contracts/narrator'
import { NARRATOR_MS_PER_CHAR } from '../frame'
import { REMARKS_HEAD, REMARKS_SUB, createNarratorPanel } from './panel'
import { OBJECT_DWELL_MS } from './policy'

const DASH = '—'

function context(): NarratorContext {
  return { fen: START_FEN, pgn: '', lastMovesSan: [], turn: 'w', playerColor: 'w', gameStatus: 'idle', ply: 0, roomId: 'room-1', roomName: 'Room 1, the Declarations Room', hour: '18.00' }
}

const snapshot = (): GameSnapshot => ({ fen: START_FEN, pgn: '', history: [], turn: 'w', inCheck: false, isGameOver: false, captured: { w: [], b: [] }, playerColor: 'w' })
const move = (over: Partial<MoveRecord> = {}): MoveRecord => ({ moveNumber: 1, color: 'w', piece: 'p', from: 'e2', to: 'e4', san: 'e4', uci: 'e2e4', flags: 'b', fen: START_FEN, check: false, ...over })

/** Text of a line without the caret. */
function shown(el: Element): string {
  return Array.from(el.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.hasAttribute('data-caret')))
    .map((n) => n.textContent ?? '')
    .join('')
}

interface Harness {
  container: HTMLElement
  bus: EventBus
  requests: NarratorRequest[]
  events: AppEvent[]
  script: (req: NarratorRequest) => NarratorStreamEvent[]
  panel: ReturnType<typeof createNarratorPanel>
  lines: () => HTMLElement[]
}

function harness(script: (req: NarratorRequest) => NarratorStreamEvent[] = () => []): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const bus = createBus()
  const requests: NarratorRequest[] = []
  const events: AppEvent[] = []
  bus.onAny((e) => events.push(e))
  const h: Harness = {
    container,
    bus,
    requests,
    events,
    script,
    panel: null as unknown as ReturnType<typeof createNarratorPanel>,
    lines: () => Array.from(container.querySelectorAll<HTMLElement>('[data-narrator-line]')),
  }
  h.panel = createNarratorPanel(
    container,
    { name: 'Edmund Prell', silenceMark: DASH, getContext: context, placeholder: 'Ask.', visitorLabel: 'Visitor (1).' },
    bus,
    {
      sessionId: 'test-session',
      reset: async () => true,
      stream: async function* (req) {
        requests.push(req)
        for (const ev of h.script(req)) yield ev
      },
    },
  )
  return h
}

const reply = (text: string): NarratorStreamEvent[] => [
  { type: 'delta', text: text.slice(0, 4) },
  { type: 'delta', text: text.slice(4) },
  { type: 'done', text, silent: false },
]
const silence: NarratorStreamEvent[] = [{ type: 'done', text: '', silent: true }]

describe('createNarratorPanel', () => {
  let h: Harness
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    h?.panel.destroy()
    h?.container.remove()
    vi.useRealTimers()
  })

  it('renders the head, the line beneath it, a rule, the column and the input line, with hooks and labels', () => {
    h = harness()
    const root = h.container.querySelector('[data-narrator]') as HTMLElement
    expect(root).toBe(h.panel.el)
    expect(root.getAttribute('aria-label')).toBe('Remarks. Edmund Prell.')
    expect(root.querySelector('[data-narrator-head]')?.textContent).toBe(REMARKS_HEAD)
    expect(REMARKS_HEAD).toBe('REMARKS')
    const sub = root.querySelector('[data-narrator-sub]') as HTMLElement
    expect(sub.textContent).toBe(REMARKS_SUB)
    expect(REMARKS_SUB).toBe('Of any length, provided it is true.')
    expect(sub.classList.contains('t-remarks-sub')).toBe(true)
    expect(root.querySelectorAll('[data-rule]').length).toBeGreaterThanOrEqual(2)
    const column = root.querySelector('[data-narrator-column]') as HTMLElement
    expect(column.getAttribute('role')).toBe('log')
    expect(column.children.length).toBe(0)
    const input = root.querySelector('[data-narrator-input]') as HTMLTextAreaElement
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('aria-label')).toBe('Visitor (1). Ask.')
    expect(root.querySelector('[data-narrator-input-label]')?.textContent).toBe('Visitor (1).')
    expect(root.querySelector('[data-narrator-input-label]')?.classList.contains('t-visitor')).toBe(true)
    expect(root.querySelector('[data-narrator-placeholder]')?.textContent).toBe('Ask.')
    expect(root.querySelector('[data-narrator-placeholder]')?.classList.contains('placeholder-tint')).toBe(true)
    expect(root.querySelector('[data-narrator-caret]')).not.toBeNull()
    expect(root.querySelector('button')).toBeNull()
  })

  it('shows the visitor words at once in italic after the label, then types the reply at the narrator rate', async () => {
    h = harness(() => reply('The river stands.'))
    const done = h.panel.ask('what is the river at')
    expect(h.lines()).toHaveLength(1)
    const visitor = h.lines()[0] as HTMLElement
    expect(visitor.getAttribute('data-narrator-speaker')).toBe('visitor')
    expect(visitor.querySelector('[data-narrator-visitor-label]')?.textContent).toBe('Visitor (1).')
    expect(visitor.querySelector('[data-narrator-visitor-label]')?.classList.contains('t-visitor')).toBe(true)
    const words = visitor.querySelector('[data-narrator-visitor-text]') as HTMLElement
    expect(words.textContent).toBe('what is the river at')
    expect(words.classList.contains('t-player')).toBe(true)
    expect(h.events.some((e) => e.type === 'player:asked' && e.text === 'what is the river at')).toBe(true)
    expect(h.requests).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(0)
    const lines = h.lines()
    expect(lines).toHaveLength(2)
    const narrator = lines[1] as HTMLElement
    expect(narrator.getAttribute('data-narrator-speaker')).toBe('narrator')
    expect(narrator.classList.contains('t-narrator')).toBe(true)
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]).toMatchObject({ sessionId: 'test-session', kind: 'ask', text: 'what is the river at' })
    expect(narrator.querySelector('[data-caret]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(NARRATOR_MS_PER_CHAR * 4)
    expect(shown(narrator)).toBe('The ')
    expect(narrator.querySelectorAll('.e-faint')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(NARRATOR_MS_PER_CHAR * 13 + 1000)
    expect(shown(narrator)).toBe('The river stands.')
    await done
    expect(narrator.querySelector('[data-caret]')).toBeNull()
    expect(h.events.some((e) => e.type === 'narrator:said' && e.text === 'The river stands.')).toBe(true)
    const statuses = h.events.filter((e) => e.type === 'narrator:status').map((e) => (e.type === 'narrator:status' ? e.status : ''))
    expect(statuses).toEqual(['thinking', 'speaking', 'idle'])
  })

  it('types one em dash on its own line for a silent answer', async () => {
    h = harness(() => silence)
    const done = h.panel.notify('draw')
    await vi.advanceTimersByTimeAsync(NARRATOR_MS_PER_CHAR * 2 + 10)
    await done
    const lines = h.lines()
    expect(lines).toHaveLength(1)
    expect(lines[0]?.textContent).toBe(DASH)
    expect(lines[0]?.hasAttribute('data-narrator-silent')).toBe(true)
    expect(lines[0]?.getAttribute('data-narrator-speaker')).toBe('narrator')
    expect(h.events.some((e) => e.type === 'narrator:status' && e.status === 'silent')).toBe(true)
  })

  it('types the dash on a stream error', async () => {
    h = harness(() => [{ type: 'error', message: 'down', retryable: true }])
    const done = h.panel.ask('hello')
    await vi.advanceTimersByTimeAsync(NARRATOR_MS_PER_CHAR * 2 + 10)
    await done
    expect(h.lines()[1]?.textContent).toBe(DASH)
    expect(h.events.some((e) => e.type === 'narrator:status' && e.status === 'error')).toBe(true)
  })

  it('a click in the column completes the current message at once', async () => {
    h = harness(() => reply('Item 1-03. Greatcoat, Frontier Service pattern of 1938.'))
    const done = h.panel.ask('the coat')
    await vi.advanceTimersByTimeAsync(NARRATOR_MS_PER_CHAR * 3)
    const narrator = h.lines()[1] as HTMLElement
    expect(shown(narrator).length).toBeLessThan(10)
    ;(h.container.querySelector('[data-narrator-column]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(shown(narrator)).toBe('Item 1-03. Greatcoat, Frontier Service pattern of 1938.')
    await done
  })

  it('Enter submits the field verbatim and Shift+Enter does not; the field is never disabled', async () => {
    h = harness(() => silence)
    const input = h.container.querySelector('[data-narrator-input]') as HTMLTextAreaElement
    input.value = 'who are you'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
    expect(h.lines()).toHaveLength(0)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(h.lines()).toHaveLength(1)
    expect(h.lines()[0]?.querySelector('[data-narrator-visitor-text]')?.textContent).toBe('who are you')
    expect(input.value).toBe('')
    expect(input.disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(h.lines()).toHaveLength(2)
    input.value = '   '
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(h.lines()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(200)
  })

  it('sends first-launch once when the room is entered, and applies the policy to bus events', async () => {
    h = harness(() => silence)
    h.bus.emit({ type: 'room:enter', roomId: 'room-1' })
    h.bus.emit({ type: 'room:enter', roomId: 'room-1' })
    await vi.advanceTimersByTimeAsync(200)
    expect(h.requests.map((r) => r.event)).toEqual(['first-launch'])

    h.bus.emit({ type: 'game:new', snapshot: snapshot() })
    h.bus.emit({ type: 'game:move', move: move({ captured: 'p', san: 'exd5' }), snapshot: snapshot(), by: 'player' })
    h.bus.emit({ type: 'game:check', color: 'b', snapshot: snapshot() })
    h.bus.emit({ type: 'game:move', move: move({ captured: 'q', san: 'Qxd8' }), snapshot: snapshot(), by: 'player' })
    h.bus.emit({ type: 'game:new', snapshot: snapshot() })
    h.bus.emit({ type: 'door:tried', doorId: '1-14', locked: true })
    h.bus.emit({ type: 'game:over', result: { outcome: 'checkmate', winner: 'b' }, snapshot: snapshot() })
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.requests.map((r) => r.event)).toEqual(['first-launch', 'game-start', 'capture', 'door-locked', 'checkmate-against-player'])
    expect(h.lines().every((l) => l.textContent === DASH)).toBe(true)
  })

  it('tells the narrator about an object only after the pointer has rested, once per object', async () => {
    h = harness(() => silence)
    h.bus.emit({ type: 'object:inspect', objectId: '1-03' })
    await vi.advanceTimersByTimeAsync(OBJECT_DWELL_MS - 50)
    expect(h.requests).toHaveLength(0)
    h.bus.emit({ type: 'object:inspect', objectId: null })
    await vi.advanceTimersByTimeAsync(OBJECT_DWELL_MS)
    expect(h.requests).toHaveLength(0)

    h.bus.emit({ type: 'object:inspect', objectId: '1-03' })
    await vi.advanceTimersByTimeAsync(OBJECT_DWELL_MS + 10)
    expect(h.requests.map((r) => r.event)).toEqual(['inspect-object'])
    await vi.advanceTimersByTimeAsync(200)

    h.bus.emit({ type: 'object:inspect', objectId: null })
    h.bus.emit({ type: 'object:inspect', objectId: '1-03' })
    await vi.advanceTimersByTimeAsync(OBJECT_DWELL_MS + 10)
    expect(h.requests).toHaveLength(1)
    h.bus.emit({ type: 'piece:inspect', key: 'wK' })
    await vi.advanceTimersByTimeAsync(10)
    expect(h.requests).toHaveLength(1)
  })

  it('notify drops kinds the policy silences', async () => {
    h = harness(() => silence)
    await h.panel.notify('check')
    await h.panel.notify('idle')
    expect(h.requests).toHaveLength(0)
    const done = h.panel.notify('blunder')
    await vi.advanceTimersByTimeAsync(200)
    await done
    expect(h.requests.map((r) => r.event)).toEqual(['blunder'])
  })

  it('reset clears the column and the server history', async () => {
    let resets = 0
    const container = document.createElement('div')
    document.body.appendChild(container)
    const panel = createNarratorPanel(
      container,
      { name: 'Edmund Prell', silenceMark: DASH, getContext: context, placeholder: 'Ask.', visitorLabel: 'Visitor (1).' },
      createBus(),
      {
        sessionId: 's',
        reset: async () => {
          resets++
          return true
        },
        stream: async function* () {
          yield { type: 'done', text: '', silent: true } as NarratorStreamEvent
        },
      },
    )
    const done = panel.ask('hm')
    await vi.advanceTimersByTimeAsync(200)
    await done
    expect(container.querySelectorAll('[data-narrator-line]')).toHaveLength(2)
    await panel.reset()
    expect(container.querySelectorAll('[data-narrator-line]')).toHaveLength(0)
    expect(resets).toBe(1)
    panel.destroy()
    expect(container.querySelector('[data-narrator]')).toBeNull()
    container.remove()
  })
})
