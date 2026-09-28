// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEvent, AppEventOf } from '../contracts/events'
import type { NarratorRequest, NarratorStreamEvent } from '../contracts/narrator'
import { createEngine } from '../engine'
import { FakeWorker } from '../engine/fake-worker'
import { CARD_HOLD_MS, FADE_MS, WHIP_MS } from '../frame'
import { type Shell, startApp } from './shell'

/** A worker that answers every search at once: a level score and a fixed reply. */
function fakeEngine(replies: Record<string, string>) {
  return () =>
    createEngine({
      workerFactory: (url) =>
        new FakeWorker(url, {
          onGo: (_command, worker) => {
            const position = [...worker.sent].reverse().find((c) => c.startsWith('position fen '))
            const fen = position ? position.slice('position fen '.length) : ''
            const turn = fen.split(' ')[1]
            const reply = replies[turn ?? 'w'] ?? 'e2e4'
            setTimeout(() => {
              worker.emit(`info depth 12 seldepth 14 multipv 1 score cp 20 nodes 1000 nps 1000 time 5 pv ${reply}`)
              worker.emit(`bestmove ${reply}`)
            }, 0)
          },
        }),
    })
}

async function* silentStream(): AsyncGenerator<NarratorStreamEvent> {
  yield { type: 'done', text: '', silent: true }
}

let shell: Shell | null = null
afterEach(() => {
  shell?.destroy()
  shell = null
  document.body.replaceChildren()
  vi.useRealTimers()
})

async function launch(): Promise<{ shell: Shell; requests: NarratorRequest[]; events: AppEvent[] }> {
  vi.useFakeTimers()
  const root = document.createElement('div')
  root.id = 'app'
  document.body.appendChild(root)
  const requests: NarratorRequest[] = []
  const started = startApp(root, {
    createEngine: fakeEngine({ w: 'e2e4', b: 'e7e5' }),
    narratorInternals: {
      sessionId: 'shell-test',
      stream: (request) => {
        requests.push(request)
        return silentStream()
      },
      reset: async () => true,
    },
  })
  // Card 1 fades up, then three holds, then the whip pan.
  await vi.advanceTimersByTimeAsync(FADE_MS)
  expect(root.getAttribute('data-app-phase')).toBe('title')
  expect(root.querySelector('[data-card]')).not.toBeNull()
  for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(CARD_HOLD_MS)
  await vi.advanceTimersByTimeAsync(WHIP_MS + 50)
  const s = await started
  shell = s
  const events: AppEvent[] = []
  s.bus.onAny((e) => events.push(e))
  return { shell: s, requests, events }
}

describe('startApp', () => {
  it('shows three cards, pans into Room 1 and mounts every module', async () => {
    const { shell: s, requests } = await launch()
    const root = document.getElementById('app')!
    expect(root.getAttribute('data-app-phase')).toBe('room')
    expect(root.querySelector('[data-card]')).toBeNull()
    expect(root.querySelector('[data-room="room-1"]')).not.toBeNull()
    expect(root.querySelector('[data-slot="board"] [data-board]')).not.toBeNull()
    expect(root.querySelector('[data-slot="ledger"] [data-ledger]')).not.toBeNull()
    expect(root.querySelector('[data-slot="tray"] [data-tray]')).not.toBeNull()
    expect(root.querySelector('[data-slot="narrator"] [data-narrator]')).not.toBeNull()
    // The palette is on the stage.
    expect(s.stage.el.style.getPropertyValue('--c-wax')).toBe(s.room.palette.wax)
    // The narrator heard room:enter and asked once, with the shell's context.
    expect(requests.map((r) => r.event)).toEqual(['first-launch'])
    expect(requests[0]!.context.roomName).toBe('Room 1, the Declarations Room')
    expect(requests[0]!.context.hour).toBe('20.00')
    expect(requests[0]!.context.gameStatus).toBe('idle')
    // Nothing the shell added is a control; the only buttons are the world's and the board's.
    expect(root.querySelector('[data-app-phase] > button')).toBeNull()
  })

  it('starts a game from the hours card and plays the loop against the engine', async () => {
    const { shell: s, events } = await launch()
    const root = document.getElementById('app')!
    const hour = root.querySelector<HTMLButtonElement>('[data-hour]')!
    hour.click()
    await vi.advanceTimersByTimeAsync(50)
    expect(root.getAttribute('data-app-game')).toBe('playing')
    expect(root.querySelector('[data-board]')!.getAttribute('data-board-visible')).toBe('true')
    expect(hour.hasAttribute('data-hour-chosen')).toBe(true)
    expect(s.loop.strength()).toBe(1)

    const record = s.board.applyMove('e2e4', 'player')
    expect(record).not.toBeNull()
    await vi.advanceTimersByTimeAsync(50)
    const moves = events.filter((e): e is AppEventOf<'game:move'> => e.type === 'game:move')
    expect(moves.map((m) => `${m.by}:${m.move.san}`)).toEqual(['player:e4', 'opponent:e5'])
    const evals = events.filter((e): e is AppEventOf<'game:eval'> => e.type === 'game:eval')
    expect(evals.map((e) => e.by)).toEqual([undefined, 'player', 'opponent'])
    expect(evals[1]!.classification).toBe('good')
  })

  it('bridges the tray hover to the board insert', async () => {
    const { shell: s } = await launch()
    const tray = document.querySelector<HTMLElement>('[data-tray]')!
    expect(tray.getAttribute('data-tray-visible')).toBe('false')
    s.bus.emit({ type: 'object:inspect', objectId: '1-06' })
    expect(tray.getAttribute('data-tray-visible')).toBe('true')
    s.bus.emit({ type: 'object:inspect', objectId: null })
    expect(tray.getAttribute('data-tray-visible')).toBe('false')
  })
})
