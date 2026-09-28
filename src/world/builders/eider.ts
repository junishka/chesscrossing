// Frame O5: Eider Reach (e4), the centre of the Sixty-Four (docs/BIBLE.md §7 O5, §3.4, §14.2).
// A light shell-sand islet at 1:10; a driftwood hut painted sand mustard, exactly square, dead centre,
// its double doors open toward the camera; inside, seen frontally, a table with the Surveyor's slate.
// The cairn stands before the hut on the axis with its plate; four tagged cords run from the hut's
// corner posts to the cairn's top. The Surveyor sits on a stool outside, on the left: the hut is the
// symmetry and the man is the flaw. Local space: origin at the hut's centre on the sand; +z toward
// the camera, which stands at (0, 1.5, 6) with a 40 mm lens in a 2.40:1 frame.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BuildContext, BuiltFrame } from '../frames'
import { labelTexture, mat, seeded } from '../../scene/materials'
import { placard, tag } from '../../scene/text3d'
import { buildContactDisc } from '../../scene/pieces'
import { figure } from '../figures'
import { stool as stoolProp } from '../props'
import { palette, tokens } from '../../content/palette'
import { FILES, RANKS, SLATE_NAMES, SURVEY_YEAR, isletName, plateText } from '../../content/survey'
import { dressing } from '../../content/frames/eider'
import { FONT_MONO } from '../../core/fonts'
import type { Rank, Square } from '../../types'

// ───────────────────────────── The measures of the Sixty-Four (1:10) ─────────────────────────────

/** An islet's side, a channel's width and the pitch between islet centres, in metres at 1:10. */
const ISLET = 9.1
const CHANNEL = 1.1
const PITCH = ISLET + CHANNEL
/** The cairn's height and where it stands on the axis, before the hut, toward the camera. */
const CAIRN_H = 0.6
const CAIRN_Z = 1.6
/** The hut: exactly square, 1.0 m at 1:10; a shed roof higher at the back so the cords clear its front eave. */
const HUT = { w: 1.0, d: 1.0, front: 0.8, back: 1.02, wall: 0.03, post: 0.12 } as const
const DOOR = { w: 0.44, h: 0.64 } as const
/** The Surveyor's stool, outside, on the left. */
const STOOL_AT = new THREE.Vector3(-0.78, 0, 0.55)
/** The tin of postcards, by the door. */
const TIN_AT = new THREE.Vector3(0.42, 0, 0.64)
/** The punt, beached at the right edge of the frame. */
const PUNT_AT = new THREE.Vector3(1.78, 0, 0.92)
const PUNT_YAW = 0.42
/** The house miniature on the left horizon. */
const HOUSE_AT = new THREE.Vector3(-14, 0, -40)

const P = palette.beyond
const SAND = tokens['grid.lightIslet']
const BASALT = tokens['grid.darkIslet']
const WATER = tokens['grid.channel']
const FOAM = tokens['out.foam']
const INK = tokens['grid.ink']
const BRASS = tokens['grid.cairnBrass']
const SKY = tokens['grid.sky']
const MUSTARD = tokens['br.sandMustard']
const CHALK = tokens['paper.white']
const DRIFTWOOD = P.wood

// ───────────────────────────── Small helpers ─────────────────────────────

type Rgb = [number, number, number]

function parse(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A palette colour as CSS with an alpha, for painting one palette colour over another. */
function tint(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [canvas, ctx]
}

function toTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  return tex
}

