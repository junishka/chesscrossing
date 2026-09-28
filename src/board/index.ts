/**
 * The board module: game state, the board insert and figurines, move input,
 * the Record of Play, the tray, the promotion card, the date-stamp.
 * Implements src/contracts/board.ts. docs/visual.md sections 6, 7, 9, 11, 13.
 */
import './board.css'

import type { BoardController, BoardModule, BoardMounts, BoardOptions } from '../contracts/board'
import type { Color, GameResult, GameSnapshot, MoveRecord, PieceKey } from '../contracts/chess'
import { pieceKey } from '../contracts/chess'
import type { EventBus } from '../contracts/events'
import { createBoardView, type PiecePlacement } from './board'
import { Game, kingSquare, opposite } from './game'
import { createLedger } from './ledger'
import { variantFor } from './pieces'
import { createStampSound } from './sound'
import { createTray } from './tray'

export type { BoardController, BoardModule, BoardMounts, BoardOptions } from '../contracts/board'
export { Game, parseUci, moveToUci, stripSanSuffix, scoreText, movetext, fenMoveNumber, opposite, kingSquare } from './game'
export type { GameOptions, UciParts } from './game'
export {
  PIECE_HEIGHT,
  pieceGeometry,
  createPieceElement,
  variantFor,
  pieceKeyOf,
} from './pieces'
export type { PieceVariant, PieceGeometry, Shape, PieceElementOptions } from './pieces'
export {
  createBoardView,
  squareOrigin,
  squareAtPoint,
  neighbour,
  isDark,
  ALL_SQUARES,
  INSERT_RPX,
  BAND_RPX,
  SQUARE_RPX,
  STRIP_RPX,
  PIECE_MS,
  CAPTURE_MS,
  CAPTURE_STAGGER_MS,
  RETURN_MS,
  PROMOTION_ROSTER,
} from './board'
export type { BoardView, BoardViewOptions, BoardHandlers, PiecePlacement, MoveOutcome } from './board'
export {
  createLedger,
  remarksFor,
  COLUMN_HEADS,
  COLUMN_WIDTHS,
  COLUMN_GAP_MS,
  STAMP_HOLD_MS,
  REMARK_DETAINED,
  REMARK_CHECK,
  REMARK_REENTERED,
  STAMP_TEXT,
  LEDGER_TITLE,
  EM_DASH,
} from './ledger'
export type { Ledger, LedgerOptions } from './ledger'
export { createTray, tallyText, cardOffsets, TRAY_HOLD_MS, STENCIL_TEXT } from './tray'
export type { Tray, TrayOptions } from './tray'
export { createStampSound, synthesiseKnock, STAMP_MS } from './sound'
export type { StampSound, StampSoundOptions, AudioContextLike } from './sound'

/** Placements for the view from the game's pieces, with the singular pieces told by their home squares. */
function placements(game: Game): PiecePlacement[] {
  return game.pieces().map((p) => {
    const key = pieceKey(p.color, p.type)
    return { square: p.square, key, variant: variantFor(key, p.square) }
  })
}

export function createBoard(mounts: BoardMounts, options: BoardOptions, bus: EventBus): BoardController {
  const playerColorInitial: Color = options.playerColor ?? 'w'
  const game = new Game({ playerColor: playerColorInitial })
  let interactive = options.interactive ?? true
  let playing = false
  /** Bumped on every newGame; an ending sequence in flight checks it. */
  let generation = 0

  const sound = createStampSound({ on: options.soundOn ?? true }, bus)

  const ledger = createLedger(mounts.ledger, {
    opponentLines: options.opponentLines,
    ledgerDate: options.ledgerDate,
    onDetained: () => {
      sound.play()
    },
  })

  const tray = createTray(mounts.tray, {
    pieceNames: options.pieceNames,
    onInspect: (key: PieceKey) => bus.emit({ type: 'piece:inspect', key, captured: true }),
  })

  const isPlayersTurn = (): boolean => playing && !game.isGameOver() && game.turn() === game.playerColor

  const view = createBoardView(
    mounts.board,
    {
      orientation: options.orientation ?? playerColorInitial,
      interactive,
      pieceNames: options.pieceNames,
    },
    {
      onMove(from, to, promotion) {
        if (!interactive || !isPlayersTurn()) return false
        const record = play(`${from}${to}${promotion ?? ''}`, 'player')
        return record !== null
      },
      onInspect(key, square) {
        bus.emit({ type: 'piece:inspect', key, square })
      },
      canPick(square) {
        if (!interactive || !isPlayersTurn()) return false
        const p = game.pieceAt(square)
        return p !== null && p.color === game.playerColor
      },
      destinations(from) {
        if (!interactive || !isPlayersTurn()) return []
        return game.destinations(from)
      },
      needsPromotion(from, to) {
        return game.needsPromotion(from, to)
      },
    },
  )

  /** Plays a move that chess.js has not yet seen. Null and nothing emitted if illegal. */
  function play(uci: string, by: 'player' | 'opponent'): MoveRecord | null {
    if (!playing) return null
    const record = game.move(uci)
    if (!record) return null
    const snapshot = game.snapshot()
    const gen = generation

    void view.animateMove(record).then((outcome) => {
      if (gen !== generation) return
      if (outcome.taken) tray.add(outcome.taken.key, outcome.taken.variant)
    })
    view.setCheck(record.check ? kingSquare(game, game.turn()) : null)
    void ledger.addMove(record)

    bus.emit({ type: 'game:move', move: record, snapshot, by })
    if (snapshot.isGameOver && snapshot.result) {
      end(snapshot.result, snapshot)
    } else if (record.check) {
      bus.emit({ type: 'game:check', color: game.turn(), snapshot })
    }
    return record
  }

  /** The game has ended: emit, type the result and his words, return the pieces, cut the insert out. */
  function end(result: GameResult, snapshot: GameSnapshot): void {
    playing = false
    view.clearSelection()
    bus.emit({ type: 'game:over', result, snapshot })
    const gen = generation
    void (async () => {
      await ledger.addResult(result, game.playerColor)
      if (gen !== generation) return
      await view.returnPieces()
      if (gen !== generation) return
      view.hide()
    })()
  }

  const controller: BoardController = {
    newGame(opts = {}) {
      generation++
      game.reset({ fen: opts.fen, playerColor: opts.playerColor ?? game.playerColor })
      playing = true
      view.setOrientation(options.orientation ?? game.playerColor)
      view.setPosition(placements(game))
      view.setCheck(game.inCheck() ? kingSquare(game, game.turn()) : null)
      view.setInteractive(interactive)
      view.show()
      tray.reset()
      ledger.reset()
      void ledger.addStart()
      const snapshot = game.snapshot()
      bus.emit({ type: 'game:new', snapshot })
      return snapshot
    },
    snapshot() {
      return game.snapshot()
    },
    applyMove(uci, by) {
      return play(uci, by)
    },
    legalMoves(from) {
      return game.legalMoves(from)
    },
    setInteractive(on) {
      interactive = on
      view.setInteractive(on)
    },
    setOrientation(color) {
      view.setOrientation(color)
    },
    resign() {
      if (!playing) return
      const result = game.resign(game.playerColor)
      if (!result) return
      end(result, game.snapshot())
    },
    setTrayVisible(on) {
      tray.setPinned(on)
    },
    destroy() {
      generation++
      playing = false
      view.destroy()
      ledger.destroy()
      tray.destroy()
      sound.destroy()
    },
  }
  return controller
}

/** The module as the contract names it. */
export const board: BoardModule = { createBoard }
