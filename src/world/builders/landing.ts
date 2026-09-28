// Frame 4: The Landing (first floor, centre). docs/BIBLE.md §6 Frame 4, palette §3.2 with the olive band.
// The stair arrives at centre from below: a well in the floor, framed on three sides by a banister,
// open at the back where one steps off. The flight on to the Lamp Room continues at the back, split
// into two mirrored ship's flights that climb along the back wall from the corners to a small gallery
// at the centre, a ladder and a hatch above it. Under the gallery, in the tall niche the two flights
// frame: the wireless cupboard on the floor, the roster board dead centre (oak, six brass hooks, five
// embroidered felt badges), the 1959 group photograph above it. A door either side (left to the
// Recorder's Room, right to the Quarters with its HS-0500 plate); the Standing Orders framed on the
// left wall, the station drawn in section framed on the right. Two pendants. No resident.
// The one flaw: the sixth hook is empty; its badge hangs from a nail below the board on a raspberry
// string, where the other five hang on brass cord. Nothing moves on hover.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import { FONT_MONO, FONT_SANS } from '../../core/fonts'
import { mat, plasterTexture, seeded, woodTexture } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { tokens, type RegionPalette } from '../../content/palette'
import { dressing } from '../../content/frames/landing'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres: width, height, depth (open toward +z, back wall at z = −d/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
/** The back wall's plane. */
const BACK = -ROOM.d / 2
/** The flights to the Lamp Room: from the side walls (outer) up to the gallery (inner), `depth` off the back wall. */
const FLIGHT = { outer: 3.5, inner: 0.95, top: 3.0, depth: 0.75, steps: 14 } as const
/** Rise of the flights per metre run. */
const SLOPE = FLIGHT.top / (FLIGHT.outer - FLIGHT.inner)
/** Front face of the spandrels and the gallery. */
const FRONT = BACK + FLIGHT.depth
/** The stairwell from the Board Room: half-width and the z of its back (step-off) and front edges. */
const WELL = { hx: 0.6, z0: -1.62, z1: -0.1, deep: 1.5 } as const
/** Door opening on each side wall and where along the wall it sits. */
const DOOR = { w: 1.0, h: 2.2, z: 0.3 } as const
/** Centre (z) of the two frames on the side walls: the Orders left, the section right. */
const PANEL_Z = -1.27

/** Height of the concave line of a flight (the inner corners of its steps) at |x| = ax. */
function flightLine(ax: number): number {
  return (FLIGHT.outer - ax) * SLOPE
}

// ───────────────────────────── Helpers ─────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** A palette hex with alpha, for canvas painting. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A canvas painted once, wrapped as an sRGB texture. */
function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  if (transparent) ctx.clearRect(0, 0, w, h)
  paint(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
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

/** Words wrapped to `width` pixels in the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) { out.push(line); line = word } else line = next
  }
  if (line) out.push(line)
  return out
}

/**
 * Typed text in Courier Prime at the 0.6 em advance; with `bent`, every lower-case `e` is the
 * Olivetti's bent glyph (0.04 em low, rotated 4 degrees), per §4 rule 3.
 */
function typed(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, bent: boolean): void {
  ctx.font = `400 ${size}px ${FONT_MONO}`
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const adv = size * 0.6
  let cx = x
  for (const ch of text) {
    if (bent && ch === 'e') {
      ctx.save()
      ctx.translate(cx, y + size * 0.04)
      ctx.rotate(THREE.MathUtils.degToRad(4))
      ctx.fillText(ch, 0, 0)
      ctx.restore()
    } else ctx.fillText(ch, cx, y)
    cx += adv
  }
}

/** Foxing: small brass-brown spots at about 0.4 percent of the sheet. */
function foxing(ctx: CanvasRenderingContext2D, w: number, h: number, p: RegionPalette, rnd: () => number, count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rgba(p.brass, 0.08 + rnd() * 0.16)
    ctx.beginPath()
    ctx.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Collects geometry per material and merges it into one mesh per material: one draw call each. */
class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1))
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

  sphere(r: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 14): void {
    this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.6))), material, x, y, z)
  }

  /** A cylinder stretched between two points. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material, seg = 6): void {
    const geo = new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    const mid = a.clone().lerp(b, 0.5)
    const g = geo.toNonIndexed()
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)))
    geo.dispose()
    const list = this.parts.get(material) ?? []
    list.push(g)
    this.parts.set(material, list)
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

/** A small paper plate with the inventory number in letterspaced caps. */
function hsPlate(text: string, p: RegionPalette, width = 0.1): THREE.Mesh {
  const plate = placard({ lines: [text], width, height: width * 0.3, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `hs:${text}`
  return plate
}

/** A painted board with a destination's name. */
function namePlate(text: string, p: RegionPalette, width: number, height = width * 0.2): THREE.Mesh {
  const plate = placard({ lines: [text], width, height, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `plate:${text}`
  return plate
}

/** A flat mesh that neither casts nor sorts badly: labels, prints, painted faces. */
function flatMesh(geo: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geo, material)
  m.name = name
  m.castShadow = false
  m.receiveShadow = true
  return m
}

// ───────────────────────────── Materials painted for this room ─────────────────────────────

/**
 * Mustard distemper with the §3.5 wear painted in: vertical brush strokes at alpha 0.06, corner
 * grime as a multiply of 1 − 0.10·smoothstep(0.75, 1, r), and where `scuff` names a span of u a
 * 40 mm band 350 mm above the floor at −4 percent value (the wall beside a door).
 */
function wornPlaster(p: RegionPalette, seed: string, wallHeight: number, scuff?: [number, number]): THREE.MeshStandardMaterial {
  const src = plasterTexture(p.wall, seed).image as HTMLCanvasElement
  const size = src.width
  const map = canvasTexture(size, size, (ctx) => {
    ctx.drawImage(src, 0, 0)
    const rnd = seeded(seed + ':strokes')
    for (let i = 0; i < 240; i++) {
      ctx.strokeStyle = rgba(rnd() < 0.5 ? p.ink : p.paper, 0.06)
      ctx.lineWidth = 2
      const x = rnd() * size, y = rnd() * size, len = 24 + rnd() * 24
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 2, y + len); ctx.stroke()
    }
    const img = ctx.getImageData(0, 0, size, size)
    const px = img.data
    const bandLo = (0.35 - 0.02) / wallHeight, bandHi = (0.35 + 0.02) / wallHeight
    for (let y = 0; y < size; y++) {
      const v = 1 - (y + 0.5) / size
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size
        const r = Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2
        let k = 1 - 0.1 * smoothstep(0.75, 1, r)
        if (scuff && v > bandLo && v < bandHi && u > scuff[0] && u < scuff[1]) k *= 0.96
        const i = (y * size + x) * 4
        px[i] *= k
        px[i + 1] *= k
        px[i + 2] *= k
      }
    }
    ctx.putImageData(img, 0, 0)
  })
  return new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.004, roughness: 0.95, metalness: 0 })
}

/**
 * Pine boards painted once: the house ground over the pine grain, strokes along the grain, three
 * boards per tile with dark seams and staggered end joints. Tile: 3 m along u, 0.45 m across v.
 */
function boards(p: RegionPalette): THREE.MeshStandardMaterial {
  const src = woodTexture({ base: p.ground, grain: p.woodGrain, seed: 'landing:floor' }).image as HTMLCanvasElement
  const map = canvasTexture(512, 512, (c, w, h) => {
    c.drawImage(src, 0, 0, w, h)
    const rnd = seeded('landing:floor:strokes')
    for (let i = 0; i < 420; i++) {
      c.strokeStyle = rgba(rnd() < 0.55 ? p.ink : p.paper, 0.06)
      c.lineWidth = 2 + rnd()
      const x = rnd() * w, y = rnd() * h, len = 24 + rnd() * 24
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + (rnd() - 0.5) * 2); c.stroke()
    }
    c.fillStyle = rgba(p.ink, 0.55)
    for (let b = 0; b < 3; b++) c.fillRect(0, Math.round((b * h) / 3), w, 3)
    const joints = [0.3, 0.72, 0.08]
    joints.forEach((u, b) => c.fillRect(Math.round(u * w), Math.round((b * h) / 3), 3, Math.round(h / 3)))
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  return new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.012, roughness: 0.66, metalness: 0 })
}

