// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createCaption } from './caption'
import { createDossierCard, isPencilLine, ruledLineCount } from './dossier'
import { INK, PAPER, frame } from './index'
import { GRAIN_FILTER_ID, applyPaper, createPaper, ensureGrainFilter } from './paper'
import { createRule } from './rule'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('constants', () => {
  it('names ink and paper', () => {
    expect(INK).toBe('#202834')
    expect(PAPER).toBe('#F5F2EB')
  })
  it('implements the contract object', () => {
    expect(typeof frame.createStage).toBe('function')
    expect(typeof frame.createCaption).toBe('function')
    expect(typeof frame.createDossierCard).toBe('function')
    expect(typeof frame.typewrite).toBe('function')
    expect(typeof frame.createRule).toBe('function')
  })
})

describe('createCaption', () => {
  it('is a caption in the caption style with its hook', () => {
    const el = createCaption('1-03a. Hook, east, brass. R. To remain.')
    expect(el.hasAttribute('data-caption')).toBe(true)
    expect(el.classList.contains('t-caption')).toBe(true)
    expect(el.textContent).toBe('1-03a. Hook, east, brass. R. To remain.')
  })
})

describe('createRule', () => {
  it('is a hairline rule hidden from readers', () => {
    const el = createRule()
    expect(el.tagName).toBe('HR')
    expect(el.classList.contains('rule')).toBe(true)
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('paper', () => {
  it('defines the grain filter once with baseFrequency 0.9 and 2 octaves', () => {
    const a = ensureGrainFilter()
    const b = ensureGrainFilter()
    expect(a).toBe(b)
    expect(document.querySelectorAll(`#${GRAIN_FILTER_ID}`).length).toBe(1)
    const t = document.querySelector(`#${GRAIN_FILTER_ID} feTurbulence`)
    expect(t?.getAttribute('baseFrequency')).toBe('0.9')
    expect(t?.getAttribute('numOctaves')).toBe('2')
    expect(t?.getAttribute('type')).toBe('fractalNoise')
  })
  it('applies the paper class', () => {
    const el = createPaper()
    expect(el.classList.contains('paper')).toBe(true)
    const p = applyPaper(document.createElement('section'))
    expect(p.hasAttribute('data-paper')).toBe(true)
  })
})

describe('createDossierCard', () => {
  const title = 'White Bishops, c1 and f1. "Seal."'
  const lines = ['Boxwood, 78 mm. The die slot on the king’s bishop is cut 2 mm deeper. Nobody knows why.', 'In pencil: the maker did.']

  it('is a paper card with its hook, title, body and pencil line', () => {
    const card = createDossierCard(title, lines, { roster: { left: 'MARLE CHESS CLUB. ROSTER.', right: '6-09. 5 of 32.' } })
    expect(card.hasAttribute('data-dossier')).toBe(true)
    expect(card.classList.contains('paper')).toBe(true)
    expect(card.classList.contains('dossier')).toBe(true)
    expect(card.getAttribute('aria-label')).toBe(title)
    expect(card.querySelector('[data-dossier-title]')?.textContent).toBe(title)
    const body = card.querySelectorAll('.t-dossier-body')
    expect(body.length).toBe(2)
    expect(body[0]?.textContent).toBe(lines[0])
    expect(body[0]?.classList.contains('pencil')).toBe(false)
    expect(body[1]?.classList.contains('pencil')).toBe(true)
    expect(body[1]?.hasAttribute('data-dossier-pencil')).toBe(true)
    expect(card.querySelector('[data-dossier-roster="left"]')?.textContent).toBe('MARLE CHESS CLUB. ROSTER.')
    expect(card.querySelector('[data-dossier-roster="right"]')?.textContent).toBe('6-09. 5 of 32.')
    expect(card.querySelector('[data-dossier-head-rule]')).not.toBeNull()
    expect(card.querySelectorAll('.dossier-rule.card-rule').length).toBe(ruledLineCount())
    expect(ruledLineCount()).toBe(9)
  })

  it('a face-down card has the roster line and rules only', () => {
    const card = createDossierCard(title, lines, { faceDown: true, roster: { left: 'MARLE CHESS CLUB. ROSTER.', right: '6-09.' } })
    expect(card.getAttribute('data-dossier-face')).toBe('down')
    expect(card.querySelector('[data-dossier-title]')).toBeNull()
    expect(card.querySelectorAll('.t-dossier-body').length).toBe(0)
    expect(card.querySelectorAll('.dossier-rule').length).toBe(ruledLineCount())
    expect(card.querySelector('[data-dossier-roster="left"]')).not.toBeNull()
  })

  it('without a roster it invents no words', () => {
    const card = createDossierCard(title, lines)
    expect(card.querySelector('.dossier-roster')).toBeNull()
    expect(card.textContent).toBe(title + lines.join(''))
  })

  it('recognises pencil lines by the bible’s introduction', () => {
    expect(isPencilLine('In pencil: Mr Halm says it was.')).toBe(true)
    expect(isPencilLine('Mated 211 times as of this card; 340 in pencil.')).toBe(false)
  })
})
