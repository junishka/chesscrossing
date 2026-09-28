// Procedural textures and memoized materials. Everything is painted onto canvases at runtime.
import * as THREE from 'three'
import { FONT_MONO, FONT_SANS } from '../core/fonts'
import { ui } from '../content/palette'

// ───────────────────────────── Random ─────────────────────────────

/** Hashes a string into a 32-bit seed (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** Deterministic PRNG (mulberry32) seeded from a string; returns numbers in [0, 1). */
export function seeded(seed: string): () => number {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────────── Noise ─────────────────────────────

/** Tileable value noise over a 256-cell lattice, seeded. */
class Noise {
  private perm = new Uint8Array(512)
  private grad = new Float32Array(256)

  constructor(seed: string) {
    const rnd = seeded(seed)
    const p = Array.from({ length: 256 }, (_, i) => i)
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
    for (let i = 0; i < 256; i++) this.grad[i] = rnd()
  }

  private lattice(x: number, y: number, mx: number, my: number): number {
    return this.grad[this.perm[(x & mx) + this.perm[y & my]]]
  }

  /**
   * Smooth value noise in [0, 1]. `px`/`py` are the periods in lattice units (powers of two,
   * default 256): sampling over exactly one period yields a seamlessly tileable texture.
   */
  at(x: number, y: number, px = 256, py = 256): number {
    const xi = Math.floor(x), yi = Math.floor(y)
    const fx = x - xi, fy = y - yi
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    const mx = px - 1, my = py - 1
    const a = this.lattice(xi, yi, mx, my), b = this.lattice(xi + 1, yi, mx, my)
    const c = this.lattice(xi, yi + 1, mx, my), d = this.lattice(xi + 1, yi + 1, mx, my)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }

  /** Fractal sum of `octaves` noise layers, in [0, 1]; every octave keeps the same period. */
  fbm(x: number, y: number, octaves = 4, gain = 0.5, px = 256, py = 256): number {
    let sum = 0, amp = 1, norm = 0, fx = x, fy = y
    for (let i = 0; i < octaves; i++) {
      sum += this.at(fx, fy, px, py) * amp
      norm += amp
      amp *= gain
      fx *= 2; fy *= 2
    }
    return sum / norm
  }

  /** Tileable fbm over the unit square: (u, v) in [0, 1) with `px` × `py` lattice cells per tile. */
  tile(u: number, v: number, px: number, py: number, octaves = 4, gain = 0.5): number {
    return this.fbm(u * px, v * py, octaves, gain, px, py)
  }
}

// ───────────────────────────── Colour helpers ─────────────────────────────

type Rgb = [number, number, number]

/** CSS colour → sRGB bytes (three would otherwise hand back linear components). */
function parse(color: string): Rgb {
  const c = new THREE.Color(color).getRGB(new THREE.Color(), THREE.SRGBColorSpace)
  return [c.r * 255, c.g * 255, c.b * 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function scale(a: Rgb, k: number): Rgb {
  return [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)]
}

function css(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`
}

// ───────────────────────────── Canvas helpers ─────────────────────────────

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

/** Wraps a canvas in a CanvasTexture with the house defaults (sRGB, anisotropy 4, repeat). */
function toTexture(canvas: HTMLCanvasElement, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  tex.needsUpdate = true
  return tex
}

/** Paints a per-pixel function into a canvas of `size`². */
function paintPixels(size: number, fn: (x: number, y: number) => Rgb): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size)
  const img = ctx.createImageData(size, size)
  const d = img.data
  let i = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x, y)
      d[i++] = c[0]; d[i++] = c[1]; d[i++] = c[2]; d[i++] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** A short stroke that wraps around the canvas edges (for tileable fibres and fuzz). */
function wrappedStroke(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, x2: number, y2: number): void {
  const m = 12
  const xs = x < m ? [0, w] : x > w - m ? [0, -w] : [0]
  const ys = y < m ? [0, h] : y > h - m ? [0, -h] : [0]
  for (const ox of xs) for (const oy of ys) {
    ctx.beginPath()
    ctx.moveTo(x + ox, y + oy)
    ctx.lineTo(x2 + ox, y2 + oy)
    ctx.stroke()
  }
}

/** Draws `fn` at the cell origin and at the eight wraparound offsets so the cell tiles seamlessly. */
function drawWrapped(ctx: CanvasRenderingContext2D, cell: number, fn: (ctx: CanvasRenderingContext2D) => void): void {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      ctx.save()
      ctx.translate(ox * cell, oy * cell)
      fn(ctx)
      ctx.restore()
    }
  }
}

// ───────────────────────────── Label texture ─────────────────────────────

export interface LabelOptions {
  text?: string
  lines?: string[]
  font?: 'sans' | 'mono'
  /** Font size in texture pixels. Auto-fit when omitted. */
  size?: number
  weight?: number
  color: string
  bg: string
  width?: number
  height?: number
  padding?: number
  align?: 'left' | 'center' | 'right'
  /** Letter spacing as a fraction of the font size (0.18 = wide signage caps). */
  letterSpacing?: number
  uppercase?: boolean
  lineHeight?: number
  /** Hairline border colour, inset by the padding. */
  border?: string
  /** Paint paper fibre under the text (typed cards, tags). */
  paper?: boolean
}

interface LetterSpacedContext extends CanvasRenderingContext2D { letterSpacing: string }

function hasLetterSpacing(ctx: CanvasRenderingContext2D): ctx is LetterSpacedContext {
  return 'letterSpacing' in ctx
}

/** Width of `text` with manual per-character spacing. */
function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + spacing
  return w - spacing
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
}

function fontSpec(font: 'sans' | 'mono', weight: number, size: number): string {
  return `${weight} ${size}px ${font === 'mono' ? FONT_MONO : FONT_SANS}`
}

/** Largest font size at which every line fits the box. */
function fitSize(ctx: CanvasRenderingContext2D, lines: string[], font: 'sans' | 'mono', weight: number, spacing: number, boxW: number, boxH: number, lineHeight: number): number {
  ctx.font = fontSpec(font, weight, 100)
  const native = hasLetterSpacing(ctx)
  if (native) ctx.letterSpacing = `${spacing * 100}px`
  let widest = 1
  for (const line of lines) widest = Math.max(widest, native ? ctx.measureText(line).width - spacing * 100 : spacedWidth(ctx, line, spacing * 100))
  const byWidth = (100 * boxW) / widest
  const byHeight = boxH / (lines.length * lineHeight)
  return Math.floor(Math.min(byWidth, byHeight))
}

/**
 * Text laid out on a canvas: signage (Jost, letterspaced caps) or typed cards (Courier Prime).
 * Drawn at 2× and downsampled for crisp edges.
 */
export function labelTexture(o: LabelOptions): THREE.CanvasTexture {
  const width = o.width ?? 512, height = o.height ?? 128
  const font = o.font ?? 'sans'
  const weight = o.weight ?? (font === 'mono' ? 400 : 500)
  const align = o.align ?? 'center'
  const lineHeight = o.lineHeight ?? 1.25
  const spacingFrac = o.letterSpacing ?? (font === 'sans' ? 0.16 : 0)
  const rawLines = o.lines ?? (o.text ?? '').split('\n')
  const lines = (o.uppercase ?? font === 'sans') ? rawLines.map((l) => l.toUpperCase()) : rawLines

  const ss = 2
  const [big, ctx] = makeCanvas(width * ss, height * ss)
  const pad = (o.padding ?? Math.round(Math.min(width, height) * 0.12)) * ss
  ctx.fillStyle = o.bg
  ctx.fillRect(0, 0, big.width, big.height)
  if (o.paper) paintFibres(ctx, big.width, big.height, parse(o.bg), seeded(rawLines.join('|')))
  if (o.border) {
    ctx.strokeStyle = o.border
    ctx.lineWidth = ss
    ctx.strokeRect(pad * 0.55, pad * 0.55, big.width - pad * 1.1, big.height - pad * 1.1)
  }

  const boxW = big.width - pad * 2, boxH = big.height - pad * 2
  const size = o.size ? o.size * ss : fitSize(ctx, lines, font, weight, spacingFrac, boxW, boxH, lineHeight)
  const spacing = spacingFrac * size
  ctx.font = fontSpec(font, weight, size)
  ctx.fillStyle = o.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const native = hasLetterSpacing(ctx)
  if (native) ctx.letterSpacing = `${spacing}px`

  const totalH = lines.length * size * lineHeight
  const top = pad + (boxH - totalH) / 2 + (size * lineHeight) / 2
  lines.forEach((line, i) => {
    const w = native ? ctx.measureText(line).width - spacing : spacedWidth(ctx, line, spacing)
    const x = align === 'left' ? pad : align === 'right' ? big.width - pad - w : (big.width - w) / 2
    const y = top + i * size * lineHeight
    if (native) ctx.fillText(line, x, y)
    else drawSpaced(ctx, line, x, y, spacing)
  })

  const [canvas, out] = makeCanvas(width, height)
  out.imageSmoothingEnabled = true
  out.imageSmoothingQuality = 'high'
  out.drawImage(big, 0, 0, width, height)
  const tex = toTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ───────────────────────────── Surface textures ─────────────────────────────

/** Short, faint fibre strokes over a paper colour. */
function paintFibres(ctx: CanvasRenderingContext2D, w: number, h: number, base: Rgb, rnd: () => number): void {
  const count = Math.round((w * h) / 90)
  ctx.lineWidth = 1
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h
    const len = 2 + rnd() * 6
    const ang = rnd() * Math.PI
    const dark = rnd() < 0.5
    ctx.strokeStyle = css(scale(base, dark ? 0.86 : 1.08), 0.14 + rnd() * 0.14)
    wrappedStroke(ctx, w, h, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
  }
}

/** Timber with long grain along x, ring variation and a few knots. */
export function woodTexture(o: { base: string; grain: string; scale?: number; seed?: string; size?: number }): THREE.CanvasTexture {
  const size = o.size ?? 512
  const sc = o.scale ?? 1
  const seed = o.seed ?? 'wood'
  const noise = new Noise(seed)
  const warp = new Noise(seed + ':warp')
  const streaks = new Noise(seed + ':streak')
  const rnd = seeded(seed + ':knots')
  const base = parse(o.base), grain = parse(o.grain)
  const knots = Array.from({ length: 2 + Math.floor(rnd() * 2) }, () => ({ x: rnd() * size, y: rnd() * size, r: size * (0.04 + rnd() * 0.05) }))
  // Periods (lattice cells per tile) are powers of two so the tile repeats without a seam.
  const pow2 = (n: number) => Math.max(2, 2 ** Math.round(Math.log2(n)))
  const rings = Math.max(4, Math.round(24 * sc))
  const wx = pow2(4 * sc), wy = pow2(8 * sc)
  const canvas = paintPixels(size, (x, y) => {
    const u = x / size, v = y / size
    let knot = 0
    for (const k of knots) {
      let dx = x - k.x, dy = y - k.y
      dx -= size * Math.round(dx / size)
      dy -= size * Math.round(dy / size)
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < k.r * 3) knot += (k.r * 1.6) / (d + k.r * 0.35) * 0.4
    }
    const w = warp.tile(u, v, wx, wy, 3) - 0.5
    const ring = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * rings * v + (knot + w * 6) * 6.5), 1.6)
    const fine = noise.tile(u, v, 8, 256, 4, 0.55)
    const streak = Math.pow(streaks.tile(u, v, 4, 512, 1), 3)
    const t = Math.min(1, Math.max(0, ring * 0.6 + fine * 0.5 + streak * 0.5 - 0.15))
    return scale(mix(base, grain, t), 0.92 + fine * 0.14)
  })
  return toTexture(canvas)
}

/** Fine speckle and directional fuzz, the surface of a card table. */
export function feltTexture(color: string, seed = 'felt'): THREE.CanvasTexture {
  const size = 512
  const base = parse(color)
  const noise = new Noise(seed)
  const rnd = seeded(seed)
  const canvas = paintPixels(size, (x, y) => {
    const m = noise.tile(x / size, y / size, 16, 16, 3)
    const speck = rnd() * 0.16 - 0.08
    return scale(base, 0.9 + m * 0.16 + speck)
  })
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.lineWidth = 1
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size, y = rnd() * size
      const len = 3 + rnd() * 7
      const ang = -0.35 + (rnd() - 0.5) * 0.4
      ctx.strokeStyle = css(scale(base, rnd() < 0.5 ? 0.82 : 1.12), 0.1 + rnd() * 0.1)
      wrappedStroke(ctx, size, size, x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len)
    }
  }
  return toTexture(canvas)
}

/** Laid paper: fibre noise and a slight yellowing toward the edges. */
export function paperTexture(color: string, seed = 'paper'): THREE.CanvasTexture {
  const size = 512
  const base = parse(color)
  const noise = new Noise(seed)
  const canvas = paintPixels(size, (x, y) => {
    const m = noise.tile(x / size, y / size, 32, 32, 4, 0.6)
    return scale(base, 0.95 + m * 0.09)
  })
  const ctx = canvas.getContext('2d')
  if (ctx) {
    paintFibres(ctx, size, size, base, seeded(seed + ':fibre'))
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.72)
    g.addColorStop(0, css(scale(base, 0.8), 0))
    g.addColorStop(1, css(mix(scale(base, 0.86), [160, 120, 60], 0.35), 0.28))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return toTexture(canvas)
}

/** Lime plaster: low-frequency mottling with a fine tooth. */
export function plasterTexture(color: string, seed = 'plaster'): THREE.CanvasTexture {
  const size = 512
  const base = parse(color)
  const noise = new Noise(seed)
  const rnd = seeded(seed)
  const canvas = paintPixels(size, (x, y) => {
    const low = noise.tile(x / size, y / size, 8, 8, 3, 0.6)
    const fine = noise.at(x * 0.5 + 77, y * 0.5 + 33)
    const speck = rnd() * 0.05
    return scale(base, 0.93 + low * 0.1 + fine * 0.04 - speck)
  })
  return toTexture(canvas)
}

export type WallpaperPattern = 'stripe' | 'lattice' | 'dots' | 'damask' | 'chevron' | 'fleur' | 'plain'

/** Draws one tileable pattern cell of `cell` px. */
function paintPatternCell(ctx: CanvasRenderingContext2D, cell: number, pattern: WallpaperPattern, fg: string): void {
  ctx.fillStyle = fg
  ctx.strokeStyle = fg
  const c = cell / 2
  switch (pattern) {
    case 'stripe':
      ctx.fillRect(0, 0, cell * 0.5, cell)
      break
    case 'lattice':
      ctx.lineWidth = cell * 0.05
      drawWrapped(ctx, cell, (g) => {
        g.beginPath(); g.moveTo(-c, c); g.lineTo(c, -c); g.moveTo(c, cell + c); g.lineTo(cell + c, c); g.stroke()
        g.beginPath(); g.moveTo(-c, c); g.lineTo(c, cell + c); g.moveTo(c, -c); g.lineTo(cell + c, c); g.stroke()
      })
      break
    case 'dots':
      drawWrapped(ctx, cell, (g) => {
        g.beginPath(); g.arc(c * 0.5, c * 0.5, cell * 0.07, 0, Math.PI * 2); g.fill()
        g.beginPath(); g.arc(c * 1.5, c * 1.5, cell * 0.07, 0, Math.PI * 2); g.fill()
      })
      break
    case 'damask':
      ctx.lineWidth = cell * 0.03
      drawWrapped(ctx, cell, (g) => {
        for (const [ox, oy] of [[c, c], [0, 0]] as const) {
          g.beginPath()
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2
            g.moveTo(ox, oy)
            g.bezierCurveTo(ox + Math.cos(a + 0.5) * c * 0.55, oy + Math.sin(a + 0.5) * c * 0.55, ox + Math.cos(a - 0.5) * c * 0.55, oy + Math.sin(a - 0.5) * c * 0.55, ox, oy)
          }
          g.stroke()
          g.beginPath(); g.arc(ox, oy, cell * 0.04, 0, Math.PI * 2); g.fill()
        }
      })
      break
    case 'chevron':
      ctx.lineWidth = cell * 0.12
      drawWrapped(ctx, cell, (g) => {
        g.beginPath(); g.moveTo(0, c * 0.5); g.lineTo(c, 0); g.lineTo(cell, c * 0.5); g.stroke()
        g.beginPath(); g.moveTo(0, c * 1.5); g.lineTo(c, c); g.lineTo(cell, c * 1.5); g.stroke()
      })
      break
    case 'fleur':
      drawWrapped(ctx, cell, (g) => {
        for (const [ox, oy] of [[c * 0.5, c * 0.5], [c * 1.5, c * 1.5]] as const) {
          const s = cell * 0.09
          g.beginPath(); g.ellipse(ox, oy - s * 0.8, s * 0.45, s * 1.1, 0, 0, Math.PI * 2); g.fill()
          g.beginPath(); g.ellipse(ox - s, oy, s * 0.4, s * 0.9, 0.7, 0, Math.PI * 2); g.fill()
          g.beginPath(); g.ellipse(ox + s, oy, s * 0.4, s * 0.9, -0.7, 0, Math.PI * 2); g.fill()
          g.fillRect(ox - s * 1.2, oy + s * 0.6, s * 2.4, s * 0.28)
          g.fillRect(ox - s * 0.2, oy + s * 0.6, s * 0.4, s * 1.2)
        }
      })
      break
    case 'plain':
      break
  }
}

/** Wallpaper: a tileable pattern cell repeated over a faintly aged ground. */
export function wallpaperTexture(o: { pattern: WallpaperPattern; bg: string; fg: string; scale?: number; repeat?: [number, number] }): THREE.CanvasTexture {
  const size = 512
  // A whole number of cells per tile, so the texture repeats without a seam at any scale.
  const n = Math.max(1, Math.round(size / (128 * (o.scale ?? 1))))
  const cell = size / n
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = o.bg
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.save()
      ctx.translate(i * cell, j * cell)
      paintPatternCell(ctx, cell, o.pattern, o.fg)
      ctx.restore()
    }
  }
  const noise = new Noise('wallpaper:' + o.pattern)
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const k = 0.94 + noise.tile(x / size, y / size, 8, 8, 3) * 0.1
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k
    }
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(canvas, o.repeat)
}

/** Checkerboard floor tiles with grout. */
export function tileTexture(o: { a: string; b: string; grout: string; repeat?: [number, number] }): THREE.CanvasTexture {
  const size = 512, half = size / 2, g = 6
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = o.grout
  ctx.fillRect(0, 0, size, size)
  const noise = new Noise('tile')
  const cells: [number, number, string][] = [[0, 0, o.a], [half, 0, o.b], [0, half, o.b], [half, half, o.a]]
  for (const [x, y, col] of cells) {
    ctx.fillStyle = col
    ctx.fillRect(x + g / 2, y + g / 2, half - g, half - g)
    const base = parse(col)
    for (let i = 0; i < 40; i++) {
      const px = x + g + noise.at(i * 3.1 + x, y * 0.3) * (half - 2 * g), py = y + g + noise.at(y * 0.7 + i * 1.7, x) * (half - 2 * g)
      ctx.fillStyle = css(scale(base, 0.9), 0.18)
      ctx.beginPath(); ctx.arc(px, py, 1 + noise.at(i, i) * 4, 0, Math.PI * 2); ctx.fill()
    }
  }
  return toTexture(canvas, o.repeat)
}

/** Faint horizontal streaks over a metal colour (brushed brass, steel). */
function streakTexture(color: string, seed: string): THREE.CanvasTexture {
  const size = 256
  const base = parse(color)
  const noise = new Noise(seed)
  const canvas = paintPixels(size, (x, y) => {
    const s = noise.tile(x / size, y / size, 4, 256, 3)
    const b = noise.tile(x / size, y / size, 8, 8, 2)
    return scale(base, 0.9 + s * 0.14 + b * 0.06)
  })
  return toTexture(canvas)
}

/** A grayscale copy of a colour texture, for bump maps. */
function bumpFrom(tex: THREE.CanvasTexture, repeat: [number, number]): THREE.CanvasTexture {
  const bump = new THREE.CanvasTexture(tex.image as HTMLCanvasElement)
  bump.colorSpace = THREE.NoColorSpace
  bump.anisotropy = 4
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.set(repeat[0], repeat[1])
  return bump
}

// ───────────────────────────── Materials ─────────────────────────────

const cache = new Map<string, THREE.Material>()

function memo<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit) return hit as T
  const m = make()
  cache.set(key, m)
  return m
}

/** Materials that reflect their surroundings (metals, lacquer, glass, enamel). */
const reflective = new Set<THREE.MeshStandardMaterial>()
let environment: THREE.Texture | null = null

/** Registers a material as reflective and gives it the current environment. */
function reflect<T extends THREE.MeshStandardMaterial>(m: T): T {
  reflective.add(m)
  m.envMap = environment
  m.envMapIntensity = 0.45
  return m
}

/**
 * Sets the reflection environment (a PMREM texture) on every reflective material, present and
 * future. Matte surfaces do not use it; the Stage calls this once at boot.
 */
export function setEnvironment(tex: THREE.Texture | null): void {
  environment = tex
  for (const m of reflective) { m.envMap = tex; m.needsUpdate = true }
}

/** Memoized materials for every surface in the house. */
export const mat = {
  /** Timber with visible grain; bump follows the grain. */
  wood(o: { base: string; grain: string; seed?: string; repeat?: [number, number] }): THREE.MeshStandardMaterial {
    return memo('wood:' + JSON.stringify(o), () => {
      const repeat = o.repeat ?? [1, 1]
      const map = woodTexture({ base: o.base, grain: o.grain, seed: o.seed })
      map.repeat.set(repeat[0], repeat[1])
      return new THREE.MeshStandardMaterial({ map, bumpMap: bumpFrom(map, repeat), bumpScale: 0.015, roughness: 0.62, metalness: 0 })
    })
  },
  /** Card-table felt. */
  felt(color: string): THREE.MeshStandardMaterial {
    return memo('felt:' + color, () => {
      const map = feltTexture(color)
      return new THREE.MeshStandardMaterial({ map, bumpMap: bumpFrom(map, [1, 1]), bumpScale: 0.006, roughness: 1, metalness: 0 })
    })
  },
  /** Deep painted lacquer with a clear coat. */
  lacquer(color: string): THREE.MeshPhysicalMaterial {
    return memo('lacquer:' + color, () => reflect(new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 })))
  },
  /** Old brass, lightly brushed. */
  brass(): THREE.MeshStandardMaterial {
    return memo('brass', () => reflect(new THREE.MeshStandardMaterial({ map: streakTexture(ui.brass, 'brass'), roughness: 0.35, metalness: 0.9 })))
  },
  /** Brushed steel. */
  steel(): THREE.MeshStandardMaterial {
    return memo('steel', () => reflect(new THREE.MeshStandardMaterial({ map: streakTexture(css(mix(parse(ui.ink), parse(ui.paper), 0.72)), 'steel'), roughness: 0.4, metalness: 0.85 })))
  },
  /** Laid paper for cards and tags. */
  paper(color: string): THREE.MeshStandardMaterial {
    return memo('paper:' + color, () => new THREE.MeshStandardMaterial({ map: paperTexture(color), roughness: 0.92, metalness: 0 }))
  },
  /** Lime plaster walls and ceilings. */
  plaster(color: string): THREE.MeshStandardMaterial {
    return memo('plaster:' + color, () => {
      const map = plasterTexture(color)
      return new THREE.MeshStandardMaterial({ map, bumpMap: bumpFrom(map, [1, 1]), bumpScale: 0.008, roughness: 0.95, metalness: 0 })
    })
  },
  /** Patterned wallpaper. */
  wallpaper(o: Parameters<typeof wallpaperTexture>[0]): THREE.MeshStandardMaterial {
    return memo('wallpaper:' + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ map: wallpaperTexture(o), roughness: 0.85, metalness: 0 }))
  },
  /** Velvet: felt fuzz, darker, with a soft directional sheen. */
  velvet(color: string): THREE.MeshStandardMaterial {
    return memo('velvet:' + color, () => {
      const map = feltTexture(css(scale(parse(color), 0.92)), 'velvet')
      return new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.08 })
    })
  },
  /** Window and vitrine glass. */
  glass(tint?: string): THREE.MeshPhysicalMaterial {
    return memo('glass:' + (tint ?? ''), () => reflect(new THREE.MeshPhysicalMaterial({ color: tint ?? ui.paper, transmission: 0.9, thickness: 0.1, roughness: 0.05, metalness: 0, transparent: true, ior: 1.5 })))
  },
  /** Matte painted surface. */
  flat(color: string): THREE.MeshStandardMaterial {
    return memo('flat:' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0 }))
  },
  /** Enamelled metal: a hard, slightly glossy skin. */
  enamel(color: string): THREE.MeshStandardMaterial {
    return memo('enamel:' + color, () => reflect(new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.05 })))
  },
}
