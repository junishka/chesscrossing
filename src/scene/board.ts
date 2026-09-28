// The board: a shallow ebonised tray, sixty-four recessed lacquer squares, an engraved brass rim on a
// brass lazy susan (docs/BIBLE.md §5.1, §14.1). Origin at the tray's centre, lacquer surface at local y 0.
import * as THREE from 'three'
import type { File, Rank, Square } from '../types'
import { mat, seeded } from './materials'
import { squares as squareColors, tokens } from '../content/palette'
import { FILES, FILE_WORDS, RANKS, RANK_WORDS } from '../content/survey'
import { FONT_SANS } from '../core/fonts'

// ───────────────────────────── Numbers (§14.1) ─────────────────────────────

/** Tray side, metres. */
export const TRAY = 0.484
/** Brass rim width. */
export const RIM = 0.022
/** Square pitch. */
export const PITCH = 0.055
/** Square recess below the lacquer surface. */
export const RECESS = 0.0015
/** The lacquer fillet at the lip. */
export const FILLET = 0.0006
/** Tray depth (lacquer surface to the tray's underside). */
export const DEPTH = 0.009

const FIELD = PITCH * 8
const RIM_THICK = 0.002
const BAND_W = 2048
const BAND_H = 128
const CELL_PX = BAND_W / 8

const INK = tokens['br.ink']
const BRASS = tokens['br.brass']
const DARK_BODY = tokens['br.darkBody']

// ───────────────────────────── Squares ─────────────────────────────

/** Local x, z of a square's centre: a1 near-left for the light side, +z toward the player. */
function squareXZ(sq: Square): { x: number; z: number } {
  const f = FILES.indexOf(sq[0] as File)
  const r = Number(sq[1]) - 1
  return { x: (f - 3.5) * PITCH, z: (3.5 - r) * PITCH }
}

function isLight(sq: Square): boolean {
  return (FILES.indexOf(sq[0] as File) + Number(sq[1])) % 2 === 0
}

/**
 * One recessed square: the floor sunk 0.0015 (uv 0..1 across it) and the fillet ring rising to the
 * lacquer surface at the pitch boundary. Ten triangles, origin at the square's centre.
 */
