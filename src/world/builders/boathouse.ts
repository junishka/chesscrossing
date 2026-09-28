// Frame 9: The Boathouse (below, right). docs/BIBLE.md §6 Frame 9, palette §3.2 walls, §3.3 water.
// Cut into the rock under the Galley: three walls of flat granite facets, mustard distemper above the
// high-water line and bare wet rock below it, the line itself painted wobbly in raspberry by a child,
// HIGH WATER SPRINGS lettered over it on the back wall. The slipway is centred and runs from the back
// wall toward the camera and down into the water, which fills the dock between two stone quays and the
// whole front third of the room. The launch's cradle stands centred on the slipway, oak, empty, its
// brass plate on the front bearer: that is the flaw, and it is enough. Tender No. 1 on trestles on the
// right quay, her name on the transom; the slipway winch on the left quay, its cable over a sheave at the
// head of the slip and down the slip to a hook that holds nothing. One oar and one boathook racked on each
// side wall; the lifebuoy H.I.H.S. centred on the back wall between two caged bulkhead lamps. The rock
// passage to the Workshop in the left wall, the ladder up to the Galley's hatch in the back right, the
// slipway doors at the quay ends laid open outward. Rowan Tuck coils rope at the right, at high water only.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import { FONT_SANS } from '../../core/fonts'
import { mat, seeded } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { tokens, type RegionPalette } from '../../content/palette'
import { dressing } from '../../content/frames/boathouse'
import { figure } from '../figures'
import * as props from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres: width, height, depth (open toward +z, back wall at z = −d/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
/** The top of the quays (the hard): two courses of dressed granite above the rock floor of the dock. */
const HARD = 0.36
/** The water at the tide's level in the slipway. */
const WATER_Y = 0.15
/** The painted high-water line on the rock. */
const TIDE_Y = 1.4
/** Where the walls start, below the water. */
const WALL_Y0 = -0.7
/** Half the width of the dock between the quays; the slipway fills it. */
const DOCK = 1.3
/** The quays end here; the water runs across the whole room in front of them. */
const QUAY_END = 1.0
/** The slipway's fall toward the camera (rise over run): level with the hard at the back wall, into the water at z = −0.9. */
const SLOPE = (HARD - WATER_Y) / 2.1
/** The rock passage in the left wall: centre along the wall (world z), opening width, springing, surround, top. */
const ARCH = { z: 0.1, w: 1.1, spring: 1.9, surround: 0.25, top: 2.75 } as const
/** Tender No. 1 on her trestles: centre x, bow and transom z, the keel's height above the hard. */
const TENDER = { x: 2.42, bow: -2.1, transom: 1.38, keel: 0.62 } as const
/** The cradle along the slipway: its centre z and length. */
const CRADLE = { z: -1.3, length: 3.0 } as const
/** The winch on the left quay. */
const WINCH = { x: -2.4, z: -2.3 } as const

/** The slipway surface at z (top of the setts). */
function slipY(z: number): number {
  return HARD - SLOPE * (z + ROOM.d / 2)
}

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

/** A palette hex scaled in value by `k`, as `#rrggbb` (the same hue and saturation, darker or lighter). */
function shade(hex: string, k: number): string {
  return '#' + hexToRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0')).join('')
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
  bump.repeat.copy(tex.repeat)
  return bump
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

/** Short brush strokes along `angle` (radians), `count` of them, over a rectangle of the canvas. */
function brush(c: CanvasRenderingContext2D, rnd: () => number, o: { x: number; y: number; w: number; h: number; count: number; color: () => string; len: [number, number]; width: [number, number]; angle: number; wobble: number }): void {
  c.lineCap = 'round'
  for (let i = 0; i < o.count; i++) {
    const x = o.x + rnd() * o.w, y = o.y + rnd() * o.h
    const a = o.angle + (rnd() - 0.5) * o.wobble
    const l = o.len[0] + rnd() * (o.len[1] - o.len[0])
    c.strokeStyle = o.color()
    c.lineWidth = o.width[0] + rnd() * (o.width[1] - o.width[0])
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    c.stroke()
  }
}

// ───────────────────────────── Merged geometry ─────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)
const ROT_X90 = new THREE.Euler(Math.PI / 2, 0, 0)
const ROT_Z90 = new THREE.Euler(0, 0, Math.PI / 2)

/** Collects geometry per material and merges it into one mesh per material: one draw call each. */
class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  /** A placement applied after each part's own, so one merger can collect mirrored or repeated assemblies. */
  outer?: THREE.Matrix4

  add(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1)))
    if (this.outer) g.applyMatrix4(this.outer)
    const list = this.parts.get(material) ?? []
    list.push(g)
    this.parts.set(material, list)
    geometry.dispose()
  }

  /** Adds a geometry already placed by a full matrix. */
  addMatrix(geometry: THREE.BufferGeometry, material: THREE.Material, m: THREE.Matrix4): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    g.applyMatrix4(m)
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
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()))
    const mid = a.clone().lerp(b, 0.5)
    this.add(g, material, mid.x, mid.y, mid.z)
  }

  /** A square-section timber stretched between two points (braces, trestle legs). */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, material: THREE.Material): void {
    const g = new THREE.BoxGeometry(w, a.distanceTo(b), d)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()))
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

/** A small paper plate with the inventory tag or a destination in letterspaced caps. */
function hsPlate(text: string, p: RegionPalette, width: number, height = width * 0.22): THREE.Mesh {
  const plate = placard({ lines: [text], width, height, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `hs:${text}`
  return plate
}

/** An engraved brass plate. */
function brassPlate(lines: string[], p: RegionPalette, width: number, height: number): THREE.Mesh {
  const plate = placard({ lines, width, height, bg: p.brass, color: p.ink, border: p.ink })
  plate.name = `brass:${lines[0]}`
  return plate
}

// ───────────────────────────── Materials of the room ─────────────────────────────

interface Kit {
  p: RegionPalette
  rock: string
  iron: THREE.Material
  oak: THREE.Material
  pine: THREE.Material
  brass: THREE.Material
  granite: THREE.Material
  rope: THREE.Material
  cable: THREE.Material
  hidden: THREE.Material
}

/** Hemp: the path's crushed-shell tone laid in a tight twist of darker strands. */
function ropeMaterial(p: RegionPalette): THREE.MeshStandardMaterial {
  const hemp = tokens['out.path']
  const map = canvasTexture(64, 64, (c, W, H) => {
    c.fillStyle = hemp
    c.fillRect(0, 0, W, H)
    c.lineWidth = 5
    for (let i = -4; i < 8; i++) {
      c.strokeStyle = scaled(hemp, 0.72, 0.8)
      c.beginPath(); c.moveTo(i * 12, 0); c.lineTo(i * 12 + 32, H); c.stroke()
      c.strokeStyle = rgba(p.paper, 0.25)
      c.lineWidth = 2
      c.beginPath(); c.moveTo(i * 12 + 4, 0); c.lineTo(i * 12 + 36, H); c.stroke()
      c.lineWidth = 5
    }
  }, true)
  map.repeat.set(24, 1)
  return new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.004, roughness: 0.95, metalness: 0 })
}

/** Wire rope: galvanised grey from the house's ink and paper, twisted, a little oil in it. */
function cableMaterial(p: RegionPalette): THREE.MeshStandardMaterial {
  const wire = mixHex(p.ink, p.paper, 0.42)
  const map = canvasTexture(64, 64, (c, W, H) => {
    c.fillStyle = wire
    c.fillRect(0, 0, W, H)
    c.lineWidth = 4
    for (let i = -4; i < 8; i++) {
      c.strokeStyle = scaled(wire, 0.6, 0.8)
      c.beginPath(); c.moveTo(i * 10, 0); c.lineTo(i * 10 + 28, H); c.stroke()
    }
  }, true)
  map.repeat.set(60, 1)
  return new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.55 })
}

function kitOf(p: RegionPalette): Kit {
  return {
    p,
    rock: tokens['out.rock'],
    // Cast iron, painted in the house's ink and worn to a dull sheen.
    iron: new THREE.MeshStandardMaterial({ color: p.ink, roughness: 0.55, metalness: 0.45 }),
    // Oak, weathered: the house timber a shade greyer, the grain darker.
    oak: mat.wood({ base: mixHex(p.wood, tokens['out.rock'], 0.18), grain: p.woodGrain, seed: 'boathouse:oak', repeat: [2, 1] }),
    pine: mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'boathouse:pine', repeat: [2, 1] }),
    brass: mat.brass(),
    granite: mat.plaster(mixHex(tokens['out.rock'], tokens['out.foam'], 0.35)),
    rope: ropeMaterial(p),
    cable: cableMaterial(p),
    hidden: new THREE.MeshBasicMaterial({ color: p.ink, visible: false }),
  }
}

// ───────────────────────────── Rock walls ─────────────────────────────

interface WallSpec {
  width: number
  height: number
  seed: string
  /** A rectangular opening (wall-local u from the centre, v from the wall's foot), filled by an arch surround. */
  hole?: { u0: number; u1: number; v1: number }
  /** Spans of u (0..1 across the texture) that get the scuff band beside a door. */
  scuffs: [number, number][]
  /** The back wall carries the child's lettering over the line. */
  lettering?: boolean
}

/** One wobbly child's capital: each letter a little rotated, a little off the line, a little larger or smaller. */
function childLetters(c: CanvasRenderingContext2D, rnd: () => number, text: string, cx: number, baseY: number, size: number, color: string): void {
  c.font = `600 ${size}px ${FONT_SANS}`
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
  const gap = size * 0.16
  const widths = [...text].map((ch) => (ch === ' ' ? size * 0.42 : c.measureText(ch).width))
  const total = widths.reduce((a, b) => a + b + gap, -gap)
  let x = cx - total / 2
  ;[...text].forEach((ch, i) => {
    if (ch !== ' ') {
      c.save()
      c.translate(x + widths[i] / 2, baseY + (rnd() - 0.5) * size * 0.16 - i * size * 0.004)
      c.rotate((rnd() - 0.5) * 0.16)
      const k = 0.92 + rnd() * 0.18
      c.scale(k, k)
      c.fillStyle = color
      c.fillText(ch, -widths[i] / 2, 0)
      // A second, thinner pass a hair off: paint that went on twice.
      c.globalAlpha = 0.35
      c.fillText(ch, -widths[i] / 2 + 1.2, -0.8)
      c.globalAlpha = 1
      c.restore()
    }
    x += widths[i] + gap
  })
}

/**
 * Granite cut flat: the rock tone in painted facets, chisel marks and strata. Below the high-water line
 * the rock is bare and darker with weed and barnacle; above it a mustard distemper wash, brushed, with a
 * salt tidemark along its foot. Then the child's raspberry line at 1.4 m (and her lettering on the back
 * wall), then the wear pass: corner grime, the floor line, the scuff band beside the passage.
 */