/** The olive knot-and-anchor paper: mustard anchors and reef knots on olive, half-dropped; tile 0.24 m. */
function knotAndAnchor(p: RegionPalette): THREE.MeshStandardMaterial {
  const map = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = p.wallAlt
    c.fillRect(0, 0, w, h)
    const rnd = seeded('landing:paper')
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = rgba(rnd() < 0.5 ? p.ink : p.paper, 0.05)
      c.fillRect(rnd() * w, rnd() * h, 1, 1 + rnd() * 3)
    }
    c.strokeStyle = rgba(p.wall, 0.9)
    c.fillStyle = rgba(p.wall, 0.9)
    c.lineWidth = 3
    c.lineCap = 'round'
    const anchor = (x: number, y: number): void => {
      c.beginPath(); c.arc(x, y - 24, 5, 0, Math.PI * 2); c.stroke()
      c.beginPath(); c.moveTo(x, y - 19); c.lineTo(x, y + 24); c.stroke()
      c.beginPath(); c.moveTo(x - 12, y - 12); c.lineTo(x + 12, y - 12); c.stroke()
      c.beginPath(); c.arc(x, y + 6, 18, Math.PI * 0.12, Math.PI * 0.88); c.stroke()
      for (const s of [-1, 1]) {
        const ax = x + s * 17, ay = y + 12
        c.beginPath(); c.moveTo(ax, ay - 7); c.lineTo(ax + s * 5, ay - 1); c.lineTo(ax - s * 2, ay - 2); c.closePath(); c.fill()
      }
    }
    const knot = (x: number, y: number): void => {
      c.beginPath(); c.ellipse(x - 8, y, 13, 9, 0, 0, Math.PI * 2); c.stroke()
      c.beginPath(); c.ellipse(x + 8, y, 13, 9, 0, 0, Math.PI * 2); c.stroke()
      c.beginPath(); c.moveTo(x - 21, y); c.lineTo(x - 30, y + 10); c.moveTo(x + 21, y); c.lineTo(x + 30, y - 10); c.stroke()
    }
    anchor(w * 0.25, h * 0.25)
    anchor(w * 0.75, h * 0.75)
    knot(w * 0.75, h * 0.25)
    knot(w * 0.25, h * 0.75)
    // Hairline pinstripe between the motifs, in paper.
    c.strokeStyle = rgba(p.paper, 0.12)
    c.lineWidth = 1
    for (const x of [0, w / 2]) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke() }
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 })
}

/** A translucent painted patch for the floor's wear: pale where boots have taken the paint. */
function barePatchMaterial(p: RegionPalette): THREE.MeshStandardMaterial {
  const map = canvasTexture(128, 128, (c, w, h) => {
    const rnd = seeded('landing:bare')
    const grad = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    grad.addColorStop(0, rgba(p.paper, 0.2))
    grad.addColorStop(1, rgba(p.paper, 0))
    c.fillStyle = grad
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = rgba(p.ink, 0.05)
      const y = rnd() * h, x = rnd() * w
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18 + rnd() * 20, y); c.stroke()
    }
  }, true)
  return new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
}

// ───────────────────────────── The shell ─────────────────────────────

/** Floor (with the stairwell cut), three worn walls, ceiling, the olive band, skirting, rails, cornice, wear. */
function shell(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const { w, h, d } = ROOM
  const g = new THREE.Group()
  g.name = 'shell'

  // The floor: one sheet of boards with the well cut from it. Shape (x, s) with s = −z, laid flat.
  const outline = new THREE.Shape()
  outline.moveTo(-w / 2, -4); outline.lineTo(w / 2, -4); outline.lineTo(w / 2, d / 2); outline.lineTo(-w / 2, d / 2); outline.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-WELL.hx, -WELL.z1); hole.lineTo(-WELL.hx, -WELL.z0); hole.lineTo(WELL.hx, -WELL.z0); hole.lineTo(WELL.hx, -WELL.z1); hole.closePath()
  outline.holes.push(hole)
  const floorGeo = new THREE.ShapeGeometry(outline)
  floorGeo.rotateX(-Math.PI / 2)
  const pos = floorGeo.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getZ(i) / 3; uv[i * 2 + 1] = pos.getX(i) / 0.45 }
  floorGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const floor = new THREE.Mesh(floorGeo, boards(p))
  floor.name = 'floor'
  floor.receiveShadow = true
  g.add(floor)

  // Walls: the side walls carry the scuff band beside their doors (u runs front→back on the left, back→front on the right).
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wornPlaster(p, 'landing:back', h))
  back.position.set(0, h / 2, BACK)
  back.receiveShadow = true
  g.add(back)
  const span = (z: number): number => (z + d / 2) / d
  const leftScuff: [number, number] = [1 - span(DOOR.z + 0.62), 1 - span(DOOR.z - 0.62)]
  const rightScuff: [number, number] = [span(DOOR.z - 0.62), span(DOOR.z + 0.62)]
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wornPlaster(p, `landing:side${s}`, h, s < 0 ? leftScuff : rightScuff))
    side.position.set(s * (w / 2), h / 2, 0)
    side.rotation.y = -s * (Math.PI / 2)
    side.receiveShadow = true
    g.add(side)
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaster(p.trim))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  ceiling.receiveShadow = true
  g.add(ceiling)

  // The olive band under the cornice on all three walls: one mesh, UVs in tiles of 0.24 m.
  const bandY = 3.2, bandH = 0.84, tile = 0.24
  const bandParts: THREE.BufferGeometry[] = []
  const bandPlane = (len: number, x: number, z: number, ry: number): void => {
    const pg = new THREE.PlaneGeometry(len, bandH)
    const u = pg.getAttribute('uv')
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (len / tile), u.getY(i) * (bandH / tile))
    pg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, bandY, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)))
    bandParts.push(pg)
  }
  bandPlane(w, 0, BACK + 0.004, 0)
  bandPlane(d, -w / 2 + 0.004, 0, Math.PI / 2)
  bandPlane(d, w / 2 - 0.004, 0, -Math.PI / 2)
  const bandGeo = mergeGeometries(bandParts, false)
  for (const b of bandParts) b.dispose()
  if (bandGeo) {
    const band = new THREE.Mesh(bandGeo, knotAndAnchor(p))
    band.name = 'band'
    band.receiveShadow = true
    g.add(band)
  }

  // Trims, merged: skirting (broken at the doors), the band's cream beads, the cornice.
  const m = new Merger()
  const trim = mat.lacquer(p.trim)
  const plaster = mat.plaster(p.trim)
  const runs: { from: number; to: number; side: -1 | 0 | 1 }[] = [
    { from: -w / 2, to: w / 2, side: 0 },
    { from: BACK, to: DOOR.z - DOOR.w / 2 - 0.1, side: -1 }, { from: DOOR.z + DOOR.w / 2 + 0.1, to: d / 2, side: -1 },
    { from: BACK, to: DOOR.z - DOOR.w / 2 - 0.1, side: 1 }, { from: DOOR.z + DOOR.w / 2 + 0.1, to: d / 2, side: 1 },
  ]
  const along = (r: { from: number; to: number; side: -1 | 0 | 1 }, off: number, y: number, hh: number, t: number, material: THREE.Material): void => {
    const len = r.to - r.from, mid = (r.from + r.to) / 2
    if (r.side === 0) m.box(len, hh, t, material, mid, y, BACK + off)
    else m.box(t, hh, len, material, r.side * (w / 2 - off), y, mid)
  }
  for (const r of runs) along(r, 0.015, 0.07, 0.14, 0.03, trim)
  for (const r of [runs[0], { from: BACK, to: d / 2, side: -1 as const }, { from: BACK, to: d / 2, side: 1 as const }]) {
    along(r, 0.01, bandY + bandH / 2 + 0.015, 0.03, 0.02, trim)
    along(r, 0.01, bandY - bandH / 2 - 0.015, 0.03, 0.02, trim)
    along(r, 0.08, h - 0.05, 0.1, 0.16, plaster)
    along(r, 0.045, h - 0.14, 0.08, 0.09, plaster)
    along(r, 0.025, h - 0.21, 0.06, 0.05, trim)
  }
  m.build(g, 'trims', false)

  // Wear on the boards: bare in front of each door and where one steps off the stair.
  const bare = new Merger()
  const bareMat = barePatchMaterial(p)
  const flat = new THREE.Euler(-Math.PI / 2, 0, 0)
  for (const s of [-1, 1]) bare.add(new THREE.PlaneGeometry(1.1, 1.3), bareMat, s * (w / 2 - 0.55), 0.002, DOOR.z, flat)
  bare.add(new THREE.PlaneGeometry(1.3, 0.7), bareMat, 0, 0.002, WELL.z0 - 0.35, flat)
  bare.build(g, 'wear', false)
  return g
}

// ───────────────────────────── The stair up: two flights, the gallery, the hatch ─────────────────────────────

/** A turned baluster one unit tall (scaled per instance), base at y = 0. */
function balusterGeometry(): THREE.LatheGeometry {
  const profile: [number, number][] = [[0.017, 0], [0.017, 0.07], [0.011, 0.1], [0.009, 0.3], [0.015, 0.46], [0.009, 0.62], [0.008, 0.86], [0.014, 0.9], [0.014, 1]]
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 8)
}