function squareGeometry(): THREE.BufferGeometry {
  const o = PITCH / 2
  const i = o - FILLET
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const push = (x: number, y: number, z: number) => {
    pos.push(x, y, z)
    uv.push(THREE.MathUtils.clamp(x / PITCH + 0.5, 0, 1), THREE.MathUtils.clamp(0.5 - z / PITCH, 0, 1))
    return pos.length / 3 - 1
  }
  // floor
  const f0 = push(-i, -RECESS, i), f1 = push(i, -RECESS, i), f2 = push(i, -RECESS, -i), f3 = push(-i, -RECESS, -i)
  idx.push(f0, f1, f2, f0, f2, f3)
  // fillet ring: outer at the surface
  const o0 = push(-o, 0, o), o1 = push(o, 0, o), o2 = push(o, 0, -o), o3 = push(-o, 0, -o)
  const inner = [f0, f1, f2, f3], outer = [o0, o1, o2, o3]
  for (let k = 0; k < 4; k++) {
    const a = inner[k], b = inner[(k + 1) % 4], c = outer[(k + 1) % 4], d = outer[k]
    idx.push(a, c, b, a, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** The light-square lacquer with c6's flaw: an 11 mm hairline crack painted into the ninth coat. */
function crackedLacquer(color: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, size, size)
    const rnd = seeded('c6:crack')
    const px = size / PITCH
    const len = 0.011 * px
    const x0 = size * 0.38, y0 = size * 0.62
    const ang = -0.9
    let x = x0, y = y0
    ctx.lineCap = 'round'
    for (let s = 0; s < 12; s++) {
      const nx = x + (Math.cos(ang) * len) / 12 + (rnd() - 0.5) * 1.6
      const ny = y + (Math.sin(ang) * len) / 12 + (rnd() - 0.5) * 1.6
      ctx.strokeStyle = 'rgba(35,33,30,0.55)'
      ctx.lineWidth = 0.9 + rnd() * 0.5
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke()
      ctx.strokeStyle = 'rgba(233,224,196,0.35)'
      ctx.lineWidth = 0.6
      ctx.beginPath(); ctx.moveTo(x + 0.7, y + 0.7); ctx.lineTo(nx + 0.7, ny + 0.7); ctx.stroke()
      x = nx; y = ny
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function lightLacquer(): THREE.MeshPhysicalMaterial {
  const m = mat.lacquer(squareColors.light).clone()
  m.roughness = 0.3
  m.clearcoatRoughness = 0.12
  return m
}

/** Basalt lacquer, waxed: low sheen. */
function darkLacquer(): THREE.MeshPhysicalMaterial {
  const m = mat.lacquer(squareColors.dark).clone()
  m.roughness = 0.5
  m.clearcoat = 0.35
  m.clearcoatRoughness = 0.3
  m.envMapIntensity = 0.3
  return m
}

// ───────────────────────────── The rim bands ─────────────────────────────

type BandKey = 'near' | 'far' | 'left' | 'right'

interface BandSpec {
  key: BandKey
  centre: [number, number]
  /** Reading direction along the band (local x, z). */
  dir: [number, number]
  /** Where the letters' tops point (local x, z). */
  up: [number, number]
  /** +1 when the inner (square-side) edge lies toward `up`. */
  innerSign: 1 | -1
  /** The eight words, in reading order. */
  words: string[]
  /** The eight inner-band marks, in reading order. */
  marks: string[]
}

const fileWords = FILES.map((f) => FILE_WORDS[f])
const rankWords = RANKS.map((r) => RANK_WORDS[r])
const fileMarks = FILES.map((f) => f)
const rankMarks = RANKS.map((r) => String(r))

const BANDS: BandSpec[] = [
  { key: 'near', centre: [0, FIELD / 2 + RIM / 2], dir: [1, 0], up: [0, -1], innerSign: 1, words: fileWords, marks: fileMarks },
  { key: 'far', centre: [0, -(FIELD / 2 + RIM / 2)], dir: [1, 0], up: [0, -1], innerSign: -1, words: fileWords, marks: fileMarks },
  { key: 'left', centre: [-(FIELD / 2 + RIM / 2), 0], dir: [0, -1], up: [-1, 0], innerSign: -1, words: rankWords, marks: rankMarks },
  { key: 'right', centre: [FIELD / 2 + RIM / 2, 0], dir: [0, 1], up: [1, 0], innerSign: -1, words: [...rankWords].reverse(), marks: [...rankMarks].reverse() },
]

/** Canvas px per metre along the band (at its midline) over px per metre across it: the text's x scale. */
const TEXT_SX = (BAND_W / (TRAY - RIM)) / (BAND_H / RIM)

/** Draws letterspaced text centred at (cx, cy), scaled horizontally by `sx` so the band's aspect does not squash it. */
function drawText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, spacingEm: number, sx: number, style: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(sx, 1)
  ctx.font = `500 ${px}px ${FONT_SANS}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = style
  const spacing = spacingEm * px
  const chars = Array.from(text)
  let w = 0
  for (const ch of chars) w += ctx.measureText(ch).width + spacing
  w -= spacing
  let x = -w / 2
  for (const ch of chars) {
    ctx.fillText(ch, x, 0)
    x += ctx.measureText(ch).width + spacing
  }
  ctx.restore()
}

/** Engraves `text`: a lit edge, a shadowed edge, then ink in the groove; the same glyphs cut into the bump. */
function engrave(ctx: CanvasRenderingContext2D, bump: CanvasRenderingContext2D | null, text: string, cx: number, cy: number, px: number, spacingEm: number, ink: string): void {
  drawText(ctx, text, cx - 0.8, cy - 0.8, px, spacingEm, TEXT_SX, 'rgba(233,224,196,0.28)')
  drawText(ctx, text, cx + 0.8, cy + 0.8, px, spacingEm, TEXT_SX, 'rgba(35,33,30,0.30)')
  drawText(ctx, text, cx, cy, px, spacingEm, TEXT_SX, ink)
  if (bump) drawText(bump, text, cx, cy, px, spacingEm, TEXT_SX, '#262626')
}

/** Rows of the two engraved lines, in canvas px, for a band whose words sit on the given half. */
function rows(spec: BandSpec): { word: number; mark: number } {
  // The canvas's top row lies toward `up`. The words take the outer half, the marks the inner half.
  const wordsOnTop = spec.innerSign < 0
  return wordsOnTop ? { word: BAND_H * 0.30, mark: BAND_H * 0.76 } : { word: BAND_H * 0.70, mark: BAND_H * 0.24 }
}

const WORD_PX = Math.round((0.006 / 0.7) * (BAND_H / RIM))
const MARK_PX = Math.round((0.0032 / 0.7) * (BAND_H / RIM))

/** Brushed brass, 2 to 4 percent value noise, tarnish toward the corners and the outer edge. */
function paintBrassGround(ctx: CanvasRenderingContext2D, seed: string, outerOnTop: boolean): void {
  const rnd = seeded(seed)
  ctx.fillStyle = BRASS
  ctx.fillRect(0, 0, BAND_W, BAND_H)
  const img = ctx.getImageData(0, 0, BAND_W, BAND_H)
  const d = img.data
  for (let y = 0; y < BAND_H; y++) {
    const across = outerOnTop ? 1 - y / BAND_H : y / BAND_H
    for (let x = 0; x < BAND_W; x++) {
      const toEnd = Math.min(x, BAND_W - x) / (BAND_W * 0.5)
      const tarnish = 1 - 0.08 * (1 - THREE.MathUtils.smoothstep(toEnd, 0, 0.25)) - 0.04 * (1 - across)
      const k = tarnish * (0.97 + rnd() * 0.04)
      const i = (y * BAND_W + x) * 4
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.lineWidth = 2
  for (let s = 0; s < 1800; s++) {
    const x = rnd() * BAND_W, y = rnd() * BAND_H
    const len = 24 + rnd() * 24
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(233,224,196,0.06)' : 'rgba(35,33,30,0.06)'
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rnd() - 0.5) * 0.6); ctx.stroke()
  }
}

interface Band {
  spec: BandSpec
  base: HTMLCanvasElement
  live: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  map: THREE.CanvasTexture
  mesh: THREE.Mesh
}

/** Paints a band's ground, marks and words into a base canvas, its grooves into a bump canvas, and returns the pair. */
function paintBand(spec: BandSpec): { base: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const base = document.createElement('canvas')
  base.width = BAND_W; base.height = BAND_H
  const bump = document.createElement('canvas')
  bump.width = BAND_W; bump.height = BAND_H
  const ctx = base.getContext('2d')
  const bctx = bump.getContext('2d')
  if (!ctx || !bctx) return { base, bump }
  paintBrassGround(ctx, `rim:${spec.key}`, spec.innerSign < 0)
  bctx.fillStyle = '#808080'
  bctx.fillRect(0, 0, BAND_W, BAND_H)
  const r = rows(spec)
  for (let i = 0; i < 8; i++) {
    const cx = (i + 0.5) * CELL_PX
    engrave(ctx, bctx, spec.marks[i], cx, r.mark, MARK_PX, 0, INK)
    engrave(ctx, bctx, spec.words[i].toUpperCase(), cx, r.word, WORD_PX, 0.12, INK)
  }
  return { base, bump }
}

/** Redraws one cell's word on the live canvas in `ink`, over a fresh copy of the ground. */
function repaintCell(band: Band, cell: number, ink: string): void {
  const x0 = cell * CELL_PX
  const r = rows(band.spec)
  const wordTop = r.word - WORD_PX * 0.7, wordBottom = r.word + WORD_PX * 0.7
  band.ctx.drawImage(band.base, x0, wordTop, CELL_PX, wordBottom - wordTop, x0, wordTop, CELL_PX, wordBottom - wordTop)
  engrave(band.ctx, null, band.spec.words[cell].toUpperCase(), x0 + CELL_PX / 2, r.word, WORD_PX, 0.12, ink)
  band.map.needsUpdate = true
}

/**
 * The band's top face: a mitred strip (outer edge 0.484, inner edge 0.440), 48 quads along so the
 * canvas maps evenly; uv u runs along the reading direction, v toward the letters' tops.
 */
function bandGeometry(spec: BandSpec): THREE.BufferGeometry {
  const along = 48
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const [cx, cz] = spec.centre, [dx, dz] = spec.dir, [ux, uz] = spec.up
  for (let j = 0; j <= 1; j++) {
    const v = j
    const inner = spec.innerSign > 0 ? v : 1 - v
    const half = THREE.MathUtils.lerp(TRAY / 2, FIELD / 2, inner)
    const across = (v - 0.5) * RIM
    for (let i = 0; i <= along; i++) {
      const u = i / along
      const a = THREE.MathUtils.lerp(-half, half, u)
      pos.push(cx + dx * a + ux * across, 0, cz + dz * a + uz * across)
      uv.push(u, v)
    }
  }
  for (let i = 0; i < along; i++) {
    const a = i, b = i + 1, c = along + 1 + i + 1, d = along + 1 + i
    idx.push(a, c, b, a, d, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // The strip must face up whichever way the band reads.
  const n = g.getAttribute('normal')
  if (n.getY(0) < 0) {
    const flipped: number[] = []
    for (let i = 0; i < idx.length; i += 3) flipped.push(idx[i], idx[i + 2], idx[i + 1])
    g.setIndex(flipped)
    g.computeVertexNormals()
  }
  return g
}

function buildBand(spec: BandSpec): Band {
  const { base, bump } = paintBand(spec)
  const live = document.createElement('canvas')
  live.width = BAND_W; live.height = BAND_H
  const ctx = live.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(base, 0, 0)
  const map = new THREE.CanvasTexture(live)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
  const bumpMap = new THREE.CanvasTexture(bump)
  bumpMap.colorSpace = THREE.NoColorSpace
  bumpMap.anisotropy = 8
  const brass = mat.brass()
  const material = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.00035, metalness: 0.85, roughness: 0.38, envMap: brass.envMap, envMapIntensity: 0.45 })
  const mesh = new THREE.Mesh(bandGeometry(spec), material)
  mesh.name = `rim:${spec.key}`
  mesh.receiveShadow = true
  return { spec, base, live, ctx, map, mesh }
}

// ───────────────────────────── The board ─────────────────────────────

/** What buildBoard returns. */
export interface BoardBuild {
  /** The whole board; origin at the tray's centre, lacquer surface at local y 0, +z toward the light side. */
  group: THREE.Group
  /** Each square's mesh (name = the square, userData.square), for highlights and picking. */
  squares: Map<Square, THREE.Mesh>
  /** A square's centre in board-local space, at the square's own lacquer floor (y −0.0015, in the recess). */
  squareCenter(sq: Square): THREE.Vector3
  /** Warms one file word (near and far bands) and one rank word (left and right) in `#C9A55A`; null clears. */
  setRimHover(file: File | null, rank: Rank | null): void
}

/**
 * Builds the board: the ebonised tray, sixty-four recessed lacquer squares (c6 cracked), the mitred
 * brass rim with its four engraved bands, the brass lazy-susan ring let into the table below, a felt
 * underside. Under 4k triangles. Call after loadFonts(): the rim is painted at build time.
 */
export function buildBoard(): BoardBuild {
  const group = new THREE.Group()
  group.name = 'board'

  // The tray: ebonised pear, waxed.
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(TRAY, DEPTH - RIM_THICK, TRAY),
    mat.wood({ base: DARK_BODY, grain: INK, seed: 'tray', repeat: [2, 2] }),
  )
  tray.name = 'tray'
  tray.position.y = -RIM_THICK - (DEPTH - RIM_THICK) / 2
  tray.castShadow = true
  tray.receiveShadow = true
  group.add(tray)

  // The rim's outer faces: four plain brass edge blocks under the bands, a hairline above the tray's wood.
  const edge = new THREE.BoxGeometry(TRAY, RIM_THICK, RIM)
  const edgeShort = new THREE.BoxGeometry(RIM, RIM_THICK, FIELD)
  const offsets: [THREE.BoxGeometry, number, number][] = [
    [edge, 0, FIELD / 2 + RIM / 2], [edge, 0, -(FIELD / 2 + RIM / 2)],
    [edgeShort, -(FIELD / 2 + RIM / 2), 0], [edgeShort, FIELD / 2 + RIM / 2, 0],
  ]
  offsets.forEach(([geometry, x, z], i) => {
    const block = new THREE.Mesh(geometry, mat.brass())
    block.name = `rim:edge:${i}`
    block.position.set(x, -RIM_THICK / 2 - 0.0002, z)
    block.castShadow = true
    group.add(block)
  })

  // The squares.
  const squareGeo = squareGeometry()
  const light = lightLacquer()
  const dark = darkLacquer()
  const cracked = lightLacquer()
  cracked.map = crackedLacquer(squareColors.light)
  // The canvas carries the lacquer colour; the material's own colour becomes a neutral multiplier.
  cracked.color.setScalar(1)
  cracked.needsUpdate = true
  const squares = new Map<Square, THREE.Mesh>()
  for (const f of FILES) {
    for (const r of RANKS) {
      const sq: Square = `${f}${r}`
      const { x, z } = squareXZ(sq)
      const material = sq === 'c6' ? cracked : isLight(sq) ? light : dark
      const mesh = new THREE.Mesh(squareGeo, material)
      mesh.name = sq
      mesh.userData = { square: sq }
      mesh.position.set(x, 0, z)
      mesh.receiveShadow = true
      group.add(mesh)
      squares.set(sq, mesh)
    }
  }

  // The rim bands.
  const bands = BANDS.map(buildBand)
  for (const b of bands) group.add(b.mesh)

  // The lazy susan: a brass ring let into the table top, static in v1.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.236, 0.262, 96), mat.brass())
  ring.name = 'lazy-susan'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -DEPTH - 0.0002
  ring.receiveShadow = true
  group.add(ring)

  // The felt underside.
  const underside = new THREE.Mesh(new THREE.PlaneGeometry(TRAY - 0.014, TRAY - 0.014), mat.felt(squareColors.dark))
  underside.name = 'underside'
  underside.rotation.x = Math.PI / 2
  underside.position.y = -DEPTH - 0.0001
  group.add(underside)

  let hovered: { band: Band; cell: number }[] = []
  const byKey = (key: BandKey) => bands.find((b) => b.spec.key === key)
  const setRimHover = (file: File | null, rank: Rank | null): void => {
    for (const h of hovered) repaintCell(h.band, h.cell, INK)
    hovered = []
    if (file) {
      const cell = FILES.indexOf(file)
      for (const key of ['near', 'far'] as const) {
        const band = byKey(key)
        if (band) hovered.push({ band, cell })
      }
    }
    if (rank) {
      const left = byKey('left'), right = byKey('right')
      if (left) hovered.push({ band: left, cell: rank - 1 })
      if (right) hovered.push({ band: right, cell: 8 - rank })
    }
    for (const h of hovered) repaintCell(h.band, h.cell, squareColors.hover)
  }

  const squareCenter = (sq: Square): THREE.Vector3 => {
    const { x, z } = squareXZ(sq)
    return new THREE.Vector3(x, -RECESS, z)
  }

  return { group, squares, squareCenter, setRimHover }
}
