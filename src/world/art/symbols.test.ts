// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ROOM_1_OBJECTS } from '../data/room1'
import { SYMBOL_IDS, drawFloor, drawSymbol, pathSymbol } from './symbols'

const HEX = /#[0-9a-fA-F]{3,8}\b/

describe('symbols', () => {
  it('draws every symbol the room names, in tokens only, without gradients', () => {
    for (const id of SYMBOL_IDS) {
      const svg = drawSymbol(id, { w: 100, h: 200 })
      expect(svg.tagName.toLowerCase()).toBe('svg')
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 200')
      const html = svg.outerHTML
      expect(html, id).not.toMatch(HEX)
      expect(html, id).not.toMatch(/gradient/i)
      expect(html, id).not.toMatch(/<text/i)
    }
  })

  it('outlines every filled shape at 1 rpx and gives each object one shadow line', () => {
    for (const o of ROOM_1_OBJECTS) {
      if (!o.symbol || o.symbol === 'path' || o.symbol === 'hours-card') continue
      const svg = drawSymbol(o.symbol, { w: (o.rect.w / 100) * 1600, h: (o.rect.h / 100) * 900 })
      const shapes = Array.from(svg.querySelectorAll('rect, polygon, circle, ellipse')).filter((el) => (el as SVGElement).style.stroke !== 'none')
      expect(shapes.length, o.id).toBeGreaterThan(0)
      for (const el of shapes) {
        expect((el as SVGElement).style.stroke, o.id).toBe('var(--c-ink)')
        expect((el as SVGElement).style.strokeWidth, o.id).toBe('1')
      }
      expect(svg.querySelectorAll('[data-part="shadow"]').length, o.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('nails the deck door fourteen times, in two columns of seven', () => {
    const svg = drawSymbol('door-nailed', { w: 22.4, h: 558 })
    const nails = Array.from(svg.querySelectorAll('[data-part="nail"]'))
    expect(nails).toHaveLength(14)
    const xs = new Set(nails.map((n) => n.getAttribute('cx')))
    expect(xs.size).toBe(2)
    expect(svg.querySelector('[data-part="knob"]')).toBeNull()
  })

  it('gives the panelled doors four panels, a knob, and an escutcheon only where a key is named', () => {
    const locked = drawSymbol('door-escutcheon', { w: 78.4, h: 558 })
    expect(locked.querySelectorAll('[data-part="panel"]')).toHaveLength(4)
    expect(locked.querySelector('[data-part="knob"]')).not.toBeNull()
    expect(locked.querySelector('[data-part="escutcheon"]')).not.toBeNull()
    const closed = drawSymbol('door-plain', { w: 78.4, h: 558 })
    expect(closed.querySelectorAll('[data-part="panel"]')).toHaveLength(4)
    expect(closed.querySelector('[data-part="knob"]')).not.toBeNull()
    expect(closed.querySelector('[data-part="escutcheon"]')).toBeNull()
  })

  it('shows the bridge with eleven arches, grass, six panes and one crack in the window', () => {
    const svg = drawSymbol('window', { w: 56, h: 252 })
    expect(svg.querySelector('[data-part="arches"]')?.getAttribute('data-arches')).toBe('11')
    expect(svg.querySelectorAll('[data-part="grass"]').length).toBeGreaterThan(5)
    expect(svg.querySelectorAll('[data-part="muntin"]')).toHaveLength(3)
    expect(svg.querySelectorAll('[data-part="crack"]')).toHaveLength(1)
    expect((svg.querySelector('[data-part="night"]') as SVGElement).style.fill).toBe('var(--c-ink)')
  })

  it('buttons the greatcoat eleven times and leaves the twelfth position', () => {
    const svg = drawSymbol('greatcoat', { w: 22.4, h: 522 })
    expect(svg.querySelectorAll('[data-part="button"]')).toHaveLength(11)
    expect(svg.querySelectorAll('[data-part="button-missing"]')).toHaveLength(1)
    expect((svg.querySelector('[data-part="coat"]') as SVGElement).style.fill).toBe('var(--c-wall)')
  })

  it('fixes the clocks at 21.20 and 21.08', () => {
    const left = drawSymbol('clock-left', { w: 134.4, h: 135 })
    const right = drawSymbol('clock-right', { w: 134.4, h: 135 })
    expect(left.querySelector('[data-part="hand-hour"]')?.getAttribute('data-time')).toBe('21.20')
    expect(right.querySelector('[data-part="hand-hour"]')?.getAttribute('data-time')).toBe('21.08')
    expect((left.querySelector('[data-part="face"]') as SVGElement).style.fill).toBe('var(--c-light)')
    expect((left.querySelector('[data-part="hand-minute"]') as SVGElement).style.stroke).toBe('var(--c-ink)')
  })

  it('gives the stove a Seal Wax grate and the cabinet four drawers', () => {
    const stove = drawSymbol('stove', { w: 56, h: 180 })
    expect((stove.querySelector('[data-part="grate"]') as SVGElement).style.fill).toBe('var(--c-wax)')
    const cabinet = drawSymbol('cabinet', { w: 96, h: 216 })
    expect(cabinet.querySelectorAll('[data-part="drawer"]')).toHaveLength(4)
    expect((cabinet.querySelector('[data-part="body"]') as SVGElement).style.fill).toBe('var(--c-wall)')
  })

  it('draws the desk with a brass rail and the declarations line, and Mr Halm with a Boxwood head', () => {
    const desk = drawSymbol('desk', { w: 448, h: 162 })
    expect((desk.querySelector('[data-part="rail"]') as SVGElement).style.fill).toBe('var(--c-light)')
    expect((desk.querySelector('[data-part="declarations-line"]') as SVGElement).style.stroke).toBe('var(--c-light)')
    const halm = drawSymbol('halm', { w: 128, h: 180 })
    expect((halm.querySelector('[data-part="head"]') as SVGElement).style.fill).toBe('var(--c-light)')
    expect(halm.querySelectorAll('[data-part="hand"]')).toHaveLength(2)
    expect(halm.querySelector('[data-part="eye"], [data-part="mouth"]')).toBeNull()
  })

  it('draws the trap with a ring and padlock, the path as wear, and the floor with joints', () => {
    const trap = drawSymbol('trap', { w: 96, h: 54 })
    expect(trap.querySelector('[data-part="ring"]')).not.toBeNull()
    expect(trap.querySelector('[data-part="padlock"]')).not.toBeNull()
    const path = pathSymbol(document, { w: 504, h: 72 }, [[440, 0], [504, 0], [64, 72], [0, 72]])
    const wear = path.querySelector('[data-wear]') as SVGElement
    expect(wear.style.fill).toBe('var(--c-light)')
    expect(wear.style.fillOpacity).toBe('var(--tint-wear)')
    const floor = drawFloor({ w: 1120, h: 216 }, 27)
    expect(floor.querySelectorAll('[data-part="joint"]')).toHaveLength(7)
    expect(floor.querySelector('[data-part="skirting"]')).not.toBeNull()
  })
})