/** Balusters at (x, y, z) with a length each, one instanced mesh. */
function balusters(at: { x: number; y: number; z: number; len: number }[], material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(balusterGeometry(), material, at.length)
  mesh.name = 'balusters'
  mesh.castShadow = true
  mesh.receiveShadow = true
  const m = new THREE.Matrix4()
  at.forEach((b, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion(), new THREE.Vector3(1, b.len, 1))))
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** Two mirrored ship's flights from the side walls to the gallery at centre, the ladder and the hatch to the Lamp Room. */
function stairUp(ctx: BuildContext, hs: HotspotDef | undefined): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'stair:up'
  const olive = mat.plaster(p.wallAlt)
  const panel = mat.flat(p.wallAlt)
  const cream = mat.lacquer(p.trim)
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'landing:stair', repeat: [1, 1] })
  const railWood = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:rail', repeat: [4, 1] })
  const brass = mat.brass()
  const { outer, inner, top, depth, steps } = FLIGHT
  const run = (outer - inner) / steps, rise = top / steps
  const theta = Math.atan(SLOPE)
  const railAt = (ax: number): number => flightLine(ax) + 1.0

  const olives = new Merger(), creams = new Merger(), woods = new Merger(), rails = new Merger(), brasses = new Merger()
  const posts: { x: number; y: number; z: number; len: number }[] = []
  const postZ = FRONT + 0.018
  for (const s of [-1, 1]) {
    // The spandrel: a solid triangle under the flight, panelled toward the room.
    const tri = new THREE.Shape()
    tri.moveTo(s * inner, 0); tri.lineTo(s * outer, 0); tri.lineTo(s * inner, top); tri.closePath()
    const prism = new THREE.ExtrudeGeometry(tri, { depth, bevelEnabled: false })
    olives.add(prism, olive, 0, 0, BACK)
    for (let k = 0; k < 3; k++) {
      const cx = inner + 0.36 + k * 0.64, pw = 0.5
      const y0 = 0.26, y1 = flightLine(cx + pw / 2) - 0.2
      if (y1 - y0 < 0.14) continue
      const ph = y1 - y0, py = (y0 + y1) / 2
      olives.box(pw, ph, 0.014, panel, s * cx, py, FRONT + 0.007)
      // A cream bead round each raised panel.
      for (const k2 of [-1, 1]) {
        creams.box(pw + 0.024, 0.012, 0.018, cream, s * cx, py + k2 * (ph / 2 + 0.006), FRONT + 0.009)
        creams.box(0.012, ph, 0.018, cream, s * cx + k2 * (pw / 2 + 0.006), py, FRONT + 0.009)
      }
    }
    creams.box(outer - inner, 0.14, 0.03, cream, s * (outer + inner) / 2, 0.07, FRONT + 0.015)

    // The closed stringer, a cream band along the slope.
    const str = new THREE.Shape()
    const foot = outer - 0.14 / SLOPE
    str.moveTo(s * outer, 0); str.lineTo(s * outer, 0.3); str.lineTo(s * inner, top + 0.3); str.lineTo(s * inner, top - 0.14); str.lineTo(s * foot, 0); str.closePath()
    creams.add(new THREE.ExtrudeGeometry(str, { depth: 0.035, bevelEnabled: false }), cream, 0, 0, FRONT)

    // Treads and risers.
    for (let i = 0; i < steps; i++) {
      const ao = outer - i * run, ai = outer - (i + 1) * run
      woods.box(run + 0.025, 0.035, depth, timber, s * ((ao + ai) / 2 + 0.0125), (i + 1) * rise - 0.0175, BACK + depth / 2)
      creams.box(0.02, rise - 0.035, depth - 0.01, cream, s * (ao - 0.01), i * rise + (rise - 0.035) / 2, BACK + depth / 2)
      const ax = outer - (i + 0.5) * run
      posts.push({ x: s * ax, y: flightLine(ax) + 0.3, z: postZ, len: railAt(ax) - 0.025 - (flightLine(ax) + 0.3) })
    }

    // Newels: short at the foot, full height at the niche (they are its jambs), brass balls on both.
    const footX = outer - 0.06, headX = inner + 0.035
    creams.box(0.09, 1.15, 0.09, cream, s * footX, 0.575, postZ)
    brasses.sphere(0.042, brass, s * footX, 1.19, postZ)
    creams.box(0.09, 4.02, 0.09, cream, s * headX, 2.01, postZ)
    brasses.sphere(0.045, brass, s * headX, 4.06, postZ)
    creams.box(0.11, 0.05, 0.11, cream, s * headX, 4.0, postZ)
    // The handrail, mahogany, on the slope between the newels.
    const ya = railAt(footX), yb = railAt(headX)
    const len = Math.hypot(footX - headX, ya - yb)
    rails.box(len, 0.05, 0.06, railWood, s * (footX + headX) / 2, (ya + yb) / 2, postZ, new THREE.Euler(0, 0, -s * theta))
  }

  // The gallery at the head of the flights: pine top, cream fascia and soffit, a brass rail.
  const gw = inner * 2
  woods.box(gw, 0.035, depth, timber, 0, top - 0.0175, BACK + depth / 2)
  creams.box(gw, 0.2, 0.04, cream, 0, top - 0.1, FRONT + 0.02)
  creams.box(gw, 0.02, depth, cream, 0, top - 0.2, BACK + depth / 2)
  for (const y of [top + 0.42, top + 0.85]) brasses.cyl(0.012, 0.012, gw, 10, brass, 0, y, postZ, ROT_Z90)
  for (const x of [-inner / 2, 0, inner / 2]) brasses.cyl(0.01, 0.01, 0.85, 8, brass, x, top + 0.425, postZ)

  // The ladder from the gallery into the hatch; the hatch a dark opening in a brass frame.
  const ladderZ = BACK + 0.42
  for (const s of [-1, 1]) woods.box(0.045, ROOM.h - top, 0.05, timber, s * 0.2, (ROOM.h + top) / 2, ladderZ)
  for (let r = 1; r <= 4; r++) woods.cyl(0.014, 0.014, 0.4, 8, timber, 0, top + r * 0.25, ladderZ, ROT_Z90)
  const hatchW = 0.72, hatchD = 0.5, hatchZ = BACK + 0.45
  for (const s of [-1, 1]) {
    brasses.box(hatchW + 0.06, 0.02, 0.03, brass, 0, ROOM.h - 0.01, hatchZ + s * (hatchD / 2 + 0.015))
    brasses.box(0.03, 0.02, hatchD, brass, s * (hatchW / 2 + 0.015), ROOM.h - 0.01, hatchZ)
  }
  olives.build(g, 'spandrels')
  creams.build(g, 'stair:paint')
  woods.build(g, 'stair:timber')
  rails.build(g, 'stair:rails')
  brasses.build(g, 'stair:brass')
  g.add(balusters(posts, cream))

  const dark = flatMesh(new THREE.PlaneGeometry(hatchW, hatchD), mat.flat(p.ink), 'hatch')
  dark.rotation.x = Math.PI / 2
  dark.position.set(0, ROOM.h - 0.004, hatchZ)
  g.add(dark)

  // THE LAMP ROOM, on the gallery fascia.
  const plate = namePlate(hs?.label ?? 'THE LAMP ROOM', p, 0.62, 0.12)
  plate.position.set(0, top - 0.1, FRONT + 0.042)
  g.add(plate)
  return g
}

// ───────────────────────────── The stair down: the well and its banister ─────────────────────────────