const geometries = new Map<string, THREE.BufferGeometry>()
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box:${w}|${h}|${d}`
  let g = geometries.get(key) as THREE.BoxGeometry | undefined
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geometries.set(key, g) }
  return g
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  return me
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(boxGeo(w, h, d), m, x, y, z)
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z)
}

/** A thin cylinder stretched between two points: a cord, a pole. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 6): THREE.Mesh {
  const len = a.distanceTo(b)
  const me = cyl(r, r, len, m, 0, 0, 0, seg)
  me.position.copy(a).lerp(b, 0.5)
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return me
}

/** A painted, matte surface with a canvas map. */
function painted(map: THREE.Texture, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness, metalness: 0 })
}

/** Bible brush strokes: 24–48 px long, 2–3 px wide, alpha 0.06, along `angle`. */
function brush(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, count: number, angle: number, rnd: () => number): void {
  ctx.strokeStyle = tint(color, 0.06)
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h
    const len = 24 + rnd() * 24
    ctx.lineWidth = 2 + rnd()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }
}

/** The Society's measurement of a 1:10 length: yards and feet at 1:1. */
function surveyed(metres: number): string {
  const feet = Math.round((metres * 10) / 0.3048)
  return `${Math.floor(feet / 3)} YD ${feet % 3} FT`
}

// ───────────────────────────── Painted canvases ─────────────────────────────

/** Soft mottle: shell-sand grains and salt, painted over the base. */
function mottle(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, density: number, light: string, dark: string): void {
  const n = Math.round((w * h) / density)
  for (let i = 0; i < n; i++) {
    const r = 1 + rnd() * 3
    ctx.fillStyle = tint(rnd() < 0.5 ? light : dark, 0.05 + rnd() * 0.06)
    ctx.beginPath()
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** One footprint tick: a short dark dash across the direction of travel, painted into the sand. */
function footprints(ctx: CanvasRenderingContext2D, px: (x: number) => number, py: (z: number) => number, from: THREE.Vector2, to: THREE.Vector2, stride: number): void {
  const dir = to.clone().sub(from)
  const len = dir.length()
  dir.normalize()
  const side = new THREE.Vector2(-dir.y, dir.x)
  const steps = Math.floor(len / stride)
  ctx.lineCap = 'round'
  for (let i = 1; i < steps; i++) {
    const t = i * stride
    const s = i % 2 === 0 ? 1 : -1
    const c = from.clone().addScaledVector(dir, t).addScaledVector(side, s * 0.035)
    const tickLen = 0.03
    const a = c.clone().addScaledVector(dir, -tickLen / 2)
    const b = c.clone().addScaledVector(dir, tickLen / 2)
    ctx.strokeStyle = tint(INK, 0.34)
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(px(a.x), py(a.y))
    ctx.lineTo(px(b.x), py(b.y))
    ctx.stroke()
  }
}

/** The islet's top: dry shell-sand, a salt line at the edges, and the footprint ticks painted darker. */
function isletTexture(rnd: () => number): THREE.CanvasTexture {
  const size = 1024
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = SAND
  ctx.fillRect(0, 0, size, size)
  mottle(ctx, size, size, rnd, 220, FOAM, INK)
  // Faint ripple lines left by the last tide, running with the channels.
  ctx.strokeStyle = tint(INK, 0.045)
  ctx.lineWidth = 1.5
  for (let i = 0; i < 90; i++) {
    const y = rnd() * size
    const x0 = rnd() * size * 0.6
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.bezierCurveTo(x0 + 120, y - 6 + rnd() * 12, x0 + 260, y + 6 - rnd() * 12, x0 + 320 + rnd() * 200, y)
    ctx.stroke()
  }
  // Salt at the channel edges.
  const band = size * 0.035
  const grad = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, tint(FOAM, 0.75))
    g.addColorStop(1, tint(FOAM, 0))
    return g
  }
  ctx.fillStyle = grad(0, 0, band, 0); ctx.fillRect(0, 0, band, size)
  ctx.fillStyle = grad(size, 0, size - band, 0); ctx.fillRect(size - band, 0, band, size)
  ctx.fillStyle = grad(0, 0, 0, band); ctx.fillRect(0, 0, size, band)
  ctx.fillStyle = grad(0, size, 0, size - band); ctx.fillRect(0, size - band, size, band)

  // Footprints: the Surveyor's, from the punt to the door, the door to the stool, and his round of the cairn.
  const px = (x: number): number => ((x + ISLET / 2) / ISLET) * size
  const py = (z: number): number => ((z + ISLET / 2) / ISLET) * size
  const door = new THREE.Vector2(0, HUT.d / 2 + 0.12)
  footprints(ctx, px, py, new THREE.Vector2(PUNT_AT.x - 0.2, PUNT_AT.z + 0.12), door, 0.07)
  footprints(ctx, px, py, door, new THREE.Vector2(STOOL_AT.x + 0.1, STOOL_AT.z + 0.1), 0.07)
  const ring = 0.42
  const around: THREE.Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * 0.5 + (i / 12) * Math.PI * 2
    around.push(new THREE.Vector2(Math.cos(a) * ring, CAIRN_Z + Math.sin(a) * ring))
  }
  for (let i = 0; i < around.length - 1; i++) footprints(ctx, px, py, around[i], around[i + 1], 0.07)
  footprints(ctx, px, py, door, new THREE.Vector2(0, CAIRN_Z - ring), 0.07)
  // The islet's own edge, faint, so the square reads as cut.
  ctx.strokeStyle = tint(INK, 0.18)
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, size - 2, size - 2)
  return toTexture(canvas)
}

/** A neighbouring light islet: the same sand without anyone's footprints. */
function sandTexture(rnd: () => number): THREE.CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = SAND
  ctx.fillRect(0, 0, size, size)
  mottle(ctx, size, size, rnd, 60, FOAM, INK)
  ctx.strokeStyle = tint(FOAM, 0.7)
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, size, size)
  return toTexture(canvas)
}

/** Columnar basalt: dark, a faint hexagonal jointing, a wet sheen at the edges. */
function basaltTexture(rnd: () => number): THREE.CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = BASALT
  ctx.fillRect(0, 0, size, size)
  mottle(ctx, size, size, rnd, 90, FOAM, INK)
  ctx.strokeStyle = tint(INK, 0.35)
  ctx.lineWidth = 1.2
  const r = 11
  for (let row = -1; row < size / (r * 1.5) + 1; row++) {
    for (let col = -1; col < size / (r * 1.732) + 1; col++) {
      const cx = col * r * 1.732 + (row % 2 ? r * 0.866 : 0)
      const cy = row * r * 1.5
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k / 6) * Math.PI * 2
        const x = cx + Math.cos(a) * r * (0.94 + rnd() * 0.06), y = cy + Math.sin(a) * r * (0.94 + rnd() * 0.06)
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, 24)
  sheen.addColorStop(0, tint(SKY, 0.45))
  sheen.addColorStop(1, tint(SKY, 0))
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, size, 24)
  ctx.strokeStyle = tint(FOAM, 0.5)
  ctx.lineWidth = 5
  ctx.strokeRect(0, 0, size, size)
  return toTexture(canvas)
}

/** Channel water: deep teal with painted highlights, strokes of foam and sky along the channel. Tiles every 3 m. */
function waterTexture(rnd: () => number): THREE.CanvasTexture {
  const size = 512
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = WATER
  ctx.fillRect(0, 0, size, size)
  ctx.lineCap = 'round'
  const stroke = (color: string, alpha: number, len: number, width: number): void => {
    const x = rnd() * size, y = rnd() * size
    ctx.strokeStyle = tint(color, alpha)
    ctx.lineWidth = width
    for (const dx of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(x + dx, y)
      ctx.lineTo(x + dx + len, y + (rnd() - 0.5) * 2)
      ctx.stroke()
    }
  }
  for (let i = 0; i < 260; i++) stroke(SKY, 0.10 + rnd() * 0.12, 18 + rnd() * 50, 2 + rnd() * 2)
  for (let i = 0; i < 70; i++) stroke(FOAM, 0.22 + rnd() * 0.2, 8 + rnd() * 22, 1.5 + rnd() * 1.5)
  for (let i = 0; i < 90; i++) stroke(INK, 0.10 + rnd() * 0.1, 20 + rnd() * 40, 2)
  return toTexture(canvas, true)
}

/** The sky: a flat painted greenish overcast, barely lighter toward the horizon. */
function skyTexture(rnd: () => number): THREE.CanvasTexture {
  const w = 64, h = 256
  const [canvas, ctx] = makeCanvas(w, h)
  ctx.fillStyle = SKY
  ctx.fillRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h)
  g.addColorStop(0, tint(FOAM, 0))
  g.addColorStop(1, tint(FOAM, 0.28))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  brush(ctx, w, h, FOAM, 60, 0, rnd)
  return toTexture(canvas)
}

/** Driftwood planks painted sand mustard: seams, nails, brush strokes along the grain, salt bleach above. */
function plankTexture(o: { color: string; vertical: boolean; bleach: number; seed: string }): THREE.CanvasTexture {
  const rnd = seeded(o.seed)
  const size = 512
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = o.color
  ctx.fillRect(0, 0, size, size)
  const plank = 52
  for (let i = 0; i < size / plank + 1; i++) {
    const p = i * plank
    ctx.fillStyle = tint(rnd() < 0.5 ? INK : FOAM, 0.03 + rnd() * 0.04)
    if (o.vertical) ctx.fillRect(p, 0, plank, size); else ctx.fillRect(0, p, size, plank)
    ctx.fillStyle = tint(INK, 0.32)
    if (o.vertical) ctx.fillRect(p, 0, 2, size); else ctx.fillRect(0, p, size, 2)
    // One end joint per plank, staggered; nails either side of it.
    const j = (0.15 + rnd() * 0.7) * size
    ctx.fillStyle = tint(INK, 0.22)
    if (o.vertical) ctx.fillRect(p, j, plank, 2); else ctx.fillRect(j, p, 2, plank)
    ctx.fillStyle = tint(INK, 0.45)
    for (const s of [-1, 1]) {
      const nx = o.vertical ? p + plank / 2 : j + s * 7
      const ny = o.vertical ? j + s * 7 : p + plank / 2
      ctx.beginPath(); ctx.arc(nx, ny, 1.6, 0, Math.PI * 2); ctx.fill()
    }
  }
  brush(ctx, size, size, INK, 500, o.vertical ? Math.PI / 2 : 0, rnd)
  brush(ctx, size, size, FOAM, 300, o.vertical ? Math.PI / 2 : 0, rnd)
  if (o.bleach > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, size * 0.4)
    g.addColorStop(0, tint(FOAM, o.bleach))
    g.addColorStop(1, tint(FOAM, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return toTexture(canvas)
}

/**
 * The Surveyor's slate: sixty-four names in his hand, the other files rubbed to ghosts, and the h-file
 * chalked fresh with the Kettle boats' older names, in the older hand.
 */
function slateTexture(): THREE.CanvasTexture {
  const rnd = seeded('eider:slate')
  const w = 512, h = 384
  const [canvas, ctx] = makeCanvas(w, h)
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, w, h)
  mottle(ctx, w, h, rnd, 40, FOAM, CHALK)
  // Chalk dust: the ghosts of fifty-six names in seven columns, rubbed out and written over.
  ctx.font = `400 13px ${FONT_MONO}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = tint(CHALK, 0.11)
  FILES.slice(0, 7).forEach((f, col) => {
    RANKS.forEach((r, row) => {
      const sq = `${f}${r}` as Square
      ctx.fillText(isletName(sq), 12 + col * 71 + (rnd() - 0.5) * 3, 28 + row * 42 + (rnd() - 0.5) * 3)
    })
  })
  ctx.fillStyle = tint(CHALK, 0.06)
  for (let i = 0; i < 24; i++) {
    ctx.beginPath()
    ctx.ellipse(rnd() * w, rnd() * h, 30 + rnd() * 60, 8 + rnd() * 10, (rnd() - 0.5) * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  // The h-file, fresh, in the older hand: every glyph set a hair off its line.
  const names = dressing.slate
  ctx.font = `700 31px ${FONT_MONO}`
  const rows = RANKS.map((r) => `h${r}` as Square & `h${Rank}`)
  rows.forEach((sq, i) => {
    const y = 28 + i * 42
    const line = `${sq}  ${names[sq]}`
    ctx.save()
    ctx.translate(20, y)
    ctx.rotate((rnd() - 0.5) * 0.02)
    let x = 0
    for (const ch of line) {
      ctx.fillStyle = tint(CHALK, 0.72 + rnd() * 0.24)
      ctx.fillText(ch, x, (rnd() - 0.5) * 3)
      x += ctx.measureText(ch).width + (rnd() - 0.5) * 1.5
    }
    ctx.restore()
  })
  // A chalk line under the eighth name, and the initials.
  ctx.strokeStyle = tint(CHALK, 0.7)
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.moveTo(22, 360); ctx.lineTo(300 + rnd() * 20, 358 + rnd() * 3); ctx.stroke()
  ctx.font = `400 20px ${FONT_MONO}`
  ctx.fillStyle = tint(CHALK, 0.8)
  ctx.fillText('L.V.', w - 78, 356)
  return toTexture(canvas)
}

/** Seventy-nine postcards on edge: their edges as fine lines, a typed line showing on the top one. */
function cardEdgesTexture(): THREE.CanvasTexture {
  const size = 128
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.fillStyle = CHALK
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = tint(INK, 0.22)
  for (let i = 0; i < dressing.postcards.count; i++) ctx.fillRect(0, Math.round((i / dressing.postcards.count) * size), size, 1)
  return toTexture(canvas)
}

// ───────────────────────────── Objects ─────────────────────────────

/** A small HS tag painted straight onto an object: ink on the object's own colour, no border. */
function hsTag(text: string, width: number, bg: string, color: string = INK): THREE.Mesh {
  const m = placard({ lines: [text], width, height: width * 0.22, bg, color, font: 'sans' })
  m.name = 'hs-tag'
  return m
}

/** The sand, the channels, the neighbouring slabs, the water to the horizon and the painted sky. */
function ground(rnd: () => number): { group: THREE.Group; water: THREE.MeshStandardMaterial } {
  const g = new THREE.Group()
  g.name = 'ground'

  const top = mesh(new THREE.PlaneGeometry(ISLET, ISLET), painted(isletTexture(rnd), 0.96))
  top.rotation.x = -Math.PI / 2
  top.position.y = 0
  g.add(top)
  const slab = box(ISLET, 0.24, ISLET, mat.flat(FOAM), 0, -0.121, 0)
  g.add(slab)

  // Neighbours: a 7 × 7 neighbourhood of the grid, light and dark by the chess parity of e4 (light).
  const light: THREE.Matrix4[] = []
  const dark: THREE.Matrix4[] = []
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (i === 0 && j === 0) continue
      const isLight = (i + j) % 2 === 0
      const m = new THREE.Matrix4().makeTranslation(i * PITCH, isLight ? -0.12 : -0.09, j * PITCH)
      ;(isLight ? light : dark).push(m)
    }
  }
  const lightMesh = new THREE.InstancedMesh(boxGeo(ISLET, 0.24, ISLET), painted(sandTexture(rnd), 0.96), light.length)
  light.forEach((m, k) => lightMesh.setMatrixAt(k, m))
  lightMesh.name = 'islets:light'
  g.add(lightMesh)
  const darkMesh = new THREE.InstancedMesh(boxGeo(ISLET, 0.3, ISLET), painted(basaltTexture(rnd), 0.7), dark.length)
  dark.forEach((m, k) => darkMesh.setMatrixAt(k, m))
  darkMesh.name = 'islets:dark'
  g.add(darkMesh)

  // Water: one plane under the channels, running to the painted horizon.
  const waterMap = waterTexture(rnd)
  waterMap.repeat.set(140 / 3, 80 / 3)
  const water = painted(waterMap, 0.55)
  const sea = mesh(new THREE.PlaneGeometry(140, 80), water, 0, -0.16, -22)
  sea.rotation.x = -Math.PI / 2
  sea.name = 'water'
  g.add(sea)

  // The sky: a flat painted plane behind everything, unlit.
  const sky = mesh(new THREE.PlaneGeometry(220, 70), new THREE.MeshBasicMaterial({ map: skyTexture(rnd) }), 0, 20, -58)
  sky.name = 'sky'
  g.add(sky)
  return { group: g, water }
}

