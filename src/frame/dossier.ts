/**
 * The dossier card, item 6-09. docs/visual.md section 8.
 * 400 by 240 rpx, Boxwood with grain, hairline frame, a 1-rpx Seal Wax head
 * rule 22 rpx below the top, ruled lines beneath in Iron Gall at 12 per cent
 * every 1.25rem. Roster line above the rule, left and right. Then the title,
 * then the body. Pencil additions in italic at 70 per cent on their own line.
 * Appears in 160 ms, translateY 6 rpx to 0. Dismiss cuts (the caller removes it).
 */
import { applyPaper } from './paper'

export const DOSSIER_W_RPX = 400
export const DOSSIER_H_RPX = 240
export const DOSSIER_HEAD_RULE_RPX = 22
export const DOSSIER_RULE_STEP_REM = 1.25
/** rpx per rem: the stage is 900 rpx tall and 1rem is 1/50 of it. */
export const RPX_PER_REM = 18
/** The bible introduces pencil additions with these words. */
export const PENCIL_PREFIX = 'In pencil:'

export interface DossierOptions {
  /** The roster line above the head rule: left text and right text, from the world. */
  roster?: { left: string; right: string }
  /** A captured piece's card: the same card, blank, ruled, roster line only. */
  faceDown?: boolean
}

/** How many ruled lines fit below the head rule. */
export function ruledLineCount(): number {
  const step = DOSSIER_RULE_STEP_REM * RPX_PER_REM
  return Math.floor((DOSSIER_H_RPX - DOSSIER_HEAD_RULE_RPX) / step)
}

export function isPencilLine(line: string): boolean {
  return line.startsWith(PENCIL_PREFIX)
}

export function createDossierCard(title: string, lines: readonly string[], options: DossierOptions = {}): HTMLElement {
  const doc = document
  const card = applyPaper(doc.createElement('article'))
  card.classList.add('dossier')
  card.setAttribute('data-dossier', '')
  card.setAttribute('data-dossier-face', options.faceDown ? 'down' : 'up')
  card.setAttribute('role', 'group')
  card.setAttribute('aria-label', options.faceDown ? (options.roster?.left ?? title) : title)

  if (options.roster) {
    const roster = doc.createElement('div')
    roster.className = 'dossier-roster'
    const left = doc.createElement('span')
    left.className = 't-roster'
    left.setAttribute('data-dossier-roster', 'left')
    left.textContent = options.roster.left
    const right = doc.createElement('span')
    right.className = 't-roster'
    right.setAttribute('data-dossier-roster', 'right')
    right.textContent = options.roster.right
    roster.append(left, right)
    card.appendChild(roster)
  }

  const head = doc.createElement('div')
  head.className = 'dossier-head-rule'
  head.setAttribute('data-dossier-head-rule', '')
  card.appendChild(head)

  const count = ruledLineCount()
  for (let i = 1; i <= count; i++) {
    const rule = doc.createElement('div')
    rule.className = 'dossier-rule card-rule'
    rule.style.top = `calc(${DOSSIER_HEAD_RULE_RPX} * var(--rpx) + ${i * DOSSIER_RULE_STEP_REM}rem)`
    card.appendChild(rule)
  }

  if (!options.faceDown) {
    const text = doc.createElement('div')
    text.className = 'dossier-text'
    const h = doc.createElement('p')
    h.className = 't-dossier-title'
    h.setAttribute('data-dossier-title', '')
    h.textContent = title
    text.appendChild(h)
    for (const line of lines) {
      const p = doc.createElement('p')
      p.className = 't-dossier-body'
      if (isPencilLine(line)) {
        p.classList.add('pencil')
        p.setAttribute('data-dossier-pencil', '')
      }
      p.textContent = line
      text.appendChild(p)
    }
    card.appendChild(text)
  }

  return card
}
