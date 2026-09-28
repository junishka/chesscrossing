// The expedition: one game in the Board Room, from the header typed on the roll to the result
// (docs/BIBLE.md §5.3–§5.7, §5.11; docs/ARCHITECTURE.md "station/expedition.ts"). It owns the flow:
// the player's input and pins, the glide, the chair's move by davit after the glide, the clocks on the
// chronometer pair, the gauge, the ledger, the Second's trigger policy, and the end of the game.
// It hears the game through the bus; it reaches the scene and the UI only through the facades given.
import type {
  CairnTag, ClockState, Color, GameEndReason, GameResult, GameSettings, GameStatus, LedgerRow, MoveInput, MoveRecord,
  PieceType, PositionBrief, SeaState, Square,
} from '../types'
import { bus } from '../core/bus'
import { clock } from '../core/clock'
import { store } from '../core/store'
import type { Game } from '../chess/game'
import { Position } from '../chess/rules'
import type { BoardView } from '../scene/boardView'
import type { UI } from '../ui/overlay'
import { copy, ledgerResultLine } from '../content/copy'
import { HOUSE_GAME_SEA_STATE, ratingUpdate, seaState as seaStateDef } from '../content/seaStates'
import { watchDef } from '../content/watches'
import type { LedgerRoll } from './ledger'
import type { SecondService } from './second'
import type { SeasonClock } from './season'

/** After a transition the board accepts input only after this long (§11). */
export const HOLD_AFTER_TRANSITION_MS = 500
/** After checkmate or resignation, this long (§11). */
export const HOLD_AFTER_END_MS = 2400
/** The resignation gesture: `Hold.` is typed at 400 ms, the king tips at 1200 ms (§5.5). */
export const RESIGN_HOLD_TYPED_MS = 400
export const RESIGN_HOLD_MS = 1200
/** The Predictor considers a draw offer this long: the barometer's needle trembles (§5.5). */
export const DRAW_CONSIDER_MS = 1400
/** The capture insert's hold (§5.5, §14.3). */
export const RETURNED_INSERT_MS = 500
/** Pointer travel (px) that turns the press on the king into a drag: the hold is abandoned. */
const HOLD_SLOP_PX = 6
/** After checkmate the scene holds this long with nothing moving (§5.5). */
export const CHECKMATE_HOLD_MS = 3000
/** The chair's name on the settings; the Predictor moves it. */
const CHAIR_NAME = 'The Predictor'

/** The promotion pieces, in the drawer's order, with the plate's words (§5.5: the SPARES drawer). */
const PROMOTION_ITEMS: { id: PieceType; label: string }[] = [
  { id: 'q', label: 'QUEEN' },
  { id: 'r', label: 'ROOK' },
  { id: 'b', label: 'BISHOP' },
  { id: 'n', label: 'KNIGHT' },
]

/** How an expedition begins: a fresh game, or the adjourned one from its PGN and clocks; the house game of Chapter Nine. */
export interface BeginOptions {
  /** The adjourned game's movetext: the expedition resumes under its header on the roll. */
  pgn?: string
  /** The adjourned game's clocks. */
  clocks?: ClockState
  /** Chapter Nine: Black for Voss at sea state 5, the chair playing Hardy's side. */
  houseGame?: boolean
}

/** What the expedition is given besides the contract's six: hooks main wires to the rest of the house. */
export interface ExpeditionOptions {
  /** The chapter engine: checked after every finished game. */
  chapters?: { check(): void }
  /** The sound department's gauge (Slack Water reads it). */
  audio?: { setGauge(cp: number): void }
  /** The stage's canvas, for the press-and-hold on the player's own king. */
  canvas?: HTMLElement
  /** Called when the expedition leaves the board (adjournment): main stands the player up. */
  onLeave?: () => void
}

/** The end of a game as the game reported it. */
export interface EndStatus { status: GameStatus; result: GameResult; reason: GameEndReason }

/** Pieces taken by each side in a history, in order, as BoardView.sync lays them in THE RETURNED. */
export function capturedOf(history: MoveRecord[], uptoPly = Infinity): { byWhite: PieceType[]; byBlack: PieceType[] } {
  const byWhite: PieceType[] = []
  const byBlack: PieceType[] = []
  for (const m of history) {
    if (m.ply > uptoPly) break
    if (m.captured) (m.color === 'w' ? byWhite : byBlack).push(m.captured)
  }
  return { byWhite, byBlack }
}