/** The hut, the double doors open toward the camera, the dark interior, the table and the slate. */
function hut(): { group: THREE.Group; slate: THREE.Group; postTops: THREE.Vector3[] } {
  const g = new THREE.Group()
  g.name = 'hut'
  const { w, d, front, back, wall } = HUT
  const planks = painted(plankTexture({ color: MUSTARD, vertical: false, bleach: 0.22, seed: 'eider:hut' }), 0.9)
  const planksV = painted(plankTexture({ color: MUSTARD, vertical: true, bleach: 0.1, seed: 'eider:door' }), 0.9)
  const roofing = painted(plankTexture({ color: MUSTARD, vertical: false, bleach: 0.45, seed: 'eider:roof' }), 0.95)
  const timber = mat.flat(DRIFTWOOD)

  // Floor and a threshold step.
  g.add(box(w, 0.02, d, timber, 0, 0.01, 0))
  g.add(box(DOOR.w + 0.12, 0.03, 0.12, timber, 0, 0.015, d / 2 + 0.06))

  // Front wall with the door opening; back wall; side walls as trapezoids under the shed roof.
  const panelW = (w - DOOR.w) / 2
  g.add(box(panelW, front, wall, planks, -(DOOR.w / 2 + panelW / 2), front / 2, d / 2 - wall / 2))
  g.add(box(panelW, front, wall, planks, DOOR.w / 2 + panelW / 2, front / 2, d / 2 - wall / 2))
  g.add(box(DOOR.w, front - DOOR.h, wall, planks, 0, DOOR.h + (front - DOOR.h) / 2, d / 2 - wall / 2))
  g.add(box(w, back, wall, planks, 0, back / 2, -d / 2 + wall / 2))
  const side = new THREE.Shape()
  side.moveTo(-d / 2, 0); side.lineTo(d / 2, 0); side.lineTo(d / 2, front); side.lineTo(-d / 2, back); side.closePath()
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: wall, bevelEnabled: false })
  for (const sx of [-1, 1]) {
    const s = mesh(sideGeo, planks, sx > 0 ? w / 2 : -w / 2 + wall, 0, 0)
    s.rotation.y = -Math.PI / 2
    g.add(s)
  }

  // The interior, dark: a lining seen from inside only.
  const lining = box(w - 2 * wall - 0.01, front - 0.05, d - 2 * wall - 0.01, new THREE.MeshStandardMaterial({ color: BASALT, roughness: 1, metalness: 0, side: THREE.BackSide }), 0, 0.03 + (front - 0.05) / 2, 0)
  g.add(lining)

  // The shed roof, sloping toward the camera, with an overhang.
  const over = 0.07
  const rise = back - front
  const roofLen = Math.hypot(d + 2 * over, rise)
  const roof = box(w + 2 * over, 0.03, roofLen, roofing, 0, (front + back) / 2 + 0.015, 0)
  roof.rotation.x = Math.atan2(rise, d + 2 * over)
  g.add(roof)

  // Corner posts standing proud of the roof, brass-capped: the cords tie here.
  const postTops: THREE.Vector3[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hWall = sz > 0 ? front : back
      const hPost = hWall + HUT.post
      g.add(cyl(0.024, 0.028, hPost, timber, sx * (w / 2 - 0.02), hPost / 2, sz * (d / 2 - 0.02), 10))
      g.add(cyl(0.03, 0.03, 0.012, mat.brass(), sx * (w / 2 - 0.02), hPost + 0.006, sz * (d / 2 - 0.02), 12))
      postTops.push(new THREE.Vector3(sx * (w / 2 - 0.02), hPost + 0.012, sz * (d / 2 - 0.02)))
    }
  }

  // Door jambs and lintel; two leaves swung out toward the camera.
  for (const sx of [-1, 1]) g.add(box(0.03, DOOR.h + 0.02, wall + 0.02, timber, sx * (DOOR.w / 2 + 0.015), (DOOR.h + 0.02) / 2, d / 2 - wall / 2))
  g.add(box(DOOR.w + 0.06, 0.03, wall + 0.02, timber, 0, DOOR.h + 0.015, d / 2 - wall / 2))
  const leafW = DOOR.w / 2 - 0.006
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group()
    hinge.position.set(sx * (DOOR.w / 2), 0, d / 2 + 0.012)
    hinge.rotation.y = sx * 1.95
    const leaf = box(leafW, DOOR.h - 0.02, 0.02, planksV, -sx * leafW / 2, DOOR.h / 2, 0)
    hinge.add(leaf)
    const handle = cyl(0.008, 0.008, 0.05, mat.brass(), -sx * (leafW - 0.04), DOOR.h * 0.48, 0.016, 8)
    hinge.add(handle)
    g.add(hinge)
  }

  // HS-1001, painted small above the door, centred.
  const t = hsTag('HS-1001 · HUT · DRIFTWOOD · 1957', 0.3, MUSTARD)
  t.position.set(0, front - 0.06, d / 2 + 0.001)
  g.add(t)

  // Inside: a table against the back wall, the slate standing on it, a chalk stub.
  const table = new THREE.Group()
  table.name = 'table'
  const tw = 0.5, td = 0.24, th = 0.34
  table.add(box(tw, 0.025, td, timber, 0, th - 0.0125, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(box(0.025, th - 0.025, 0.025, timber, sx * (tw / 2 - 0.03), (th - 0.025) / 2, sz * (td / 2 - 0.03)))
  table.add(cyl(0.006, 0.006, 0.04, mat.flat(CHALK), 0.18, th + 0.006, 0.07, 8).rotateZ(Math.PI / 2))
  table.position.set(0, 0.02, -d / 2 + wall + td / 2 + 0.02)
  g.add(table)

  const slate = new THREE.Group()
  slate.name = 'slate'
  const sw = 0.44, sh = 0.32
  const frame = box(sw, sh, 0.018, timber, 0, sh / 2, 0)
  slate.add(frame)
  const face = mesh(new THREE.PlaneGeometry(sw - 0.04, sh - 0.04), painted(slateTexture(), 0.98), 0, sh / 2, 0.0095)
  slate.add(face)
  const st = hsTag("HS-1003 · THE SURVEYOR'S SLATE", 0.2, DRIFTWOOD, CHALK)
  st.position.set(0, 0.01, 0.0095)
  slate.add(st)
  slate.position.set(0, 0.02 + th, table.position.z - td / 2 + 0.05)
  slate.rotation.x = -0.14
  g.add(slate)

  return { group: g, slate, postTops }
}

/** The cairn: a stack of basalt stones with a salt-white top and the brass plate on its face. */
function cairn(rnd: () => number): { group: THREE.Group; plate: THREE.Group; top: THREE.Vector3 } {
  const g = new THREE.Group()
  g.name = 'cairn'
  const tiers: { y: number; r: number; n: number; s: number }[] = [
    { y: 0.065, r: 0.16, n: 9, s: 1.0 },
    { y: 0.18, r: 0.13, n: 8, s: 0.92 },
    { y: 0.29, r: 0.105, n: 7, s: 0.84 },
    { y: 0.39, r: 0.08, n: 6, s: 0.74 },
    { y: 0.475, r: 0.05, n: 4, s: 0.66 },
    { y: 0.54, r: 0.0, n: 1, s: 0.62 },
  ]
  const count = tiers.reduce((a, t) => a + t.n, 0)
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), mat.flat(BASALT), count)
  stones.name = 'stones'
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  let k = 0
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      const a = (i / t.n) * Math.PI * 2 + rnd() * 0.3
      const rr = t.r * (0.9 + rnd() * 0.2)
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
      q.setFromEuler(e)
      const s = t.s * (0.92 + rnd() * 0.16)
      m.compose(new THREE.Vector3(Math.cos(a) * rr, t.y, Math.sin(a) * rr), q, new THREE.Vector3(s * 1.25, s * 0.8, s * 1.1))
      stones.setMatrixAt(k++, m)
    }
  }
  g.add(stones)
  const cap = mesh(new THREE.IcosahedronGeometry(0.052, 1), mat.flat(FOAM), 0, CAIRN_H - 0.045, 0)
  cap.scale.set(1.3, 0.85, 1.1)
  g.add(cap)

  const plate = new THREE.Group()
  plate.name = 'plate'
  const pw = 0.3, ph = 0.08
  plate.add(box(pw + 0.02, ph + 0.02, 0.012, mat.brass(), 0, 0, 0))
  const face = placard({ lines: [plateText('e4', SURVEY_YEAR, true)], width: pw, height: ph, bg: BRASS, color: INK, border: INK, font: 'sans' })
  face.position.z = 0.0065
  plate.add(face)
  plate.position.set(0, 0.31, 0.19)
  plate.rotation.x = -0.12
  g.add(plate)
  g.position.set(0, 0, CAIRN_Z)
  return { group: g, plate, top: new THREE.Vector3(0, CAIRN_H, CAIRN_Z) }
}

