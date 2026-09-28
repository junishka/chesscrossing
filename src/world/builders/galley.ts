// Frame 3: The Galley (ground, right). docs/BIBLE.md §6 Frame 3, palette §3.2.
// The range centred against the back wall: black iron, two cream enamel oven doors, the firebox between
// them, its flue straight up the tiled splashback; seven copper pans on a brass rail above it, largest at
// the centre and descending in pairs; the tea caddy alone on the warming shelf. A dresser each side, twenty
// labelled tins on each (forty-one with the caddy). A long scrubbed table across the foreground, Bertram
// Lisle seated behind it at the centre: the inventory book open before him, the ration card propped
// against the brown teapot. The nailed crate on the floor right, the coal box its mirror on the left.
// The door to the Board Room in the left wall; the stair down to the Boathouse behind its twin in the right.
// The one flaw: on the right dresser, third shelf, one tin is turned label-in.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import type { RegionPalette } from '../../content/palette'
import { dressing } from '../../content/frames/galley'
import { FONT_MONO, FONT_SANS } from '../../core/fonts'
import { clock, ease } from '../../core/clock'
import { mat, plasterTexture, seeded, tileTexture } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { floor as floorProp } from '../props'
import { figure } from '../figures'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres (open toward +z, back wall at z = −d/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
/** The two side-wall openings (the Board Room door, the stair head): size and distance along z. */
const DOOR = { w: 1.0, h: 2.2, z: -1.35 } as const
/** The long scrubbed table across the foreground. */
const TABLE = { l: 3.0, w: 0.85, h: 0.78, z: 0.95 } as const
/** The range against the back wall. */
const RANGE = { w: 1.7, d: 0.64, hob: 0.86 } as const
/** Height of the warming shelf over the range (top surface). */
const SHELF_Y = 1.4
/** Tins per shelf and shelves per dresser. */
const TIN_COLS = 5, TIN_ROWS = 4
/** Where the flaw sits on the right dresser (row from the bottom, column from the left). */
const TURNED_SLOT = { row: 2, col: 1 } as const
/** Atlas grid for the forty-one labels. */
const ATLAS = { cols: 8, rows: 6, cw: 256, ch: 128 } as const

// ───────────────────────────── Colour helpers ─────────────────────────────

/** `#rrggbb` of a colour scaled by `k`. */
function shade(hex: string, k: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()
}

/** `#rrggbb` part way from `a` to `b` (both palette colours, so the result stays under S 0.62). */
function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}

