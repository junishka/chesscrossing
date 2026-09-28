import { describe, expect, it } from 'vitest'
import {
  goCommand,
  isCompleteInfo,
  isUciMove,
  normalizeScore,
  parseBestMove,
  parseInfo,
  positionCommand,
  setOptionCommand,
  sideToMove,
  skillLevelCommand,
} from './protocol'

// Lines as the lite single-threaded build printed them under Node.
const FIXTURES = {
  banner: 'Stockfish 19 Lite WASM by the Stockfish developers (see AUTHORS file)',
  full: 'info depth 6 seldepth 11 multipv 1 score cp 17 nodes 2545 nps 159062 hashfull 0 time 16 pv e2e4 e7e5 g1f3 b8c6 d2d4 e5d4',
  lower: 'info depth 9 seldepth 14 multipv 1 score cp 40 lowerbound nodes 9000 nps 100000 time 90 pv d2d4',
  upper: 'info depth 9 seldepth 14 multipv 1 score cp -12 upperbound nodes 9000 nps 100000 time 90 pv d2d4',
  mate: 'info depth 12 seldepth 4 multipv 1 score mate 3 nodes 1200 nps 60000 time 20 pv f3f7 e8f7 d1h5',
  mated: 'info depth 0 score mate 0',
  stalemate: 'info depth 0 score cp 0',
  secondLine: 'info depth 5 seldepth 8 multipv 2 score cp 9 nodes 900 nps 90000 time 10 pv d2d4 d7d5',
  currmove: 'info depth 10 currmove e2e4 currmovenumber 1',
  string: 'info string NNUE evaluation using nn-61e7af4bb97d.nnue',
  wdl: 'info depth 7 seldepth 9 multipv 1 score cp 22 wdl 120 850 30 nodes 3000 nps 150000 time 20 pv e2e4',
  bestmove: 'bestmove e2e4 ponder e7e5',
  bestmoveNoPonder: 'bestmove e7e8q',
  bestmoveNone: 'bestmove (none)',
}

