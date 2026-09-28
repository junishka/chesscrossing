import { describe, expect, it } from 'vitest'
import { createSessions } from './sessions'

describe('createSessions', () => {
  it('appends in order and returns copies', () => {
    const s = createSessions(40)
    expect(s.history('a')).toEqual([])
    s.append('a', 'u1', 'a1')
    s.append('a', 'u2', 'a2')
    const h = s.history('a')
    expect(h).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
    ])
    h.push({ role: 'user', content: 'x' })
    expect(s.history('a')).toHaveLength(4)
  })

  it('trims to whole pairs, oldest first, and always starts with a user turn', () => {
    const s = createSessions(5)
    for (let i = 1; i <= 4; i++) s.append('a', `u${i}`, `a${i}`)
    const h = s.history('a')
    expect(h).toHaveLength(4)
    expect(h[0]).toEqual({ role: 'user', content: 'u3' })
    expect(h[3]).toEqual({ role: 'assistant', content: 'a4' })
  })

  it('keeps sessions apart and resets one', () => {
    const s = createSessions(40)
    s.append('a', 'u', 'a')
    s.append('b', 'u', 'b')
    expect(s.size()).toBe(2)
    s.reset('a')
    expect(s.history('a')).toEqual([])
    expect(s.history('b')).toHaveLength(2)
  })
})