/** The stairwell from the Board Room: lined, the top treads going down, a nosing, the banister on three sides. */
function stairDown(ctx: BuildContext, hs: HotspotDef | undefined): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'stair:down'
  const { hx, z0, z1, deep } = WELL
  const wide = hx * 2, long = z1 - z0
  const cream = mat.lacquer(p.trim)
  const lining = mat.plaster(p.woodGrain)
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'landing:stair', repeat: [1, 1] })
  const railWood = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:rail', repeat: [4, 1] })
  const brass = mat.brass()

  const lin = new Merger(), woods = new Merger(), creams = new Merger(), rails = new Merger(), brasses = new Merger()
  lin.box(wide, deep, 0.02, lining, 0, -deep / 2, z0 - 0.01)
  lin.box(wide, deep, 0.02, lining, 0, -deep / 2, z1 + 0.01)
  for (const s of [-1, 1]) lin.box(0.02, deep, long, lining, s * (hx + 0.01), -deep / 2, (z0 + z1) / 2)
  // The arriving flight: it climbs toward the back, so its top treads step down toward the camera.
  const tRun = 0.25, tRise = 0.2
  for (let k = 1; k * tRun <= long - 0.04; k++) {
    woods.box(wide - 0.01, 0.035, tRun + 0.02, timber, 0, -k * tRise - 0.0175, z0 + (k - 0.5) * tRun)
    lin.box(wide - 0.01, tRise - 0.035, 0.02, lining, 0, -(k - 0.5) * tRise - 0.0175, z0 + (k - 1) * tRun + 0.01)
  }
  // Nosing: oak on three sides, brass on the step-off edge.
  woods.box(wide + 0.12, 0.03, 0.06, timber, 0, 0.015, z1 + 0.03)
  for (const s of [-1, 1]) woods.box(0.06, 0.03, long + 0.12, timber, s * (hx + 0.03), 0.015, (z0 + z1) / 2)
  brasses.box(wide, 0.012, 0.05, brass, 0, 0.006, z0 - 0.025)

  // The banister: newels at the four corners, the rail on three sides, turned balusters on the nosing.
  const nx = hx + 0.035, nzF = z1 + 0.035, nzB = z0 - 0.0
  for (const s of [-1, 1]) {
    for (const z of [nzF, nzB]) {
      creams.box(0.08, 1.0, 0.08, cream, s * nx, 0.5, z)
      creams.box(0.1, 0.04, 0.1, cream, s * nx, 0.98, z)
      brasses.sphere(0.04, brass, s * nx, 1.035, z)
    }
    rails.box(0.06, 0.05, nzF - nzB, railWood, s * nx, 0.935, (nzF + nzB) / 2)
  }
  rails.box(nx * 2, 0.05, 0.06, railWood, 0, 0.935, nzF)
  const posts: { x: number; y: number; z: number; len: number }[] = []
  for (let k = 0; k <= 8; k++) posts.push({ x: -0.52 + k * 0.13, y: 0.03, z: nzF, len: 0.88 })
  const n = 12
  for (const s of [-1, 1]) for (let k = 0; k <= n; k++) posts.push({ x: s * nx, y: 0.03, z: nzB + 0.1 + (k * (nzF - nzB - 0.2)) / n, len: 0.88 })

  lin.build(g, 'well:lining', false)
  woods.build(g, 'well:timber')
  creams.build(g, 'well:paint')
  rails.build(g, 'well:rails')
  brasses.build(g, 'well:brass')
  g.add(balusters(posts, cream))

  const bottom = flatMesh(new THREE.PlaneGeometry(wide, long), mat.flat(p.ink), 'well:dark')
  bottom.rotation.x = -Math.PI / 2
  bottom.position.set(0, -deep + 0.02, (z0 + z1) / 2)
  g.add(bottom)

  // THE BOARD ROOM, hung on the front rail.
  const plate = namePlate(hs?.label ?? 'THE BOARD ROOM', p, 0.46, 0.09)
  plate.position.set(0, 0.855, nzF + 0.045)
  g.add(plate)
  return g
}

// ───────────────────────────── The roster, the badges, the nail ─────────────────────────────

/** Badge silhouette: a shield `bw` wide and `bh` tall, origin at the top centre. */
const BADGE = { w: 0.1, h: 0.125, cells: 6, cellW: 170, cellH: 216, atlasW: 1024, atlasH: 256, top: 20 } as const
const RANKS = ['STATION MASTER', 'NAVIGATOR', 'KEEPER', 'QUARTERMASTER', 'TIDE WARDEN', 'RECORDER'] as const

function badgeShape(): THREE.Shape {
  const { w, h } = BADGE
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, -h * 0.58)
  s.quadraticCurveTo(w / 2, -h * 0.9, 0, -h)
  s.quadraticCurveTo(-w / 2, -h * 0.9, -w / 2, -h * 0.58)
  s.closePath()
  return s
}

/** The embroidered faces of the six badges in one atlas: teal felt, a stitched brass border, a rank emblem, the rank. */
function badgeAtlas(p: RegionPalette): THREE.MeshStandardMaterial {
  const { cellW, cellH, top } = BADGE
  const map = canvasTexture(BADGE.atlasW, BADGE.atlasH, (c) => {
    c.fillStyle = p.felt
    c.fillRect(0, 0, BADGE.atlasW, BADGE.atlasH)
    const rnd = seeded('landing:badges')
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = rgba(rnd() < 0.5 ? p.ink : p.paper, 0.06 + rnd() * 0.05)
      c.fillRect(rnd() * BADGE.atlasW, rnd() * BADGE.atlasH, 1, 1 + rnd() * 2)
    }
    for (let i = 0; i < BADGE.cells; i++) {
      const x0 = i * cellW, cx = x0 + cellW / 2
      const path = (inset: number): void => {
        const l = x0 + inset, r = x0 + cellW - inset, t = top + inset, b = top + cellH - inset
        c.beginPath()
        c.moveTo(l, t); c.lineTo(r, t); c.lineTo(r, t + (b - t) * 0.58)
        c.quadraticCurveTo(r, t + (b - t) * 0.9, (l + r) / 2, b)
        c.quadraticCurveTo(l, t + (b - t) * 0.9, l, t + (b - t) * 0.58)
        c.closePath()
      }
      c.setLineDash([7, 4])
      c.strokeStyle = p.brass
      c.lineWidth = 5
      path(10); c.stroke()
      c.setLineDash([])
      c.strokeStyle = p.paper
      c.fillStyle = p.paper
      c.lineWidth = 5
      c.lineCap = 'round'
      const ey = top + 82
      switch (i) {
        case 0: // Station Master: the lamp tower.
          c.beginPath(); c.moveTo(cx - 16, ey + 34); c.lineTo(cx - 9, ey - 16); c.lineTo(cx + 9, ey - 16); c.lineTo(cx + 16, ey + 34); c.closePath(); c.fill()
          c.fillStyle = p.accent; c.fillRect(cx - 11, ey - 30, 22, 13); c.fillStyle = p.paper
          c.beginPath(); c.moveTo(cx - 14, ey - 30); c.lineTo(cx, ey - 42); c.lineTo(cx + 14, ey - 30); c.closePath(); c.fill()
          break
        case 1: // Navigator: the rose.
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 - Math.PI / 2, rr = k % 2 === 0 ? 38 : 22
            c.beginPath(); c.moveTo(cx + Math.cos(a) * rr, ey + Math.sin(a) * rr)
            c.lineTo(cx + Math.cos(a + 0.4) * 7, ey + Math.sin(a + 0.4) * 7); c.lineTo(cx + Math.cos(a - 0.4) * 7, ey + Math.sin(a - 0.4) * 7); c.closePath(); c.fill()
          }
          c.fillStyle = p.accent; c.beginPath(); c.arc(cx, ey, 5, 0, Math.PI * 2); c.fill()
          break
        case 2: // Keeper: the lens, rays.
          c.beginPath(); c.arc(cx, ey, 15, 0, Math.PI * 2); c.stroke()
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            c.beginPath(); c.moveTo(cx + Math.cos(a) * 22, ey + Math.sin(a) * 22); c.lineTo(cx + Math.cos(a) * 36, ey + Math.sin(a) * 36); c.stroke()
          }
          break
        case 3: // Quartermaster: crossed keys.
          for (const sgn of [-1, 1]) {
            c.beginPath(); c.moveTo(cx - sgn * 26, ey - 26); c.lineTo(cx + sgn * 24, ey + 24); c.stroke()
            c.beginPath(); c.arc(cx - sgn * 30, ey - 30, 8, 0, Math.PI * 2); c.stroke()
            c.fillRect(cx + sgn * 16 - 4, ey + 16, 8, 12)
          }
          break
        case 4: // Tide Warden: three waves.
          for (let k = 0; k < 3; k++) {
            c.beginPath()
            for (let x = -34; x <= 34; x += 2) { const y = ey - 20 + k * 20 + Math.sin((x / 34) * Math.PI * 2) * 6; if (x === -34) c.moveTo(cx + x, y); else c.lineTo(cx + x, y) }
            c.stroke()
          }
          break
        default: // Recorder: the quill.
          c.beginPath(); c.moveTo(cx - 26, ey + 34); c.quadraticCurveTo(cx - 2, ey - 6, cx + 26, ey - 38); c.quadraticCurveTo(cx + 8, ey + 2, cx - 26, ey + 34); c.fill()
          c.fillStyle = p.accent; c.fillRect(cx - 30, ey + 32, 16, 5)
      }
      caps(c, RANKS[i], cx, top + 150, RANKS[i].length > 11 ? 13 : 16, p.paper, 600, 0.1)
      caps(c, 'HALYARD', cx, top + 172, 11, p.brass, 500, 0.18)
    }
  })
  return new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.004, roughness: 1, metalness: 0 })
}

/** One badge's geometry with its UVs mapped to atlas cell `i`; origin at the top centre. */
function badgeGeometry(i: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(badgeShape(), { depth: 0.004, bevelEnabled: false, curveSegments: 6 })
  const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv')
  const { w, h, cellW, cellH, atlasW, atlasH, top } = BADGE
  for (let k = 0; k < pos.count; k++) {
    const u = (pos.getX(k) + w / 2) / w, v = (pos.getY(k) + h) / h
    uv.setXY(k, (i * cellW + u * cellW) / atlasW, 1 - (top + (1 - v) * cellH) / atlasH)
  }
  geo.translate(0, 0, -0.002)
  return geo
}

/** The hook positions along the roster board, symmetric about x = 0. */
function hookX(i: number): number {
  return (i - 2.5) * 0.21
}

const ROSTER = { w: 1.3, h: 0.64, y: 1.55, hookY: 1.655 } as const

