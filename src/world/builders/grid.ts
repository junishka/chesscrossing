// Frame O4: The Sixty-Four. One re-dressed islet stage (bible §7 O4, §3.4, §14.2): a 9.1 m islet of
// shell-sand or columnar basalt, the cairn dead centre with its brass plate, 1.1 m channels of painted
// teal either side and behind, the neighbouring islets as flat slabs, the house miniature small on the
// left horizon under a painted sky. Every islet is this stage re-dressed: `redress` swaps the surface,
// the plate, the one flaw and the one found object. The founder's chart lies on a table 100 m along +x,
// straight under the def's `chart` station; `setChart` inks, ticks and pins it. No shadow maps outdoors:
// contact discs are painted under everything that stands on the sand.
import * as THREE from 'three'
import type { Square } from '../../types'
import { palette, tokens } from '../../content/palette'
import { dressing } from '../../content/frames/grid'
import { FILES, RANKS, FILE_WORDS, RANK_WORDS, SURVEY_YEAR, fileRank, legend } from '../../content/survey'
import { CORRESPONDENCE_PGN } from '../../content/correspondence'
import { labelTexture, mat } from '../../scene/materials'
import { tag as paperTag } from '../../scene/text3d'
import { buildContactDisc } from '../../scene/pieces'
import { table as tableProp } from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

// ───────────────────────────── Palette (§3.4 only) ─────────────────────────────

const P = palette.beyond
const SAND = tokens['grid.lightIslet']
const BASALT = tokens['grid.darkIslet']
const WATER = tokens['grid.channel']
const FOAM = tokens['out.foam']
const BRASS = tokens['grid.cairnBrass']
const SKY = tokens['grid.sky']
const SKY_DUSK = tokens['grid.skyDusk']
const INK = tokens['grid.ink']
const RED = tokens['grid.beacon']
const PAPER = P.paper
const MUSTARD = P.accent2
const DRIFTWOOD = P.wood
const ROCK = P.woodGrain

// ───────────────────────────── Dimensions (§7, 1:10) ─────────────────────────────

const ISLET = dressing.islet.size
const CHANNEL = dressing.islet.channel
const CAIRN_H = dressing.islet.cairn
const PITCH = ISLET + CHANNEL
const SLAB_T = 0.4
const WATER_Y = -0.16
const HORIZON_Z = -52
const CHART_AT = new THREE.Vector3(dressing.chart.table[0], dressing.chart.table[1], dressing.chart.table[2])
const CHART_PAPER = dressing.chart.size
/** The 8 × 8 grid drawn inside the 1.4 m paper: 1.0 m, so all eight ranks sit inside the 2.40:1 frame at 80 mm. */
const CHART_GRID = 1.0
const CHART_SQ = CHART_GRID / 8
const STONES = 20
const OBJECT_Z = 1.45

type Rgb = [number, number, number]

function parse(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** CSS colour of `a` mixed toward `b` by `t`, with an alpha: every painted tone is a mix of two palette colours. */
function mix(a: string, b: string, t: number, alpha = 1): string {
  const A = parse(a), B = parse(b)
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t))
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}

// ───────────────────────────── Caches and helpers ─────────────────────────────

const geometries = new Map<string, THREE.BufferGeometry>()
const textures = new Map<string, THREE.CanvasTexture>()
const plateTextures = new Map<string, THREE.CanvasTexture>()
const tagGroups = new Map<string, THREE.Group>()

function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometries.get(key)
  if (hit) return hit as T
  const g = make()
  geometries.set(key, g)
  return g
}

