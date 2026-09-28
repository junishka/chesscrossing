// The ledger roll: one row per ply, games and crates on one roll, Vol. XIV, September 1965.
// docs/BIBLE.md §4 "The ledger" and §5.7. No three, no DOM: the roll is persisted in store.ledger.rows,
// the UI hears about new lines through the bus and through the onChange callback passed in.
import type { Color, LedgerRow, LedgerRowKind, MoveRecord, SeaState, WatchId } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { LEADER_INK_LINE, LEDGER_LEADER, earlierVolumeHeaders, ledgerHeader } from '../content/station'
import { isletName } from '../content/survey'
import { watchLabel } from '../content/watches'

/** The expedition number the Station Master's own line carries: the only entry on the roll in his hand. */
export const LEADER_INK_EXPEDITION = 1000

/** Column widths of the ruled roll, from `No.    VISITOR   THE CHAIR   ISLET            REMARK`. */
export const LEDGER_COLUMN_WIDTHS = { number: 7, visitor: 10, chair: 12, islet: 17 } as const

/** Characters from the left edge to the REMARK column. */
export const REMARK_COLUMN = LEDGER_COLUMN_WIDTHS.number + LEDGER_COLUMN_WIDTHS.visitor + LEDGER_COLUMN_WIDTHS.chair + LEDGER_COLUMN_WIDTHS.islet

/** The Second's remark for the margin is at most this long (§5.11, REMARK). */
export const REMARK_MAX_CHARS = 140

/** The rule remarks the roll types by itself (§5.7). */
export const RULE_REMARKS = {
  firstReturn: 'first return',
  check: 'flag U hoisted',
  thought: (ms: number) => `the chair thought for ${(Math.max(0, ms) / 1000).toFixed(1)} s`,
} as const

/** What a move row may be told beyond the move itself. */
export interface MoveOptions {
  /** How long the chair thought before this move; typed as `the chair thought for 1.9 s`. Ignored for the visitor's moves. */
  thinkMs?: number
  /** Captures already made this expedition; when omitted the roll counts them itself. */
  returnsSoFar?: number
  /** True when the move gave check; the move's own `isCheck` flag is honoured too. */
  checkGiven?: boolean
}

/** What the roll is given at construction. */
export interface LedgerRollOptions {
  /** Called with the live rows after every change, so main can hand them to the HUD. */
  onChange?: (rows: LedgerRow[]) => void
}

/** Result tokens the PGN may end with. */
const RESULT_TOKENS = ['1-0', '0-1', '1/2-1/2'] as const

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/** The fixed lines above the season's first row: the earlier volumes, then the three lines of the leader. */
export function leaderRows(): LedgerRow[] {
  const volumes: LedgerRow[] = earlierVolumeHeaders().map((text) => ({ kind: 'volume', text }))
  const leader: LedgerRow[] = LEDGER_LEADER.map((text, i) =>
    i === LEADER_INK_LINE ? { kind: 'leader', text, expedition: LEADER_INK_EXPEDITION } : { kind: 'leader', text })
  return [...volumes, ...leader]
}

/** True for a row that belongs to the fixed head of the roll. */
function isFixed(row: LedgerRow): boolean {
  return row.kind === 'volume' || row.kind === 'leader'
}

/**
 * The ledger roll. Rows live in `store.ledger.rows` with the leader fixed at the top; every method that types a row
 * saves the ledger and calls `onChange`. Lines and crates are also announced on the bus as `ledger:line` so the UI
 * can toast them; nothing else is emitted.
 */
export class LedgerRoll {
  /** The live rows, the same array as `store.ledger.rows`. */
  rows: LedgerRow[]
  /** Expedition currently open on the roll, null between games. */
  private open: number | null = null
  /** The side the visitor plays in the open expedition. */
  private visitor: Color = 'w'
  /** Captures the roll has seen in the open expedition. */
  private returns = 0
  private readonly onChange: (rows: LedgerRow[]) => void

  constructor(o: LedgerRollOptions = {}) {
    this.onChange = o.onChange ?? (() => {})
    this.rows = this.restore()
    this.resume()
  }