/** Cream lettering over the oak: the title, the Visitor pencilled, the six names over their hooks. */
function rosterLettering(p: RegionPalette): THREE.MeshStandardMaterial {
  const names = dressing.roster.names
  const map = canvasTexture(1024, 512, (c, w, h) => {
    const px = (x: number): number => (x / ROSTER.w + 0.5) * w
    const py = (y: number): number => (0.5 - (y - ROSTER.y) / ROSTER.h) * h
    caps(c, 'ROSTER', w / 2, py(1.815), 44, p.paper, 500, 0.3)
    c.strokeStyle = rgba(p.paper, 0.7)
    c.lineWidth = 2
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(w / 2 + s * 120, py(1.815)); c.lineTo(w / 2 + s * 330, py(1.815)); c.stroke() }
    c.font = `400 19px ${FONT_MONO}`
    c.fillStyle = rgba(p.paper, 0.72)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('Visitor: provisional.', w / 2, py(1.765))
    names.forEach((name, i) => caps(c, name, px(hookX(i)), py(1.71), 23, p.paper, 500, 0.12))
  }, true)
  return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
}

/** The roster board with its hooks, the five hanging badges (a child group) and the flaw on its nail. */
function roster(ctx: BuildContext): { group: THREE.Group; badges: THREE.Group; nail: THREE.Group } {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'roster'
  const { w, h, y } = ROSTER
  const oak = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'landing:oak', repeat: [2, 1] })
  const dark = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:rail', repeat: [4, 1] })
  const brass = mat.brass()
  const wall = BACK

  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), oak)
  board.position.set(0, y, wall + 0.015)
  board.castShadow = true
  board.receiveShadow = true
  g.add(board)
  const fm = new Merger()
  const f = 0.045
  fm.box(w + f * 2, f, 0.045, dark, 0, y + h / 2 + f / 2, wall + 0.0225)
  fm.box(w + f * 2, f, 0.045, dark, 0, y - h / 2 - f / 2, wall + 0.0225)
  for (const s of [-1, 1]) fm.box(f, h, 0.045, dark, s * (w / 2 + f / 2), y, wall + 0.0225)
  fm.box(w + f * 2 + 0.04, 0.02, 0.06, dark, 0, y + h / 2 + f + 0.01, wall + 0.03)
  fm.build(g, 'roster:frame')
  const letters = flatMesh(new THREE.PlaneGeometry(w, h), rosterLettering(p), 'roster:lettering')
  letters.position.set(0, y, wall + 0.0305)
  g.add(letters)

  // Six hooks: a brass backplate, an arm out from the board, an upturned tip.
  const hm = new Merger()
  const hookZ = wall + 0.03
  for (let i = 0; i < dressing.roster.hooks; i++) {
    const x = hookX(i)
    hm.box(0.026, 0.05, 0.006, brass, x, ROSTER.hookY, hookZ + 0.003)
    hm.cyl(0.0035, 0.0035, 0.045, 8, brass, x, ROSTER.hookY - 0.006, hookZ + 0.026, ROT_X90)
    hm.cyl(0.0035, 0.0035, 0.018, 8, brass, x, ROSTER.hookY + 0.002, hookZ + 0.048)
    hm.sphere(0.0055, brass, x, ROSTER.hookY + 0.012, hookZ + 0.048, 8)
  }
  hm.build(g, 'roster:hooks')

  // The five badges on their hooks, brass cord, hanging just proud of the board.
  const atlas = badgeAtlas(p)
  const badges = new THREE.Group()
  badges.name = 'badges'
  const bm = new Merger()
  const cords = new Merger()
  const cord = mat.flat(p.brass)
  const hang = 0.03
  for (let i = 0; i < dressing.roster.hooks; i++) {
    if (i === dressing.roster.emptyHook) continue
    const x = hookX(i), top = ROSTER.hookY - 0.012 - hang, z = hookZ + 0.042
    bm.add(badgeGeometry(i), atlas, x, top, z)
    const eye = new THREE.Vector3(x, ROSTER.hookY - 0.01, hookZ + 0.045)
    for (const s of [-1, 1]) cords.rod(eye, new THREE.Vector3(x + s * 0.036, top - 0.004, z), 0.0026, cord, 5)
  }
  bm.build(badges, 'badges:felt')
  cords.build(badges, 'badges:cord', false)
  g.add(badges)

  // Inventory plates, a pair on the lower rail.
  const hs1 = hsPlate('HS-0301', p, 0.1)
  hs1.position.set(-0.3, y - h / 2 - f / 2, wall + 0.0455)
  g.add(hs1)
  const hs2 = hsPlate('HS-0302', p, 0.1)
  hs2.position.set(0.3, y - h / 2 - f / 2, wall + 0.0455)
  g.add(hs2)

  // The flaw: the sixth badge on a nail below the board, on a raspberry string.
  const nail = new THREE.Group()
  nail.name = 'nail'
  const nx = hookX(dressing.roster.emptyHook), ny = y - h / 2 - f - 0.07
  const nm = new Merger()
  const iron = mat.lacquer(p.ink)
  nm.cyl(0.0022, 0.0022, 0.03, 6, iron, nx, ny, wall + 0.015, ROT_X90)
  nm.cyl(0.0055, 0.0055, 0.002, 10, iron, nx, ny, wall + 0.03, ROT_X90)
  nm.build(nail, 'nail:iron')
  const badge = new THREE.Mesh(badgeGeometry(dressing.roster.emptyHook), atlas)
  badge.name = 'badge:sixth'
  const bTop = ny - 0.04
  badge.position.set(nx, bTop, wall + 0.024)
  badge.rotation.set(0.03, 0, -0.07)
  badge.castShadow = true
  badge.receiveShadow = true
  nail.add(badge)
  const sm = new Merger()
  const eye = new THREE.Vector3(nx, ny - 0.003, wall + 0.026)
  const corner = (s: number): THREE.Vector3 => new THREE.Vector3(s * BADGE.w * 0.36, -0.004, 0).applyEuler(badge.rotation).add(badge.position)
  for (const s of [-1, 1]) sm.rod(eye, corner(s), 0.0028, mat.flat(p.accent), 5)
  sm.build(nail, 'nail:string', false)
  return { group: g, badges, nail }
}

// ───────────────────────────── The photograph ─────────────────────────────

