// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { PIECE_KEYS } from '../contracts/chess'
import { PIECE_HEIGHT, createPieceElement, pieceGeometry, pieceKeyOf, variantFor } from './pieces'

describe('piece geometry', () => {
  it('has the table heights', () => {
    expect(PIECE_HEIGHT).toEqual({ k: 0.88, q: 0.83, b: 0.76, n: 0.73, r: 0.71, p: 0.56 })
  })

  it('gives every key a body and marks, and turned pieces a base disc', () => {
    for (const key of PIECE_KEYS) {
      const g = pieceGeometry(key)
      expect(g.body.length).toBeGreaterThan(0)
      if (key[1] !== 'P') {
        const disc = g.body[0]
        expect(disc?.tag).toBe('ellipse')
        expect(disc?.attrs).toEqual({ cx: 50, cy: 97, rx: 23, ry: 3 })
      } else {
        expect(g.body.some((s) => s.tag === 'ellipse')).toBe(false)
      }
    }
  })

  it('tells the black variants by shape', () => {
    const wk = pieceGeometry('wK')
    const bk = pieceGeometry('bK')
    expect(wk.marks.length).toBe(1) // the rim line
    expect(bk.marks.length).toBe(0) // tin shade, no rim
    expect(String(bk.body[3]?.attrs.points)).toContain('51.5,18') // the 3-unit hole

    const wq = pieceGeometry('wQ')
    const bq = pieceGeometry('bQ')
    expect(wq.body.some((s) => s.attrs.transform !== undefined)).toBe(false)
    expect(bq.body.filter((s) => s.attrs.transform === 'rotate(60 67 46)').length).toBe(2)

    const wb = pieceGeometry('wB')
    const bb = pieceGeometry('bB')
    expect(wb.body.some((s) => s.tag === 'circle' && s.attrs.r === 15)).toBe(true)
    expect(bb.body.some((s) => s.tag === 'rect' && s.attrs.width === 28 && s.attrs.rx === 2)).toBe(true)
    expect(bb.marks[0]?.attrs).toMatchObject({ width: 8, height: 8 })

    const wr = pieceGeometry('wR')
    const br = pieceGeometry('bR')
    expect(wr.body.some((s) => s.tag === 'rect' && s.attrs.width === 40 && s.attrs.height === 5)).toBe(true)
    expect(br.body.some((s) => s.tag === 'polygon')).toBe(true)
    expect(wr.marks[0]?.attrs.x).toBe(52)
    expect(br.marks[0]?.attrs.x).toBe(46)
  })

  it('marks the stones V and H and notches black Stone 7', () => {
    expect(pieceGeometry('wP').marks[0]?.tag).toBe('polyline')
    expect(pieceGeometry('bP').marks.length).toBe(3)
    const plain = pieceGeometry('bP').body[0]?.attrs.d as string
    const notched = pieceGeometry('bP', 'notch').body[0]?.attrs.d as string
    expect(plain).not.toBe(notched)
    expect(notched).toContain('H55 V10')
  })

  it('draws the pearwood knight shorter, thicker and round-eared', () => {
    const boxwood = pieceGeometry('wN').body[1]?.attrs.d as string
    const pear = pieceGeometry('wN', 'pearwood').body[1]?.attrs.d as string
    expect(boxwood).toContain('L49,22')
    expect(pear).toContain('Q49,25')
    expect(pear.startsWith('M28,94')).toBe(true)
    expect(boxwood.startsWith('M30,94')).toBe(true)
    expect(pieceGeometry('bN')).toEqual(pieceGeometry('wN'))
  })

  it('knows the two singular pieces by their home squares', () => {
    expect(variantFor('wN', 'b1')).toBe('pearwood')
    expect(variantFor('wN', 'g1')).toBe('standard')
    expect(variantFor('bP', 'g7')).toBe('notch')
    expect(variantFor('wP', 'd2')).toBe('standard')
  })
})

describe('createPieceElement', () => {
  it('carries its hooks, label and stroke width', () => {
    const el = createPieceElement('wK', { label: 'White King, e1. "The Lamp."', square: 'e1', boxRpx: 52.8 })
    expect(el.tagName.toLowerCase()).toBe('svg')
    expect(el.getAttribute('viewBox')).toBe('0 0 100 100')
    expect(el.getAttribute('data-piece')).toBe('wK')
    expect(el.getAttribute('data-square')).toBe('e1')
    expect(el.getAttribute('aria-label')).toBe('White King, e1. "The Lamp."')
    expect(el.getAttribute('data-piece-color')).toBe('w')
    expect(el.getAttribute('data-piece-type')).toBe('k')
    expect(el.style.getPropertyValue('--sw')).toBe('1.89')
    expect(el.querySelector('.piece-body')?.children.length).toBeGreaterThan(0)
    expect(el.querySelector('.piece-marks')).not.toBeNull()
    expect(pieceKeyOf(el)).toBe('wK')
  })

  it('names the variant when there is one', () => {
    const el = createPieceElement('bP', { label: 'Black Pawns', square: 'g7', variant: 'notch', boxRpx: 33.6 })
    expect(el.getAttribute('data-piece-variant')).toBe('notch')
    const plain = createPieceElement('bP', { label: 'Black Pawns', boxRpx: 33.6 })
    expect(plain.hasAttribute('data-piece-variant')).toBe(false)
    expect(plain.hasAttribute('data-square')).toBe(false)
  })
})