function rockTexture(k: Kit, spec: WallSpec): THREE.CanvasTexture {
  const W = 1024, H = Math.round((1024 * spec.height) / spec.width)
  const rnd = seeded(`boathouse:rock:${spec.seed}`)
  const pxPerM = W / spec.width
  const rowOf = (y: number): number => H * (1 - (y - WALL_Y0) / spec.height)
  const p = k.p
  return canvasTexture(W, H, (c) => {
    c.fillStyle = k.rock
    c.fillRect(0, 0, W, H)
    // Facets: flat planes of slightly different value, the look of rock split along its grain.
    for (let i = 0; i < 640; i++) {
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
    // Chisel marks where the rock was dressed back.
    brush(c, rnd, { x: 0, y: 0, w: W, h: H, count: 2600, color: () => (rnd() < 0.5 ? rgba(p.ink, 0.07) : rgba(p.paper, 0.05)), len: [8, 30], width: [1, 2], angle: -0.75, wobble: 0.3 })
    // Strata: long jagged lines, a dark seam with a pale lip under it.
    for (let i = 0; i < 7; i++) {
      const y = (0.06 + rnd() * 0.9) * H
      const slope = (rnd() - 0.5) * 0.08
      c.lineWidth = 1.5
      for (const [dy, col] of [[0, rgba(p.ink, 0.22)], [2, rgba(p.paper, 0.1)]] as const) {
        c.strokeStyle = col
        c.beginPath()
        let yy = y + dy
        c.moveTo(0, yy)
        for (let x = 0; x <= W; x += 24) {
          yy += slope * 24 + (rnd() - 0.5) * 5
          c.lineTo(x, yy)
        }
        c.stroke()
      }
    }

    const yTide = rowOf(TIDE_Y)
    // Above the line: the mustard distemper, chalky, thin enough that the facets show, brushed upright.
    c.fillStyle = rgba(p.wall, 0.68)
    c.fillRect(0, 0, W, yTide)
    brush(c, rnd, { x: 0, y: 0, w: W, h: yTide, count: 2400, color: () => scaled(p.wall, rnd() < 0.5 ? 0.86 : 1.1, 0.06), len: [24, 48], width: [2, 3], angle: Math.PI / 2, wobble: 0.12 })
    // Where the wash ran and where it went on thin: long faint streaks down the wall.
    // Flakes where the distemper has lifted off the damp rock, grey showing through.
    for (let i = 0; i < 70; i++) {
      // Mostly just above the line and toward the corners, where the damp comes through.
      const x = (rnd() < 0.5 ? rnd() * 0.18 + (rnd() < 0.5 ? 0 : 0.82) : rnd()) * W
      const y = yTide - Math.pow(rnd(), 1.6) * yTide * 0.9, sz = 4 + rnd() * 16
      c.fillStyle = scaled(k.rock, 1.05 + rnd() * 0.15, 0.16 + rnd() * 0.18)
      c.beginPath()
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + rnd() * 0.6, rr = sz * (0.4 + rnd() * 0.6)
        if (j === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7)
        else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7)
      }
      c.closePath()
      c.fill()
      c.strokeStyle = rgba(p.paper, 0.18)
      c.lineWidth = 1
      c.stroke()
    }
    brush(c, rnd, { x: 0, y: 0, w: W, h: yTide * 0.95, count: 160, color: () => (rnd() < 0.6 ? rgba(k.rock, 0.1) : rgba(p.paper, 0.06)), len: [60, 160], width: [4, 10], angle: Math.PI / 2, wobble: 0.04 })
    // Below the line: bare rock, darker for the water it has held, weed toward the foot, barnacles near the line.
    const g = c.createLinearGradient(0, yTide, 0, H)
    g.addColorStop(0, rgba(p.ink, 0.12))
    g.addColorStop(1, rgba(p.ink, 0.34))
    c.fillStyle = g
    c.fillRect(0, yTide, W, H - yTide)
    const weed = [tokens['out.pine'], tokens['hs.olive'], tokens['out.turf']]
    for (let i = 0; i < 520; i++) {
      const x = rnd() * W
      const y = yTide + Math.pow(rnd(), 0.6) * (H - yTide)
      c.fillStyle = rgba(weed[Math.floor(rnd() * weed.length)], 0.1 + rnd() * 0.16)
      c.beginPath(); c.ellipse(x, y, 4 + rnd() * 18, 2 + rnd() * 7, 0, 0, Math.PI * 2); c.fill()
    }
    for (let i = 0; i < 520; i++) {
      const x = rnd() * W, y = yTide + 6 + Math.pow(rnd(), 1.8) * pxPerM * 0.5
      c.fillStyle = rgba(tokens['out.foam'], 0.1 + rnd() * 0.12)
      c.beginPath(); c.arc(x, y, 0.6 + rnd() * 1.1, 0, Math.PI * 2); c.fill()
    }
    // The salt tidemark: a pale, ragged band along the foot of the distemper.
    for (let x = 0; x < W; x += 3) {
      const hgt = pxPerM * (0.03 + rnd() * 0.05)
      c.fillStyle = rgba(tokens['out.foam'], 0.12 + rnd() * 0.08)
      c.fillRect(x, yTide - hgt, 3, hgt)
    }

    // The child's line: raspberry, a loaded brush, wobbling, going over itself, with the odd drip.
    const line: [number, number][] = []
    const ph = [rnd() * 6, rnd() * 6]
    for (let x = -8; x <= W + 8; x += 6) {
      const m = x / pxPerM
      const wob = 0.018 * Math.sin(m * 2.1 + ph[0]) + 0.009 * Math.sin(m * 5.3 + ph[1]) + (rnd() - 0.5) * 0.006
      line.push([x, yTide - wob * pxPerM])
    }
    c.lineCap = 'round'
    c.lineJoin = 'round'
    for (const [wd, a] of [[0.034, 0.9], [0.022, 0.55], [0.012, 0.35]] as const) {
      c.strokeStyle = rgba(p.accent, a)
      c.lineWidth = wd * pxPerM
      c.beginPath()
      line.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y + (rnd() - 0.5) * 1.5) : c.lineTo(x, y + (rnd() - 0.5) * 1.5)))
      c.stroke()
    }
    for (let i = 0; i < 9; i++) {
      const [x, y] = line[Math.floor(rnd() * line.length)]
      const len = pxPerM * (0.02 + rnd() * 0.06)
      c.strokeStyle = rgba(p.accent, 0.75)
      c.lineWidth = 2 + rnd() * 1.5
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 2, y + len); c.stroke()
      c.fillStyle = rgba(p.accent, 0.8)
      c.beginPath(); c.arc(x, y + len, 2.2, 0, Math.PI * 2); c.fill()
    }
    if (spec.lettering) {
      const size = 0.13 * pxPerM
      childLetters(c, rnd, dressing.tideLine.label, W / 2, yTide - 0.07 * pxPerM, size, rgba(p.accent, 0.92))
      childLetters(c, rnd, 'I.H.', W / 2 + 1.12 * pxPerM, yTide - 0.07 * pxPerM, size * 0.55, rgba(p.accent, 0.85))
    }
    // Speckle.
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = rnd() < 0.5 ? rgba(p.ink, 0.12) : rgba(p.paper, 0.07)
      c.fillRect(rnd() * W, rnd() * H, 1, 1)
    }

    // The wear pass.
    const h = spec.height
    const hardV = (HARD - WALL_Y0) / h
    multiplyPixels(c, W, H, (u, v) => {
      const r = Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2
      let f = 1 - 0.1 * smoothstep(0.75, 1, r)
      f *= 1 - 0.12 * (1 - smoothstep(hardV, hardV + 0.06, v))
      const y = WALL_Y0 + v * h - HARD
      if (y > 0.33 && y < 0.37 && spec.scuffs.some(([a, b]) => u > a && u < b)) f *= 0.96
      return f
    })
  })
}

/**
 * A wall of flat rock facets: a grid in wall-local space (u across, v up from the wall's foot, facing +z),
 * each vertex pushed into the room by a seeded amount and each quad split on a random diagonal, flat-shaded.
 * A hole leaves exactly its rectangle out, for the arch surround to fill.
 */