/** Four tagged cords from the hut's corner posts to the cairn's top, each tag stating its measure. */
function cords(from: THREE.Vector3[], to: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cords'
  const cord = mat.flat(INK)
  const corner = (p: THREE.Vector3): string => `${p.z > 0 ? 'S' : 'N'}${p.x > 0 ? 'E' : 'W'}`
  for (const a of from) {
    g.add(tube(a, to, 0.0035, cord))
    const at = a.clone().lerp(to, a.z > 0 ? 0.5 : 0.62)
    const t = tag(`CORD ${corner(a)}\n${surveyed(a.distanceTo(to))}\nA.H.`, { color: P.paper, ink: INK })
    t.position.copy(at)
    t.rotation.y = a.x > 0 ? -0.25 : 0.25
    g.add(t)
  }
  return g
}

/** The Surveyor on his stool, outside, on the left: the one flaw. */
function surveyor(): { group: THREE.Group; anchor: THREE.Object3D } {
  const g = new THREE.Group()
  g.name = 'surveyor'
  const seat = stoolProp({ colors: P, height: 0.45, seat: 0.32, seed: 'eider:stool' })
  seat.scale.setScalar(0.1)
  g.add(seat)
  const voss = figure({ variant: 'voss', seated: true, seatHeight: 0.45 })
  voss.scale.setScalar(0.1)
  voss.userData.hotspot = 'eider.voss'
  g.add(voss)
  g.position.copy(STOOL_AT)
  g.rotation.y = 0.18
  return { group: g, anchor: voss }
}