/** A palette hex with alpha, for canvas painting. */
function rgba(hex: string, alpha: number): string {
  const c = new THREE.Color(hex)
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`
}

/** A canvas painted once, wrapped as an sRGB texture. */
function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext('2d')
  if (!c) throw new Error('2D canvas unavailable')
  paint(c, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Letterspaced capitals (Jost) or typed lines (Courier Prime) on a canvas. */
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, o: { mono?: boolean; weight?: number; spacing?: number; align?: CanvasTextAlign } = {}): void {
  c.font = `${o.weight ?? (o.mono ? 400 : 500)} ${size}px ${o.mono ? FONT_MONO : FONT_SANS}`
  c.fillStyle = color
  c.textAlign = o.align ?? 'center'
  c.textBaseline = 'middle'
  const spaced = c as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in spaced) spaced.letterSpacing = `${(o.spacing ?? (o.mono ? 0 : 0.14)) * size}px`
  c.fillText(o.mono ? s : s.toUpperCase(), x, y)
  if ('letterSpacing' in spaced) spaced.letterSpacing = '0px'
}

/** Paper fibre and a little foxing, painted over a filled card. */
function fibre(c: CanvasRenderingContext2D, w: number, h: number, p: RegionPalette, rnd: () => number, n = 600): void {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rgba(rnd() < 0.5 ? p.ink : p.brass, 0.03 + rnd() * 0.05)
    c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1)
  }
  for (let i = 0; i < n / 60; i++) {
    c.fillStyle = rgba(p.brass, 0.1 + rnd() * 0.12)
    c.beginPath(); c.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.4, 0, Math.PI * 2); c.fill()
  }
}

// ───────────────────────────── Merged geometry kit ─────────────────────────────

/** Collects parts per material and flushes one mesh per material: one draw call each. */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1)))
    const list = this.parts.get(m) ?? []
    list.push(g)
    this.parts.set(m, list)
  }

  box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rot)
  }

  cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16, rot?: THREE.Euler): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, rot)
  }

  /** A rod along x. */
  rodX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): void {
    this.cyl(r, r, len, m, x, y, z, seg, new THREE.Euler(0, 0, Math.PI / 2))
  }

  /** A rod along z. */
  rodZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): void {
    this.cyl(r, r, len, m, x, y, z, seg, new THREE.Euler(Math.PI / 2, 0, 0))
  }

  sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): void {
    this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), m, x, y, z)
  }

  torus(r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, arc = Math.PI * 2, seg = 24): void {
    this.add(new THREE.TorusGeometry(r, tube, 8, seg, arc), m, x, y, z, rot)
  }

  lathe(profile: [number, number][], m: THREE.Material, x = 0, y = 0, z = 0, seg = 24, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    this.add(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z, rot, scale)
  }

  /** One mesh per material into `into`; returns the meshes. */
  flush(into: THREE.Object3D, name: string, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, m)
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

// ───────────────────────────── Local materials ─────────────────────────────

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Mustard distemper, chalky, with the wear pass painted in once (§3.5): corner grime as a multiply of
 * `1 − 0.10·smoothstep(0.75, 1, r)`, a scuff band 350 mm up at −4 percent over the span of u beside a door,
 * a vertical brush in the distemper, and a paler chalk bloom where the wall is rubbed.
 */
function distemper(color: string, seed: string, wallHeight: number, scuff?: [number, number]): THREE.MeshStandardMaterial {
  const src = plasterTexture(color, seed).image as HTMLCanvasElement
  const size = src.width
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) throw new Error('2D canvas unavailable')
  c.drawImage(src, 0, 0)
  // Brush strokes: 24 to 48 px long, 2 to 3 px wide, alpha 0.06, vertical.
  const rnd = seeded(seed + ':brush')
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = rgba(rnd() < 0.5 ? shade(color, 0.86) : shade(color, 1.1), 0.06)
    c.fillRect(rnd() * size, rnd() * size, 2 + rnd(), 24 + rnd() * 24)
  }
  const img = c.getImageData(0, 0, size, size)
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
  c.putImageData(img, 0, 0)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const bump = new THREE.CanvasTexture(canvas)
  bump.colorSpace = THREE.NoColorSpace
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.01, roughness: 0.97, metalness: 0 })
}

const ironCache = new Map<string, THREE.MeshStandardMaterial>()

/** Black cast iron: the ink with a cast tooth, a dull sheen, blacked with polish. */
function castIron(p: RegionPalette): THREE.MeshStandardMaterial {
  const hit = ironCache.get(p.ink)
  if (hit) return hit
  const map = plasterTexture(shade(p.ink, 1.15), 'galley:iron')
  const bump = new THREE.CanvasTexture(map.image as HTMLCanvasElement)
  bump.colorSpace = THREE.NoColorSpace
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.02, roughness: 0.5, metalness: 0.4 })
  ironCache.set(p.ink, m)
  return m
}

/**
 * Copper from the palette's own values (brass drawn halfway to the raspberry; S 0.57), turned: the
 * brush runs radially, so its streaks vary around the lathe (u) and hold along the profile (v).
 */
function copper(p: RegionPalette): THREE.MeshStandardMaterial {
  const base = new THREE.Color(mixHex(p.brass, p.accent, 0.5))
  const rnd = seeded('galley:copper')
  const map = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#' + base.getHexString()
    c.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x++) {
      const k = 0.9 + rnd() * 0.2
      c.fillStyle = rgba('#' + base.clone().multiplyScalar(k).getHexString(), 0.5)
      c.fillRect(x, 0, 1, h)
    }
    // Tarnish toward the rim (v high = the mouth, toward the wall): −8 percent.
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, rgba(p.ink, 0.12))
    g.addColorStop(0.5, rgba(p.ink, 0))
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  return new THREE.MeshStandardMaterial({ map, roughness: 0.34, metalness: 0.45 })
}

/** A translucent painted plane for the wear pass (a bare patch, grime). */
function wearPlane(w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Mesh {
  const map = canvasTexture(64, 64, paint)
  const m = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  mesh.name = 'wear'
  mesh.receiveShadow = true
  return mesh
}

/** A tiny engraved brass plate with an inventory number. */
function hsTag(label: string, p: RegionPalette, width = 0.07): THREE.Mesh {
  const m = placard({ lines: [label], width, height: width * 0.26, bg: p.brass, color: p.ink, border: p.ink })
  m.name = `tag:${label}`
  return m
}

/** A small painted board with the destination's name. */
function namePlate(label: string, p: RegionPalette, width: number): THREE.Mesh {
  const m = placard({ lines: [label], width, height: width * 0.2, bg: p.paper, color: p.ink, border: p.ink })
  m.name = `plate:${label}`
  return m
}

// ───────────────────────────── The shell ─────────────────────────────

/**
 * A side wall of depth `d` and height `h` with a door-sized notch cut from the floor up, centred at
 * local x = `cx`; UVs normalised to the wall (0..1) so the distemper and its wear lie as painted.
 */
function notchedWall(d: number, h: number, cx: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-d / 2, 0)
  s.lineTo(cx - DOOR.w / 2, 0)
  s.lineTo(cx - DOOR.w / 2, DOOR.h)
  s.lineTo(cx + DOOR.w / 2, DOOR.h)
  s.lineTo(cx + DOOR.w / 2, 0)
  s.lineTo(d / 2, 0)
  s.lineTo(d / 2, h)
  s.lineTo(-d / 2, h)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + d / 2) / d, pos.getY(i) / h)
  uv.needsUpdate = true
  return g
}

/** Floor, the three distempered walls with their openings, ceiling and beams, skirting, rail and cornice, the wear. */
function shell(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const { w, h, d } = ROOM
  const g = new THREE.Group()
  g.name = 'shell'

  const fl = floorProp({ colors: p, width: w, depth: d + 2, seed: 'galley:floor' })
  fl.position.z = 1
  g.add(fl)

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), distemper(p.wall, 'galley:back', h))
  back.position.set(0, h / 2, -d / 2)
  back.receiveShadow = true
  g.add(back)

  // Left wall: local x runs toward −z (rotation +90°), so the opening sits at local x = −DOOR.z.
  // Right wall: local x runs toward +z (rotation −90°), the opening at local x = DOOR.z.
  const span = (cx: number): [number, number] => [(cx + d / 2 - DOOR.w / 2 - 0.6) / d, (cx + d / 2 + DOOR.w / 2 + 0.6) / d]
  for (const s of [-1, 1]) {
    const cx = s < 0 ? -DOOR.z : DOOR.z
    const side = new THREE.Mesh(notchedWall(d, h, cx), distemper(p.wall, `galley:side${s}`, h, span(cx)))
    side.rotation.y = -s * (Math.PI / 2)
    side.position.set(s * (w / 2), 0, 0)
    side.receiveShadow = true
    g.add(side)
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d + 2), mat.plaster(shade(p.trim, 0.92)))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, h, 1)
  ceiling.receiveShadow = true
  g.add(ceiling)

  const kit = new Kit()
  const trim = mat.lacquer(p.trim)
  const plaster = mat.plaster(p.trim)
  const beam = mat.wood({ base: shade(p.trim, 0.9), grain: shade(p.trim, 0.78), seed: 'galley:beam', repeat: [3, 1] })
  // Skirting on the back wall, and on each side wall in two runs either side of the opening.
  kit.box(w, 0.16, 0.03, trim, 0, 0.08, -d / 2 + 0.015)
  const zOpen0 = DOOR.z - DOOR.w / 2 - 0.1, zOpen1 = DOOR.z + DOOR.w / 2 + 0.1
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.015)
    kit.box(0.03, 0.16, zOpen0 + d / 2, trim, x, 0.08, (-d / 2 + zOpen0) / 2)
    kit.box(0.03, 0.16, d / 2 + 1 - zOpen1, trim, x, 0.08, (zOpen1 + d / 2 + 1) / 2)
    // Picture rail and cornice run the full side.
    kit.box(0.03, 0.04, d + 2, trim, x, 3.3, 1)
  }
  kit.box(w, 0.04, 0.03, trim, 0, 3.3, -d / 2 + 0.015)
  const cs = 0.16
  const steps: [number, number, number][] = [[cs * 0.55, cs, cs * 0.275], [cs * 0.3, cs * 0.6, cs * 0.7], [cs * 0.15, cs * 0.3, cs * 0.925]]
  for (const [sh, sd, dy] of steps) {
    kit.box(w, sh, sd, plaster, 0, h - dy, -d / 2 + sd / 2)
    for (const s of [-1, 1]) kit.box(sd, sh, d + 2, plaster, s * (w / 2 - sd / 2), h - dy, 1)
  }
  // Two painted beams across the ceiling.
  for (const z of [-0.55, -2.05]) kit.box(w, 0.2, 0.16, beam, 0, h - 0.1, z)
  kit.flush(g, 'shell:trim', false)

  // Wear: the floor bare at the doorways and in front of the range, where the cook stands.
  const bareWood = mixHex(p.ground, p.paper, 0.45)
  const bare = wearPlane(1, 1, (c, cw, ch) => {
    const grad = c.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2)
    grad.addColorStop(0, rgba(bareWood, 0.42))
    grad.addColorStop(0.6, rgba(bareWood, 0.2))
    grad.addColorStop(1, rgba(bareWood, 0))
    c.fillStyle = grad
    c.fillRect(0, 0, cw, ch)
  })
  const patches = new Kit()
  const flat = new THREE.Euler(-Math.PI / 2, 0, 0)
  for (const s of [-1, 1]) patches.add(new THREE.PlaneGeometry(1, 1), bare.material as THREE.Material, s * (w / 2 - 0.5), 0.003, DOOR.z, flat, new THREE.Vector3(1.3, 1.5, 1))
  patches.add(new THREE.PlaneGeometry(1, 1), bare.material as THREE.Material, 0, 0.003, -d / 2 + RANGE.d + 0.45, flat, new THREE.Vector3(1.9, 0.9, 1))
  patches.flush(g, 'wear:bare', false)
  // Grime along the foot of the back wall.
  const foot = wearPlane(w, 0.4, (c, cw, ch) => {
    const grad = c.createLinearGradient(0, 0, 0, ch)
    grad.addColorStop(0, rgba(p.ink, 0))
    grad.addColorStop(1, rgba(p.ink, 0.16))
    c.fillStyle = grad
    c.fillRect(0, 0, cw, ch)
  })
  foot.position.set(0, 0.36, -d / 2 + 0.006)
  g.add(foot)
  return g
}

// ───────────────────────────── The openings ─────────────────────────────

/** A panelled leaf in the olive, hinged at local x = 0 and extending toward `dir` when closed. */
function leaf(p: RegionPalette, dir: 1 | -1): THREE.Group {
  const pivot = new THREE.Group()
  pivot.name = 'door:leaf'
  const lw = DOOR.w - 0.02, lh = DOOR.h - 0.02, t = 0.045
  const kit = new Kit()
  const paint = mat.lacquer(p.wallAlt)
  kit.box(lw, lh, t, paint, dir * (lw / 2 + 0.01), lh / 2, 0)
  const panelW = lw - 0.22, upper = lh * 0.42, lower = lh * 0.3
  for (const s of [-1, 1]) {
    kit.box(panelW, upper, 0.012, paint, dir * (lw / 2 + 0.01), lh - 0.14 - upper / 2, s * (t / 2 + 0.006))
    kit.box(panelW, lower, 0.012, paint, dir * (lw / 2 + 0.01), 0.14 + lower / 2, s * (t / 2 + 0.006))
  }
  const brass = mat.brass()
  for (const s of [-1, 1]) kit.sphere(0.021, brass, dir * (lw - 0.08), 1.0, s * (t / 2 + 0.02), 14)
  kit.box(0.03, 0.1, t + 0.012, brass, dir * (lw - 0.08), 1.0, 0)
  for (const y of [0.25, lh / 2, lh - 0.25]) kit.box(0.012, 0.09, t + 0.01, brass, dir * 0.016, y, 0)
  kit.flush(pivot, 'door:leaf')
  return pivot
}

/**
 * A cased opening (back at z = 0, the room toward +z), its leaf ajar and hinged on the jamb toward the
 * back wall (`hinge` = the local x sign of that jamb), the destination's name on a plate above.
 */
function casedOpening(hs: HotspotDef, p: RegionPalette, hinge: 1 | -1, wallSide: 1 | -1): THREE.Group {
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const kit = new Kit()
  const trim = mat.lacquer(p.trim)
  const jamb = 0.1, depth = 0.14
  for (const s of [-1, 1]) kit.box(jamb, DOOR.h, depth, trim, s * (DOOR.w / 2 + jamb / 2), DOOR.h / 2, depth / 2)
  kit.box(DOOR.w + jamb * 2, jamb, depth, trim, 0, DOOR.h + jamb / 2, depth / 2)
  kit.box(DOOR.w + jamb * 2 + 0.12, 0.06, 0.03, trim, 0, DOOR.h + jamb + 0.03, depth + 0.015)
  kit.box(DOOR.w, 0.012, depth, mat.brass(), 0, 0.006, depth / 2)
  kit.flush(g, 'door:case')
  // Hinged on the `hinge` jamb, the leaf lies toward the other when closed; open into the room by 0.55 rad.
  const l = leaf(p, hinge > 0 ? -1 : 1)
  l.position.set(hinge * (DOOR.w / 2), 0, depth - 0.03)
  l.rotation.y = hinge * 0.55
  g.add(l)
  // The destination's name on a painted blade hung from a brass arm over the door, square to the room.
  const blade = new THREE.Group()
  blade.name = 'door:plate'
  const bw = 0.62, bh = 0.13
  const bk = new Kit()
  bk.box(bw + 0.02, bh + 0.02, 0.018, trim, 0, 0, 0)
  bk.flush(blade, 'door:plate:board')
  const bb = new Kit()
  bb.rodX(0.008, bw + 0.3, mat.brass(), 0.03, bh / 2 + 0.07, 0, 10)
  for (const x of [-bw / 2 + 0.06, bw / 2 - 0.06]) bb.torus(0.018, 0.0035, mat.brass(), x, bh / 2 + 0.045, 0, undefined, Math.PI * 2, 12)
  bb.flush(blade, 'door:plate:arm')
  // One double-sided face on the room side of the board (the far side is never seen from the station).
  const face = namePlate(hs.label, p, bw)
  face.scale.y = bh / (bw * 0.2)
  face.position.z = 0.0095
  blade.add(face)
  // The blade's plane is square to the wall: its +x runs out from the wall into the room.
  blade.rotation.y = wallSide * (Math.PI / 2)
  blade.position.set(0, DOOR.h + 0.36, bw / 2 + 0.12)
  g.add(blade)
  return g
}

/** A vertical wash for a passage wall: the distemper darkening to ink toward `darkAt` (0 bottom, 1 top). */
function passageWash(p: RegionPalette, topK: number, bottomColor: string): THREE.MeshStandardMaterial {
  const map = canvasTexture(8, 256, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, shade(p.wall, topK))
    grad.addColorStop(0.45, shade(p.wall, topK * 0.55))
    grad.addColorStop(1, bottomColor)
    c.fillStyle = grad
    c.fillRect(0, 0, w, h)
  })
  return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, side: THREE.DoubleSide })
}

/** The short dark passage behind the Board Room door (local, the wall at z = 0, the passage toward −z). */
function passage(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'passage'
  const depth = 1.4
  const wash = passageWash(p, 0.5, shade(p.ink, 1.1))
  const dark = mat.flat(shade(p.ink, 1.05))
  const kit = new Kit()
  for (const s of [-1, 1]) kit.add(new THREE.PlaneGeometry(depth, DOOR.h), wash, s * DOOR.w / 2, DOOR.h / 2, -depth / 2, new THREE.Euler(0, s * Math.PI / 2, 0))
  kit.add(new THREE.PlaneGeometry(DOOR.w, DOOR.h), dark, 0, DOOR.h / 2, -depth)
  kit.add(new THREE.PlaneGeometry(DOOR.w, depth), dark, 0, DOOR.h, -depth / 2, ROT_X90)
  kit.add(new THREE.PlaneGeometry(DOOR.w, depth), mat.wood({ base: shade(p.ground, 0.55), grain: shade(p.woodGrain, 0.5), seed: 'galley:passage', repeat: [1, 1] }), 0, 0.001, -depth / 2, new THREE.Euler(-Math.PI / 2, 0, 0))
  kit.flush(g, 'passage', false)
  return g
}

/**
 * The steep stair down to the Boathouse, behind the right-hand opening (local, the wall at z = 0): a
 * narrow shaft, eleven treads at sixty degrees, a brass handrail on the far side, the dark coming up.
 */
function stairShaft(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'stair'
  const n = 11, rise = 0.21, run = 0.13, landing = 0.3
  const length = landing + n * run + 0.4
  const drop = n * rise + 0.3
  const wash = passageWash(p, 0.62, shade(p.ink, 1.0))
  const kit = new Kit()
  for (const s of [-1, 1]) kit.add(new THREE.PlaneGeometry(length, DOOR.h + drop), wash, s * DOOR.w / 2, (DOOR.h - drop) / 2, -length / 2, new THREE.Euler(0, s * Math.PI / 2, 0))
  kit.add(new THREE.PlaneGeometry(DOOR.w, DOOR.h + drop), wash, 0, (DOOR.h - drop) / 2, -length)
  kit.add(new THREE.PlaneGeometry(DOOR.w, length), mat.flat(shade(p.ink, 1.2)), 0, DOOR.h, -length / 2, ROT_X90)

  const tread = mat.wood({ base: shade(p.ground, 0.9), grain: p.woodGrain, seed: 'galley:treads', repeat: [1, 1] })
  const paint = mat.lacquer(shade(p.trim, 0.8))
  const brass = mat.brass()
  // The landing flush with the galley floor, a brass nosing at its edge, then the treads going down.
  kit.box(DOOR.w, 0.04, landing, tread, 0, -0.02, -landing / 2)
  kit.box(DOOR.w, 0.014, 0.025, brass, 0, 0.001, -landing)
  for (let i = 0; i < n; i++) {
    const y = -(i + 1) * rise, z = -landing - i * run - run / 2
    kit.box(DOOR.w - 0.08, 0.035, run + 0.04, tread, 0, y - 0.0175, z)
    kit.box(DOOR.w - 0.08, 0.012, 0.022, brass, 0, y + 0.001, z + run / 2 + 0.01)
  }
  // Stringers either side, pitched with the stair.
  const pitch = Math.atan2(rise, run)
  const sl = Math.hypot(n * rise, n * run)
  for (const s of [-1, 1]) kit.box(0.04, 0.3, sl, paint, s * (DOOR.w / 2 - 0.04), -(n * rise) / 2 - 0.1, -landing - (n * run) / 2, new THREE.Euler(-pitch, 0, 0))
  // The handrail on the far wall (local −x), on brackets.
  const rail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-DOOR.w / 2 + 0.07, 0.95, 0.02),
    new THREE.Vector3(-DOOR.w / 2 + 0.07, 0.92, -landing + 0.02),
    new THREE.Vector3(-DOOR.w / 2 + 0.07, 0.92 - n * rise, -landing - n * run),
  ], false, 'catmullrom', 0.1)
  kit.add(new THREE.TubeGeometry(rail, 24, 0.018, 8, false), brass)
  for (const k of [0.15, 0.55, 0.9]) {
    const at = rail.getPoint(k)
    kit.rodX(0.008, 0.07, brass, -DOOR.w / 2 + 0.035, at.y - 0.02, at.z, 8)
  }
  kit.flush(g, 'stair', false)
  return g
}

// ───────────────────────────── The range, the flue, the pans ─────────────────────────────

/** A small paper dial (the oven thermometers), painted once. */
function dialTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2, r = w * 0.44
    c.strokeStyle = p.ink
    c.lineWidth = 3
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 8
      c.lineWidth = i % 2 === 0 ? 3 : 1.5
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); c.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72); c.stroke()
    }
    text(c, 'COOL', cx - r * 0.42, cy + r * 0.62, 11, p.ink, { spacing: 0.1 })
    text(c, 'HOT', cx + r * 0.42, cy + r * 0.62, 11, p.accent, { spacing: 0.1 })
    c.strokeStyle = p.ink
    c.lineWidth = 3
    const a = Math.PI * 1.35
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); c.stroke()
  })
}

interface RangeParts { group: THREE.Group; light: THREE.PointLight; glow: THREE.MeshStandardMaterial }

/**
 * The range: black cast iron on a plinth, two cream enamel oven doors either side of the firebox, the
 * ash-pit door below it, a steel hob with two hotplate lids, a brass towel rail, the iron back with its
 * warming shelf, and the flue straight up to the ceiling. Origin at the floor, back against z = 0.
 */
function range(p: RegionPalette): RangeParts {
  const g = new THREE.Group()
  g.name = 'range'
  const { w, d, hob } = RANGE
  const iron = castIron(p)
  const enamel = mat.enamel(p.paper)
  const steel = mat.steel()
  const brass = mat.brass()
  const front = d
  const kit = new Kit()
  // Plinth, body, the hob plate, its rolled brass edge.
  kit.box(w - 0.08, 0.1, d - 0.06, iron, 0, 0.05, d / 2 - 0.02)
  kit.box(w, hob - 0.14, d, iron, 0, 0.1 + (hob - 0.14) / 2, d / 2)
  kit.box(w + 0.08, 0.04, d + 0.06, steel, 0, hob - 0.02, d / 2 + 0.01)
  kit.rodX(0.012, w + 0.08, brass, 0, hob - 0.03, front + 0.04, 12)
  // Front frame: a raised iron border and the mullions between the doors.
  kit.box(w, 0.05, 0.02, iron, 0, hob - 0.08, front + 0.01)
  kit.box(w, 0.05, 0.02, iron, 0, 0.13, front + 0.01)
  for (const x of [-w / 2 + 0.03, -0.21, 0.21, w / 2 - 0.03]) kit.box(0.05, hob - 0.2, 0.02, iron, x, 0.1 + (hob - 0.14) / 2, front + 0.01)
  // Firebox door (centre, upper) with a vent grille, the ash-pit door below it.
  kit.box(0.3, 0.26, 0.03, iron, 0, 0.56, front + 0.03)
  for (let i = 0; i < 4; i++) kit.box(0.2, 0.012, 0.012, iron, 0, 0.5 + i * 0.035, front + 0.05)
  kit.box(0.3, 0.16, 0.03, iron, 0, 0.26, front + 0.03)
  kit.box(0.34, 0.02, 0.06, iron, 0, 0.405, front + 0.03)
  // Oven doors in cream enamel, a raised inner panel, a brass latch bar each.
  for (const s of [-1, 1]) {
    const x = s * 0.49
    kit.box(0.5, 0.52, 0.03, enamel, x, 0.46, front + 0.03)
    kit.box(0.4, 0.42, 0.012, enamel, x, 0.46, front + 0.05)
    kit.rodX(0.011, 0.26, brass, x, 0.66, front + 0.09, 12)
    for (const e of [-1, 1]) kit.box(0.02, 0.02, 0.05, brass, x + e * 0.12, 0.66, front + 0.065)
  }
  // Brass knobs on the firebox and ash-pit doors.
  kit.sphere(0.018, brass, 0.1, 0.56, front + 0.06, 12)
  kit.sphere(0.016, brass, 0.1, 0.26, front + 0.06, 12)
  // The towel rail across the front, on its brackets.
  kit.rodX(0.011, w + 0.12, brass, 0, hob - 0.14, front + 0.12, 12)
  for (const s of [-1, 1]) kit.box(0.02, 0.02, 0.12, brass, s * (w / 2 + 0.03), hob - 0.14, front + 0.06)
  // Hotplate lids on the hob, each with a brass knob.
  for (const s of [-1, 1]) {
    kit.cyl(0.17, 0.18, 0.035, iron, s * 0.42, hob + 0.018, d / 2 + 0.02, 28)
    kit.cyl(0.02, 0.028, 0.03, brass, s * 0.42, hob + 0.05, d / 2 + 0.02, 12)
  }
  // A low iron upstand along the back of the hob; above it the tiles, and the warming shelf on two brackets.
  kit.box(w, 0.12, 0.05, iron, 0, hob + 0.06, 0.025)
  kit.rodX(0.008, w, brass, 0, hob + 0.12, 0.05, 10)
  kit.box(w + 0.1, 0.035, 0.34, iron, 0, SHELF_Y - 0.0175, 0.17)
  for (const s of [-1, 1]) {
    kit.box(0.03, 0.03, 0.3, iron, s * (w / 2 - 0.1), SHELF_Y - 0.05, 0.15)
    kit.box(0.03, 0.03, 0.34, iron, s * (w / 2 - 0.1), SHELF_Y - 0.16, 0.12, new THREE.Euler(-0.72, 0, 0))
  }
  kit.rodX(0.007, w + 0.06, brass, 0, SHELF_Y + 0.07, 0.33, 10)
  for (const x of [-(w / 2), -w / 4, 0, w / 4, w / 2]) kit.cyl(0.005, 0.005, 0.07, brass, x, SHELF_Y + 0.035, 0.33, 8)
  // The flue: from the back of the hob straight up to the ceiling, a collar at the shelf, two brass bands, a damper key.
  const fz = 0.12, top = ROOM.h
  kit.cyl(0.075, 0.075, top - hob, iron, 0, hob + (top - hob) / 2, fz, 28)
  kit.cyl(0.1, 0.11, 0.08, iron, 0, hob + 0.04, fz, 28)
  kit.cyl(0.09, 0.09, 0.05, iron, 0, SHELF_Y + 0.025, fz, 28)
  kit.cyl(0.1, 0.1, 0.04, iron, 0, top - 0.02, fz, 28)
  for (const y of [2.9, 3.6]) kit.cyl(0.081, 0.081, 0.03, brass, 0, y, fz, 28)
  kit.rodZ(0.008, 0.2, brass, 0, 1.72, fz + 0.1, 8)
  kit.sphere(0.02, brass, 0, 1.72, fz + 0.2, 10)
  kit.flush(g, 'range')

  // The oven thermometers.
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTexture(p), roughness: 0.6, metalness: 0 })
  const dm = new Kit()
  for (const s of [-1, 1]) {
    const x = s * 0.49
    dm.add(new THREE.CircleGeometry(0.045, 24), dialMat, x, 0.5, front + 0.057)
    dm.torus(0.047, 0.005, brass, x, 0.5, front + 0.058, undefined, Math.PI * 2, 24)
  }
  dm.flush(g, 'range:dials', false)

  // The fire, seen through the vents: an emissive plate behind the grille.
  const glow = new THREE.MeshStandardMaterial({ color: mixHex(p.accent, p.brass, 0.35), emissive: mixHex(p.accent, p.brass, 0.5), emissiveIntensity: 0.5, roughness: 1, metalness: 0 })
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), glow)
  fire.position.set(0, 0.55, front + 0.046)
  g.add(fire)

  const light = new THREE.PointLight(new THREE.Color(mixHex(p.light, p.brass, 0.35)), 0.6, 5.5, 2)
  light.name = 'range:fire'
  light.position.set(0, 0.62, front + 0.35)
  light.castShadow = false
  g.add(light)

  const tagMesh = hsTag('HS-0201', p, 0.08)
  tagMesh.position.set(0, hob - 0.08, front + 0.021)
  g.add(tagMesh)
  return { group: g, light, glow }
}

/** Seven copper pans hung by their handles from a brass rail, largest at the centre, descending in pairs. */
function pans(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'pans'
  const radii = [0.09, 0.11, 0.135, 0.17, 0.135, 0.11, 0.09]
  const gap = 0.07
  const total = radii.reduce((a, r) => a + r * 2, 0) + gap * (radii.length - 1)
  // Every mouth lies in one plane just clear of the flue; the bottoms stand out by the pan's depth.
  const railY = 2.6, mouthZ = 0.24, railZ = mouthZ + 0.012
  const cu = copper(p)
  const brass = mat.brass()
  const kit = new Kit()
  const hooks = new Kit()
  let x = -total / 2
  for (const r of radii) {
    x += r
    const depth = r * 0.62
    const handle = 0.07 + r * 0.9
    const cy = railY - 0.07 - handle - r
    // The pan: bottom toward the room, the mouth to the wall; a rolled rim.
    const profile: [number, number][] = [
      [0, 0], [r - 0.014, 0], [r - 0.004, 0.004], [r, 0.016], [r, depth - 0.004], [r + 0.007, depth], [r - 0.004, depth + 0.002],
      [r - 0.006, 0.016], [r - 0.02, 0.007], [0, 0.007],
    ]
    kit.lathe(profile, cu, x, cy, mouthZ + depth, 40, new THREE.Euler(-Math.PI / 2, 0, 0))
    // The handle: a flat bar from the rim up to a ring on the hook.
    const hz = railZ
    kit.box(0.028, handle, 0.008, cu, x, cy + r + handle / 2 - 0.01, hz)
    kit.box(0.05, 0.03, 0.012, cu, x, cy + r - 0.004, hz)
    kit.torus(0.018, 0.005, cu, x, cy + r + handle + 0.006, hz, undefined, Math.PI * 2, 16)
    // The S-hook from the rail.
    hooks.torus(0.02, 0.004, brass, x, railY - 0.035, hz, new THREE.Euler(0, Math.PI / 2, 0), Math.PI * 2, 16)
    x += r + gap
  }
  kit.flush(g, 'pans')
  // The rail on three brackets.
  hooks.rodX(0.013, total + 0.2, brass, 0, railY, railZ, 14)
  for (const bx of [-(total / 2 + 0.06), total / 2 + 0.06]) {
    hooks.box(0.02, 0.02, railZ, brass, bx, railY, railZ / 2)
    hooks.cyl(0.03, 0.03, 0.01, brass, bx, railY, 0.005, 16, ROT_X90)
    hooks.sphere(0.02, brass, bx + Math.sign(bx) * 0.1, railY, railZ, 12)
  }
  hooks.flush(g, 'pans:rail')
  return g
}

// ───────────────────────────── The tins ─────────────────────────────

/** Body colours by distance from a dresser's centre column, per shelf: mirrored left to right. */
function tinColour(p: RegionPalette, row: number, col: number): string {
  const cycle = [p.felt, p.wallAlt, p.accent, p.paper, p.ink, p.brass]
  const k = Math.min(col, TIN_COLS - 1 - col)
  return cycle[(row * 2 + k) % cycle.length]
}

interface TinPaint { label: string; body: string; turned?: boolean }

/**
 * One atlas for every tin: a cell per tin, body colour to the edges, the soldered seam at the back
 * (u = 0), the paper label on the front half (u 0.2 to 0.8) with its name in letterspaced caps. The turned
 * tin's cell also carries its inventory number beside the seam, the side it shows the room.
 */
function tinAtlas(p: RegionPalette, tins: TinPaint[]): THREE.CanvasTexture {
  const { cols, rows, cw, ch } = ATLAS
  const rnd = seeded('galley:tins')
  const tex = canvasTexture(cols * cw, rows * ch, (c) => {
    tins.forEach((t, i) => {
      const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch
      c.fillStyle = t.body
      c.fillRect(x0, y0, cw, ch)
      // Rolled rims top and bottom, the seam at the back, a few dents in the paint.
      c.fillStyle = rgba(p.ink, 0.22)
      c.fillRect(x0, y0 + 4, cw, 3)
      c.fillRect(x0, y0 + ch - 7, cw, 3)
      c.fillStyle = rgba(p.ink, 0.35)
      c.fillRect(x0 + 2, y0, 3, ch)
      c.fillRect(x0 + cw - 5, y0, 3, ch)
      for (let k = 0; k < 14; k++) {
        c.fillStyle = rgba(rnd() < 0.5 ? p.ink : p.paper, 0.08)
        c.fillRect(x0 + rnd() * cw, y0 + rnd() * ch, 2 + rnd() * 5, 1 + rnd() * 2)
      }
      // The label: paper, a hairline border, the name.
      const lx = x0 + cw * 0.27, lw = cw * 0.46, ly = y0 + ch * 0.2, lh = ch * 0.6
      c.fillStyle = p.paper
      c.fillRect(lx, ly, lw, lh)
      fibre(c, lw, lh, p, rnd, 40)
      c.strokeStyle = p.ink
      c.lineWidth = 1.5
      c.strokeRect(lx + 4, ly + 4, lw - 8, lh - 8)
      const size = t.label.length > 11 ? 8 : t.label.length > 8 ? 10 : t.label.length > 5 ? 13 : 15
      text(c, t.label, lx + lw / 2, ly + lh * 0.46, size, p.ink, { spacing: 0.12, weight: 600 })
      c.fillStyle = rgba(p.ink, 0.7)
      c.fillRect(lx + lw * 0.3, ly + lh * 0.7, lw * 0.4, 1.5)
      if (t.turned) {
        // Seen from the room: the seam, the label's lapped edges, and the number painted small beside the seam.
        c.fillStyle = p.paper
        c.fillRect(x0 + cw * 0.25, ly, 5, lh)
        c.fillRect(x0 + cw * 0.75 - 5, ly, 5, lh)
        c.save()
        c.translate(x0 + cw * 0.09, y0 + ch / 2)
        c.rotate(-Math.PI / 2)
        text(c, 'HS-0222', 0, 0, 10, p.paper, { spacing: 0.08, weight: 600 })
        c.restore()
      }
    })
  })
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/** The atlas material for instanced tins: each instance reads its own cell through `aCell`. */
function atlasMaterial(atlas: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.42, metalness: 0.2 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCell = { value: new THREE.Vector2(1 / ATLAS.cols, 1 / ATLAS.rows) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nuniform vec2 uCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = ( aCell + vec2( 0.004, 0.02 ) + vMapUv * vec2( 0.992, 0.96 ) ) * uCell;\n#endif')
  }
  m.customProgramCacheKey = () => 'galley:tin-atlas'
  return m
}

/** UV origin of cell `i` in the atlas (texture v runs bottom-up, the canvas top-down). */
function cellOf(i: number): [number, number] {
  return [i % ATLAS.cols, ATLAS.rows - 1 - Math.floor(i / ATLAS.cols)]
}

/** A tin's cylinder: unit radius and height, the label's centre (u = 0.5) facing +z. */
function tinGeometry(): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1, 28, 1, false, Math.PI, Math.PI * 2)
  g.translate(0, 0.5, 0)
  // Top and bottom caps are contiguous in the index: one group, one draw.
  const [side, top, bottom] = g.groups
  g.clearGroups()
  g.addGroup(side.start, side.count, 0)
  g.addGroup(top.start, top.count + bottom.count, 1)
  return g
}

/** Tin sizes by shelf, bottom to top: [radius, height]. */
const TIN_SIZE: [number, number][] = [[0.066, 0.2], [0.06, 0.18], [0.056, 0.16], [0.052, 0.14]]

// ───────────────────────────── The dressers ─────────────────────────────

/** Shelf heights (top surfaces) of a dresser rack. */
const SHELVES = [1.3, 1.6, 1.9, 2.2]

/**
 * A kitchen dresser in the olive, into the shared kits at x = `ox` (back against z = 0): a base of two
 * drawers over two doors with a scrubbed top, an open rack of four shelves with a plate rail on each, a
 * cornice. Returns the slot positions for its twenty tins, in the same space.
 */
function dresser(p: RegionPalette, ox: number, kit: Kit, bk: Kit): { row: number; col: number; at: THREE.Vector3 }[] {
  const W = 1.3, baseH = 0.9, D = 0.5, rackD = 0.28, topY = 2.48
  const paint = mat.lacquer(p.wallAlt)
  const top = mat.wood({ base: mixHex(p.paper, p.ground, 0.4), grain: mixHex(p.ground, p.woodGrain, 0.4), seed: 'galley:scrubbed', repeat: [1, 1] })
  const pine = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'galley:dresser', repeat: [1, 1] })
  const backing = mat.wood({ base: mixHex(p.felt, p.wallAlt, 0.3), grain: shade(p.felt, 0.8), seed: 'galley:dresser:back', repeat: [1, 3] })
  const ink = mat.lacquer(p.ink)
  const k = {
    box: (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): void => kit.box(w, h, d, m, ox + x, y, z),
  }
  // Base: plinth, carcass, drawers and doors in raised panels, the scrubbed worktop.
  k.box(W - 0.04, 0.08, D - 0.03, ink, 0, 0.04, D / 2 - 0.015)
  k.box(W, baseH - 0.08, D, paint, 0, 0.08 + (baseH - 0.08) / 2, D / 2)
  k.box(W + 0.06, 0.04, D + 0.05, top, 0, baseH + 0.02, D / 2 + 0.015)
  for (const s of [-1, 1]) {
    k.box(W / 2 - 0.06, 0.14, 0.02, paint, s * (W / 4), baseH - 0.1, D + 0.01)
    k.box(W / 2 - 0.06, 0.5, 0.02, paint, s * (W / 4), 0.43, D + 0.01)
    k.box(W / 2 - 0.16, 0.4, 0.012, paint, s * (W / 4), 0.43, D + 0.026)
  }
  // Rack: backboards, sides, shelves with a plate rail, the cornice.
  const rackH = topY - baseH - 0.04
  k.box(W - 0.06, rackH, 0.02, backing, 0, baseH + 0.04 + rackH / 2, 0.01)
  for (const s of [-1, 1]) k.box(0.035, rackH, rackD, pine, s * (W / 2 - 0.0175), baseH + 0.04 + rackH / 2, rackD / 2)
  for (const y of SHELVES) {
    k.box(W - 0.07, 0.025, rackD - 0.02, pine, 0, y - 0.0125, rackD / 2)
    k.box(W - 0.07, 0.016, 0.012, pine, 0, y + 0.05, rackD - 0.01)
  }
  k.box(W + 0.1, 0.05, rackD + 0.08, pine, 0, topY + 0.025, rackD / 2 + 0.02)
  k.box(W + 0.04, 0.06, 0.02, paint, 0, topY - 0.03, rackD + 0.01)
  // Brass knobs on drawers and doors.
  for (const s of [-1, 1]) {
    bk.sphere(0.014, mat.brass(), ox + s * (W / 4), baseH - 0.1, D + 0.03, 12)
    bk.sphere(0.014, mat.brass(), ox + s * 0.07, 0.5, D + 0.04, 12)
  }

  const slots: { row: number; col: number; at: THREE.Vector3 }[] = []
  const pitch = (W - 0.18) / TIN_COLS
  SHELVES.forEach((y, row) => {
    for (let col = 0; col < TIN_COLS; col++) {
      slots.push({ row, col, at: new THREE.Vector3(ox - ((TIN_COLS - 1) / 2) * pitch + col * pitch, y, rackD / 2 - 0.01) })
    }
  })
  return slots
}

// ───────────────────────────── The table and what is on it ─────────────────────────────

/** The long scrubbed table: pale pine top, olive apron, turned olive legs, a stretcher. Origin at its centre on the floor. */
function scrubbedTable(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'table'
  const { l, w, h } = TABLE
  const top = mat.wood({ base: mixHex(p.paper, p.ground, 0.4), grain: mixHex(p.ground, p.woodGrain, 0.4), seed: 'galley:tabletop', repeat: [3, 1] })
  const paint = mat.lacquer(p.wallAlt)
  const kit = new Kit()
  kit.box(l, 0.055, w, top, 0, h - 0.0275, 0)
  kit.box(l - 0.2, 0.11, 0.025, paint, 0, h - 0.11, w / 2 - 0.08)
  kit.box(l - 0.2, 0.11, 0.025, paint, 0, h - 0.11, -w / 2 + 0.08)
  for (const s of [-1, 1]) kit.box(0.025, 0.11, w - 0.18, paint, s * (l / 2 - 0.1), h - 0.11, 0)
  const leg: [number, number][] = [[0.028, 0], [0.034, 0.02], [0.03, 0.05], [0.03, 0.42], [0.042, 0.46], [0.036, 0.5], [0.04, 0.56], [0.04, h - 0.06], [0, h - 0.06]]
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.lathe(leg, paint, sx * (l / 2 - 0.1), 0, sz * (w / 2 - 0.08), 14)
  kit.box(l - 0.2, 0.03, 0.03, paint, 0, 0.14, 0)
  for (const s of [-1, 1]) kit.box(0.03, 0.03, w - 0.16, paint, s * (l / 2 - 0.1), 0.14, 0)
  kit.flush(g, 'table')
  return g
}

/** A kitchen chair in the pine, facing +z, seat at 0.46. */
function kitchenChair(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'chair'
  const s = 0.42, sh = 0.46, h = 0.96
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'galley:chair', repeat: [1, 1] })
  const kit = new Kit()
  kit.box(s, 0.035, s, timber, 0, sh - 0.0175, 0)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(0.02, 0.025, sh - 0.035, timber, sx * (s / 2 - 0.035), (sh - 0.035) / 2, sz * (s / 2 - 0.035), 10)
  for (const sx of [-1, 1]) kit.cyl(0.018, 0.02, h - sh, timber, sx * (s / 2 - 0.035), sh + (h - sh) / 2, -s / 2 + 0.035, 10)
  kit.box(s, 0.08, 0.03, timber, 0, h - 0.04, -s / 2 + 0.03)
  for (const x of [-0.08, 0, 0.08]) kit.box(0.025, h - sh - 0.1, 0.015, timber, x, sh + (h - sh - 0.1) / 2, -s / 2 + 0.03)
  kit.flush(g, 'chair')
  return g
}

/** Ruled double-page spread of the inventory book: the stock in his hand, the games, the tally. */
function inventoryTexture(p: RegionPalette): THREE.CanvasTexture {
  const rnd = seeded('galley:inventory')
  return canvasTexture(1024, 512, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    fibre(c, w, h, p, rnd, 3000)
    // The gutter's shadow and the fore-edges.
    const gut = c.createLinearGradient(w / 2 - 40, 0, w / 2 + 40, 0)
    gut.addColorStop(0, rgba(p.ink, 0))
    gut.addColorStop(0.5, rgba(p.ink, 0.28))
    gut.addColorStop(1, rgba(p.ink, 0))
    c.fillStyle = gut
    c.fillRect(w / 2 - 40, 0, 80, h)
    for (const page of [0, 1]) {
      const x0 = page * (w / 2) + 34, x1 = x0 + w / 2 - 68
      c.strokeStyle = rgba(p.felt, 0.35)
      c.lineWidth = 1
      for (let y = 78; y < h - 20; y += 26) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke() }
      c.strokeStyle = rgba(p.accent, 0.55)
      c.beginPath(); c.moveTo(x1 - 90, 40); c.lineTo(x1 - 90, h - 20); c.stroke()
      c.beginPath(); c.moveTo(x0 + 30, 40); c.lineTo(x0 + 30, h - 20); c.stroke()
    }
    text(c, 'STORES', w / 4, 46, 22, p.ink, { spacing: 0.3 })
    text(c, 'GAMES', (3 * w) / 4, 46, 22, p.ink, { spacing: 0.3 })
    const left: [string, string][] = [['Flour', '22 lb'], ['Tea', '4 lb'], ['Sugar', '9 lb'], ['Oats', '14 lb'], ['Tins', '41'], ['Candles', '60'], ['Chess pieces', '32'], ['(one spare set)', '40'], ['Biscuits', '188']]
    left.forEach(([k, v], i) => {
      text(c, k, 74, 92 + i * 26, 19, p.ink, { mono: true, align: 'left' })
      text(c, v, w / 2 - 44, 92 + i * 26, 19, p.ink, { mono: true, align: 'right' })
    })
    const right: [string, string][] = [['Sun.  one game', '2 hrs'], ['  four biscuits', ''], ['  a bishop', 'tray'], ['Mon.  one game', '1 hr'], ['Tue.  one game', '3 hrs'], ['The tally', '']]
    right.forEach(([k, v], i) => {
      text(c, k, w / 2 + 74, 92 + i * 26, 19, p.ink, { mono: true, align: 'left' })
      text(c, v, w - 44, 92 + i * 26, 19, p.ink, { mono: true, align: 'right' })
    })
    // Tally marks in pencil under THE TALLY.
    c.strokeStyle = rgba(p.ink, 0.75)
    c.lineWidth = 2
    for (let i = 0; i < 7; i++) {
      const x = w / 2 + 90 + i * 14 + Math.floor(i / 5) * 12
      c.beginPath(); c.moveTo(x, 262 + 20); c.lineTo(x + 2, 262 + 44); c.stroke()
    }
    c.beginPath(); c.moveTo(w / 2 + 84, 262 + 40); c.lineTo(w / 2 + 160, 262 + 24); c.stroke()
  })
}

/** The inventory book open on a low book-rest, a pencil in the gutter. Origin on the table top. */
function inventoryBook(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'inventoryBook'
  const bw = 0.42, bd = 0.28, tilt = 0.15
  const rest = new Kit()
  const pine = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'galley:rest', repeat: [1, 1] })
  // A wedge of pine under the back edge; the book lies on the slope.
  rest.box(bw + 0.04, 0.012, bd * 0.9, pine, 0, 0.006, 0)
  rest.box(bw + 0.02, 0.04, 0.02, pine, 0, 0.02, -bd / 2 + 0.03)
  rest.flush(g, 'book:rest')
  const slope = new THREE.Group()
  slope.position.set(0, 0.012, bd / 2 - 0.04)
  slope.rotation.x = -tilt
  const cloth = mat.lacquer(mixHex(p.felt, p.ink, 0.35))
  const kit = new Kit()
  kit.box(bw + 0.02, 0.006, bd + 0.02, cloth, 0, 0.003, -bd / 2)
  // The block of leaves, bowed a little each side of the gutter.
  for (const s of [-1, 1]) kit.box(bw / 2 - 0.004, 0.016, bd - 0.004, mat.paper(p.paper), s * (bw / 4), 0.014, -bd / 2, new THREE.Euler(0, 0, s * 0.03))
  kit.flush(slope, 'book')
  const pages = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.01, bd - 0.01), new THREE.MeshStandardMaterial({ map: inventoryTexture(p), roughness: 0.9, metalness: 0 }))
  pages.rotation.x = -Math.PI / 2
  pages.position.set(0, 0.0235, -bd / 2)
  pages.receiveShadow = true
  slope.add(pages)
  const pencil = new Kit()
  pencil.rodX(0.004, 0.16, mat.lacquer(p.accent), 0.02, 0.028, -bd * 0.3, 8)
  pencil.cyl(0.004, 0.0005, 0.02, mat.paper(p.paper), 0.11, 0.028, -bd * 0.3, 8, new THREE.Euler(0, 0, -Math.PI / 2))
  pencil.flush(slope, 'pencil')
  g.add(slope)
  const tagMesh = hsTag('HS-0210', p, 0.07)
  tagMesh.position.set(0, 0.009, bd * 0.45 + 0.001)
  g.add(tagMesh)
  return g
}

/** The ration card, typed, with its inventory number in the corner. */
function rationTexture(p: RegionPalette): THREE.CanvasTexture {
  const rnd = seeded('galley:ration')
  const [title, body] = dressing.rationCard
  return canvasTexture(512, 320, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    fibre(c, w, h, p, rnd, 900)
    c.strokeStyle = p.ink
    c.lineWidth = 3
    c.strokeRect(14, 14, w - 28, h - 28)
    c.lineWidth = 1
    c.strokeRect(22, 22, w - 44, h - 44)
    text(c, 'HALYARD STATION  ·  RATION CARD', w / 2, 58, 17, p.ink, { spacing: 0.18 })
    c.fillStyle = p.accent
    c.fillRect(60, 80, w - 120, 3)
    text(c, title, w / 2, 132, 44, p.ink, { spacing: 0.3, weight: 600 })
    const parts = body.split(/\s{2,}/)
    parts.forEach((line, i) => text(c, line, w / 2, 188 + i * 30, 24, p.ink, { mono: true }))
    text(c, 'HS-0214', w - 60, h - 38, 12, p.ink, { spacing: 0.1 })
  })
}

/** The brown teapot with the ration card propped against it. Origin on the table top. */
function teapotAndCard(p: RegionPalette): { group: THREE.Group; card: THREE.Group } {
  const g = new THREE.Group()
  g.name = 'teapot'
  const glaze = mat.enamel(shade(p.woodGrain, 0.8))
  const kit = new Kit()
  kit.lathe([[0, 0], [0.05, 0], [0.075, 0.03], [0.085, 0.07], [0.075, 0.115], [0.045, 0.13], [0.04, 0.135], [0, 0.135]], glaze, 0, 0, 0, 28)
  kit.lathe([[0, 0], [0.04, 0], [0.036, 0.012], [0.012, 0.02], [0.014, 0.032], [0, 0.036]], glaze, 0, 0.13, 0, 20)
  kit.torus(0.045, 0.01, glaze, 0.1, 0.075, 0, undefined, Math.PI * 1.2, 16)
  const spout = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.07, 0.05, 0), new THREE.Vector3(-0.11, 0.08, 0), new THREE.Vector3(-0.135, 0.13, 0)])
  kit.add(new THREE.TubeGeometry(spout, 10, 0.013, 10, false), glaze)
  kit.flush(g, 'teapot')

  const card = new THREE.Group()
  card.name = 'rationCard'
  const cw = 0.2, chh = 0.125
  const stock = new THREE.Mesh(new THREE.BoxGeometry(cw, chh, 0.0015), mat.paper(p.paper))
  stock.position.y = chh / 2
  stock.castShadow = true
  stock.receiveShadow = true
  card.add(stock)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(cw, chh), new THREE.MeshStandardMaterial({ map: rationTexture(p), roughness: 0.9, metalness: 0 }))
  face.position.set(0, chh / 2, 0.0009)
  face.receiveShadow = true
  card.add(face)
  card.rotation.x = -0.28
  card.position.set(0, 0, 0.12)
  g.add(card)
  return { group: g, card }
}

// ───────────────────────────── The crate and the coal box ─────────────────────────────

/** A stencil: lines of letterspaced caps in ink, sprayed, on a clear ground (the crate, the flour sack). */
function stencilTexture(p: RegionPalette, lines: readonly string[], sizes: number[], seed: string): THREE.CanvasTexture {
  const rnd = seeded(seed)
  return canvasTexture(512, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    const pitch = h / (lines.length + 0.2)
    lines.forEach((line, i) => text(c, line, w / 2, pitch * (i + 0.6), sizes[i] ?? 34, rgba(p.ink, 0.82), { spacing: 0.22, weight: 600 }))
    // Stencil bridges and overspray.
    c.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 90; i++) c.fillRect(rnd() * w, rnd() * h, 2, 6 + rnd() * 6)
    c.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 400; i++) {
      c.fillStyle = rgba(p.ink, 0.05 + rnd() * 0.06)
      c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5)
    }
  })
}

/** The crate, nailed: pine boards with gaps, corner battens, the lid nailed down, the stencil. Origin on the floor. */
function crate(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'crate'
  const W = 0.74, H = 0.5, D = 0.52
  const pine = mat.wood({ base: mixHex(p.ground, p.paper, 0.35), grain: p.woodGrain, seed: 'galley:crate', repeat: [1, 1] })
  const iron = mat.flat(p.ink)
  const kit = new Kit()
  const boards = 3, bh = (H - 0.02) / boards
  for (let i = 0; i < boards; i++) {
    const y = 0.01 + bh * (i + 0.5)
    for (const s of [-1, 1]) {
      kit.box(W, bh - 0.008, 0.018, pine, 0, y, s * (D / 2 - 0.009))
      kit.box(0.018, bh - 0.008, D - 0.036, pine, s * (W / 2 - 0.009), y, 0)
    }
  }
  // The lid: four boards across, a batten each end.
  for (let i = 0; i < 4; i++) kit.box(W + 0.01, 0.02, D / 4 - 0.006, pine, 0, H + 0.01, -D / 2 + D / 8 + (i * D) / 4)
  for (const s of [-1, 1]) kit.box(0.06, 0.02, D, pine, s * (W / 2 - 0.05), H + 0.03, 0)
  // Corner battens on the front and back.
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) kit.box(0.05, H, 0.02, pine, sx * (W / 2 - 0.025), H / 2, sz * (D / 2 + 0.01))
  kit.flush(g, 'crate')
  // The nails: heads along the battens and the lid.
  const nails = new Kit()
  for (const sx of [-1, 1]) {
    for (const y of [0.06, H / 2, H - 0.06]) nails.cyl(0.005, 0.005, 0.004, iron, sx * (W / 2 - 0.025), y, D / 2 + 0.021, 8, ROT_X90)
    for (let i = 0; i < 4; i++) nails.cyl(0.005, 0.005, 0.004, iron, sx * (W / 2 - 0.05), H + 0.041, -D / 2 + D / 8 + (i * D) / 4, 8)
  }
  nails.flush(g, 'crate:nails', false)
  const sw = W - 0.2
  const stencil = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 2), new THREE.MeshStandardMaterial({ map: stencilTexture(p, dressing.crateStencil, [40, 36, 32], 'galley:stencil'), transparent: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }))
  stencil.position.set(0, H / 2, D / 2 + 0.0005)
  g.add(stencil)
  const tagMesh = hsTag('HS-0219', p, 0.07)
  tagMesh.position.set(W / 2 - 0.11, 0.05, D / 2 + 0.001)
  g.add(tagMesh)
  return g
}

/** The coal box by the range's other hand: the crate's size, painted olive, a sloped lid, iron straps, a brass handle. */
function coalBox(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'coalBox'
  const W = 0.74, H = 0.5, D = 0.52
  const paint = mat.lacquer(p.wallAlt)
  const iron = castIron(p)
  const kit = new Kit()
  kit.box(W, H - 0.06, D, paint, 0, 0.06 + (H - 0.06) / 2, 0)
  kit.box(W + 0.02, 0.06, D + 0.02, iron, 0, 0.03, 0)
  kit.box(W + 0.02, 0.03, D + 0.03, mat.wood({ base: mixHex(p.paper, p.ground, 0.4), grain: mixHex(p.ground, p.woodGrain, 0.4), seed: 'galley:scrubbed', repeat: [1, 1] }), 0, H + 0.03, 0.005, new THREE.Euler(0.06, 0, 0))
  for (const sx of [-1, 1]) kit.box(0.04, H - 0.06, 0.006, iron, sx * (W / 2 - 0.08), 0.06 + (H - 0.06) / 2, D / 2 + 0.003)
  kit.flush(g, 'coalBox')
  const b = new Kit()
  b.torus(0.05, 0.007, mat.brass(), 0, H - 0.12, D / 2 + 0.02, undefined, Math.PI, 16)
  for (const s of [-1, 1]) b.cyl(0.012, 0.012, 0.02, mat.brass(), s * 0.05, H - 0.12, D / 2 + 0.01, 10, ROT_X90)
  b.flush(g, 'coalBox:brass')
  return g
}

/** A hessian sack of flour, slumped, its neck tied and folded, FLOUR stencilled on the front. Origin on the floor. */
function flourSack(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'flourSack'
  const hessian = mat.felt(mixHex(p.paper, p.ground, 0.5))
  const depth = 0.72
  const kit = new Kit()
  kit.lathe([[0, 0], [0.17, 0], [0.205, 0.04], [0.215, 0.18], [0.2, 0.33], [0.14, 0.42], [0.06, 0.46], [0.045, 0.48], [0.07, 0.53], [0.05, 0.56], [0, 0.565]], hessian, 0, 0, 0, 28, undefined, new THREE.Vector3(1.15, 1, depth))
  kit.torus(0.05, 0.008, mat.flat(p.woodGrain), 0, 0.475, 0, new THREE.Euler(Math.PI / 2, 0, 0), Math.PI * 2, 16)
  kit.flush(g, 'flourSack')
  const stencil = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: stencilTexture(p, ['FLOUR', '22 LB'], [70, 44], 'galley:flour'), transparent: true, roughness: 1, metalness: 0, depthWrite: false }))
  stencil.position.set(0, 0.2, 0.215 * depth + 0.004)
  g.add(stencil)
  return g
}

// ───────────────────────────── The notices ─────────────────────────────

/** Standing Order 7, typed and pinned: the range's hours. */
function orderTexture(p: RegionPalette): THREE.CanvasTexture {
  const rnd = seeded('galley:order')
  return canvasTexture(384, 512, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    fibre(c, w, h, p, rnd, 1400)
    c.strokeStyle = p.ink
    c.lineWidth = 2
    c.strokeRect(18, 18, w - 36, h - 36)
    text(c, 'HALYARD STATION', w / 2, 62, 18, p.ink, { spacing: 0.24 })
    c.fillStyle = p.accent
    c.fillRect(70, 84, w - 140, 3)
    text(c, 'STANDING', w / 2, 140, 40, p.ink, { spacing: 0.2, weight: 600 })
    text(c, 'ORDER 7', w / 2, 190, 40, p.ink, { spacing: 0.2, weight: 600 })
    text(c, 'THE RANGE', w / 2, 262, 22, p.ink, { spacing: 0.3 })
    text(c, 'Lit at 05:00.', w / 2, 320, 24, p.ink, { mono: true })
    text(c, 'Out at 21:00.', w / 2, 356, 24, p.ink, { mono: true })
    text(c, 'A. HARDY, STATION MASTER', w / 2, h - 60, 12, p.ink, { spacing: 0.16 })
  })
}

/** The galley calendar for September 1965, the 30th ringed in raspberry. */
function calendarTexture(p: RegionPalette): THREE.CanvasTexture {
  const rnd = seeded('galley:calendar')
  return canvasTexture(384, 512, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    fibre(c, w, h, p, rnd, 1400)
    c.strokeStyle = p.ink
    c.lineWidth = 2
    c.strokeRect(18, 18, w - 36, h - 36)
    text(c, 'SEPTEMBER', w / 2, 80, 40, p.ink, { spacing: 0.2, weight: 600 })
    text(c, '1965', w / 2, 128, 26, p.ink, { spacing: 0.4 })
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    const x0 = 52, cell = (w - 104) / 7, y0 = 190
    days.forEach((dname, i) => text(c, dname, x0 + cell * (i + 0.5), y0, 16, p.ink, { spacing: 0 }))
    // The 1st was a Wednesday.
    for (let day = 1; day <= 30; day++) {
      const k = day + 2
      const col = k % 7, row = Math.floor(k / 7)
      const x = x0 + cell * (col + 0.5), y = y0 + 46 + row * 44
      text(c, String(day), x, y, 20, col === 0 ? p.accent : p.ink, { mono: true })
      if (day < 28 && day % 7 !== 3) {
        // Sundays counted: a pencil tick through each day gone.
        c.strokeStyle = rgba(p.ink, 0.35)
        c.lineWidth = 1.5
        c.beginPath(); c.moveTo(x - 12, y + 10); c.lineTo(x + 12, y - 10); c.stroke()
      }
      if (day === 30) {
        c.strokeStyle = p.accent
        c.lineWidth = 3
        c.beginPath(); c.ellipse(x, y, 20, 16, -0.2, 0, Math.PI * 2); c.stroke()
      }
    }
  })
}

/** Two framed sheets hung on the picture rail above the dressers: the Standing Order left, the calendar right. */
function notices(p: RegionPalette, x: number, y: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'notices'
  const fw = 0.46, fh = 0.6, f = 0.035
  const frame = mat.lacquer(p.ink)
  const kit = new Kit()
  for (const s of [-1, 1]) {
    const cx = s * x
    kit.box(fw, f, 0.03, frame, cx, y + fh / 2 - f / 2, 0.015)
    kit.box(fw, f, 0.03, frame, cx, y - fh / 2 + f / 2, 0.015)
    kit.box(f, fh - 2 * f, 0.03, frame, cx - fw / 2 + f / 2, y, 0.015)
    kit.box(f, fh - 2 * f, 0.03, frame, cx + fw / 2 - f / 2, y, 0.015)
  }
  kit.flush(g, 'notices:frames')
  const cords = new Kit()
  for (const s of [-1, 1]) {
    // Two cords from the picture rail to the frame's top corners.
    for (const e of [-1, 1]) {
      const a = new THREE.Vector3(s * x, 3.3, 0.02), b = new THREE.Vector3(s * x + e * (fw / 2 - 0.05), y + fh / 2, 0.02)
      const len = a.distanceTo(b)
      const geo = new THREE.CylinderGeometry(0.0022, 0.0022, len, 5)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      cords.add(geo, mat.brass(), (a.x + b.x) / 2, (a.y + b.y) / 2, 0.02, new THREE.Euler().setFromQuaternion(q))
    }
    cords.sphere(0.012, mat.brass(), s * x, 3.3, 0.035, 10)
  }
  cords.flush(g, 'notices:cords', false)
  const sheets: [number, THREE.CanvasTexture][] = [[-1, orderTexture(p)], [1, calendarTexture(p)]]
  for (const [s, tex] of sheets) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(fw - 2 * f, fh - 2 * f), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }))
    sheet.position.set(s * x, y, 0.008)
    sheet.receiveShadow = true
    g.add(sheet)
  }
  return g
}

// ───────────────────────────── The pendant ─────────────────────────────

/** A cream enamel pendant over the table: ceiling rose, flex, the shade, a warm bulb and its light. */
function pendant(p: RegionPalette, y: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'pendant'
  const top = ROOM.h
  const kit = new Kit()
  kit.cyl(0.07, 0.07, 0.02, mat.plaster(p.trim), 0, top - 0.01, 0, 24)
  kit.cyl(0.004, 0.004, top - y - 0.02, mat.flat(p.ink), 0, (top + y) / 2, 0, 6)
  kit.cyl(0.028, 0.02, 0.06, mat.brass(), 0, y + 0.02, 0, 16)
  kit.flush(g, 'pendant')
  const shadeGeo = new THREE.LatheGeometry([new THREE.Vector2(0.03, 0.0), new THREE.Vector2(0.06, -0.02), new THREE.Vector2(0.17, -0.13), new THREE.Vector2(0.2, -0.16), new THREE.Vector2(0.205, -0.165)], 40)
  const shadeMesh = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: p.paper, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide }))
  shadeMesh.position.y = y
  shadeMesh.castShadow = true
  g.add(shadeMesh)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.006, 6, 40), mat.lacquer(p.ink))
  rim.rotation.x = Math.PI / 2
  rim.position.y = y - 0.165
  g.add(rim)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), new THREE.MeshStandardMaterial({ color: p.light, emissive: p.light, emissiveIntensity: 1.2, roughness: 0.9, metalness: 0 }))
  bulb.position.y = y - 0.1
  g.add(bulb)
  const light = new THREE.PointLight(new THREE.Color(p.light), 2.4, 6.5, 2)
  light.name = 'pendant:light'
  light.position.y = y - 0.17
  light.castShadow = false
  g.add(light)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/**
 * Builds the Galley in local space (origin at the floor centre, open toward +z): the range with its
 * pans, the two dressers of tins (one turned label-in, right), the scrubbed table with Mr Lisle, the
 * inventory book and the ration card, the crate, the door to the Board Room and the stair to the
 * Boathouse. `group.userData.warm(on)` raises or lowers the fire's light over 600 ms.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const { w, d } = ROOM
  const backZ = -d / 2
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const byId = new Map(ctx.def.hotspots.map((h) => [h.id, h] as const))
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }

  group.add(shell(ctx))

  // The tiled splashback behind the range, an olive bullnose along its top.
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({
    map: tileTexture({ a: p.paper, b: shade(p.paper, 0.95), grout: shade(p.trim, 0.78), repeat: [2.4 / 0.3, 1.6 / 0.3] }),
    roughness: 0.3, metalness: 0,
  }))
  tiles.position.set(0, 0.16 + 0.8, backZ + 0.004)
  tiles.receiveShadow = true
  group.add(tiles)
  const edge = new Kit()
  edge.box(2.44, 0.035, 0.03, mat.lacquer(p.wallAlt), 0, 1.775, backZ + 0.015)
  for (const s of [-1, 1]) edge.box(0.035, 1.6, 0.03, mat.lacquer(p.wallAlt), s * 1.22, 0.96, backZ + 0.015)
  edge.flush(group, 'splashback:edge', false)

  // The range, centred.
  const theRange = range(p)
  theRange.group.position.set(0, 0, backZ + 0.02)
  group.add(theRange.group)
  const rangeDef = byId.get('galley.range')
  if (rangeDef) register(rangeDef.id, theRange.group)
  const fire = { level: 0, gen: 0 }
  const setFire = (k: number): void => {
    fire.level = k
    theRange.light.intensity = 0.6 + 6.4 * k
    theRange.glow.emissiveIntensity = 0.5 + 2.5 * k
  }
  /** Raises (on) or lowers (off) the fire's warm light over 600 ms; the station layer holds it for `dressing.rangeWarmMs`. */
  group.userData.warm = (on: boolean): void => {
    const gen = ++fire.gen
    const from = fire.level, to = on ? 1 : 0
    void clock.tween(600, (k) => { if (gen === fire.gen) setFire(from + (to - from) * k) }, ease.inOutCubic)
  }
  group.userData.warmMs = dressing.rangeWarmMs

  // The Standing Order and the calendar above the dressers.
  const pinned = notices(p, 2.35, 2.9)
  pinned.position.z = backZ
  group.add(pinned)

  // Copper pans above it.
  const thePans = pans(p)
  thePans.position.set(0, 0, backZ)
  group.add(thePans)

  // The dressers and the forty-one tins: twenty on each, the tea caddy alone on the warming shelf.
  const labels = dressing.tins
  const turnedIndex = dressing.turnedTin.index
  const teaIndex = labels.indexOf('TEA')
  const rest = labels.map((_, i) => i).filter((i) => i !== turnedIndex && i !== teaIndex)
  const tinsGroup = new THREE.Group()
  tinsGroup.name = 'tins'
  group.add(tinsGroup)
  interface Placed { index: number; matrix: THREE.Matrix4; body: string }
  const placed: Placed[] = []
  let turned: { matrix: THREE.Matrix4; body: string } | undefined
  const tinRnd = seeded('galley:tin-jitter')
  let next = 0
  const dressers = new THREE.Group()
  dressers.name = 'dressers'
  dressers.position.z = backZ
  tinsGroup.add(dressers)
  const dk = new Kit(), dbk = new Kit()
  for (const s of [-1, 1] as const) {
    const slots = dresser(p, s * 2.35, dk, dbk)
    const tagMesh = hsTag('HS-0206', p, 0.08)
    tagMesh.position.set(s * 2.35, 0.9 + 0.02, 0.5 + 0.041)
    dressers.add(tagMesh)
    for (const slot of slots) {
      const [r, h] = TIN_SIZE[slot.row]
      const body = tinColour(p, slot.row, slot.col)
      const at = slot.at.clone().add(dressers.position)
      const isTurned = s > 0 && slot.row === TURNED_SLOT.row && slot.col === TURNED_SLOT.col
      // Squared to the shelf edge within a degree or two; the turned one faces the backboard.
      const yaw = isTurned ? Math.PI : (tinRnd() - 0.5) * 0.05
      const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(r, h, r))
      if (isTurned) { turned = { matrix: m, body }; continue }
      placed.push({ index: rest[next++], matrix: m, body })
    }
  }
  dk.flush(dressers, 'dresser')
  dbk.flush(dressers, 'dresser:brass')
  // The caddy: the largest tin, raspberry, centred on the warming shelf in front of the flue.
  placed.push({ index: teaIndex, matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, SHELF_Y, backZ + 0.02 + 0.27), new THREE.Quaternion(), new THREE.Vector3(0.07, 0.2, 0.07)), body: p.accent })

  // One atlas: cell i carries tin i's label and its body colour.
  const paints: TinPaint[] = labels.map((label) => ({ label, body: p.paper }))
  for (const t of placed) paints[t.index] = { label: labels[t.index], body: t.body }
  if (turned) paints[turnedIndex] = { label: labels[turnedIndex], body: turned.body, turned: true }
  const atlas = tinAtlas(p, paints)
  const lid = mat.steel()
  const tinGeo = tinGeometry()
  const cells = new Float32Array(placed.length * 2)
  placed.forEach((t, i) => { const [cx, cy] = cellOf(t.index); cells[i * 2] = cx; cells[i * 2 + 1] = cy })
  tinGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2))
  const tins = new THREE.InstancedMesh(tinGeo, [atlasMaterial(atlas), lid], placed.length)
  tins.name = 'tins:instanced'
  placed.forEach((t, i) => tins.setMatrixAt(i, t.matrix))
  tins.instanceMatrix.needsUpdate = true
  tins.castShadow = true
  tins.receiveShadow = true
  tinsGroup.add(tins)
  register('galley.tins', tinsGroup)

  // The flaw: the turned tin, its own mesh so it answers on its own.
  if (turned) {
    const g = tinGeometry()
    const [cx, cy] = cellOf(turnedIndex)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + 0.004 + uv.getX(i) * 0.992) / ATLAS.cols, (cy + 0.02 + uv.getY(i) * 0.96) / ATLAS.rows)
    uv.needsUpdate = true
    const mesh = new THREE.Mesh(g, [new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.42, metalness: 0.2 }), lid])
    mesh.name = 'turnedTin'
    mesh.castShadow = true
    mesh.receiveShadow = true
    const holder = new THREE.Group()
    holder.name = 'turnedTin'
    turned.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    holder.add(mesh)
    tinsGroup.add(holder)
    register('galley.turnedtin', holder)
  }

  // The long scrubbed table across the foreground; Mr Lisle behind it at the centre, facing the room.
  const table = scrubbedTable(p)
  table.position.set(0, 0, TABLE.z)
  group.add(table)
  const chair = kitchenChair(p)
  chair.position.set(0, 0, TABLE.z - 0.92)
  group.add(chair)
  const lisle = figure({ variant: 'lisle', seated: true, seatHeight: 0.48 })
  lisle.position.set(0, 0, TABLE.z - 0.95)
  group.add(lisle)
  const lisleDef = byId.get('galley.lisle')
  if (lisleDef) register(lisleDef.id, lisle)
  out.residentAnchor = lisle

  // On the table: the inventory book open before him; the teapot behind it with the ration card propped.
  const book = inventoryBook(p)
  book.position.set(0, TABLE.h, TABLE.z + 0.2)
  group.add(book)
  register('galley.inventory', book)
  const tea = teapotAndCard(p)
  tea.group.position.set(0, TABLE.h, TABLE.z - 0.2)
  group.add(tea.group)
  register('galley.ration', tea.card)
  // Two enamel mugs, one each side, handles out.
  const mugs = new Kit()
  const enamel = mat.enamel(p.paper)
  for (const s of [-1, 1]) {
    const x = s * 0.72, z = TABLE.z - 0.05
    mugs.lathe([[0, 0], [0.042, 0], [0.044, 0.004], [0.044, 0.094], [0.041, 0.096], [0.038, 0.01], [0, 0.01]], enamel, x, TABLE.h, z, 24)
    mugs.torus(0.026, 0.006, enamel, x + s * 0.046, TABLE.h + 0.05, z, new THREE.Euler(0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2), Math.PI, 12)
    mugs.torus(0.043, 0.0035, mat.lacquer(p.felt), x, TABLE.h + 0.094, z, ROT_X90, Math.PI * 2, 24)
  }
  mugs.flush(group, 'mugs')

  // The flour under the table, at the centre.
  const flour = flourSack(p)
  flour.position.set(0, 0, TABLE.z - 0.2)
  group.add(flour)

  // The crate on the floor right; the coal box its mirror, left.
  const theCrate = crate(p)
  theCrate.position.set(2.25, 0, -0.3)
  group.add(theCrate)
  register('galley.crate', theCrate)
  const coal = coalBox(p)
  coal.position.set(-2.25, 0, -0.3)
  group.add(coal)

  // The Board Room door in the left wall, the stair to the Boathouse behind its twin in the right.
  for (const hs of ctx.def.hotspots) {
    if (hs.kind !== 'door') continue
    const s = hs.via === 'dolly-left' ? -1 : 1
    // Both leaves hang from the jamb toward the back wall: local +x runs toward −z on the left wall, +z on the right.
    const opening = casedOpening(hs, p, s < 0 ? 1 : -1, s as 1 | -1)
    opening.position.set(s * (w / 2), 0, DOOR.z)
    opening.rotation.y = -s * (Math.PI / 2)
    opening.add(s < 0 ? passage(p) : stairShaft(p))
    group.add(opening)
    register(hs.id, opening)
  }

  // One pendant over the table.
  const lamp = pendant(p, 2.85)
  lamp.position.z = TABLE.z
  group.add(lamp)

  for (const id of byId.keys()) if (!out.hotspots.has(id)) console.warn(`[galley] hotspot ${id} has no object`)
  return out
}