function facetWall(k: Kit, spec: WallSpec): THREE.Mesh {
  const { width: w, height: h, hole } = spec
  const rnd = seeded(`boathouse:facets:${spec.seed}`)
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
  const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3, rnd() * 6.3]
  const swell = (u: number, v: number): number =>
    0.5 + 0.3 * Math.sin(u * 1.7 + ph[0]) * Math.sin(v * 2.1 + ph[1]) + 0.2 * Math.sin(u * 4.3 + v * 2.9 + ph[2]) * Math.cos(v * 3.7 - u * 1.3 + ph[3])
  const disp = vs.map((v) => us.map((u) => 0.01 + 0.042 * swell(u, v) + rnd() * 0.018))
  const jit = vs.map((_, j) => us.map((_, i) => (i > 0 && i < us.length - 1 && j > 0 && j < vs.length - 1 ? [(rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.14] : [0, 0])))
  if (hole) {
    us.forEach((u, i) => vs.forEach((v, j) => {
      const onEdge = u >= hole.u0 - 1e-6 && u <= hole.u1 + 1e-6 && v <= hole.v1 + 1e-6
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

// ───────────────────────────── Stone: the hard, the setts, the ashlar ─────────────────────────────

/** Flagstones in courses, grouted dark, darker and greener toward the dock edge (spray), worn pale where feet go. */
function flagTexture(k: Kit, w: number, d: number, seed: string, worn: (u: number, v: number) => number): THREE.CanvasTexture {
  const rnd = seeded(`boathouse:flags:${seed}`)
  const p = k.p
  return canvasTexture(512, 1024, (c, W, H) => {
    const sx = W / w, sy = H / d
    c.fillStyle = mixHex(p.ink, k.rock, 0.45)
    c.fillRect(0, 0, W, H)
    const grout = 0.014
    let z = 0
    while (z < d) {
      const rowD = Math.min(d - z, 0.42 + rnd() * 0.24)
      let x = -rnd() * 0.5
      while (x < w) {
        const fw = 0.5 + rnd() * 0.5
        const tone = mixHex(k.rock, tokens['out.path'], 0.2 + rnd() * 0.22)
        const kv = 0.94 + rnd() * 0.16
        const x0 = (x + grout) * sx, y0 = (z + grout) * sy, x1 = (x + fw - grout) * sx, y1 = (z + rowD - grout) * sy
        c.fillStyle = scaled(tone, kv)
        c.fillRect(x0, y0, x1 - x0, y1 - y0)
        for (let i = 0; i < 30; i++) {
          c.fillStyle = scaled(tone, kv * (0.9 + rnd() * 0.18), 0.22)
          c.beginPath(); c.arc(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 3 + rnd() * 12, 0, Math.PI * 2); c.fill()
        }
        c.fillStyle = rgba(p.paper, 0.1)
        c.fillRect(x0, y0, x1 - x0, 2)
        c.fillStyle = rgba(p.ink, 0.18)
        c.fillRect(x0, y1 - 2, x1 - x0, 2)
        x += fw
      }
      z += rowD
    }
    brush(c, rnd, { x: 0, y: 0, w: W, h: H, count: 1400, color: () => (rnd() < 0.5 ? rgba(p.ink, 0.05) : rgba(p.paper, 0.04)), len: [24, 48], width: [2, 3], angle: Math.PI / 2, wobble: 0.1 })
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = rnd() < 0.5 ? rgba(p.ink, 0.1) : rgba(p.paper, 0.07)
      c.fillRect(rnd() * W, rnd() * H, 1, 1)
    }
    multiplyPixels(c, W, H, (u, v) => {
      const back = 1 - v
      const r = Math.hypot(u * 2 - 1, back * 2 - 1) / Math.SQRT2
      return (1 - 0.1 * smoothstep(0.75, 1, r)) * worn(u, v)
    })
  })
}

/** Granite setts laid in courses across the slip, wet and darker toward the water, weed along the waterline. */
function settTexture(k: Kit, w: number, d: number): THREE.CanvasTexture {
  const rnd = seeded('boathouse:setts')
  const p = k.p
  return canvasTexture(512, 1024, (c, W, H) => {
    const sx = W / w, sy = H / d
    c.fillStyle = mixHex(p.ink, k.rock, 0.35)
    c.fillRect(0, 0, W, H)
    const course = 0.11, gap = 0.012
    let row = 0
    for (let z = 0; z < d; z += course) {
      let x = row % 2 ? -0.1 : -0.02
      while (x < w) {
        const sw = 0.18 + rnd() * 0.06
        const tone = mixHex(k.rock, tokens['out.foam'], 0.08 + rnd() * 0.16)
        c.fillStyle = scaled(tone, 0.9 + rnd() * 0.16)
        const x0 = (x + gap) * sx, y0 = (z + gap) * sy
        c.beginPath()
        c.roundRect(x0, y0, (sw - gap * 2) * sx, (course - gap * 2) * sy, 3)
        c.fill()
        c.fillStyle = rgba(p.paper, 0.1)
        c.fillRect(x0 + 2, y0 + 1, (sw - gap * 2) * sx - 4, 2)
        x += sw
      }
      row++
    }
    for (let i = 0; i < 8000; i++) {
      c.fillStyle = rnd() < 0.5 ? rgba(p.ink, 0.12) : rgba(p.paper, 0.06)
      c.fillRect(rnd() * W, rnd() * H, 1, 1)
    }
    // Toward the water (the bottom of the canvas is the seaward end): wet, then weed.
    const wet = c.createLinearGradient(0, H * 0.35, 0, H)
    wet.addColorStop(0, rgba(p.ink, 0))
    wet.addColorStop(1, rgba(p.ink, 0.4))
    c.fillStyle = wet
    c.fillRect(0, 0, W, H)
    const weed = [tokens['out.pine'], tokens['hs.olive']]
    for (let i = 0; i < 340; i++) {
      const y = H * (0.42 + Math.pow(rnd(), 0.7) * 0.58)
      c.fillStyle = rgba(weed[Math.floor(rnd() * weed.length)], 0.12 + rnd() * 0.2)
      c.beginPath(); c.ellipse(rnd() * W, y, 4 + rnd() * 14, 2 + rnd() * 5, 0, 0, Math.PI * 2); c.fill()
    }
  })
}

/** Dressed granite blocks in courses, for the dock walls and the quay ends; weed below the water's line. */
function ashlarTexture(k: Kit, w: number, h: number, seed: string, waterV: number): THREE.CanvasTexture {
  const rnd = seeded(`boathouse:ashlar:${seed}`)
  const p = k.p
  const W = 1024, H = Math.max(64, Math.round((1024 * h) / w))
  return canvasTexture(W, H, (c) => {
    const sx = W / w, sy = H / h
    c.fillStyle = mixHex(p.ink, k.rock, 0.4)
    c.fillRect(0, 0, W, H)
    const course = 0.2
    let row = 0
    for (let y = 0; y < h; y += course) {
      let x = row % 2 ? -0.3 : 0
      while (x < w) {
        const bw = 0.5 + rnd() * 0.3
        c.fillStyle = scaled(mixHex(k.rock, tokens['out.foam'], 0.2 + rnd() * 0.15), 0.9 + rnd() * 0.14)
        c.fillRect((x + 0.008) * sx, H - (y + course - 0.008) * sy, (bw - 0.016) * sx, (course - 0.016) * sy)
        x += bw
      }
      row++
    }
    brush(c, rnd, { x: 0, y: 0, w: W, h: H, count: 1600, color: () => (rnd() < 0.5 ? rgba(p.ink, 0.07) : rgba(p.paper, 0.05)), len: [8, 22], width: [1, 2], angle: -0.7, wobble: 0.3 })
    const yw = H * (1 - waterV)
    const g = c.createLinearGradient(0, yw - 30, 0, H)
    g.addColorStop(0, rgba(p.ink, 0))
    g.addColorStop(0.2, rgba(p.ink, 0.3))
    g.addColorStop(1, rgba(p.ink, 0.45))
    c.fillStyle = g
    c.fillRect(0, yw - 30, W, H - yw + 30)
    for (let i = 0; i < 260; i++) {
      c.fillStyle = rgba(rnd() < 0.5 ? tokens['out.pine'] : tokens['hs.olive'], 0.2 + rnd() * 0.2)
      c.beginPath(); c.ellipse(rnd() * W, yw - 14 + rnd() * 40, 3 + rnd() * 12, 2 + rnd() * 5, 0, 0, Math.PI * 2); c.fill()
    }
  })
}

/** The slate sea of §3.3 in the dock: broad horizontal ticks, the painted highlights in foam, tileable. */
function waterMaterial(): THREE.MeshStandardMaterial {
  const rnd = seeded('boathouse:water')
  const sea = tokens['out.sea'], foam = tokens['out.foam']
  const map = canvasTexture(512, 512, (c, W, H) => {
    c.fillStyle = shade(sea, 0.86)
    c.fillRect(0, 0, W, H)
    brush(c, rnd, { x: -40, y: 0, w: W, h: H, count: 700, color: () => rgba(tokens['out.ink'], 0.08), len: [30, 60], width: [3, 4], angle: 0, wobble: 0.06 })
    brush(c, rnd, { x: -40, y: 0, w: W, h: H, count: 600, color: () => rgba(sea, 0.5), len: [30, 60], width: [3, 5], angle: 0, wobble: 0.06 })
    brush(c, rnd, { x: -40, y: 0, w: W, h: H, count: 260, color: () => rgba(tokens['grid.channel'], 0.14), len: [50, 80], width: [4, 5], angle: 0, wobble: 0.05 })
    // The painted highlights: thin bowed strokes, a few long, most short.
    c.lineCap = 'round'
    for (let i = 0; i < 70; i++) {
      const x = 24 + rnd() * (W - 140), y = 10 + rnd() * (H - 20)
      const l = 26 + rnd() * 90
      c.strokeStyle = rgba(foam, 0.7 + rnd() * 0.3)
      c.lineWidth = 1.6 + rnd() * 1.4
      c.beginPath()
      c.moveTo(x, y)
      c.quadraticCurveTo(x + l / 2, y - 2 - rnd() * 3, x + l, y + (rnd() - 0.5) * 2)
      c.stroke()
    }
    for (let i = 0; i < 90; i++) {
      const x = 16 + rnd() * (W - 60), y = rnd() * H
      c.strokeStyle = rgba(foam, 0.3)
      c.lineWidth = 1
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10 + rnd() * 30, y + (rnd() - 0.5) * 1.5); c.stroke()
    }
  }, true)
  map.repeat.set(3, 2.6)
  return new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.05 })
}

// ───────────────────────────── The shell ─────────────────────────────

/** Rock walls, the Galley's joists and boards overhead, the two quays, the dock walls, the slipway and the water. */
function shell(k: Kit): { group: THREE.Group; water: THREE.MeshStandardMaterial } {
  const { w, h, d } = ROOM
  const p = k.p
  const g = new THREE.Group()
  g.name = 'shell'
  const wallH = h - WALL_Y0

  // Walls: the back with the child's lettering; the left pierced for the passage.
  const back = facetWall(k, { width: w + 0.2, height: wallH, seed: 'back', scuffs: [], lettering: true })
  back.position.set(0, WALL_Y0, -d / 2)
  g.add(back)
  const hw = ARCH.w / 2 + ARCH.surround
  const sideW = d + 0.2
  const leftU = -ARCH.z
  const scuff: [number, number] = [(leftU - hw - 0.6 + sideW / 2) / sideW, (leftU + hw + 0.6 + sideW / 2) / sideW]
  const left = facetWall(k, { width: sideW, height: wallH, seed: 'left', hole: { u0: leftU - hw, u1: leftU + hw, v1: HARD - WALL_Y0 + ARCH.top }, scuffs: [scuff] })
  left.rotation.y = Math.PI / 2
  left.position.set(-w / 2, WALL_Y0, 0)
  g.add(left)
  const right = facetWall(k, { width: sideW, height: wallH, seed: 'right', hole: { u0: ARCH.z - hw, u1: ARCH.z + hw, v1: HARD - WALL_Y0 + ARCH.top }, scuffs: [] })
  right.rotation.y = -Math.PI / 2
  right.position.set(w / 2, WALL_Y0, 0)
  g.add(right)

  // Overhead: the underside of the Galley's floor on three heavy joists.
  const boards = props.floor({ colors: p, width: w, depth: d, seed: 'boathouse:ceiling' })
  boards.rotation.x = Math.PI
  boards.position.y = h
  boards.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = true } })
  g.add(boards)
  const beams = new Merger()
  const joist = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'boathouse:joist', repeat: [4, 1] })
  for (const z of [-1.3, 0.7, 2.7]) beams.box(w, 0.24, 0.2, joist, 0, h - 0.12, z)
  for (const s of [-1, 1]) beams.box(0.16, 0.12, d, joist, s * (w / 2 - 0.08), h - 0.3, 0)
  beams.build(g, 'joists', false)

  // The quays: flagstones on either side of the dock, from the back wall to their ends.
  const qw = w / 2 - DOCK, qd = QUAY_END + d / 2
  for (const s of [-1, 1] as const) {
    // Feet go from the passage (left) and the ladder (right) to the slipway's head; a pale path each side.
    const worn = (u: number, v: number): number => {
      const uu = s < 0 ? 1 - u : u
      const path = Math.exp(-(((uu - 0.1) / 0.12) ** 2)) * smoothstep(0.1, 0.35, v) * (1 - smoothstep(0.7, 0.95, v))
      const edge = 1 - 0.1 * (1 - smoothstep(0, 0.08, uu))
      return (1 + 0.06 * path) * edge
    }
    const map = flagTexture(k, qw, qd, s < 0 ? 'left' : 'right', worn)
    const flags = new THREE.Mesh(new THREE.PlaneGeometry(qw, qd), new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.01, roughness: 0.86, metalness: 0 }))
    flags.name = 'flags'
    flags.rotation.x = -Math.PI / 2
    flags.position.set(s * (DOCK + qw / 2), HARD, -d / 2 + qd / 2)
    flags.receiveShadow = true
    g.add(flags)
  }

  // Dock walls (inner faces of the quays) and the quays' seaward ends, dressed granite with weed below the water.
  const faceH = HARD - WALL_Y0
  const dockMap = ashlarTexture(k, qd, faceH, 'dock', (WATER_Y - WALL_Y0) / faceH)
  const dockMat = new THREE.MeshStandardMaterial({ map: dockMap, bumpMap: bumpOf(dockMap), bumpScale: 0.01, roughness: 0.9, metalness: 0 })
  const faces = new Merger()
  for (const s of [-1, 1] as const) faces.add(new THREE.PlaneGeometry(qd, faceH), dockMat, s * DOCK, WALL_Y0 + faceH / 2, -d / 2 + qd / 2, new THREE.Euler(0, -s * Math.PI / 2, 0))
  const endMap = ashlarTexture(k, qw, faceH, 'end', (WATER_Y - WALL_Y0) / faceH)
  const endMat = new THREE.MeshStandardMaterial({ map: endMap, bumpMap: bumpOf(endMap), bumpScale: 0.01, roughness: 0.9, metalness: 0 })
  for (const s of [-1, 1] as const) faces.add(new THREE.PlaneGeometry(qw, faceH), endMat, s * (DOCK + qw / 2), WALL_Y0 + faceH / 2, QUAY_END)
  faces.build(g, 'quay:faces', false)
  // Coping: a lipped granite kerb along the dock edges and the quay ends.
  const cope = new Merger()
  const cw = 0.26, ch = 0.07
  for (const s of [-1, 1]) {
    cope.box(cw, ch, qd + 0.02, k.granite, s * (DOCK + cw / 2 - 0.03), HARD + ch / 2 - 0.02, -d / 2 + qd / 2 + 0.01)
    cope.box(qw + 0.02, ch, cw, k.granite, s * (DOCK + qw / 2), HARD + ch / 2 - 0.02, QUAY_END - cw / 2 + 0.03)
    // Iron mooring rings let into the coping, two each side, facing the dock.
    for (const z of [-2.2, -0.2]) cope.torus(0.05, 0.008, Math.PI * 2, k.iron, s * (DOCK - 0.035), HARD - 0.08, z, new THREE.Euler(0, Math.PI / 2, 0), 20, 6)
  }
  cope.build(g, 'coping')

  // The slipway: granite setts on the slope, three oak ways, a stop-beam and a ring bolt at its head.
  const slipLen = QUAY_END + 1.4 + d / 2
  const slipAngle = Math.atan(SLOPE)
  const settMap = settTexture(k, DOCK * 2, slipLen / Math.cos(slipAngle))
  const slipGeo = new THREE.PlaneGeometry(DOCK * 2, slipLen / Math.cos(slipAngle))
  const slip = new THREE.Mesh(slipGeo, new THREE.MeshStandardMaterial({ map: settMap, bumpMap: bumpOf(settMap), bumpScale: 0.014, roughness: 0.78, metalness: 0 }))
  slip.name = 'slipway'
  slip.rotation.x = -Math.PI / 2 + slipAngle
  const zMid = -d / 2 + slipLen / 2
  slip.position.set(0, slipY(zMid), zMid)
  slip.receiveShadow = true
  g.add(slip)
  const ways = new Merger()
  const tilt = new THREE.Euler(slipAngle, 0, 0)
  for (const [x, wd, ht] of [[-0.6, 0.14, 0.07], [0.6, 0.14, 0.07], [0, 0.1, 0.045]] as const) {
    ways.box(wd, ht, slipLen / Math.cos(slipAngle), k.oak, x, slipY(zMid) + ht / 2, zMid, tilt)
  }
  ways.box(DOCK * 2 - 0.1, 0.16, 0.18, k.oak, 0, HARD + 0.08, -d / 2 + 0.1)
  ways.build(g, 'ways')

  // The water: one plane across the dock and the front third; the quays and the slip stand out of it.
  const water = waterMaterial()
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, 4.6), water)
  sea.name = 'water'
  sea.rotation.x = -Math.PI / 2
  sea.position.set(0, WATER_Y, -1.2 + 2.3)
  sea.receiveShadow = true
  g.add(sea)
  return { group: g, water }
}

