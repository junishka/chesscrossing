// Frame 8: The Workshop (below, left). docs/BIBLE.md §6 Frame 8, palette §3.2 browner, bare rock §3.3.
// Cut into the rock under the Chart Room: three walls of flat lichened granite facets with a mustard
// dado painted to 1.1 m, a flagstone floor, the Chart Room's joists and boards for a ceiling. The treadle
// lathe is centred with its bed parallel to the frame, a half-turned blank between the centres and
// Amos Ferrier standing behind it; fourteen turning tools in size order in a rack above him, the profile
// template pinned over them, one enamel lamp. Two benches mirror each other at the back (the 64 collar
// dies in a brass tray on the left, the next season's blanks on the right); two arches mirror each other
// in the side walls (the ladder up to the Chart Room's trap on the left, the rock passage to the Boathouse
// on the right); two shelves mirror each other in front of them (32 rough blanks left, 32 test-turnings
// right). The one flaw: a thirty-third turning at the end of the right shelf, a knight with its head on
// the wrong side, looking at the wall. Nothing moves on hover.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef, PieceType } from '../../types'
import { FONT_SANS } from '../../core/fonts'
import { mat, seeded } from '../../scene/materials'
import { placard, tag } from '../../scene/text3d'
import { pieceProfile, PIECE_HEIGHTS } from '../../scene/pieces'
import { tokens, type RegionPalette, type TokenName } from '../../content/palette'
import { dressing } from '../../content/frames/workshop'
import { figure } from '../figures'
import * as props from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres: width, height, depth (open toward +z, back wall at z = −d/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
/** Height of the painted mustard dado on the rock. */
const DADO = 1.1
/** The two arches in the side walls: centre along the wall (world z), opening width, springing, surround. */
const ARCH = { z: 0.05, w: 1.1, spring: 1.9, surround: 0.25, top: 2.75 } as const
/** Where the lathe stands (its bed centre, world z) and the height of its centres. */
const LATHE_Z = -0.8
const CENTRE_Y = 1.12
/** Test-turnings are the one profile at three times the playing size. */
const TURN_SCALE = 3
/** The shelves of turnings and blanks: board tops (top tier first), slots along z, the thirty-third's place. */
const SHELF = { tops: [2.2, 1.85, 1.5, 1.15], z0: -2.7, pitch: 0.19, endZ: -1.08, zMin: -2.86, zMax: -0.93, depth: 0.2 } as const

// ───────────────────────────── Colour and canvas helpers ─────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** A palette hex with alpha, for canvas painting. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** A palette hex scaled in value by `k` (in sRGB), with alpha, for canvas painting. */
function scaled(hex: string, k: number, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))))
  return `rgba(${r},${g},${b},${alpha})`
}

/** Two palette hexes mixed by `t` (in sRGB), as `#rrggbb`. */
function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b)
  return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * t).toString(16).padStart(2, '0')).join('')
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A canvas painted once and wrapped as an sRGB texture. */
function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  paint(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  return tex
}

/** The same canvas as a linear bump map. */
function bumpOf(tex: THREE.CanvasTexture): THREE.CanvasTexture {
  const bump = new THREE.CanvasTexture(tex.image as HTMLCanvasElement)
  bump.colorSpace = THREE.NoColorSpace
  bump.wrapS = tex.wrapS
  bump.wrapT = tex.wrapT
  return bump
}

