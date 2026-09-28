// Frame 5: The Recorder's Room (first floor, left). docs/BIBLE.md §6 Frame 5, palette §3.2: mustard
// distemper with an olive band under the cornice. The window centred on the back wall with the slate
// sea beyond it; the bed left, head to the wall, its corduroy blanket turned down and the Recorder's
// badge propped on the pillow; the desk right with the Olivetti centred on it, Ida seated behind it
// typing, the raspberry cardigan over her chair, the addressed postcard propped against the pages and
// the eleven books on a shelf above; the gramophone with its brass horn at the bed's foot, four records
// leaning against its stand; the harmonium against the left wall, one stop out; the door to the
// Landing on the right wall. The one flaw: a green glass float hangs on a string a hand's breadth
// right of the centre line, in front of the window's middle bar. It is never moved; nothing moves on
// hover; the only motion is the painted foam drifting on the sea beyond the glass.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import { tokens, type RegionPalette } from '../../content/palette'
import { dressing } from '../../content/frames/recorders'
import { FONT_MONO, FONT_SANS } from '../../core/fonts'
import { feltTexture, mat, plasterTexture, seeded } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { FIGURE_COLORS, FIGURE_HEIGHTS, figure } from '../figures'
import * as props from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres (open toward +z, back wall at z = −d/2, side walls at x = ±w/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
const BACK_Z = -ROOM.d / 2
/** The two halves of the room: the bed's axis on the left, the desk's on the right. */
const SIDE_X = 1.95
/** Where the door (right wall) and its mirror, the harmonium (left wall), stand along z. */
const WALL_ITEM_Z = -1.0
/** The window on the back wall. */
const WIN = { w: 1.5, h: 1.9, sill: 0.85 } as const
/** Desk and chair (right half). */
const DESK = { w: 1.3, d: 0.62, h: 0.7, z: -1.4 } as const
const CHAIR_Z = -1.87
/** The gramophone's cabinet at the bed's foot. */
const STAND = { w: 0.56, h: 0.56, d: 0.44, z: -0.72 } as const
/** The flaw: hung from the ceiling a hand's breadth right of the line, in front of the window. */
const FLOAT = { x: dressing.float.offsetX, y: 2.36, z: -2.35, r: 0.085 } as const

type UVRect = readonly [number, number, number, number]

// ───────────────────────────── Canvas helpers ─────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** A palette hex with alpha, for canvas painting. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** `#rrggbb` of a palette colour scaled by `k` (a shadow side, a darker grain). */
function shade(hex: string, k: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()
}

/** A mix of two palette colours. */
function mix(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [canvas, ctx]
}

/** A canvas painted once, wrapped as an sRGB texture. */
function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(w, h)
  paint(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Letterspaced text on a canvas; falls back to plain text where letterSpacing is unsupported. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, o: { font?: 'sans' | 'mono'; weight?: number; spacing?: number; align?: CanvasTextAlign } = {}): void {
  ctx.font = `${o.weight ?? 500} ${size}px ${o.font === 'mono' ? FONT_MONO : FONT_SANS}`
  ctx.fillStyle = color
  ctx.textAlign = o.align ?? 'center'
  ctx.textBaseline = 'middle'
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${(o.spacing ?? 0.12) * size}px`
  ctx.fillText(s, x, y)
  if ('letterSpacing' in c) c.letterSpacing = '0px'
}

/** Fits `s` into `maxW` px by shrinking from `size`; returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, s: string, size: number, maxW: number, spacing: number, weight = 500): number {
  let px = size
  while (px > 6) {
    ctx.font = `${weight} ${px}px ${FONT_SANS}`
    const w = ctx.measureText(s).width + s.length * spacing * px
    if (w <= maxW) break
    px -= 1
  }
  return px
}

/** Brush strokes along a direction (radians from vertical), alpha 0.06, 24 to 48 px long, 2 to 3 px wide (§3.5). */
function brush(ctx: CanvasRenderingContext2D, w: number, h: number, colorA: string, colorB: string, angle: number, count: number, rnd: () => number): void {
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h
    const len = 24 + rnd() * 24
    const a = angle + (rnd() - 0.5) * 0.12
    ctx.strokeStyle = rgba(rnd() < 0.5 ? colorA : colorB, 0.06)
    ctx.lineWidth = 2 + rnd()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len)
    ctx.stroke()
  }
  ctx.restore()
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ───────────────────────────── Merged geometry kit ─────────────────────────────

/** Remaps a BoxGeometry's per-face UVs into atlas rectangles (faces: +x, −x, +y, −y, +z, −z). */
function atlasBox(w: number, h: number, d: number, faces: (UVRect | undefined)[]): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let f = 0; f < 6; f++) {
    const r = faces[f]
    if (!r) continue
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]))
  }
  uv.needsUpdate = true
  return g
}

/**
 * Accumulates parts per material and flushes one mesh per material, so a piece of furniture is a
 * few draw calls rather than twenty. Parts are positioned by a matrix before merging.
 */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler | THREE.Quaternion, scale?: THREE.Vector3): void {
    const geo = g.index ? g.toNonIndexed() : g.clone()
    const q = rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler())
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, scale ?? new THREE.Vector3(1, 1, 1)))
    const list = this.parts.get(m) ?? []
    list.push(geo)
    this.parts.set(m, list)
  }

  box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rot)
  }

  cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16, rot?: THREE.Euler): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, rot)
  }

  rodX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): void {
    this.cyl(r, r, len, m, x, y, z, seg, new THREE.Euler(0, 0, Math.PI / 2))
  }

  rodZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12): void {
    this.cyl(r, r, len, m, x, y, z, seg, new THREE.Euler(Math.PI / 2, 0, 0))
  }

  sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12, scale?: THREE.Vector3): void {
    this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), m, x, y, z, undefined, scale)
  }

  /** A capsule between two points (a sleeve, a limb). */
  capsule(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): void {
    const dir = b.clone().sub(a)
    const len = Math.max(0.001, dir.length() - 2 * r)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    const mid = a.clone().lerp(b, 0.5)
    this.add(new THREE.CapsuleGeometry(r, len, 4, 12), m, mid.x, mid.y, mid.z, q)
  }

  torus(r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, seg = 28): void {
    this.add(new THREE.TorusGeometry(r, tube, 8, seg), m, x, y, z, rot)
  }

  lathe(profile: [number, number][], m: THREE.Material, x = 0, y = 0, z = 0, seg = 20, rot?: THREE.Euler | THREE.Quaternion): void {
    this.add(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z, rot)
  }

  /** One mesh per material, added to `into`. */
  flush(into: THREE.Object3D, shadows = true): void {
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list.map(tidy), false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, m)
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      into.add(mesh)
    }
    this.parts.clear()
  }
}

/** Keeps only position, normal and uv (adding what is missing) so any two parts can merge. */
function tidy(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
  g.morphAttributes = {}
  return g
}

/** A range of a non-indexed geometry as its own geometry (one material group of a multi-material mesh). */
function sliceGeometry(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  const n = g.getAttribute('position').count
  const end = Math.min(n, start + (Number.isFinite(count) ? count : n))
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute
    out.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(start * a.itemSize, end * a.itemSize), a.itemSize))
  }
  return out
}

/** Children a bake leaves alone: a resident's turning head, and anything marked `userData.keep`. */
const KEEP_NAMES = new Set(['head', 'eyes', 'torso', 'badge'])

/**
 * Merges every static mesh under `root` into one mesh per material (and shadow flag), in root space.
 * Library props arrive as a dozen meshes each; baked, the whole set dressing is a few dozen draw calls.
 * Instanced meshes, lights and kept subtrees stay as they are.
 */
function bake(root: THREE.Object3D, label: string): void {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; parts: THREE.BufferGeometry[] }>()
  const done: THREE.Mesh[] = []
  const put = (g: THREE.BufferGeometry, material: THREE.Material, cast: boolean): void => {
    const key = `${material.uuid}:${cast}`
    const b = buckets.get(key) ?? { material, cast, parts: [] }
    b.parts.push(g)
    buckets.set(key, b)
  }
  const walk = (o: THREE.Object3D): void => {
    if (o !== root && (o.userData.keep === true || KEEP_NAMES.has(o.name))) return
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.visible) {
      const rel = inv.clone().multiply(o.matrixWorld)
      if (rel.determinant() > 0) {
        const src = o.geometry as THREE.BufferGeometry
        const g = tidy(src.index ? src.toNonIndexed() : src.clone())
        g.applyMatrix4(rel)
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        if (Array.isArray(o.material) && g.groups.length > 0) {
          for (const grp of g.groups) {
            const m = mats[grp.materialIndex ?? 0]
            if (m) put(sliceGeometry(g, grp.start, grp.count), m, o.castShadow)
          }
          g.dispose()
        } else {
          g.clearGroups()
          put(g, mats[0], o.castShadow)
        }
        done.push(o)
      }
    }
    for (const c of [...o.children]) walk(c)
  }
  walk(root)
  for (const o of done) o.removeFromParent()
  for (const { material, cast, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, material)
    mesh.name = `baked:${label}`
    mesh.castShadow = cast
    mesh.receiveShadow = true
    root.add(mesh)
  }
}

// ───────────────────────────── Local materials ─────────────────────────────

/**
 * Mustard distemper with the wear pass painted in once: vertical brush strokes, corner grime as
 * `1 − 0.10·smoothstep(0.75, 1, r)` toward each corner, darker grime along the skirting and, where
 * `scuff` names a span of u, a 40 mm scuff band 350 mm above the floor at −4 percent (beside a door).
 */
function wornDistemper(color: string, seed: string, wallW: number, wallH: number, scuff?: [number, number]): THREE.MeshStandardMaterial {
  const src = plasterTexture(color, seed).image as HTMLCanvasElement
  const W = 1024, H = Math.round((1024 * wallH) / wallW)
  const [canvas, ctx] = makeCanvas(W, H)
  // Tile the plaster at about 2.3 m a tile so the chalk keeps its scale.
  const tile = Math.round((W * 2.3) / wallW)
  for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) ctx.drawImage(src, x, y, tile, tile)
  const rnd = seeded(seed + ':brush')
  brush(ctx, W, H, shade(color, 0.9), shade(color, 1.06), 0, Math.round((W * H) / 700), rnd)
  const img = ctx.getImageData(0, 0, W, H)
  const px = img.data
  const bandLo = (0.35 - 0.02) / wallH, bandHi = (0.35 + 0.02) / wallH
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H
    const floorGrime = 1 - 0.07 * (1 - smoothstep(0, 0.09, v))
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W
      const r = Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2
      let k = (1 - 0.1 * smoothstep(0.75, 1, r)) * floorGrime
      if (scuff && v > bandLo && v < bandHi && u > scuff[0] && u < scuff[1]) k *= 0.96
      const i = (y * W + x) * 4
      px[i] *= k
      px[i + 1] *= k
      px[i + 2] *= k
    }
  }
  ctx.putImageData(img, 0, 0)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const bump = new THREE.CanvasTexture(canvas)
  bump.colorSpace = THREE.NoColorSpace
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.008, roughness: 0.96, metalness: 0 })
}

/** Ribbed cloth: corduroy (fine wale) or a knit (wide rib), over a felt tooth. */
function ribbed(color: string, wale: number, repeat: number, seed: string): THREE.MeshStandardMaterial {
  const src = feltTexture(color, seed).image as HTMLCanvasElement
  const size = src.width
  const [canvas, ctx] = makeCanvas(size, size)
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, size, size)
  const px = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const phase = (x % wale) / wale
      const k = 0.9 + 0.16 * Math.pow(Math.sin(phase * Math.PI), 1.5)
      const i = (y * size + x) * 4
      px[i] = Math.min(255, px[i] * k)
      px[i + 1] = Math.min(255, px[i + 1] * k)
      px[i + 2] = Math.min(255, px[i + 2] * k)
    }
  }
  ctx.putImageData(img, 0, 0)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(repeat, repeat)
  const bump = new THREE.CanvasTexture(canvas)
  bump.colorSpace = THREE.NoColorSpace
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.set(repeat, repeat)
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.012, roughness: 0.93, metalness: 0 })
}

/** The room's shared materials, made once so the bake can merge across furniture. */
interface Mats {
  pine: THREE.MeshStandardMaterial
  walnut: THREE.MeshStandardMaterial
  trim: THREE.Material
  ink: THREE.Material
  brass: THREE.Material
  brassInside: THREE.Material
  paper: THREE.Material
  cord: THREE.Material
  knit: THREE.Material
  olive: THREE.Material
  oliveLacquer: THREE.Material
}

function materials(p: RegionPalette): Mats {
  const brassInside = mat.brass().clone()
  brassInside.side = THREE.DoubleSide
  return {
    pine: mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'recorders:pine', repeat: [1, 1] }),
    walnut: mat.wood({ base: shade(p.woodGrain, 0.82), grain: p.ink, seed: 'recorders:walnut', repeat: [1, 1] }),
    trim: mat.lacquer(p.trim),
    ink: mat.lacquer(p.ink),
    brass: mat.brass(),
    brassInside,
    paper: mat.paper(p.paper),
    cord: ribbed(p.felt, 6, 3, 'recorders:corduroy'),
    knit: ribbed(p.accent, 10, 2, 'recorders:knit'),
    olive: mat.plaster(p.wallAlt),
    oliveLacquer: mat.lacquer(p.wallAlt),
  }
}

/** A small engraved brass plate with the object's inventory number. */
function hsPlate(label: string, p: RegionPalette, width = 0.07): THREE.Mesh {
  const m = placard({ lines: [label], width, height: width * 0.28, bg: p.brass, color: p.ink, border: p.ink })
  m.name = `tag:${label}`
  return m
}

// ───────────────────────────── The shell ─────────────────────────────

/** Floor, three distempered walls with their wear, the olive band, picture rail, skirting, cornice, ceiling. */
function shell(p: RegionPalette, m: Mats): THREE.Group {
  const { w, h, d } = ROOM
  const g = new THREE.Group()
  g.name = 'shell'

  const floor = props.floor({ colors: p, width: w, depth: d + 2, seed: 'recorders:floor' })
  floor.position.z = 1
  g.add(floor)

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wornDistemper(p.wall, 'recorders:back', w, h))
  back.position.set(0, h / 2, BACK_Z)
  back.receiveShadow = true
  g.add(back)
  // Left wall: u runs from the back corner toward +z. Right wall: u runs from the front toward the back.
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wornDistemper(p.wall, 'recorders:left', d, h))
  left.rotation.y = Math.PI / 2
  left.position.set(-w / 2, h / 2, 0)
  left.receiveShadow = true
  g.add(left)
  const du = (z: number): number => (z + d / 2) / d
  const scuffU: [number, number] = [du(WALL_ITEM_Z) - 0.8 / d, du(WALL_ITEM_Z) + 0.8 / d]
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wornDistemper(p.wall, 'recorders:right', d, h, scuffU))
  right.rotation.y = -Math.PI / 2
  right.position.set(w / 2, h / 2, 0)
  right.receiveShadow = true
  g.add(right)

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaster(shade(p.trim, 0.94)))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  g.add(ceiling)

  // The olive band: plain distemper between the picture rail and the cornice, on all three walls.
  const bandLo = 3.3, bandHi = 3.97, bandH = bandHi - bandLo, bandY = (bandLo + bandHi) / 2
  const kit = new Kit()
  kit.add(new THREE.PlaneGeometry(w, bandH), m.olive, 0, bandY, BACK_Z + 0.003)
  kit.add(new THREE.PlaneGeometry(d, bandH), m.olive, -w / 2 + 0.003, bandY, 0, new THREE.Euler(0, Math.PI / 2, 0))
  kit.add(new THREE.PlaneGeometry(d, bandH), m.olive, w / 2 - 0.003, bandY, 0, new THREE.Euler(0, -Math.PI / 2, 0))
  kit.flush(g, false)

  // Trims round three walls: skirting, dado rail, picture rail, the band's lower bead, a three-step cornice.
  const runs = [
    { len: w, x: 0, z: BACK_Z, rot: new THREE.Euler() },
    { len: d, x: -w / 2, z: 0, rot: new THREE.Euler(0, Math.PI / 2, 0) },
    { len: d, x: w / 2, z: 0, rot: new THREE.Euler(0, -Math.PI / 2, 0) },
  ]
  const plaster = mat.plaster(p.trim)
  for (const r of runs) {
    const along = (off: number, y: number, hh: number, t: number, material: THREE.Material): void => {
      const o = new THREE.Vector3(0, 0, off).applyEuler(r.rot)
      kit.box(r.len, hh, t, material, r.x + o.x, y, r.z + o.z, r.rot)
    }
    along(0.015, 0.07, 0.14, 0.03, m.trim)
    along(0.032, 0.145, 0.018, 0.02, m.trim)
    along(0.015, 1.0, 0.045, 0.03, m.trim)
    along(0.018, bandLo - 0.02, 0.045, 0.036, m.trim)
    along(0.012, bandLo + 0.012, 0.012, 0.024, m.oliveLacquer)
    along(0.08, h - 0.05, 0.1, 0.16, plaster)
    along(0.045, h - 0.14, 0.08, 0.09, plaster)
    along(0.025, h - 0.21, 0.06, 0.05, m.trim)
  }
  kit.flush(g, false)

  // Bare boards at the doorway: the paint worn through where the door is used.
  const bare = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshStandardMaterial({
    map: canvasTexture(64, 64, (c, cw, ch) => {
      const grad = c.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2)
      grad.addColorStop(0, rgba(p.paper, 0.2))
      grad.addColorStop(1, rgba(p.paper, 0))
      c.fillStyle = grad
      c.fillRect(0, 0, cw, ch)
    }),
    transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2,
  }))
  bare.rotation.x = -Math.PI / 2
  bare.position.set(w / 2 - 0.55, 0.002, WALL_ITEM_Z)
  bare.receiveShadow = true
  g.add(bare)
  return g
}

// ───────────────────────────── The window and the sea ─────────────────────────────

/** Flat September sky over the slate sea, painted foam lines, a pale haze at the horizon. */
function seaTexture(p: RegionPalette): THREE.CanvasTexture {
  const sea = tokens['out.sea'], foam = tokens['out.foam']
  return canvasTexture(512, 640, (c, w, h) => {
    const horizon = h * 0.36
    const sky = c.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, shade(p.sky, 0.95))
    sky.addColorStop(1, p.sky)
    c.fillStyle = sky
    c.fillRect(0, 0, w, horizon)
    const water = c.createLinearGradient(0, horizon, 0, h)
    water.addColorStop(0, mix(sea, p.sky, 0.28))
    water.addColorStop(0.25, sea)
    water.addColorStop(1, shade(sea, 0.9))
    c.fillStyle = water
    c.fillRect(0, horizon, w, h - horizon)
    c.fillStyle = rgba(foam, 0.55)
    c.fillRect(0, horizon - 1, w, 2)
    const rnd = seeded('recorders:clouds')
    brush(c, w, horizon, shade(p.sky, 0.93), p.paper, Math.PI / 2, 260, rnd)
  })
}

/** Horizontal painted foam lines on a transparent sheet; repeats in x so it can drift. */
function foamTexture(): THREE.CanvasTexture {
  const foam = tokens['out.foam']
  const tex = canvasTexture(512, 640, (c, w, h) => {
    c.clearRect(0, 0, w, h)
    const rnd = seeded('recorders:foam')
    const horizon = h * 0.36
    for (let i = 0; i < 26; i++) {
      const t = Math.pow(rnd(), 0.8)
      const y = horizon + 6 + t * (h - horizon - 12)
      const len = 30 + t * 110 + rnd() * 40
      const x = rnd() * w
      c.strokeStyle = rgba(foam, 0.35 + 0.35 * t)
      c.lineWidth = 1 + t * 2.5
      c.lineCap = 'round'
      for (const dx of [0, -w, w]) {
        c.beginPath()
        c.moveTo(x + dx, y)
        c.quadraticCurveTo(x + dx + len / 2, y - 2 - t * 3, x + dx + len, y)
        c.stroke()
      }
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

/** A sash window on the back wall (back at z = 0): the lit pane, the sea, glazing bars, the sill, curtains tied back. */
function seaWindow(p: RegionPalette, m: Mats): { group: THREE.Group; foam: THREE.CanvasTexture } {
  const g = new THREE.Group()
  g.name = 'window'
  const { w, h, sill } = WIN
  const d = 0.12, f = 0.07, cy = sill + h / 2, mid = d / 2
  const kit = new Kit()
  for (const s of [-1, 1]) kit.box(f, h, d, m.trim, s * (w / 2 - f / 2), cy, mid)
  kit.box(w, f, d, m.trim, 0, sill + h - f / 2, mid)
  kit.box(w, f, d, m.trim, 0, sill + f / 2, mid)
  const iw = w - 2 * f, ih = h - 2 * f
  // The middle bar is the room's line: the float hangs just right of it.
  kit.box(0.03, ih, 0.04, m.trim, 0, cy, mid)
  for (let j = 1; j < 3; j++) kit.box(iw, 0.028, 0.04, m.trim, 0, sill + f + (ih / 3) * j, mid)
  kit.box(iw, 0.05, 0.05, m.trim, 0, cy, mid)
  // Sill and architrave.
  kit.box(w + 0.18, 0.05, d + 0.1, m.trim, 0, sill - 0.025, mid + 0.05)
  kit.box(w + 0.1, 0.04, 0.03, m.trim, 0, sill - 0.07, 0.015)
  kit.box(w + 0.16, 0.09, 0.03, m.trim, 0, sill + h + 0.045, 0.015)
  for (const s of [-1, 1]) kit.box(0.08, h + 0.1, 0.03, m.trim, s * (w / 2 + 0.04), cy + 0.02, 0.015)
  kit.flush(g)

  const seaTex = seaTexture(p)
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({
    map: seaTex, emissiveMap: seaTex, emissive: new THREE.Color(p.paper), emissiveIntensity: 0.92, roughness: 0.9, metalness: 0,
  }))
  pane.position.set(0, cy, 0.01)
  g.add(pane)
  const foam = foamTexture()
  const foamSheet = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({
    map: foam, emissiveMap: foam, emissive: new THREE.Color(p.paper), emissiveIntensity: 0.9, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0,
  }))
  foamSheet.position.set(0, cy, 0.013)
  foamSheet.userData.keep = true
  g.add(foamSheet)

  // Curtains in the textile teal, tied back either side, on one brass rod.
  const cw = 0.5, ch = h + 0.5
  for (const s of [-1, 1]) {
    const panel = props.curtain({ colors: p, width: cw, height: ch, folds: 4, color: p.felt, rod: false, tieback: true })
    panel.position.set(s * (w / 2 + cw / 2 - 0.02), sill - 0.28, d + 0.03)
    g.add(panel)
  }
  const rod = new Kit()
  const rodY = sill + h + 0.28, rodW = w + cw * 2 + 0.2
  rod.rodX(0.013, rodW, m.brass, 0, rodY, d + 0.09)
  for (const s of [-1, 1]) {
    rod.sphere(0.028, m.brass, s * (rodW / 2 + 0.02), rodY, d + 0.09)
    rod.box(0.025, 0.025, 0.1, m.brass, s * (rodW / 2 - 0.12), rodY, d + 0.04)
  }
  rod.flush(g)
  return { group: g, foam }
}

// ───────────────────────────── The bed and the badge ─────────────────────────────

/** A child's single bed, head at −z: turned posts, a sheet, the corduroy blanket turned down, one pillow. */
function bed(p: RegionPalette, m: Mats): { group: THREE.Group; pillowTop: THREE.Vector3 } {
  const g = new THREE.Group()
  g.name = 'bed'
  const w = 0.95, l = 1.95
  const kit = new Kit()
  kit.box(w, 0.14, l, m.pine, 0, 0.27, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl(0.03, 0.04, 0.2, m.ink, sx * (w / 2 - 0.06), 0.1, sz * (l / 2 - 0.06), 12)
  const post: [number, number][] = [[0.035, 0], [0.035, 0.82], [0.045, 0.86], [0.03, 0.9], [0.03, 1.05], [0.045, 1.09], [0.04, 1.12], [0.018, 1.16], [0, 1.19]]
  const footPost = post.map(([r, y]) => [r, y * 0.62] as [number, number])
  for (const sx of [-1, 1]) {
    kit.lathe(post, m.pine, sx * (w / 2 + 0.03), 0, -l / 2 - 0.035, 16)
    kit.lathe(footPost, m.pine, sx * (w / 2 + 0.03), 0, l / 2 + 0.035, 16)
  }
  // Headboard: a frame with five spindles; footboard a plain panel.
  kit.box(w, 0.08, 0.045, m.pine, 0, 1.0, -l / 2 - 0.035)
  kit.box(w, 0.06, 0.045, m.pine, 0, 0.5, -l / 2 - 0.035)
  for (let i = 0; i < 5; i++) kit.cyl(0.014, 0.014, 0.44, m.pine, (i - 2) * (w / 6), 0.75, -l / 2 - 0.035, 10)
  kit.box(w + 0.02, 0.035, 0.07, m.trim, 0, 1.055, -l / 2 - 0.035)
  kit.box(w, 0.36, 0.04, m.pine, 0, 0.44, l / 2 + 0.035)
  kit.box(w + 0.02, 0.035, 0.06, m.trim, 0, 0.64, l / 2 + 0.035)
  // Mattress and sheet.
  kit.box(w - 0.05, 0.18, l - 0.05, m.paper, 0, 0.43, 0)
  // The blanket: over the top from the turn-down to the foot, down both sides and the foot.
  const bz0 = -l / 2 + 0.55, bz1 = l / 2 - 0.02
  const bl = bz1 - bz0, bc = (bz0 + bz1) / 2
  kit.box(w - 0.01, 0.028, bl, m.cord, 0, 0.535, bc)
  for (const sx of [-1, 1]) kit.box(0.02, 0.24, bl, m.cord, sx * (w / 2 - 0.012), 0.43, bc)
  kit.box(w - 0.01, 0.24, 0.02, m.cord, 0, 0.43, bz1 + 0.008)
  // Turned down: the sheet folded back over the blanket's head edge, the blanket's fold under it.
  kit.box(w - 0.01, 0.045, 0.1, m.cord, 0, 0.55, bz0 + 0.04, new THREE.Euler(0.05, 0, 0))
  kit.box(w - 0.005, 0.03, 0.22, m.paper, 0, 0.568, bz0 + 0.1)
  kit.box(w - 0.03, 0.012, 0.08, m.cord, 0, 0.586, bz0 + 0.17)
  // One pillow, plumped, square to the headboard.
  const pz = -l / 2 + 0.24
  kit.box(0.6, 0.13, 0.36, m.paper, 0, 0.585, pz, new THREE.Euler(-0.22, 0, 0))
  kit.flush(g)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 14), mat.felt(p.felt))
    foot.position.set(sx * (w / 2 - 0.06), 0.004, sz * (l / 2 - 0.06))
    g.add(foot)
  }
  return { group: g, pillowTop: new THREE.Vector3(0, 0.605, pz + 0.215) }
}

/** The Recorder's badge: raspberry felt, a brass ring, a paper quill and four hundred and six stitches. */
function badge(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'recordersBadge'
  const r = 0.055
  const tex = canvasTexture(256, 256, (c, w) => {
    const cx = w / 2
    c.clearRect(0, 0, w, w)
    c.fillStyle = p.accent
    c.beginPath(); c.arc(cx, cx, cx - 2, 0, Math.PI * 2); c.fill()
    c.strokeStyle = p.brass
    c.lineWidth = 10
    c.beginPath(); c.arc(cx, cx, cx - 10, 0, Math.PI * 2); c.stroke()
    // 406 stitches: two rings of running stitch and the quill's satin stitch.
    c.strokeStyle = p.paper
    c.lineWidth = 1.6
    let n = 0
    const ring = (rad: number, count: number): void => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2
        c.beginPath()
        c.moveTo(cx + Math.cos(a) * rad, cx + Math.sin(a) * rad)
        c.lineTo(cx + Math.cos(a + 0.6 / count * 4) * rad, cx + Math.sin(a + 0.6 / count * 4) * rad)
        c.stroke()
        n++
      }
    }
    ring(cx - 24, 150)
    ring(cx - 34, 130)
    // The quill: a diagonal feather of satin stitches.
    const quill = 406 - n
    for (let i = 0; i < quill; i++) {
      const t = i / quill
      const x = cx - 52 + t * 104, y = cx + 52 - t * 104
      const half = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 22
      c.beginPath()
      c.moveTo(x - half * 0.7, y - half * 0.7)
      c.lineTo(x + half * 0.7, y + half * 0.7)
      c.stroke()
    }
    c.fillStyle = p.ink
    c.fillRect(cx - 58, cx + 50, 14, 4)
  })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.95, metalness: 0 }))
  disc.castShadow = true
  disc.receiveShadow = true
  g.add(disc)
  const back = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 36), mat.felt(p.accent))
  back.rotation.x = Math.PI / 2
  back.position.z = -0.0025
  g.add(back)
  const plate = placard({ lines: ['HS-0409'], width: 0.05, height: 0.015, bg: p.paper, color: p.ink, border: p.ink })
  plate.position.set(0, -r - 0.014, 0.001)
  g.add(plate)
  return g
}

// ───────────────────────────── The desk, the Olivetti, the postcard ─────────────────────────────

/** A plain pine writing table on tapered legs, one drawer toward the sitter; origin at the floor centre. */
function writingTable(m: Mats): THREE.Group {
  const g = new THREE.Group()
  g.name = 'desk'
  const { w, d, h } = DESK
  const kit = new Kit()
  kit.box(w, 0.035, d, m.pine, 0, h - 0.0175, 0)
  kit.box(w - 0.1, 0.1, d - 0.1, m.pine, 0, h - 0.035 - 0.05, 0)
  kit.box(w - 0.06, 0.012, 0.012, m.trim, 0, h - 0.035 - 0.004, d / 2 - 0.045)
  const legH = h - 0.035
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.cyl(0.022, 0.03, legH, m.pine, sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.07), 4, new THREE.Euler(0, Math.PI / 4, 0))
  }
  // The drawer faces the sitter, its brass pull on her side.
  kit.box(0.42, 0.075, 0.012, m.pine, 0, h - 0.085, -d / 2 + 0.045)
  kit.sphere(0.012, m.brass, 0, h - 0.085, -d / 2 + 0.03)
  kit.flush(g)
  return g
}

/** The Olivetti: the library typewriter in Lettera blue, turned toward Ida, the August page in the platen. */
function olivetti(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'olivetti'
  const lines = ['AUGUST', '', dressing.augustPage.split('. ').slice(0, 2).join('. ') + '.', dressing.augustPage.split('. ').slice(2).join('. ')]
  const tw = props.typewriter({ colors: p, color: tokens['br.wall'], lines })
  // The sheet reads toward the sitter; from the room its back is plain paper, not type seen through.
  const sheets: THREE.Mesh[] = []
  tw.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry) sheets.push(o) })
  for (const o of sheets) {
    const src = o.material as THREE.MeshStandardMaterial
    const front = src.clone()
    front.side = THREE.FrontSide
    o.material = front
    // Only the head of the page stands out of the platen, so her face shows over it.
    const tall = 0.2, short = 0.1, lean = 0.3
    const geo = new THREE.PlaneGeometry(0.21, short)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (1 - uv.getY(i)) * (short / tall))
    o.geometry = geo
    o.position.y -= ((tall - short) / 2) * Math.cos(lean)
    o.position.z -= ((tall - short) / 2) * Math.sin(lean)
    const backSheet = new THREE.Mesh(geo, mat.paper(p.paper))
    backSheet.rotation.y = Math.PI
    o.add(backSheet)
  }
  tw.rotation.y = Math.PI
  g.add(tw)
  const tag = hsPlate('HS-0401', p, 0.07)
  tag.position.set(0, 0.066, 0.1415)
  g.add(tag)
  return g
}

/** The postcard, addressed and not typed, propped against the stack of pages; a paper plate before it. */
function postcard(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'postcard'
  const w = 0.148, h = 0.105
  const tex = canvasTexture(512, 364, (c, cw, ch) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, cw, ch)
    const rnd = seeded('recorders:postcard')
    brush(c, cw, ch, shade(p.paper, 0.9), shade(p.paper, 0.96), Math.PI / 2, 80, rnd)
    c.strokeStyle = rgba(p.ink, 0.55)
    c.lineWidth = 2
    c.beginPath(); c.moveTo(cw * 0.5, ch * 0.12); c.lineTo(cw * 0.5, ch * 0.88); c.stroke()
    // The stamp and its postmark.
    c.fillStyle = p.accent
    c.fillRect(cw - 96, 22, 70, 84)
    c.strokeStyle = p.paper
    c.setLineDash([4, 4])
    c.strokeRect(cw - 90, 28, 58, 72)
    c.setLineDash([])
    c.strokeStyle = rgba(p.ink, 0.6)
    c.lineWidth = 2.5
    c.beginPath(); c.arc(cw - 110, 76, 30, 0, Math.PI * 2); c.stroke()
    // The address in her hand's typed capitals, ruled lines under it.
    c.strokeStyle = rgba(p.ink, 0.35)
    c.lineWidth = 1.5
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cw * 0.54, 190 + i * 52); c.lineTo(cw - 26, 190 + i * 52); c.stroke() }
    text(c, 'A. Hardy', cw * 0.55, 172, 30, p.ink, { font: 'mono', weight: 700, spacing: 0, align: 'left' })
    text(c, 'c/o the Society', cw * 0.55, 224, 26, p.ink, { font: 'mono', weight: 700, spacing: 0, align: 'left' })
    text(c, 'Kettle', cw * 0.55, 276, 26, p.ink, { font: 'mono', weight: 700, spacing: 0, align: 'left' })
  })
  const card = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.0015), [mat.paper(p.paper), mat.paper(p.paper), mat.paper(p.paper), mat.paper(p.paper), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }), mat.paper(p.paper)])
  card.position.set(0, (h / 2) * Math.cos(0.35), -(h / 2) * Math.sin(0.35))
  card.rotation.x = -0.35
  card.castShadow = true
  card.receiveShadow = true
  g.add(card)
  const plate = hsPlate('HS-0410', p, 0.06)
  plate.rotation.x = -0.9
  plate.position.set(0, 0.008, 0.05)
  g.add(plate)
  return g
}

/** A squared stack of foolscap pages; origin on the table. */
function pageStack(kit: Kit, m: Mats, x: number, z: number, height: number): void {
  kit.box(0.21, height, 0.297, m.paper, x, height / 2, z)
  kit.box(0.2, 0.002, 0.285, m.paper, x + 0.004, height + 0.001, z - 0.003, new THREE.Euler(0, 0.03, 0))
}

// ───────────────────────────── The chair, the cardigan, Ida ─────────────────────────────

/** The raspberry cardigan over the chair's back: a roll over the top rail, the body hanging behind, the sleeves down the sides. */
function cardigan(m: Mats, top: number, backZ: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cardigan'
  const kit = new Kit()
  const k = m.knit
  kit.rodX(0.032, 0.5, k, 0, top + 0.012, backZ, 14)
  kit.box(0.48, 0.44, 0.03, k, 0, top - 0.21, backZ - 0.04, new THREE.Euler(0.06, 0, 0))
  kit.box(0.48, 0.05, 0.036, k, 0, top - 0.43, backZ - 0.05, new THREE.Euler(0.06, 0, 0))
  kit.box(0.46, 0.1, 0.022, k, 0, top - 0.04, backZ + 0.035, new THREE.Euler(-0.1, 0, 0))
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * 0.24, top + 0.005, backZ + 0.01)
    const b = new THREE.Vector3(s * 0.285, top - 0.36, backZ + 0.07)
    kit.capsule(a, b, 0.036, k)
    kit.cyl(0.038, 0.038, 0.05, k, b.x, b.y - 0.04, b.z, 12)
  }
  kit.flush(g)
  return g
}

/** Ida seated at the desk facing the room, her arms brought forward to the keys (the library figure's arms hang). */
function idaTyping(m: Mats, keys: THREE.Vector3): THREE.Group {
  const seat = 0.5
  const colors = { cardigan: FIGURE_COLORS.jersey }
  const fig = figure({ variant: 'ida', seated: true, seatHeight: seat, colors })
  const s = FIGURE_HEIGHTS.ida / 1.72
  const hipY = seat + 0.02, torsoLen = 0.52 * s
  const shoulderY = hipY + torsoLen - 0.04 * s
  // Replace the hanging arms and hands with arms reaching the keys.
  let jersey: THREE.Material | undefined
  let skin: THREE.Material | undefined
  for (const o of [...fig.children]) {
    if (!(o instanceof THREE.Mesh)) continue
    const arm = o.geometry instanceof THREE.CapsuleGeometry && Math.abs(o.position.x) > 0.15 * s && o.position.y > hipY + 0.1
    const hand = o.geometry instanceof THREE.SphereGeometry && Math.abs(o.position.x) > 0.2 * s && o.position.y < shoulderY - 0.3 * s
    if (arm) { jersey = o.material as THREE.Material; o.removeFromParent() }
    if (hand) { skin = o.material as THREE.Material; o.removeFromParent() }
  }
  const kit = new Kit()
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.2 * s, shoulderY - 0.04 * s, 0.01)
    const elbow = new THREE.Vector3(side * 0.24 * s, shoulderY - 0.2, 0.13)
    const hand = new THREE.Vector3(side * 0.085, keys.y + 0.03, keys.z)
    kit.capsule(shoulder, elbow, 0.048 * s, jersey ?? m.knit)
    kit.capsule(elbow, hand, 0.042 * s, jersey ?? m.knit)
    kit.sphere(0.038 * s, skin ?? m.paper, hand.x, hand.y, hand.z + 0.01, 12, new THREE.Vector3(1, 0.7, 1.2))
  }
  kit.flush(fig)
  return fig
}

// ───────────────────────────── The shelf of eleven ─────────────────────────────

/** The eleven books on a wall shelf with brass bookends: one atlas, one draw call for all spines. */
function bookShelf(p: RegionPalette, m: Mats): THREE.Group {
  const g = new THREE.Group()
  g.name = 'books'
  const titles = dressing.books
  const rnd = seeded('recorders:books')
  const cloths: [string, string][] = [
    [p.felt, p.paper], [p.accent, p.paper], [p.wallAlt, p.paper], [p.woodGrain, p.brass], [p.ink, p.brass],
    [p.paper, p.ink], [shade(p.felt, 0.8), p.brass], [p.brass, p.ink], [shade(p.accent, 0.82), p.paper], [shade(p.wallAlt, 0.8), p.brass], [p.trim, p.accent],
  ]
  const AW = 1024, AH = 512, col = 88
  const dims = titles.map(() => ({ t: 0.03 + rnd() * 0.016, h: 0.2 + rnd() * 0.045, d: 0.15 + rnd() * 0.02 }))
  const atlas = canvasTexture(AW, AH, (c) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, AW, AH)
    titles.forEach((title, i) => {
      const [cloth, ink] = cloths[i % cloths.length]
      const x0 = i * col
      c.fillStyle = cloth
      c.fillRect(x0, 0, col, AH)
      brush(c, col, AH, shade(cloth, 0.88), shade(cloth, 1.1), 0, 60, seeded(`recorders:spine${i}`))
      c.fillStyle = ink
      for (const y of [18, 26, AH - 30, AH - 22]) c.fillRect(x0 + 8, y, col - 16, 3)
      // Title down the spine.
      c.save()
      c.translate(x0 + col / 2, AH / 2 - 14)
      c.rotate(Math.PI / 2)
      const upper = title.toUpperCase()
      const size = fitText(c, upper, 40, AH - 150, 0.14)
      text(c, upper, 0, 0, Math.min(size, col * 0.46), ink, { spacing: 0.14 })
      c.restore()
      // The stamp: a small roundel with the shelf number.
      c.strokeStyle = ink
      c.lineWidth = 2
      c.beginPath(); c.arc(x0 + col / 2, AH - 62, 14, 0, Math.PI * 2); c.stroke()
      text(c, String(i + 1), x0 + col / 2, AH - 61, 15, ink, { spacing: 0 })
    })
  })
  const books = new Kit()
  const bookMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.82, metalness: 0 })
  const run = dims.reduce((a, b) => a + b.t + 0.003, 0) - 0.003
  const pagesUV: UVRect = [(col * 11 + 8) / AW, 0.1, (AW - 8) / AW, 0.9]
  let x = -run / 2
  dims.forEach((b, i) => {
    const spine: UVRect = [(i * col + 3) / AW, 0.02, ((i + 1) * col - 3) / AW, 0.98]
    const clothUV: UVRect = [(i * col + 2) / AW, 0.3, (i * col + 6) / AW, 0.34]
    const geo = atlasBox(b.t, b.h, b.d, [clothUV, clothUV, pagesUV, clothUV, spine, pagesUV])
    books.add(geo, bookMat, x + b.t / 2, b.h / 2, 0.012 + b.d / 2 + (0.18 - b.d))
    x += b.t + 0.003
  })
  books.flush(g)

  const sw = 0.86, sd = 0.22
  const kit = new Kit()
  kit.box(sw, 0.028, sd, m.pine, 0, -0.014, sd / 2)
  kit.box(sw, 0.02, 0.012, m.trim, 0, -0.024, sd + 0.006)
  for (const s of [-1, 1]) {
    // Brackets under the board, bookends at the ends of the row.
    kit.box(0.022, 0.16, 0.022, m.brass, s * (sw / 2 - 0.1), -0.108, 0.011)
    kit.box(0.022, 0.022, sd - 0.03, m.brass, s * (sw / 2 - 0.1), -0.039, (sd - 0.03) / 2)
    kit.box(0.02, 0.022, 0.18, m.brass, s * (sw / 2 - 0.1), -0.1, 0.07, new THREE.Euler(Math.PI / 4.6, 0, 0))
    kit.box(0.004, 0.16, 0.12, m.brass, s * (run / 2 + 0.006), 0.08, 0.1)
    kit.box(0.05, 0.004, 0.12, m.brass, s * (run / 2 + 0.03), 0.002, 0.1)
  }
  kit.flush(g)
  const tag = hsPlate('HS-0403', p, 0.07)
  tag.position.set(0, -0.024, sd + 0.0125)
  g.add(tag)
  return g
}

// ───────────────────────────── The gramophone and its records ─────────────────────────────

/** Four record sleeves in one atlas: a die-cut hole, the record's label, a numeral tab at the top left. */
function recordAtlas(p: RegionPalette): THREE.CanvasTexture {
  const sleeves = [p.paper, p.wallAlt, p.felt, shade(p.paper, 0.9)]
  const labels = [p.accent, p.brass, p.felt, p.paper]
  return canvasTexture(1024, 256, (c) => {
    dressing.records.forEach((full, i) => {
      const x0 = i * 256, cx = x0 + 128, cy = 136
      c.fillStyle = sleeves[i]
      c.fillRect(x0, 0, 256, 256)
      brush(c, 256, 256, shade(sleeves[i], 0.9), shade(sleeves[i], 1.05), 0, 40, seeded(`recorders:sleeve${i}`))
      c.fillStyle = p.ink
      c.beginPath(); c.arc(cx, cy, 76, 0, Math.PI * 2); c.fill()
      c.strokeStyle = rgba(p.paper, 0.12)
      c.lineWidth = 1
      for (let r = 44; r < 74; r += 4) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke() }
      c.fillStyle = labels[i]
      c.beginPath(); c.arc(cx, cy, 36, 0, Math.PI * 2); c.fill()
      const ink = i === 3 ? p.ink : p.paper
      text(c, String(i + 1), cx, cy + 1, 30, ink, { spacing: 0, weight: 600 })
      // Top-left tab with the numeral, the only part of records 1 to 3 that shows past the next sleeve.
      c.fillStyle = p.paper
      c.fillRect(x0 + 10, 10, 64, 64)
      c.strokeStyle = p.ink
      c.lineWidth = 2
      c.strokeRect(x0 + 14, 14, 56, 56)
      text(c, String(i + 1), x0 + 42, 43, 42, p.ink, { spacing: 0, weight: 600 })
      // The label's wording, small along the foot of the sleeve.
      const words = full.replace(/^\d+ · ?/, '') || '4'
      const size = fitText(c, words.toUpperCase(), 12, 230, 0.1)
      text(c, words.toUpperCase(), cx, 236, size, i === 2 ? p.paper : p.ink, { spacing: 0.1 })
    })
  })
}

/** The gramophone at the bed's foot: its stand, the case, a brass horn, and four records leaning against the stand. */
function gramophone(p: RegionPalette, m: Mats): THREE.Group {
  const g = new THREE.Group()
  g.name = 'gramophone'
  const stand = props.cabinet({ colors: p, width: STAND.w, height: STAND.h, depth: STAND.d, doors: p.wallAlt, seed: 'recorders:stand' })
  g.add(stand)
  const player = props.recordPlayer({ colors: p, color: p.felt, label: p.paper })
  // A horn gramophone has no lid: the library player's lid is left off.
  for (const c of [...player.children]) if (c instanceof THREE.Group) c.removeFromParent()
  player.position.set(0, STAND.h, 0)
  g.add(player)

  // The brass horn: a support, an elbow, then the bell rising toward the room.
  const kit = new Kit()
  const base = new THREE.Vector3(-0.15, STAND.h + 0.14, -0.13)
  kit.cyl(0.018, 0.022, 0.1, m.brass, base.x, base.y + 0.05, base.z, 14)
  kit.sphere(0.024, m.brass, base.x, base.y + 0.11, base.z, 14)
  const dir = new THREE.Vector3(-0.5, 0.62, 0.6).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const L = 0.5
  const profile: [number, number][] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    profile.push([0.014 + 0.2 * Math.pow(t, 3.2), t * L])
  }
  const throat = new THREE.Vector3(base.x, base.y + 0.11, base.z)
  kit.lathe(profile, m.brassInside, throat.x, throat.y, throat.z, 36, q)
  const rim = throat.clone().addScaledVector(dir, L)
  kit.add(new THREE.TorusGeometry(0.214, 0.006, 8, 48), m.brass, rim.x, rim.y, rim.z, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir))
  kit.flush(g)

  // Four records leaning against the stand, fanned left to right, 1 at the back.
  const atlas = recordAtlas(p)
  const recMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85, metalness: 0 })
  const recs = new Kit()
  const sz = 0.3, lean = 0.3
  for (let i = 0; i < 4; i++) {
    const face: UVRect = [(i * 256) / 1024, 0, ((i + 1) * 256) / 1024, 1]
    const edge: UVRect = [(i * 256 + 4) / 1024, 0.9, (i * 256 + 8) / 1024, 0.95]
    const geo = atlasBox(sz, sz, 0.006, [edge, edge, edge, edge, face, edge])
    const x = -0.15 + i * 0.1
    const z = STAND.d / 2 + 0.03 + Math.sin(lean) * sz / 2 + i * 0.014
    recs.add(geo, recMat, x, Math.cos(lean) * sz / 2 + 0.003, z, new THREE.Euler(-lean, 0, 0))
  }
  recs.flush(g)
  const tag = hsPlate('HS-0405', p, 0.07)
  tag.position.set(0, STAND.h + 0.075, 0.1815)
  g.add(tag)
  return g
}

// ───────────────────────────── The harmonium ─────────────────────────────

/** His harmonium in walnut, built facing +z with its back at z = 0: keys, two pedals, a row of stops, one out. */
function harmonium(p: RegionPalette, m: Mats): THREE.Group {
  const g = new THREE.Group()
  g.name = 'harmonium'
  const w = 1.15, d = 0.5, keyY = 0.8
  const kit = new Kit()
  const wal = m.walnut
  // Lower case on a plinth, with the knee panel set in.
  kit.box(w, 0.08, d, m.ink, 0, 0.04, d / 2)
  kit.box(w - 0.02, keyY - 0.1, d - 0.04, wal, 0, 0.08 + (keyY - 0.1) / 2, (d - 0.04) / 2)
  for (const s of [-1, 1]) {
    kit.box(0.07, keyY - 0.06, 0.06, wal, s * (w / 2 - 0.035), 0.06 + (keyY - 0.06) / 2, d - 0.02)
    kit.lathe([[0.0, 0], [0.03, 0], [0.03, 0.04], [0.02, 0.07], [0.028, 0.1], [0.0, 0.13]], wal, s * (w / 2 - 0.035), keyY - 0.03, d + 0.03, 14)
  }
  kit.box(w - 0.3, 0.36, 0.015, wal, 0, 0.36, d - 0.03)
  kit.box(w - 0.36, 0.3, 0.012, m.oliveLacquer, 0, 0.36, d - 0.02)
  // Key bed, keys, cheek blocks, key slip.
  kit.box(w - 0.02, 0.04, 0.26, wal, 0, keyY - 0.02, d - 0.08)
  kit.box(0.82, 0.018, 0.14, m.paper, 0, keyY + 0.009, d - 0.06)
  kit.box(w - 0.02, 0.03, 0.02, wal, 0, keyY - 0.01, d + 0.035)
  // Upper case: the stop rail, a back rising to a small galleried shelf.
  const upperH = 0.55
  kit.box(w - 0.02, upperH, 0.2, wal, 0, keyY + 0.02 + upperH / 2, 0.1)
  kit.box(w - 0.02, 0.1, 0.06, wal, 0, keyY + 0.12, 0.23)
  kit.box(w + 0.04, 0.035, 0.26, wal, 0, keyY + 0.04 + upperH, 0.12)
  kit.box(w - 0.36, 0.26, 0.01, mat.felt(p.felt), 0, keyY + 0.37, 0.204)
  for (const s of [-1, 1]) kit.box(0.02, 0.28, 0.016, wal, s * (w / 2 - 0.17), keyY + 0.37, 0.206)
  kit.box(w - 0.32, 0.02, 0.016, wal, 0, keyY + 0.5, 0.206)
  kit.box(w - 0.32, 0.02, 0.016, wal, 0, keyY + 0.24, 0.206)
  // The music desk, folded down against the case: an angled board with a lip.
  kit.box(0.62, 0.2, 0.014, wal, 0, keyY + 0.3, 0.25, new THREE.Euler(-0.28, 0, 0))
  kit.box(0.62, 0.02, 0.04, wal, 0, keyY + 0.2, 0.29)
  // Candle brackets either side of the upper case.
  for (const s of [-1, 1]) {
    kit.box(0.1, 0.014, 0.1, m.brass, s * (w / 2 - 0.06), keyY + 0.34, 0.25)
    kit.cyl(0.018, 0.018, 0.1, m.paper, s * (w / 2 - 0.06), keyY + 0.397, 0.26, 12)
  }
  // Pediment: a shallow gable over the cornice.
  kit.box(w * 0.5, 0.07, 0.04, wal, 0, keyY + 0.09 + upperH, 0.2)
  // Two treadles, carpeted.
  for (const s of [-1, 1]) {
    kit.box(0.2, 0.025, 0.3, wal, s * 0.17, 0.12, d + 0.06, new THREE.Euler(-0.32, 0, 0))
    kit.box(0.17, 0.006, 0.26, mat.felt(p.wallAlt), s * 0.17, 0.137, d + 0.065, new THREE.Euler(-0.32, 0, 0))
  }
  kit.flush(g)
  // The keys: sharps in ink, instanced.
  const black: number[] = []
  const whiteW = 0.82 / 28
  for (let i = 0; i < 27; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) black.push(-0.41 + whiteW * (i + 1))
  const sharps = new THREE.InstancedMesh(new THREE.BoxGeometry(whiteW * 0.55, 0.014, 0.085), m.ink, black.length)
  const mt = new THREE.Matrix4()
  black.forEach((x, i) => sharps.setMatrixAt(i, mt.makeTranslation(x, keyY + 0.024, d - 0.09)))
  sharps.castShadow = true
  g.add(sharps)
  const keyLines = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.14), new THREE.MeshStandardMaterial({
    map: canvasTexture(512, 64, (c, cw, ch) => {
      c.clearRect(0, 0, cw, ch)
      c.fillStyle = rgba(p.ink, 0.55)
      for (let i = 1; i < 28; i++) c.fillRect(Math.round((cw / 28) * i), 0, 1, ch)
    }),
    transparent: true, depthWrite: false, roughness: 0.6, metalness: 0,
  }))
  keyLines.rotation.x = -Math.PI / 2
  keyLines.position.set(0, keyY + 0.0185, d - 0.06)
  g.add(keyLines)
  // The stops: ten in a row on the rail, one pulled out.
  const n = 10, out = 6
  const shaft = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10), m.walnut, n)
  const face = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 18), m.paper, n)
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  const one = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < n; i++) {
    const x = -0.36 + i * 0.08
    const pulled = i === out ? 0.04 : 0
    shaft.setMatrixAt(i, mt.compose(new THREE.Vector3(x, keyY + 0.12, 0.26 + pulled / 2), rot, one))
    face.setMatrixAt(i, mt.compose(new THREE.Vector3(x, keyY + 0.12, 0.285 + pulled), rot, one))
  }
  shaft.castShadow = true
  face.castShadow = true
  g.add(shaft, face)
  const tag = hsPlate('HS-0406', p, 0.08)
  tag.position.set(0, keyY + 0.46, 0.2135)
  g.add(tag)
  return g
}

// ───────────────────────────── The door ─────────────────────────────

/** A cased doorway (back at z = 0, facing +z) with a panelled olive leaf ajar and the destination on a plate above. */
function doorway(hs: HotspotDef, p: RegionPalette, m: Mats): THREE.Group {
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const w = 1.0, h = 2.2, jamb = 0.1, d = 0.14
  const kit = new Kit()
  for (const s of [-1, 1]) kit.box(jamb, h, d, m.trim, s * (w / 2 + jamb / 2), h / 2, d / 2)
  kit.box(w + jamb * 2, jamb, d, m.trim, 0, h + jamb / 2, d / 2)
  kit.box(w + jamb * 2 + 0.12, 0.06, 0.03, m.trim, 0, h + jamb + 0.03, d + 0.015)
  kit.box(w, 0.012, d, m.brass, 0, 0.006, d / 2)
  kit.flush(g, false)
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.flat(shade(p.ink, 1.2)))
  dark.position.set(0, h / 2, 0.004)
  g.add(dark)
  const pivot = new THREE.Group()
  pivot.position.set(-w / 2, 0, d - 0.03)
  pivot.rotation.y = -0.55
  const lw = w - 0.02, lh = h - 0.02, t = 0.045
  const leaf = new Kit()
  leaf.box(lw, lh, t, m.oliveLacquer, lw / 2 + 0.01, lh / 2, 0)
  const panelW = lw - 0.22, upper = lh * 0.42, lower = lh * 0.3
  for (const s of [-1, 1]) {
    leaf.box(panelW, upper, 0.012, m.oliveLacquer, lw / 2 + 0.01, lh - 0.14 - upper / 2, s * (t / 2 + 0.006))
    leaf.box(panelW, lower, 0.012, m.oliveLacquer, lw / 2 + 0.01, 0.14 + lower / 2, s * (t / 2 + 0.006))
    leaf.sphere(0.022, m.brass, lw - 0.08, 1.0, s * (t / 2 + 0.02), 14)
  }
  for (const y of [0.25, lh / 2, lh - 0.25]) leaf.box(0.012, 0.09, t + 0.01, m.brass, 0.016, y, 0)
  leaf.flush(pivot)
  g.add(pivot)
  const plate = placard({ lines: [hs.label], width: 0.7, height: 0.14, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `plate:${hs.label}`
  plate.position.set(0, h + jamb + 0.26, d + 0.035)
  g.add(plate)
  return g
}

// ───────────────────────────── The float (the flaw) ─────────────────────────────

/** A green glass fishing float in a knotted net, hung on a string from a brass hook; origin at the ceiling. */
function glassFloat(p: RegionPalette, drop: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'float'
  const r = FLOAT.r
  const glass = new THREE.MeshPhysicalMaterial({
    color: tokens['out.pine'], emissive: new THREE.Color(tokens['out.pine']), emissiveIntensity: 0.35,
    roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.82,
  })
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), glass)
  ball.position.y = -drop
  ball.castShadow = true
  g.add(ball)
  const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 12, 8), new THREE.MeshStandardMaterial({ color: p.paper, emissive: new THREE.Color(p.paper), emissiveIntensity: 0.6, roughness: 0.2 }))
  glint.scale.set(1, 0.6, 0.3)
  glint.position.set(-r * 0.42, -drop + r * 0.46, r * 0.72)
  g.add(glint)
  const kit = new Kit()
  const cord = mat.flat(shade(p.paper, 0.78))
  // The net: a ring at the equator, four meridians, a knot at the top where the string ties on.
  kit.torus(r + 0.002, 0.0022, cord, 0, -drop, 0, new THREE.Euler(Math.PI / 2, 0, 0), 40)
  for (let i = 0; i < 4; i++) kit.torus(r + 0.002, 0.0018, cord, 0, -drop, 0, new THREE.Euler(0, (i * Math.PI) / 4, 0), 40)
  kit.sphere(0.009, cord, 0, -drop + r + 0.004, 0, 8)
  kit.cyl(0.0016, 0.0016, drop - r, cord, 0, -(drop - r) / 2, 0, 6)
  kit.cyl(0.02, 0.026, 0.014, mat.brass(), 0, -0.007, 0, 16)
  kit.torus(0.008, 0.002, mat.brass(), 0, -0.022, 0, undefined, 16)
  kit.flush(g)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/** Builds the Recorder's Room in local space: origin at the floor centre, open toward +z, back wall at z = −3. */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const m = materials(p)
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const hs = (id: string): HotspotDef | undefined => ctx.def.hotspots.find((h) => h.id === id)
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }
  /** Everything that is not a hotspot: baked together at the end into one mesh per material. */
  const set = new THREE.Group()
  set.name = 'set'
  group.add(set)

  set.add(shell(p, m))

  // The window, centred, the sea beyond; a radiator under the sill.
  const win = seaWindow(p, m)
  win.group.position.set(0, 0, BACK_Z)
  set.add(win.group)
  const rad = props.radiator({ colors: p, width: 0.9, height: 0.55 })
  rad.position.set(0, 0, BACK_Z)
  set.add(rad)

  // Two sconces flank the window: the room's two warm lights.
  for (const s of [-1, 1]) {
    const sc = props.sconce({ colors: p, height: 2.0, lit: true })
    sc.position.set(s * 1.45, 0, BACK_Z)
    sc.traverse((o) => { if (o instanceof THREE.PointLight) { o.intensity = 1.5; o.distance = 4.5; o.castShadow = false } })
    set.add(sc)
  }

  // Left: the bed, head to the wall; the badge propped on its pillow; a sea picture above it.
  const theBed = bed(p, m)
  theBed.group.position.set(-SIDE_X, 0, BACK_Z + 0.05 + 1.95 / 2)
  set.add(theBed.group)
  const theBadge = badge(p)
  theBadge.position.copy(theBed.pillowTop).add(theBed.group.position)
  theBadge.rotation.x = -0.2
  group.add(theBadge)
  register('recorders.badge', theBadge)
  const picture = props.pictureFrame({ colors: p, kind: 'sea', width: 0.86, height: 0.42, y: 1.84 })
  picture.position.set(-SIDE_X, 0, BACK_Z)
  set.add(picture)

  // Right: the desk, the Olivetti centred on it, the pages either side, the postcard propped against the left stack.
  const desk = writingTable(m)
  desk.position.set(SIDE_X, 0, DESK.z)
  set.add(desk)
  const deskTop = new THREE.Vector3(SIDE_X, DESK.h, DESK.z)
  const stacks = new Kit()
  pageStack(stacks, m, -0.42, 0.0, 0.03)
  pageStack(stacks, m, 0.42, 0.0, 0.03)
  // A pencil pot behind the left stack: the postcard leans on it.
  stacks.cyl(0.032, 0.03, 0.09, m.brass, -0.42, 0.03 + 0.045, -0.085, 18)
  for (const [dx, dz, lean] of [[-0.01, 0, 0.12], [0.012, 0.006, -0.1]] as [number, number, number][]) {
    stacks.cyl(0.004, 0.004, 0.17, m.oliveLacquer, -0.42 + dx, 0.03 + 0.1, -0.085 + dz, 6, new THREE.Euler(0, 0, lean))
  }
  const stackGroup = new THREE.Group()
  stacks.flush(stackGroup)
  stackGroup.position.copy(deskTop)
  set.add(stackGroup)
  const typewriter = olivetti(p)
  typewriter.position.copy(deskTop).add(new THREE.Vector3(0, 0, 0.02))
  group.add(typewriter)
  register('recorders.olivetti', typewriter)
  const card = postcard(p)
  card.position.copy(deskTop).add(new THREE.Vector3(-0.42, 0.031, -0.005))
  group.add(card)
  register('recorders.postcard', card)

  // The shelf of eleven above the desk; the same width as the picture above the bed.
  const shelf = bookShelf(p, m)
  shelf.position.set(SIDE_X, 1.72, BACK_Z)
  group.add(shelf)
  register('recorders.books', shelf)

  // Her chair behind the desk, facing the room, the raspberry cardigan over its back; Ida at the keys.
  const chair = props.chair({ colors: p, cushion: p.felt, height: 0.96, seed: 'recorders:chair' })
  chair.position.set(SIDE_X, 0, CHAIR_Z)
  set.add(chair)
  const cardi = cardigan(m, 0.96 - 0.01, -0.44 / 2 + 0.005)
  cardi.position.copy(chair.position)
  set.add(cardi)
  const keys = new THREE.Vector3(0, DESK.h + 0.12, DESK.z + 0.02 - 0.08 - CHAIR_Z)
  const ida = idaTyping(m, keys)
  ida.position.set(SIDE_X, 0, CHAIR_Z)
  bake(ida, 'ida')
  group.add(ida)
  const idaDef = hs('recorders.ida')
  if (idaDef) register(idaDef.id, ida)
  out.residentAnchor = ida

  // The gramophone at the bed's foot.
  const gram = gramophone(p, m)
  gram.position.set(-SIDE_X, 0, STAND.z)
  group.add(gram)
  register('recorders.gramophone', gram)

  // The rug between them, on the line.
  const rug = props.rug({ colors: p, width: 1.9, depth: 1.5, color: p.wallAlt, inner: p.felt, border: p.paper })
  rug.position.set(0, 0, -1.25)
  set.add(rug)

  // The harmonium against the left wall; the door to the Landing its mirror on the right wall.
  const organ = harmonium(p, m)
  organ.position.set(-ROOM.w / 2, 0, WALL_ITEM_Z)
  organ.rotation.y = Math.PI / 2
  group.add(organ)
  register('recorders.harmonium', organ)
  for (const def of ctx.def.hotspots) {
    if (def.kind !== 'door') continue
    const door = doorway(def, p, m)
    door.position.set(ROOM.w / 2, 0, WALL_ITEM_Z)
    door.rotation.y = -Math.PI / 2
    group.add(door)
    register(def.id, door)
  }

  // A plaster rose on the line, where a lamp would hang; the float's hook is not in it.
  const rose = new Kit()
  rose.lathe([[0.001, 0], [0.2, 0], [0.2, -0.012], [0.16, -0.022], [0.12, -0.03], [0.07, -0.05], [0.03, -0.06], [0.001, -0.062]], mat.plaster(p.trim), 0, ROOM.h, FLOAT.z, 40)
  rose.flush(set, false)

  // The flaw: the float, a hand's breadth right of the line, in front of the window's middle bar.
  const flaw = glassFloat(p, ROOM.h - FLOAT.y)
  flaw.position.set(FLOAT.x, ROOM.h, FLOAT.z)
  set.add(flaw)

  // One draw call per material: the set dressing together, each hotspot on its own.
  bake(set, 'set')
  for (const [id, object] of out.hotspots) if (object !== ida) bake(object, id)
  set.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix() })

  // The only motion: the painted foam drifts on the sea beyond the glass.
  const foam = win.foam
  group.userData.tick = (dt: number): void => {
    foam.offset.x = (foam.offset.x + dt * 0.0035) % 1
  }

  for (const def of ctx.def.hotspots) if (!out.hotspots.has(def.id)) console.warn(`[recorders] hotspot ${def.id} has no object`)
  return out
}