// ───────────────────────────── The passage to the Workshop ─────────────────────────────

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
function glowFlat(k: Kit, w: number, h: number, dir: 'up' | 'left'): THREE.Mesh {
  const map = canvasTexture(128, 256, (c, W, H) => {
    const grad = dir === 'up' ? c.createLinearGradient(0, H, 0, 0) : c.createLinearGradient(W, 0, 0, 0)
    grad.addColorStop(0, k.p.ink)
    grad.addColorStop(0.55, mixHex(k.p.ink, k.p.light, 0.25))
    grad.addColorStop(1, mixHex(k.p.ink, k.p.light, 0.7))
    c.fillStyle = grad
    c.fillRect(0, 0, W, H)
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }))
  mesh.name = 'glow'
  return mesh
}

/**
 * The rock passage in the left wall, built in wall-local space (the wall face at z = 0, the room toward
 * +z, the hard at y = 0): a cream-limed surround, a vault into the rock that turns at its end with the
 * Workshop's lamplight coming round the corner, the destination on a paper plate above.
 */
function passage(hs: HotspotDef, k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = `arch:${hs.id}`
  const surround = new THREE.Mesh(new THREE.ExtrudeGeometry(surroundShape(), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 20 }), mat.plaster(p.trim))
  surround.position.z = -0.03
  surround.name = 'surround'
  surround.receiveShadow = true
  g.add(surround)
  const rockInside = new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, (c, W, H) => {
    const rnd = seeded('boathouse:inside')
    c.fillStyle = scaled(k.rock, 0.52)
    c.fillRect(0, 0, W, H)
    for (let i = 0; i < 260; i++) {
      c.fillStyle = scaled(k.rock, 0.42 + rnd() * 0.24, 0.3)
      c.beginPath(); c.arc(rnd() * W, rnd() * H, 4 + rnd() * 16, 0, Math.PI * 2); c.fill()
    }
  }, true), roughness: 0.95, metalness: 0, side: THREE.BackSide })
  const depth = 2.4
  const vaultGeo = new THREE.ExtrudeGeometry(archShape(), { depth, bevelEnabled: false, curveSegments: 20 })
  const uv = vaultGeo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.8, uv.getY(i) * 0.8)
  const vault = new THREE.Mesh(vaultGeo, [k.hidden, rockInside])
  vault.position.z = -depth
  vault.receiveShadow = true
  g.add(vault)
  const end = glowFlat(k, ARCH.w, ARCH.spring + ARCH.w / 2, 'left')
  end.position.set(0, (ARCH.spring + ARCH.w / 2) / 2, -depth + 0.01)
  g.add(end)
  // A step down from the hard onto the passage floor, worn.
  const m = new Merger()
  m.box(ARCH.w, 0.05, 0.3, k.granite, 0, -0.025, 0.1)
  m.build(g, 'threshold', false)

  const plate = hsPlate(hs.label, p, 0.74, 0.15)
  plate.name = `plate:${hs.label}`
  plate.position.set(0, ARCH.top + 0.2, 0.11)
  g.add(plate)
  return g
}

/**
 * The passage's mirror in the right wall: the same limed surround round a shallow recess in the rock,
 * the rope store, three coils hung on oak pegs. Wall-local, like `passage`.
 */
function ropeStore(k: Kit): THREE.Group {
  const g = new THREE.Group()
  g.name = 'ropestore'
  const surround = new THREE.Mesh(new THREE.ExtrudeGeometry(surroundShape(), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 20 }), mat.plaster(k.p.trim))
  surround.position.z = -0.03
  surround.receiveShadow = true
  g.add(surround)
  const back = new THREE.MeshStandardMaterial({ color: mixHex(k.rock, k.p.wall, 0.35), roughness: 0.95, metalness: 0, side: THREE.BackSide })
  const depth = 0.22
  const vault = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(), { depth, bevelEnabled: false, curveSegments: 20 }), [back, back])
  vault.position.z = -depth
  vault.receiveShadow = true
  g.add(vault)
  const m = new Merger()
  const coils: [number, number, number][] = [[-0.25, 2.0, 0.2], [0.25, 2.0, 0.2], [-0.25, 1.35, 0.22], [0.25, 1.35, 0.22]]
  for (const [x, y] of coils) m.rodZ(0.022, 0.3, 10, k.oak, x, y + 0.02, -0.1)
  m.build(g, 'ropestore:pegs')
  const rope = new Merger()
  coils.forEach(([x, y, r], i) => {
    rope.outer = new THREE.Matrix4().makeTranslation(x, y - 0.02, -0.08)
    ropeCoil(k, r, 7, seeded(`boathouse:store:${i}`), true, rope)
  })
  rope.outer = undefined
  rope.build(g, 'ropestore:coils')
  return g
}

// ───────────────────────────── The ladder up to the Galley ─────────────────────────────