describe('parseInfo', () => {
  it('reads a complete line', () => {
    const info = parseInfo(FIXTURES.full)
    expect(info).not.toBeNull()
    expect(info?.depth).toBe(6)
    expect(info?.seldepth).toBe(11)
    expect(info?.multipv).toBe(1)
    expect(info?.score).toEqual({ kind: 'cp', value: 17 })
    expect(info?.nodes).toBe(2545)
    expect(info?.nps).toBe(159062)
    expect(info?.time).toBe(16)
    expect(info?.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4'])
  })

  it('marks bounds', () => {
    expect(parseInfo(FIXTURES.lower)?.score).toEqual({ kind: 'cp', value: 40, bound: 'lower' })
    expect(parseInfo(FIXTURES.upper)?.score).toEqual({ kind: 'cp', value: -12, bound: 'upper' })
    expect(parseInfo(FIXTURES.upper)?.pv).toEqual(['d2d4'])
  })

  it('reads mate scores', () => {
    expect(parseInfo(FIXTURES.mate)?.score).toEqual({ kind: 'mate', value: 3 })
    expect(parseInfo(FIXTURES.mated)?.score).toEqual({ kind: 'mate', value: 0 })
    expect(parseInfo(FIXTURES.mated)?.depth).toBe(0)
  })

  it('skips wdl and keeps the pv', () => {
    const info = parseInfo(FIXTURES.wdl)
    expect(info?.score).toEqual({ kind: 'cp', value: 22 })
    expect(info?.nodes).toBe(3000)
    expect(info?.pv).toEqual(['e2e4'])
  })

  it('reads currmove lines without a score', () => {
    const info = parseInfo(FIXTURES.currmove)
    expect(info?.depth).toBe(10)
    expect(info?.currmove).toBe('e2e4')
    expect(info?.currmovenumber).toBe(1)
    expect(info?.score).toBeUndefined()
  })

  it('keeps info strings whole', () => {
    expect(parseInfo(FIXTURES.string)?.string).toBe('NNUE evaluation using nn-61e7af4bb97d.nnue')
  })

  it('returns null for other lines', () => {
    expect(parseInfo(FIXTURES.banner)).toBeNull()
    expect(parseInfo(FIXTURES.bestmove)).toBeNull()
    expect(parseInfo('uciok')).toBeNull()
    expect(parseInfo('')).toBeNull()
  })
})

describe('isCompleteInfo', () => {
  it('accepts a final principal line', () => {
    expect(isCompleteInfo(parseInfo(FIXTURES.full)!)).toBe(true)
    expect(isCompleteInfo(parseInfo(FIXTURES.mated)!)).toBe(true)
    expect(isCompleteInfo(parseInfo(FIXTURES.stalemate)!)).toBe(true)
  })

  it('rejects bounds, second lines, and lines without a score', () => {
    expect(isCompleteInfo(parseInfo(FIXTURES.lower)!)).toBe(false)
    expect(isCompleteInfo(parseInfo(FIXTURES.upper)!)).toBe(false)
    expect(isCompleteInfo(parseInfo(FIXTURES.secondLine)!)).toBe(false)
    expect(isCompleteInfo(parseInfo(FIXTURES.currmove)!)).toBe(false)
    expect(isCompleteInfo(parseInfo(FIXTURES.string)!)).toBe(false)
  })
})

describe('parseBestMove', () => {
  it('reads move and ponder', () => {
    expect(parseBestMove(FIXTURES.bestmove)).toEqual({ move: 'e2e4', ponder: 'e7e5' })
  })
  it('reads a promotion without ponder', () => {
    expect(parseBestMove(FIXTURES.bestmoveNoPonder)).toEqual({ move: 'e7e8q' })
  })
  it('reads (none) as null', () => {
    expect(parseBestMove(FIXTURES.bestmoveNone)).toEqual({ move: null })
  })
  it('returns null for other lines', () => {
    expect(parseBestMove(FIXTURES.full)).toBeNull()
    expect(parseBestMove('readyok')).toBeNull()
  })
})

describe('isUciMove', () => {
  it('accepts squares and promotions', () => {
    expect(isUciMove('e2e4')).toBe(true)
    expect(isUciMove('e7e8q')).toBe(true)
    expect(isUciMove('a7b8n')).toBe(true)
  })
  it('rejects the rest', () => {
    expect(isUciMove('(none)')).toBe(false)
    expect(isUciMove('e2e9')).toBe(false)
    expect(isUciMove('e7e8k')).toBe(false)
    expect(isUciMove('Nf3')).toBe(false)
  })
})

describe('sideToMove', () => {
  it('reads the turn field', () => {
    expect(sideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('w')
    expect(sideToMove('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('b')
  })
  it('throws on a fen it cannot read', () => {
    expect(() => sideToMove('')).toThrow()
    expect(() => sideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toThrow()
    expect(() => sideToMove('nonsense w - - 0 1')).toThrow()
    expect(() => sideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toThrow()
  })
})

describe('normalizeScore', () => {
  it('keeps the sign when White is to move', () => {
    expect(normalizeScore({ kind: 'cp', value: 35 }, 'w')).toEqual({ cp: 35 })
    expect(normalizeScore({ kind: 'mate', value: 3 }, 'w')).toEqual({ mate: 3 })
    expect(normalizeScore({ kind: 'mate', value: -2 }, 'w')).toEqual({ mate: -2 })
  })
  it('flips the sign when Black is to move', () => {
    expect(normalizeScore({ kind: 'cp', value: 35 }, 'b')).toEqual({ cp: -35 })
    expect(normalizeScore({ kind: 'cp', value: -80 }, 'b')).toEqual({ cp: 80 })
    expect(normalizeScore({ kind: 'mate', value: 3 }, 'b')).toEqual({ mate: -3 })
    expect(normalizeScore({ kind: 'mate', value: -2 }, 'b')).toEqual({ mate: 2 })
  })
  it('keeps zero as zero, without a negative sign', () => {
    expect(Object.is(normalizeScore({ kind: 'cp', value: 0 }, 'b').cp, 0)).toBe(true)
    expect(Object.is(normalizeScore({ kind: 'mate', value: 0 }, 'b').mate, 0)).toBe(true)
  })
})

describe('commands', () => {
  it('builds set option lines', () => {
    expect(setOptionCommand('Skill Level', 7)).toBe('setoption name Skill Level value 7')
    expect(setOptionCommand('UCI_LimitStrength', false)).toBe('setoption name UCI_LimitStrength value false')
  })
  it('clamps the skill level to 0..20 integers', () => {
    expect(skillLevelCommand(20)).toBe('setoption name Skill Level value 20')
    expect(skillLevelCommand(25)).toBe('setoption name Skill Level value 20')
    expect(skillLevelCommand(-3)).toBe('setoption name Skill Level value 0')
    expect(skillLevelCommand(4.7)).toBe('setoption name Skill Level value 4')
  })
  it('builds position and go lines', () => {
    expect(positionCommand(' rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 ')).toBe(
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
    expect(goCommand({ movetimeMs: 250 })).toBe('go movetime 250')
    expect(goCommand({ depth: 12 })).toBe('go depth 12')
    expect(goCommand({ depth: 12, movetimeMs: 800 })).toBe('go depth 12 movetime 800')
    expect(goCommand({ movetimeMs: 0.4 })).toBe('go movetime 1')
  })
  it('refuses an unlimited search', () => {
    expect(() => goCommand({})).toThrow()
  })
})