  /** Puts the leader at the head of the persisted rows, dropping any stale copy, and returns the live array. */
  private restore(): LedgerRow[] {
    const head = leaderRows()
    const existing = store.ledger.rows.filter((r) => !isFixed(r))
    const fixedAsSaved = store.ledger.rows.slice(0, head.length)
    const intact = store.ledger.rows.length >= head.length
      && head.every((h, i) => fixedAsSaved[i].kind === h.kind && fixedAsSaved[i].text === h.text && fixedAsSaved[i].expedition === h.expedition)
      && store.ledger.rows.slice(head.length).every((r) => !isFixed(r))
    if (intact) return store.ledger.rows
    store.ledger.rows = [...head, ...existing]
    store.save()
    return store.ledger.rows
  }

  /** Re-opens the last expedition when the roll was put away mid-game, so a resumed game keeps typing under it. */
  private resume(): void {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i]
      if (r.kind === 'result') return
      if (r.kind === 'header' && r.expedition !== undefined) {
        this.open = r.expedition
        this.visitor = r.color ?? 'w'
        this.returns = this.rows.slice(i).filter((m) => m.kind === 'move' && m.remark?.includes(RULE_REMARKS.firstReturn)).length
        return
      }
    }
  }

  private push(row: LedgerRow, at?: number): void {
    if (at === undefined || at >= this.rows.length) this.rows.push(row)
    else this.rows.splice(at, 0, row)
    store.save()
    this.onChange(this.rows)
  }

  /** The number of the expedition currently open, or null between games. */
  currentExpedition(): number | null {
    return this.open
  }

  /**
   * Types the header of a new expedition: `EXPEDITION 3     LONG WATCH     SEA STATE 4     14 SEPT 1965`.
   * `date` is the season day (typed through `ledgerDate`) or the label already typed. The visitor plays White
   * unless the tray was turned.
   */
  startExpedition(n: number, watch: WatchId, seaState: SeaState, date: number | string, o: { visitor?: Color } = {}): void {
    this.open = n
    this.visitor = o.visitor ?? 'w'
    this.returns = 0
    const text = typeof date === 'number'
      ? ledgerHeader(n, watchLabel(watch), seaState, date)
      : `EXPEDITION ${n}     ${watchLabel(watch)}     SEA STATE ${seaState}     ${date}`
    this.push({ kind: 'header', text, expedition: n, color: this.visitor })
  }

  /** Types one ply: number, side, move, islet of the destination, and the rule remarks. */
  move(move: MoveRecord, o: MoveOptions = {}): void {
    const isVisitor = move.color === this.visitor
    const remarks: string[] = []
    const returnsBefore = o.returnsSoFar ?? this.returns
    if (move.isCapture) {
      if (returnsBefore === 0) remarks.push(RULE_REMARKS.firstReturn)
      this.returns = returnsBefore + 1
    }
    if (move.isCheck || o.checkGiven) remarks.push(RULE_REMARKS.check)
    if (!isVisitor && o.thinkMs !== undefined) remarks.push(RULE_REMARKS.thought(o.thinkMs))
    const islet = isletName(move.to)
    const number = String(move.moveNumber).padStart(2) + (move.color === 'w' ? '.' : '...')
    const remark = remarks.length ? remarks.join(', ') : undefined
    const text = pad(number, LEDGER_COLUMN_WIDTHS.number)
      + pad(isVisitor ? move.san : '', LEDGER_COLUMN_WIDTHS.visitor)
      + pad(isVisitor ? '' : move.san, LEDGER_COLUMN_WIDTHS.chair)
      + (remark ? pad(islet, LEDGER_COLUMN_WIDTHS.islet) + remark : islet)
    const row: LedgerRow = {
      kind: 'move', text, ply: move.ply, moveNumber: move.moveNumber, color: move.color, san: move.san, islet, fen: move.fenAfter,
    }
    if (remark) row.remark = remark
    if (this.open !== null) row.expedition = this.open
    this.push(row)
  }

  /**
   * Attaches the Second's remark under a ply: lower case, no full stop, at most 140 characters, typed in the
   * REMARK column. A remark for a ply not on the roll is typed at the foot.
   */
  remark(ply: number, text: string): void {
    let clean = text.trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '')
    if (clean.length > REMARK_MAX_CHARS) clean = clean.slice(0, REMARK_MAX_CHARS).replace(/[.\s]+$/, '')
    if (clean) clean = clean[0].toLowerCase() + clean.slice(1)
    if (!clean) clean = '-'
    const row: LedgerRow = { kind: 'remark', ply, remark: clean, text: ' '.repeat(REMARK_COLUMN) + clean }
    const target = this.indexOfPly(ply)
    if (target === -1) {
      if (this.open !== null) row.expedition = this.open
      this.push(row)
      return
    }
    row.expedition = this.rows[target].expedition
    let at = target + 1
    while (at < this.rows.length && this.rows[at].kind === 'remark' && this.rows[at].ply === ply) at++
    this.push(row, at)
  }

  /** Index of the move row for a ply in the open expedition, else the last such row on the roll, else -1. */
  private indexOfPly(ply: number): number {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i]
      if (r.kind === 'move' && r.ply === ply && (this.open === null || r.expedition === this.open)) return i
      if (this.open !== null && r.kind === 'header' && r.expedition === this.open) break
    }
    return -1
  }

  private addLine(kind: 'line' | 'crate', text: string): void {
    const row: LedgerRow = { kind, text }
    if (this.open !== null) row.expedition = this.open
    this.push(row)
  }

  /** Types a line that is not a move: `Cairn c4 (Cinder Reach) read.`, `winch turned. nothing on the cable.` Emits `ledger:line`. */
  line(text: string): void {
    this.addLine('line', text)
    bus.emit('ledger:line', { text })
  }

  /** Enters a crate: `CRATE 6.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.` Emits `ledger:line`. */
  crate(text: string): void {
    this.addLine('crate', text)
    bus.emit('ledger:line', { text })
  }

  /** Types the result in the REMARK column and closes the expedition: `1/2-1/2 by repetition.`, `0-1 by resignation.` */
  result(text: string): void {
    const row: LedgerRow = { kind: 'result', text: ' '.repeat(REMARK_COLUMN) + text, remark: text }
    if (this.open !== null) row.expedition = this.open
    this.push(row)
    this.open = null
    this.returns = 0
  }

  /** Every row typed under an expedition's header, the header first. */
  rowsOf(n: number): LedgerRow[] {
    return this.rows.filter((r) => r.expedition === n && !isFixed(r))
  }

  /** `Tear off a copy`: the expedition's moves as PGN movetext, `1. e4 c5 2. Nf3`, with the result token when there is one. */
  pgnOfExpedition(n: number): string {
    const parts: string[] = []
    let result = ''
    for (const r of this.rowsOf(n)) {
      if (r.kind === 'move' && r.san) {
        if (r.color === 'w') parts.push(`${r.moveNumber}.`)
        else if (parts.length === 0) parts.push(`${r.moveNumber}...`)
        parts.push(r.san)
      } else if (r.kind === 'result' && r.remark) {
        result = RESULT_TOKENS.find((t) => r.remark!.startsWith(t)) ?? ''
      }
    }
    if (result) parts.push(result)
    return parts.join(' ')
  }

  /**
   * Hears the bus: `ledger:remark` from the Second, `ledger:line` from the season's count, the cairns and the winch.
   * Lines that begin `CRATE ` are entered as crates. Returns the hand that stops listening.
   */
  listen(): () => void {
    const offRemark = bus.on('ledger:remark', ({ ply, text }) => { this.remark(ply, text) })
    const offLine = bus.on('ledger:line', ({ text }) => {
      const last = this.rows[this.rows.length - 1]
      if (last && (last.kind === 'line' || last.kind === 'crate') && last.text === text) return
      this.addLine(text.startsWith('CRATE ') ? 'crate' : 'line', text)
    })
    return () => { offRemark(); offLine() }
  }

  /** The kinds a clicked row may rewind to: only moves carry a position. */
  static rewinds(row: LedgerRow): boolean {
    return row.kind === 'move' && row.fen !== undefined
  }
}

/** The kinds that are typed on the Olivetti; the ink line and the volumes are not. */
export const TYPED_KINDS: readonly LedgerRowKind[] = ['header', 'move', 'remark', 'line', 'crate', 'result']