/** The ladder from the hard to the Galley's hatch in the back right, the hatch's light, its plate on the back wall. */
function ladderUp(hs: HotspotDef, k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = `ladder:${hs.id}`
  const x = 2.95, hatchZ = -2.55
  // Foot 0.62 m out from the wall, the top in the hatch: rails 4.0 m long.
  const rise = ROOM.h - HARD + 0.1, run = 0.62
  const lean = Math.atan2(run, rise)
  // The ladder: two pine rails, round rungs every 0.3 m, iron shoes, leaning back into the hatch.
  const m = new Merger()
  const len = Math.hypot(rise, run), lw = 0.5
  m.outer = new THREE.Matrix4().makeTranslation(x, HARD, -ROOM.d / 2 + 0.1 + run).multiply(new THREE.Matrix4().makeRotationX(-lean))
  for (const s of [-1, 1]) {
    m.box(0.045, len, 0.03, k.pine, s * (lw / 2 - 0.02), len / 2, 0)
    m.box(0.055, 0.035, 0.045, k.iron, s * (lw / 2 - 0.02), 0.018, 0)
  }
  for (let i = 1; i * 0.3 < len - 0.1; i++) m.rodX(0.015, lw - 0.04, 10, k.pine, 0, i * 0.3, 0)
  m.outer = undefined
  // The hatch: a cased opening in the boards, the Galley's light falling through it.
  const hw = 0.72, hd = 0.72, t = 0.07
  for (const s of [-1, 1]) {
    m.box(t, 0.1, hd + t * 2, k.pine, x + s * (hw / 2 + t / 2), ROOM.h - 0.05, hatchZ)
    m.box(hw, 0.1, t, k.pine, x, ROOM.h - 0.05, hatchZ + s * (hd / 2 + t / 2))
  }
  m.build(g, 'ladder')
  const glow = glowFlat(k, hw, hd, 'up')
  glow.rotation.x = Math.PI / 2
  glow.position.set(x, ROOM.h - 0.012, hatchZ)
  g.add(glow)
  const plate = hsPlate(hs.label, p, 0.64, 0.13)
  plate.name = `plate:${hs.label}`
  plate.position.set(x - 0.72, 3.5, -ROOM.d / 2 + 0.1)
  g.add(plate)
  return g
}

// ───────────────────────────── The slipway doors ─────────────────────────────

/**
 * The sea doors at the quay ends: two oak posts on the coping corners at the dock's mouth, a planked leaf
 * on each, laid open outward (toward the camera) against nothing. A small board on each post: the
 * destination on the right, the condition on the left.
 */
function slipwayDoors(hs: HotspotDef, k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = `doors:${hs.id}`
  const postH = 1.02, post = 0.2
  const leafW = DOCK - 0.08, leafH = 0.84, leafY0 = -0.05, t = 0.05
  // Laid open outward, square to the quay ends, along the dock's sides.
  const open = THREE.MathUtils.degToRad(95)
  const m = new Merger()
  const plank = mat.wood({ base: mixHex(p.wood, tokens['out.rock'], 0.3), grain: p.woodGrain, seed: 'boathouse:doors', repeat: [1, 2] })
  for (const s of [-1, 1] as const) {
    const px = s * (DOCK + post / 2 - 0.04)
    m.box(post, postH - WALL_Y0, post, k.oak, px, (postH + WALL_Y0) / 2, QUAY_END - post / 2)
    m.box(post + 0.04, 0.04, post + 0.04, k.iron, px, postH + 0.02, QUAY_END - post / 2)
    // The leaf, built closed across the mouth from the hinge toward the centre, then swung outward about the hinge.
    const hinge = new THREE.Vector3(s * DOCK, 0, QUAY_END + 0.02)
    const rot = new THREE.Matrix4().makeRotationY(s * open)
    const place = (geo: THREE.BufferGeometry, material: THREE.Material, lx: number, ly: number, lz: number, r?: THREE.Euler): void => {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromEuler(r ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1))
      const world = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(rot).multiply(local)
      m.addMatrix(geo, material, world)
    }
    const planks = 6
    const pw = leafW / planks
    for (let i = 0; i < planks; i++) {
      const lx = -s * (pw / 2 + i * pw)
      place(new THREE.BoxGeometry(pw - 0.008, leafH, t), plank, lx, leafY0 + leafH / 2, 0)
    }
    // Ledges and the brace on the inner face (toward the dock when closed: +z becomes the room's side when open).
    const ledgeY = [leafY0 + 0.2, leafY0 + leafH - 0.18]
    for (const ly of ledgeY) place(new THREE.BoxGeometry(leafW - 0.06, 0.13, 0.035), plank, -s * leafW / 2, ly, -t / 2 - 0.018)
    const bw = leafW - 0.26, bh = ledgeY[1] - ledgeY[0] - 0.1
    place(new THREE.BoxGeometry(0.11, Math.hypot(bw, bh), 0.03), plank, -s * leafW / 2, (ledgeY[0] + ledgeY[1]) / 2, -t / 2 - 0.018, new THREE.Euler(0, 0, s * Math.atan2(bw, bh)))
    // Strap hinges on the sea face, bolted through; their knuckles on the post; a ring pull each side.
    for (const ly of ledgeY) {
      place(new THREE.BoxGeometry(leafW * 0.62, 0.05, 0.008), k.iron, -s * leafW * 0.31, ly, t / 2 + 0.004)
      place(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), k.iron, 0, ly, 0)
      for (const f of [0.12, 0.3, 0.5]) place(new THREE.CylinderGeometry(0.011, 0.011, t + 0.05, 8), k.iron, -s * leafW * f, ly, 0, ROT_X90)
    }
    for (const dz of [1, -1]) place(new THREE.TorusGeometry(0.04, 0.007, 6, 20), k.iron, -s * (leafW - 0.16), leafY0 + leafH * 0.55, dz * (t / 2 + 0.03))
  }
  m.build(g, 'doors')
  for (const s of [-1, 1] as const) {
    const text = s > 0 ? hs.label : 'LOW WATER ONLY'
    const board = hsPlate(text, p, 0.38, 0.084)
    board.position.set(s * (DOCK + post / 2 - 0.04), postH - 0.13, QUAY_END + 0.004)
    g.add(board)
  }
  return g
}

// ───────────────────────────── The cradle ─────────────────────────────

/**
 * The launch's cradle, oak, 1931, empty: two runners on the outer ways, four V bearers with their keel
 * blocks and leather-padded arms, two stringers tying the arms, the brass plate on a board at the front
 * bearer. Built in slope-local space (y normal to the slip, z down the slip), origin on the ways at its middle.
 */
function cradle(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'cradle'
  const L = CRADLE.length
  const m = new Merger()
  const leather = mat.felt(shade(p.ink, 1.3))
  const bearers = [-1.25, -0.42, 0.42, 1.25]
  for (const s of [-1, 1]) m.box(0.14, 0.12, L, k.oak, s * 0.6, 0.06, 0)
  for (const bz of bearers) {
    m.box(1.56, 0.14, 0.16, k.oak, 0, 0.19, bz)
    m.box(0.24, 0.2, 0.3, k.oak, 0, 0.36, bz)
    m.box(0.26, 0.03, 0.32, leather, 0, 0.475, bz)
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(s * 0.34, 0.24, bz), b = new THREE.Vector3(s * 0.74, 0.92, bz)
      m.beam(a, b, 0.12, 0.13, k.oak)
      // A knee under each arm, and the leather pad where the hull would bear.
      m.beam(new THREE.Vector3(s * 0.74, 0.24, bz), new THREE.Vector3(s * 0.62, 0.62, bz), 0.08, 0.1, k.oak)
      const dir = b.clone().sub(a).normalize()
      const pad = b.clone().sub(dir.clone().multiplyScalar(0.12)).add(new THREE.Vector3(-s * 0.055, 0.03, 0))
      m.add(new THREE.BoxGeometry(0.03, 0.2, 0.14), leather, pad.x, pad.y, pad.z, new THREE.Euler(0, 0, -s * Math.atan2(Math.abs(dir.x), dir.y)))
      // Iron bolts through each joint.
      m.rodZ(0.014, 0.18, 8, k.iron, s * 0.36, 0.24, bz)
    }
  }
  // Stringers along the arms, tying the four bearers into one frame.
  for (const s of [-1, 1]) m.box(0.07, 0.09, L - 0.3, k.oak, s * 0.58, 0.66, 0)
  m.build(g, 'cradle:oak')

  // The brass plate on an oak board fixed to the front of the front bearer, and the inventory tag under it.
  const front = bearers[bearers.length - 1]
  const board = new Merger()
  board.box(0.96, 0.3, 0.04, k.oak, 0, 0.43, front + 0.17)
  board.build(g, 'cradle:board')
  const lines = dressing.placard.split(/\s{2,}/)
  const plate = brassPlate(lines, p, 0.86, 0.24)
  plate.position.set(0, 0.43, front + 0.192)
  g.add(plate)
  const tag = hsPlate('HS-0801', p, 0.14, 0.035)
  tag.position.set(0.5, 0.19, front + 0.081)
  g.add(tag)
  g.userData.flaw = true
  return g
}

// ───────────────────────────── Tender No. 1 ─────────────────────────────

/** Half-breadth, keel and sheer heights of the tender at t (0 at the transom, 1 at the stem). */
function hullSection(t: number): { b: number; keel: number; sheer: number } {
  const bmax = 0.64
  const b = t < 0.4 ? bmax * (1 - 0.3 * ((0.4 - t) / 0.4) ** 2) : bmax * Math.pow(Math.max(0, 1 - ((t - 0.4) / 0.6) ** 2), 0.75)
  const keel = 0.2 * Math.max(0, (t - 0.55) / 0.45) ** 2
  const sheer = 0.5 + 0.16 * t ** 2.4 + 0.04 * (1 - t) ** 2
  return { b, keel, sheer }
}

/**
 * A clinker hull, bow toward −z and transom toward +z, keel at y = 0: six strakes, each lapped 8 mm over
 * the one below. Returns three outside geometries (the bottom strake, the topsides, the sheerstrake) for
 * their three paints and one whole geometry for the bare wood inside.
 */
function clinkerHull(L: number): { bottom: THREE.BufferGeometry; sides: THREE.BufferGeometry; sheer: THREE.BufferGeometry; inside: THREE.BufferGeometry } {
  const N = 30, K = 6, lap = 0.008
  const point = (t: number, s: number): { x: number; y: number; nx: number; ny: number } => {
    const { b, keel, sheer } = hullSection(t)
    const a = s * Math.PI / 2
    const x = b * Math.sin(a), y = keel + (sheer - keel) * (1 - Math.cos(a))
    const tx = b * Math.cos(a), ty = (sheer - keel) * Math.sin(a)
    const len = Math.hypot(tx, ty) || 1
    return { x, y, nx: ty / len, ny: -tx / len }
  }
  // Profile points per station: for each strake its lower edge (lapped out) and its upper edge.
  const profile: { s: number; out: boolean; strake: number }[] = []
  for (let k = 0; k < K; k++) {
    profile.push({ s: k / K, out: k > 0, strake: k })
    profile.push({ s: (k + 1) / K, out: false, strake: k })
  }
  const verts = (side: 1 | -1): THREE.Vector3[][] => {
    const rows: THREE.Vector3[][] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const z = L / 2 - t * L
      rows.push(profile.map(({ s, out }) => {
        const q = point(Math.min(t, 0.999), s)
        const o = out ? lap : 0
        return new THREE.Vector3(side * (q.x + q.nx * o), q.y + q.ny * o, z)
      }))
    }
    return rows
  }
  const build = (pick: (strake: number, j: number) => boolean): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = []
    for (const side of [1, -1] as const) {
      const rows = verts(side)
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < profile.length - 1; j++) {
          if (!pick(profile[j].strake, j)) continue
          const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1]
          const quad = side > 0 ? [a, b, d, b, c, d] : [a, d, b, b, d, c]
          const uvs = side > 0
            ? [[i, j], [i + 1, j], [i, j + 1], [i + 1, j], [i + 1, j + 1], [i, j + 1]]
            : [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]
          for (const v of quad) pos.push(v.x, v.y, v.z)
          for (const [u, v] of uvs) uv.push(u / N, v / profile.length)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    return geo
  }
  return {
    bottom: build((k) => k === 0),
    sides: build((k) => k > 0 && k < K - 1),
    sheer: build((k) => k === K - 1),
    inside: build(() => true),
  }
}

