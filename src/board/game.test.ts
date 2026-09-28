import { describe, expect, it } from 'vitest'
import { START_FEN } from '../contracts/chess'
import { Game, fenMoveNumber, kingSquare, moveToUci, movetext, parseUci, scoreText, stripSanSuffix } from './game'

function play(game: Game, ...moves: string[]): void {
  for (const m of moves) {
    const r = game.move(m)
    if (!r) throw new Error(`move ${m} rejected at ${game.fen()}`)
  }
}

describe('parseUci', () => {
  it('reads from, to and the promotion letter', () => {
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' })
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
    expect(parseUci('E7E8N')).toEqual({ from: 'e7', to: 'e8', promotion: 'n' })
  })
  it('rejects what is not a move', () => {
    expect(parseUci('')).toBeNull()
    expect(parseUci('e2')).toBeNull()
    expect(parseUci('e2e9')).toBeNull()
    expect(parseUci('e7e8k')).toBeNull()
    expect(parseUci('e2e4e5')).toBeNull()
  })
})

describe('helpers', () => {
  it('strips check and mate suffixes', () => {
    expect(stripSanSuffix('Nf3')).toBe('Nf3')
    expect(stripSanSuffix('Qh4#')).toBe('Qh4')
    expect(stripSanSuffix('e8=Q+')).toBe('e8=Q')
    expect(stripSanSuffix('O-O')).toBe('O-O')
  })
  it('reads the move number off a FEN', () => {
    expect(fenMoveNumber(START_FEN)).toBe(1)
    expect(fenMoveNumber('8/8/8/8/8/8/8/K6k w - - 0 42')).toBe(42)
    expect(fenMoveNumber('bad')).toBe(1)
  })
  it('scores with dashes and halves', () => {
    expect(scoreText({ outcome: 'checkmate', winner: 'w' })).toBe('1–0')
    expect(scoreText({ outcome: 'resignation', winner: 'b' })).toBe('0–1')
    expect(scoreText({ outcome: 'stalemate' })).toBe('½–½')
  })
  it('turns a move into uci', () => {
    expect(moveToUci({ from: 'e2', to: 'e4' })).toBe('e2e4')
    expect(moveToUci({ from: 'e7', to: 'e8', promotion: 'q' })).toBe('e7e8q')
  })
  it('keeps movetext and drops headers', () => {
    expect(movetext('[Event "?"]\n[Result "*"]\n\n1. e4 e5 *')).toBe('1. e4 e5')
  })
})

