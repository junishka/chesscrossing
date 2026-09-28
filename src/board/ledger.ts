/**
 * The Record of Play, docs/visual.md section 9 and docs/bible.md section 9.
 * Heads No. | Time | Direction | Article | Remarks. One row per half-move,
 * typed at the ledger rate, columns left to right with 120 ms between,
 * every lower-case e faint. A capture is remarked "Detained." and stamped.
 */
import type { Color, GameResult, MoveRecord, PieceType } from '../contracts/chess'
import { LEDGER_MS_PER_CHAR, typewrite, wait } from '../frame'
import { scoreText, stripSanSuffix } from './game'

export const COLUMN_GAP_MS = 120
export const STAMP_HOLD_MS = 300
export const EM_DASH = '—'

/** The bible's words for the Remarks column. */
export const REMARK_DETAINED = 'Detained.'
export const REMARK_CHECK = 'Check.'
export const REMARK_REENTERED = 'Re-entered as'
export const STAMP_TEXT = 'DETAINED'
export const LEDGER_TITLE = 'RECORD OF PLAY. ENTRIES:'

export const COLUMN_HEADS = ['No.', 'Time', 'Direction', 'Article', 'Remarks'] as const
export const COLUMN_WIDTHS = [0.09, 0.11, 0.1, 0.22, 0.48] as const

/** The set's names for the pieces a pawn may re-enter as. */
export const PIECE_NAMES_FOR_PROMOTION: Readonly<Record<PieceType, string>> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
}

export type CellName = 'no' | 'time' | 'direction' | 'article' | 'remarks' | 'result'

/** The remarks a half-move earns, in the order they are typed. */
export function remarksFor(record: MoveRecord): string[] {
  const out: string[] = []
  if (record.captured) out.push(REMARK_DETAINED)
  if (record.promotion) out.push(`${REMARK_REENTERED} ${PIECE_NAMES_FOR_PROMOTION[record.promotion]}.`)
  if (record.check) out.push(REMARK_CHECK)
  return out
}

export interface LedgerOptions {
  opponentLines: { please: string; thankYou: string; thankYouHelder: string }
  ledgerDate: (date: Date) => string
  /** Called when "Detained." has finished typing, before the stamp. The sound. */
  onDetained?: () => void
  /** The clock for the stamp's date. Default: now. */
  now?: () => Date
}

export interface Ledger {
  readonly el: HTMLElement
  /** Empties the record. Rows still typing are abandoned. */
  reset(): void
  /** The start row: Mr Halm's "Please." in Remarks. Resolves when typed. */
  addStart(): Promise<void>
  /** One half-move. Resolves when the row has typed. */
  addMove(record: MoveRecord): Promise<void>
  /** The result row, then his thank-you row or rows. Resolves when typed. */
  addResult(result: GameResult, playerColor: Color): Promise<void>
  /** Half-move rows entered so far (the head's count). */
  entries(): number
  /** Resolves when everything queued so far has typed. */
  idle(): Promise<void>
  destroy(): void
}

const TYPE_OPTIONS = { msPerChar: LEDGER_MS_PER_CHAR, faintE: true }