/** The tender's name as a signwriter paints it on a transom: letterspaced, ink, a hairline under it, the case kept. */
function nameTexture(text: string, p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(1024, 216, (c, W, H) => {
    c.clearRect(0, 0, W, H)
    c.font = `500 ${H * 0.5}px ${FONT_SANS}`
    c.fillStyle = p.ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const cc = c as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in cc) cc.letterSpacing = `${H * 0.09}px`
    c.fillText(text, W / 2 + H * 0.045, H * 0.44)
    c.fillRect(W * 0.2, H * 0.8, W * 0.6, 3)
  })
}

/** Tender No. 1 on two trestles, her name on the transom; origin on the hard under her middle, bow toward −z. */
function tender(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'tender'
  const L = TENDER.transom - TENDER.bow
  const hull = new THREE.Group()
  hull.position.y = TENDER.keel
  g.add(hull)
  const { bottom, sides, sheer, inside } = clinkerHull(L)
  const paint = (geo: THREE.BufferGeometry, color: string): void => {
    const mesh = new THREE.Mesh(geo, mat.lacquer(color))
    mesh.castShadow = true
    mesh.receiveShadow = true
    hull.add(mesh)
  }
  paint(bottom, p.accent)
  paint(sides, tokens['paper.white'])
  paint(sheer, p.accent2)
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'boathouse:tender', repeat: [3, 1] })
  const innerMat = wood.clone()
  innerMat.side = THREE.BackSide
  const inner = new THREE.Mesh(inside, innerMat)
  inner.receiveShadow = true
  hull.add(inner)

  // The transom: the aft section filled flat, varnished, the name painted on it.
  const aft = hullSection(0)
  const outline = new THREE.Shape()
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const s = i / steps, a = s * Math.PI / 2
    const x = aft.b * Math.sin(a), y = aft.keel + (aft.sheer - aft.keel) * (1 - Math.cos(a))
    if (i === 0) outline.moveTo(x, y)
    else outline.lineTo(x, y)
  }
  for (let i = steps; i >= 0; i--) {
    const s = i / steps, a = s * Math.PI / 2
    outline.lineTo(-aft.b * Math.sin(a), aft.keel + (aft.sheer - aft.keel) * (1 - Math.cos(a)))
  }
  const transomGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.03, bevelEnabled: false })
  const transom = new THREE.Mesh(transomGeo, mat.wood({ base: shade(p.wood, 1.08), grain: p.woodGrain, seed: 'boathouse:transom', repeat: [1, 1] }))
  transom.position.z = L / 2 - 0.02
  transom.castShadow = true
  hull.add(transom)
  const name = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.14), new THREE.MeshStandardMaterial({ map: nameTexture(dressing.dinghyName, p), transparent: true, roughness: 0.5, metalness: 0 }))
  name.name = 'tender:name'
  name.position.set(0, aft.sheer * 0.62, L / 2 + 0.0115)
  hull.add(name)

  // Gunwales, keel, stem, thwarts, bottom boards, rowlocks.
  const m = new Merger()
  const sheerLine = (side: number): THREE.CatmullRomCurve3 => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 20; i++) {
      const t = Math.min(0.995, i / 20)
      const s = hullSection(t)
      pts.push(new THREE.Vector3(side * s.b, s.sheer + 0.01, L / 2 - t * L))
    }
    return new THREE.CatmullRomCurve3(pts)
  }
  for (const side of [-1, 1]) m.add(new THREE.TubeGeometry(sheerLine(side), 48, 0.022, 6, false), mat.lacquer(p.trim))
  const keelPts: THREE.Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    keelPts.push(new THREE.Vector3(0, hullSection(t).keel - 0.02, L / 2 - t * L))
  }
  keelPts.push(new THREE.Vector3(0, hullSection(1).sheer + 0.05, -L / 2 - 0.03))
  m.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(keelPts), 40, 0.028, 6, false), wood)
  for (const t of [0.34, 0.62]) {
    const s = hullSection(t)
    m.box(s.b * 1.86, 0.03, 0.2, wood, 0, s.sheer - 0.13, L / 2 - t * L)
  }
  const st = hullSection(0.08)
  m.box(st.b * 1.7, 0.03, 0.34, wood, 0, st.sheer - 0.15, L / 2 - 0.08 * L - 0.06)
  m.box(0.46, 0.02, L * 0.6, wood, 0, 0.07, L / 2 - 0.45 * L)
  for (const side of [-1, 1]) {
    const s = hullSection(0.47)
    m.torus(0.03, 0.006, Math.PI, k.brass, side * s.b, s.sheer + 0.035, L / 2 - 0.47 * L, new THREE.Euler(0, Math.PI / 2, 0), 12, 6)
  }
  m.build(hull, 'tender:trim')

  // Two trestles under her, across the hull, a felt pad and a chock for the keel.
  const tr = new Merger()
  const zs = [-0.95, 0.75]
  const top = TENDER.keel - 0.03
  for (const z of zs) {
    const tz = z
    tr.box(1.1, 0.08, 0.12, k.pine, 0, top - 0.04, tz)
    tr.box(0.24, 0.04, 0.14, mat.felt(p.felt), 0, top + 0.02, tz)
    for (const s of [-1, 1]) {
      for (const dz of [-1, 1]) tr.beam(new THREE.Vector3(s * 0.42, top - 0.06, tz), new THREE.Vector3(s * 0.52, 0, tz + dz * 0.2), 0.06, 0.06, k.pine)
      tr.box(0.05, 0.05, 0.4, k.pine, s * 0.48, 0.2, tz)
    }
  }
  tr.build(g, 'tender:trestles')
  const tag = hsPlate('HS-0803', p, 0.13, 0.032)
  tag.position.set(0.3, top - 0.04, zs[1] + 0.062)
  g.add(tag)
  return g
}

// ───────────────────────────── The winch and its cable ─────────────────────────────

/** A spur gear outline, `teeth` teeth on radius r, with a hub hole and six lightening holes. */
function gearShape(r: number, teeth: number, hub: number): THREE.Shape {
  const s = new THREE.Shape()
  const depth = r * 0.08
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, step = (Math.PI * 2) / teeth
    const pts: [number, number][] = [[a0, r - depth], [a0 + step * 0.18, r], [a0 + step * 0.5, r], [a0 + step * 0.68, r - depth]]
    pts.forEach(([a, rr], j) => {
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr
      if (i === 0 && j === 0) s.moveTo(x, y)
      else s.lineTo(x, y)
    })
  }
  s.closePath()
  const holeR = hub
  const h = new THREE.Path()
  h.absarc(0, 0, holeR, 0, Math.PI * 2, true)
  s.holes.push(h)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const w = new THREE.Path()
    w.absarc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.17, 0, Math.PI * 2, true)
    s.holes.push(w)
  }
  return s
}

/**
 * The slipway winch: two cast standards on a bed plate, the drum between them with its cable wound on,
 * the great wheel on the camera side, the pinion and crank shaft over it, a handle each side, a pawl on
 * the ratchet. Drum axis along z. Origin on the hard. Returns the group and the cable's leaving point.
 */
function winch(k: Kit): { group: THREE.Group; drum: THREE.Object3D; lead: THREE.Vector3 } {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'winch'
  const m = new Merger()
  // The castings painted olive over the iron; shafts, bed and handles left in bare iron.
  const paint = new THREE.MeshStandardMaterial({ color: p.wallAlt, roughness: 0.5, metalness: 0.25 })
  const drumY = 0.52, drumR = 0.13, half = 0.26
  m.box(0.74, 0.04, 0.84, k.iron, 0, 0.02, 0)
  for (const x of [-0.3, 0.3]) for (const z of [-0.36, 0.36]) m.cyl(0.02, 0.02, 0.03, 8, k.iron, x, 0.05, z)
  const standard = new THREE.Shape()
  standard.moveTo(-0.34, 0); standard.lineTo(0.34, 0); standard.lineTo(0.12, 1.0); standard.lineTo(-0.12, 1.0); standard.lineTo(-0.34, 0)
  const hole = new THREE.Path()
  hole.moveTo(-0.22, 0.12); hole.lineTo(0.22, 0.12); hole.lineTo(0.08, 0.4); hole.lineTo(-0.08, 0.4); hole.lineTo(-0.22, 0.12)
  standard.holes.push(hole)
  for (const s of [-1, 1]) {
    m.add(new THREE.ExtrudeGeometry(standard, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 }), paint, 0, 0.04, s * (half + 0.04) - 0.02)
    // Bearings.
    m.cyl(0.05, 0.05, 0.06, 16, k.brass, 0, drumY, s * (half + 0.04), ROT_X90)
    m.cyl(0.035, 0.035, 0.06, 16, k.brass, 0, 0.92, s * (half + 0.04), ROT_X90)
  }
  // Drum flanges and shaft.
  for (const s of [-1, 1]) m.cyl(drumR + 0.07, drumR + 0.07, 0.025, 28, paint, 0, drumY, s * (half - 0.0125), ROT_X90)
  m.rodZ(0.025, half * 2 + 0.3, 12, k.iron, 0, drumY, 0.04)
  // The great wheel on the camera side, the pinion over it, the crank shaft right through.
  m.add(new THREE.ExtrudeGeometry(gearShape(0.3, 40, 0.03), { depth: 0.03, bevelEnabled: false, curveSegments: 6 }), paint, 0, drumY, half + 0.1)
  m.cyl(0.05, 0.05, 0.05, 16, k.iron, 0, drumY, half + 0.125, ROT_X90)
  m.add(new THREE.ExtrudeGeometry(gearShape(0.095, 12, 0.02), { depth: 0.03, bevelEnabled: false, curveSegments: 6 }), paint, 0, 0.92, half + 0.1)
  m.rodZ(0.02, half * 2 + 0.36, 10, k.iron, 0, 0.92, 0)
  for (const s of [-1, 1]) {
    const z = s * (half + 0.2)
    m.box(0.05, 0.34, 0.03, k.iron, 0.13, 0.92 - 0.12, z, new THREE.Euler(0, 0, 0.9))
    m.rodZ(0.022, 0.18, 12, k.pine, 0.26, 0.92 - 0.22, z + s * 0.1)
  }
  // Ratchet on the drum shaft, pawl from the standard.
  m.cyl(0.08, 0.08, 0.025, 16, k.iron, 0, drumY, -half - 0.1, ROT_X90)
  m.box(0.14, 0.025, 0.02, k.iron, 0.1, drumY + 0.1, -half - 0.1, new THREE.Euler(0, 0, -0.5))
  m.build(g, 'winch:iron')

  // The drum with its cable wound on: a turned barrel under a close helix.
  const drum = new THREE.Group()
  drum.name = 'drum'
  drum.position.set(0, drumY, 0)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(drumR + 0.022, drumR + 0.022, half * 2 - 0.03, 28, 1), k.cable)
  barrel.rotation.x = Math.PI / 2
  barrel.castShadow = true
  drum.add(barrel)
  g.add(drum)

  const plate = hsPlate('HS-0811', p, 0.16, 0.04)
  plate.position.set(0, 0.2, half + 0.065)
  g.add(plate)
  // The cable leaves the top of the drum toward the slipway (+x), at the drum's back end.
  const lead = new THREE.Vector3(0, drumY + drumR + 0.022, -half + 0.08)
  return { group: g, drum, lead }
}