/** The 1959 print, painted sepia: sea, a jetty, nine silhouettes in a row; Ida, aged six, looks off left. Nothing written. */
function photographTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(512, 224, (c, w, h) => {
    const rnd = seeded('landing:photograph')
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    c.fillStyle = rgba(p.brass, 0.42)
    c.fillRect(0, 0, w, h)
    const sky = c.createLinearGradient(0, 0, 0, 118)
    sky.addColorStop(0, rgba(p.ink, 0.16))
    sky.addColorStop(1, rgba(p.paper, 0.25))
    c.fillStyle = sky
    c.fillRect(0, 0, w, 118)
    c.fillStyle = rgba(p.ink, 0.28)
    c.fillRect(0, 118, w, 44)
    c.fillStyle = rgba(p.paper, 0.18)
    for (let i = 0; i < 40; i++) c.fillRect(rnd() * w, 122 + rnd() * 36, 8 + rnd() * 20, 1)
    // Low headland on the horizon, left.
    c.fillStyle = rgba(p.ink, 0.22)
    c.beginPath(); c.moveTo(0, 118); c.lineTo(0, 104); c.quadraticCurveTo(60, 96, 130, 112); c.lineTo(150, 118); c.closePath(); c.fill()
    // The jetty's boards.
    c.fillStyle = rgba(p.ink, 0.42)
    c.fillRect(0, 162, w, h - 162)
    c.strokeStyle = rgba(p.paper, 0.12)
    for (let x = -40; x < w + 40; x += 22) { c.beginPath(); c.moveTo(x, 162); c.lineTo(x + (x - w / 2) * 0.3, h); c.stroke() }

    // Nine figures: Tuck, Lisle, Brace, M. Hardy, A. Hardy, I. Hardy (6), Ferrier, and two of the unit.
    type Fig = { h: number; broad: number; hat?: 'souwester' | 'cap' | 'none'; dress?: boolean; child?: boolean; lookLeft?: boolean }
    const figs: Fig[] = [
      { h: 116, broad: 1.08, hat: 'souwester' },
      { h: 120, broad: 1.2 },
      { h: 112, broad: 0.92 },
      { h: 108, broad: 0.9, dress: true },
      { h: 126, broad: 1.0 },
      { h: 70, broad: 0.8, child: true, lookLeft: true },
      { h: 110, broad: 1.0, hat: 'cap' },
      { h: 118, broad: 1.0, hat: 'cap' },
      { h: 121, broad: 1.02, hat: 'cap' },
    ]
    const ground = 196
    const tone = rgba(p.ink, 0.8)
    figs.forEach((f, i) => {
      const x = 54 + i * 50.5
      const head = f.h * (f.child ? 0.095 : 0.07)
      const sh = f.h * 0.13 * f.broad
      const neck = ground - f.h + head * 2
      c.fillStyle = tone
      if (f.dress) {
        c.beginPath(); c.moveTo(x - sh * 0.8, neck + 4); c.lineTo(x + sh * 0.8, neck + 4); c.lineTo(x + sh * 1.15, ground - f.h * 0.2); c.lineTo(x - sh * 1.15, ground - f.h * 0.2); c.closePath(); c.fill()
        c.fillRect(x - sh * 0.45, ground - f.h * 0.2, sh * 0.25, f.h * 0.2)
        c.fillRect(x + sh * 0.2, ground - f.h * 0.2, sh * 0.25, f.h * 0.2)
      } else {
        c.beginPath(); c.moveTo(x - sh, neck + 4); c.lineTo(x + sh, neck + 4); c.lineTo(x + sh * 0.8, ground - f.h * 0.46); c.lineTo(x - sh * 0.8, ground - f.h * 0.46); c.closePath(); c.fill()
        c.fillRect(x - sh * 0.72, ground - f.h * 0.47, sh * 0.62, f.h * 0.47)
        c.fillRect(x + sh * 0.1, ground - f.h * 0.47, sh * 0.62, f.h * 0.47)
      }
      // Arms at the sides; nobody looks at anyone else.
      c.fillRect(x - sh - 3, neck + 6, 5, f.h * 0.36)
      c.fillRect(x + sh - 2, neck + 6, 5, f.h * 0.36)
      c.beginPath(); c.ellipse(x, neck - head, head * 0.9, head, 0, 0, Math.PI * 2); c.fill()
      if (f.lookLeft) { c.beginPath(); c.moveTo(x - head * 0.8, neck - head * 1.1); c.lineTo(x - head * 1.35, neck - head * 0.85); c.lineTo(x - head * 0.8, neck - head * 0.6); c.closePath(); c.fill() }
      if (f.hat === 'souwester') { c.beginPath(); c.ellipse(x, neck - head * 1.5, head * 1.7, head * 0.45, 0, 0, Math.PI * 2); c.fill() }
      if (f.hat === 'cap') { c.fillRect(x - head * 1.0, neck - head * 2.05, head * 2.0, head * 0.6); c.fillRect(x - head * 0.2, neck - head * 1.55, head * 1.5, head * 0.22) }
      // Contact shadow on the boards.
      c.fillStyle = rgba(p.ink, 0.3)
      c.beginPath(); c.ellipse(x + 6, ground + 2, sh * 1.2, 3, 0, 0, Math.PI * 2); c.fill()
    })
    // Emulsion grain, a soft vignette, silvering at the edges.
    for (let i = 0; i < 5000; i++) {
      c.fillStyle = rgba(rnd() < 0.5 ? p.ink : p.paper, 0.07)
      c.fillRect(rnd() * w, rnd() * h, 1, 1)
    }
    const v = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.6)
    v.addColorStop(0, rgba(p.ink, 0))
    v.addColorStop(1, rgba(p.ink, 0.38))
    c.fillStyle = v
    c.fillRect(0, 0, w, h)
    c.strokeStyle = rgba(p.paper, 0.7)
    c.lineWidth = 6
    c.strokeRect(0, 0, w, h)
  })
}

/** The group photograph in a dark frame with a cream mount, on two short brass cords from the gallery. */
function photograph(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'photograph'
  const w = 1.0, h = 0.5, y = 2.42, f = 0.04, wall = BACK
  const dark = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:rail', repeat: [4, 1] })
  const fm = new Merger()
  fm.box(w, f, 0.035, dark, 0, y + h / 2 - f / 2, wall + 0.0175)
  fm.box(w, f, 0.035, dark, 0, y - h / 2 + f / 2, wall + 0.0175)
  for (const s of [-1, 1]) fm.box(f, h - f * 2, 0.035, dark, s * (w / 2 - f / 2), y, wall + 0.0175)
  fm.build(g, 'photograph:frame')
  const mount = new THREE.Mesh(new THREE.BoxGeometry(w - f * 2, h - f * 2, 0.01), mat.paper(p.paper))
  mount.position.set(0, y, wall + 0.012)
  mount.receiveShadow = true
  g.add(mount)
  const print = flatMesh(new THREE.PlaneGeometry(0.74, 0.324), new THREE.MeshStandardMaterial({ map: photographTexture(p), roughness: 0.55, metalness: 0 }), 'photograph:print')
  print.position.set(0, y + 0.01, wall + 0.018)
  g.add(print)
  const cm = new Merger()
  for (const s of [-1, 1]) cm.cyl(0.0025, 0.0025, FLIGHT.top - 0.2 - (y + h / 2), 6, mat.brass(), s * (w / 2 - 0.08), (FLIGHT.top - 0.2 + y + h / 2) / 2, wall + 0.02)
  cm.build(g, 'photograph:cords', false)
  const hs = hsPlate('HS-0304', p, 0.09)
  hs.position.set(0, y - h / 2 + f / 2, wall + 0.0355)
  g.add(hs)
  return g
}

// ───────────────────────────── The wireless cupboard ─────────────────────────────

/** The tuning dial's paper face: a long-wave arc, graduations, a red index. */
function dialTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    foxing(c, w, h, p, seeded('landing:dial'), 60)
    const cx = w / 2, cy = h / 2 + 18, r = w * 0.38
    c.strokeStyle = p.ink
    c.lineWidth = 2
    c.beginPath(); c.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
    const labels = ['150', '200', '250', '300', '350']
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * 1.1 + (Math.PI * 0.8 * i) / 20
      const long = i % 5 === 0
      c.lineWidth = long ? 2.4 : 1.2
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * (r - (long ? 16 : 9)), cy + Math.sin(a) * (r - (long ? 16 : 9))); c.stroke()
      if (long) caps(c, labels[i / 5], cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32), 15, p.ink, 500, 0.04)
    }
    caps(c, 'LONG WAVE', cx, cy - 18, 13, p.ink, 500, 0.18)
    caps(c, 'KC/S', cx, cy + 4, 11, p.ink, 500, 0.18)
    c.fillStyle = p.accent
    c.beginPath(); c.arc(cx + Math.cos(Math.PI * 1.62) * (r + 8), cy + Math.sin(Math.PI * 1.62) * (r + 8), 4, 0, Math.PI * 2); c.fill()
  })
}

/** Woven grille cloth over the speaker. */
function grilleMaterial(p: RegionPalette): THREE.MeshStandardMaterial {
  const map = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = p.wall
    c.fillRect(0, 0, w, h)
    c.fillStyle = rgba(p.ink, 0.28)
    c.fillRect(0, 0, w, h)
    for (let i = 0; i < w; i += 3) {
      c.fillStyle = rgba(i % 6 === 0 ? p.paper : p.ink, 0.14)
      c.fillRect(i, 0, 1, h)
      c.fillRect(0, i, w, 1)
    }
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(2, 2)
  return new THREE.MeshStandardMaterial({ map, bumpMap: bumpOf(map), bumpScale: 0.004, roughness: 1, metalness: 0 })
}