export function createLedger(container: HTMLElement, options: LedgerOptions): Ledger {
  const doc = container.ownerDocument
  const now = options.now ?? (() => new Date())

  const root = doc.createElement('section')
  root.className = 'ledger'
  root.setAttribute('data-ledger', '')

  const head = doc.createElement('h2')
  head.className = 'ledger-head t-page-head'
  head.setAttribute('data-ledger-head', '')
  head.append(doc.createTextNode(`${LEDGER_TITLE} `))
  const count = doc.createElement('span')
  count.setAttribute('data-ledger-count', '')
  count.textContent = '0'
  head.append(count, doc.createTextNode('.'))

  const columns = doc.createElement('div')
  columns.className = 'ledger-columns'
  columns.setAttribute('data-ledger-columns', '')
  const names: CellName[] = ['no', 'time', 'direction', 'article', 'remarks']
  COLUMN_HEADS.forEach((label, i) => {
    const h = doc.createElement('div')
    h.className = 'ledger-cell t-column-head'
    h.setAttribute('data-ledger-column', names[i] as string)
    h.textContent = label
    columns.appendChild(h)
  })
  const rule = doc.createElement('hr')
  rule.className = 'rule'
  rule.setAttribute('aria-hidden', 'true')

  const rows = doc.createElement('div')
  rows.className = 'ledger-rows'
  rows.setAttribute('data-ledger-rows', '')
  rows.setAttribute('role', 'log')
  rows.setAttribute('aria-live', 'polite')

  root.append(head, columns, rule, rows)
  container.appendChild(root)

  let entries = 0
  let generation = 0
  let queue: Promise<void> = Promise.resolve()

  const setCount = (n: number): void => {
    count.textContent = String(n)
  }

  const toBottom = (): void => {
    rows.scrollTop = rows.scrollHeight
  }

  function makeRow(kind: string): { row: HTMLElement; cell: (name: CellName) => HTMLElement } {
    const row = doc.createElement('div')
    row.className = 'ledger-row'
    row.setAttribute('data-ledger-row', kind)
    const cells = new Map<CellName, HTMLElement>()
    const make = (name: CellName): HTMLElement => {
      const c = doc.createElement('div')
      c.className = 'ledger-cell t-ledger'
      c.setAttribute('data-ledger-cell', name)
      row.appendChild(c)
      cells.set(name, c)
      return c
    }
    return { row, cell: (name) => cells.get(name) ?? make(name) }
  }

  function enqueue(job: (gen: number) => Promise<void>): Promise<void> {
    const gen = generation
    const run = queue.then(async () => {
      if (gen !== generation) return
      await job(gen)
    })
    queue = run.catch(() => undefined)
    return run
  }

  async function typeCells(gen: number, cells: { el: HTMLElement; text: string }[]): Promise<void> {
    let first = true
    for (const { el, text } of cells) {
      if (gen !== generation) return
      if (!first) await wait(COLUMN_GAP_MS)
      first = false
      if (gen !== generation) return
      await typewrite(el, text, TYPE_OPTIONS)
      toBottom()
    }
  }

  function stamp(): HTMLElement {
    const s = doc.createElement('span')
    s.className = 'ledger-stamp'
    s.setAttribute('data-ledger-stamp', '')
    s.setAttribute('aria-hidden', 'true')
    const word = doc.createElement('span')
    word.className = 't-stamp'
    word.textContent = STAMP_TEXT
    const date = doc.createElement('span')
    date.className = 't-stamp-date'
    date.setAttribute('data-ledger-stamp-date', '')
    date.textContent = options.ledgerDate(now())
    s.append(word, date)
    return s
  }

  async function typeRemarks(gen: number, cell: HTMLElement, remarks: string[]): Promise<void> {
    if (remarks.length === 0) return
    const [first, ...rest] = remarks
    if (first === REMARK_DETAINED) {
      await typewrite(cell, first, TYPE_OPTIONS)
      if (gen !== generation) return
      options.onDetained?.()
      await wait(STAMP_HOLD_MS)
      if (gen !== generation) return
      cell.appendChild(stamp())
      toBottom()
      if (rest.length) await typewrite(cell, ` ${rest.join(' ')}`, { ...TYPE_OPTIONS, append: true })
    } else {
      await typewrite(cell, remarks.join(' '), TYPE_OPTIONS)
    }
    toBottom()
  }

  return {
    el: root,
    reset() {
      generation++
      queue = Promise.resolve()
      rows.textContent = ''
      entries = 0
      setCount(0)
    },
    addStart() {
      return enqueue(async (gen) => {
        const { row, cell } = makeRow('start')
        const timeEl = cell('time')
        const remarksEl = cell('remarks')
        cell('no')
        cell('direction')
        cell('article')
        row.setAttribute('data-ledger-remark', options.opponentLines.please)
        rows.appendChild(row)
        toBottom()
        await typeCells(gen, [
          { el: timeEl, text: EM_DASH },
          { el: remarksEl, text: options.opponentLines.please },
        ])
      })
    },
    addMove(record) {
      return enqueue(async (gen) => {
        const { row, cell } = makeRow('move')
        row.setAttribute('data-ledger-ply', String(record.moveNumber * 2 - (record.color === 'w' ? 1 : 0)))
        row.setAttribute('data-ledger-uci', record.uci)
        const remarks = remarksFor(record)
        if (remarks.length) row.setAttribute('data-ledger-remark', remarks.join(' '))
        const noEl = cell('no')
        const timeEl = cell('time')
        const dirEl = cell('direction')
        const artEl = cell('article')
        const remEl = cell('remarks')
        rows.appendChild(row)
        entries++
        setCount(entries)
        toBottom()
        await typeCells(gen, [
          { el: noEl, text: record.color === 'w' ? String(record.moveNumber) : '' },
          { el: timeEl, text: EM_DASH },
          { el: dirEl, text: record.color === 'w' ? 'W' : 'E' },
          { el: artEl, text: stripSanSuffix(record.san) },
        ])
        if (gen !== generation) return
        if (remarks.length) {
          await wait(COLUMN_GAP_MS)
          if (gen !== generation) return
          await typeRemarks(gen, remEl, remarks)
        }
      })
    },
    addResult(result, playerColor) {
      const heLost = result.winner !== undefined && result.winner === playerColor
      const resultJob = enqueue(async (gen) => {
        const { row, cell } = makeRow('result')
        row.setAttribute('data-ledger-result', scoreText(result))
        cell('no')
        const timeEl = cell('time')
        cell('direction')
        const resultEl = cell('result')
        rows.appendChild(row)
        toBottom()
        await typeCells(gen, [
          { el: timeEl, text: EM_DASH },
          { el: resultEl, text: `${scoreText(result)}. ${options.ledgerDate(now())}.` },
        ])
      })
      const words = heLost
        ? [options.opponentLines.thankYouHelder, options.opponentLines.thankYou]
        : [options.opponentLines.thankYou]
      let last = resultJob
      for (const word of words) {
        last = enqueue(async (gen) => {
          const { row, cell } = makeRow('word')
          row.setAttribute('data-ledger-remark', word)
          cell('no')
          const timeEl = cell('time')
          cell('direction')
          cell('article')
          const remEl = cell('remarks')
          rows.appendChild(row)
          toBottom()
          await typeCells(gen, [
            { el: timeEl, text: EM_DASH },
            { el: remEl, text: word },
          ])
        })
      }
      return last
    },
    entries() {
      return entries
    },
    idle() {
      return queue
    },
    destroy() {
      generation++
      root.remove()
    },
  }
}