/** The tin of postcards, seventy-nine on edge, the 9 June card uppermost. */
function postcards(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'postcards'
  const tw = 0.15, th = 0.07, td = 0.105
  const tin = mat.enamel(BASALT)
  g.add(box(tw, 0.004, td, tin, 0, 0.002, 0))
  g.add(box(tw, th, 0.004, tin, 0, th / 2, -td / 2 + 0.002))
  g.add(box(tw, th, 0.004, tin, 0, th / 2, td / 2 - 0.002))
  g.add(box(0.004, th, td, tin, -tw / 2 + 0.002, th / 2, 0))
  g.add(box(0.004, th, td, tin, tw / 2 - 0.002, th / 2, 0))
  const edges = painted(cardEdgesTexture(), 0.95)
  const cards = box(tw - 0.014, 0.086, td - 0.014, edges, 0, 0.004 + 0.043, 0)
  cards.rotation.x = -0.06
  g.add(cards)
  const june = placard({ lines: ['9 JUNE', dressing.postcards.juneCard], width: 0.1, height: 0.064, bg: P.paper, color: INK, font: 'mono' })
  june.position.set(0, 0.092, 0.006)
  june.rotation.x = -Math.PI / 2 - 0.06
  g.add(june)
  const t = hsTag('HS-1007 · POSTCARDS, 79', 0.11, BASALT, FOAM)
  t.position.set(0, th * 0.5, td / 2 + 0.0025)
  g.add(t)
  g.position.copy(TIN_AT)
  g.rotation.y = -0.2
  return g
}