/** Letterspaced Jost capitals on a canvas; falls back to plain text where letterSpacing is unsupported. */
function caps(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 500, spacing = 0.12, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${weight} ${size}px ${FONT_SANS}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${spacing * size}px`
  ctx.fillText(text.toUpperCase(), x, y)
  if ('letterSpacing' in c) c.letterSpacing = '0px'
}

/** Multiplies every pixel of a painted canvas by `k(u, v)` (u across, v up, both 0..1): the wear pass. */
function multiplyPixels(ctx: CanvasRenderingContext2D, w: number, h: number, k: (u: number, v: number) => number): void {
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const f = k((x + 0.5) / w, v)
      if (f === 1) continue
      const i = (y * w + x) * 4
      px[i] = Math.min(255, px[i] * f)
      px[i + 1] = Math.min(255, px[i + 1] * f)
      px[i + 2] = Math.min(255, px[i + 2] * f)
    }
  }
  ctx.putImageData(img, 0, 0)
}

// ───────────────────────────── Merged geometry ─────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)

/** Collects geometry per material and merges it into one mesh per material: one draw call each. */
class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1)))
    const list = this.parts.get(material) ?? []
    list.push(g)
    this.parts.set(material, list)
    geometry.dispose()
  }

  box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, rot)
  }

  cyl(rt: number, rb: number, h: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, rot)
  }

  /** A cylinder whose axis runs along x. */
  rodX(r: number, len: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0): void {
    this.cyl(r, r, len, seg, material, x, y, z, ROT_Z90)
  }

  /** A cylinder whose axis runs along z. */
  rodZ(r: number, len: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0): void {
    this.cyl(r, r, len, seg, material, x, y, z, ROT_X90)
  }

  /** A round rod stretched between two points. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg: number, material: THREE.Material): void {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg)
    const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize())
    g.applyQuaternion(q)
    const mid = a.clone().lerp(b, 0.5)
    this.add(g, material, mid.x, mid.y, mid.z)
  }

  sphere(r: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0): void {
    this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), material, x, y, z)
  }

  torus(r: number, tube: number, arc: number, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, seg = 32, radial = 8): void {
    this.add(new THREE.TorusGeometry(r, tube, radial, seg, arc), material, x, y, z, rot)
  }

  /** Emits one mesh per material into `into` and returns them. */
  build(into: THREE.Object3D, name: string, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, material)
      mesh.name = name
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      into.add(mesh)
      out.push(mesh)
    }
    this.parts.clear()
    return out
  }
}

const ROT_X90 = new THREE.Euler(Math.PI / 2, 0, 0)
const ROT_Z90 = new THREE.Euler(0, 0, Math.PI / 2)
const ROT_Y90 = new THREE.Euler(0, Math.PI / 2, 0)

/** A small paper plate with the inventory tag in letterspaced caps. */
function hsPlate(text: string, p: RegionPalette, width: number, height = width * 0.2): THREE.Mesh {
  const plate = placard({ lines: [text], width, height, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `hs:${text}`
  return plate
}

// ───────────────────────────── Materials of the room ─────────────────────────────

interface Kit {
  p: RegionPalette
  rock: string
  mustard: string
  iron: THREE.Material
  pine: THREE.Material
  ash: THREE.Material
  lime: THREE.Material
  pear: THREE.Material
  brass: THREE.Material
  steel: THREE.Material
  turned: THREE.Material
}

function kitOf(p: RegionPalette): Kit {
  const rock = tokens['out.rock']
  const mustard = tokens[dressing.walls.dado as TokenName]
  return {
    p,
    rock,
    mustard,
    // Cast iron, painted in the house's ink and worn to a dull sheen.
    iron: new THREE.MeshStandardMaterial({ color: p.ink, roughness: 0.55, metalness: 0.45 }),
    pine: mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'workshop:pine', repeat: [2, 1] }),
    ash: mat.wood({ base: tokens['br.lightBody'], grain: tokens['hs.ground'], seed: 'workshop:ash', repeat: [1, 1] }),
    lime: mat.wood({ base: tokens['br.lightBody'], grain: tokens['hs.wall'], seed: 'workshop:lime', repeat: [1, 1] }),
    pear: mat.wood({ base: tokens['br.darkBody'], grain: p.ink, seed: 'workshop:pear', repeat: [1, 1] }),
    brass: mat.brass(),
    steel: mat.steel(),
    // A neutral grain for instanced turnings and blanks, tinted per instance to lime or pear.
    turned: mat.wood({ base: tokens['paper.white'], grain: tokens['br.lightBody'], seed: 'workshop:turned', repeat: [1, 1] }),
  }
}

/** The instance tint that turns the neutral `turned` material into `hex` (linear ratio to paper white). */
function tintFor(hex: string): THREE.Color {
  const base = new THREE.Color(tokens['paper.white'])
  const t = new THREE.Color(hex)
  return new THREE.Color(Math.min(1, t.r / base.r), Math.min(1, t.g / base.g), Math.min(1, t.b / base.b))
}

// ───────────────────────────── Rock walls ─────────────────────────────

interface WallSpec {
  width: number
  height: number
  seed: string
  /** A rectangular opening (wall-local u from the centre, v from the floor), filled by an arch surround. */
  hole?: { u0: number; u1: number; v1: number }
  /** Spans of u (0..1 across the texture) that get the scuff band beside a door. */
  scuffs: [number, number][]
}

/**
 * Granite cut flat: the rock tone in painted facets, chisel marks, strata, lichen in turf, olive and
 * foam; the mustard dado to 1.1 m in horizontal strokes with a crisp edge; then the wear pass
 * (corner grime, a grimy floor line, the 40 mm scuff band 350 mm up beside the openings).
 */
function rockTexture(k: Kit, spec: WallSpec): THREE.CanvasTexture {
  const W = 1024, H = Math.round((1024 * spec.height) / spec.width)
  const rnd = seeded(`workshop:rock:${spec.seed}`)
  return canvasTexture(W, H, (c) => {
    c.fillStyle = k.rock
    c.fillRect(0, 0, W, H)
    // Facets: flat planes of slightly different value, the look of rock split along its grain.
    for (let i = 0; i < 620; i++) {
      const x = rnd() * W, y = rnd() * H, s = 18 + rnd() * 80
      const n = 3 + Math.floor(rnd() * 3)
      c.fillStyle = scaled(k.rock, 0.86 + rnd() * 0.24, 0.26)
      c.beginPath()
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + rnd() * 0.8
        const r = s * (0.5 + rnd() * 0.5)
        if (j === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7)
        else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7)
      }
      c.closePath()
      c.fill()
    }
    // Chisel marks: patches of short parallel strokes where the rock was dressed back, each patch its own way.
    for (let i = 0; i < 90; i++) {
      const px0 = rnd() * W, py0 = rnd() * H, a = rnd() * Math.PI
      for (let j = 0; j < 26; j++) {
        const x = px0 + (rnd() - 0.5) * 60, y = py0 + (rnd() - 0.5) * 44, len = 6 + rnd() * 12
        c.strokeStyle = rnd() < 0.5 ? rgba(k.p.ink, 0.07) : rgba(k.p.paper, 0.045)
        c.lineWidth = 1 + rnd()
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke()
      }
    }
    // Strata: long jagged lines, a dark seam with a pale lip under it.
    for (let i = 0; i < 4; i++) {
      const y = (0.06 + rnd() * 0.9) * H
      const slope = (rnd() - 0.5) * 0.08
      c.lineWidth = 1.5
      // Broken: runs of 60 to 240 px with gaps, a dark seam over a pale lip.
      let x = rnd() * 80, yy = y
      while (x < W) {
        const run = 60 + rnd() * 180
        const pts: [number, number][] = []
        for (let t = 0; t <= run; t += 20) { yy += slope * 20 + (rnd() - 0.5) * 4; pts.push([x + t, yy]) }
        for (const [dy, col] of [[0, rgba(k.p.ink, 0.16)], [2, rgba(k.p.paper, 0.07)]] as const) {
          c.strokeStyle = col
          c.beginPath()
          pts.forEach(([px1, py1], n) => { if (n === 0) c.moveTo(px1, py1 + dy); else c.lineTo(px1, py1 + dy) })
          c.stroke()
        }
        x += run + 30 + rnd() * 120
      }
    }
    // Lichen: small crusted colonies, mostly above the dado and toward the corners.
    const lichen = [tokens['out.turf'], tokens['hs.olive'], tokens['out.turf'], tokens['out.pine']]
    for (let i = 0; i < 70; i++) {
      const edge = rnd() < 0.5 ? rnd() * 0.22 : 0.78 + rnd() * 0.22
      const cx = (rnd() < 0.6 ? edge : rnd()) * W
      const cy = (0.03 + rnd() * 0.6) * H
      const colour = lichen[Math.floor(rnd() * lichen.length)]
      const spread = 4 + rnd() * 16
      const dots = 12 + Math.floor(rnd() * 40)
      for (let j = 0; j < dots; j++) {
        const a = rnd() * Math.PI * 2, r = spread * Math.sqrt(rnd())
        c.fillStyle = rgba(colour, 0.24 + rnd() * 0.24)
        c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 0.6 + rnd() * 2.2, 0, Math.PI * 2); c.fill()
      }
    }
    // Speckle.
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = rnd() < 0.5 ? rgba(k.p.ink, 0.12) : rgba(k.p.paper, 0.08)
      c.fillRect(rnd() * W, rnd() * H, 1, 1)
    }

    // The mustard dado, painted over the rock so the facets still show through, brushed horizontally.
    const yD = H * (1 - DADO / spec.height)
    c.fillStyle = rgba(k.mustard, 0.86)
    c.fillRect(0, yD, W, H - yD)
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * W, y = yD + rnd() * (H - yD), len = 24 + rnd() * 24
      c.strokeStyle = scaled(k.mustard, rnd() < 0.5 ? 0.86 : 1.1, 0.06)
      c.lineWidth = 2 + rnd()
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + (rnd() - 0.5) * 1.5); c.stroke()
    }
    c.fillStyle = scaled(k.mustard, 0.62, 0.95)
    c.fillRect(0, yD - 1, W, 3)
    c.fillStyle = scaled(k.mustard, 1.08, 0.5)
    c.fillRect(0, yD + 2, W, 1)

    // The wear pass.
    const h = spec.height
    multiplyPixels(c, W, H, (u, v) => {
      const r = Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2
      let f = 1 - 0.1 * smoothstep(0.75, 1, r)
      f *= 1 - 0.14 * (1 - smoothstep(0, 0.07, v))
      const y = v * h
      if (y > 0.33 && y < 0.37 && spec.scuffs.some(([a, b]) => u > a && u < b)) f *= 0.96
      return f
    })
  })
}

/**
 * A wall of flat rock facets: a grid in wall-local space (u across, v up, facing +z), each vertex pushed
 * into the room by a seeded amount and each quad split on a random diagonal, flat-shaded. A hole leaves
 * exactly its rectangle out, for the arch surround to fill.
 */
function facetWall(k: Kit, spec: WallSpec): THREE.Mesh {
  const { width: w, height: h, hole } = spec
  const rnd = seeded(`workshop:facets:${spec.seed}`)
  const breaks = (len: number, from: number, step: number, extra: number[]): number[] => {
    const out = new Set<number>()
    const n = Math.round(len / step)
    for (let i = 0; i <= n; i++) out.add(Math.round((from + (len * i) / n) * 1000) / 1000)
    for (const e of extra) out.add(e)
    const sorted = [...out].sort((a, b) => a - b)
    return sorted.filter((x, i) => i === 0 || i === sorted.length - 1 || extra.includes(x) || extra.every((e) => Math.abs(e - x) > 0.09))
  }
  const us = breaks(w, -w / 2, 0.34, hole ? [hole.u0, hole.u1] : [])
  const vs = breaks(h, 0, 0.32, hole ? [hole.v1] : [])
  // Displacement into the room: broad swells (the split planes of the rock) plus a little per-vertex break-up.
  const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3, rnd() * 6.3]
  const swell = (u: number, v: number): number =>
    0.5 + 0.3 * Math.sin(u * 1.7 + ph[0]) * Math.sin(v * 2.1 + ph[1]) + 0.2 * Math.sin(u * 4.3 + v * 2.9 + ph[2]) * Math.cos(v * 3.7 - u * 1.3 + ph[3])
  const disp = vs.map((v) => us.map((u) => 0.012 + 0.07 * swell(u, v) + rnd() * 0.022))
  // In-plane jitter for interior vertices, so the facets are irregular rather than a quilt.
  const jit = vs.map((_, j) => us.map((_, i) => (i > 0 && i < us.length - 1 && j > 0 && j < vs.length - 1 ? [(rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.14] : [0, 0])))
  if (hole) {
    us.forEach((u, i) => vs.forEach((v, j) => {
      const onEdge = (u >= hole.u0 - 1e-6 && u <= hole.u1 + 1e-6 && v <= hole.v1 + 1e-6)
      if (onEdge) { disp[j][i] = 0.02; jit[j][i] = [0, 0] }
    }))
  }
  const pos: number[] = [], uv: number[] = []
  const vert = (i: number, j: number): void => {
    const x = us[i] + jit[j][i][0], y = vs[j] + jit[j][i][1]
    pos.push(x, y, disp[j][i])
    uv.push((x + w / 2) / w, y / h)
  }
  for (let j = 0; j < vs.length - 1; j++) {
    for (let i = 0; i < us.length - 1; i++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2
      if (hole && cu > hole.u0 && cu < hole.u1 && cv < hole.v1) continue
      if (rnd() < 0.5) {
        vert(i, j); vert(i + 1, j); vert(i + 1, j + 1)
        vert(i, j); vert(i + 1, j + 1); vert(i, j + 1)
      } else {
        vert(i, j); vert(i + 1, j); vert(i, j + 1)
        vert(i + 1, j); vert(i + 1, j + 1); vert(i, j + 1)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  const map = rockTexture(k, spec)
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.012, roughness: 0.93, metalness: 0, flatShading: true })
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = `rock:${spec.seed}`
  mesh.receiveShadow = true
  mesh.castShadow = false
  return mesh
}

/** Flagstones in courses, a little lighter and warmer than the walls, grouted dark, worn pale in front of the lathe. */
function flagTexture(k: Kit, w: number, d: number): THREE.CanvasTexture {
  const rnd = seeded('workshop:flags')
  return canvasTexture(1024, 1024, (c, W, H) => {
    const sx = W / w, sy = H / d
    c.fillStyle = scaled(mixHex(k.p.ink, k.rock, 0.45), 1)
    c.fillRect(0, 0, W, H)
    const grout = 0.014
    let z = 0
    while (z < d) {
      const rowD = Math.min(d - z, 0.42 + rnd() * 0.24)
      let x = -rnd() * 0.5
      while (x < w) {
        const fw = 0.5 + rnd() * 0.5
        const tone = mixHex(k.rock, tokens['out.path'], 0.22 + rnd() * 0.22)
        const kv = 0.94 + rnd() * 0.16
        const x0 = (x + grout) * sx, y0 = (z + grout) * sy, x1 = (x + fw - grout) * sx, y1 = (z + rowD - grout) * sy
        c.fillStyle = scaled(tone, kv)
        c.fillRect(x0, y0, x1 - x0, y1 - y0)
        // The flag's own mottle and a soft bevel: light on the far edge, dark on the near.
        for (let i = 0; i < 40; i++) {
          c.fillStyle = scaled(tone, kv * (0.9 + rnd() * 0.18), 0.22)
          const rx = x0 + rnd() * (x1 - x0), ry = y0 + rnd() * (y1 - y0)
          c.beginPath(); c.arc(rx, ry, 3 + rnd() * 14, 0, Math.PI * 2); c.fill()
        }
        c.fillStyle = rgba(k.p.paper, 0.1)
        c.fillRect(x0, y0, x1 - x0, 2)
        c.fillStyle = rgba(k.p.ink, 0.18)
        c.fillRect(x0, y1 - 2, x1 - x0, 2)
        if (rnd() < 0.12) {
          c.strokeStyle = rgba(k.p.ink, 0.3)
          c.lineWidth = 1
          c.beginPath()
          let cx = x0 + rnd() * (x1 - x0), cy = y0
          c.moveTo(cx, cy)
          while (cy < y1) { cy += 6 + rnd() * 8; cx += (rnd() - 0.5) * 8; c.lineTo(cx, Math.min(cy, y1)) }
          c.stroke()
        }
        x += fw
      }
      z += rowD
    }
    for (let i = 0; i < 12000; i++) {
      c.fillStyle = rnd() < 0.5 ? rgba(k.p.ink, 0.1) : rgba(k.p.paper, 0.07)
      c.fillRect(rnd() * W, rnd() * H, 1, 1)
    }
    // Wear: grime toward the back corners, a pale worn place where the Keeper stands to the treadle.
    const lz = (LATHE_Z + 0.35 + d / 2) / d
    multiplyPixels(c, W, H, (u, v) => {
      const back = 1 - v
      const r = Math.hypot(u * 2 - 1, back * 2 - 1) / Math.SQRT2
      let f = 1 - 0.1 * smoothstep(0.75, 1, r)
      const worn = Math.exp(-(((u - 0.5) / 0.1) ** 2) - (((1 - v) - lz) / 0.05) ** 2)
      f *= 1 + 0.07 * worn
      return f
    })
  })
}

// ───────────────────────────── The shell ─────────────────────────────

/** Floor, three rock walls with their openings, the Chart Room's joists and boards overhead. */
function shell(k: Kit): THREE.Group {
  const { w, h, d } = ROOM
  const g = new THREE.Group()
  g.name = 'shell'

  const fd = d + 0.4
  const floorMap = flagTexture(k, w, fd)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, fd), new THREE.MeshStandardMaterial({ map: floorMap, bumpMap: bumpOf(floorMap), bumpScale: 0.01, roughness: 0.86, metalness: 0 }))
  floor.name = 'flags'
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)

  const back = facetWall(k, { width: w + 0.2, height: h, seed: 'back', scuffs: [] })
  back.position.z = -d / 2
  g.add(back)
  // Side walls: a hole for each arch. Wall-local u runs to world −z on the left wall and to +z on the right.
  const hw = ARCH.w / 2 + ARCH.surround
  const sideW = d + 0.2
  const leftU = -ARCH.z, rightU = ARCH.z
  const scuff = (u: number): [number, number] => [(u - hw - 0.6 + sideW / 2) / sideW, (u + hw + 0.6 + sideW / 2) / sideW]
  const left = facetWall(k, { width: sideW, height: h, seed: 'left', hole: { u0: leftU - hw, u1: leftU + hw, v1: ARCH.top }, scuffs: [scuff(leftU)] })
  left.rotation.y = Math.PI / 2
  left.position.x = -w / 2
  g.add(left)
  const right = facetWall(k, { width: sideW, height: h, seed: 'right', hole: { u0: rightU - hw, u1: rightU + hw, v1: ARCH.top }, scuffs: [scuff(rightU)] })
  right.rotation.y = -Math.PI / 2
  right.position.x = w / 2
  g.add(right)

  // Overhead: the underside of the Chart Room's floor, boards running front to back, on three heavy joists.
  const boards = props.floor({ colors: k.p, width: w, depth: d, seed: 'workshop:ceiling' })
  boards.rotation.x = Math.PI
  boards.position.y = h
  boards.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = true } })
  g.add(boards)
  const m = new Merger()
  const joist = mat.wood({ base: k.p.woodGrain, grain: k.p.ink, seed: 'workshop:joist', repeat: [4, 1] })
  for (const z of [-2.4, LATHE_Z, 0.8]) m.box(w, 0.24, 0.2, joist, 0, h - 0.12, z)
  // Wall plates where the joists bear on the rock.
  for (const s of [-1, 1]) m.box(0.16, 0.12, d, joist, s * (w / 2 - 0.08), h - 0.3, 0)
  m.build(g, 'joists', false)
  return g
}

// ───────────────────────────── Arches: the ladder up and the passage through ─────────────────────────────

/** The arch opening outline (x across, y up), for extruding a vault. */
function archShape(): THREE.Shape {
  const r = ARCH.w / 2
  const s = new THREE.Shape()
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, ARCH.spring)
  s.absarc(0, ARCH.spring, r, 0, Math.PI, false)
  s.lineTo(-r, 0)
  return s
}

/** The dressed surround: a rectangle to the hole in the rock, with the arch cut out of it. */
function surroundShape(): THREE.Shape {
  const r = ARCH.w / 2, o = r + ARCH.surround
  const s = new THREE.Shape()
  s.moveTo(-o, 0)
  s.lineTo(-r, 0)
  s.lineTo(-r, ARCH.spring)
  s.absarc(0, ARCH.spring, r, Math.PI, 0, true)
  s.lineTo(r, 0)
  s.lineTo(o, 0)
  s.lineTo(o, ARCH.top)
  s.lineTo(-o, ARCH.top)
  s.lineTo(-o, 0)
  return s
}

/** A painted flat that is its own light: dark at one end, the warm lamp colour at the other. */
function glowFlat(k: Kit, w: number, h: number, dir: 'up' | 'right'): THREE.Mesh {
  const map = canvasTexture(128, 256, (c, W, H) => {
    const grad = dir === 'up' ? c.createLinearGradient(0, H, 0, 0) : c.createLinearGradient(0, 0, W, 0)
    grad.addColorStop(0, scaled(k.p.ink, 1))
    grad.addColorStop(0.55, scaled(mixHex(k.p.ink, k.p.light, 0.25), 1))
    grad.addColorStop(1, scaled(mixHex(k.p.ink, k.p.light, 0.7), 1))
    c.fillStyle = grad
    c.fillRect(0, 0, W, H)
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }))
  mesh.name = 'glow'
  return mesh
}

/**
 * One arch in a side wall, built in wall-local space (the wall face at z = 0, the room toward +z):
 * a cream-limed surround, the rock beyond it (a shaft for the ladder or a vaulted passage), the
 * destination's name on a paper plate above.
 */
function archway(hs: HotspotDef, k: Kit, kind: 'shaft' | 'passage'): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = `arch:${hs.id}`
  const surround = new THREE.Mesh(new THREE.ExtrudeGeometry(surroundShape(), { depth: 0.17, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 20 }), mat.plaster(p.trim))
  surround.position.z = -0.03
  surround.name = 'surround'
  surround.castShadow = false
  surround.receiveShadow = true
  g.add(surround)

  const rockInside = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, (c, W, H) => {
    const rnd = seeded(`workshop:inside:${kind}`)
    c.fillStyle = scaled(k.rock, 0.52)
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 260; i++) {
      c.fillStyle = scaled(k.rock, 0.42 + rnd() * 0.24, 0.3)
      c.beginPath(); c.arc(rnd() * W, rnd() * H, 4 + rnd() * 16, 0, Math.PI * 2); c.fill()
    }
  }, true), roughness: 0.95, metalness: 0, side: THREE.BackSide })
  const hidden = new THREE.MeshBasicMaterial({ color: p.ink, visible: false })

  if (kind === 'passage') {
    // A vault 2.4 m into the rock; at its end the passage turns, and the Boathouse's light comes round the corner.
    const depth = 2.4
    const vaultGeo = new THREE.ExtrudeGeometry(archShape(), { depth, bevelEnabled: false, curveSegments: 20 })
    const uv = vaultGeo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.8, uv.getY(i) * 0.8)
    const vault = new THREE.Mesh(vaultGeo, [hidden, rockInside])
    vault.position.z = -depth
    vault.receiveShadow = true
    g.add(vault)
    const end = glowFlat(k, ARCH.w, ARCH.spring + ARCH.w / 2, 'right')
    end.position.set(0, (ARCH.spring + ARCH.w / 2) / 2, -depth + 0.01)
    g.add(end)
  } else {
    // A shaft up to the Chart Room's trap: the rock rises out of sight and the trap's light falls down the back.
    const sw = ARCH.w, sd = 0.9
    const shaftGeo = new THREE.BoxGeometry(sw, ROOM.h, sd)
    const shaft = new THREE.Mesh(shaftGeo, [rockInside, rockInside, rockInside, rockInside, hidden, rockInside])
    shaft.position.set(0, ROOM.h / 2, -sd / 2)
    shaft.receiveShadow = true
    g.add(shaft)
    const backGlow = glowFlat(k, sw - 0.02, ROOM.h, 'up')
    backGlow.position.set(0, ROOM.h / 2, -sd + 0.01)
    g.add(backGlow)
    // The ladder stands on the flags just inside the room and leans back through the arch into the shaft.
    const ladder = props.ladder({ colors: p, height: 3.8, width: 0.5, lean: 0.2, seed: 'workshop:ladder' })
    ladder.position.set(0, 0, 0.36)
    g.add(ladder)
  }

  const plate = hsPlate(hs.label, p, 0.74, 0.15)
  plate.name = `plate:${hs.label}`
  plate.position.set(0, ARCH.top + 0.2, 0.15)
  g.add(plate)
  // Two brass screws on the plate.
  const m = new Merger()
  for (const s of [-1, 1]) m.rodZ(0.008, 0.006, 12, k.brass, s * 0.33, ARCH.top + 0.2, 0.153)
  m.build(g, 'plate:screws', false)
  return g
}

// ───────────────────────────── The lathe ─────────────────────────────

/** The cast-iron standard of the lathe: a trapezoid frame with its middle cut out, in the yz plane, centred on x = 0. */
function standardGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-0.31, 0); s.lineTo(0.31, 0); s.lineTo(0.23, 0.76); s.lineTo(-0.23, 0.76); s.lineTo(-0.31, 0)
  const hole = new THREE.Path()
  hole.moveTo(-0.21, 0.1); hole.lineTo(0.21, 0.1); hole.lineTo(0.15, 0.62); hole.lineTo(-0.15, 0.62); hole.lineTo(-0.21, 0.1)
  s.holes.push(hole)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 })
  g.translate(0, 0, -0.03)
  g.rotateY(Math.PI / 2)
  return g
}

/** The flat belt: a closed loop around the flywheel and the cone pulley's middle step, in the yz plane at x. */
function beltGeometry(x: number, top: { y: number; r: number }, bottom: { y: number; r: number }): THREE.BufferGeometry {
  const D = top.y - bottom.y
  const alpha = Math.asin((top.r - bottom.r) / D)
  const pts: THREE.Vector3[] = []
  const arc = (cy: number, r: number, a0: number, a1: number, n: number): void => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      pts.push(new THREE.Vector3(x, cy + Math.sin(a) * r, Math.cos(a) * r))
    }
  }
  arc(top.y, top.r, alpha, Math.PI - alpha, 16)
  arc(bottom.y, bottom.r, Math.PI - alpha, 2 * Math.PI + alpha, 40)
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  const g = new THREE.TubeGeometry(curve, 120, 0.006, 4, true)
  // Flatten the round section into a strap: wide along x, thin across.
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setX(i, x + (pos.getX(i) - x) * 3.2)
  g.computeVertexNormals()
  return g
}

/**
 * The treadle lathe, bed along x, origin on the floor under the bed's middle: iron standards, a pine bed
 * of two shears, the headstock with its cone pulley at the left, the tailstock with its handwheel at the
 * right, the rest, the flywheel and crank under the headstock, the treadle, the belt, and a half-turned
 * blank between the centres (turned to the profile at the headstock end, roughed round, then still square).
 */
function lathe(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'lathe'
  const L = 2.1, bedTop = 0.92, shear = { w: 0.09, h: 0.16, z: 0.185 }
  const iron = new Merger(), pine = new Merger(), steel = new Merger(), brass = new Merger(), lime = new Merger()

  // Standards and their feet.
  for (const s of [-1, 1]) {
    iron.add(standardGeometry(), k.iron, s * 0.85, 0, 0)
    iron.box(0.12, 0.03, 0.7, k.iron, s * 0.85, 0.015, 0)
    iron.box(0.1, 0.02, 0.5, k.iron, s * 0.85, 0.77, 0)
  }
  // The bed: two pine shears bolted across the standards.
  for (const s of [-1, 1]) pine.box(L, shear.h, shear.w, k.pine, 0, bedTop - shear.h / 2, s * shear.z)
  for (const sx of [-1, 1]) for (const s of [-1, 1]) iron.rodX(0.009, 0.004, 10, k.iron, sx * 0.85, bedTop - 0.04, s * (shear.z + shear.w / 2 + 0.002))
  // A floor stretcher between the standards.
  iron.rodX(0.018, 1.64, 12, k.iron, 0, 0.12, -0.2)

  // Headstock: a plate across the shears, two poppets, bearing caps, the spindle, a three-step cone pulley, the drive spur.
  const hx = -0.72
  iron.box(0.36, 0.03, 0.47, k.iron, hx, bedTop + 0.015, 0)
  for (const x of [hx - 0.12, hx + 0.12]) {
    iron.box(0.06, CENTRE_Y - bedTop - 0.03, 0.14, k.iron, x, (bedTop + 0.03 + CENTRE_Y) / 2, 0)
    iron.rodX(0.042, 0.07, 20, k.iron, x, CENTRE_Y, 0)
    brass.cyl(0.008, 0.01, 0.03, 10, k.brass, x, CENTRE_Y + 0.055, 0)
  }
  steel.rodX(0.014, 0.5, 16, k.steel, hx + 0.02, CENTRE_Y, 0)
  const steps = [0.085, 0.07, 0.055]
  steps.forEach((r, i) => iron.rodX(r, 0.05, 32, k.iron, hx - 0.06 + i * 0.06, CENTRE_Y, 0))
  steel.cyl(0.03, 0.03, 0.02, 20, k.steel, hx + 0.27, CENTRE_Y, 0, ROT_Z90)
  steel.add(new THREE.ConeGeometry(0.012, 0.025, 12), k.steel, hx + 0.292, CENTRE_Y, 0, new THREE.Euler(0, 0, -Math.PI / 2))

  // Tailstock: base, poppet, barrel, quill and dead centre, the screw and the handwheel.
  const tx = 0.44
  iron.box(0.22, 0.04, 0.47, k.iron, tx, bedTop + 0.02, 0)
  iron.box(0.16, CENTRE_Y - bedTop - 0.04, 0.12, k.iron, tx, (bedTop + 0.04 + CENTRE_Y) / 2, 0)
  iron.rodX(0.05, 0.2, 24, k.iron, tx, CENTRE_Y, 0)
  steel.rodX(0.02, 0.09, 16, k.steel, tx - 0.14, CENTRE_Y, 0)
  steel.add(new THREE.ConeGeometry(0.014, 0.03, 14), k.steel, tx - 0.2, CENTRE_Y, 0, new THREE.Euler(0, 0, Math.PI / 2))
  steel.rodX(0.008, 0.1, 10, k.steel, tx + 0.14, CENTRE_Y, 0)
  iron.torus(0.065, 0.009, Math.PI * 2, k.iron, tx + 0.19, CENTRE_Y, 0, ROT_Y90, 36)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    iron.rod(new THREE.Vector3(tx + 0.19, CENTRE_Y, 0), new THREE.Vector3(tx + 0.19, CENTRE_Y + Math.sin(a) * 0.062, Math.cos(a) * 0.062), 0.006, 8, k.iron)
  }
  brass.rodX(0.01, 0.05, 12, k.brass, tx + 0.215, CENTRE_Y + 0.062, 0)
  // The clamp lever under the tailstock.
  iron.rod(new THREE.Vector3(tx, bedTop - 0.1, 0.12), new THREE.Vector3(tx + 0.1, bedTop - 0.2, 0.27), 0.008, 8, k.iron)

  // The rest: banjo across the shears, a post, the T-bar along the blank.
  const rx = -0.12
  iron.box(0.1, 0.035, 0.44, k.iron, rx, bedTop + 0.018, 0.02)
  iron.cyl(0.018, 0.018, CENTRE_Y - bedTop - 0.07, 14, k.iron, rx, (bedTop + CENTRE_Y - 0.035) / 2, 0.1)
  iron.box(0.36, 0.022, 0.03, k.iron, rx, CENTRE_Y - 0.035, 0.085)

  // Flywheel and crank under the headstock, in the plane of the belt.
  const fly = { y: 0.36, r: 0.26 }
  const fx = hx
  iron.torus(fly.r, 0.024, Math.PI * 2, k.iron, fx, fly.y, 0, ROT_Y90, 48)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    iron.rod(new THREE.Vector3(fx, fly.y, 0), new THREE.Vector3(fx, fly.y + Math.sin(a) * fly.r, Math.cos(a) * fly.r), 0.011, 8, k.iron)
  }
  iron.rodX(0.045, 0.07, 20, k.iron, fx, fly.y, 0)
  iron.rodX(0.016, 0.3, 12, k.iron, fx - 0.1, fly.y, 0)
  iron.box(0.03, 0.12, 0.05, k.iron, fx + 0.07, fly.y - 0.05, 0)
  const pin = new THREE.Vector3(fx + 0.08, fly.y - 0.1, 0)
  // The treadle: a pine board across the front, on two arms back to a pivot rod by the floor stretcher.
  const treadle = { y: 0.1, z: 0.3 }
  pine.box(1.2, 0.03, 0.16, k.pine, -0.05, treadle.y, treadle.z)
  for (const x of [-0.55, 0.45]) iron.rod(new THREE.Vector3(x, treadle.y, treadle.z - 0.06), new THREE.Vector3(x, 0.12, -0.2), 0.011, 8, k.iron)
  iron.rod(pin, new THREE.Vector3(pin.x, treadle.y + 0.02, treadle.z - 0.04), 0.01, 8, k.iron)

  // The half-turned blank: profile at the headstock end, roughed round, then still square to the tailstock's centre.
  const kingProfile = pieceProfile('k')
  const bs = 2.0
  const turned = new THREE.LatheGeometry(kingProfile.map((v) => new THREE.Vector2(Math.max(v.x * bs, 0.0001), v.y * bs)), 28)
  turned.rotateZ(Math.PI / 2)
  const turnLen = PIECE_HEIGHTS.k * bs
  const x0 = hx + 0.3 + turnLen
  lime.add(turned, k.lime, x0, CENTRE_Y, 0)
  lime.rodX(0.034, 0.22, 11, k.lime, x0 + 0.11, CENTRE_Y, 0)
  const squareFrom = x0 + 0.22, squareTo = tx - 0.2
  lime.box(squareTo - squareFrom, 0.07, 0.07, k.lime, (squareFrom + squareTo) / 2, CENTRE_Y, 0)
  // A few shavings caught on the shears and the rest.
  const rnd = seeded('workshop:curls')
  for (let i = 0; i < 9; i++) {
    const x = x0 - 0.1 + rnd() * 0.45, z = (rnd() - 0.5) * 0.36
    const onRest = i < 2
    lime.torus(0.012 + rnd() * 0.01, 0.0025, Math.PI * (1.2 + rnd()), k.lime, onRest ? rx + (rnd() - 0.5) * 0.2 : x, onRest ? CENTRE_Y - 0.02 : bedTop + 0.008, onRest ? 0.085 : z, new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3), 12, 4)
  }

  iron.build(g, 'lathe:iron')
  pine.build(g, 'lathe:pine')
  steel.build(g, 'lathe:steel')
  brass.build(g, 'lathe:brass')
  lime.build(g, 'lathe:blank')

  const belt = new THREE.Mesh(beltGeometry(hx, { y: CENTRE_Y, r: steps[1] }, fly), mat.flat(mixHex(tokens['br.ground'], p.ink, 0.35)))
  belt.name = 'lathe:belt'
  belt.castShadow = true
  belt.receiveShadow = true
  g.add(belt)

  // Inventory tag on the front shear, right end.
  const tag = hsPlate('HS-0701 · LATHE', p, 0.2, 0.034)
  tag.position.set(0.8, bedTop - 0.08, shear.z + shear.w / 2 + 0.002)
  g.add(tag)
  return g
}

// ───────────────────────────── Turning tools ─────────────────────────────

/**
 * The rack of fourteen turning tools on the back wall (back at z = 0), smallest at the left: a pine
 * backboard and a slotted ledge; the steel drops through the ledge, the brass ferrule sits on it,
 * the ash handle stands above. Handles, ferrules and blades are three instanced meshes.
 */
function toolRack(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'tools'
  const n = dressing.toolCount, pitch = 0.1, ledge = 2.05, out = 0.07
  const m = new Merger()
  m.box(n * pitch + 0.2, 0.66, 0.022, k.pine, 0, ledge + 0.03, 0.011)
  m.box(n * pitch + 0.16, 0.028, 0.1, k.pine, 0, ledge - 0.014, 0.05)
  m.box(n * pitch + 0.16, 0.02, 0.1, k.pine, 0, ledge - 0.19, 0.05)
  for (const s of [-1, 1]) m.box(0.028, 0.22, 0.1, k.pine, s * ((n * pitch) / 2 + 0.07), ledge - 0.1, 0.05)
  m.build(g, 'tools:rack')

  // A turned handle, one unit tall, fattest a third of the way up; a ferrule; a blade hanging from y = 0 to −1.
  const handleGeo = new THREE.LatheGeometry([[0.0001, 0], [0.011, 0], [0.013, 0.08], [0.016, 0.35], [0.0165, 0.6], [0.014, 0.92], [0.011, 0.985], [0.0001, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 14)
  const ferruleGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.024, 14)
  ferruleGeo.translate(0, 0.012, 0)
  const bladeGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 10)
  bladeGeo.translate(0, -0.5, 0)
  bladeGeo.scale(1.3, 1, 0.7)
  const handles = new THREE.InstancedMesh(handleGeo, k.ash, n)
  const ferrules = new THREE.InstancedMesh(ferruleGeo, k.brass, n)
  const blades = new THREE.InstancedMesh(bladeGeo, k.steel, n)
  handles.name = 'tools:handles'; ferrules.name = 'tools:ferrules'; blades.name = 'tools:blades'
  const tm = new THREE.Matrix4(), q = new THREE.Quaternion()
  for (let i = 0; i < n; i++) {
    const len = 0.26 + i * 0.022
    const r = 0.86 + i * 0.03
    const x = (i - (n - 1) / 2) * pitch
    tm.compose(new THREE.Vector3(x, ledge + 0.024, out), q, new THREE.Vector3(r, len * 0.56, r))
    handles.setMatrixAt(i, tm)
    tm.compose(new THREE.Vector3(x, ledge, out), q, new THREE.Vector3(r, 1, r))
    ferrules.setMatrixAt(i, tm)
    tm.compose(new THREE.Vector3(x, ledge, out), q, new THREE.Vector3(0.8 + i * 0.07, len * 0.4, 0.8 + i * 0.07))
    blades.setMatrixAt(i, tm)
  }
  for (const im of [handles, ferrules, blades]) {
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    g.add(im)
  }
  const tag = hsPlate('HS-0703 · TURNING TOOLS, 14', p, 0.34, 0.032)
  tag.position.set(0, ledge - 0.19, 0.1 + 0.0015)
  g.add(tag)
  return g
}

// ───────────────────────────── The profile template ─────────────────────────────

/** Draws one crown on the template card, centred on (x, baseY) at scale s px per metre, outlined or filled. */
function drawCrown(c: CanvasRenderingContext2D, type: PieceType, x: number, baseY: number, s: number, ink: string, filled: boolean): void {
  c.strokeStyle = ink
  c.fillStyle = ink
  c.lineWidth = 2
  const r = 0.0085 * s
  const path = (): void => { if (filled) c.fill(); else c.stroke() }
  c.beginPath()
  switch (type) {
    case 'k': c.rect(x - 0.015 * s, baseY - 0.003 * s, 0.03 * s, 0.003 * s); path(); c.beginPath(); c.rect(x - 0.0012 * s, baseY - 0.013 * s, 0.0024 * s, 0.01 * s); path(); break
    case 'q': c.arc(x, baseY - 0.011 * s, 0.011 * s, 0, Math.PI * 2); path(); c.beginPath(); c.moveTo(x - 0.012 * s, baseY - 0.011 * s); c.lineTo(x + 0.012 * s, baseY - 0.011 * s); c.strokeStyle = filled ? tokens['hs.paper'] : ink; c.stroke(); break
    case 'b': c.moveTo(x - r, baseY); c.lineTo(x - 0.0022 * s, baseY - 0.022 * s); c.lineTo(x + 0.0022 * s, baseY - 0.022 * s); c.lineTo(x + r, baseY); c.closePath(); path(); break
    case 'n': c.rect(x - 0.0062 * s + 0.0052 * s, baseY - 0.017 * s, 0.0124 * s, 0.017 * s); path(); c.beginPath(); c.rect(x + 0.0114 * s, baseY - 0.014 * s, 0.006 * s, 0.006 * s); path(); break
    case 'r': c.moveTo(x - r, baseY); c.lineTo(x - r * 0.86, baseY - 0.02 * s); c.lineTo(x + r * 0.86, baseY - 0.02 * s); c.lineTo(x + r, baseY); c.closePath(); path(); break
    case 'p': c.arc(x, baseY, 0.0068 * s, Math.PI, 0); c.closePath(); path(); break
  }
}

/**
 * The template card, pinned: the one profile drawn full height in section with its centre line and
 * the waist marked, the twelve crowns in two rows (six outlined for lime, six solid for pear), the title,
 * the line in the Keeper's hand and the inventory number.
 */
function profileCard(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'profile'
  const W = 0.86, H = 0.6
  const map = canvasTexture(1024, 712, (c, w, h) => {
    const rnd = seeded('workshop:card')
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      c.fillStyle = rgba(p.brass, 0.08 + rnd() * 0.16)
      c.beginPath(); c.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.4, 0, Math.PI * 2); c.fill()
    }
    const edge = c.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.62)
    edge.addColorStop(0, rgba(p.brass, 0))
    edge.addColorStop(1, rgba(p.brass, 0.22))
    c.fillStyle = edge
    c.fillRect(0, 0, w, h)
    c.strokeStyle = p.ink
    c.lineWidth = 3
    c.strokeRect(22, 22, w - 44, h - 44)
    c.lineWidth = 1
    c.strokeRect(30, 30, w - 60, h - 60)

    // The profile, full height, both halves, on a centre line.
    const prof = pieceProfile('k')
    const s = 4300, cx = 230, base = h - 74
    c.fillStyle = rgba(p.ink, 0.08)
    c.strokeStyle = p.ink
    c.lineWidth = 2.5
    c.beginPath()
    prof.forEach((v, i) => { const X = cx + v.x * s, Y = base - v.y * s; if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y) })
    for (let i = prof.length - 1; i >= 0; i--) c.lineTo(cx - prof[i].x * s, base - prof[i].y * s)
    c.closePath()
    c.fill()
    c.stroke()
    c.setLineDash([10, 6])
    c.lineWidth = 1
    c.beginPath(); c.moveTo(cx, base + 24); c.lineTo(cx, base - PIECE_HEIGHTS.k * s - 30); c.stroke()
    c.setLineDash([])
    // Ticks for the waist and the collars, with their names.
    const marks: [number, string][] = [[0.004, 'FELT'], [0.009, 'BRASS'], [0.4 * PIECE_HEIGHTS.k, 'WAIST']]
    for (const [y, label] of marks) {
      const Y = base - y * s
      c.beginPath(); c.moveTo(cx + 80, Y); c.lineTo(cx + 120, Y); c.stroke()
      caps(c, label, cx + 128, Y, 19, p.ink, 500, 0.14, 'left')
    }
    // The twelve crowns: lime above, pear below.
    const order: PieceType[] = ['k', 'q', 'b', 'n', 'r', 'p']
    order.forEach((t, i) => {
      const x = 560 + i * 74
      drawCrown(c, t, x, 330, 3000, p.ink, false)
      drawCrown(c, t, x, 480, 3000, p.ink, true)
      caps(c, t.toUpperCase(), x, 362, 17, p.ink, 500, 0.1)
      caps(c, t.toUpperCase(), x, 512, 17, p.ink, 500, 0.1)
    })
    caps(c, 'LIME', 500, 322, 15, p.ink, 500, 0.16, 'right')
    caps(c, 'PEAR', 500, 472, 15, p.ink, 500, 0.16, 'right')
    caps(c, 'THE PROFILE  ·  1931', 740, 96, 40, p.ink, 500, 0.16)
    c.font = `italic 400 30px ${FONT_SANS}`
    c.fillStyle = p.ink
    c.textAlign = 'center'
    c.fillText('One profile. Twelve crowns.', 740, 178)
    c.strokeStyle = p.ink
    c.lineWidth = 1.5
    c.beginPath(); c.moveTo(560, 132); c.lineTo(920, 132); c.stroke()
    caps(c, 'HS-0711', w - 60, h - 56, 22, p.ink, 500, 0.14, 'right')
    caps(c, 'CARD TEMPLATE', w - 60, h - 86, 15, p.ink, 400, 0.14, 'right')
  })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 }))
  card.name = 'profile:card'
  card.position.z = 0.004
  card.receiveShadow = true
  g.add(card)
  // A backing of pine lath behind the card, and four brass drawing pins.
  const m = new Merger()
  m.box(W + 0.05, H + 0.05, 0.012, k.pine, 0, 0, -0.004)
  m.build(g, 'profile:board')
  const bm = new Merger()
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    bm.cyl(0.009, 0.009, 0.003, 14, k.brass, sx * (W / 2 - 0.022), sy * (H / 2 - 0.022), 0.007, ROT_X90)
    bm.sphere(0.004, 8, k.brass, sx * (W / 2 - 0.022), sy * (H / 2 - 0.022), 0.009)
  }
  bm.build(g, 'profile:pins', false)
  return g
}

// ───────────────────────────── Turnings and blanks ─────────────────────────────

/** The order of the pieces along one tier: the back rank, then eight pawns. */
const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']

/**
 * One test-turning, at three times playing size, as one geometry: the shared profile and its crown.
 * A knight's head faces `facing` (a unit x): toward the room on the shelf, toward the wall for the thirty-third.
 */
function turningGeometry(type: PieceType, facing = -1): THREE.BufferGeometry {
  const S = TURN_SCALE
  const prof = pieceProfile(type).map((v) => new THREE.Vector2(Math.max(v.x * S, 0.0001), v.y * S))
  const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof, 14).toNonIndexed()]
  const top = prof[prof.length - 1].y
  const r = prof[prof.length - 2].x
  const H = PIECE_HEIGHTS[type] * S
  const crown = H - top
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => {
    const n = g.index ? g.toNonIndexed() : g
    n.translate(x, y, z)
    return n
  }
  switch (type) {
    case 'k':
      parts.push(at(new THREE.CylinderGeometry(0.015 * S, 0.015 * S, 0.003 * S, 14), 0, top + 0.0015 * S, 0))
      parts.push(at(new THREE.CylinderGeometry(0.0016 * S, 0.0016 * S, crown - 0.003 * S, 8), 0, top + 0.003 * S + (crown - 0.003 * S) / 2, 0))
      break
    case 'q':
      parts.push(at(new THREE.SphereGeometry(0.011 * S, 14, 8), 0, top + crown - 0.011 * S, 0))
      break
    case 'b':
      parts.push(at(new THREE.CylinderGeometry(0.0022 * S, r, crown, 14), 0, top + crown / 2, 0))
      break
    case 'n': {
      // The periscope head: a column set off the axis, and its short snout looking one way.
      const off = facing * 0.0068 * S
      parts.push(at(new THREE.CylinderGeometry(0.0066 * S, 0.0066 * S, crown, 14), off, top + crown / 2, 0))
      const snout = new THREE.CylinderGeometry(0.0042 * S, 0.0042 * S, 0.012 * S, 10)
      snout.rotateZ(Math.PI / 2)
      parts.push(at(snout, off + facing * 0.009 * S, top + crown * 0.66, 0))
      break
    }
    case 'r':
      parts.push(at(new THREE.CylinderGeometry(r * 0.86, r, crown, 14), 0, top + crown / 2, 0))
      break
    case 'p':
      parts.push(at(new THREE.SphereGeometry(r, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, top, 0))
      break
  }
  for (const part of parts) if (part.attributes.uv === undefined) part.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count * 2), 2))
  const merged = mergeGeometries(parts.map((g) => {
    const clean = new THREE.BufferGeometry()
    clean.setAttribute('position', g.attributes.position)
    clean.setAttribute('normal', g.attributes.normal)
    clean.setAttribute('uv', g.attributes.uv)
    return clean
  }), false)
  if (!merged) throw new Error('turning geometry failed to merge')
  return merged
}

/** How far the shelves' centre line stands off a side wall (clear of the deepest rock facet). */
const SHELF_X = ROOM.w / 2 - 0.11 - SHELF.depth / 2

/**
 * Open pine shelving on a side wall, `side` −1 (left) or +1 (right): four tiers and a capping board
 * cantilevered on iron brackets from two flat iron standards against the rock, so nothing stands
 * between the room and the end of a tier.
 */
function shelving(k: Kit, side: -1 | 1): THREE.Group {
  const g = new THREE.Group()
  g.name = side < 0 ? 'shelf:blanks' : 'shelf:turnings'
  const x = side * SHELF_X
  const len = SHELF.zMax - SHELF.zMin
  const zc = (SHELF.zMax + SHELF.zMin) / 2
  const pine = new Merger(), iron = new Merger()
  for (const y of SHELF.tops) pine.box(SHELF.depth, 0.028, len, k.pine, x, y - 0.014, zc)
  const capY = SHELF.tops[0] + 0.37
  pine.box(SHELF.depth + 0.02, 0.03, len + 0.04, k.pine, x, capY, zc)
  const wallX = side * (ROOM.w / 2 - 0.105)
  const low = SHELF.tops[3] - 0.24, high = capY + 0.08
  for (const z of [SHELF.zMin + 0.28, SHELF.zMax - 0.28]) {
    iron.box(0.012, high - low, 0.04, k.iron, wallX, (high + low) / 2, z)
    for (const y of [...SHELF.tops, capY + 0.015]) {
      // A bracket: an arm under the board and a stay from the standard up to the arm's end.
      iron.box(SHELF.depth - 0.03, 0.012, 0.014, k.iron, x + side * 0.015, y - 0.034, z)
      iron.rod(new THREE.Vector3(wallX - side * 0.006, y - 0.16, z), new THREE.Vector3(x - side * (SHELF.depth / 2 - 0.04), y - 0.04, z), 0.005, 6, k.iron)
    }
  }
  pine.build(g, 'shelf:pine', false)
  iron.build(g, 'shelf:iron', false)
  return g
}

/**
 * The shelf of test-turnings on the right wall: the whole set of thirty-two, lime above and pear below
 * (back rank, pawns, pawns, back rank), instanced one mesh per type; and at the front end of the top
 * tier, apart from the rest, the thirty-third: a knight with its head on the wrong side (the flaw).
 */
function turningsShelf(k: Kit): { group: THREE.Group; thirtyThird: THREE.Mesh } {
  const p = k.p
  const g = shelving(k, 1)
  g.name = 'turnings'
  const x = SHELF_X
  const tiers: { types: PieceType[]; wood: string }[] = [
    { types: BACK_RANK, wood: tokens['br.lightBody'] },
    { types: Array<PieceType>(8).fill('p'), wood: tokens['br.lightBody'] },
    { types: Array<PieceType>(8).fill('p'), wood: tokens['br.darkBody'] },
    { types: BACK_RANK, wood: tokens['br.darkBody'] },
  ]
  const slots = new Map<PieceType, { m: THREE.Matrix4; tint: THREE.Color }[]>()
  const rnd = seeded('workshop:turnings')
  tiers.forEach((tier, ti) => tier.types.forEach((t, i) => {
    const list = slots.get(t) ?? []
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + (rnd() - 0.5) * 0.01, SHELF.tops[ti], SHELF.z0 + i * SHELF.pitch), new THREE.Quaternion().setFromAxisAngle(UP, rnd() * 0.4), new THREE.Vector3(1, 1, 1))
    list.push({ m, tint: tintFor(tier.wood) })
    slots.set(t, list)
  }))
  let count = 0
  for (const [type, list] of slots) {
    const im = new THREE.InstancedMesh(turningGeometry(type), k.turned, list.length)
    im.name = `turnings:${type}`
    list.forEach((s, i) => { im.setMatrixAt(i, s.m); im.setColorAt(i, s.tint) })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.castShadow = false
    im.receiveShadow = true
    g.add(im)
    count += list.length
  }
  g.userData.count = count

  // The thirty-third, built on its own: a lime knight looking at the wall.
  const thirtyThird = new THREE.Mesh(turningGeometry('n', 1), k.lime)
  thirtyThird.name = 'turnings:thirty-third'
  thirtyThird.position.set(x, SHELF.tops[0], SHELF.endZ)
  thirtyThird.castShadow = false
  thirtyThird.receiveShadow = true
  thirtyThird.userData.flaw = dressing.thirtyThird
  g.add(thirtyThird)

  // The inventory tag on the front upright, facing the room.
  const label = tag('HS-0707 · TURNINGS, 33', { color: p.paper, ink: p.ink })
  label.name = 'hs:HS-0707'
  label.position.set(x - 0.03, SHELF.tops[3] - 0.03, SHELF.zMax - 0.004)
  g.add(label)
  return { group: g, thirtyThird }
}

/** The mirror shelf on the left wall: thirty-two rough blanks, square billets cut to each piece's length; its end slot empty. */
function blanksShelf(k: Kit): THREE.Group {
  const g = shelving(k, -1)
  const x = -SHELF_X
  const tiers: { types: PieceType[]; wood: string }[] = [
    { types: BACK_RANK, wood: tokens['br.lightBody'] },
    { types: Array<PieceType>(8).fill('p'), wood: tokens['br.lightBody'] },
    { types: Array<PieceType>(8).fill('p'), wood: tokens['br.darkBody'] },
    { types: BACK_RANK, wood: tokens['br.darkBody'] },
  ]
  const geo = new THREE.BoxGeometry(1, 1, 1)
  geo.translate(0, 0.5, 0)
  const im = new THREE.InstancedMesh(geo, k.turned, 32)
  im.name = 'blanks'
  const rnd = seeded('workshop:blanks')
  let i = 0
  tiers.forEach((tier, ti) => tier.types.forEach((t, j) => {
    const side = (t === 'p' ? 0.026 : 0.034) * TURN_SCALE * 0.92
    const hgt = PIECE_HEIGHTS[t] * TURN_SCALE + 0.02
    im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x + (rnd() - 0.5) * 0.01, SHELF.tops[ti], SHELF.z0 + j * SHELF.pitch), new THREE.Quaternion().setFromAxisAngle(UP, (rnd() - 0.5) * 0.3), new THREE.Vector3(side, hgt, side)))
    im.setColorAt(i, tintFor(tier.wood))
    i++
  }))
  im.instanceMatrix.needsUpdate = true
  if (im.instanceColor) im.instanceColor.needsUpdate = true
  im.castShadow = false
  im.receiveShadow = true
  g.add(im)
  return g
}

// ───────────────────────────── Benches, the dies and the blanks board ─────────────────────────────

/** A pine bench against the back wall (its back at z = 0), with a lower shelf and a vice at its outer end (`side`). */
function bench(k: Kit, side: -1 | 1, into: Merger, ironInto: Merger): void {
  const w = 1.5, d = 0.56, h = 0.87
  const cx = side * 2.35, cz = d / 2 + 0.06
  into.box(w, 0.06, d, k.pine, cx, h - 0.03, cz)
  into.box(w - 0.1, 0.03, d - 0.1, k.pine, cx, 0.2, cz)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) into.box(0.07, h - 0.06, 0.07, k.pine, cx + sx * (w / 2 - 0.06), (h - 0.06) / 2, cz + sz * (d / 2 - 0.06))
  into.box(w - 0.1, 0.1, 0.025, k.pine, cx, h - 0.11, cz + d / 2 - 0.02)
  // The vice at the outer front corner: fixed and moving jaws, the screw and its tommy bar.
  const vx = cx + side * (w / 2 - 0.2), vz = cz + d / 2
  ironInto.box(0.2, 0.1, 0.04, k.iron, vx, h - 0.03, vz + 0.02)
  ironInto.box(0.2, 0.1, 0.04, k.iron, vx, h - 0.03, vz + 0.1)
  ironInto.rodZ(0.012, 0.22, 10, k.iron, vx, h - 0.05, vz + 0.12)
  ironInto.rodX(0.007, 0.22, 8, k.iron, vx, h - 0.05, vz + 0.23)
  for (const s of [-1, 1]) ironInto.sphere(0.014, 10, k.iron, vx + s * 0.11, h - 0.05, vz + 0.23)
}

/** The brass tray of the sixty-four collar dies, leaning against the rock on the left bench; its face engraved a1 to h8. */
function diesTray(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'dies'
  const S = 0.44, tilt = THREE.MathUtils.degToRad(62)
  const tray = new THREE.Group()
  tray.rotation.x = tilt
  const m = new Merger()
  m.box(S, 0.02, S, k.brass, 0, 0.01, -S / 2)
  for (const s of [-1, 1]) {
    m.box(0.012, 0.035, S, k.brass, s * (S / 2 - 0.006), 0.0275, -S / 2)
    m.box(S, 0.035, 0.012, k.brass, 0, 0.0275, -S / 2 + s * (S / 2 - 0.006))
  }
  m.build(tray, 'dies:tray')
  const face = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.024, S - 0.024), new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = scaled(p.brass, 0.9)
    c.fillRect(0, 0, w, h)
    const pad = w * 0.04, cw = (w - pad * 2) / 8
    c.strokeStyle = rgba(p.ink, 0.6)
    c.lineWidth = 1.5
    for (let i = 0; i <= 8; i++) {
      c.beginPath(); c.moveTo(pad + i * cw, pad); c.lineTo(pad + i * cw, h - pad); c.stroke()
      c.beginPath(); c.moveTo(pad, pad + i * cw); c.lineTo(w - pad, pad + i * cw); c.stroke()
    }
    const files = 'abcdefgh'
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) caps(c, `${files[f]}${r + 1}`, pad + f * cw + cw / 2, pad + (7 - r) * cw + cw * 0.84, 10, rgba(p.ink, 0.75), 500, 0.06)
  }), roughness: 0.4, metalness: 0.75 }))
  face.rotation.x = -Math.PI / 2
  face.position.set(0, 0.0205, -S / 2)
  tray.add(face)
  const dieGeo = new THREE.CylinderGeometry(0.0155, 0.0155, 0.022, 10)
  const dies = new THREE.InstancedMesh(dieGeo, k.brass, dressing.dieCount)
  dies.name = 'dies:64'
  const pad = (S - 0.024) * 0.04, cw = (S - 0.024 - pad * 2) / 8
  const x0 = -(S - 0.024) / 2 + pad + cw / 2
  let i = 0
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    dies.setMatrixAt(i++, new THREE.Matrix4().makeTranslation(x0 + f * cw, 0.031, -S / 2 - ((S - 0.024) / 2 - pad - cw / 2) + (7 - r) * cw - cw * 0.08))
  }
  dies.instanceMatrix.needsUpdate = true
  dies.castShadow = true
  dies.receiveShadow = true
  tray.add(dies)
  g.add(tray)
  const tag = hsPlate('HS-0713 · COLLAR DIES, 64', p, 0.2, 0.03)
  tag.position.set(0, -0.11, 0.32)
  g.add(tag)
  return g
}

/** The mirror of the dies on the right bench: a pine board of sixty-four blank ends, lime and pear chequered. */
function blanksBoard(k: Kit): THREE.Group {
  const g = new THREE.Group()
  g.name = 'blanksBoard'
  const S = 0.44, tilt = THREE.MathUtils.degToRad(62)
  const board = new THREE.Group()
  board.rotation.x = tilt
  const m = new Merger()
  m.box(S, 0.025, S, k.pine, 0, 0.0125, -S / 2)
  m.build(board, 'blanks:board')
  const ends = new THREE.InstancedMesh(new THREE.BoxGeometry(0.036, 0.018, 0.036), k.turned, 64)
  ends.name = 'blanks:ends'
  const cw = (S - 0.04) / 8
  let i = 0
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    ends.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-S / 2 + 0.02 + cw / 2 + f * cw, 0.034, -S + 0.02 + cw / 2 + r * cw))
    ends.setColorAt(i, tintFor((f + r) % 2 === 0 ? tokens['br.darkBody'] : tokens['br.lightBody']))
    i++
  }
  ends.instanceMatrix.needsUpdate = true
  if (ends.instanceColor) ends.instanceColor.needsUpdate = true
  ends.castShadow = true
  ends.receiveShadow = true
  board.add(ends)
  g.add(board)
  return g
}

/** A pine shadow board over a bench (back at z = 0): three pairs of calipers hung over their painted outlines. */
function caliperBoard(k: Kit, boardMat: THREE.Material, steel: Merger, pine: Merger, x: number): void {
  const w = 0.56, h = 0.46, y = 1.72, z0 = 0.045
  pine.box(w, h, 0.02, boardMat, x, y, z0 + 0.01)
  const spans = [0.13, 0.17, 0.21]
  spans.forEach((span, i) => {
    const cx = x + (i - 1) * 0.17
    const top = y + h / 2 - 0.07
    // Two legs as arcs bowed outward, a hinge and a peg.
    // Two bowed legs: arcs of radius 0.6·span over 1.4 rad, bulging outward, meeting at the hinge and the tips.
    const R = span * 0.6
    for (const s of [-1, 1]) steel.torus(R, 0.0035, 1.4, k.steel, cx - s * (R - span * 0.25), top - 0.39 * span, z0 + 0.036, new THREE.Euler(0, 0, s > 0 ? -0.7 : Math.PI - 0.7), 12, 4)
    steel.rodZ(0.008, 0.012, 10, k.steel, cx, top, z0 + 0.036)
    steel.rodZ(0.004, 0.04, 8, k.steel, cx, top + 0.01, z0 + 0.022)
  })
}

// ───────────────────────────── Floor shavings ─────────────────────────────

/** Shaving curls painted on the flags under the lathe: a tidy oval drift of lime with a few pear. */
function shavings(k: Kit): THREE.Mesh {
  const w = 2.6, d = 1.1
  const map = canvasTexture(1024, 432, (c, W, H) => {
    const rnd = seeded('workshop:shavings')
    const gauss = (): number => (rnd() + rnd() + rnd() - 1.5) / 1.5
    for (let i = 0; i < 420; i++) {
      const x = W / 2 + gauss() * W * 0.36
      const y = H / 2 + gauss() * H * 0.34
      const r = 5 + rnd() * 11
      const turns = 1.2 + rnd() * 1.4
      const a0 = rnd() * Math.PI * 2
      const pear = rnd() < 0.1
      const body = pear ? tokens['br.darkBody'] : tokens['br.lightBody']
      const trace = (dx: number, dy: number, col: string, lw: number): void => {
        c.strokeStyle = col
        c.lineWidth = lw
        c.beginPath()
        for (let t = 0; t <= 1; t += 0.03) {
          const a = a0 + t * turns * Math.PI * 2
          const rr = r * (1 - t * 0.55)
          const px = x + dx + Math.cos(a) * rr + t * r * 0.9, py = y + dy + Math.sin(a) * rr * 0.6
          if (t === 0) c.moveTo(px, py); else c.lineTo(px, py)
        }
        c.stroke()
      }
      trace(1, 2, rgba(k.p.ink, 0.28), 3.2)
      trace(0, 0, scaled(body, 0.82, 0.95), 2.8)
      trace(-0.6, -0.6, scaled(body, 1.04, 0.9), 1.2)
    }
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }))
  mesh.name = 'shavings'
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, 0.003, LATHE_Z + 0.45)
  mesh.receiveShadow = true
  return mesh
}

// ───────────────────────────── The lamp ─────────────────────────────

/** One enamel lamp on a flex from the middle joist, over the lathe; the one light the builder adds. */
function hangingLamp(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'lamp'
  const top = ROOM.h - 0.24, y = 2.52
  const m = new Merger()
  m.cyl(0.035, 0.035, 0.02, 18, k.brass, 0, top - 0.01, 0)
  m.cyl(0.0035, 0.0035, top - y - 0.24, 6, mat.flat(p.ink), 0, (top + y + 0.24) / 2, 0)
  m.cyl(0.018, 0.024, 0.05, 16, k.brass, 0, y + 0.215, 0)
  m.torus(0.182, 0.005, Math.PI * 2, k.brass, 0, y, 0, ROT_X90, 40, 6)
  m.build(g, 'lamp:fittings', false)
  const shadeGeo = new THREE.LatheGeometry([[0.182, 0], [0.178, 0.012], [0.158, 0.055], [0.125, 0.11], [0.085, 0.16], [0.05, 0.19], [0.028, 0.2]].map(([r, h]) => new THREE.Vector2(r, h)), 40)
  const outer = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: p.wallAlt, roughness: 0.42, metalness: 0.1 }))
  outer.position.y = y
  outer.castShadow = true
  g.add(outer)
  const inner = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: p.paper, emissive: p.light, emissiveIntensity: 0.22, roughness: 0.6, metalness: 0, side: THREE.BackSide }))
  inner.position.y = y - 0.002
  inner.scale.setScalar(0.985)
  g.add(inner)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), new THREE.MeshStandardMaterial({ color: p.light, emissive: p.light, emissiveIntensity: 1.3, roughness: 0.8, metalness: 0 }))
  bulb.position.y = y + 0.07
  g.add(bulb)
  const light = new THREE.PointLight(new THREE.Color(p.light), 9, 8, 2)
  light.position.y = y + 0.08
  light.castShadow = false
  g.add(light)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/**
 * Builds the Workshop in local space (origin at the floor centre, open toward +z): the lathe with the
 * Keeper behind it, the tools and the profile over them, the benches with the dies and the blanks, the
 * two shelves, the ladder arch and the passage arch. Registers every hotspot in the definition; the one
 * flaw is the thirty-third turning (`userData.flaw` on it). `group.userData.tick(dt)` lets the lamp settle.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const k = kitOf(p)
  const { w, d } = ROOM
  const backZ = -d / 2
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }
  const face = backZ + 0.12

  group.add(shell(k))

  // The lathe, centred, bed parallel to the frame; the Keeper behind it facing the room.
  const theLathe = lathe(k)
  theLathe.position.z = LATHE_Z
  group.add(theLathe)
  register('workshop.lathe', theLathe)
  group.add(shavings(k))

  const ferrier = figure({ variant: 'ferrier' })
  ferrier.position.set(0, 0, LATHE_Z - 0.68)
  group.add(ferrier)
  register('workshop.ferrier', ferrier)
  out.residentAnchor = ferrier

  // The tools over him, the profile over them.
  const tools = toolRack(k)
  tools.position.z = face
  group.add(tools)
  register('workshop.tools', tools)
  const card = profileCard(k)
  card.position.set(0, 3.12, face + 0.01)
  group.add(card)
  register('workshop.profile', card)

  // Two benches, two vices, two shadow boards of calipers, mirrored.
  const pine = new Merger(), iron = new Merger(), steel = new Merger()
  const boardTex = canvasTexture(256, 256, (c, W, H) => {
    const rnd = seeded('workshop:shadowboard')
    c.fillStyle = p.wood
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = rgba(p.woodGrain, 0.2 + rnd() * 0.2)
      c.lineWidth = 1 + rnd()
      const y = rnd() * H
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * 8, W * 0.7, y + (rnd() - 0.5) * 8, W, y + (rnd() - 0.5) * 6); c.stroke()
    }
    // Painted outlines where the calipers hang.
    c.strokeStyle = rgba(p.ink, 0.55)
    c.lineWidth = 3
    const spans = [0.13, 0.17, 0.21]
    spans.forEach((span, i) => {
      const cx = W / 2 + (i - 1) * (0.17 / 0.56) * W
      const top = H * (0.07 / 0.46)
      const r = (span * 0.5 / 0.46) * H
      c.beginPath(); c.ellipse(cx, top + r, r * 0.62, r, 0, 0, Math.PI * 2); c.stroke()
    })
  })
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7, metalness: 0 })
  for (const s of [-1, 1] as const) {
    bench(k, s, pine, iron)
    caliperBoard(k, boardMat, steel, pine, s * 2.35)
  }
  const furniture = new THREE.Group()
  furniture.name = 'benches'
  furniture.position.z = backZ + 0.07
  pine.build(furniture, 'benches:pine')
  iron.build(furniture, 'benches:iron')
  steel.build(furniture, 'benches:calipers')
  group.add(furniture)

  const dies = diesTray(k)
  dies.position.set(-2.35, 0.87, backZ + 0.07 + 0.06 + 0.44 * Math.cos(THREE.MathUtils.degToRad(62)) + 0.03)
  group.add(dies)
  register('workshop.dies', dies)
  const blanks = blanksBoard(k)
  blanks.position.set(2.35, 0.87, dies.position.z)
  group.add(blanks)

  // The shelves: blanks on the left, the test-turnings and the thirty-third on the right.
  group.add(blanksShelf(k))
  const turnings = turningsShelf(k)
  group.add(turnings.group)
  register('workshop.turnings', turnings.group)

  // Exits: the ladder arch and the passage arch, mirrored in the side walls.
  for (const hs of ctx.def.hotspots) {
    if (hs.kind !== 'door') continue
    const right = hs.via === 'dolly-right'
    const kind = hs.via === 'dolly-right' || hs.via === 'dolly-left' ? 'passage' : 'shaft'
    const arch = archway(hs, k, kind)
    arch.position.set((right ? 1 : -1) * (w / 2), 0, ARCH.z)
    arch.rotation.y = right ? -Math.PI / 2 : Math.PI / 2
    group.add(arch)
    register(hs.id, arch)
  }

  // One lamp over the lathe, hung from the middle joist; it settles, very slowly, and never on hover.
  const hang = ROOM.h - 0.24
  const pivot = new THREE.Group()
  pivot.name = 'lamp:pivot'
  pivot.position.set(0, hang, LATHE_Z)
  const lamp = hangingLamp(k)
  lamp.position.y = -hang
  pivot.add(lamp)
  group.add(pivot)
  let t = 0
  group.userData.tick = (dt: number): void => {
    t += dt
    pivot.rotation.z = 0.0035 * Math.sin(t * 0.7)
    pivot.rotation.x = 0.002 * Math.sin(t * 0.43 + 1.1)
  }

  // Every hotspot in the definition is an object in the room.
  for (const def of ctx.def.hotspots) if (!out.hotspots.has(def.id)) console.warn(`[workshop] hotspot ${def.id} has no object`)
  return out
}
