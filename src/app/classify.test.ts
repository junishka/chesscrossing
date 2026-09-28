import { describe, expect, it } from 'vitest'
import {
  BLUNDER_CP,
  EXCELLENT_MARGIN_CP,
  INACCURACY_CP,
  MATE_SCORE_CP,
  MISTAKE_CP,
  classify,
  classifySwing,
  isMateFor,
  scoreFor,
  swingFor,
} from './classify'

describe('scoreFor', () => {
  it('keeps centipawns for White and flips them for Black', () => {
    expect(scoreFor('w', { cp: 35 }, 'w')).toBe(35)
    expect(scoreFor('b', { cp: 35 }, 'w')).toBe(-35)
    expect(scoreFor('b', { cp: -120 }, 'b')).toBe(120)
  })

  it('places mates far outside the centipawn range, nearer ones higher', () => {
    expect(scoreFor('w', { mate: 3 }, 'w')).toBe(MATE_SCORE_CP - 3)
    expect(scoreFor('w', { mate: 1 }, 'w')).toBeGreaterThan(scoreFor('w', { mate: 3 }, 'w'))
    expect(scoreFor('b', { mate: 3 }, 'w')).toBe(-(MATE_SCORE_CP - 3))
    expect(scoreFor('b', { mate: -2 }, 'w')).toBe(MATE_SCORE_CP - 2)
  })

  it('reads a delivered mate (mate 0) from the side to move', () => {
    // White has just mated: Black is to move and is mated.
    expect(scoreFor('w', { mate: 0 }, 'b')).toBe(MATE_SCORE_CP)
    expect(scoreFor('b', { mate: 0 }, 'b')).toBe(-MATE_SCORE_CP)
  })

  it('treats a missing score as level', () => {
    expect(scoreFor('w', {}, 'w')).toBe(0)
  })
})

describe('isMateFor', () => {
  it('is true only for a forced mate in the point of view\'s favour', () => {
    expect(isMateFor('w', { mate: 4 }, 'w')).toBe(true)
    expect(isMateFor('b', { mate: 4 }, 'w')).toBe(false)
    expect(isMateFor('w', { cp: 900 }, 'w')).toBe(false)
  })
})

describe('classifySwing', () => {
  it('follows the architecture table', () => {
    expect(classifySwing(BLUNDER_CP - 1)).toBe('blunder')
    expect(classifySwing(BLUNDER_CP)).toBe('mistake')
    expect(classifySwing(MISTAKE_CP - 1)).toBe('mistake')
    expect(classifySwing(MISTAKE_CP)).toBe('inaccuracy')
    expect(classifySwing(INACCURACY_CP - 1)).toBe('inaccuracy')
    expect(classifySwing(INACCURACY_CP)).toBe('good')
    expect(classifySwing(0)).toBe('good')
    expect(classifySwing(EXCELLENT_MARGIN_CP)).toBe('good')
    expect(classifySwing(EXCELLENT_MARGIN_CP + 1)).toBe('excellent')
  })
})

describe('swingFor and classify', () => {
  it('measures the swing from the mover\'s point of view', () => {
    // White moved; the evaluation fell from +20 to -400 for White.
    expect(swingFor('w', { cp: 20 }, { cp: -400 })).toBe(-420)
    // Black moved; the evaluation rose from -20 to +300 for White, bad for Black.
    expect(swingFor('b', { cp: -20 }, { cp: 300 })).toBe(-320)
  })

  it('classifies a blunder, a mistake, an inaccuracy and a good move', () => {
    expect(classify('w', { cp: 20 }, { cp: -400 })).toBe('blunder')
    expect(classify('b', { cp: -20 }, { cp: 300 })).toBe('blunder')
    expect(classify('w', { cp: 20 }, { cp: -150 })).toBe('mistake')
    expect(classify('w', { cp: 20 }, { cp: -60 })).toBe('inaccuracy')
    expect(classify('w', { cp: 20 }, { cp: 10 })).toBe('good')
    expect(classify('b', { cp: 20 }, { cp: 10 })).toBe('good')
  })

  it('calls a move better than the engine expected excellent', () => {
    expect(classify('w', { cp: 20 }, { cp: 120 })).toBe('excellent')
    expect(classify('b', { cp: 20 }, { cp: -80 })).toBe('excellent')
  })

  it('calls a found mate excellent and a lost forced mate a blunder', () => {
    expect(classify('w', { cp: 500 }, { mate: 3 })).toBe('excellent')
    expect(classify('w', { cp: 500 }, { mate: 0 })).toBe('excellent')
    expect(classify('b', { cp: -500 }, { mate: -2 })).toBe('excellent')
    expect(classify('w', { mate: 2 }, { cp: 600 })).toBe('blunder')
    expect(classify('b', { mate: -2 }, { cp: -600 })).toBe('blunder')
  })

  it('keeps a mate, for or against the mover, as good: nothing has changed', () => {
    expect(classify('w', { mate: 3 }, { mate: 2 })).toBe('good')
    expect(classify('w', { mate: -3 }, { mate: -2 })).toBe('good')
  })

  it('calls walking into a forced mate a blunder', () => {
    expect(classify('w', { cp: -200 }, { mate: -2 })).toBe('blunder')
  })
})
