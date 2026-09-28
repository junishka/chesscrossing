/**
 * Paper: a Boxwood ground with the grain of docs/visual.md section 1.7.
 * SVG feTurbulence, baseFrequency 0.9, 2 octaves, at 4 per cent opacity,
 * on the page and index cards only. The filter is defined once per document
 * and referenced by the .paper class in base.css.
 */

export const GRAIN_FILTER_ID = 'frame-grain'
export const GRAIN_BASE_FREQUENCY = 0.9
export const GRAIN_OCTAVES = 2
export const GRAIN_OPACITY = 0.04

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Makes sure the grain filter exists in the document. Appends a hidden SVG
 * with the filter definition to `host` (default: document.body) once.
 */
export function ensureGrainFilter(host?: HTMLElement): SVGSVGElement {
  const doc = host?.ownerDocument ?? document
  const existing = doc.getElementById(GRAIN_FILTER_ID)
  if (existing) {
    const owner = existing.closest('svg')
    if (owner) return owner as SVGSVGElement
  }

  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'frame-grain-defs')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')

  const defs = doc.createElementNS(SVG_NS, 'defs')
  const filter = doc.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', GRAIN_FILTER_ID)
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  filter.setAttribute('filterUnits', 'objectBoundingBox')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  const turbulence = doc.createElementNS(SVG_NS, 'feTurbulence')
  turbulence.setAttribute('type', 'fractalNoise')
  turbulence.setAttribute('baseFrequency', String(GRAIN_BASE_FREQUENCY))
  turbulence.setAttribute('numOctaves', String(GRAIN_OCTAVES))
  turbulence.setAttribute('seed', '7')
  turbulence.setAttribute('stitchTiles', 'stitch')
  turbulence.setAttribute('result', 'noise')

  // Grey grain, fully opaque within the filter region: the ink-and-paper
  // tint comes from the element's opacity (4 per cent), not from colour.
  const matrix = doc.createElementNS(SVG_NS, 'feColorMatrix')
  matrix.setAttribute('in', 'noise')
  matrix.setAttribute('type', 'matrix')
  matrix.setAttribute(
    'values',
    '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1',
  )

  filter.appendChild(turbulence)
  filter.appendChild(matrix)
  defs.appendChild(filter)
  svg.appendChild(defs)
  ;(host ?? doc.body).appendChild(svg)
  return svg
}

/** Gives an element the paper surface: Boxwood ground and grain. Returns the element. */
export function applyPaper<T extends HTMLElement>(el: T): T {
  ensureGrainFilter()
  el.classList.add('paper')
  el.setAttribute('data-paper', '')
  return el
}

/** A new paper surface: a div with Boxwood ground and grain. */
export function createPaper(tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  return applyPaper(document.createElement(tag))
}