/** The Surveyor's punt and its pole, beached: flat-bottomed, square-ended, a mustard gunwale. */
function punt(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'punt'
  const L = 0.62, W = 0.15, H = 0.06
  const timber = mat.flat(DRIFTWOOD)
  const profile = new THREE.Shape()
  profile.moveTo(-L / 2 + 0.05, 0); profile.lineTo(L / 2 - 0.05, 0); profile.lineTo(L / 2, H); profile.lineTo(-L / 2, H); profile.closePath()
  const hullGeo = new THREE.ExtrudeGeometry(profile, { depth: W, bevelEnabled: false })
  const hull = mesh(hullGeo, timber, 0, 0, -W / 2)
  g.add(hull)
  const inner = box(L - 0.06, H - 0.012, W - 0.024, new THREE.MeshStandardMaterial({ color: BASALT, roughness: 1, metalness: 0, side: THREE.BackSide }), 0, H / 2 + 0.006, 0)
  g.add(inner)
  for (const s of [-1, 1]) g.add(box(L - 0.02, 0.012, 0.012, mat.flat(MUSTARD), 0, H + 0.006, s * (W / 2 - 0.006)))
  for (const x of [-L * 0.22, L * 0.22]) g.add(box(0.03, 0.008, W - 0.03, timber, x, H - 0.012, 0))
  const pole = tube(new THREE.Vector3(-L * 0.45, 0.008, W / 2 + 0.03), new THREE.Vector3(L * 0.5, 0.008, W / 2 + 0.05), 0.006, timber, 8)
  g.add(pole)
  const t = hsTag('HS-1009 · PUNT AND POLE', 0.16, DRIFTWOOD, INK)
  t.position.set(0, H * 0.55, W / 2 + 0.0015)
  g.add(t)
  g.position.copy(PUNT_AT)
  g.rotation.y = PUNT_YAW
  return g
}

