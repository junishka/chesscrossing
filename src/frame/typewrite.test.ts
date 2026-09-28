// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEDGER_MS_PER_CHAR,
  NARRATOR_MS_PER_CHAR,
  PAUSE_COMMA_MS,
  PAUSE_STOP_MS,
  pauseAfter,
  resolveMsPerChar,
  typewrite,
} from './typewrite'

function visible(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.hasAttribute('data-caret')))
    .map((n) => n.textContent ?? '')
    .join('')
}

describe('typewrite', () => {
  let el: HTMLElement
  beforeEach(() => {
    vi.useFakeTimers()
    el = document.createElement('p')
    document.body.appendChild(el)
  })
  afterEach(() => {
    vi.useRealTimers()
    el.remove()
  })

  it('exports the two rates', () => {
    expect(LEDGER_MS_PER_CHAR).toBe(55)
    expect(NARRATOR_MS_PER_CHAR).toBe(36)
    expect(resolveMsPerChar({})).toBe(55)
    expect(resolveMsPerChar({ cps: 20 })).toBe(50)
    expect(resolveMsPerChar({ msPerChar: 36, cps: 20 })).toBe(36)
  })

  it('reveals one character per 55 ms at the ledger rate, with a caret that goes when done', async () => {
    const done = typewrite(el, 'Detained', { msPerChar: LEDGER_MS_PER_CHAR })
    expect(visible(el)).toBe('')
    expect(el.querySelector('[data-caret]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(55)
    expect(visible(el)).toBe('D')
    await vi.advanceTimersByTimeAsync(55 * 3)
    expect(visible(el)).toBe('Deta')
    expect(el.querySelector('[data-caret]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(55 * 4)
    expect(visible(el)).toBe('Detained')
    await done
    expect(el.querySelector('[data-caret]')).toBeNull()
    expect(el.textContent).toBe('Detained')
  })

  it('pauses 180 ms after a full stop and 90 after a comma at the narrator rate', async () => {
    expect(pauseAfter('.')).toBe(PAUSE_STOP_MS)
    expect(pauseAfter(',')).toBe(PAUSE_COMMA_MS)
    expect(pauseAfter(';')).toBe(PAUSE_COMMA_MS)
    expect(pauseAfter('a')).toBe(0)

    const done = typewrite(el, 'a. b, c', { msPerChar: NARRATOR_MS_PER_CHAR })
    await vi.advanceTimersByTimeAsync(36 * 2)
    expect(visible(el)).toBe('a.')
    // the stop costs 180 ms more before the space arrives
    await vi.advanceTimersByTimeAsync(36 + 179)
    expect(visible(el)).toBe('a.')
    await vi.advanceTimersByTimeAsync(1)
    expect(visible(el)).toBe('a. ')
    await vi.advanceTimersByTimeAsync(36 * 2)
    expect(visible(el)).toBe('a. b,')
    await vi.advanceTimersByTimeAsync(36 + 89)
    expect(visible(el)).toBe('a. b,')
    await vi.advanceTimersByTimeAsync(1)
    expect(visible(el)).toBe('a. b, ')
    await vi.advanceTimersByTimeAsync(36)
    await done
    expect(el.textContent).toBe('a. b, c')
  })

  it('does not pause at the ledger rate unless asked', async () => {
    const done = typewrite(el, 'a.b', { msPerChar: LEDGER_MS_PER_CHAR })
    await vi.advanceTimersByTimeAsync(55 * 3)
    await done
    expect(el.textContent).toBe('a.b')
  })

  it('wraps every lower-case e in an e-faint span when asked', async () => {
    const done = typewrite(el, 'Re-entered as Queen.', { msPerChar: 1, faintE: true })
    await vi.advanceTimersByTimeAsync(1000)
    await done
    const spans = el.querySelectorAll('span.e-faint')
    expect(spans.length).toBe(6)
    for (const s of spans) expect(s.textContent).toBe('e')
    expect(el.textContent).toBe('Re-entered as Queen.')
    expect(el.querySelector('[data-caret]')).toBeNull()
  })

  it('prints the rest at once on abort and removes the caret', async () => {
    const ac = new AbortController()
    const done = typewrite(el, 'Not located.', { msPerChar: 55, signal: ac.signal })
    await vi.advanceTimersByTimeAsync(55 * 3)
    expect(visible(el)).toBe('Not')
    ac.abort()
    expect(el.textContent).toBe('Not located.')
    expect(el.querySelector('[data-caret]')).toBeNull()
    await done
    await vi.advanceTimersByTimeAsync(5000)
    expect(el.textContent).toBe('Not located.')
  })

  it('appends when asked and replaces otherwise', async () => {
    el.textContent = 'Visitor (1). '
    const a = typewrite(el, 'x', { msPerChar: 1, append: true })
    await vi.advanceTimersByTimeAsync(10)
    await a
    expect(el.textContent).toBe('Visitor (1). x')
    const b = typewrite(el, 'y', { msPerChar: 1 })
    await vi.advanceTimersByTimeAsync(10)
    await b
    expect(el.textContent).toBe('y')
  })
})