/** The wireless cupboard under the stair: walnut on an ink plinth, grille cloth either side of the dial, two doors, the bulletin card above. */
function wirelessCupboard(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'wireless'
  const W = 0.86, D = 0.42, plinth = 0.06, H = 0.935
  const zc = BACK + D / 2, front = BACK + D
  const walnut = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:walnut', repeat: [1, 1] })
  const ink = mat.lacquer(p.ink)
  const brass = mat.brass()
  const m = new Merger()
  m.box(W - 0.04, plinth, D - 0.03, ink, 0, plinth / 2, zc - 0.01)
  m.box(W, H - plinth - 0.03, D, walnut, 0, plinth + (H - plinth - 0.03) / 2, zc)
  m.box(W + 0.04, 0.03, D + 0.03, walnut, 0, H - 0.015, zc + 0.01)
  // Two panelled doors below; the rail; the fascia with fret bars over the cloth.
  for (const s of [-1, 1]) {
    m.box(W / 2 - 0.05, 0.34, 0.02, walnut, s * (W / 4), 0.28, front + 0.01)
    m.box(W / 2 - 0.15, 0.24, 0.01, walnut, s * (W / 4), 0.28, front + 0.024)
    for (let k = -1; k <= 1; k++) m.box(0.012, 0.25, 0.012, walnut, s * 0.25 + k * 0.075, 0.71, front + 0.012)
    m.box(0.29, 0.014, 0.014, walnut, s * 0.25, 0.71 + 0.13, front + 0.012)
    m.box(0.29, 0.014, 0.014, walnut, s * 0.25, 0.71 - 0.13, front + 0.012)
  }
  m.box(W - 0.02, 0.03, 0.014, walnut, 0, 0.475, front + 0.007)
  m.build(g, 'wireless:case')
  const grille = new Merger()
  const cloth = grilleMaterial(p)
  for (const s of [-1, 1]) grille.add(new THREE.PlaneGeometry(0.28, 0.26), cloth, s * 0.25, 0.71, front + 0.003)
  grille.build(g, 'wireless:cloth', false)

  const bm = new Merger()
  bm.add(new THREE.TorusGeometry(0.1, 0.009, 8, 40), brass, 0, 0.71, front + 0.008)
  for (const s of [-1, 1]) {
    bm.cyl(0.02, 0.022, 0.02, 20, brass, s * 0.09, 0.545, front + 0.012, ROT_X90)
    bm.sphere(0.012, brass, s * 0.07, 0.28, front + 0.034, 10)
  }
  bm.cyl(0.003, 0.003, 0.012, 6, brass, 0, 0.71, front + 0.012, ROT_X90)
  bm.build(g, 'wireless:brass')
  const face = flatMesh(new THREE.CircleGeometry(0.094, 40), new THREE.MeshStandardMaterial({ map: dialTexture(p), roughness: 0.7, metalness: 0 }), 'wireless:dial')
  face.position.set(0, 0.71, front + 0.004)
  g.add(face)
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.08, 0.002), ink)
  needle.geometry.translate(0, 0.036, 0)
  needle.position.set(0, 0.695, front + 0.008)
  needle.rotation.z = -0.38
  g.add(needle)

  const hs = hsPlate('HS-0308', p, 0.09)
  hs.position.set(0, 0.475, front + 0.0145)
  g.add(hs)
  // The bulletin card pinned to the wall above.
  const card = placard({ lines: ['BULLETIN 05:20 AND 17:50.', 'DO NOT TOUCH THE DIAL.'], width: 0.24, height: 0.07, bg: p.paper, color: p.ink, border: p.ink, font: 'mono' })
  card.name = 'wireless:card'
  card.position.set(0, 1.07, BACK + 0.003)
  g.add(card)
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 6), brass)
  pin.position.set(0, 1.095, BACK + 0.006)
  g.add(pin)
  return g
}

// ───────────────────────────── The frames on the side walls ─────────────────────────────

/** The twelve Standing Orders on a 1024² sheet: printed 1 to 11, Order 12 typed on a pasted slip in the bent `e`. */
function ordersTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    foxing(c, w, h, p, seeded('landing:orders'), 4200)
    c.strokeStyle = p.ink
    c.lineWidth = 4
    c.strokeRect(40, 40, w - 80, h - 80)
    c.lineWidth = 1.5
    c.strokeRect(54, 54, w - 108, h - 108)
    caps(c, dressing.ordersTitle, w / 2, 122, 46, p.ink, 500, 0.18)
    caps(c, 'HALYARD ISLAND HYDROGRAPHIC STATION  ·  1931', w / 2, 176, 18, p.ink, 500, 0.12)
    c.lineWidth = 1.5
    c.beginPath(); c.moveTo(w / 2 - 190, 204); c.lineTo(w / 2 + 190, 204); c.stroke()

    const size = 25, lh = 32, left = 120, textX = 176, width = w - textX - 110
    let y = 262
    for (const o of dressing.orders) {
      if (o.typed) continue
      c.font = `400 ${size}px ${FONT_SANS}`
      c.fillStyle = p.ink
      c.textAlign = 'left'
      c.textBaseline = 'alphabetic'
      c.fillText(`${o.number}.`, left, y)
      for (const line of wrap(c, o.text, width)) { c.fillText(line, textX, y); y += lh }
      y += 14
    }
    // Order 12: a slip typed on the Olivetti and pasted under the rest, a shade whiter, a pin at each end.
    const slip = dressing.orders.find((o) => o.typed)
    if (slip) {
      const sy = y + 4, sh = 74
      c.fillStyle = rgba(p.ink, 0.12)
      c.fillRect(left - 16 + 4, sy + 4, w - 2 * left + 32, sh)
      c.fillStyle = tokens['paper.white']
      c.fillRect(left - 16, sy, w - 2 * left + 32, sh)
      foxing(c, w - 2 * left + 32, sh, p, seeded('landing:slip'), 50)
      typed(c, `${slip.number}. ${slip.text}`, left, sy + 46, 26, p.ink, true)
      c.fillStyle = p.accent
      for (const x of [left - 4, w - left + 4]) { c.beginPath(); c.arc(x, sy + 12, 5, 0, Math.PI * 2); c.fill() }
    }
  })
}

/** The station drawn in section: the lamp room on its tower, three storeys three rooms wide, the rock rooms, the sea. */
function sectionTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    foxing(c, w, h, p, seeded('landing:section'), 900)
    c.strokeStyle = p.ink
    c.lineWidth = 3
    c.strokeRect(22, 22, w - 44, h - 44)
    c.lineWidth = 1
    c.strokeRect(30, 30, w - 60, h - 60)
    caps(c, 'THE STATION IN SECTION', w / 2, 60, 20, p.ink, 500, 0.18)
    caps(c, 'HALYARD ISLAND  ·  1931', w / 2, 84, 11, p.ink, 500, 0.14)
    const rw = 92, rh = 58, x0 = w / 2 - rw * 1.5, yFirst = 200
    // Rock under the lower rooms, hatched; the sea either side.
    const rockTop = yFirst + rh * 2
    c.save()
    c.beginPath(); c.moveTo(40, rockTop + 20); c.lineTo(x0 - 12, rockTop); c.lineTo(x0 + rw * 3 + 12, rockTop); c.lineTo(w - 40, rockTop + 24); c.lineTo(w - 40, h - 40); c.lineTo(40, h - 40); c.closePath()
    c.clip()
    c.strokeStyle = rgba(p.ink, 0.4)
    for (let k = -h; k < w; k += 9) { c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke() }
    c.restore()
    c.strokeStyle = p.accent2
    c.lineWidth = 1.5
    for (let row = 0; row < 3; row++) {
      for (const side of [0, 1]) {
        c.beginPath()
        const xs = side === 0 ? 40 : x0 + rw * 3 + 16, xe = side === 0 ? x0 - 16 : w - 40
        for (let x = xs; x <= xe; x += 3) { const y = rockTop + 44 + row * 14 + Math.sin(x * 0.18) * 2.5; if (x === xs) c.moveTo(x, y); else c.lineTo(x, y) }
        c.stroke()
      }
    }
    // The rooms.
    c.strokeStyle = p.ink
    c.fillStyle = p.paper
    c.lineWidth = 2
    const cells: [number, number, string][] = [
      [0, 0, '5'], [1, 0, '4'], [2, 0, '6'],
      [0, 1, '2'], [1, 1, '1'], [2, 1, '3'],
      [0, 2, '8'], [2, 2, '9'],
    ]
    for (const [col, row, n] of cells) {
      const x = x0 + col * rw, y = yFirst + row * rh
      c.fillRect(x, y, rw, rh)
      c.strokeRect(x, y, rw, rh)
      caps(c, n, x + rw / 2, y + rh / 2, 14, p.ink, 500, 0)
    }
    // The stair shaft down the middle, and the flights.
    c.strokeRect(x0 + rw + 30, yFirst + rh * 2, rw - 60, rh)
    c.lineWidth = 1
    for (let row = 0; row < 3; row++) {
      const x = x0 + rw, y = yFirst + row * rh
      c.beginPath(); c.moveTo(x + 30, y + rh); c.lineTo(x + rw - 30, y + 6); c.stroke()
    }
    // The lamp room on its short tower, the lantern glazed, the red lamp one dot.
    const tx = w / 2
    c.lineWidth = 2
    c.strokeRect(tx - 26, yFirst - 44, 52, 44)
    c.beginPath(); c.moveTo(tx - 40, yFirst - 44); c.lineTo(tx + 40, yFirst - 44); c.stroke()
    c.beginPath(); c.moveTo(tx - 30, yFirst - 44); c.lineTo(tx - 30, yFirst - 84); c.lineTo(tx + 30, yFirst - 84); c.lineTo(tx + 30, yFirst - 44); c.stroke()
    c.beginPath(); c.moveTo(tx - 34, yFirst - 84); c.lineTo(tx, yFirst - 104); c.lineTo(tx + 34, yFirst - 84); c.stroke()
    c.lineWidth = 1
    for (const x of [-15, 0, 15]) { c.beginPath(); c.moveTo(tx + x, yFirst - 84); c.lineTo(tx + x, yFirst - 44); c.stroke() }
    c.fillStyle = p.accent
    c.beginPath(); c.arc(tx, yFirst - 64, 3.5, 0, Math.PI * 2); c.fill()
    caps(c, '7', tx + 46, yFirst - 64, 12, p.ink, 500, 0)
    // Scale bar.
    c.fillStyle = p.ink
    for (let k = 0; k < 5; k++) if (k % 2 === 0) c.fillRect(60 + k * 18, h - 64, 18, 4)
    c.strokeRect(60, h - 64, 90, 4)
    caps(c, '10 M', 170, h - 62, 9, p.ink, 500, 0.1)
  })
}