/** The house miniature on the island's rock, small on the left horizon. */
function houseMiniature(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'house-miniature'
  const rock = mesh(new THREE.IcosahedronGeometry(2.6, 1), mat.flat(tokens['out.rock']), 0, -0.4, 0)
  rock.scale.set(1.6, 0.42, 1)
  g.add(rock)
  const walls = mat.flat(tokens['hs.wall'])
  g.add(box(2.1, 1.26, 0.9, walls, 0, 0.63 + 0.4, 0))
  g.add(box(2.2, 0.06, 1.0, mat.flat(tokens['out.rock']), 0, 1.7, 0))
  g.add(box(0.6, 0.42, 0.6, walls, 0, 1.94, 0))
  g.add(cyl(0.34, 0.34, 0.3, mat.brass(), 0, 2.3, 0, 8))
  g.add(cyl(0.4, 0.3, 0.16, mat.flat(BASALT), 0, 2.53, 0, 8))
  const lamp = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: tokens['grid.beacon'], emissive: tokens['grid.beacon'], emissiveIntensity: 1.2, roughness: 1, metalness: 0 }), 0, 2.32, 0.34)
  g.add(lamp)
  g.position.copy(HOUSE_AT)
  return g
}

/** Painted contact shadows, one merged mesh: a soft disc (or an ellipse, or a square) under every object. */
function contacts(specs: { x: number; z: number; r: number; sx?: number; sz?: number; square?: boolean }[]): THREE.Mesh {
  const proto = buildContactDisc(1)
  proto.geometry.dispose()
  const parts: THREE.BufferGeometry[] = []
  for (const s of specs) {
    const geo = s.square ? new THREE.PlaneGeometry(2, 2) : new THREE.CircleGeometry(1, 28)
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(s.x, 0, s.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      new THREE.Vector3(s.r * (s.sx ?? 1), s.r * (s.sz ?? 1), 1),
    )
    geo.applyMatrix4(m)
    parts.push(geo)
  }
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  const out = new THREE.Mesh(merged, proto.material)
  out.name = 'contact'
  out.renderOrder = 1
  out.position.y = 0.004
  return out
}

