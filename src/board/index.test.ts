// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardController, BoardOptions } from '../contracts/board'
import type { AppEvent, EventBus } from '../contracts/events'
import type { PieceKey } from '../contracts/chess'
import { PIECE_KEYS, START_FEN } from '../contracts/chess'
import { createBus } from '../contracts/bus'
import { board, createBoard } from './index'

const names = Object.fromEntries(PIECE_KEYS.map((k) => [k, `Name ${k}`])) as Record<PieceKey, string>

const OPTIONS: BoardOptions = {
  pieceNames: names,
  opponentLines: { please: 'Please.', thankYou: 'Thank you.', thankYouHelder: 'Danke.' },
  ledgerDate: () => '14 III 90',
  soundOn: false,
}

describe('createBoard', () => {
  let mounts: { board: HTMLElement; ledger: HTMLElement; tray: HTMLElement }
  let bus: EventBus
  let events: AppEvent[]
  let ctl: BoardController

  const sq = (s: string): HTMLButtonElement => mounts.board.querySelector(`button.square[data-square="${s}"]`) as HTMLButtonElement
  const piece = (s: string): SVGSVGElement => mounts.board.querySelector(`.piece[data-square="${s}"]`) as SVGSVGElement
  const clickPiece = (s: string): void => {
    piece(s).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  const ofType = <T extends AppEvent['type']>(t: T): Extract<AppEvent, { type: T }>[] =>
    events.filter((e) => e.type === t) as Extract<AppEvent, { type: T }>[]

  beforeEach(() => {
    vi.useFakeTimers()
    mounts = { board: document.createElement('div'), ledger: document.createElement('div'), tray: document.createElement('div') }
    document.body.append(mounts.board, mounts.ledger, mounts.tray)
    bus = createBus()
    events = []
    bus.onAny((e) => {
      events.push(e)
    })
    ctl = createBoard(mounts, OPTIONS, bus)
  })
  afterEach(() => {
    ctl.destroy()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('is the module the contract names', () => {
    expect(board.createBoard).toBe(createBoard)
  })

  it('mounts the three inserts hidden or empty, and shows the board on newGame with game:new', () => {
    expect(mounts.board.querySelector('[data-board]')?.hasAttribute('hidden')).toBe(true)
    expect(mounts.tray.querySelector('[data-tray]')?.hasAttribute('hidden')).toBe(true)
    expect(mounts.ledger.querySelector('[data-ledger]')).not.toBeNull()
    expect(mounts.board.querySelectorAll('button.square[data-square]').length).toBe(64)
    const snap = ctl.newGame()
    expect(snap.fen).toBe(START_FEN)
    expect(mounts.board.querySelector('[data-board]')?.hasAttribute('hidden')).toBe(false)
    expect(ofType('game:new').length).toBe(1)
    expect(ofType('game:new')[0]?.snapshot.fen).toBe(START_FEN)
    expect(mounts.board.querySelectorAll('.piece[data-piece]').length).toBe(32)
  })

  it('types Please on the start row', async () => {
    ctl.newGame()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mounts.ledger.querySelector('[data-ledger-row="start"] [data-ledger-cell="remarks"]')?.textContent).toBe('Please.')
  })

  it('plays a legal move by click sequence and emits game:move by player', async () => {
    ctl.newGame()
    clickPiece('e2')
    expect(ofType('piece:inspect')).toEqual([{ type: 'piece:inspect', key: 'wP', square: 'e2' }])
    sq('e4').click()
    const moved = ofType('game:move')
    expect(moved.length).toBe(1)
    expect(moved[0]?.by).toBe('player')
    expect(moved[0]?.move.uci).toBe('e2e4')
    expect(moved[0]?.snapshot.turn).toBe('b')
    expect(ctl.snapshot().history.length).toBe(1)
    expect(piece('e4').getAttribute('data-piece')).toBe('wP')
    // The move row follows the start row, which types Please first.
    await vi.advanceTimersByTimeAsync(2000)
    expect(mounts.ledger.querySelectorAll('[data-ledger-row="move"]').length).toBe(1)
  })

  it('does nothing for an illegal click sequence', () => {
    ctl.newGame()
    clickPiece('e2')
    sq('e5').click()
    sq('d7').click()
    expect(ofType('game:move').length).toBe(0)
    expect(ctl.snapshot().fen).toBe(START_FEN)
    // The opponent's piece cannot be picked up.
    clickPiece('e7')
    expect(mounts.board.querySelector('[data-board]')?.hasAttribute('data-board-selected')).toBe(false)
    sq('e5').click()
    expect(ofType('game:move').length).toBe(0)
  })

  it('applyMove for the opponent emits, returns null for an illegal move and emits nothing', () => {
    ctl.newGame()
    expect(ctl.applyMove('e2e4', 'player')?.san).toBe('e4')
    expect(ctl.applyMove('e2e4', 'opponent')).toBeNull()
    expect(ctl.applyMove('nonsense', 'opponent')).toBeNull()
    const r = ctl.applyMove('e7e5', 'opponent')
    expect(r?.san).toBe('e5')
    const moved = ofType('game:move')
    expect(moved.map((m) => m.by)).toEqual(['player', 'opponent'])
    expect(ctl.legalMoves('g1').sort()).toEqual(['g1e2', 'g1f3', 'g1h3'])
  })

  it('refuses moves before a game and out of turn', () => {
    expect(ctl.applyMove('e2e4', 'player')).toBeNull()
    ctl.newGame()
    clickPiece('e2')
    sq('e4').click()
    clickPiece('d2')
    expect(mounts.board.querySelector('[data-board]')?.hasAttribute('data-board-selected')).toBe(false)
    expect(ofType('game:move').length).toBe(1)
  })

  it('setInteractive(false) blocks input but still reports a clicked piece', () => {
    ctl.newGame()
    ctl.setInteractive(false)
    clickPiece('e2')
    sq('e4').click()
    expect(ofType('game:move').length).toBe(0)
    expect(ofType('piece:inspect').length).toBe(1)
    expect(ctl.applyMove('e2e4', 'opponent')).not.toBeNull()
    expect(ctl.applyMove('e7e5', 'opponent')).not.toBeNull()
    ctl.setInteractive(true)
    clickPiece('d2')
    sq('d4').click()
    expect(ofType('game:move').length).toBe(3)
  })

  it('plays a move by keyboard', () => {
    ctl.newGame()
    sq('e1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    sq('e2').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    sq('e2').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    sq('e3').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    sq('e4').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(ofType('game:move').map((m) => m.move.uci)).toEqual(['e2e4'])
  })

  it('raises the promotion card and waits; the choice plays with the letter', async () => {
    ctl.newGame({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' })
    clickPiece('a7')
    sq('a8').click()
    await vi.advanceTimersByTimeAsync(0)
    const card = mounts.board.querySelector('[data-promotion]')
    expect(card).not.toBeNull()
    expect(ofType('game:move').length).toBe(0)
    ;(card?.querySelector('[data-promotion-choice="r"]') as HTMLElement).click()
    await vi.advanceTimersByTimeAsync(300)
    const moved = ofType('game:move')
    expect(moved[0]?.move.uci).toBe('a7a8r')
    expect(moved[0]?.move.promotion).toBe('r')
    expect(piece('a8').getAttribute('data-piece')).toBe('wR')
    expect(ofType('game:check').length).toBe(1)
    await vi.advanceTimersByTimeAsync(6000)
    const remarks = mounts.ledger.querySelector('[data-ledger-row="move"] [data-ledger-cell="remarks"]')
    expect(remarks?.textContent).toBe('Re-entered as Rook. Check.')
  })

  it('emits game:check and doubles the king square', () => {
    ctl.newGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' })
    ctl.applyMove('a1a8', 'player')
    const checks = ofType('game:check')
    expect(checks.length).toBe(1)
    expect(checks[0]?.color).toBe('b')
    expect(mounts.board.querySelector('[data-board-mark="check"]')?.getAttribute('data-square')).toBe('e8')
    expect(events.map((e) => e.type)).toEqual(['game:new', 'game:move', 'game:check'])
  })

  it('a capture types Detained. with a stamp and shelves the piece in the tray', async () => {
    ctl.newGame()
    ctl.applyMove('e2e4', 'player')
    ctl.applyMove('d7d5', 'opponent')
    ctl.applyMove('e4d5', 'player')
    await vi.advanceTimersByTimeAsync(0)
    expect(mounts.tray.querySelector('[data-tray]')?.hasAttribute('hidden')).toBe(true)
    await vi.advanceTimersByTimeAsync(320)
    const tray = mounts.tray.querySelector('[data-tray]') as HTMLElement
    expect(tray.hidden).toBe(false)
    expect(tray.querySelector('[data-tray-tally]')?.textContent).toBe('Detained. W 0. E 1.')
    expect(tray.querySelector('[data-tray-row="b"] [data-tray-piece="bP"]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(12000)
    const rows = mounts.ledger.querySelectorAll('[data-ledger-row="move"]')
    expect(rows.length).toBe(3)
    const remarks = rows[2]?.querySelector('[data-ledger-cell="remarks"]')
    expect(remarks?.textContent?.startsWith('Detained.')).toBe(true)
    expect(remarks?.querySelector('[data-ledger-stamp] .t-stamp')?.textContent).toBe('DETAINED')
    expect(remarks?.querySelector('[data-ledger-stamp-date]')?.textContent).toBe('14 III 90')
    expect(tray.hidden).toBe(true)
    ctl.setTrayVisible(true)
    expect(tray.hidden).toBe(false)
    ;(tray.querySelector('[data-tray-piece="bP"]') as HTMLElement).click()
    expect(ofType('piece:inspect').at(-1)).toEqual({ type: 'piece:inspect', key: 'bP', captured: true })
    ctl.setTrayVisible(false)
    expect(tray.hidden).toBe(true)
    expect(ctl.snapshot().captured).toEqual({ w: [], b: ['p'] })
  })

  it('ends on mate: game:over, result and thank-you rows, pieces return, insert cuts out', async () => {
    ctl.newGame()
    ctl.applyMove('f2f3', 'player')
    ctl.applyMove('e7e5', 'opponent')
    ctl.applyMove('g2g4', 'player')
    ctl.applyMove('d8h4', 'opponent')
    const over = ofType('game:over')
    expect(over.length).toBe(1)
    expect(over[0]?.result).toEqual({ outcome: 'checkmate', winner: 'b' })
    expect(ofType('game:check').length).toBe(0)
    expect(events.at(-1)?.type).toBe('game:over')
    const boardEl = mounts.board.querySelector('[data-board]') as HTMLElement
    expect(boardEl.hidden).toBe(false)
    clickPiece('a2')
    expect(boardEl.hasAttribute('data-board-selected')).toBe(false)
    expect(ctl.applyMove('a2a3', 'player')).toBeNull()
    await vi.advanceTimersByTimeAsync(30000)
    const result = mounts.ledger.querySelector('[data-ledger-row="result"] [data-ledger-cell="result"]')
    expect(result?.textContent).toBe('0–1. 14 III 90.')
    const words = [...mounts.ledger.querySelectorAll('[data-ledger-row="word"] [data-ledger-cell="remarks"]')].map((w) => w.textContent)
    expect(words).toEqual(['Thank you.'])
    expect(boardEl.hidden).toBe(true)
    expect(piece('h4')).toBeNull()
    expect(piece('d8').getAttribute('data-piece')).toBe('bQ')
  })

  it('resign ends the game for the opponent and he thanks in Helder when he has lost', async () => {
    ctl.newGame()
    ctl.applyMove('e2e4', 'player')
    ctl.resign()
    const over = ofType('game:over')
    expect(over[0]?.result).toEqual({ outcome: 'resignation', winner: 'b' })
    ctl.resign()
    expect(ofType('game:over').length).toBe(1)
    await vi.advanceTimersByTimeAsync(30000)
    expect(mounts.ledger.querySelectorAll('[data-ledger-row="word"]').length).toBe(1)

    // A game he loses: the player mates as white.
    ctl.newGame()
    expect(mounts.board.querySelector('[data-board]')?.hasAttribute('hidden')).toBe(false)
    for (const [m, by] of [['e2e4', 'player'], ['e7e5', 'opponent'], ['d1h5', 'player'], ['b8c6', 'opponent'], ['f1c4', 'player'], ['g8f6', 'opponent'], ['h5f7', 'player']] as const) {
      expect(ctl.applyMove(m, by)).not.toBeNull()
    }
    expect(ofType('game:over').at(-1)?.result).toEqual({ outcome: 'checkmate', winner: 'w' })
    await vi.advanceTimersByTimeAsync(40000)
    const words = [...mounts.ledger.querySelectorAll('[data-ledger-row="word"] [data-ledger-cell="remarks"]')].map((w) => w.textContent)
    expect(words).toEqual(['Danke.', 'Thank you.'])
    expect(mounts.ledger.querySelector('[data-ledger-row="result"]')?.getAttribute('data-ledger-result')).toBe('1–0')
  })

  it('takes black: the board flips, the player moves second', () => {
    ctl.newGame({ playerColor: 'b' })
    const boardEl = mounts.board.querySelector('[data-board]') as HTMLElement
    expect(boardEl.getAttribute('data-board-orientation')).toBe('b')
    expect(ctl.snapshot().playerColor).toBe('b')
    clickPiece('e7')
    expect(boardEl.hasAttribute('data-board-selected')).toBe(false)
    expect(ctl.applyMove('e2e4', 'opponent')).not.toBeNull()
    clickPiece('e7')
    expect(boardEl.getAttribute('data-board-selected')).toBe('e7')
    sq('e5').click()
    expect(ofType('game:move').map((m) => m.by)).toEqual(['opponent', 'player'])
    ctl.setOrientation('w')
    expect(boardEl.getAttribute('data-board-orientation')).toBe('w')
  })
})