/** The cairn tags of a game: one per capture, on the square where the piece was taken (§5.8). */
export function cairnTagsOf(history: MoveRecord[], expedition: number): CairnTag[] {
  return history
    .filter((m) => m.captured)
    .map((m) => ({
      square: m.capturedSquare ?? m.to,
      expedition,
      move: m.moveNumber,
      piece: m.captured as PieceType,
      color: (m.color === 'w' ? 'b' : 'w') as Color,
    }))
}

/** The Visitor's score under a result: 1, ½ or 0. */
export function scoreFor(result: GameResult, player: Color): 0 | 0.5 | 1 {
  if (result === '1/2-1/2') return 0.5
  return (result === '1-0') === (player === 'w') ? 1 : 0
}

/** The side that lost, or undefined on a draw. */
function loserOf(result: GameResult): Color | undefined {
  return result === '1-0' ? 'b' : result === '0-1' ? 'w' : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/**
 * One game in the Board Room. `begin` sets the game up from the barometer and the watch and types the
 * header; the player's clicks become pins and moves; the chair's replies wait for the player's glide and
 * are carried by the davit; checks, mates, draws, resignation and flag fall end on the board and on the roll.
 */
export class Expedition {
  /** The expedition's number on the roll, or null before the first. */
  number: number | null = null
  /** The side the Visitor plays. */
  playerColor: Color = 'w'
  /** True while a game of this expedition is being played at the board. */
  active = false
  /** True once `adjourn()` has left the game standing, until it is resumed. */
  adjourned = false

  private readonly game: Game
  private readonly board: BoardView
  private readonly season: SeasonClock
  private readonly ledger: LedgerRoll
  private readonly second: SecondService
  private readonly ui: UI
  private readonly o: ExpeditionOptions
  /** The choreography queue: the player's glide, then the chair's davit, then the end, in order. */
  private chain: Promise<void> = Promise.resolve()
  private pending = 0
  private selected: Square | null = null
  private holdUntil = 0
  private rewound = false
  private chairMoving = false
  private thinkingSince: number | null = null
  private lastThinkMs: number | undefined
  /** A promotion whose piece is chosen while the drawer is open: the game's own move is not animated again. */
  private promoting = false
  /** Briefs and typed rows by ply, so the Second hears a move once both its sounding and its row exist. */
  private readonly briefs = new Map<number, PositionBrief>()
  private readonly typed = new Map<number, MoveRecord>()
  private readonly heard = new Set<number>()
  private kingHold: { timers: number[]; x: number; y: number } | null = null
  /** When the last game ended; a click on the board after the hold sets it again (Order 4). */
  private endedAt: number | null = null
  private readonly offs: (() => void)[] = []

  constructor(game: Game, boardView: BoardView, season: SeasonClock, ledger: LedgerRoll, second: SecondService, ui: UI, o: ExpeditionOptions = {}) {
    this.game = game
    this.board = boardView
    this.season = season
    this.ledger = ledger
    this.second = second
    this.ui = ui
    this.o = o
    this.game.holdChairClock = true
    this.board.onSquare((sq) => this.onSquare(sq))
    this.listen()
    if (o.canvas) this.bindKingHold(o.canvas)
    this.ui.hud.onRowClick((_ply, row) => this.rewind(row))
  }

  // ───────────────────────────── Beginning ─────────────────────────────

  /**
   * Begins an expedition: the sea state gives the chair's level, time and window; the watch gives the
   * clocks; the Visitor has the light side unless this is the house game. A fresh game types its header on
   * the roll and counts the expedition; an adjourned one resumes under its own header.
   */
  async begin(o: BeginOptions = {}): Promise<void> {
    const s = this.season.season
    const state: SeaState = o.houseGame ? HOUSE_GAME_SEA_STATE : s.seaState
    const sea = seaStateDef(state)
    const watch = watchDef(s.timeControl)
    const saved = o.pgn ? store.ledger.savedGame : undefined
    this.playerColor = o.houseGame ? 'b' : saved?.settings.playerColor ?? 'w'
    this.reset()

    if (o.pgn) {
      this.number = this.ledger.currentExpedition() ?? s.expeditions
    } else {
      s.expeditions += 1
      this.number = s.expeditions
      this.ledger.startExpedition(this.number, s.timeControl, state, s.date, { visitor: this.playerColor })
      store.save()
    }

    const settings: GameSettings = saved && o.pgn
      ? { ...saved.settings, opponent: { ...saved.settings.opponent, level: sea.level } }
      : { playerColor: this.playerColor, opponent: { kind: 'engine', level: sea.level, name: CHAIR_NAME }, minutes: watch.minutes, incrementSec: watch.incrementSec }
    this.game.chair = { seaState: state, ...(sea.windowCp !== undefined ? { window: sea.windowCp } : {}) }
    this.board.setPlayerColor(this.playerColor)
    this.active = true
    this.adjourned = false
    this.game.start(settings, o.pgn, o.clocks)
    this.board.sync(this.game.position, capturedOf(this.game.position.history()))
    this.board.setClocks(this.game.clocks)
    this.board.setGauge(0)
    this.holdInput(HOLD_AFTER_TRANSITION_MS)
  }

  /** Sits back down to a game adjourned in this session: the clocks resume, the board is as it was left. */
  resumeAtBoard(): void {
    if (this.game.state !== 'playing') return
    this.active = true
    this.adjourned = false
    this.game.resume()
    this.holdInput(HOLD_AFTER_TRANSITION_MS)
  }

  /** True while a game is standing at the board: begun, not finished (adjourned games included). */
  inProgress(): boolean {
    return this.game.state === 'playing'
  }

  /** The board accepts no input for `ms` (after a transition, 500 ms; after mate or resignation, 2400 ms). */
  holdInput(ms: number): void {
    this.holdUntil = Math.max(this.holdUntil, performance.now() + ms)
  }

  // ───────────────────────────── The player's moves ─────────────────────────────

  /** Whether the board takes the player's hand now. */
  private accepting(): boolean {
    return this.active && !this.rewound && this.game.state === 'playing' && this.pending === 0
      && performance.now() >= this.holdUntil && this.game.position.turn() === this.playerColor
  }

  /** A square was clicked (or a dragged piece released over it): select, move, or set down. */
  private onSquare(sq: Square): void {
    if (this.game.state === 'over' && this.endedAt !== null && this.pending === 0
      && performance.now() >= Math.max(this.holdUntil, this.endedAt + HOLD_AFTER_END_MS)) {
      // The board is never left unset (Order 4): a hand on it after a finished game begins the next expedition.
      this.endedAt = null
      void this.begin()
      return
    }
    if (!this.accepting()) return
    const pos = this.game.position
    if (this.selected && this.selected !== sq && pos.legalTargets(this.selected).includes(sq)) {
      const from = this.selected
      this.select(null)
      void this.playerMove({ from, to: sq })
      return
    }
    const piece = pos.get(sq)
    if (piece && piece.color === this.playerColor && this.selected !== sq) this.select(sq)
    else this.select(null)
  }

  private select(sq: Square | null): void {
    this.selected = sq
    this.board.highlight(sq, sq ? this.game.position.legalTargets(sq) : [])
  }

  /**
   * Plays the player's move: the pins sink as the piece glides; the chair's move follows the glide.
   * A promotion without a chosen piece goes to the SPARES drawer: the pawn is returned, the drawer opens,
   * the piece is picked from the plate, and only then is the move entered.
   */
  async playerMove(input: MoveInput): Promise<void> {
    if (!this.accepting()) return
    const pos = this.game.position
    const variants = pos.legalMoves(input.from).filter((m) => m.to === input.to)
    if (!variants.length) { this.ui.toast(copy.toasts.illegal); return }
    const needsPiece = variants.some((m) => m.promotion) && !input.promotion
    this.select(null)
    if (!needsPiece) {
      const record = await this.game.playerMove(input)
      if (!record) this.ui.toast(copy.toasts.illegal)
      return
    }
    // The drawer: animate a provisional queen's move; the real one is entered when the piece is chosen.
    const provisional = pos.clone().move({ ...input, promotion: 'q' })
    if (!provisional) return
    this.promoting = true
    let entered: MoveRecord | null = null
    await this.enqueue(async () => {
      try {
        await this.board.animateMove(provisional, {
          byChair: false,
          insert: (lines) => this.insert(lines),
          promotionChooser: async () => {
            const piece = await this.choosePromotion()
            entered = await this.game.playerMove({ ...input, promotion: piece })
            return piece
          },
        })
      } finally {
        this.promoting = false
      }
      const record: MoveRecord | null = entered
      if (!record) { this.board.sync(this.game.position, capturedOf(this.game.position.history())); return }
      // The mast follows the move actually entered (a knight may give check where a queen would not).
      if (record.isCheck !== provisional.isCheck || record.isMate !== provisional.isMate) {
        if (record.isMate) void this.board.mast.hoist('NC')
        else if (record.isCheck) void this.board.mast.hoist('U')
        else if (this.board.mast.current) void this.board.mast.lower()
      }
      this.typeMove(record)
    })
  }

  /** The plate over the open drawer: QUEEN, ROOK, BISHOP, KNIGHT. Resolves with the piece picked (a queen if the plate is closed). */
  private choosePromotion(): Promise<PieceType> {
    return new Promise((resolve) => {
      let done = false
      const finish = (p: PieceType) => { if (done) return; done = true; this.ui.menu.close(); resolve(p) }
      this.ui.menu.open({
        title: copy.placards.spares,
        subtitle: ['FOUR OF EACH COLOUR.'],
        footer: 'THE SPARES DRAWER.  PEAR, FELT.  1948.',
        items: PROMOTION_ITEMS.map((p) => ({ id: p.id, label: p.label })),
        onPick: (id) => finish(id as PieceType),
        onClose: () => finish('q'),
      })
    })
  }

  // ───────────────────────────── The game's events ─────────────────────────────

  private listen(): void {
    this.offs.push(bus.on('game:move', ({ move, byPlayer }) => {
      if (!this.active) return
      if (byPlayer) { if (!this.promoting) this.onPlayerMoved(move) }
      else this.onChairMoved(move)
    }))
    this.offs.push(bus.on('game:thinking', ({ thinking }) => {
      if (thinking) this.thinkingSince = performance.now()
      else if (this.thinkingSince !== null) { this.lastThinkMs = performance.now() - this.thinkingSince; this.thinkingSince = null }
    }))
    this.offs.push(bus.on('game:over', (end) => {
      if (!this.active && !this.adjourned) return
      void this.enqueue(() => this.end(end))
    }))
    this.offs.push(bus.on('game:brief', (b) => {
      const cp = b.evalCp ?? 0
      // The gauge reads from the chair's side: water rising toward the chair means the chair is ahead.
      const chairCp = this.playerColor === 'w' ? -cp : cp
      const chairMate = b.mateIn === undefined ? undefined : this.playerColor === 'w' ? -b.mateIn : b.mateIn
      this.board.setGauge(chairCp, chairMate)
      this.o.audio?.setGauge(chairCp)
      this.briefs.set(b.ply, b)
      this.hear(b.ply)
    }))
    this.offs.push(bus.on('game:clock', (c) => this.board.setClocks(c)))
    this.offs.push(bus.on('game:undo', () => {
      this.briefs.clear()
      this.board.sync(this.game.position, capturedOf(this.game.position.history()))
    }))
  }

  /** The player's move is entered: the piece rises, glides and seats; the roll types it. */
  private onPlayerMoved(move: MoveRecord): void {
    void this.enqueue(async () => {
      this.leaveRewind(move.fenBefore)
      await this.board.animateMove(move, { byChair: false, insert: (lines) => this.insert(lines) })
      this.typeMove(move)
    })
  }

  /** The chair's reply: it waits for the glide, then the davit carries it; the chair's clock stops at the clamp. */
  private onChairMoved(move: MoveRecord): void {
    const thinkMs = this.thinkingSince !== null ? performance.now() - this.thinkingSince : this.lastThinkMs
    void this.enqueue(async () => {
      this.leaveRewind(move.fenBefore)
      this.chairMoving = true
      try {
        await this.board.animateMove(move, {
          byChair: true,
          onClamp: () => this.game.clampClosed(),
          insert: (lines) => this.insert(lines),
        })
      } finally {
        this.chairMoving = false
        this.game.chairSeated()
      }
      this.typeMove(move, thinkMs)
      this.board.highlight(null, [])
    })
  }

  /** Types a ply on the roll and lets the Second hear it once its sounding is in. */
  private typeMove(move: MoveRecord, thinkMs?: number): void {
    this.ledger.move(move, thinkMs !== undefined ? { thinkMs } : {})
    this.typed.set(move.ply, move)
    this.hear(move.ply)
  }

  /** The Second's trigger policy runs once per ply, when both the row and the sounding exist. */
  private hear(ply: number): void {
    if (this.heard.has(ply)) return
    const move = this.typed.get(ply)
    const brief = this.briefs.get(ply)
    if (!move || !brief) return
    this.heard.add(ply)
    this.second.onMove(move, brief, this.chairMoving ? 'chair' : 'still')
  }

  /** The capture insert: the tag on felt, 500 ms. */
  private insert(lines: string[]): Promise<void> {
    return this.ui.insert({ kind: 'returned', lines, holdMs: RETURNED_INSERT_MS })
  }

  /** Queues a piece of choreography behind whatever is moving; the queue never stops on an error. */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.pending++
    const run = this.chain.then(fn).catch((err) => { console.error('[expedition] choreography failed', err) }).finally(() => { this.pending-- })
    this.chain = run
    return run
  }

  // ───────────────────────────── The end ─────────────────────────────

  /**
   * The end of a game: the flags (or the tipped king, or the fall flag), the result typed on the roll, the
   * station rating, the cairn tags of every capture, the date turned, the chapters checked, the bell and
   * Survey Theme on checkmate, and the input hold. The game has already counted itself in the store.
   */
  async end(end: EndStatus): Promise<void> {
    const { result, reason, status } = end
    const n = this.number ?? this.season.season.expeditions
    const history = this.game.position.history()
    this.active = false
    this.adjourned = false
    this.select(null)
    this.endedAt = performance.now()
    if (reason === 'checkmate' || reason === 'resignation') this.holdInput(HOLD_AFTER_END_MS)
    if (reason === 'checkmate') bus.emit('audio:sfx', { name: 'mate' })
    if (reason === 'timeout') bus.emit('audio:sfx', { name: 'flagfall' })
    const loser = reason === 'checkmate' ? status.turn : loserOf(result)
    await this.board.finish(reason, loser)

    const winner: Color | null = result === '1-0' ? 'w' : result === '0-1' ? 'b' : null
    this.ledger.result(ledgerResultLine(reason, winner))

    const s = this.season.season
    const nominal = seaStateDef(this.game.chair.seaState ?? s.seaState).nominal
    s.rating = ratingUpdate(s.rating, scoreFor(result, this.playerColor), nominal)
    s.cairnTags.push(...cairnTagsOf(history, n))
    store.save()

    const last = history[history.length - 1]
    if (last) {
      try { this.second.onMove(last, await this.game.brief(), 'still') } catch (err) { console.error('[expedition] the post-mortem brief failed', err) }
    }
    this.season.advanceDay()
    this.o.chapters?.check()
    if (reason === 'checkmate') await clock.wait(CHECKMATE_HOLD_MS)
  }

  // ───────────────────────────── The player's other verbs ─────────────────────────────

  /** Resigns: the king tips, flag P, `0-1 by resignation.` A resigned game is a finished game (Order 6). */
  async resign(): Promise<void> {
    if (this.game.state !== 'playing') return
    this.cancelKingHold()
    this.game.resign()
    await this.chain
  }

  /**
   * Offers a draw: the Predictor considers for 1400 ms, then accepts by the engine's rule (flags to half
   * height, `1/2-1/2 by agreement`) or declines (the card is pushed back).
   */
  async offerDraw(): Promise<void> {
    if (!this.active || this.game.state !== 'playing') return
    this.holdInput(DRAW_CONSIDER_MS)
    await sleep(DRAW_CONSIDER_MS)
    if (this.game.state !== 'playing') return
    const accepted = this.game.offerDraw()
    this.ui.toast(accepted ? copy.toasts.drawAccepted : copy.toasts.drawDeclined)
    if (accepted) await this.chain
  }

  /** Adjourns: the game is saved (the log is the save file), the envelope is drawn on the page, the board is left. */
  adjourn(): void {
    if (this.game.state !== 'playing') { this.o.onLeave?.(); return }
    this.game.save()
    this.game.pause()
    this.active = false
    this.adjourned = true
    this.select(null)
    this.ledger.line(copy.ledger.lines.adjourned)
    this.o.onLeave?.()
  }

  /** Takes back the last move pair: struck through on the roll, never erased; the board is set to the position. */
  takeBack(): void {
    if (!this.active || this.game.state !== 'playing' || this.pending > 0) return
    const before = this.game.position.history()
    const mine = before.filter((m) => m.color === this.playerColor)
    if (!mine.length) { this.ui.toast(copy.toasts.nothingToUndo); return }
    this.game.undo()
    const after = this.game.position.history()
    const struck = before.slice(after.length)
    for (const m of struck) { this.briefs.delete(m.ply); this.typed.delete(m.ply); this.heard.delete(m.ply) }
    this.rewound = false
    this.select(null)
    this.board.sync(this.game.position, capturedOf(after))
    if (struck.length) this.ledger.line(`~~${struck.map((m) => (m.color === 'w' ? `${m.moveNumber}. ${m.san}` : `${m.moveNumber}... ${m.san}`)).join('  ')}~~`)
  }

  // ───────────────────────────── Rewinding by the roll ─────────────────────────────

  /**
   * A row of the roll was clicked: the board is set to that position and the hand is held off the board;
   * clicking the last row of the live game returns. Rows of other expeditions show their position too.
   */
  rewind(row: LedgerRow): void {
    if (!row.fen || this.pending > 0) return
    const live = this.game.position.fen()
    if (row.fen === live) { this.leaveRewind(live); return }
    this.rewound = true
    this.select(null)
    const history = this.game.position.history()
    const i = history.findIndex((m) => m.fenAfter === row.fen)
    this.board.sync(new Position(row.fen), i >= 0 ? capturedOf(history, history[i].ply) : undefined)
  }

  /** Back to the live game (or to `fen`, the position a queued move starts from). */
  private leaveRewind(fen: string): void {
    if (!this.rewound) return
    this.rewound = false
    const history = this.game.position.history()
    const i = history.findIndex((m) => m.fenAfter === fen)
    const pos = fen === this.game.position.fen() ? this.game.position : new Position(fen)
    this.board.sync(pos, capturedOf(history, i >= 0 ? history[i].ply : 0))
  }

  /** True while the board shows a rewound position. */
  isRewound(): boolean {
    return this.rewound
  }

  // ───────────────────────────── Resignation by the king ─────────────────────────────

  /** Press and hold on your own king: `Hold.` at 400 ms, resignation at 1200 ms; released early, nothing is entered. */
  private bindKingHold(canvas: HTMLElement): void {
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !this.accepting()) return
      const sq = this.board.hoverSquare(e.clientX, e.clientY)
      const piece = sq ? this.game.position.get(sq) : null
      if (!piece || piece.type !== 'k' || piece.color !== this.playerColor) return
      this.cancelKingHold()
      const timers = [
        window.setTimeout(() => this.ui.toast(copy.ledger.lines.hold), RESIGN_HOLD_TYPED_MS),
        window.setTimeout(() => { this.kingHold = null; void this.resign() }, RESIGN_HOLD_MS),
      ]
      this.kingHold = { timers, x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      const h = this.kingHold
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP_PX) this.cancelKingHold()
    }
    const up = () => this.cancelKingHold()
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    this.offs.push(() => {
      canvas.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    })
  }

  private cancelKingHold(): void {
    if (!this.kingHold) return
    for (const t of this.kingHold.timers) window.clearTimeout(t)
    this.kingHold = null
  }

  // ───────────────────────────── Housekeeping ─────────────────────────────

  private reset(): void {
    this.selected = null
    this.rewound = false
    this.briefs.clear()
    this.typed.clear()
    this.heard.clear()
    this.thinkingSince = null
    this.lastThinkMs = undefined
  }

  /** Releases the bus subscriptions and the pointer listeners. */
  dispose(): void {
    this.cancelKingHold()
    for (const off of this.offs.splice(0)) off()
  }
}