// ───────────────────────────── Budget ─────────────────────────────

/** Counts the triangles and draw calls a group would cost as built (instances and material groups included). */
export function budgetOf(root: THREE.Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0
  let drawCalls = 0
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return
    const geo = o.geometry as THREE.BufferGeometry
    const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3
    const instances = o instanceof THREE.InstancedMesh ? o.count : 1
    const groups = Array.isArray(o.material) ? Math.max(1, geo.groups.length) : 1
    triangles += tris * instances
    drawCalls += groups
  })
  return { triangles: Math.round(triangles), drawCalls }
}

// ───────────────────────────── The frame ─────────────────────────────

/**
 * Builds Eider Reach (e4): the hut dead centre with its doors open toward the camera, the slate inside,
 * the cairn and its plate before it on the axis, four tagged cords, the Surveyor on his stool on the
 * left (the flaw), the tin of postcards by the door, the punt at the right edge, the neighbouring
 * slabs and channels beyond and the house miniature on the left horizon. Registers every hotspot of
 * `ctx.def`; the channel water drifts through `group.userData.tick(dt)`.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const hotspots = new Map<string, THREE.Object3D>()
  const rnd = ctx.rnd

  const g = ground(rnd)
  group.add(g.group)

  const h = hut()
  h.group.userData.hotspot = 'eider.hut'
  h.slate.userData.hotspot = 'eider.slate'
  group.add(h.group)
  hotspots.set('eider.hut', h.group)
  hotspots.set('eider.slate', h.slate)

  const c = cairn(rnd)
  c.plate.userData.hotspot = 'eider.plate'
  group.add(c.group)
  hotspots.set('eider.plate', c.plate)

  group.add(cords(h.postTops, c.top))

  const s = surveyor()
  group.add(s.group)
  hotspots.set('eider.voss', s.anchor)

  const tin = postcards()
  tin.userData.hotspot = 'eider.postcards'
  group.add(tin)
  hotspots.set('eider.postcards', tin)

  const boat = punt()
  boat.userData.hotspot = 'eider.punt'
  group.add(boat)
  hotspots.set('eider.punt', boat)

  group.add(houseMiniature())

  group.add(contacts([
    { x: 0, z: 0.02, r: 0.6, sx: 1.0, sz: 1.04, square: true },
    { x: 0, z: CAIRN_Z, r: 0.3 },
    { x: STOOL_AT.x, z: STOOL_AT.z + 0.02, r: 0.075 },
    { x: TIN_AT.x, z: TIN_AT.z, r: 0.1 },
    { x: PUNT_AT.x, z: PUNT_AT.z, r: 0.14, sx: 2.6, sz: 1.0 },
  ]))

  // The channel water drifts along the channels; nothing else moves, and nothing moves on hover.
  const map = g.water.map
  group.userData.tick = (dt: number): void => {
    if (map) map.offset.x = (map.offset.x + dt * 0.004) % 1
  }

  // Every hotspot of the definition is registered; a hotspot without a body of its own uses the hut.
  for (const hs of ctx.def.hotspots) if (!hotspots.has(hs.id)) { hotspots.set(hs.id, h.group) }

  const budget = budgetOf(group)
  group.userData.budget = budget
  console.info(`[eider] triangles ${budget.triangles}, draw calls ${budget.drawCalls}`)

  return { id: ctx.def.id, group, hotspots, residentAnchor: s.anchor }
}

/** The slate's names in build order, for tests and the insert: h1 to h8 in the older hand. */
export const SLATE_LINES: string[] = RANKS.map((r) => `h${r}  ${SLATE_NAMES[`h${r}` as Square & `h${Rank}`]}`)