describe('Game records', () => {
  it('starts at the start position with the player as white', () => {
    const g = new Game()
    const s = g.snapshot()
    expect(s.fen).toBe(START_FEN)
    expect(s.turn).toBe('w')
    expect(s.playerColor).toBe('w')
    expect(s.history).toEqual([])
    expect(s.isGameOver).toBe(false)
    expect(s.result).toBeUndefined()
    expect(s.captured).toEqual({ w: [], b: [] })
    expect(s.pgn).toBe('')
  })

  it('records a plain move exactly', () => {
    const g = new Game()
    const r = g.move('e2e4')
    expect(r).toEqual({
      moveNumber: 1,
      color: 'w',
      piece: 'p',
      from: 'e2',
      to: 'e4',
      san: 'e4',
      uci: 'e2e4',
      flags: 'b',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      check: false,
    })
    expect(r?.fen).toBe(g.fen())
    expect(g.snapshot().pgn).toBe('1. e4')
  })

  it('numbers half-moves by the full move they belong to', () => {
    const g = new Game()
    play(g, 'e2e4', 'e7e5', 'g1f3')
    const h = g.history()
    expect(h.map((m) => m.moveNumber)).toEqual([1, 1, 2])
    expect(h.map((m) => m.color)).toEqual(['w', 'b', 'w'])
    expect(h[2]?.san).toBe('Nf3')
    expect(h[2]?.piece).toBe('n')
  })

  it('castles kingside for both sides', () => {
    const g = new Game()
    play(g, 'e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1c4', 'f8c5')
    const w = g.move('e1g1')
    expect(w?.san).toBe('O-O')
    expect(w?.flags).toBe('k')
    expect(w?.uci).toBe('e1g1')
    const b = g.move('e8g8')
    expect(b?.san).toBe('O-O')
    expect(b?.flags).toBe('k')
    expect(g.fen()).toContain('rnbq1rk1')
    expect(g.fen()).toContain('RNBQ1RK1')
  })

  it('castles queenside for both sides', () => {
    const g = new Game()
    play(g, 'd2d4', 'd7d5', 'b1c3', 'b8c6', 'c1f4', 'c8f5', 'd1d2', 'd8d7')
    const w = g.move('e1c1')
    expect(w?.san).toBe('O-O-O')
    expect(w?.flags).toBe('q')
    const b = g.move('e8c8')
    expect(b?.san).toBe('O-O-O')
    expect(b?.flags).toBe('q')
    expect(b?.from).toBe('e8')
    expect(b?.to).toBe('c8')
  })

  it('records en passant with the captured pawn', () => {
    const g = new Game()
    play(g, 'e2e4', 'a7a6', 'e4e5', 'd7d5')
    const r = g.move('e5d6')
    expect(r?.san).toBe('exd6')
    expect(r?.flags).toBe('e')
    expect(r?.captured).toBe('p')
    expect(g.pieceAt('d5')).toBeNull()
    expect(g.captured()).toEqual({ w: [], b: ['p'] })
  })

  it('promotes without capture, with the promotion letter in uci', () => {
    const g = new Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' })
    const r = g.move('a7a8q')
    expect(r?.san).toBe('a8=Q+')
    expect(r?.promotion).toBe('q')
    expect(r?.captured).toBeUndefined()
    expect(r?.flags).toBe('np')
    expect(r?.uci).toBe('a7a8q')
    expect(r?.check).toBe(true)
    expect(g.pieceAt('a8')).toEqual({ type: 'q', color: 'w' })
  })

  it('promotes with capture, to a knight', () => {
    const g = new Game({ fen: '1n5k/P7/8/8/8/8/8/K7 w - - 0 1' })
    const r = g.move('a7b8n')
    expect(r?.san).toBe('axb8=N')
    expect(r?.promotion).toBe('n')
    expect(r?.captured).toBe('n')
    expect(r?.flags).toBe('cp')
    expect(g.captured()).toEqual({ w: [], b: ['n'] })
  })

  it('needs a promotion letter for a pawn reaching the last rank and refuses without one', () => {
    const g = new Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' })
    expect(g.needsPromotion('a7', 'a8')).toBe(true)
    expect(g.move('a7a8')).toBeNull()
    expect(g.history().length).toBe(0)
    expect(g.legalMoves('a7').sort()).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r'])
    expect(g.destinations('a7')).toEqual(['a8'])
  })

  it('marks check with the suffix and the flag', () => {
    const g = new Game({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' })
    const r = g.move('a1a8')
    expect(r?.san).toBe('Ra8+')
    expect(r?.check).toBe(true)
    expect(g.inCheck()).toBe(true)
    expect(g.snapshot().inCheck).toBe(true)
    expect(g.isGameOver()).toBe(false)
  })
})

describe('Game outcomes', () => {
  it('checkmate names the winner', () => {
    const g = new Game()
    play(g, 'f2f3', 'e7e5', 'g2g4')
    const r = g.move('d8h4')
    expect(r?.san).toBe('Qh4#')
    expect(r?.check).toBe(true)
    expect(g.isGameOver()).toBe(true)
    expect(g.result()).toEqual({ outcome: 'checkmate', winner: 'b' })
    expect(g.snapshot().isGameOver).toBe(true)
    expect(g.move('a2a3')).toBeNull()
    expect(g.legalMoves()).toEqual([])
  })

  it('stalemate', () => {
    const g = new Game({ fen: '7k/8/5QK1/8/8/8/8/8 w - - 0 1' })
    play(g, 'f6f7')
    expect(g.result()).toEqual({ outcome: 'stalemate' })
    expect(g.isGameOver()).toBe(true)
  })

  it('insufficient material', () => {
    const g = new Game({ fen: '8/8/8/8/4k3/8/3n4/3KB3 w - - 0 1' })
    expect(g.isGameOver()).toBe(false)
    const r = g.move('d1d2')
    expect(r?.captured).toBe('n')
    expect(g.result()).toEqual({ outcome: 'draw-insufficient-material' })
  })

  it('threefold repetition', () => {
    const g = new Game()
    play(g, 'g1f3', 'g8f6', 'f3g1', 'f6g8')
    expect(g.isGameOver()).toBe(false)
    play(g, 'g1f3', 'g8f6', 'f3g1', 'f6g8')
    expect(g.result()).toEqual({ outcome: 'draw-repetition' })
    expect(g.isGameOver()).toBe(true)
  })

  it('fifty-move draw', () => {
    const g = new Game({ fen: '8/8/8/8/8/3k4/8/3KR3 w - - 99 60' })
    play(g, 'e1e2')
    expect(g.result()).toEqual({ outcome: 'draw-fifty-moves' })
  })

  it('resignation gives the game to the other side and ends it', () => {
    const g = new Game({ playerColor: 'w' })
    play(g, 'e2e4')
    expect(g.resign()).toEqual({ outcome: 'resignation', winner: 'b' })
    expect(g.isGameOver()).toBe(true)
    expect(g.snapshot().result).toEqual({ outcome: 'resignation', winner: 'b' })
    expect(g.move('e7e5')).toBeNull()
    expect(g.resign()).toBeNull()
  })

  it('a draw by agreement', () => {
    const g = new Game()
    expect(g.agreeDraw()).toEqual({ outcome: 'agreement' })
    expect(g.snapshot().result?.outcome).toBe('agreement')
  })
})

describe('Game legality and bookkeeping', () => {
  it('rejects illegal, malformed and out-of-turn moves and leaves the position alone', () => {
    const g = new Game()
    expect(g.move('e2e5')).toBeNull()
    expect(g.move('e7e5')).toBeNull()
    expect(g.move('zz')).toBeNull()
    expect(g.move('a1a1')).toBeNull()
    expect(g.fen()).toBe(START_FEN)
    expect(g.history()).toEqual([])
  })

  it('lists legal moves from a square and from everywhere', () => {
    const g = new Game()
    expect(g.legalMoves('e2').sort()).toEqual(['e2e3', 'e2e4'])
    expect(g.legalMoves().length).toBe(20)
    expect(g.legalMoves('e7')).toEqual([])
  })

  it('keeps captured lists by the colour taken, in order', () => {
    const g = new Game()
    play(g, 'e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5e5', 'd1e2', 'e5e2')
    expect(g.captured()).toEqual({ w: ['p', 'q'], b: ['p'] })
    const s = g.snapshot()
    expect(s.captured.w).toEqual(['p', 'q'])
    expect(s.history.length).toBe(8)
    expect(s.turn).toBe('w')
    expect(s.inCheck).toBe(true)
  })

  it('reset starts over and can change the player colour', () => {
    const g = new Game()
    play(g, 'e2e4')
    g.resign()
    g.reset({ playerColor: 'b' })
    expect(g.fen()).toBe(START_FEN)
    expect(g.playerColor).toBe('b')
    expect(g.isGameOver()).toBe(false)
    expect(g.history()).toEqual([])
    expect(() => g.reset({ fen: 'not a fen' })).toThrow()
  })

  it('finds kings and pieces', () => {
    const g = new Game()
    expect(kingSquare(g, 'w')).toBe('e1')
    expect(kingSquare(g, 'b')).toBe('e8')
    expect(g.pieces().length).toBe(32)
    expect(g.pieceAt('a1')).toEqual({ type: 'r', color: 'w' })
  })
})