/**
 * The wire from the winch drum across the quay to the snatch block at the head of the slip, round it and
 * down the slip along the keel way, to an open hook at the water's edge with nothing on it.
 */
function cableRun(k: Kit, from: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cable'
  const r = 0.012
  const sheave = { x: -0.11, z: -ROOM.d / 2 + 0.24, r: 0.11 }
  const onWay = (z: number): number => slipY(z) + 0.045 + r
  const yS = onWay(sheave.z) + 0.05
  const inPt = new THREE.Vector3(sheave.x, yS, sheave.z - sheave.r)
  const endZ = -1.02
  const path = new THREE.CurvePath<THREE.Vector3>()
  // Across the quay with a little sag, falling to the block.
  const mid = from.clone().lerp(inPt, 0.5)
  mid.y -= 0.05
  path.add(new THREE.QuadraticBezierCurve3(from.clone(), mid, inPt))
  // A quarter turn round the sheave (plan view), from its back to its right side.
  const arc: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI / 2
    arc.push(new THREE.Vector3(sheave.x + Math.cos(a) * sheave.r, yS, sheave.z + Math.sin(a) * sheave.r))
  }
  path.add(new THREE.CatmullRomCurve3(arc))
  // Down the slip, settling onto the keel way.
  const down0 = arc[arc.length - 1]
  const down1 = new THREE.Vector3(0, onWay(sheave.z + 0.5), sheave.z + 0.5)
  path.add(new THREE.QuadraticBezierCurve3(down0, new THREE.Vector3(0, yS, sheave.z + 0.25), down1))
  path.add(new THREE.LineCurve3(down1, new THREE.Vector3(0, onWay(endZ), endZ)))
  const cable = new THREE.Mesh(new THREE.TubeGeometry(path, 220, r, 6, false), k.cable)
  cable.castShadow = true
  cable.receiveShadow = true
  g.add(cable)

  const m = new Merger()
  // The snatch block: an iron cheek plate each side of a sheave, on an eye to the ring bolt in the stop-beam.
  m.cyl(sheave.r + 0.02, sheave.r + 0.02, 0.012, 24, k.iron, sheave.x, yS - 0.03, sheave.z)
  m.cyl(sheave.r + 0.02, sheave.r + 0.02, 0.012, 24, k.iron, sheave.x, yS + 0.03, sheave.z)
  m.cyl(sheave.r - 0.01, sheave.r - 0.01, 0.05, 24, k.brass, sheave.x, yS, sheave.z)
  m.cyl(0.02, 0.02, 0.1, 10, k.iron, sheave.x, yS, sheave.z)
  m.torus(0.05, 0.012, Math.PI * 2, k.iron, sheave.x - 0.18, yS, sheave.z - 0.04, ROT_X90, 20, 6)
  // At the end: a thimbled eye, a shackle, and the hook lying on its side, open.
  const yE = onWay(endZ)
  m.torus(0.03, 0.009, Math.PI * 2, k.iron, 0, yE, endZ + 0.03, ROT_X90, 16, 6)
  m.torus(0.035, 0.01, Math.PI * 1.4, k.iron, 0, yE, endZ + 0.1, new THREE.Euler(Math.PI / 2, 0, Math.PI * 0.8), 16, 6)
  m.rodX(0.008, 0.09, 8, k.iron, 0, yE, endZ + 0.07)
  m.rod(new THREE.Vector3(0, yE, endZ + 0.13), new THREE.Vector3(0, yE, endZ + 0.22), 0.016, 8, k.iron)
  m.torus(0.06, 0.016, Math.PI * 1.25, k.iron, 0.05, yE, endZ + 0.26, new THREE.Euler(-Math.PI / 2, 0, Math.PI), 18, 6)
  m.build(g, 'cable:fittings')
  return g
}

// ───────────────────────────── The lifebuoy ─────────────────────────────

/**
 * The lifebuoy on the back wall: cork in painted canvas, raspberry and paper quarters, H.I.H.S. lettered
 * top and bottom, a grab line in four bights, on a two-peg bracket. Back at z = 0, facing +z.
 */
function lifebuoy(k: Kit): THREE.Group {
  const p = k.p
  const g = new THREE.Group()
  g.name = 'lifebuoy'
  const R = 0.3, r = 0.075
  // Torus UV: u around the ring (0 at +x, counter-clockwise), v around the tube (0.25 facing +z).
  const map = canvasTexture(1024, 256, (c, W, H) => {
    c.fillStyle = tokens['paper.white']
    c.fillRect(0, 0, W, H)
    c.fillStyle = p.accent
    // Two raspberry quarters at the sides; the lettering on the paper at the top and bottom.
    c.fillRect(0, 0, 0.09 * W, H)
    c.fillRect(0.91 * W, 0, 0.09 * W, H)
    c.fillRect(0.41 * W, 0, 0.18 * W, H)
    // Canvas weave and a little grime.
    const rnd = seeded('boathouse:buoy')
    brush(c, rnd, { x: 0, y: 0, w: W, h: H, count: 1600, color: () => rgba(p.ink, 0.05), len: [6, 14], width: [1, 1.5], angle: 0, wobble: 0.05 })
    brush(c, rnd, { x: 0, y: 0, w: W, h: H, count: 1600, color: () => rgba(p.ink, 0.04), len: [6, 14], width: [1, 1.5], angle: Math.PI / 2, wobble: 0.05 })
    // The lettering: at the bottom it reads along +u; at the top the text is turned half round.
    const text = dressing.lifebuoy
    const draw = (u: number, flip: boolean): void => {
      c.save()
      c.translate(u * W, (1 - 0.25) * H)
      if (flip) c.rotate(Math.PI)
      c.font = `600 ${H * 0.25}px ${FONT_SANS}`
      c.fillStyle = p.ink
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      const cc = c as CanvasRenderingContext2D & { letterSpacing?: string }
      if ('letterSpacing' in cc) cc.letterSpacing = `${H * 0.05}px`
      c.fillText(text, 0, 0)
      c.restore()
    }
    draw(0.75, false)
    draw(0.25, true)
  })
  map.wrapS = THREE.RepeatWrapping
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, r, 18, 64), new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0 }))
  ring.position.z = r + 0.05
  ring.castShadow = true
  ring.receiveShadow = true
  g.add(ring)
  const m = new Merger()
  // The grab line: four bights between seizings on the outer edge.
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4
    const pts: THREE.Vector3[] = []
    for (let j = 0; j <= 10; j++) {
      const a = a0 + (j / 10) * (Math.PI / 2)
      const sag = Math.sin((j / 10) * Math.PI) * 0.045
      pts.push(new THREE.Vector3(Math.cos(a) * (R + r + sag), Math.sin(a) * (R + r + sag) - sag * 0.6, r + 0.05))
    }
    m.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.009, 5, false), k.rope)
    m.torus(r + 0.004, 0.01, Math.PI * 2, k.rope, Math.cos(a0) * R, Math.sin(a0) * R, r + 0.05, new THREE.Euler(0, 0, a0 + Math.PI / 2), 14, 5)
  }
  // The bracket: an oak board with two pegs the ring hangs on.
  m.box(0.34, 0.1, 0.04, k.oak, 0, R + 0.02, 0.02)
  for (const s of [-1, 1]) m.rodZ(0.018, 0.16, 10, k.oak, s * 0.1, R + 0.02, 0.1)
  m.build(g, 'lifebuoy:fittings')
  const tag = hsPlate('HS-0809', p, 0.14, 0.035)
  tag.position.set(0, -R - r - 0.1, 0.075)
  g.add(tag)
  return g
}

// ───────────────────────────── Oars, bulkhead lamps, rope ─────────────────────────────

/** One oar and one boathook racked on iron brackets along a side wall, into `m` (wall-local: along x, the wall at z = 0). */
function oarRack(k: Kit, m: Merger, dir: 1 | -1): void {
  const ash = mat.wood({ base: shade(tokens['br.lightBody'], 0.92), grain: k.p.wood, seed: 'boathouse:ash', repeat: [4, 1] })
  const oarY = 2.46, hookY = 2.2
  const X = (x: number): number => x * dir
  // Oar along x: handle at +x, loom, a leather at the rowlock, blade toward −x (all times `dir`).
  m.rodX(0.022, 1.5, 12, ash, X(0.2), oarY, 0.12)
  m.rodX(0.018, 0.16, 10, ash, X(1.03), oarY, 0.12)
  m.rodX(0.027, 0.2, 12, k.iron, X(0.35), oarY, 0.12)
  m.add(new THREE.BoxGeometry(0.56, 0.13, 0.014), ash, X(-0.83), oarY, 0.12)
  m.cyl(0.065, 0.065, 0.014, 20, ash, X(-1.11), oarY, 0.12, ROT_X90)
  // Boathook: ash pole, brass hook and spike toward −x.
  m.rodX(0.017, 2.0, 10, ash, X(0.05), hookY, 0.1)
  m.cyl(0.02, 0.017, 0.08, 10, k.brass, X(-0.98), hookY, 0.1, ROT_Z90)
  m.rodX(0.007, 0.14, 8, k.brass, X(-1.08), hookY, 0.1)
  m.torus(0.035, 0.007, Math.PI, k.brass, X(-1.02), hookY + 0.035, 0.1, new THREE.Euler(0, 0, Math.PI / 2), 12, 6)
  // Brackets.
  for (const x of [-0.45, 0.6]) {
    m.box(0.03, 0.42, 0.03, k.iron, X(x), (oarY + hookY) / 2 - 0.02, 0.015)
    for (const y of [oarY - 0.035, hookY - 0.03]) m.box(0.03, 0.02, 0.17, k.iron, X(x), y, 0.085)
  }
}

