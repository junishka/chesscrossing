// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoveRecord } from '../contracts/chess'
import { Game } from './game'
import {
  COLUMN_GAP_MS,
  COLUMN_HEADS,
  EM_DASH,
  REMARK_DETAINED,
  STAMP_HOLD_MS,
  createLedger,
  remarksFor,
  type Ledger,
} from './ledger'

const LINES = { please: 'Please.', thankYou: 'Thank you.', thankYouHelder: 'Danke.' }
const date = (): string => '14 III 90'

function record(uci: string, game: Game): MoveRecord {
  const r = game.move(uci)
  if (!r) throw new Error(`bad move ${uci}`)
  return r
}

describe('remarksFor', () => {
  it('words a capture, a promotion and a check as the bible has them', () => {
    const g = new Game({ fen: '1n5k/P7/8/8/8/8/8/K7 w - - 0 1' })
    const r = record('a7b8q', g)
    expect(remarksFor(r)).toEqual(['Detained.', 'Re-entered as Queen.', 'Check.'])
    const g2 = new Game({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' })
    expect(remarksFor(record('a1a8', g2))).toEqual(['Check.'])
    expect(remarksFor(record('e2e4', new Game()))).toEqual([])
  })
})

describe('createLedger', () => {
  let container: HTMLElement
  let ledger: Ledger
  let detained: number
  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    detained = 0
    ledger = createLedger(container, {
      opponentLines: LINES,
      ledgerDate: date,
      onDetained: () => {
        detained++
      },
    })
  })
  afterEach(() => {
    ledger.destroy()
    container.remove()
    vi.useRealTimers()
  })

  it('has its head, five column heads with their names, and its hooks', () => {
    expect(container.querySelector('[data-ledger]')).toBe(ledger.el)
    const heads = [...container.querySelectorAll('[data-ledger-column]')].map((h) => h.textContent)
    expect(heads).toEqual([...COLUMN_HEADS])
    expect(container.querySelector('[data-ledger-head]')?.textContent).toBe('RECORD OF PLAY. ENTRIES: 0.')
    expect(container.querySelector('[data-ledger-rows]')).not.toBeNull()
    expect(container.querySelectorAll('[data-ledger-column]')[0]?.classList.contains('t-column-head')).toBe(true)
  })

  it('types the start row with Please in Remarks and a dash for Time', async () => {
    const done = ledger.addStart()
    await vi.advanceTimersByTimeAsync(2000)
    await done
    const row = container.querySelector('[data-ledger-row="start"]')
    expect(row).not.toBeNull()
    expect(row?.querySelector('[data-ledger-cell="time"]')?.textContent).toBe(EM_DASH)
    expect(row?.querySelector('[data-ledger-cell="remarks"]')?.textContent).toBe('Please.')
    expect(row?.querySelector('[data-ledger-cell="remarks"] .e-faint')?.textContent).toBe('e')
    expect(row?.querySelector('[data-caret]')).toBeNull()
    expect(ledger.entries()).toBe(0)
  })

  it('types a half-move row column by column at the ledger rate and counts entries', async () => {
    const g = new Game()
    const r = record('g1f3', g)
    const done = ledger.addMove(r)
    await vi.advanceTimersByTimeAsync(0)
    const row = container.querySelector('[data-ledger-row="move"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(container.querySelector('[data-ledger-count]')?.textContent).toBe('1')
    // No. "1" is one character: 55 ms, then a 120 ms gap before Time starts.
    await vi.advanceTimersByTimeAsync(55)
    expect(row.querySelector('[data-ledger-cell="no"]')?.textContent).toBe('1')
    expect(row.querySelector('[data-ledger-cell="time"]')?.textContent).toBe('')
    await vi.advanceTimersByTimeAsync(COLUMN_GAP_MS + 55)
    expect(row.querySelector('[data-ledger-cell="time"]')?.textContent).toBe(EM_DASH)
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(row.querySelector('[data-ledger-cell="direction"]')?.textContent).toBe('W')
    expect(row.querySelector('[data-ledger-cell="article"]')?.textContent).toBe('Nf3')
    expect(row.querySelector('[data-ledger-cell="remarks"]')?.textContent).toBe('')
    expect(row.getAttribute('data-ledger-ply')).toBe('1')
  })

  it('leaves No. blank on the black row and writes E', async () => {
    const g = new Game()
    record('e2e4', g)
    const r = record('c7c5', g)
    const done = ledger.addMove(r)
    await vi.advanceTimersByTimeAsync(3000)
    await done
    const row = container.querySelector('[data-ledger-row="move"]') as HTMLElement
    expect(row.querySelector('[data-ledger-cell="no"]')?.textContent).toBe('')
    expect(row.querySelector('[data-ledger-cell="direction"]')?.textContent).toBe('E')
    expect(row.querySelector('[data-ledger-cell="article"]')?.textContent).toBe('c5')
  })

  it('remarks Detained. on a capture, sounds, then stamps after 300 ms with the date', async () => {
    const g = new Game()
    record('e2e4', g)
    record('d7d5', g)
    const r = record('e4d5', g)
    const done = ledger.addMove(r)
    // No. + gap + Time + gap + Direction + gap + Article (4) + gap, then "Detained." (9 chars).
    const before = 55 + 120 + 55 + 120 + 55 + 120 + 4 * 55 + 120
    await vi.advanceTimersByTimeAsync(before + 9 * 55)
    const row = container.querySelector('[data-ledger-row="move"]') as HTMLElement
    const remarks = row.querySelector('[data-ledger-cell="remarks"]') as HTMLElement
    expect(remarks.textContent).toBe(REMARK_DETAINED)
    expect(detained).toBe(1)
    expect(row.querySelector('[data-ledger-stamp]')).toBeNull()
    await vi.advanceTimersByTimeAsync(STAMP_HOLD_MS)
    const stamp = row.querySelector('[data-ledger-stamp]')
    expect(stamp).not.toBeNull()
    expect(stamp?.querySelector('.t-stamp')?.textContent).toBe('DETAINED')
    expect(stamp?.querySelector('.t-stamp-date')?.textContent).toBe('14 III 90')
    await done
    expect(row.getAttribute('data-ledger-remark')).toBe('Detained.')
    expect(row.querySelector('[data-ledger-cell="article"]')?.textContent).toBe('exd5')
  })

  it('types Check. without the suffix in Article, and a promotion as Re-entered as', async () => {
    const g = new Game({ fen: '1n5k/P7/8/8/8/8/8/K7 w - - 0 1' })
    const r = record('a7b8q', g)
    const done = ledger.addMove(r)
    await vi.advanceTimersByTimeAsync(6000)
    await done
    const row = container.querySelector('[data-ledger-row="move"]') as HTMLElement
    expect(row.querySelector('[data-ledger-cell="article"]')?.textContent).toBe('axb8=Q')
    const remarks = row.querySelector('[data-ledger-cell="remarks"]') as HTMLElement
    expect(remarks.textContent?.startsWith('Detained.')).toBe(true)
    expect(remarks.textContent?.endsWith('Re-entered as Queen. Check.')).toBe(true)
    expect(remarks.querySelector('[data-ledger-stamp]')).not.toBeNull()

    const g2 = new Game({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' })
    const done2 = ledger.addMove(record('a1a8', g2))
    await vi.advanceTimersByTimeAsync(3000)
    await done2
    const rows = container.querySelectorAll('[data-ledger-row="move"]')
    expect(rows[1]?.querySelector('[data-ledger-cell="article"]')?.textContent).toBe('Ra8')
    expect(rows[1]?.querySelector('[data-ledger-cell="remarks"]')?.textContent).toBe('Check.')
    expect(ledger.entries()).toBe(2)
  })

  it('types the result across Article and Remarks with the date, then Thank you', async () => {
    const done = ledger.addResult({ outcome: 'checkmate', winner: 'b' }, 'w')
    await vi.advanceTimersByTimeAsync(5000)
    await done
    const result = container.querySelector('[data-ledger-row="result"]') as HTMLElement
    expect(result.getAttribute('data-ledger-result')).toBe('0–1')
    expect(result.querySelector('[data-ledger-cell="result"]')?.textContent).toBe('0–1. 14 III 90.')
    expect(result.querySelector('[data-ledger-cell="remarks"]')).toBeNull()
    const words = [...container.querySelectorAll('[data-ledger-row="word"]')].map(
      (r) => r.querySelector('[data-ledger-cell="remarks"]')?.textContent,
    )
    expect(words).toEqual(['Thank you.'])
  })

  it('says it first in Helder when he has lost, and a draw is a half each', async () => {
    const done = ledger.addResult({ outcome: 'checkmate', winner: 'w' }, 'w')
    await vi.advanceTimersByTimeAsync(5000)
    await done
    const words = [...container.querySelectorAll('[data-ledger-row="word"]')].map(
      (r) => r.querySelector('[data-ledger-cell="remarks"]')?.textContent,
    )
    expect(words).toEqual(['Danke.', 'Thank you.'])
    ledger.reset()
    const done2 = ledger.addResult({ outcome: 'stalemate' }, 'w')
    await vi.advanceTimersByTimeAsync(5000)
    await done2
    expect(container.querySelector('[data-ledger-row="result"]')?.getAttribute('data-ledger-result')).toBe('½–½')
    expect(container.querySelectorAll('[data-ledger-row="word"]').length).toBe(1)
  })

  it('queues rows in order and reset abandons what was typing', async () => {
    const g = new Game()
    void ledger.addStart()
    void ledger.addMove(record('e2e4', g))
    void ledger.addMove(record('e7e5', g))
    await vi.advanceTimersByTimeAsync(0)
    expect(container.querySelectorAll('[data-ledger-row]').length).toBe(1)
    await vi.advanceTimersByTimeAsync(10000)
    const kinds = [...container.querySelectorAll('[data-ledger-row]')].map((r) => r.getAttribute('data-ledger-row'))
    expect(kinds).toEqual(['start', 'move', 'move'])
    expect(ledger.entries()).toBe(2)
    void ledger.addMove(record('g1f3', g))
    await vi.advanceTimersByTimeAsync(100)
    ledger.reset()
    await vi.advanceTimersByTimeAsync(5000)
    expect(container.querySelectorAll('[data-ledger-row]').length).toBe(0)
    expect(ledger.entries()).toBe(0)
    expect(container.querySelector('[data-ledger-count]')?.textContent).toBe('0')
  })
})