/** A square dark frame on a side wall (back at z = 0) with a cream mount and a sheet; the same frame for both walls. */
function wallFrame(ctx: BuildContext, name: string, sheet: THREE.CanvasTexture, plateText: string): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = name
  const s = 0.86, y = 1.62, f = 0.045
  const dark = mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'landing:rail', repeat: [4, 1] })
  const fm = new Merger()
  fm.box(s, f, 0.04, dark, 0, y + s / 2 - f / 2, 0.02)
  fm.box(s, f, 0.04, dark, 0, y - s / 2 + f / 2, 0.02)
  for (const k of [-1, 1]) fm.box(f, s - f * 2, 0.04, dark, k * (s / 2 - f / 2), y, 0.02)
  fm.build(g, `${name}:frame`)
  const mount = new THREE.Mesh(new THREE.BoxGeometry(s - f * 2, s - f * 2, 0.01), mat.paper(p.paper))
  mount.position.set(0, y, 0.012)
  mount.receiveShadow = true
  g.add(mount)
  const paper = flatMesh(new THREE.PlaneGeometry(0.68, 0.68), new THREE.MeshStandardMaterial({ map: sheet, roughness: 0.85, metalness: 0 }), `${name}:sheet`)
  paper.position.set(0, y, 0.0175)
  g.add(paper)
  const plate = hsPlate(plateText, p, 0.11)
  plate.position.set(0, y - s / 2 - 0.05, 0.003)
  g.add(plate)
  return g
}

// ───────────────────────────── Doors ─────────────────────────────

/**
 * A cased doorway (back at z = 0, facing +z) with its olive leaf closed, a brass plate on the upper
 * panel and the destination on a paper plate above. `knob` is the side (±1 in local x) of the knob.
 */
function doorway(hs: HotspotDef, ctx: BuildContext, knob: -1 | 1, leafPlate: string[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const { w, h } = DOOR
  const jamb = 0.1, d = 0.14
  const trim = mat.lacquer(p.trim)
  const m = new Merger()
  for (const s of [-1, 1]) m.box(jamb, h, d, trim, s * (w / 2 + jamb / 2), h / 2, d / 2)
  m.box(w + jamb * 2, jamb, d, trim, 0, h + jamb / 2, d / 2)
  m.box(w + jamb * 2 + 0.12, 0.06, 0.03, trim, 0, h + jamb + 0.03, d + 0.015)
  m.build(g, 'door:case')
  const lw = w - 0.01, lh = h - 0.01, t = 0.045, lz = 0.05
  const paint = mat.lacquer(p.wallAlt)
  const lm = new Merger()
  lm.box(lw, lh, t, paint, 0, lh / 2, lz)
  const panelW = lw - 0.24, upper = lh * 0.42, lower = lh * 0.3
  lm.box(panelW, upper, 0.012, paint, 0, lh - 0.14 - upper / 2, lz + t / 2 + 0.006)
  lm.box(panelW, lower, 0.012, paint, 0, 0.14 + lower / 2, lz + t / 2 + 0.006)
  lm.build(g, 'door:leaf')
  const bm = new Merger()
  const brass = mat.brass()
  const kx = knob * (lw / 2 - 0.08)
  bm.sphere(0.022, brass, kx, 1.0, lz + t / 2 + 0.03)
  bm.cyl(0.008, 0.008, 0.03, 8, brass, kx, 1.0, lz + t / 2 + 0.012, ROT_X90)
  bm.box(0.034, 0.1, 0.006, brass, kx, 1.0, lz + t / 2 + 0.003)
  bm.box(0.012, 0.03, 0.004, brass, kx, 0.9, lz + t / 2 + 0.003)
  for (const y of [0.25, lh / 2, lh - 0.25]) bm.box(0.014, 0.09, 0.012, brass, -knob * (lw / 2 - 0.004), y, lz + t / 2)
  bm.box(w, 0.012, d, brass, 0, 0.006, d / 2)
  bm.build(g, 'door:brass')
  const plate = placard({ lines: leafPlate, width: 0.46, height: 0.12, bg: p.brass, color: p.ink, border: p.ink })
  plate.name = `plate:${leafPlate[0]}`
  plate.position.set(0, lh - 0.14 - upper / 2, lz + t / 2 + 0.0135)
  g.add(plate)
  const name = namePlate(hs.label, p, 0.74, 0.13)
  name.position.set(0, h + jamb + 0.26, 0.03)
  g.add(name)
  return g
}

// ───────────────────────────── Lamps ─────────────────────────────

/** A brass pendant with an olive enamel shade and a warm bulb; the one kind of light the builder adds. */
function pendant(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'pendant'
  const brass = mat.brass()
  const top = ROOM.h, y = 3.1
  const m = new Merger()
  m.cyl(0.06, 0.06, 0.02, 24, mat.plaster(p.trim), 0, top - 0.01, 0)
  m.cyl(0.005, 0.005, top - y - 0.02, 6, brass, 0, (top + y) / 2, 0)
  m.cyl(0.03, 0.02, 0.05, 16, brass, 0, y + 0.02, 0)
  m.build(g, 'pendant:brass')
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.17, 0.15, 36, 1, true), new THREE.MeshStandardMaterial({ color: p.wallAlt, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide }))
  shade.position.y = y - 0.075
  shade.castShadow = false
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshStandardMaterial({ color: p.light, emissive: p.light, emissiveIntensity: 1.0, roughness: 0.9, metalness: 0 }))
  bulb.position.y = y - 0.1
  g.add(bulb)
  const light = new THREE.PointLight(new THREE.Color(p.light), 2.4, 6.5, 2)
  light.position.y = y - 0.14
  light.castShadow = false
  g.add(light)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/** Builds the Landing: the well and its banister, the flights and gallery, the niche with the wireless, the roster and the photograph, the doors, the Orders and the section. */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const { w } = ROOM
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const hs = (id: string): HotspotDef | undefined => ctx.def.hotspots.find((h) => h.id === id)
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }

  const room = shell(ctx)
  group.add(room)

  // The stair: arriving from below at centre, continuing up at the back to the Lamp Room.
  const down = stairDown(ctx, hs('landing.stair.down'))
  group.add(down)
  register('landing.stair.down', down)
  const up = stairUp(ctx, hs('landing.stair.up'))
  group.add(up)
  register('landing.stair.up', up)

  // The niche under the gallery: the wireless on the floor, the roster dead centre, the photograph above.
  const wireless = wirelessCupboard(ctx)
  group.add(wireless)
  register('landing.wireless', wireless)
  const board = roster(ctx)
  group.add(board.group)
  register('landing.roster', board.group)
  register('landing.badges', board.badges)
  group.add(board.nail)
  register('landing.nail', board.nail)
  const photo = photograph(ctx)
  group.add(photo)
  register('landing.photograph', photo)

  // A door either side; the Orders on the left wall, the station in section on the right, the same frame.
  const doors: [string, -1 | 1, string[]][] = [
    ['landing.door.recorders', -1, ['HS-0400 · RECORDER']],
    ['landing.door.quarters', 1, ['HS-0500 · QUARTERS', '"MADE UP. STANDING ORDER 12."']],
  ]
  for (const [id, s, leafPlate] of doors) {
    const def = hs(id)
    if (!def) continue
    // Local +x on the left wall runs toward the back, on the right toward the front: the knob is at the front on both.
    const door = doorway(def, ctx, s < 0 ? -1 : 1, leafPlate)
    door.position.set(s * (w / 2), 0, DOOR.z)
    door.rotation.y = -s * (Math.PI / 2)
    group.add(door)
    register(id, door)
  }
  const orders = wallFrame(ctx, 'orders', ordersTexture(p), 'HS-0306')
  orders.position.set(-w / 2, 0, PANEL_Z)
  orders.rotation.y = Math.PI / 2
  group.add(orders)
  register('landing.orders', orders)
  const section = wallFrame(ctx, 'section', sectionTexture(p), hs('landing.section')?.label ?? 'SECTION')
  section.position.set(w / 2, 0, PANEL_Z)
  section.rotation.y = -Math.PI / 2
  group.add(section)
  register('landing.section', section)

  // Two pendants, in front of the flights.
  for (const s of [-1, 1]) {
    const lamp = pendant(ctx)
    lamp.position.set(s * 1.6, 0, 0.6)
    group.add(lamp)
  }

  // Every hotspot the definition names has an object; any not built above gets a small paper plate on the floor.
  for (const def of ctx.def.hotspots) {
    if (out.hotspots.has(def.id)) continue
    const plate = placard({ lines: [def.label], width: 0.3, height: 0.08, bg: p.paper, color: p.ink, border: p.ink })
    plate.rotation.x = -Math.PI / 2
    plate.position.set(0, 0.004, -0.2)
    group.add(plate)
    register(def.id, plate)
  }

  // The shell never moves: freeze its matrices.
  room.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false })
  return out
}