/** A caged bulkhead lamp, lit: brass body, a frosted globe, an iron cage, into `m` (back at z = 0); returns its light. */
function bulkheadLamp(k: Kit, m: Merger, globeMat: THREE.Material): THREE.PointLight {
  const p = k.p
  m.cyl(0.07, 0.07, 0.03, 20, k.brass, 0, 0, 0.015, ROT_X90)
  m.cyl(0.06, 0.07, 0.06, 20, k.brass, 0, 0, 0.06, ROT_X90)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    m.add(new THREE.TorusGeometry(0.075, 0.005, 5, 16, Math.PI), k.iron, 0, 0, 0.09, new THREE.Euler(0, Math.PI / 2, a))
  }
  m.add(new THREE.SphereGeometry(0.062, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), globeMat, 0, 0, 0.09, new THREE.Euler(Math.PI / 2, 0, 0))
  const light = new THREE.PointLight(new THREE.Color(p.light), 1.6, 7, 2)
  light.position.z = 0.55
  light.castShadow = false
  return light
}

/** A coil of rope: `turns` loose loops, radius r, lying in the xz plane (on the ground) or hung in xy. */
function ropeCoil(k: Kit, r: number, turns: number, rnd: () => number, hung: boolean, into?: Merger): THREE.Group {
  const g = new THREE.Group()
  g.name = 'coil'
  const m = into ?? new Merger()
  for (let i = 0; i < turns; i++) {
    const rr = r * (0.92 + rnd() * 0.12)
    const rot = hung ? new THREE.Euler(0, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2) : new THREE.Euler(Math.PI / 2 + (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12, 0)
    // Hung, each turn falls a little lower than the last and the loops fan; flaked, they stack.
    const dy = hung ? -(rr - r) - i * 0.012 : i * 0.022
    m.torus(rr, 0.012, Math.PI * 2, k.rope, (rnd() - 0.5) * 0.04, dy, hung ? i * 0.012 : 0, rot, 28, 6)
  }
  if (!into) m.build(g, 'coil')
  return g
}

/**
 * The tender's mast and yard with the sail furled on it, leaning in the back left corner and lashed to an
 * eye in the rock: the ladder's diagonal mirrored. Origin on the hard at the spars' feet.
 */
function spars(k: Kit): THREE.Group {
  const g = new THREE.Group()
  g.name = 'spars'
  const m = new Merger()
  const spruce = mat.wood({ base: shade(k.p.wood, 1.12), grain: k.p.woodGrain, seed: 'boathouse:spars', repeat: [1, 4] })
  const top = 3.3, run = 0.5
  const lean = Math.atan2(run, top)
  const along = (x: number, len: number, r0: number, r1: number): void => {
    m.cyl(r1, r0, len, 12, spruce, x, (len / 2) * Math.cos(lean), -(len / 2) * Math.sin(lean), new THREE.Euler(-lean, 0, 0))
  }
  along(-0.12, Math.hypot(top, run), 0.042, 0.03)
  along(0.1, Math.hypot(top - 0.3, run * 0.9), 0.028, 0.022)
  // The sail furled along the yard: tanned canvas in a long bundle, three ties.
  const len = 2.0, mid = 1.35
  m.cyl(0.05, 0.06, len, 12, mat.felt(shade(tokens['out.oilskin'], 0.78)), 0.14, mid * Math.cos(lean), -mid * Math.sin(lean) + 0.04, new THREE.Euler(-lean, 0, 0))
  for (const f of [-0.7, 0, 0.7]) {
    const y = (mid + f) * Math.cos(lean), z = -(mid + f) * Math.sin(lean) + 0.04
    m.torus(0.062, 0.008, Math.PI * 2, k.rope, 0.14, y, z, new THREE.Euler(Math.PI / 2 - lean, 0, 0), 16, 5)
  }
  // The lashing to an iron eye in the rock, and felt pads under the heels.
  const ly = 3.0 * Math.cos(lean), lz = -3.0 * Math.sin(lean)
  m.torus(0.12, 0.012, Math.PI * 2, k.rope, 0, ly, lz, new THREE.Euler(Math.PI / 2 - lean, 0, 0), 20, 5)
  m.build(g, 'spars')
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/**
 * Builds the Boathouse in local space (origin at the floor centre, open toward +z): the rock shell with
 * its painted high-water line, the quays, the slipway and the water; the empty cradle centred on the
 * slip (the flaw, `userData.flaw`), Tender No. 1 on trestles to the right, the winch to the left with
 * its cable to nothing, the lifebuoy, the oars, the passage, the ladder and the slipway doors. Rowan Tuck
 * is built hidden: `group.userData.highWaterOnly` is his figure, to be shown at high water only.
 * `group.userData.tick(dt)` moves the painted water, very slowly.
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
  const byId = new Map(ctx.def.hotspots.map((h) => [h.id, h] as const))

  const { group: room, water } = shell(k)
  group.add(room)

  // The cradle, centred on the slip, riding the outer ways; empty.
  const theCradle = cradle(k)
  theCradle.rotation.x = Math.atan(SLOPE)
  theCradle.position.set(0, slipY(CRADLE.z) + 0.07, CRADLE.z)
  group.add(theCradle)
  register('boathouse.cradle', theCradle)

  // Tender No. 1 on her trestles on the right quay, transom to the camera.
  const theTender = tender(k)
  theTender.position.set(TENDER.x, HARD, (TENDER.bow + TENDER.transom) / 2)
  group.add(theTender)
  register('boathouse.dinghy', theTender)

  // The winch on the left quay; its cable across to the head of the slip and down it.
  const theWinch = winch(k)
  theWinch.group.position.set(WINCH.x, HARD, WINCH.z)
  group.add(theWinch.group)
  const lead = theWinch.lead.clone().add(theWinch.group.position)
  group.add(cableRun(k, lead))
  register('boathouse.winch', theWinch.group)

  // The lifebuoy centred on the back wall, a bulkhead lamp either side of it.
  const buoy = lifebuoy(k)
  buoy.position.set(0, 2.38, backZ + 0.07)
  group.add(buoy)
  register('boathouse.lifebuoy', buoy)
  const lamps = new THREE.Group()
  lamps.name = 'bulkheads'
  const lampM = new Merger()
  const globeMat = new THREE.MeshStandardMaterial({ color: p.paper, emissive: p.light, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0 })
  for (const s of [-1, 1]) {
    const at = new THREE.Vector3(s * 1.55, 2.62, backZ + 0.07)
    lampM.outer = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)
    const light = bulkheadLamp(k, lampM, globeMat)
    light.position.add(at)
    lamps.add(light)
  }
  lampM.outer = undefined
  lampM.build(lamps, 'bulkheads')
  group.add(lamps)

  // The tender's spars in the back left corner, mirroring the ladder in the back right.
  const theSpars = spars(k)
  theSpars.position.set(-2.95, HARD, backZ + 0.08 + 0.5)
  group.add(theSpars)

  // The tide line: painted into the rock on all three walls; here its lettering's plate and a hit band along the back.
  const tide = new THREE.Group()
  tide.name = 'tideline'
  const band = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.36), k.hidden)
  band.position.set(0, TIDE_Y + 0.08, backZ + 0.08)
  tide.add(band)
  const tidePlate = hsPlate('HS-0807', p, 0.14, 0.035)
  tidePlate.position.set(-1.28, TIDE_Y - 0.1, backZ + 0.085)
  tide.add(tidePlate)
  group.add(tide)
  register('boathouse.tideline', tide)

  // The rope store in the right wall, the passage's mirror.
  const store = ropeStore(k)
  store.position.set(w / 2, HARD, ARCH.z)
  store.rotation.y = -Math.PI / 2
  group.add(store)

  // An oar and a boathook racked on each side wall, mirrored.
  const oars = new THREE.Group()
  oars.name = 'oars'
  const oarM = new Merger()
  for (const s of [-1, 1]) {
    // The left wall's local +x runs to the front, the right wall's to the back: blades toward the back wall on both.
    oarM.outer = new THREE.Matrix4().makeTranslation(s * (w / 2 - 0.06), 0, -1.75).multiply(new THREE.Matrix4().makeRotationY(-s * Math.PI / 2))
    oarRack(k, oarM, s < 0 ? -1 : 1)
  }
  oarM.outer = undefined
  oarM.build(oars, 'oars')
  group.add(oars)

  // Exits: the passage in the left wall, the ladder in the back right, the slipway doors at the quay ends.
  for (const hs of ctx.def.hotspots) {
    if (hs.kind !== 'door') continue
    if (hs.via === 'dolly-left') {
      const arch = passage(hs, k)
      arch.position.set(-w / 2, HARD, ARCH.z)
      arch.rotation.y = Math.PI / 2
      group.add(arch)
      register(hs.id, arch)
    } else if (hs.via === 'lift-up') {
      const up = ladderUp(hs, k)
      group.add(up)
      register(hs.id, up)
    } else {
      const doors = slipwayDoors(hs, k)
      group.add(doors)
      register(hs.id, doors)
    }
  }

  // Rowan Tuck at the right, coiling rope, at high water only: built, hidden, handed to the station layer.
  const tuckDef = byId.get('boathouse.tuck')
  const tuck = figure({ variant: 'tuck' })
  tuck.position.set(1.6, HARD, -1.45)
  const inHands = ropeCoil(k, 0.2, 4, seeded('boathouse:coil:hands'), true)
  inHands.position.set(0, 0.74, 0.17)
  tuck.add(inHands)
  const atFeet = ropeCoil(k, 0.17, 5, seeded('boathouse:coil:feet'), false)
  atFeet.position.set(0.05, 0.015, 0.36)
  tuck.add(atFeet)
  tuck.visible = false
  group.add(tuck)
  if (tuckDef) register(tuckDef.id, tuck)
  out.residentAnchor = tuck
  group.userData.highWaterOnly = tuck

  // Static groups do not need their matrices recomputed every frame.
  for (const child of [room, theCradle, theTender, buoy, tide]) {
    child.updateMatrixWorld(true)
    child.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix() })
  }

  // The water drifts, very slowly, and never on hover.
  group.userData.tick = (dt: number): void => {
    const map = water.map
    if (map) map.offset.x = (map.offset.x + dt * 0.006) % 1
  }

  for (const def of ctx.def.hotspots) if (!out.hotspots.has(def.id)) console.warn(`[boathouse] hotspot ${def.id} has no object`)
  return out
}