function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  return geo(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d))
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  return me
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(boxGeo(w, h, d), m, x, y, z)
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  return mesh(geo(`cyl:${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z)
}

/** A cylinder whose axis runs along x. */
function rodX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const me = cyl(r, r, len, m, x, y, z, seg)
  me.rotation.z = Math.PI / 2
  return me
}

/** A painted canvas texture, cached by key. */
function painted(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const hit = textures.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  paint(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  textures.set(key, tex)
  return tex
}

/** Matte painted surface with a canvas map. */
function paintedMat(tex: THREE.CanvasTexture, roughness = 0.95, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0, ...extra })
}

/** Cairn brass (§3.4), metallic, lightly rough. */
function brassMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.42, metalness: 0.85 })
}

/** Flat-faceted paint: the stop-motion look. */
function facet(color: string, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true })
}

/** A stroke that wraps around the tile's edges so the texture repeats without seams. */
function wrappedLine(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, x2: number, y2: number): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    ctx.beginPath()
    ctx.moveTo(x + ox, y + oy)
    ctx.lineTo(x2 + ox, y2 + oy)
    ctx.stroke()
  }
}

function wrappedEllipse(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, rx: number, ry: number, rot: number): void {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    ctx.beginPath()
    ctx.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A seeded PRNG local to one painting, so every canvas is the same for every player. */
function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────────── Painted surfaces ─────────────────────────────

/** Dry shell-sand: a warm flat, faint shell speckle, footprint ticks painted darker. Tiles 3 × 3 over the islet. */
function sandTexture(): THREE.CanvasTexture {
  return painted('grid:sand', 512, 512, (ctx, w, h) => {
    const rnd = prng(41)
    ctx.fillStyle = SAND
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() < 0.5 ? mix(SAND, FOAM, 0.6, 0.35) : mix(SAND, INK, 0.25, 0.18)
      wrappedEllipse(ctx, w, h, rnd() * w, rnd() * h, 1 + rnd() * 2.5, 0.8 + rnd() * 1.5, rnd() * Math.PI)
    }
    ctx.fillStyle = mix(SAND, INK, 0.42, 0.75)
    for (let i = 0; i < 110; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI
      const step = 9 + rnd() * 4
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1
        const px = x + Math.cos(a) * step * k + Math.cos(a + Math.PI / 2) * side * 4
        const py = y + Math.sin(a) * step * k + Math.sin(a + Math.PI / 2) * side * 4
        wrappedEllipse(ctx, w, h, px, py, 5.5, 2.2, a)
      }
    }
  }, [3, 3])
}

/** Columnar basalt: a hexagonal column pattern, each column its own flat tone, edges wet and lighter. */
function basaltTexture(): THREE.CanvasTexture {
  return painted('grid:basalt', 512, 512, (ctx, w, h) => {
    const rnd = prng(7)
    ctx.fillStyle = BASALT
    ctx.fillRect(0, 0, w, h)
    const cols = 12, rows = 10
    const R = w / (cols * 1.5)
    const dy = h / rows
    const hex = (cx: number, cy: number): [number, number][] => {
      const pts: [number, number][] = []
      for (let k = 0; k < 6; k++) pts.push([cx + R * Math.cos((Math.PI / 3) * k), cy + (dy / Math.sqrt(3)) * Math.sin((Math.PI / 3) * k)])
      return pts
    }
    const draw = (cx: number, cy: number, fill: string) => {
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const pts = hex(cx + ox, cy + oy)
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = mix(BASALT, FOAM, 0.5, 0.85)
        ctx.lineWidth = 2.2
        ctx.stroke()
        ctx.strokeStyle = mix(BASALT, FOAM, 0.75, 0.5)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pts[3][0], pts[3][1])
        ctx.lineTo(pts[4][0], pts[4][1])
        ctx.lineTo(pts[5][0], pts[5][1])
        ctx.stroke()
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = c * 1.5 * R
        const cy = r * dy + (c % 2 ? dy / 2 : 0)
        const t = rnd()
        const fill = t < 0.5 ? mix(BASALT, INK, 0.05 + rnd() * 0.18) : mix(BASALT, FOAM, rnd() * 0.12)
        draw(cx, cy, fill)
      }
    }
  }, [3, 3])
}

/** The basalt islet's flank: vertical columns, a wet lighter band along the top. */
function basaltSideTexture(): THREE.CanvasTexture {
  return painted('grid:basalt-side', 256, 128, (ctx, w, h) => {
    const rnd = prng(19)
    ctx.fillStyle = BASALT
    ctx.fillRect(0, 0, w, h)
    const n = 14
    for (let i = 0; i < n; i++) {
      const x0 = (i * w) / n
      ctx.fillStyle = mix(BASALT, INK, 0.04 + rnd() * 0.16)
      ctx.fillRect(x0, 0, w / n + 1, h)
      ctx.fillStyle = mix(BASALT, FOAM, 0.55, 0.8)
      ctx.fillRect(x0, 0, 2, h)
    }
    ctx.fillStyle = mix(BASALT, FOAM, 0.4, 0.55)
    ctx.fillRect(0, 0, w, 7)
  }, [8, 1])
}

/** The sand islet's flank: a darker damp band, the sand dry above it. */
function sandSideTexture(): THREE.CanvasTexture {
  return painted('grid:sand-side', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = mix(SAND, INK, 0.16)
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = SAND
    ctx.fillRect(0, 0, w, Math.round(h * 0.3))
    ctx.fillStyle = mix(SAND, FOAM, 0.6, 0.6)
    ctx.fillRect(0, Math.round(h * 0.3), w, 2)
  })
}

/** Channel water: deep teal with painted highlights, short horizontal strokes in foam and ink. Tiles 2 m. */
function waterTexture(): THREE.CanvasTexture {
  return painted('grid:water', 256, 256, (ctx, w, h) => {
    const rnd = prng(3)
    ctx.fillStyle = WATER
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'round'
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, len = 10 + rnd() * 34
      ctx.lineWidth = 1.5 + rnd() * 2
      ctx.strokeStyle = mix(WATER, INK, 0.35, 0.35)
      wrappedLine(ctx, w, h, x, y + 3, x + len, y + 3)
    }
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w, y = rnd() * h, len = 8 + rnd() * 28
      ctx.lineWidth = 1.2 + rnd() * 1.8
      ctx.strokeStyle = mix(WATER, FOAM, 0.55, 0.45 + rnd() * 0.3)
      wrappedLine(ctx, w, h, x, y, x + len, y)
    }
  }, [65, 36])
}

/** The painted sky: one flat, a lighter band toward the horizon, horizontal brush strokes. */
function skyTexture(base: string, key: string): THREE.CanvasTexture {
  return painted(key, 512, 256, (ctx, w, h) => {
    const rnd = prng(11)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, base)
    grad.addColorStop(0.62, base)
    grad.addColorStop(1, mix(base, FOAM, 0.42))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'round'
    for (let i = 0; i < 260; i++) {
      const y = h * (0.35 + rnd() * 0.65), x = rnd() * w, len = 24 + rnd() * 48
      ctx.lineWidth = 2 + rnd() * 1.5
      ctx.strokeStyle = mix(base, FOAM, rnd() < 0.5 ? 0.1 : 0.35, 0.06)
      wrappedLine(ctx, w, h, x, y, x + len, y)
    }
  })
}

/** Footprints crossing the sand in one line: alternating left and right, walking along +y of the canvas. */
function footprintLineTexture(color: string, key: string): THREE.CanvasTexture {
  return painted(key, 64, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = color
    const step = 46
    for (let i = 0; i * step < h; i++) {
      const side = i % 2 ? 1 : -1
      ctx.beginPath()
      ctx.ellipse(w / 2 + side * 9, i * step + 20, 4.2, 9, side * 0.12, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w / 2 + side * 9, i * step + 8, 3.4, 3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/** Deck planks under the chart table, seams painted in ink. */
function plankTexture(): THREE.CanvasTexture {
  return painted('grid:planks', 256, 256, (ctx, w, h) => {
    const rnd = prng(23)
    ctx.fillStyle = DRIFTWOOD
    ctx.fillRect(0, 0, w, h)
    const n = 6
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = mix(DRIFTWOOD, rnd() < 0.5 ? ROCK : FOAM, 0.15 + rnd() * 0.2)
      ctx.fillRect(0, (i * h) / n, w, h / n)
      ctx.fillStyle = mix(DRIFTWOOD, INK, 0.6)
      ctx.fillRect(0, (i * h) / n, w, 2)
    }
  }, [1, 6])
}

/** The founder's chart: sixty-four islets in their channels, every survey name, the Society's measurement. 1024². */
function chartTexture(): THREE.CanvasTexture {
  return painted('grid:chart', 1024, 1024, (ctx, w, h) => {
    const rnd = prng(31)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = 1
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, len = 2 + rnd() * 6
      ctx.strokeStyle = mix(PAPER, rnd() < 0.5 ? INK : FOAM, 0.3, 0.12)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
    const px = w / CHART_PAPER
    const sq = CHART_SQ * px
    const gap = CHANNEL / PITCH * sq
    const g0 = (w - CHART_GRID * px) / 2
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.strokeRect(g0 - 26, g0 - 26, CHART_GRID * px + 52, CHART_GRID * px + 52)
    ctx.lineWidth = 1
    ctx.strokeRect(g0 - 20, g0 - 20, CHART_GRID * px + 40, CHART_GRID * px + 40)
    ctx.fillStyle = mix(PAPER, WATER, 0.35)
    ctx.fillRect(g0, g0, CHART_GRID * px, CHART_GRID * px)
    for (let i = 0; i < 100; i++) {
      ctx.strokeStyle = mix(PAPER, WATER, 0.7, 0.35)
      const x = g0 + rnd() * CHART_GRID * px, y = g0 + rnd() * CHART_GRID * px
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 6 + rnd() * 10, y)
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const e of legend) {
      const { file, rank } = fileRank(e.square)
      const i = FILES.indexOf(file), j = RANKS.indexOf(rank)
      const x = g0 + i * sq + gap / 2, y = g0 + (7 - j) * sq + gap / 2, s = sq - gap
      const dark = (i + j) % 2 === 0
      ctx.fillStyle = dark ? mix(PAPER, BASALT, 0.3) : mix(PAPER, SAND, 0.55)
      ctx.fillRect(x, y, s, s)
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.2
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
      ctx.fillStyle = INK
      ctx.font = '500 11px "Courier Prime"'
      ctx.textAlign = 'left'
      ctx.fillText(e.square, x + 5, y + 9)
      ctx.textAlign = 'center'
      ctx.font = '500 11px Jost'
      ctx.fillText(FILE_WORDS[file].toUpperCase(), x + s / 2, y + s * 0.5)
      ctx.fillText(RANK_WORDS[rank].toUpperCase(), x + s / 2, y + s * 0.5 + 13)
      ctx.beginPath()
      ctx.arc(x + s / 2, y + s * 0.82, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = INK
    ctx.font = '500 34px Jost'
    ctx.fillText(dressing.legend.length === 64 ? 'THE SIXTY-FOUR' : 'THE SURVEY', w / 2, g0 - 92)
    ctx.font = '400 15px "Courier Prime"'
    ctx.fillText(`SURVEYED ${SURVEY_YEAR}   A.H.`, w / 2, g0 - 56)
    ctx.fillText(`ISLETS ${dressing.stated.isletYards} YARDS SQUARE   CHANNELS ${dressing.stated.channelYards} YARDS`, w / 2, g0 + CHART_GRID * px + 60)
    ctx.font = '500 13px Jost'
    for (let i = 0; i < 8; i++) {
      ctx.fillText(FILES[i].toUpperCase(), g0 + i * sq + sq / 2, g0 + CHART_GRID * px + 34)
      ctx.fillText(String(RANKS[7 - i]), g0 - 38, g0 + i * sq + sq / 2)
    }
  })
}

// ───────────────────────────── Stage state ─────────────────────────────

interface Surface { top: THREE.Material; side: THREE.Material; foot: THREE.Material }

interface Stage {
  islet: THREE.Mesh
  slabsA: THREE.InstancedMesh
  slabsB: THREE.InstancedMesh
  light: Surface
  dark: Surface
  sky: THREE.Mesh
  skyDay: THREE.Material
  skyDusk: THREE.Material
  plate: THREE.Group
  plateFace: THREE.MeshStandardMaterial
  flaws: THREE.Object3D[]
  objects: THREE.Object3D[]
  footprintLine: THREE.Mesh
  stones: THREE.InstancedMesh
  stoneMatrices: THREE.Matrix4[]
  skewedMatrix: THREE.Matrix4
  tagRack: THREE.Group
  chart: {
    group: THREE.Group
    paper: THREE.Mesh
    ink: THREE.CanvasTexture
    inkCanvas: HTMLCanvasElement
    ticks: THREE.InstancedMesh
    pin: THREE.Group
    anchor: THREE.Object3D
  }
}

const stages = new WeakMap<THREE.Group, Stage>()

// ───────────────────────────── The islet and its neighbours ─────────────────────────────

function surfaces(): { light: Surface; dark: Surface } {
  const sandTop = paintedMat(sandTexture(), 1)
  const basaltTop = paintedMat(basaltTexture(), 0.7)
  return {
    light: { top: sandTop, side: paintedMat(sandSideTexture(), 1), foot: facet(SAND) },
    dark: { top: basaltTop, side: paintedMat(basaltSideTexture(), 0.6), foot: facet(BASALT) },
  }
}

function slabMaterials(s: Surface): THREE.Material[] {
  return [s.side, s.side, s.top, s.foot, s.side, s.side]
}

/** The islet slab, top at y = 0, and the foam line where it meets the water. */
function islet(light: Surface): THREE.Mesh {
  const me = box(ISLET, SLAB_T, ISLET, slabMaterials(light), 0, -SLAB_T / 2, 0)
  me.name = 'islet'
  return me
}

/** The channel's edges: a salt-and-foam line painted along every side of the islet at the water. */
function foamRing(size: number, y: number, width: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'foam'
  const m = facet(FOAM, 1)
  const half = size / 2 + width / 2
  g.add(box(size + width * 2, 0.012, width, m, 0, y, half))
  g.add(box(size + width * 2, 0.012, width, m, 0, y, -half))
  g.add(box(width, 0.012, size, m, half, y, 0))
  g.add(box(width, 0.012, size, m, -half, y, 0))
  return g
}

/** Two rings of neighbouring islets (8 and 16), alternating tones, each with its own small cairn and plate. */
function neighbours(light: Surface, dark: Surface): { a: THREE.InstancedMesh; b: THREE.InstancedMesh; cairns: THREE.InstancedMesh; plates: THREE.InstancedMesh } {
  const offsets: [number, number][] = []
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i || j) offsets.push([i, j])
  const same = offsets.filter(([i, j]) => (i + j) % 2 === 0)
  const other = offsets.filter(([i, j]) => (i + j) % 2 !== 0)
  const g = boxGeo(ISLET, SLAB_T, ISLET)
  const make = (list: [number, number][], s: Surface, name: string) => {
    const im = new THREE.InstancedMesh(g, slabMaterials(s), list.length)
    im.name = name
    const m = new THREE.Matrix4()
    list.forEach(([i, j], k) => {
      m.makeTranslation(i * PITCH, -SLAB_T / 2 - 0.03, j * PITCH)
      im.setMatrixAt(k, m)
    })
    im.instanceMatrix.needsUpdate = true
    return im
  }
  const a = make(same, light, 'slabs-a')
  const b = make(other, dark, 'slabs-b')

  const stack = geo('cairn:far', () => {
    const pts: THREE.Vector2[] = []
    const n = 7
    for (let i = 0; i <= n; i++) {
      const t = i / n
      pts.push(new THREE.Vector2(Math.max(0.02, 0.3 - 0.21 * t), t * CAIRN_H))
    }
    return new THREE.LatheGeometry(pts, 7)
  })
  const cairns = new THREE.InstancedMesh(stack, facet(ROCK), offsets.length)
  cairns.name = 'far-cairns'
  const plates = new THREE.InstancedMesh(boxGeo(0.32, 0.08, 0.012), brassMat(), offsets.length)
  plates.name = 'far-plates'
  const m = new THREE.Matrix4()
  offsets.forEach(([i, j], k) => {
    m.makeTranslation(i * PITCH, -0.03, j * PITCH)
    cairns.setMatrixAt(k, m)
    m.makeTranslation(i * PITCH, 0.27, j * PITCH + 0.21)
    plates.setMatrixAt(k, m)
  })
  cairns.instanceMatrix.needsUpdate = true
  plates.instanceMatrix.needsUpdate = true
  return { a, b, cairns, plates }
}

/** The channel water to the horizon, drifting slowly, and the painted sky behind it. */
function waterAndSky(): { water: THREE.Mesh; sky: THREE.Mesh; skyDay: THREE.Material; skyDusk: THREE.Material } {
  const waterTex = waterTexture()
  const water = mesh(new THREE.PlaneGeometry(130, 72), paintedMat(waterTex, 0.55, { metalness: 0.05 }))
  water.name = 'water'
  water.rotation.x = -Math.PI / 2
  water.position.set(0, WATER_Y, HORIZON_Z + 36)
  const skyDay = new THREE.MeshBasicMaterial({ map: skyTexture(SKY, 'grid:sky-day') })
  const skyDusk = new THREE.MeshBasicMaterial({ map: skyTexture(SKY_DUSK, 'grid:sky-dusk') })
  const sky = mesh(new THREE.PlaneGeometry(150, 40), skyDay)
  sky.name = 'sky'
  sky.position.set(0, 14, HORIZON_Z - 0.5)
  return { water, sky, skyDay, skyDusk }
}

// ───────────────────────────── The cairn ─────────────────────────────

/** One stone: a flattened icosahedron, so every face is a painted facet. */
function stoneGeometry(): THREE.IcosahedronGeometry {
  return geo('stone', () => new THREE.IcosahedronGeometry(1, 0))
}

/** Twenty stones from the base to the top, identical on every islet; `skewed` is stone 12 out of true. */
function cairn(rnd: () => number): { group: THREE.Group; stones: THREE.InstancedMesh; matrices: THREE.Matrix4[]; skewed: THREE.Matrix4; radiusAt: (y: number) => number } {
  const g = new THREE.Group()
  g.name = 'cairn'
  const stones = new THREE.InstancedMesh(stoneGeometry(), facet(ROCK, 0.85), STONES)
  stones.name = 'stones'
  const matrices: THREE.Matrix4[] = []
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler()
  let y = 0
  const layers: { y: number; r: number }[] = []
  for (let k = 0; k < STONES; k++) {
    const t = k / (STONES - 1)
    const r = 0.31 - 0.215 * Math.pow(t, 0.85)
    const thick = 0.022 + 0.015 * (1 - t)
    y += thick / 2
    layers.push({ y, r })
    pos.set((rnd() - 0.5) * 0.03, y, (rnd() - 0.5) * 0.03)
    e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08)
    q.setFromEuler(e)
    sc.set(r, thick * 0.62, r * (0.86 + rnd() * 0.1))
    matrices.push(new THREE.Matrix4().compose(pos, q, sc))
    y += thick / 2
  }
  matrices.forEach((m, k) => stones.setMatrixAt(k, m))
  stones.instanceMatrix.needsUpdate = true
  g.add(stones)

  const skewed = matrices[12].clone()
  const layer = layers[12]
  pos.set(0.075, layer.y + 0.012, 0.02)
  e.set(0, 0.6, 0.24)
  q.setFromEuler(e)
  sc.set(layer.r, 0.017, layer.r * 0.9)
  skewed.compose(pos, q, sc)

  const salt = mesh(stoneGeometry(), facet(FOAM, 1), 0, y - 0.004, 0)
  salt.scale.set(0.075, 0.012, 0.065)
  salt.name = 'salt'
  g.add(salt)

  const radiusAt = (h: number): number => {
    const t = THREE.MathUtils.clamp(h / y, 0, 1)
    return 0.31 - 0.215 * Math.pow(t, 0.85)
  }
  return { group: g, stones, matrices, skewed, radiusAt }
}

/** Cached engraving of a plate text: ink on brass, letterspaced caps. */
function plateTexture(text: string): THREE.CanvasTexture {
  const hit = plateTextures.get(text)
  if (hit) return hit
  const tex = labelTexture({ text, bg: BRASS, color: INK, width: 1024, height: 256, letterSpacing: 0.14, weight: 500, border: INK, padding: 34 })
  plateTextures.set(text, tex)
  return tex
}

/** The brass plate on the cairn's face, its origin at the centre of its back. */
function plate(text: string): { group: THREE.Group; face: THREE.MeshStandardMaterial } {
  const g = new THREE.Group()
  g.name = 'plate'
  g.add(box(0.32, 0.08, 0.012, brassMat(), 0, 0, 0.006))
  const face = new THREE.MeshStandardMaterial({ map: plateTexture(text), roughness: 0.4, metalness: 0.6 })
  const f = mesh(new THREE.PlaneGeometry(0.32, 0.08), face, 0, 0, 0.0125)
  f.name = 'engraving'
  g.add(f)
  for (const sx of [-1, 1]) {
    const screw = cyl(0.005, 0.005, 0.002, brassMat(), sx * 0.145, 0, 0.013, 8)
    screw.rotation.x = Math.PI / 2
    g.add(screw)
  }
  return { group: g, face }
}

// ───────────────────────────── The flaws ─────────────────────────────

/** A paper tag laid flat on the sand at the end of a string trailing from the cairn (flaw 2). */
function tagString(radiusAt: (y: number) => number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'flaw:string'
  const r = radiusAt(0.34)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(r * 0.7, 0.34, r * 0.7),
    new THREE.Vector3(r + 0.08, 0.2, r + 0.1),
    new THREE.Vector3(0.62, 0.004, 0.62),
    new THREE.Vector3(1.02, 0.004, 0.9),
    new THREE.Vector3(1.3, 0.004, 1.02),
  ])
  const string = mesh(new THREE.TubeGeometry(curve, 28, 0.0045, 5, false), facet(PAPER, 1))
  g.add(string)
  const t = paperTag('', { color: PAPER, ink: INK })
  t.position.set(1.3, 0.003, 1.02)
  t.rotation.set(-Math.PI / 2, 0, 0.9)
  g.add(t)
  return g
}

/** The footprint line across the sand (flaw 1), one walk from the near edge to the far, off the axis. */
function footprintLine(): THREE.Mesh {
  const m = new THREE.MeshStandardMaterial({ map: footprintLineTexture(mix(SAND, INK, 0.45, 0.85), 'grid:foot-light'), transparent: true, depthWrite: false, roughness: 1, metalness: 0 })
  const me = mesh(new THREE.PlaneGeometry(0.5, ISLET - 0.5), m, -1.7, 0.004, 0)
  me.name = 'flaw:footprint'
  me.rotation.x = -Math.PI / 2
  me.renderOrder = 2
  return me
}

// ───────────────────────────── The six objects ─────────────────────────────

function withContact(o: THREE.Object3D, radius: number): THREE.Object3D {
  const disc = buildContactDisc(radius)
  disc.position.y = 0.002
  o.add(disc)
  return o
}

/** A glass float in its net. */
function glassFloat(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:float'
  const r = 0.13
  g.add(mesh(geo('float', () => new THREE.SphereGeometry(r, 18, 12)), mat.lacquer(WATER), 0, r, 0))
  const net = facet(PAPER, 1)
  const ring = geo('float-ring', () => new THREE.TorusGeometry(r + 0.004, 0.004, 5, 28))
  for (const a of [0, 1, 2]) {
    const t = mesh(ring, net, 0, r, 0)
    t.rotation.y = (a * Math.PI) / 3
    g.add(t)
  }
  const band = mesh(ring, net, 0, r, 0)
  band.rotation.x = Math.PI / 2
  g.add(band)
  return withContact(g, r * 1.25)
}

/** A ration tin, its paper label banded in ink. */
function rationTin(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:tin'
  const tin = new THREE.MeshStandardMaterial({ color: FOAM, roughness: 0.45, metalness: 0.7 })
  g.add(cyl(0.075, 0.075, 0.1, tin, 0, 0.05, 0, 20))
  const label = new THREE.MeshStandardMaterial({ map: labelTexture({ lines: ['·  ·  ·'], bg: PAPER, color: INK, width: 512, height: 128, border: INK, letterSpacing: 0.3 }), roughness: 0.9, metalness: 0 })
  g.add(cyl(0.077, 0.077, 0.06, label, 0, 0.05, 0, 20))
  g.add(cyl(0.07, 0.07, 0.004, tin, 0, 0.102, 0, 20))
  return withContact(g, 0.11)
}

/** A page from a chess book, open at the Ruy Lopez, weighted with a stone. */
function bookPage(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:page'
  const moves = CORRESPONDENCE_PGN.split('\n')[0].split(/\s(?=\d+\.)/).slice(0, 4)
  const lines = ['RUY LOPEZ', '', ...moves]
  const page = new THREE.MeshStandardMaterial({ map: labelTexture({ lines, font: 'mono', bg: PAPER, color: INK, width: 256, height: 384, padding: 24, paper: true, align: 'left', size: 22 }), roughness: 0.95, metalness: 0 })
  const p = mesh(new THREE.PlaneGeometry(0.18, 0.27), page, 0, 0.004, 0)
  p.rotation.set(-Math.PI / 2, 0, 0.16)
  p.renderOrder = 2
  g.add(p)
  const stone = mesh(stoneGeometry(), facet(ROCK), 0.03, 0.02, -0.04)
  stone.scale.set(0.055, 0.02, 0.045)
  stone.rotation.y = 0.7
  g.add(stone)
  return withContact(g, 0.17)
}

/** Seven shells in a row, at exact intervals. */
function shellRow(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:shells'
  const shell = geo('shell', () => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      pts.push(new THREE.Vector2(Math.max(0.002, 0.04 * Math.sin(t * Math.PI * 0.55)), t * 0.022))
    }
    return new THREE.LatheGeometry(pts, 9)
  })
  const im = new THREE.InstancedMesh(shell, facet(FOAM, 0.8), 7)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
  for (let i = 0; i < 7; i++) {
    m.compose(new THREE.Vector3((i - 3) * 0.11, 0, 0), q, new THREE.Vector3(1, 1, 1))
    im.setMatrixAt(i, m)
  }
  im.instanceMatrix.needsUpdate = true
  g.add(im)
  return withContact(g, 0.42)
}

/** A driftwood piece, bleached, lying along x. */
function driftwood(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:driftwood'
  const wood = facet(DRIFTWOOD, 0.9)
  const trunk = rodX(0.045, 0.9, wood, 0, 0.04, 0, 7)
  trunk.scale.y = 0.8
  g.add(trunk)
  const knot = cyl(0.03, 0.018, 0.14, wood, 0.22, 0.09, 0.02, 6)
  knot.rotation.set(0.3, 0, -0.5)
  g.add(knot)
  const end = rodX(0.03, 0.2, wood, -0.5, 0.035, 0.01, 6)
  end.rotation.y = 0.3
  g.add(end)
  return withContact(g, 0.5)
}

/** An oar, its blade toward the left, a brass ferrule at the collar. */
function oar(): THREE.Object3D {
  const g = new THREE.Group()
  g.name = 'object:oar'
  const wood = facet(DRIFTWOOD, 0.85)
  g.add(rodX(0.016, 1.5, wood, 0.15, 0.018, 0, 8))
  g.add(box(0.42, 0.014, 0.11, wood, -0.8, 0.012, 0))
  g.add(rodX(0.02, 0.05, brassMat(), -0.55, 0.018, 0, 10))
  return withContact(g, 0.55)
}

// ───────────────────────────── The house miniature ─────────────────────────────

/** The station house at 1:10, 2.1 m wide, on its rock: seen from here across the water, small on the left horizon. */
function houseMiniature(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'house-miniature'
  const rock = mesh(stoneGeometry(), facet(ROCK, 1), 0, -0.4, 0)
  rock.scale.set(4.6, 1.1, 3.2)
  g.add(rock)
  const wall = facet(MUSTARD, 0.9)
  g.add(box(2.1, 1.35, 1.2, wall, 0, 0.675 + 0.35, 0))
  const roof = mesh(geo('roof', () => new THREE.ConeGeometry(1.45, 0.55, 4)), facet(INK, 0.9), 0, 1.35 + 0.35 + 0.27, 0)
  roof.rotation.y = Math.PI / 4
  roof.scale.z = 0.62
  g.add(roof)
  g.add(cyl(0.22, 0.22, 0.5, wall, 0, 1.35 + 0.35 + 0.55 + 0.25, 0, 8))
  g.add(cyl(0.26, 0.26, 0.3, facet(FOAM, 0.5), 0, 1.35 + 0.35 + 0.55 + 0.65, 0, 8))
  g.add(mesh(geo('roof', () => new THREE.ConeGeometry(1.45, 0.55, 4)), facet(INK), 0, 1.35 + 0.35 + 0.55 + 0.87, 0)).scale.set(0.22, 0.4, 0.22)
  const lamp = mesh(geo('lamp', () => new THREE.SphereGeometry(0.1, 8, 6)), new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 1.4, roughness: 0.6, metalness: 0 }), 0, 1.35 + 0.35 + 0.55 + 0.65, 0)
  g.add(lamp)
  const windows = new THREE.InstancedMesh(boxGeo(0.16, 0.22, 0.02), facet(PAPER, 0.5), 6)
  const m = new THREE.Matrix4()
  let k = 0
  for (const row of [0.62, 1.12]) for (const col of [-0.6, 0, 0.6]) {
    m.makeTranslation(col, row + 0.35, 0.605)
    windows.setMatrixAt(k++, m)
  }
  windows.instanceMatrix.needsUpdate = true
  g.add(windows)
  return g
}

// ───────────────────────────── The chart ─────────────────────────────

/** Chart-space position of a square: ranks run toward −x (up on the screen), files toward −z (right on the screen). */
function squareOnChart(square: Square): THREE.Vector3 {
  const { file, rank } = fileRank(square)
  const i = FILES.indexOf(file), j = RANKS.indexOf(rank)
  return new THREE.Vector3(-(j - 3.5) * CHART_SQ, 0, -(i - 3.5) * CHART_SQ)
}

/** The founder's chart on its table on a plank deck, corner stones, the paper ticks and the brass pin. */
function chart(): Stage['chart'] {
  const g = new THREE.Group()
  g.name = 'chart'
  g.position.set(CHART_AT.x, 0, CHART_AT.z)

  const deck = box(4.4, 0.06, 3.2, paintedMat(plankTexture(), 0.9), 0, -0.03, 0)
  g.add(deck)
  const t = tableProp({ colors: P, width: 1.9, depth: 1.7, height: CHART_AT.y, seed: 'chart-table' })
  g.add(t)

  const top = CHART_AT.y + 0.002
  const paper = mesh(new THREE.PlaneGeometry(CHART_PAPER, CHART_PAPER), paintedMat(chartTexture(), 0.92))
  paper.name = 'chart-paper'
  paper.rotation.x = -Math.PI / 2
  const anchor = new THREE.Group()
  anchor.name = 'chart-anchor'
  anchor.position.y = top
  anchor.rotation.y = Math.PI / 2
  anchor.add(paper)
  g.add(anchor)

  const inkCanvas = document.createElement('canvas')
  inkCanvas.width = 512
  inkCanvas.height = 512
  const ink = new THREE.CanvasTexture(inkCanvas)
  ink.colorSpace = THREE.SRGBColorSpace
  const inkMesh = mesh(new THREE.PlaneGeometry(CHART_PAPER, CHART_PAPER), new THREE.MeshStandardMaterial({ map: ink, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0 }), 0, 0.0006, 0)
  inkMesh.name = 'chart-ink'
  inkMesh.rotation.x = -Math.PI / 2
  inkMesh.renderOrder = 2
  anchor.add(inkMesh)

  const stoneMat = facet(BASALT, 0.8)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const s = mesh(stoneGeometry(), stoneMat, sx * (CHART_PAPER / 2 - 0.06), 0.014, sz * (CHART_PAPER / 2 - 0.06))
    s.scale.set(0.05, 0.014, 0.042)
    s.rotation.y = sx * sz * 0.4
    anchor.add(s)
  }

  const ticks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.042, 0.021), facet(PAPER, 0.95), 64)
  ticks.name = 'chart-ticks'
  ticks.count = 0
  ticks.position.y = 0.0012
  ticks.renderOrder = 3
  anchor.add(ticks)

  const pin = new THREE.Group()
  pin.name = 'pin'
  pin.add(cyl(0.0025, 0.0025, 0.045, brassMat(), 0, 0.0225, 0, 8))
  pin.add(mesh(geo('pin-head', () => new THREE.SphereGeometry(0.012, 14, 10)), brassMat(), 0, 0.05, 0))
  const disc = buildContactDisc(0.02)
  disc.position.y = 0.0015
  disc.scale.setScalar(1.4)
  pin.add(disc)
  pin.visible = false
  anchor.add(pin)

  return { group: g, paper, ink, inkCanvas, ticks, pin, anchor }
}

// ───────────────────────────── Build ─────────────────────────────

/** Triangles and draw calls of a group, by traversal (instances counted, hidden objects skipped). */
function countStats(root: THREE.Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0
  root.traverse((o) => {
    if (!o.visible) return
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return
    if (!(o instanceof THREE.Mesh)) return
    const g = o.geometry as THREE.BufferGeometry
    const verts = g.index ? g.index.count : g.attributes.position?.count ?? 0
    const inst = o instanceof THREE.InstancedMesh ? o.count : 1
    triangles += (verts / 3) * inst
    drawCalls += Math.max(1, g.groups.length)
  })
  return { triangles: Math.round(triangles), drawCalls }
}

/**
 * Builds the islet stage and the chart. Hotspots: `grid.plate` (the brass plate), `grid.cairn` (the cairn),
 * `grid.chart` (the chart on its table), `grid.causeway` (the right-hand survey stone; the station layer
 * allows it from a1 only). The group carries `userData.tick(dt)` for the channel drift and
 * `userData.stats()` for the triangle and draw-call count. Dressed for e4 in daylight until `redress`.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const hotspots = new Map<string, THREE.Object3D>()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots }

  const { light, dark } = surfaces()
  const isletMesh = islet(light)
  group.add(isletMesh)
  group.add(foamRing(ISLET, WATER_Y + 0.004, 0.14))

  const nb = neighbours(dark, light)
  group.add(nb.a, nb.b, nb.cairns, nb.plates)

  const ws = waterAndSky()
  group.add(ws.water, ws.sky)

  const c = cairn(ctx.rnd)
  c.group.userData.hotspot = 'grid.cairn'
  hotspots.set('grid.cairn', c.group)
  const cairnDisc = buildContactDisc(0.46)
  cairnDisc.position.y = 0.003
  group.add(cairnDisc)
  group.add(c.group)

  const pl = plate(`e4 · EIDER REACH · SURVEYED ${SURVEY_YEAR} · A.H.`)
  pl.group.position.set(0, 0.3, c.radiusAt(0.3) - 0.02)
  pl.group.userData.hotspot = 'grid.plate'
  hotspots.set('grid.plate', pl.group)
  c.group.add(pl.group)

  const tagRack = new THREE.Group()
  tagRack.name = 'tags'
  c.group.add(tagRack)

  const foot = footprintLine()
  const str = tagString(c.radiusAt)
  const flaws: THREE.Object3D[] = [c.stones, foot, str, pl.group]
  group.add(foot, str)

  const objects = [glassFloat(), rationTin(), bookPage(), shellRow(), driftwood(), oar()]
  for (const o of objects) { o.position.set(0, 0, OBJECT_Z); o.visible = false; group.add(o) }

  const stoneMat = facet(ROCK, 1)
  for (const sx of [-1, 1]) {
    const post = box(0.12, 0.5, 0.12, stoneMat, sx * 3.95, 0.25, 1.7)
    post.name = 'survey-stone'
    const disc = buildContactDisc(0.13)
    disc.position.set(sx * 3.95, 0.003, 1.7)
    group.add(post, disc)
    if (sx === 1) { post.userData.hotspot = 'grid.causeway'; hotspots.set('grid.causeway', post) }
  }

  const house = houseMiniature()
  house.position.set(-23, 0.35, HORIZON_Z + 5)
  house.rotation.y = 0.35
  group.add(house)

  const ch = chart()
  ch.group.userData.hotspot = 'grid.chart'
  hotspots.set('grid.chart', ch.group)
  group.add(ch.group)

  const anchor = new THREE.Object3D()
  anchor.name = 'resident-anchor'
  anchor.position.set(-1.3, 0, 0.7)
  group.add(anchor)
  out.residentAnchor = anchor

  group.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false } })

  const stage: Stage = {
    islet: isletMesh, slabsA: nb.a, slabsB: nb.b, light, dark,
    sky: ws.sky, skyDay: ws.skyDay, skyDusk: ws.skyDusk,
    plate: pl.group, plateFace: pl.face, flaws, objects, footprintLine: foot,
    stones: c.stones, stoneMatrices: c.matrices, skewedMatrix: c.skewed, tagRack, chart: ch,
  }
  stages.set(group, stage)

  const waterMap = (ws.water.material as THREE.MeshStandardMaterial).map as THREE.CanvasTexture
  group.userData.tick = (dt: number): void => {
    waterMap.offset.x = (waterMap.offset.x + dt * 0.012) % 1
    waterMap.offset.y = (waterMap.offset.y + dt * 0.004) % 1
  }
  group.userData.stats = (): { triangles: number; drawCalls: number } => countStats(group)

  redress(out, { square: 'e4', light: true, flaw: 0, object: 0, plateText: `e4 · EIDER REACH · SURVEYED ${SURVEY_YEAR} · A.H.`, tags: [], dusk: false })
  return out
}

// ───────────────────────────── Re-dressing ─────────────────────────────

/** A cached paper tag from text3d, one per text. */
function tagFor(text: string): THREE.Group {
  const hit = tagGroups.get(text)
  if (hit) return hit
  const t = paperTag(text, { color: PAPER, ink: INK })
  t.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false } })
  tagGroups.set(text, t)
  return t
}

/**
 * Re-dresses the stage in place for one square: the surface (shell-sand or basalt, by material swap), the
 * plate's engraving (textures cached by text), the one visible flaw (0 stone out of true, 1 footprint line,
 * 2 tag string, 3 plate set low), the one visible object (0 float, 1 tin, 2 page, 3 shells, 4 driftwood,
 * 5 oar), paper tags laid on the cairn and the sky at dusk.
 */
export function redress(built: BuiltFrame, o: { square: Square; light: boolean; flaw: number; object: number; plateText: string; tags: string[]; dusk: boolean }): void {
  const s = stages.get(built.group)
  if (!s) return
  const surface = o.light ? s.light : s.dark
  const other = o.light ? s.dark : s.light
  s.islet.material = slabMaterials(surface)
  s.slabsA.material = slabMaterials(other)
  s.slabsB.material = slabMaterials(surface)
  const fm = s.footprintLine.material as THREE.MeshStandardMaterial
  fm.map = o.light ? footprintLineTexture(mix(SAND, INK, 0.45, 0.85), 'grid:foot-light') : footprintLineTexture(mix(BASALT, FOAM, 0.6, 0.8), 'grid:foot-dark')
  fm.needsUpdate = true

  s.plateFace.map = plateTexture(o.plateText)
  s.plateFace.needsUpdate = true

  const flaw = ((o.flaw % 4) + 4) % 4
  s.stones.setMatrixAt(12, flaw === 0 ? s.skewedMatrix : s.stoneMatrices[12])
  s.stones.instanceMatrix.needsUpdate = true
  s.footprintLine.visible = flaw === 1
  s.flaws[2].visible = flaw === 2
  s.plate.position.y = flaw === 3 ? 0.09 : 0.3
  s.plate.position.z = (flaw === 3 ? 0.31 - 0.215 * Math.pow(0.09 / CAIRN_H, 0.85) : 0.31 - 0.215 * Math.pow(0.3 / CAIRN_H, 0.85)) - 0.02

  const object = ((o.object % 6) + 6) % 6
  s.objects.forEach((obj, i) => { obj.visible = i === object })

  s.tagRack.clear()
  const seats: { x: number; y: number; z: number; rot: number }[] = [
    { x: 0.1, y: 0.235, z: 0.05, rot: 0.55 },
    { x: -0.1, y: 0.235, z: 0.05, rot: -0.55 },
    { x: 0, y: 0.34, z: -0.02, rot: 0 },
    { x: 0.12, y: 0.15, z: -0.1, rot: 1.4 },
    { x: -0.12, y: 0.15, z: -0.1, rot: -1.4 },
  ]
  o.tags.slice(0, seats.length).forEach((text, i) => {
    const t = tagFor(text).clone()
    const seat = seats[i]
    t.position.set(seat.x, seat.y, seat.z)
    t.rotation.set(-Math.PI / 2 + 0.12, seat.rot, 0, 'YXZ')
    s.tagRack.add(t)
  })

  s.sky.material = o.dusk ? s.skyDusk : s.skyDay
  built.group.userData.square = o.square
}

// ───────────────────────────── The chart's state ─────────────────────────────

/**
 * Inks the visited islets, lays a small paper tick on every tagged one and stands the brass pin at
 * `position` (hidden when null). The pin is the group named `pin` under `chart-anchor`.
 */
export function setChart(built: BuiltFrame, o: { position: Square | null; visited: Square[]; tags: Square[] }): void {
  const s = stages.get(built.group)
  if (!s) return
  const { inkCanvas, ink, ticks, pin } = s.chart
  const ctx = inkCanvas.getContext('2d')
  if (ctx) {
    const w = inkCanvas.width
    ctx.clearRect(0, 0, w, w)
    const px = w / CHART_PAPER
    const sq = CHART_SQ * px
    const g0 = (w - CHART_GRID * px) / 2
    ctx.lineWidth = 1.2
    for (const v of o.visited) {
      const { file, rank } = fileRank(v)
      const i = FILES.indexOf(file), j = RANKS.indexOf(rank)
      const x = g0 + i * sq + 4, y = g0 + (7 - j) * sq + 4, size = sq - 8
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, size, size)
      ctx.clip()
      ctx.strokeStyle = mix(INK, WATER, 0.2, 0.55)
      for (let k = -size; k < size * 2; k += 5) {
        ctx.beginPath()
        ctx.moveTo(x + k, y)
        ctx.lineTo(x + k + size, y + size)
        ctx.stroke()
      }
      ctx.restore()
      ctx.strokeStyle = mix(INK, WATER, 0.2, 0.9)
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, size, size)
    }
  }
  ink.needsUpdate = true

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)
  const e = new THREE.Euler()
  o.tags.slice(0, 64).forEach((sqr, k) => {
    const p = squareOnChart(sqr)
    const { file, rank } = fileRank(sqr)
    const turn = ((FILES.indexOf(file) * 3 + RANKS.indexOf(rank) * 5) % 7) * 0.09 - 0.27
    e.set(-Math.PI / 2, 0, turn, 'ZXY')
    q.setFromEuler(e)
    m.compose(new THREE.Vector3(p.x + 0.04, 0, p.z - 0.04), q, one)
    ticks.setMatrixAt(k, m)
  })
  ticks.count = Math.min(64, o.tags.length)
  ticks.instanceMatrix.needsUpdate = true

  if (o.position) {
    pin.position.copy(squareOnChart(o.position))
    pin.visible = true
  } else {
    pin.visible = false
  }
}

/** World position of a square's centre on the chart paper, for the pin's 0.350 m/s travel. */
export function pinTarget(built: BuiltFrame, square: Square): THREE.Vector3 {
  const s = stages.get(built.group)
  const p = squareOnChart(square)
  if (!s) return p
  s.chart.anchor.updateWorldMatrix(true, false)
  return s.chart.anchor.localToWorld(p)
}
