// The furniture and world props library. Every export is `(o) => THREE.Group`: dimensions in metres,
// origin at the floor centre (wall-hung props: back face at z = 0, projecting toward +z), shadows set,
// group named 'prop:<name>'. Colours always come from the caller's palette; geometries and materials
// are cached by key so the same dimensions never allocate twice. The Anderson miniature: simplified
// silhouettes, correct proportions, brass hardware, felt feet, a hairline of trim.
import * as THREE from 'three'
import type { RegionPalette } from '../content/palette'
import { FONT_SANS } from '../core/fonts'
import { labelTexture, mat, seeded, tileTexture, type WallpaperPattern } from '../scene/materials'
import { bookSpine, placard, sign as paintedSign, tag } from '../scene/text3d'

/** Options every prop accepts: the region palette (every colour comes from it) and a seed for wear and variation. */
export interface PropOptions { colors: RegionPalette; seed?: string }

// ───────────────────────────── Caches ─────────────────────────────

const geometries = new Map<string, THREE.BufferGeometry>()
const materials = new Map<string, THREE.Material>()
const textures = new Map<string, THREE.CanvasTexture>()

function r3(n: number): string { return String(Math.round(n * 1000) / 1000) }

function cachedGeometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometries.get(key)
  if (hit) return hit as T
  const g = make()
  geometries.set(key, g)
  return g
}

function cachedMaterial<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = materials.get(key)
  if (hit) return hit as T
  const m = make()
  materials.set(key, m)
  return m
}

type Profile = [number, number][]

/** Shared geometries keyed by their dimensions. */
const geo = {
  box: (w: number, h: number, d: number) => cachedGeometry(`box:${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 24, open = false) =>
    cachedGeometry(`cyl:${r3(rt)},${r3(rb)},${r3(h)},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, seg = 20) => cachedGeometry(`sph:${r3(r)},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2))),
  plane: (w: number, h: number) => cachedGeometry(`pl:${r3(w)},${r3(h)}`, () => new THREE.PlaneGeometry(w, h)),
  torus: (r: number, tube: number, arc = Math.PI * 2, seg = 32) =>
    cachedGeometry(`tor:${r3(r)},${r3(tube)},${r3(arc)},${seg}`, () => new THREE.TorusGeometry(r, tube, 10, seg, arc)),
  lathe: (key: string, profile: Profile, seg = 32) =>
    cachedGeometry(`lathe:${key}:${seg}`, () => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg)),
  circle: (r: number, seg = 32) => cachedGeometry(`circ:${r3(r)},${seg}`, () => new THREE.CircleGeometry(r, seg)),
}

// ───────────────────────────── Mesh helpers ─────────────────────────────

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  me.castShadow = true
  me.receiveShadow = true
  return me
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(geo.box(w, h, d), m, x, y, z)
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  return mesh(geo.cyl(rt, rb, h, seg), m, x, y, z)
}

/** A cylinder whose axis runs along x (a rod, a rail, a platen). */
function rodX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const me = cyl(r, r, len, m, x, y, z, seg)
  me.rotation.z = Math.PI / 2
  return me
}

/** A cylinder whose axis runs along z (an axle, a wall peg). */
function rodZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const me = cyl(r, r, len, m, x, y, z, seg)
  me.rotation.x = Math.PI / 2
  return me
}

/** A cylinder stretched between two points (frame tubes, guy ropes, spokes). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 10): THREE.Mesh {
  const len = a.distanceTo(b)
  const me = cyl(r, r, len, m, 0, 0, 0, seg)
  me.position.copy(a).lerp(b, 0.5)
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return me
}

function lathe(key: string, profile: Profile, m: THREE.Material, x = 0, y = 0, z = 0, seg = 32): THREE.Mesh {
  return mesh(geo.lathe(key, profile, seg), m, x, y, z)
}

function prop(name: string): THREE.Group {
  const g = new THREE.Group()
  g.name = `prop:${name}`
  return g
}

/** Small felt discs under legs so a prop stands on the floor with weight. */
function feltFeet(g: THREE.Group, c: RegionPalette, at: [number, number][], r = 0.028): void {
  for (const [x, z] of at) g.add(cyl(r, r, 0.008, mat.felt(c.felt), x, 0.004, z, 16))
}

/** A brass knob: dome on a short stem, protruding toward +z. */
function knob(x: number, y: number, z: number, r = 0.014): THREE.Group {
  const g = new THREE.Group()
  g.add(mesh(geo.sphere(r, 14), mat.brass(), x, y, z + r * 0.9))
  g.add(rodZ(r * 0.4, r * 1.2, mat.brass(), x, y, z + r * 0.5, 10))
  return g
}

/** A warm, low point light without shadows (lamps, sconces, fire). */
function glow(color: string, intensity: number, distance: number, x: number, y: number, z: number): THREE.PointLight {
  const light = new THREE.PointLight(new THREE.Color(color), intensity, distance, 2)
  light.position.set(x, y, z)
  light.castShadow = false
  return light
}

// ───────────────────────────── Palette materials ─────────────────────────────

function wood(c: RegionPalette, seed = 'prop', repeat: [number, number] = [1, 1]): THREE.MeshStandardMaterial {
  return mat.wood({ base: c.wood, grain: c.woodGrain, seed, repeat })
}

/** A lit surface: same colour and emission, for lamp shades and lit panes. */
function lit(color: string, intensity: number, doubleSided = false): THREE.MeshStandardMaterial {
  return cachedMaterial(`lit:${color}:${intensity}:${doubleSided}`, () =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.9, metalness: 0, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide }))
}

/** A paper lamp shade: paper that glows faintly with the lamp colour, visible from inside and out. */
function shade(paper: string, light: string): THREE.MeshStandardMaterial {
  return cachedMaterial(`shade:${paper}:${light}`, () =>
    new THREE.MeshStandardMaterial({ color: paper, emissive: light, emissiveIntensity: 0.28, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }))
}

/** A double-sided copy of a memoized material (curtains, tents, flags). */
function twoSided(base: THREE.Material, key: string): THREE.Material {
  return cachedMaterial(`2s:${key}`, () => { const m = base.clone(); m.side = THREE.DoubleSide; return m })
}

/** Checkerboard tiles keyed by colours and repeat. */
function tiles(a: string, b: string, grout: string, repeat: [number, number]): THREE.MeshStandardMaterial {
  return cachedMaterial(`tiles:${a}:${b}:${grout}:${r3(repeat[0])},${r3(repeat[1])}`, () =>
    new THREE.MeshStandardMaterial({ map: tileTexture({ a, b, grout, repeat }), roughness: 0.45, metalness: 0 }))
}

/** A cached painted canvas texture (clock faces, paintings, the globe). */
function painted(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
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
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  textures.set(key, tex)
  return tex
}

function paintedMaterial(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, roughness = 0.85): THREE.MeshStandardMaterial {
  return cachedMaterial(`painted:${key}`, () => new THREE.MeshStandardMaterial({ map: painted(key, w, h, paint), roughness, metalness: 0 }))
}

// ───────────────────────────── Room parts ─────────────────────────────

/** Transparent seam lines between floorboards: three boards per tile with staggered end joints. */
function plankSeams(ink: string, width: number, depth: number): THREE.MeshStandardMaterial {
  const key = `seams:${ink}:${r3(width)},${r3(depth)}`
  return cachedMaterial(key, () => {
    const tex = painted(key, 256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = ink
      ctx.globalAlpha = 0.6
      for (let i = 0; i < 3; i++) ctx.fillRect(Math.round((w / 3) * i), 0, 3, h)
      ctx.globalAlpha = 0.45
      for (const [i, y] of [[0, 0.3], [1, 0.72], [2, 0.08]]) ctx.fillRect(Math.round((w / 3) * i), Math.round(h * y), Math.round(w / 3), 3)
    })
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(width / 0.45, depth / 2.4)
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
  })
}

/** Floorboards running toward the camera (0.15 m wide), with seams and end joints; top surface at y = 0. */
export function floor(o: PropOptions & { width?: number; depth?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 7, d = o.depth ?? 6
  const g = prop('floor')
  const boards = wood(c, o.seed ?? 'floor', [Math.max(1, Math.round(d / 3)), Math.max(1, Math.round(w / 0.45))])
  const slab = box(d, 0.04, w, boards, 0, -0.02, 0)
  slab.rotation.y = Math.PI / 2
  slab.castShadow = false
  g.add(slab)
  const seams = mesh(geo.plane(w, d), plankSeams(c.ink, w, d), 0, 0.0008, 0)
  seams.rotation.x = -Math.PI / 2
  seams.castShadow = false
  g.add(seams)
  return g
}

/** A wall with its front face at z = 0, wallpapered or plastered, with a lacquered skirting board. */
export function wall(o: PropOptions & { width?: number; height?: number; thickness?: number; pattern?: WallpaperPattern; scale?: number; skirting?: boolean }): THREE.Group {
  const c = o.colors, w = o.width ?? 7, h = o.height ?? 4.2, t = o.thickness ?? 0.12
  const g = prop('wall')
  const side = mat.plaster(c.wallAlt)
  const face = o.pattern && o.pattern !== 'plain'
    ? mat.wallpaper({ pattern: o.pattern, bg: c.wall, fg: c.wallAlt, scale: o.scale ?? 1, repeat: [w / 1.1, h / 1.1] })
    : mat.plaster(c.wall)
  const slab = box(w, h, t, [side, side, side, side, face, side], 0, h / 2, -t / 2)
  slab.castShadow = false
  g.add(slab)
  if (o.skirting ?? true) g.add(box(w, 0.14, 0.03, mat.lacquer(c.trim), 0, 0.07, 0.015))
  return g
}

/** Painted panelling for the lower wall: skirting, raised panels and a chair rail. Back at z = 0. */
export function wainscot(o: PropOptions & { width?: number; height?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 7, h = o.height ?? 1.05, d = 0.035
  const g = prop('wainscot')
  const paint = mat.lacquer(c.trim)
  g.add(box(w, h, d, mat.plaster(c.trim), 0, h / 2, d / 2))
  g.add(box(w, 0.15, d + 0.02, paint, 0, 0.075, (d + 0.02) / 2))
  g.add(box(w, 0.05, d + 0.03, paint, 0, h - 0.025, (d + 0.03) / 2))
  const n = Math.max(1, Math.round(w / 0.9)), pw = w / n
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pw * (i + 0.5)
    g.add(box(pw - 0.16, h - 0.38, 0.012, paint, x, 0.15 + (h - 0.38) / 2 + 0.04, d + 0.006))
    g.add(box(pw - 0.24, h - 0.46, 0.006, mat.plaster(c.trim), x, 0.15 + (h - 0.38) / 2 + 0.04, d + 0.015))
  }
  return g
}

/** A stepped plaster cornice along the top of a wall of `height`. Back at z = 0. */
export function cornice(o: PropOptions & { width?: number; height?: number; size?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 7, h = o.height ?? 4.2, s = o.size ?? 0.16
  const g = prop('cornice')
  const plaster = mat.plaster(c.trim)
  g.add(box(w, s * 0.55, s, plaster, 0, h - s * 0.275, s / 2))
  g.add(box(w, s * 0.3, s * 0.6, plaster, 0, h - s * 0.7, s * 0.3))
  g.add(box(w, s * 0.15, s * 0.3, plaster, 0, h - s * 0.925, s * 0.15))
  g.add(box(w, 0.012, s * 0.62, mat.lacquer(c.trim), 0, h - s * 0.55, s * 0.31))
  return g
}

/** A panelled door leaf, hinge edge at x = −width/2, with brass knob, escutcheon and hinges. */
export function door(o: PropOptions & { width?: number; height?: number; color?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.9, h = o.height ?? 2.1, t = 0.045
  const g = prop('door')
  const paint = mat.lacquer(o.color ?? c.accent)
  g.add(box(w, h, t, paint, 0, h / 2, 0))
  const panelW = w - 0.22, upper = h * 0.42, lower = h * 0.3
  for (const s of [-1, 1]) {
    g.add(box(panelW, upper, 0.012, paint, 0, h - 0.14 - upper / 2, s * (t / 2 + 0.006)))
    g.add(box(panelW, lower, 0.012, paint, 0, 0.14 + lower / 2, s * (t / 2 + 0.006)))
    g.add(box(panelW - 0.1, upper - 0.1, 0.004, mat.flat(o.color ?? c.accent), 0, h - 0.14 - upper / 2, s * (t / 2 + 0.014)))
    g.add(box(panelW - 0.1, lower - 0.1, 0.004, mat.flat(o.color ?? c.accent), 0, 0.14 + lower / 2, s * (t / 2 + 0.014)))
    g.add(box(0.03, 0.09, 0.006, mat.brass(), w / 2 - 0.09, 1.0, s * (t / 2 + 0.003)))
  }
  g.add(knob(w / 2 - 0.09, 1.0, t / 2 + 0.006, 0.02))
  const back = knob(w / 2 - 0.09, 1.0, -t / 2 - 0.006, 0.02)
  back.scale.z = -1
  g.add(back)
  for (const y of [0.25, h / 2, h - 0.25]) g.add(box(0.012, 0.09, t + 0.01, mat.brass(), -w / 2 + 0.006, y, 0))
  return g
}

/** A cased doorway (back at z = 0, casing proud of the wall) with a dark opening and a door leaf hinged on the left, open by `ajar` radians. */
export function doorway(o: PropOptions & { width?: number; height?: number; ajar?: number; doorColor?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.0, h = o.height ?? 2.2, jamb = 0.1, d = 0.14
  const g = prop('doorway')
  const trim = mat.lacquer(c.trim)
  for (const s of [-1, 1]) g.add(box(jamb, h, d, trim, s * (w / 2 + jamb / 2), h / 2, d / 2))
  g.add(box(w + jamb * 2, jamb, d, trim, 0, h + jamb / 2, d / 2))
  g.add(box(w + jamb * 2 + 0.12, 0.06, 0.03, trim, 0, h + jamb + 0.03, d + 0.015))
  const dark = mesh(geo.plane(w, h), mat.flat(c.ink), 0, h / 2, 0.004)
  dark.castShadow = false
  g.add(dark)
  g.add(box(w, 0.012, d, mat.brass(), 0, 0.006, d / 2))
  const pivot = new THREE.Group()
  pivot.position.set(-w / 2, 0, d - 0.03)
  pivot.rotation.y = -(o.ajar ?? 0)
  const leaf = door({ colors: c, width: w - 0.02, height: h - 0.02, color: o.doorColor })
  leaf.position.x = (w - 0.02) / 2 + 0.01
  pivot.add(leaf)
  g.add(pivot)
  return g
}

/** A sash window (back at z = 0, frame proud of the wall) with mullions, glass and a warm lit pane behind it; optional velvet curtains. */
export function window(o: PropOptions & { width?: number; height?: number; sill?: number; lit?: boolean; cols?: number; rows?: number; curtains?: boolean }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.2, h = o.height ?? 1.6, sill = o.sill ?? 0.9, d = 0.12, f = 0.07
  const cols = o.cols ?? 2, rows = o.rows ?? 3
  const g = prop('window')
  const trim = mat.lacquer(c.trim)
  const cy = sill + h / 2, mid = d / 2
  for (const s of [-1, 1]) g.add(box(f, h, d, trim, s * (w / 2 - f / 2), cy, mid))
  g.add(box(w, f, d, trim, 0, sill + h - f / 2, mid))
  g.add(box(w, f, d, trim, 0, sill + f / 2, mid))
  const iw = w - 2 * f, ih = h - 2 * f
  for (let i = 1; i < cols; i++) g.add(box(0.03, ih, 0.04, trim, -iw / 2 + (iw / cols) * i, cy, mid))
  for (let j = 1; j < rows; j++) g.add(box(iw, 0.03, 0.04, trim, 0, sill + f + (ih / rows) * j, mid))
  g.add(box(iw, 0.05, 0.045, trim, 0, cy, mid))
  const glass = mesh(geo.plane(iw, ih), mat.glass(), 0, cy, mid + 0.026)
  glass.castShadow = false
  g.add(glass)
  const pane = mesh(geo.plane(iw, ih), o.lit ?? true ? lit(c.light, 1.4) : mat.flat(c.sky), 0, cy, 0.008)
  pane.castShadow = false
  g.add(pane)
  g.add(box(w + 0.16, 0.05, d + 0.08, trim, 0, sill - 0.025, mid + 0.04))
  g.add(box(w + 0.1, 0.08, 0.03, trim, 0, sill + h + 0.04, d + 0.015))
  if (o.curtains) {
    const cw = w * 0.32, ch = h + 0.5
    for (const s of [-1, 1]) {
      const panel = curtain({ colors: c, width: cw, height: ch, rod: false, folds: 4 })
      panel.position.set(s * (w / 2 + 0.02), sill - 0.3, d + 0.05)
      g.add(panel)
    }
    g.add(rodX(0.014, w + cw * 2 + 0.2, mat.brass(), 0, sill + h + 0.2, d + 0.06))
    for (const s of [-1, 1]) g.add(mesh(geo.sphere(0.028, 12), mat.brass(), s * (w / 2 + cw + 0.1), sill + h + 0.2, d + 0.06))
  }
  return g
}

/** A column radiator in enamel with brass valves; back at z = 0. */
export function radiator(o: PropOptions & { width?: number; height?: number; color?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.9, h = o.height ?? 0.6, d = 0.14
  const g = prop('radiator')
  const enamel = mat.enamel(o.color ?? c.trim)
  const n = Math.max(3, Math.round(w / 0.065)), pitch = w / n
  for (let i = 0; i < n; i++) g.add(box(pitch * 0.66, h - 0.16, d, enamel, -w / 2 + pitch * (i + 0.5), 0.12 + (h - 0.16) / 2, d / 2 + 0.03))
  for (const y of [0.15, h - 0.06]) g.add(rodX(0.028, w, enamel, 0, y, d / 2 + 0.03))
  for (const s of [-1, 1]) g.add(box(0.05, 0.12, 0.05, mat.lacquer(c.ink), s * (w / 2 - 0.12), 0.06, d / 2 + 0.03))
  g.add(rodX(0.014, 0.12, mat.brass(), w / 2 + 0.05, 0.15, d / 2 + 0.03))
  g.add(mesh(geo.torus(0.03, 0.007), mat.brass(), w / 2 + 0.1, 0.15, d / 2 + 0.03))
  return g
}

/** A felt rug with a border, an inner field and knotted fringe at both ends. */
export function rug(o: PropOptions & { width?: number; depth?: number; color?: string; inner?: string; border?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 2.2, d = o.depth ?? 1.6
  const g = prop('rug')
  const outer = box(w, 0.012, d, mat.felt(o.color ?? c.accent), 0, 0.006, 0)
  outer.castShadow = false
  g.add(outer)
  g.add(box(w - 0.4, 0.004, d - 0.4, mat.felt(o.inner ?? c.wallAlt), 0, 0.013, 0))
  const line = mat.flat(o.border ?? c.paper)
  g.add(box(w - 0.24, 0.003, 0.015, line, 0, 0.0145, (d - 0.24) / 2))
  g.add(box(w - 0.24, 0.003, 0.015, line, 0, 0.0145, -(d - 0.24) / 2))
  g.add(box(0.015, 0.003, d - 0.24, line, (w - 0.24) / 2, 0.0145, 0))
  g.add(box(0.015, 0.003, d - 0.24, line, -(w - 0.24) / 2, 0.0145, 0))
  const fringe = Math.floor(d / 0.06)
  for (const s of [-1, 1]) for (let i = 0; i < fringe; i++) {
    g.add(box(0.06, 0.006, 0.02, line, s * (w / 2 + 0.035), 0.003, -d / 2 + 0.03 + i * 0.06))
  }
  return g
}

/** Checkerboard floor tiles; top surface at y = 0. */
export function tile(o: PropOptions & { width?: number; depth?: number; size?: number; a?: string; b?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 7, d = o.depth ?? 6, s = o.size ?? 0.3
  const g = prop('tile')
  const slab = box(w, 0.04, d, tiles(o.a ?? c.paper, o.b ?? c.ink, c.trim, [w / (s * 2), d / (s * 2)]), 0, -0.02, 0)
  slab.castShadow = false
  g.add(slab)
  return g
}

// ───────────────────────────── Furniture ─────────────────────────────

const TURNED_LEG: Profile = [[0.03, 0], [0.03, 0.04], [0.045, 0.07], [0.045, 0.3], [0.032, 0.34], [0.05, 0.39], [0.05, 0.42], [0.034, 0.46], [0.034, 1]]

/** A turned wooden leg of `height`, standing on the origin. */
function turnedLeg(c: RegionPalette, height: number, x: number, z: number): THREE.Mesh {
  const leg = lathe(`leg:${r3(height)}`, TURNED_LEG.map(([r, y]) => [r, y * height]), wood(c, 'leg'), x, 0, z, 20)
  return leg
}

/** A side table with turned legs, an apron and felt feet. */
export function table(o: PropOptions & { width?: number; depth?: number; height?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.2, d = o.depth ?? 0.8, h = o.height ?? 0.76
  const g = prop('table')
  const top = wood(c, o.seed ?? 'table', [2, 1])
  g.add(box(w, 0.04, d, top, 0, h - 0.02, 0))
  g.add(box(w - 0.03, 0.006, d - 0.03, mat.lacquer(c.trim), 0, h - 0.043, 0))
  g.add(box(w - 0.18, 0.09, d - 0.18, top, 0, h - 0.095, 0))
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.09), sz * (d / 2 - 0.09)])
  for (const [x, z] of legs) g.add(turnedLeg(c, h - 0.13, x, z))
  feltFeet(g, c, legs)
  return g
}

/** A pedestal writing desk: leather inset, six drawers with brass knobs, an inkwell. */
export function desk(o: PropOptions & { width?: number; depth?: number; height?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.4, d = o.depth ?? 0.7, h = o.height ?? 0.76
  const g = prop('desk')
  const timber = wood(c, o.seed ?? 'desk', [2, 1])
  g.add(box(w, 0.04, d, timber, 0, h - 0.02, 0))
  g.add(box(w - 0.32, 0.005, d - 0.2, mat.velvet(c.ink), 0, h + 0.002, 0.02))
  const pw = 0.42, ph = h - 0.07
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - pw / 2 - 0.02)
    g.add(box(pw, ph, d - 0.04, timber, x, 0.03 + ph / 2, 0))
    g.add(box(pw - 0.04, 0.03, d - 0.1, mat.lacquer(c.ink), x, 0.015, 0))
    const rows = 3, rh = (ph - 0.1) / rows
    for (let i = 0; i < rows; i++) {
      const y = 0.08 + rh * (i + 0.5)
      g.add(box(pw - 0.08, rh - 0.025, 0.015, timber, x, y, d / 2 - 0.02 + 0.006))
      g.add(knob(x, y, d / 2 - 0.02 + 0.014, 0.012))
    }
  }
  g.add(box(w - pw * 2 - 0.04, ph * 0.55, 0.02, timber, 0, h - 0.04 - ph * 0.275, -d / 2 + 0.05))
  g.add(cyl(0.03, 0.035, 0.05, mat.brass(), w / 2 - 0.28, h + 0.025, -d / 2 + 0.14, 16))
  g.add(mesh(geo.sphere(0.014, 12), mat.brass(), w / 2 - 0.28, h + 0.06, -d / 2 + 0.14))
  return g
}

/** A long dining table with tapered legs and a stretcher. */
export function diningTable(o: PropOptions & { length?: number; width?: number; height?: number }): THREE.Group {
  const c = o.colors, l = o.length ?? 2.2, w = o.width ?? 1.0, h = o.height ?? 0.76
  const g = prop('diningTable')
  const timber = wood(c, o.seed ?? 'dining', [3, 1])
  g.add(box(l, 0.045, w, timber, 0, h - 0.0225, 0))
  g.add(box(l - 0.3, 0.1, w - 0.3, timber, 0, h - 0.095, 0))
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (l / 2 - 0.2), sz * (w / 2 - 0.2)])
  for (const [x, z] of legs) g.add(cyl(0.03, 0.045, h - 0.14, mat.lacquer(c.ink), x, (h - 0.14) / 2, z, 12))
  g.add(box(l - 0.5, 0.04, 0.04, mat.lacquer(c.ink), 0, 0.18, 0))
  feltFeet(g, c, legs, 0.04)
  return g
}

/** A slat-back dining chair with a velvet seat cushion. */
export function chair(o: PropOptions & { seat?: number; height?: number; cushion?: string }): THREE.Group {
  const c = o.colors, s = o.seat ?? 0.44, h = o.height ?? 0.92, sh = 0.46
  const g = prop('chair')
  const timber = wood(c, o.seed ?? 'chair')
  g.add(box(s, 0.035, s, timber, 0, sh - 0.0175, 0))
  g.add(box(s - 0.06, 0.045, s - 0.06, mat.velvet(o.cushion ?? c.accent), 0, sh + 0.02, 0))
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (s / 2 - 0.035), sz * (s / 2 - 0.035)])
  for (const [x, z] of legs) g.add(cyl(0.02, 0.026, sh - 0.035, timber, x, (sh - 0.035) / 2, z, 12))
  for (const sx of [-1, 1]) g.add(box(0.018, 0.03, s - 0.1, timber, sx * (s / 2 - 0.035), 0.16, 0))
  const back = h - sh
  for (const sx of [-1, 1]) {
    const stile = cyl(0.018, 0.022, back, timber, sx * (s / 2 - 0.035), sh + back / 2, -s / 2 + 0.035, 12)
    stile.rotation.x = -0.08
    g.add(stile)
  }
  g.add(box(s - 0.02, 0.07, 0.03, timber, 0, h - 0.045, -s / 2 + 0.005))
  for (const y of [0.2, 0.31]) g.add(box(s - 0.1, 0.05, 0.014, timber, 0, sh + y, -s / 2 + 0.02))
  feltFeet(g, c, legs, 0.022)
  return g
}

/** A boxy club armchair in velvet with piping, brass-capped feet and a paper antimacassar. */
export function armchair(o: PropOptions & { width?: number; depth?: number; height?: number; body?: string; cushion?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.84, d = o.depth ?? 0.82, h = o.height ?? 0.86
  const g = prop('armchair')
  const velvet = mat.velvet(o.body ?? c.accent)
  const piping = mat.flat(c.paper)
  const base = 0.08
  g.add(box(w, 0.36, d, velvet, 0, base + 0.18, 0))
  for (const s of [-1, 1]) {
    g.add(box(0.15, 0.6, d - 0.02, velvet, s * (w / 2 - 0.075), base + 0.3, 0))
    g.add(box(0.008, 0.006, d - 0.02, piping, s * (w / 2 - 0.006), base + 0.603, 0))
  }
  g.add(box(w, h - base, 0.18, velvet, 0, base + (h - base) / 2, -d / 2 + 0.09))
  g.add(box(w, 0.006, 0.008, piping, 0, h + 0.003, -d / 2 + 0.176))
  g.add(box(w - 0.3, 0.11, d - 0.22, mat.velvet(o.cushion ?? c.accent2), 0, base + 0.415, 0.03))
  g.add(box(w * 0.5, 0.004, 0.2, mat.paper(c.paper), 0, h + 0.008, -d / 2 + 0.1))
  const feet: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.08), sz * (d / 2 - 0.08)])
  for (const [x, z] of feet) {
    g.add(cyl(0.03, 0.038, 0.06, wood(c, 'foot'), x, 0.05, z, 12))
    g.add(cyl(0.032, 0.032, 0.012, mat.brass(), x, 0.014, z, 12))
  }
  return g
}

/** A three-legged stool with a stretcher ring. */
export function stool(o: PropOptions & { height?: number; seat?: number }): THREE.Group {
  const c = o.colors, h = o.height ?? 0.45, s = o.seat ?? 0.32
  const g = prop('stool')
  const timber = wood(c, o.seed ?? 'stool')
  g.add(cyl(s / 2, s / 2 - 0.01, 0.04, timber, 0, h - 0.02, 0, 32))
  const feet: [number, number][] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    const top = new THREE.Vector3(Math.cos(a) * (s / 2 - 0.05), h - 0.04, Math.sin(a) * (s / 2 - 0.05))
    const foot = new THREE.Vector3(Math.cos(a) * (s / 2 + 0.03), 0, Math.sin(a) * (s / 2 + 0.03))
    g.add(tube(foot, top, 0.018, timber, 12))
    feet.push([foot.x, foot.z])
  }
  const ring = mesh(geo.torus(s / 2 - 0.02, 0.008, Math.PI * 2, 32), timber, 0, h * 0.35, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  feltFeet(g, c, feet, 0.02)
  return g
}

/** A plank bench on two trestles. */
export function bench(o: PropOptions & { length?: number; height?: number; depth?: number }): THREE.Group {
  const c = o.colors, l = o.length ?? 1.6, h = o.height ?? 0.45, d = o.depth ?? 0.36
  const g = prop('bench')
  const timber = wood(c, o.seed ?? 'bench', [3, 1])
  g.add(box(l, 0.05, d, timber, 0, h - 0.025, 0))
  for (const s of [-1, 1]) {
    const x = s * (l / 2 - 0.22)
    g.add(box(0.05, h - 0.05, d - 0.08, timber, x, (h - 0.05) / 2, 0))
    g.add(box(0.08, 0.03, d - 0.02, mat.felt(c.felt), x, 0.015, 0))
  }
  g.add(box(l - 0.5, 0.07, 0.03, timber, 0, 0.18, 0))
  return g
}

/** A bed made up with a sheet, a velvet blanket turned down at the head, and two pillows. Head at −z. */
export function bed(o: PropOptions & { width?: number; length?: number; blanket?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.4, l = o.length ?? 2.0
  const g = prop('bed')
  const timber = wood(c, o.seed ?? 'bed', [2, 1])
  g.add(box(w, 0.16, l, timber, 0, 0.26, 0))
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.06), sz * (l / 2 - 0.06)])
  for (const [x, z] of legs) g.add(cyl(0.035, 0.045, 0.18, mat.lacquer(c.ink), x, 0.09, z, 12))
  g.add(box(w - 0.06, 0.2, l - 0.06, mat.paper(c.paper), 0, 0.44, 0))
  g.add(box(w - 0.02, 0.08, l * 0.62, mat.velvet(o.blanket ?? c.accent), 0, 0.58, l * 0.19 - 0.03))
  g.add(box(w, 0.04, 0.3, mat.paper(c.paper), 0, 0.64, -l * 0.12 - 0.03))
  g.add(box(w - 0.02, 0.012, 0.3, mat.velvet(o.blanket ?? c.accent), 0, 0.666, -l * 0.12 - 0.03))
  for (const s of [-1, 1]) {
    const pillow = box(w * 0.4, 0.12, 0.34, mat.paper(c.paper), s * w * 0.23, 0.6, -l / 2 + 0.28)
    pillow.rotation.x = -0.18
    g.add(pillow)
  }
  g.add(box(w + 0.06, 1.25, 0.06, timber, 0, 0.625, -l / 2 - 0.03))
  g.add(box(w - 0.24, 0.6, 0.03, mat.velvet(o.blanket ?? c.accent), 0, 0.82, -l / 2 + 0.005))
  g.add(box(w + 0.06, 0.05, 0.1, mat.lacquer(c.trim), 0, 1.25, -l / 2 - 0.03))
  g.add(box(w + 0.06, 0.62, 0.05, timber, 0, 0.31, l / 2 + 0.025))
  feltFeet(g, c, legs, 0.04)
  return g
}

/** The palette cycle for cloth bindings on a shelf. */
function clothColours(c: RegionPalette): [string, string][] {
  return [[c.accent, c.paper], [c.accent2, c.paper], [c.ink, c.brass], [c.felt, c.paper], [c.wood, c.ink], [c.trim, c.ink]]
}

/** An untitled clothbound book (cheap: no texture). */
function plainBook(cloth: string, pages: string, height: number, thickness: number, depth: number): THREE.Mesh {
  const cl = mat.flat(cloth), pg = mat.paper(pages)
  const b = mesh(geo.box(thickness, height, depth), [cl, cl, pg, cl, cl, pg])
  b.position.y = height / 2
  return b
}

/** A bookcase filled with rows of books; `titles` appear on spines (Jost caps), the rest are untitled cloth. */
export function bookshelf(o: PropOptions & { titles: string[]; width?: number; height?: number; depth?: number; shelves?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.0, h = o.height ?? 2.0, d = o.depth ?? 0.3, n = o.shelves ?? 4
  const g = prop('bookshelf')
  const timber = wood(c, o.seed ?? 'shelf', [1, 2])
  const rnd = seeded(o.seed ?? 'bookshelf')
  const titles = [...o.titles]
  const cloths = clothColours(c)
  for (const s of [-1, 1]) g.add(box(0.025, h, d, timber, s * (w / 2 - 0.0125), h / 2, 0))
  g.add(box(w, h, 0.012, mat.flat(c.wallAlt), 0, h / 2, -d / 2 + 0.006))
  g.add(box(w + 0.06, 0.05, d + 0.04, timber, 0, h - 0.025, 0.01))
  g.add(box(w, 0.1, d, mat.lacquer(c.ink), 0, 0.05, 0))
  g.add(box(w - 0.05, 0.02, d - 0.03, mat.felt(c.felt), 0, 0.01, 0))
  const gap = (h - 0.16) / n
  for (let i = 0; i < n; i++) {
    const y = 0.1 + i * gap
    g.add(box(w - 0.05, 0.025, d - 0.02, timber, 0, y + 0.0125, 0))
    let x = -w / 2 + 0.04
    const limit = w / 2 - 0.05
    let count = 0
    while (x < limit - 0.05) {
      const th = 0.028 + rnd() * 0.03
      const bh = gap * (0.55 + rnd() * 0.28)
      const bd = d - 0.09 - rnd() * 0.04
      const [cloth, ink] = cloths[Math.floor(rnd() * cloths.length)]
      const titled = titles.length > 0 && rnd() < 0.6
      const book = titled ? bookSpine(titles.shift() ?? '', { color: cloth, ink, height: bh, thickness: th, depth: bd }) : plainBook(cloth, c.paper, bh, th, bd)
      const lean = count > 3 && rnd() < 0.08 && x + 0.2 < limit
      book.position.x = x + th / 2
      book.position.y += y + 0.025
      book.position.z = d / 2 - bd / 2 - 0.03
      if (lean) { book.rotation.z = -0.22; book.position.x += bh * 0.2; book.position.y -= 0.003; x += bh * 0.22 }
      g.add(book)
      x += th + 0.002
      count++
    }
  }
  return g
}

/** One clothbound book, standing (spine toward +z) or lying flat (cover up, spine toward +z). */
export function book(o: PropOptions & { title: string; color?: string; ink?: string; height?: number; thickness?: number; depth?: number; lying?: boolean }): THREE.Group {
  const c = o.colors, h = o.height ?? 0.24, t = o.thickness ?? 0.04, d = o.depth ?? 0.16
  const g = prop('book')
  const b = bookSpine(o.title, { color: o.color ?? c.accent, ink: o.ink ?? c.paper, height: h, thickness: t, depth: d })
  if (o.lying) { b.rotation.z = Math.PI / 2; b.position.y = t / 2 }
  g.add(b)
  return g
}

/** A bookcase-sized painted cabinet with two panelled doors, brass knobs and a plinth. */
export function cabinet(o: PropOptions & { width?: number; height?: number; depth?: number; doors?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.0, h = o.height ?? 1.8, d = o.depth ?? 0.45
  const g = prop('cabinet')
  const timber = wood(c, o.seed ?? 'cabinet', [1, 2])
  const paint = mat.lacquer(o.doors ?? c.accent2)
  g.add(box(w, h - 0.1, d, timber, 0, 0.1 + (h - 0.1) / 2, 0))
  g.add(box(w - 0.08, 0.1, d - 0.06, mat.lacquer(c.ink), 0, 0.05, 0))
  g.add(box(w + 0.06, 0.06, d + 0.04, timber, 0, h - 0.03, 0.01))
  const dw = w / 2 - 0.04, dh = h - 0.26
  for (const s of [-1, 1]) {
    const x = s * (dw / 2 + 0.012)
    g.add(box(dw, dh, 0.02, paint, x, 0.14 + dh / 2, d / 2 + 0.01))
    g.add(box(dw - 0.14, dh - 0.16, 0.01, paint, x, 0.14 + dh / 2, d / 2 + 0.025))
    g.add(box(dw - 0.2, dh - 0.22, 0.004, mat.flat(o.doors ?? c.accent2), x, 0.14 + dh / 2, d / 2 + 0.032))
    g.add(knob(s * 0.05, 0.14 + dh / 2, d / 2 + 0.02, 0.013))
    for (const y of [0.3, h - 0.3]) g.add(box(0.012, 0.07, 0.02, mat.brass(), s * (w / 2 - 0.02), y, d / 2 + 0.02))
  }
  g.add(box(0.02, 0.04, 0.006, mat.brass(), 0.05, 0.14 + dh / 2 - 0.05, d / 2 + 0.023))
  return g
}

/** A chest of drawers on short turned legs; the top drawer is pulled open by `open` metres. */
export function drawers(o: PropOptions & { width?: number; height?: number; depth?: number; rows?: number; open?: number; fronts?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.9, h = o.height ?? 1.0, d = o.depth ?? 0.5, n = o.rows ?? 4
  const g = prop('drawers')
  const timber = wood(c, o.seed ?? 'drawers', [1, 1])
  const fronts = o.fronts ? mat.lacquer(o.fronts) : timber
  const legH = 0.12
  g.add(box(w, h - legH - 0.03, d, timber, 0, legH + (h - legH - 0.03) / 2, 0))
  g.add(box(w + 0.05, 0.03, d + 0.03, timber, 0, h - 0.015, 0.01))
  const rh = (h - legH - 0.06) / n
  for (let i = 0; i < n; i++) {
    const y = legH + 0.02 + rh * (i + 0.5)
    const pull = i === n - 1 ? (o.open ?? 0.04) : 0
    const front = box(w - 0.06, rh - 0.02, 0.02, fronts, 0, y, d / 2 + 0.01 + pull)
    g.add(front)
    if (pull > 0) g.add(box(w - 0.1, rh - 0.05, pull, mat.flat(c.woodGrain), 0, y - 0.01, d / 2 + pull / 2))
    g.add(knob(-w * 0.22, y, d / 2 + 0.02 + pull, 0.012))
    g.add(knob(w * 0.22, y, d / 2 + 0.02 + pull, 0.012))
  }
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.07), sz * (d / 2 - 0.07)])
  for (const [x, z] of legs) g.add(turnedLeg(c, legH, x, z))
  feltFeet(g, c, legs, 0.03)
  return g
}

// ───────────────────────────── Lamps ─────────────────────────────

/** A standard lamp: lacquered base, brass stem, paper drum shade with a warm point light. */
export function lampFloor(o: PropOptions & { height?: number; shade?: number; lit?: boolean }): THREE.Group {
  const c = o.colors, h = o.height ?? 1.6, sd = o.shade ?? 0.42
  const g = prop('lampFloor')
  g.add(cyl(0.13, 0.16, 0.035, mat.lacquer(c.ink), 0, 0.0175, 0, 32))
  g.add(cyl(0.16, 0.16, 0.004, mat.felt(c.felt), 0, 0.002, 0, 32))
  g.add(cyl(0.012, 0.012, h - 0.32, mat.brass(), 0, 0.035 + (h - 0.32) / 2, 0, 12))
  g.add(mesh(geo.sphere(0.03, 14), mat.brass(), 0, 0.5, 0))
  const shadeH = 0.32
  g.add(mesh(geo.cyl(sd / 2 * 0.82, sd / 2, shadeH, 40, true), shade(c.paper, c.light), 0, h - shadeH / 2, 0))
  g.add(mesh(geo.torus(sd / 2 * 0.82, 0.005, Math.PI * 2, 40), mat.brass(), 0, h, 0).rotateX(Math.PI / 2))
  g.add(mesh(geo.torus(sd / 2, 0.005, Math.PI * 2, 40), mat.brass(), 0, h - shadeH, 0).rotateX(Math.PI / 2))
  g.add(mesh(geo.sphere(0.018, 12), mat.brass(), 0, h + 0.02, 0))
  if (o.lit ?? true) {
    g.add(mesh(geo.sphere(0.03, 12), lit(c.light, 2.5), 0, h - shadeH / 2, 0))
    g.add(glow(c.light, 3.2, 6, 0, h - shadeH / 2, 0))
  }
  return g
}

/** A table lamp with a turned base; origin on the table surface. */
export function lampTable(o: PropOptions & { height?: number; shade?: number; lit?: boolean; base?: string }): THREE.Group {
  const c = o.colors, h = o.height ?? 0.5, sd = o.shade ?? 0.28
  const g = prop('lampTable')
  const baseProfile: Profile = [[0, 0], [0.07, 0], [0.075, 0.015], [0.05, 0.03], [0.045, 0.08], [0.06, 0.13], [0.06, 0.16], [0.035, 0.2], [0.03, 0.26], [0.018, 0.28], [0, 0.28]]
  g.add(lathe('lampbase', baseProfile.map(([r, y]) => [r, y * (h / 0.5)]), mat.lacquer(o.base ?? c.accent2), 0, 0, 0, 28))
  g.add(cyl(0.075, 0.075, 0.004, mat.felt(c.felt), 0, 0.002, 0, 28))
  g.add(cyl(0.008, 0.008, h * 0.3, mat.brass(), 0, h * 0.55, 0, 10))
  const shadeH = h * 0.4
  g.add(mesh(geo.cyl(sd / 2 * 0.72, sd / 2, shadeH, 36, true), shade(c.paper, c.light), 0, h - shadeH / 2, 0))
  g.add(mesh(geo.torus(sd / 2, 0.004, Math.PI * 2, 36), mat.brass(), 0, h - shadeH, 0).rotateX(Math.PI / 2))
  g.add(mesh(geo.sphere(0.012, 10), mat.brass(), 0, h + 0.012, 0))
  if (o.lit ?? true) {
    g.add(mesh(geo.sphere(0.02, 10), lit(c.light, 2.5), 0, h - shadeH / 2, 0))
    g.add(glow(c.light, 1.4, 3.5, 0, h - shadeH / 2, 0))
  }
  return g
}

/** A wall sconce on a brass backplate; back at z = 0, at `height` above the floor. */
export function sconce(o: PropOptions & { height?: number; lit?: boolean }): THREE.Group {
  const c = o.colors, h = o.height ?? 1.75
  const g = prop('sconce')
  g.add(box(0.09, 0.16, 0.014, mat.brass(), 0, h, 0.007))
  const arm = tube(new THREE.Vector3(0, h - 0.02, 0.014), new THREE.Vector3(0, h + 0.03, 0.16), 0.007, mat.brass(), 10)
  g.add(arm)
  g.add(cyl(0.012, 0.016, 0.03, mat.brass(), 0, h + 0.045, 0.16, 12))
  g.add(mesh(geo.cyl(0.05, 0.075, 0.11, 32, true), shade(c.paper, c.light), 0, h + 0.115, 0.16))
  if (o.lit ?? true) {
    g.add(mesh(geo.sphere(0.018, 10), lit(c.light, 2.5), 0, h + 0.1, 0.16))
    g.add(glow(c.light, 0.9, 3, 0, h + 0.12, 0.2))
  }
  return g
}

/** A brass chandelier of `arms` candles hanging `drop` below a ceiling at `height`. */
export function chandelier(o: PropOptions & { height?: number; drop?: number; arms?: number; radius?: number; lit?: boolean }): THREE.Group {
  const c = o.colors, h = o.height ?? 4.2, drop = o.drop ?? 0.95, n = o.arms ?? 6, r = o.radius ?? 0.36
  const g = prop('chandelier')
  const brass = mat.brass()
  const hub = h - drop + 0.2
  g.add(cyl(0.11, 0.11, 0.025, mat.plaster(c.trim), 0, h - 0.0125, 0, 32))
  g.add(cyl(0.006, 0.006, h - 0.02 - hub - 0.12, brass, 0, (h - 0.02 + hub + 0.12) / 2, 0, 8))
  g.add(lathe('chandelier-body', [[0, 0], [0.04, 0], [0.06, 0.05], [0.05, 0.1], [0.025, 0.14], [0.025, 0.2], [0.05, 0.22], [0.04, 0.24], [0, 0.24]], brass, 0, hub - 0.12, 0, 24))
  const ring = mesh(geo.torus(r, 0.012, Math.PI * 2, 48), brass, 0, hub, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    g.add(tube(new THREE.Vector3(0, hub - 0.08, 0), new THREE.Vector3(x, hub, z), 0.008, brass, 8))
    g.add(cyl(0.024, 0.018, 0.04, brass, x, hub + 0.03, z, 12))
    g.add(cyl(0.011, 0.011, 0.13, mat.paper(c.paper), x, hub + 0.115, z, 10))
    if (o.lit ?? true) g.add(mesh(geo.sphere(0.014, 10), lit(c.light, 3), x, hub + 0.2, z))
  }
  if (o.lit ?? true) g.add(glow(c.light, 4.5, 9, 0, hub + 0.15, 0))
  return g
}

// ───────────────────────────── Wall pieces ─────────────────────────────

export type PaintingKind = 'mountain' | 'sea' | 'portrait' | 'map'

/** Paints one of the house's four pictures in flat planes of the palette's colours. */
function paintPicture(ctx: CanvasRenderingContext2D, w: number, h: number, kind: PaintingKind, c: RegionPalette): void {
  const fill = (color: string) => { ctx.fillStyle = color }
  ctx.fillStyle = c.sky
  ctx.fillRect(0, 0, w, h)
  if (kind === 'mountain') {
    fill(c.accent2); ctx.beginPath(); ctx.arc(w * 0.72, h * 0.3, w * 0.07, 0, Math.PI * 2); ctx.fill()
    fill(c.wallAlt); ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.lineTo(w * 0.22, h * 0.36); ctx.lineTo(w * 0.42, h * 0.58); ctx.lineTo(w * 0.62, h * 0.4); ctx.lineTo(w, h * 0.62); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill()
    fill(c.ink); ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.76); ctx.lineTo(w * 0.46, h * 0.22); ctx.lineTo(w * 0.82, h * 0.76); ctx.fill()
    fill(c.paper); ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.34); ctx.lineTo(w * 0.46, h * 0.22); ctx.lineTo(w * 0.54, h * 0.34); ctx.lineTo(w * 0.5, h * 0.36); ctx.lineTo(w * 0.46, h * 0.32); ctx.lineTo(w * 0.42, h * 0.37); ctx.fill()
    fill(c.felt); ctx.fillRect(0, h * 0.76, w, h * 0.24)
    fill(c.paper); ctx.fillRect(w * 0.14, h * 0.7, w * 0.04, h * 0.06); fill(c.accent); ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.7); ctx.lineTo(w * 0.16, h * 0.64); ctx.lineTo(w * 0.2, h * 0.7); ctx.fill()
  } else if (kind === 'sea') {
    fill(c.accent2); ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, w * 0.09, 0, Math.PI * 2); ctx.fill()
    fill(c.felt); ctx.fillRect(0, h * 0.52, w, h * 0.48)
    fill(c.paper); ctx.globalAlpha = 0.35; ctx.fillRect(0, h * 0.52, w, h * 0.03); ctx.globalAlpha = 1
    fill(c.ink); ctx.fillRect(w * 0.42, h * 0.62, w * 0.2, h * 0.04); ctx.fillRect(w * 0.515, h * 0.36, w * 0.008, h * 0.26)
    fill(c.paper); ctx.beginPath(); ctx.moveTo(w * 0.53, h * 0.37); ctx.lineTo(w * 0.62, h * 0.6); ctx.lineTo(w * 0.53, h * 0.6); ctx.fill()
    fill(c.accent); ctx.fillRect(w * 0.42, h * 0.65, w * 0.2, h * 0.012)
    fill(c.ink); for (let i = 0; i < 5; i++) ctx.fillRect(w * (0.08 + i * 0.19), h * (0.8 + (i % 2) * 0.06), w * 0.06, h * 0.006)
  } else if (kind === 'portrait') {
    fill(c.wallAlt); ctx.fillRect(0, 0, w, h)
    fill(c.trim); ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.4, h * 0.46, 0, 0, Math.PI * 2); ctx.fill()
    fill(c.ink); ctx.beginPath(); ctx.moveTo(w * 0.22, h); ctx.quadraticCurveTo(w * 0.24, h * 0.6, w * 0.5, h * 0.6); ctx.quadraticCurveTo(w * 0.76, h * 0.6, w * 0.78, h); ctx.fill()
    fill(c.paper); ctx.beginPath(); ctx.moveTo(w * 0.42, h * 0.6); ctx.lineTo(w * 0.5, h * 0.74); ctx.lineTo(w * 0.58, h * 0.6); ctx.fill()
    fill(c.ink); ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.38, w * 0.13, h * 0.19, 0, 0, Math.PI * 2); ctx.fill()
    fill(c.accent); ctx.fillRect(w * 0.47, h * 0.6, w * 0.06, h * 0.12)
  } else {
    fill(c.paper); ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = c.wallAlt; ctx.lineWidth = 1.5
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(w * 0.36, h * 0.52, w * (0.1 + i * 0.07), h * (0.08 + i * 0.06), -0.4, 0, Math.PI * 2); ctx.stroke() }
    fill(c.felt); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(w * 0.62, 0); ctx.quadraticCurveTo(w * 0.55, h * 0.4, w * 0.74, h * 0.6); ctx.quadraticCurveTo(w * 0.9, h * 0.8, w * 0.8, h); ctx.lineTo(w, h); ctx.lineTo(w, 0); ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = c.accent; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(w * 0.12, h * 0.85); ctx.quadraticCurveTo(w * 0.3, h * 0.3, w * 0.5, h * 0.55); ctx.quadraticCurveTo(w * 0.62, h * 0.7, w * 0.72, h * 0.34); ctx.stroke(); ctx.setLineDash([])
    ctx.strokeStyle = c.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.69, h * 0.3); ctx.lineTo(w * 0.75, h * 0.38); ctx.moveTo(w * 0.75, h * 0.3); ctx.lineTo(w * 0.69, h * 0.38); ctx.stroke()
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5
    const cx = w * 0.84, cy = h * 0.82, cr = w * 0.07
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy - cr * 1.4); ctx.lineTo(cx, cy + cr * 1.4); ctx.moveTo(cx - cr * 1.4, cy); ctx.lineTo(cx + cr * 1.4, cy); ctx.stroke()
    fill(c.ink); ctx.font = `500 ${Math.round(h * 0.06)}px ${FONT_SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('T E R R A   I N C O G N I T A', w * 0.06, h * 0.06)
  }
  ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.strokeRect(2.5, 2.5, w - 5, h - 5); ctx.globalAlpha = 1
}

/** A framed painting (mountain, sea, portrait silhouette or map) hung with its centre at `y`. Back at z = 0. */
export function pictureFrame(o: PropOptions & { kind: PaintingKind; width?: number; height?: number; y?: number; frame?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.6, h = o.height ?? 0.45, y = o.y ?? 1.6, f = 0.045, d = 0.035
  const g = prop('pictureFrame')
  const frameMat = o.frame ? mat.lacquer(o.frame) : wood(c, 'frame')
  g.add(box(w, f, d, frameMat, 0, y + h / 2 - f / 2, d / 2))
  g.add(box(w, f, d, frameMat, 0, y - h / 2 + f / 2, d / 2))
  g.add(box(f, h - 2 * f, d, frameMat, -w / 2 + f / 2, y, d / 2))
  g.add(box(f, h - 2 * f, d, frameMat, w / 2 - f / 2, y, d / 2))
  g.add(box(w - 2 * f, h - 2 * f, 0.004, mat.brass(), 0, y, 0.006))
  g.add(box(w - 2 * f - 0.012, h - 2 * f - 0.012, 0.01, mat.paper(c.paper), 0, y, 0.012))
  const key = `picture:${o.kind}:${c.sky}:${c.accent}:${c.ink}:${c.paper}:${c.felt}:${c.wallAlt}:${c.accent2}:${c.trim}`
  const canvas = mesh(geo.plane(w - 2 * f - 0.08, h - 2 * f - 0.08), paintedMaterial(key, 512, 512, (ctx, cw, ch) => paintPicture(ctx, cw, ch, o.kind, c), 0.7), 0, y, 0.018)
  canvas.castShadow = false
  g.add(canvas)
  g.add(mesh(geo.torus(0.012, 0.003, Math.PI * 2, 12), mat.brass(), 0, y + h / 2 + 0.012, 0.006))
  return g
}

/** A lacquered mirror: dark glossy glass with a single painted glint, hung with its centre at `y`. Back at z = 0. */
export function mirror(o: PropOptions & { width?: number; height?: number; y?: number; frame?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.5, h = o.height ?? 0.8, y = o.y ?? 1.5, f = 0.05, d = 0.03
  const g = prop('mirror')
  const frameMat = mat.lacquer(o.frame ?? c.brass)
  g.add(box(w, f, d, frameMat, 0, y + h / 2 - f / 2, d / 2))
  g.add(box(w, f, d, frameMat, 0, y - h / 2 + f / 2, d / 2))
  g.add(box(f, h - 2 * f, d, frameMat, -w / 2 + f / 2, y, d / 2))
  g.add(box(f, h - 2 * f, d, frameMat, w / 2 - f / 2, y, d / 2))
  g.add(box(w - 1.4 * f, 0.008, 0.006, frameMat, 0, y + h / 2 - f - 0.004, d + 0.003))
  const glass = mesh(geo.plane(w - 2 * f, h - 2 * f), mat.lacquer(c.ink), 0, y, 0.01)
  glass.castShadow = false
  g.add(glass)
  const glint = box(0.012, (h - 2 * f) * 0.7, 0.002, mat.flat(c.paper), -w * 0.18, y + h * 0.08, 0.012)
  glint.rotation.z = 0.35
  glint.castShadow = false
  g.add(glint)
  g.add(box(0.08, 0.06, 0.02, frameMat, 0, y + h / 2 + 0.02, d / 2))
  return g
}

/** A clipped topiary standard in a glazed pot: felt balls on a bare stem. */
export function plant(o: PropOptions & { height?: number; pot?: string; leaf?: string }): THREE.Group {
  const c = o.colors, h = o.height ?? 1.1
  const g = prop('plant')
  const potMat = mat.enamel(o.pot ?? c.accent2)
  g.add(cyl(0.15, 0.115, 0.3, potMat, 0, 0.15, 0, 28))
  g.add(cyl(0.165, 0.165, 0.035, potMat, 0, 0.3, 0, 28))
  g.add(cyl(0.14, 0.14, 0.01, mat.flat(c.woodGrain), 0, 0.322, 0, 28))
  g.add(cyl(0.02, 0.026, h - 0.32, mat.flat(c.woodGrain), 0, 0.32 + (h - 0.32) / 2, 0, 10))
  const leaf = mat.felt(o.leaf ?? c.felt)
  const big = h * 0.22
  g.add(mesh(geo.sphere(big, 28), leaf, 0, h - big * 0.6, 0))
  g.add(mesh(geo.sphere(big * 0.5, 20), leaf, 0, h * 0.58, 0))
  g.add(cyl(0.165, 0.165, 0.004, mat.felt(c.felt), 0, 0.002, 0, 28))
  return g
}

// ───────────────────────────── Luggage ─────────────────────────────

/** Brass corner caps and latches for a case of w × h × d whose centre is at (0, cy, 0). */
function caseHardware(g: THREE.Group, w: number, h: number, d: number, cy: number): void {
  const brass = mat.brass()
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.035, 0.035, 0.035, brass, sx * (w / 2 - 0.012), cy + sy * (h / 2 - 0.012), sz * (d / 2 - 0.012)))
  }
  for (const sx of [-1, 1]) g.add(box(0.045, 0.05, 0.014, brass, sx * (w * 0.32), cy, d / 2 + 0.006))
  g.add(box(0.03, 0.04, 0.012, brass, 0, cy, d / 2 + 0.005))
}

/** A steamer trunk in lacquer with wooden ribs, brass corners, a monogram label and optional hotel stickers. */
export function trunk(o: PropOptions & { monogram: string; width?: number; height?: number; depth?: number; color?: string; stickers?: string[] }): THREE.Group {
  const c = o.colors, w = o.width ?? 0.9, h = o.height ?? 0.52, d = o.depth ?? 0.5
  const g = prop('trunk')
  const shell = mat.lacquer(o.color ?? c.accent)
  const rib = wood(c, 'rib')
  g.add(box(w, h - 0.03, d, shell, 0, 0.03 + (h - 0.03) / 2, 0))
  for (const x of [-w * 0.32, 0, w * 0.32]) {
    g.add(box(0.035, h - 0.02, 0.012, rib, x, 0.03 + (h - 0.03) / 2, d / 2 + 0.006))
    g.add(box(0.035, 0.012, d, rib, x, h + 0.006, 0))
    g.add(box(0.035, h - 0.02, 0.012, rib, x, 0.03 + (h - 0.03) / 2, -d / 2 - 0.006))
  }
  g.add(box(w + 0.01, 0.01, d + 0.01, mat.flat(c.ink), 0, h * 0.62, 0))
  caseHardware(g, w, h - 0.03, d, 0.03 + (h - 0.03) / 2)
  for (const s of [-1, 1]) g.add(box(0.03, 0.04, 0.16, mat.velvet(c.ink), s * (w / 2 + 0.01), h * 0.6, 0))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.025, 0.025, 0.03, mat.brass(), x * (w / 2 - 0.08), 0.015, z * (d / 2 - 0.08), 12))
  const label = placard({ lines: [o.monogram], width: 0.16, height: 0.09, bg: c.paper, color: c.ink, border: c.ink })
  label.position.set(0, h * 0.4, d / 2 + 0.013)
  g.add(label)
  const stickers = o.stickers ?? []
  stickers.slice(0, 3).forEach((text, i) => {
    const s = placard({ lines: [text], width: 0.12, height: 0.05, bg: i % 2 ? c.accent2 : c.trim, color: i % 2 ? c.paper : c.ink, border: c.ink, size: 26 })
    s.position.set(-w * 0.18 + i * 0.18, h * 0.82, d / 2 + 0.014)
    s.rotation.z = (i - 1) * 0.12
    g.add(s)
  })
  return g
}

/** A stack of three suitcases, smallest on top, each slightly askew, with a luggage tag on the handle. */
export function suitcaseStack(o: PropOptions & { count?: number; tag?: string }): THREE.Group {
  const c = o.colors, n = o.count ?? 3
  const g = prop('suitcaseStack')
  const rnd = seeded(o.seed ?? 'suitcases')
  const shells = [c.accent, c.wood, c.accent2, c.ink]
  let y = 0
  let top = { w: 0, h: 0, d: 0 }
  for (let i = 0; i < n; i++) {
    const w = 0.72 - i * 0.1, h = 0.2 - i * 0.02, d = 0.46 - i * 0.05
    const caseGroup = new THREE.Group()
    caseGroup.add(box(w, h, d, mat.lacquer(shells[i % shells.length]), 0, h / 2, 0))
    caseGroup.add(box(w + 0.006, 0.008, d + 0.006, mat.flat(c.trim), 0, h * 0.55, 0))
    caseHardware(caseGroup, w, h, d, h / 2)
    caseGroup.add(mesh(geo.torus(0.05, 0.01, Math.PI, 16), mat.velvet(c.ink), 0, h, 0.015))
    caseGroup.position.y = y
    caseGroup.rotation.y = (rnd() - 0.5) * 0.14
    g.add(caseGroup)
    y += h
    top = { w, h, d }
  }
  const t = tag(o.tag ?? 'PROPERTY OF THE HOUSE', { color: c.paper, ink: c.ink })
  t.position.set(0.045, y + 0.03, top.d / 2 + 0.01)
  t.rotation.y = 0.2
  g.add(t)
  return g
}

// ───────────────────────────── Tabletop objects ─────────────────────────────

/** A rotary telephone in lacquer with a brass dial and a coiled cord; origin on the table. */
export function telephone(o: PropOptions & { color?: string }): THREE.Group {
  const c = o.colors
  const g = prop('telephone')
  const shell = mat.lacquer(o.color ?? c.ink)
  const base = lathe('phone-base', [[0, 0], [0.105, 0], [0.11, 0.02], [0.095, 0.08], [0.07, 0.1], [0, 0.1]], shell, 0, 0.006, 0, 28)
  base.scale.x = 1.2
  g.add(base)
  const foot = cyl(0.11, 0.11, 0.006, mat.felt(c.felt), 0, 0.003, 0, 28)
  foot.scale.x = 1.2
  g.add(foot)
  const dial = mesh(geo.cyl(0.048, 0.048, 0.006, 32), paintedMaterial(`dial:${c.paper}:${c.ink}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = c.paper; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = c.ink
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * 0.35 - (i / 10) * Math.PI * 1.55
      ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * w * 0.34, h / 2 + Math.sin(a) * h * 0.34, w * 0.055, 0, Math.PI * 2); ctx.fill()
    }
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.15, 0, Math.PI * 2); ctx.fill()
  }, 0.5), 0, 0.08, 0.05)
  dial.rotation.x = 0.55
  g.add(dial)
  const ring = mesh(geo.torus(0.048, 0.005, Math.PI * 2, 32), mat.brass(), 0, 0.08, 0.05)
  ring.rotation.x = -Math.PI / 2 + 0.55
  g.add(ring)
  for (const s of [-1, 1]) g.add(cyl(0.012, 0.014, 0.05, mat.brass(), s * 0.06, 0.125, -0.03, 10))
  const handset = new THREE.Group()
  handset.add(rodX(0.014, 0.2, shell, 0, 0, 0))
  for (const s of [-1, 1]) {
    const cup = cyl(0.034, 0.024, 0.04, shell, s * 0.1, -0.02, 0, 16)
    cup.rotation.z = s * 0.25
    handset.add(cup)
  }
  handset.position.set(0, 0.17, -0.03)
  g.add(handset)
  const helix: THREE.Vector3[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    helix.push(new THREE.Vector3(-0.11 - t * 0.14 + Math.cos(t * 44) * 0.012, 0.15 - t * 0.12 + Math.sin(t * 44) * 0.012, -0.03 - t * 0.02))
  }
  g.add(mesh(cachedGeometry('phone-cord', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 180, 0.003, 6, false)), shell))
  return g
}

/** A typewriter in enamel with a sheet of typed copy in the platen; origin on the table. */
export function typewriter(o: PropOptions & { color?: string; lines?: string[] }): THREE.Group {
  const c = o.colors
  const g = prop('typewriter')
  const shell = mat.enamel(o.color ?? c.accent2)
  const dark = mat.lacquer(c.ink)
  g.add(box(0.36, 0.1, 0.28, shell, 0, 0.065, 0))
  g.add(box(0.3, 0.06, 0.16, shell, 0, 0.145, -0.05))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.012, 0.012, 0.015, mat.felt(c.felt), x * 0.16, 0.0075, z * 0.12, 10))
  const keyboard = box(0.32, 0.02, 0.15, dark, 0, 0.11, 0.07)
  keyboard.rotation.x = 0.28
  g.add(keyboard)
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 10; i++) {
      const x = -0.135 + i * 0.03 + row * 0.01
      const z = 0.115 - row * 0.035
      const y = 0.12 + (0.115 - z) * 0.28
      g.add(cyl(0.011, 0.011, 0.008, mat.paper(c.paper), x, y, z, 12))
      g.add(cyl(0.003, 0.003, 0.014, mat.steel(), x, y - 0.01, z, 6))
    }
  }
  g.add(box(0.14, 0.008, 0.02, mat.paper(c.paper), 0, 0.126, 0.145))
  g.add(box(0.4, 0.035, 0.07, shell, 0, 0.195, -0.09))
  g.add(rodX(0.024, 0.34, dark, 0, 0.225, -0.09))
  for (const s of [-1, 1]) g.add(rodX(0.02, 0.025, mat.brass(), s * 0.185, 0.225, -0.09))
  const lever = tube(new THREE.Vector3(-0.19, 0.225, -0.09), new THREE.Vector3(-0.27, 0.26, -0.03), 0.004, mat.brass())
  g.add(lever)
  const lines = o.lines ?? ['Dear Sir,', '', 'The house is in order.', 'The board is set.']
  const sheet = mesh(geo.plane(0.21, 0.2), cachedMaterial(`typed:${lines.join('|')}:${c.paper}`, () =>
    new THREE.MeshStandardMaterial({ map: labelTexture({ lines, font: 'mono', bg: c.paper, color: c.ink, width: 512, height: 512, align: 'left', padding: 40, size: 34, paper: true }), roughness: 0.95, side: THREE.DoubleSide })), 0, 0.33, -0.1)
  sheet.rotation.x = 0.3
  g.add(sheet)
  g.add(box(0.1, 0.02, 0.004, mat.brass(), 0, 0.09, 0.14))
  return g
}

/** A brass telescope on a wooden tripod, aimed by `azimuth` (about y) and `elevation` (up). */
export function telescope(o: PropOptions & { height?: number; azimuth?: number; elevation?: number }): THREE.Group {
  const c = o.colors, h = o.height ?? 1.35
  const g = prop('telescope')
  const timber = wood(c, 'tripod')
  const hubY = h - 0.12
  const feet: [number, number][] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const foot = new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42)
    g.add(tube(foot, new THREE.Vector3(0, hubY, 0), 0.016, timber, 10))
    g.add(cyl(0.02, 0.02, 0.01, mat.brass(), foot.x, 0.005, foot.z, 10))
    feet.push([foot.x, foot.z])
  }
  g.add(cyl(0.045, 0.045, 0.06, mat.brass(), 0, hubY, 0, 16))
  g.add(cyl(0.012, 0.012, 0.1, mat.brass(), 0, hubY + 0.08, 0, 10))
  const scope = new THREE.Group()
  scope.position.y = hubY + 0.15
  scope.rotation.y = o.azimuth ?? 0.5
  scope.rotation.x = -(o.elevation ?? 0.45)
  const main = cyl(0.045, 0.05, 0.85, mat.brass(), 0, 0, 0, 24)
  main.rotation.x = Math.PI / 2
  scope.add(main)
  const bell = cyl(0.058, 0.05, 0.08, mat.brass(), 0, 0, -0.46, 24)
  bell.rotation.x = Math.PI / 2
  scope.add(bell)
  const lens = mesh(geo.circle(0.05, 24), mat.glass(c.accent2), 0, 0, -0.501)
  lens.rotation.y = Math.PI
  scope.add(lens)
  const eye = cyl(0.02, 0.028, 0.14, mat.lacquer(c.ink), 0, 0, 0.49, 16)
  eye.rotation.x = Math.PI / 2
  scope.add(eye)
  scope.add(box(0.03, 0.05, 0.05, mat.brass(), 0, -0.06, 0.05))
  g.add(scope)
  feltFeet(g, c, feet, 0.02)
  return g
}

/** A table globe: a painted sphere in a brass meridian on a turned wooden stand; origin on the table. */
export function globe(o: PropOptions & { radius?: number }): THREE.Group {
  const c = o.colors, r = o.radius ?? 0.16
  const g = prop('globe')
  const timber = wood(c, 'globe')
  g.add(lathe('globe-stand', [[0, 0], [0.11, 0], [0.12, 0.012], [0.08, 0.03], [0.03, 0.05], [0.03, 0.09], [0.045, 0.12], [0.02, 0.14], [0, 0.14]], timber, 0, 0, 0, 28))
  g.add(cyl(0.12, 0.12, 0.004, mat.felt(c.felt), 0, 0.002, 0, 28))
  const cy = 0.14 + r + 0.06
  const tilt = new THREE.Group()
  tilt.position.y = cy
  tilt.rotation.z = -0.41
  tilt.add(mesh(geo.torus(r + 0.025, 0.006, Math.PI * 2, 48), mat.brass(), 0, 0, 0))
  const rnd = seeded(o.seed ?? 'globe')
  const sphere = mesh(geo.sphere(r, 40), paintedMaterial(`globe:${c.accent2}:${c.paper}:${c.ink}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = c.accent2; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = c.paper
    for (let i = 0; i < 9; i++) {
      ctx.beginPath()
      ctx.ellipse(rnd() * w, h * (0.2 + rnd() * 0.6), w * (0.04 + rnd() * 0.08), h * (0.06 + rnd() * 0.12), rnd() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillRect(0, 0, w, h * 0.06); ctx.fillRect(0, h * 0.94, w, h * 0.06)
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.globalAlpha = 0.35
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, (h / 6) * i); ctx.lineTo(w, (h / 6) * i); ctx.stroke() }
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo((w / 12) * i, 0); ctx.lineTo((w / 12) * i, h); ctx.stroke() }
    ctx.globalAlpha = 1
  }, 0.6), 0, 0, 0)
  tilt.add(sphere)
  tilt.add(cyl(0.005, 0.005, r * 2 + 0.06, mat.brass(), 0, 0, 0, 8))
  tilt.add(mesh(geo.sphere(0.012, 10), mat.brass(), 0, r + 0.03, 0))
  g.add(tilt)
  g.add(tube(new THREE.Vector3(0, 0.14, 0), new THREE.Vector3(Math.sin(0.41) * (r + 0.03), cy - Math.cos(0.41) * (r + 0.03), 0), 0.008, mat.brass(), 10))
  return g
}

/** A record player in a wooden case with the lid open and a record on the platter; origin on the table. */
export function recordPlayer(o: PropOptions & { color?: string; label?: string }): THREE.Group {
  const c = o.colors
  const g = prop('recordPlayer')
  const timber = wood(c, 'record', [1, 1])
  g.add(box(0.42, 0.12, 0.36, timber, 0, 0.075, 0))
  g.add(box(0.4, 0.006, 0.34, mat.enamel(o.color ?? c.accent2), 0, 0.138, 0))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.014, 0.014, 0.015, mat.lacquer(c.ink), x * 0.18, 0.0075, z * 0.15, 10))
  g.add(cyl(0.15, 0.15, 0.012, mat.lacquer(c.ink), -0.04, 0.147, 0.01, 40))
  g.add(cyl(0.148, 0.148, 0.003, mat.flat(c.ink), -0.04, 0.155, 0.01, 40))
  g.add(cyl(0.05, 0.05, 0.004, mat.paper(o.label ?? c.accent), -0.04, 0.157, 0.01, 24))
  g.add(cyl(0.004, 0.004, 0.02, mat.brass(), -0.04, 0.165, 0.01, 8))
  g.add(cyl(0.018, 0.02, 0.03, mat.brass(), 0.15, 0.155, -0.12, 14))
  g.add(tube(new THREE.Vector3(0.15, 0.175, -0.12), new THREE.Vector3(0.04, 0.165, 0.02), 0.004, mat.brass(), 8))
  g.add(box(0.02, 0.008, 0.03, mat.lacquer(c.ink), 0.04, 0.163, 0.02))
  g.add(cyl(0.012, 0.012, 0.012, mat.brass(), 0.16, 0.147, 0.1, 14))
  const lid = new THREE.Group()
  lid.position.set(0, 0.14, -0.18)
  lid.rotation.x = -2.3
  lid.add(mesh(geo.box(0.42, 0.006, 0.36), mat.glass(c.sky), 0, 0, 0.18))
  for (const s of [-1, 1]) lid.add(box(0.012, 0.01, 0.36, mat.brass(), s * 0.205, 0, 0.18))
  lid.add(box(0.42, 0.01, 0.012, mat.brass(), 0, 0, 0.354))
  g.add(lid)
  for (const s of [-1, 1]) g.add(box(0.04, 0.012, 0.012, mat.brass(), s * 0.14, 0.145, -0.18))
  return g
}

/** Paints a paper clock face: hour batons, minute ticks and Roman numerals in Jost. */
function paintClockFace(ctx: CanvasRenderingContext2D, size: number, paper: string, ink: string, accent: string): void {
  const cx = size / 2, r = size / 2
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = ink
  ctx.lineCap = 'butt'
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const hour = i % 5 === 0
    ctx.lineWidth = hour ? size * 0.018 : size * 0.005
    const inner = hour ? r * 0.8 : r * 0.87
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * inner, cx + Math.sin(a) * inner)
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cx + Math.sin(a) * r * 0.92)
    ctx.stroke()
  }
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
  ctx.fillStyle = ink
  ctx.font = `500 ${Math.round(size * 0.085)}px ${FONT_SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  numerals.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    ctx.fillText(n, cx + Math.cos(a) * r * 0.66, cx + Math.sin(a) * r * 0.66)
  })
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.arc(cx, cx, size * 0.012, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = ink; ctx.lineWidth = size * 0.004
  ctx.beginPath(); ctx.arc(cx, cx, r * 0.96, 0, Math.PI * 2); ctx.stroke()
}

/** Adds ink hands for a time of `hours:minutes` on a face of `radius`, at depth `z`. */
function clockHands(g: THREE.Group, radius: number, hours: number, minutes: number, z: number, ink: string, brass: THREE.Material): void {
  const hourAngle = -((hours % 12) + minutes / 60) / 12 * Math.PI * 2
  const minuteAngle = -(minutes / 60) * Math.PI * 2
  const hand = (len: number, width: number, angle: number, dz: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(0, 0, z + dz)
    pivot.rotation.z = angle
    pivot.add(box(width, len, 0.003, mat.flat(ink), 0, len / 2 - len * 0.12, 0))
    g.add(pivot)
  }
  hand(radius * 0.55, radius * 0.07, hourAngle, 0.002)
  hand(radius * 0.82, radius * 0.045, minuteAngle, 0.005)
  g.add(mesh(geo.sphere(radius * 0.05, 10), brass, 0, 0, z + 0.006))
}

/** A round wall clock in a wooden case, hung with its centre at `y`, showing `hours:minutes`. Back at z = 0. */
export function wallClock(o: PropOptions & { diameter?: number; y?: number; hours?: number; minutes?: number }): THREE.Group {
  const c = o.colors, dia = o.diameter ?? 0.4, y = o.y ?? 2.2, r = dia / 2
  const g = prop('wallClock')
  const face = new THREE.Group()
  face.position.y = y
  const caseMesh = rodZ(r + 0.035, 0.07, wood(c, 'clock'), 0, 0, 0.035, 40)
  face.add(caseMesh)
  face.add(mesh(geo.torus(r + 0.005, 0.008, Math.PI * 2, 48), mat.brass(), 0, 0, 0.072))
  const dial = mesh(geo.circle(r, 48), paintedMaterial(`clockface:${c.paper}:${c.ink}:${c.accent}`, 512, 512, (ctx, w) => paintClockFace(ctx, w, c.paper, c.ink, c.accent), 0.8), 0, 0, 0.072)
  dial.castShadow = false
  face.add(dial)
  clockHands(face, r, o.hours ?? 10, o.minutes ?? 10, 0.074, c.ink, mat.brass())
  const glass = mesh(geo.circle(r + 0.004, 48), mat.glass(), 0, 0, 0.09)
  glass.castShadow = false
  face.add(glass)
  g.add(face)
  return g
}

/** An arched mantel clock on brass feet, showing `hours:minutes`; origin on the mantel. */
export function mantelClock(o: PropOptions & { hours?: number; minutes?: number }): THREE.Group {
  const c = o.colors, w = 0.24, r = 0.075
  const g = prop('mantelClock')
  const timber = wood(c, 'mantel')
  g.add(box(w, 0.17, 0.1, timber, 0, 0.02 + 0.085, 0))
  g.add(rodZ(w / 2, 0.1, timber, 0, 0.19, 0, 32))
  g.add(box(w + 0.02, 0.02, 0.12, mat.lacquer(c.ink), 0, 0.01, 0))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(geo.sphere(0.012, 10), mat.brass(), x * 0.1, 0.008, z * 0.045))
  const face = new THREE.Group()
  face.position.set(0, 0.16, 0.05)
  face.add(mesh(geo.torus(r + 0.004, 0.006, Math.PI * 2, 40), mat.brass(), 0, 0, 0.004))
  const dial = mesh(geo.circle(r, 40), paintedMaterial(`clockface:${c.paper}:${c.ink}:${c.accent}`, 512, 512, (ctx, s) => paintClockFace(ctx, s, c.paper, c.ink, c.accent), 0.8), 0, 0, 0.002)
  dial.castShadow = false
  face.add(dial)
  clockHands(face, r, o.hours ?? 10, o.minutes ?? 10, 0.004, c.ink, mat.brass())
  g.add(face)
  g.add(mesh(geo.sphere(0.014, 10), mat.brass(), 0, 0.31, 0))
  return g
}

/** A tea tray with a pot, two cups and saucers and a sugar bowl; origin on the table. */
export function teaSet(o: PropOptions & { china?: string; band?: string }): THREE.Group {
  const c = o.colors
  const g = prop('teaSet')
  const china = mat.enamel(o.china ?? c.paper)
  const band = mat.flat(o.band ?? c.accent)
  g.add(box(0.46, 0.012, 0.3, mat.lacquer(c.accent), 0, 0.006, 0))
  for (const s of [-1, 1]) {
    g.add(box(0.012, 0.03, 0.3, mat.brass(), s * 0.226, 0.02, 0))
    g.add(box(0.06, 0.012, 0.012, mat.brass(), s * 0.25, 0.03, 0))
  }
  for (const s of [-1, 1]) g.add(box(0.46, 0.03, 0.012, mat.brass(), 0, 0.02, s * 0.144))
  const pot = new THREE.Group()
  pot.position.set(-0.1, 0.012, -0.03)
  pot.add(lathe('teapot', [[0, 0], [0.05, 0], [0.07, 0.015], [0.078, 0.07], [0.068, 0.12], [0.04, 0.135], [0.042, 0.145], [0.028, 0.15], [0, 0.15]], china, 0, 0, 0, 28))
  pot.add(mesh(geo.torus(0.07, 0.004, Math.PI * 2, 28), band, 0, 0.1, 0).rotateX(Math.PI / 2))
  pot.add(mesh(geo.sphere(0.012, 10), mat.brass(), 0, 0.16, 0))
  pot.add(tube(new THREE.Vector3(0.06, 0.06, 0), new THREE.Vector3(0.12, 0.14, 0), 0.011, china, 12))
  const handle = mesh(geo.torus(0.045, 0.008, Math.PI, 20), china, -0.075, 0.08, 0)
  handle.rotation.z = Math.PI / 2
  pot.add(handle)
  g.add(pot)
  const cupProfile: Profile = [[0, 0], [0.024, 0], [0.028, 0.004], [0.034, 0.052], [0.036, 0.056], [0.03, 0.056], [0.028, 0.05], [0.026, 0.008], [0, 0.008]]
  for (const [x, z] of [[0.08, -0.06], [0.13, 0.07]]) {
    const cup = new THREE.Group()
    cup.position.set(x, 0.012, z)
    cup.add(cyl(0.055, 0.045, 0.006, china, 0, 0.003, 0, 28))
    cup.add(mesh(geo.torus(0.05, 0.003, Math.PI * 2, 28), band, 0, 0.006, 0).rotateX(Math.PI / 2))
    cup.add(lathe('teacup', cupProfile, china, 0, 0.006, 0, 24))
    cup.add(mesh(geo.torus(0.034, 0.003, Math.PI * 2, 24), band, 0, 0.056, 0).rotateX(Math.PI / 2))
    const ear = mesh(geo.torus(0.014, 0.004, Math.PI, 14), china, 0.038, 0.035, 0)
    ear.rotation.z = -Math.PI / 2
    cup.add(ear)
    cup.add(box(0.008, 0.002, 0.07, mat.brass(), 0, 0.007, 0.05).rotateY(0.3))
    g.add(cup)
  }
  g.add(lathe('sugar', [[0, 0], [0.03, 0], [0.036, 0.03], [0.03, 0.05], [0.032, 0.056], [0.012, 0.06], [0, 0.06]], china, -0.13, 0.012, 0.09, 24))
  g.add(mesh(geo.torus(0.034, 0.003, Math.PI * 2, 24), band, -0.13, 0.05, 0.09).rotateX(Math.PI / 2))
  return g
}

/** A small round chess table on a turned pedestal with an inlaid board and four pawns waiting. */
export function chessTableSmall(o: PropOptions & { height?: number; size?: number }): THREE.Group {
  const c = o.colors, h = o.height ?? 0.7, s = o.size ?? 0.44
  const g = prop('chessTableSmall')
  const timber = wood(c, 'chesstable')
  g.add(cyl(0.2, 0.22, 0.03, timber, 0, 0.015, 0, 32))
  g.add(cyl(0.22, 0.22, 0.004, mat.felt(c.felt), 0, 0.002, 0, 32))
  g.add(lathe('pedestal', [[0.05, 0], [0.05, 0.08], [0.07, 0.11], [0.04, 0.15], [0.035, 0.5], [0.06, 0.55], [0.06, 0.58], [0.03, 0.6], [0.03, 1]].map(([r, y]) => [r, y * (h - 0.09) / 1]), timber, 0, 0.03, 0, 24))
  g.add(box(s + 0.1, 0.04, s + 0.1, timber, 0, h - 0.02, 0))
  g.add(box(s + 0.12, 0.01, s + 0.12, mat.lacquer(c.trim), 0, h - 0.045, 0))
  const boardMesh = mesh(geo.box(s, 0.006, s), tiles(c.paper, c.ink, c.woodGrain, [4, 4]), 0, h + 0.003, 0)
  g.add(boardMesh)
  g.add(box(0.08, 0.03, 0.02, timber, 0, h - 0.055, (s + 0.1) / 2 + 0.01))
  g.add(knob(0, h - 0.055, (s + 0.1) / 2 + 0.02, 0.008))
  const pawn: Profile = [[0, 0], [0.014, 0], [0.014, 0.004], [0.009, 0.01], [0.006, 0.026], [0.01, 0.03], [0.006, 0.034], [0.009, 0.04], [0.006, 0.046], [0, 0.048]]
  const sq = s / 8
  const spots: [number, number, string][] = [[-3.5, 3.5, c.paper], [2.5, 3.5, c.paper], [-2.5, -3.5, c.ink], [3.5, -2.5, c.ink]]
  for (const [fx, fz, colour] of spots) g.add(lathe('pawn-small', pawn, mat.lacquer(colour), fx * sq, h + 0.006, fz * sq, 16))
  return g
}

// ───────────────────────────── Architecture ─────────────────────────────

/** A tiled fireplace with a lacquered mantel, brass grate, logs and a low ember glow. Back at z = 0. */
export function fireplace(o: PropOptions & { width?: number; height?: number; lit?: boolean; tileA?: string; tileB?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.6, h = o.height ?? 1.2, d = 0.32
  const g = prop('fireplace')
  const paint = mat.lacquer(c.trim)
  const ow = w - 0.64, oh = h - 0.46
  for (const s of [-1, 1]) g.add(box(0.2, h - 0.08, d, paint, s * (w / 2 - 0.1), (h - 0.08) / 2, d / 2))
  g.add(box(w, 0.26, d, paint, 0, h - 0.08 - 0.13, d / 2))
  g.add(box(w + 0.12, 0.07, d + 0.08, paint, 0, h - 0.035, (d + 0.08) / 2))
  g.add(box(w + 0.16, 0.015, d + 0.1, paint, 0, h - 0.078, (d + 0.1) / 2))
  const tileMat = tiles(o.tileA ?? c.accent, o.tileB ?? c.paper, c.trim, [3, 3])
  for (const s of [-1, 1]) g.add(box(0.12, oh + 0.12, 0.02, tileMat, s * (ow / 2 + 0.06), (oh + 0.12) / 2, d + 0.01))
  g.add(box(ow + 0.24, 0.12, 0.02, tileMat, 0, oh + 0.06, d + 0.01))
  const firebox = box(ow, oh, d - 0.04, mat.flat(c.ink), 0, oh / 2, (d - 0.04) / 2)
  firebox.receiveShadow = true
  g.add(firebox)
  g.add(box(w + 0.3, 0.02, 0.5, tiles(c.ink, c.paper, c.trim, [3, 1]), 0, 0.01, d + 0.25))
  for (let i = 0; i < 5; i++) g.add(rodX(0.007, ow - 0.1, mat.brass(), 0, 0.06 + i * 0.045, d - 0.1 + i * 0.01))
  for (const s of [-1, 1]) g.add(box(0.04, 0.3, 0.04, mat.brass(), s * (ow / 2 - 0.08), 0.15, d - 0.06))
  const bark = mat.wood({ base: c.woodGrain, grain: c.ink, seed: 'log' })
  const logA = rodX(0.045, ow * 0.6, bark, -0.02, 0.29, d - 0.18)
  logA.rotation.y = 0.2
  g.add(logA)
  const logB = rodX(0.04, ow * 0.55, bark, 0.03, 0.34, d - 0.12)
  logB.rotation.y = -0.3
  g.add(logB)
  if (o.lit ?? true) {
    g.add(mesh(geo.sphere(0.05, 12), lit(c.accent2, 2.2), 0.02, 0.27, d - 0.14))
    g.add(glow(c.accent2, 0.7, 3, 0, 0.35, d - 0.1))
  }
  return g
}

/** A straight wooden staircase rising toward −z with a baluster rail on the `rail` side. */
export function staircase(o: PropOptions & { steps?: number; rise?: number; run?: number; width?: number; rail?: 'left' | 'right' | 'none' }): THREE.Group {
  const c = o.colors, n = o.steps ?? 12, rise = o.rise ?? 0.18, run = o.run ?? 0.28, w = o.width ?? 1.0
  const g = prop('staircase')
  const timber = wood(c, 'stair', [1, 1])
  const paint = mat.lacquer(c.trim)
  for (let i = 0; i < n; i++) {
    g.add(box(w, 0.04, run + 0.03, timber, 0, (i + 1) * rise - 0.02, -i * run - run / 2 + 0.015))
    g.add(box(w, rise - 0.04, 0.02, paint, 0, i * rise + (rise - 0.04) / 2, -i * run - 0.01))
  }
  const length = Math.hypot(n * run, n * rise), angle = Math.atan2(rise, run)
  for (const s of [-1, 1]) {
    const stringer = box(0.04, 0.32, length, paint, s * (w / 2 + 0.02), (n * rise) / 2 - 0.12, -(n * run) / 2)
    stringer.rotation.x = angle
    g.add(stringer)
  }
  const railSide = o.rail ?? 'right'
  if (railSide !== 'none') {
    const x = (railSide === 'right' ? 1 : -1) * (w / 2 - 0.04)
    for (let i = 0; i < n; i++) {
      for (const k of [0.3, 0.7]) g.add(cyl(0.011, 0.013, 0.86, paint, x, (i + 1) * rise + 0.43, -i * run - run * k, 10))
    }
    const rail = box(0.05, 0.05, length + 0.2, timber, x, (n * rise) / 2 + 0.88, -(n * run) / 2)
    rail.rotation.x = angle
    g.add(rail)
    for (const [y, z] of [[0, 0.02], [n * rise, -n * run - 0.02]]) {
      g.add(box(0.09, 1.0, 0.09, timber, x, y + 0.5, z))
      g.add(mesh(geo.sphere(0.05, 14), mat.brass(), x, y + 1.04, z))
    }
  }
  return g
}

/** A wooden ladder leaning back by `lean` radians (its top toward −z, against a wall). */
export function ladder(o: PropOptions & { height?: number; width?: number; lean?: number }): THREE.Group {
  const c = o.colors, h = o.height ?? 2.4, w = o.width ?? 0.45
  const g = prop('ladder')
  const timber = wood(c, 'ladder', [1, 3])
  const frame = new THREE.Group()
  frame.rotation.x = -(o.lean ?? 0.18)
  for (const s of [-1, 1]) frame.add(box(0.04, h, 0.03, timber, s * (w / 2 - 0.02), h / 2, 0))
  const rungs = Math.floor(h / 0.3)
  for (let i = 1; i <= rungs; i++) frame.add(rodX(0.014, w - 0.04, timber, 0, i * 0.3, 0))
  for (const s of [-1, 1]) frame.add(box(0.05, 0.03, 0.04, mat.flat(c.ink), s * (w / 2 - 0.02), 0.015, 0))
  g.add(frame)
  return g
}

/** A velvet curtain panel with soft vertical folds, on a brass rod with finials (rod optional). */
export function curtain(o: PropOptions & { width?: number; height?: number; folds?: number; color?: string; rod?: boolean; tieback?: boolean }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.4, h = o.height ?? 2.4, folds = o.folds ?? 7
  const g = prop('curtain')
  const pinch = o.tieback ? 1 : 0
  const panelGeo = cachedGeometry(`curtain:${r3(w)},${r3(h)},${folds},${pinch}`, () => {
    const pg = new THREE.PlaneGeometry(w, h, folds * 12, 24)
    const pos = pg.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const k = (y + h / 2) / h
      const waist = pinch * Math.exp(-Math.pow((k - 0.4) / 0.09, 2))
      const depth = (0.025 + 0.02 * k) * (1 - waist * 0.6)
      pos.setX(i, x * (1 - waist * 0.45))
      pos.setZ(i, Math.sin(((x + w / 2) / w) * folds * Math.PI * 2) * depth)
    }
    pg.computeVertexNormals()
    return pg
  })
  const panel = mesh(panelGeo, twoSided(mat.velvet(o.color ?? c.accent), `velvet:${o.color ?? c.accent}`), 0, h / 2 + 0.02, 0.06)
  g.add(panel)
  if (o.tieback) {
    const band = mesh(geo.torus(w * 0.3, 0.014, Math.PI * 2, 32), mat.flat(c.brass), 0, h * 0.42, 0.06)
    band.rotation.x = Math.PI / 2
    band.scale.z = 0.4
    g.add(band)
  }
  if (o.rod ?? true) {
    g.add(rodX(0.014, w + 0.2, mat.brass(), 0, h + 0.05, 0.06))
    for (const s of [-1, 1]) {
      g.add(mesh(geo.sphere(0.03, 12), mat.brass(), s * (w / 2 + 0.11), h + 0.05, 0.06))
      g.add(box(0.03, 0.03, 0.06, mat.brass(), s * (w / 2 - 0.05), h + 0.05, 0.03))
    }
    const rings = Math.max(3, folds + 1)
    for (let i = 0; i < rings; i++) {
      const ring = mesh(geo.torus(0.022, 0.004, Math.PI * 2, 16), mat.brass(), -w / 2 + (w / (rings - 1)) * i, h + 0.05, 0.06)
      ring.rotation.y = Math.PI / 2
      g.add(ring)
    }
  }
  return g
}

/** A painted sign board on a post, or hung from brackets when `post` is false (back at z = 0). */
export function sign(o: PropOptions & { text: string; width?: number; height?: number; post?: boolean; bg?: string; color?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 1.0, h = o.height ?? 2.0
  const g = prop('sign')
  const board = paintedSign({ text: o.text, width: w, bg: o.bg ?? c.accent, color: o.color ?? c.paper, depth: 0.03 })
  const boardH = w * 0.28
  if (o.post ?? true) {
    g.add(cyl(0.03, 0.036, h - boardH / 2, mat.lacquer(c.ink), 0, (h - boardH / 2) / 2, -0.03, 12))
    g.add(cyl(0.09, 0.1, 0.04, mat.lacquer(c.ink), 0, 0.02, -0.03, 16))
    g.add(mesh(geo.sphere(0.035, 12), mat.brass(), 0, h + boardH / 2 + 0.05, -0.03))
    board.position.set(0, h, 0)
  } else {
    for (const s of [-1, 1]) g.add(box(0.02, 0.05, 0.12, mat.brass(), s * (w / 2 - 0.08), h + boardH / 2 + 0.02, 0.06))
    board.position.set(0, h, 0.1)
  }
  g.add(board)
  return g
}

// ───────────────────────────── Outside ─────────────────────────────

/** A cast-iron lamppost with a four-paned lantern and a warm light inside. */
export function lamppost(o: PropOptions & { height?: number; lit?: boolean }): THREE.Group {
  const c = o.colors, h = o.height ?? 3.2
  const g = prop('lamppost')
  const iron = mat.lacquer(c.ink)
  g.add(lathe('post-base', [[0, 0], [0.16, 0], [0.16, 0.06], [0.12, 0.08], [0.1, 0.2], [0.07, 0.3], [0.06, 0.5], [0.045, 0.55], [0, 0.55]], iron, 0, 0, 0, 20))
  g.add(cyl(0.035, 0.045, h - 1.05, iron, 0, 0.55 + (h - 1.05) / 2, 0, 14))
  g.add(box(0.5, 0.03, 0.03, iron, 0, h - 0.75, 0))
  g.add(cyl(0.07, 0.05, 0.06, iron, 0, h - 0.5 + 0.03, 0, 12))
  const lw = 0.3, lh = 0.4, ly = h - 0.25
  const lantern = mesh(geo.box(lw, lh, lw), mat.glass(), 0, ly, 0)
  lantern.castShadow = false
  g.add(lantern)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.02, lh, 0.02, mat.brass(), sx * (lw / 2 - 0.01), ly, sz * (lw / 2 - 0.01)))
  for (const sy of [-1, 1]) {
    g.add(box(lw + 0.02, 0.02, 0.02, mat.brass(), 0, ly + sy * lh / 2, lw / 2))
    g.add(box(lw + 0.02, 0.02, 0.02, mat.brass(), 0, ly + sy * lh / 2, -lw / 2))
    g.add(box(0.02, 0.02, lw + 0.02, mat.brass(), lw / 2, ly + sy * lh / 2, 0))
    g.add(box(0.02, 0.02, lw + 0.02, mat.brass(), -lw / 2, ly + sy * lh / 2, 0))
  }
  g.add(cyl(0.02, 0.26, 0.2, iron, 0, ly + lh / 2 + 0.1, 0, 4))
  g.add(mesh(geo.sphere(0.03, 12), mat.brass(), 0, ly + lh / 2 + 0.24, 0))
  if (o.lit ?? true) {
    g.add(box(0.12, 0.18, 0.12, lit(c.light, 2.6), 0, ly, 0))
    g.add(glow(c.light, 5, 10, 0, ly, 0))
  }
  return g
}

/** A painted picket fence with capped posts at both ends. */
export function fence(o: PropOptions & { width?: number; height?: number; color?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 3, h = o.height ?? 1.0
  const g = prop('fence')
  const paint = mat.flat(o.color ?? c.trim)
  const mud = mat.flat(c.woodGrain)
  for (const s of [-1, 1]) {
    g.add(box(0.09, h + 0.1, 0.09, paint, s * (w / 2), (h + 0.1) / 2, 0))
    g.add(cyl(0, 0.08, 0.08, paint, s * (w / 2), h + 0.14, 0, 4).rotateY(Math.PI / 4))
  }
  for (const y of [h * 0.3, h * 0.78]) g.add(box(w - 0.09, 0.06, 0.025, paint, 0, y, -0.02))
  const n = Math.floor((w - 0.2) / 0.15)
  const pitch = (w - 0.2) / n
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.1 + pitch * (i + 0.5)
    g.add(box(0.07, h - 0.12, 0.02, paint, x, 0.06 + (h - 0.12) / 2, 0.01))
    g.add(cyl(0, 0.05, 0.06, paint, x, h - 0.03, 0.01, 4).rotateY(Math.PI / 4))
    g.add(box(0.072, 0.1, 0.021, mud, x, 0.11, 0.01))
  }
  return g
}

/** A canopy blob: a lathe profile with a flat underside and a rounded crown. */
const CANOPY: Profile = Array.from({ length: 12 }, (_, i) => {
  const t = i / 11
  return [Math.pow(Math.sin(t * Math.PI), 0.7) * (1 - t * 0.12), t * 2] as [number, number]
})

/** A tree: a lathe trunk and a cluster of felt canopy blobs (a topiary read, never a fractal). */
export function tree(o: PropOptions & { height?: number; leaf?: string }): THREE.Group {
  const c = o.colors, h = o.height ?? 3.5
  const g = prop('tree')
  const rnd = seeded(o.seed ?? 'tree')
  const trunkH = h * 0.5
  g.add(lathe('trunk', [[0.2, 0], [0.13, 0.08], [0.1, 0.4], [0.075, 0.8], [0.06, 1]].map(([r, y]) => [r * (h / 3.5), y * trunkH]), mat.wood({ base: c.woodGrain, grain: c.ink, seed: 'bark' }), 0, 0, 0, 16))
  const leaf = mat.felt(o.leaf ?? c.felt)
  const R = h * 0.28
  const blobs: [number, number, number, number][] = [[0, -0.3, 0, 1], [0.55, 0.1, 0.2, 0.62], [-0.5, 0.2, -0.15, 0.66], [0.1, 0.9, -0.2, 0.6], [-0.1, 0.3, 0.5, 0.5]]
  for (const [x, y, z, k] of blobs) {
    const blob = mesh(geo.lathe('canopy', CANOPY, 24), leaf, x * R, trunkH + y * R, z * R)
    blob.scale.set(R * k, R * k * 0.95, R * k)
    blob.rotation.y = rnd() * Math.PI
    g.add(blob)
  }
  g.add(cyl(0.34 * (h / 3.5), 0.38 * (h / 3.5), 0.03, mat.flat(c.woodGrain), 0, 0.015, 0, 24))
  return g
}

/** A clipped hedge with a rounded top on a strip of soil. */
export function hedge(o: PropOptions & { width?: number; height?: number; depth?: number; leaf?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 2, h = o.height ?? 0.8, d = o.depth ?? 0.6
  const g = prop('hedge')
  const leaf = mat.felt(o.leaf ?? c.felt)
  const r = d / 2
  g.add(box(w, h - r, d, leaf, 0, (h - r) / 2, 0))
  g.add(rodX(r, w, leaf, 0, h - r, 0, 28))
  for (const s of [-1, 1]) g.add(mesh(geo.sphere(r, 24), leaf, s * (w / 2), h - r, 0))
  g.add(box(w + 0.2, 0.03, d + 0.2, mat.flat(c.woodGrain), 0, 0.015, 0))
  return g
}

/** A field of snow with soft drifts; top surface at y = 0. */
export function snowGround(o: PropOptions & { width?: number; depth?: number }): THREE.Group {
  const c = o.colors, w = o.width ?? 10, d = o.depth ?? 10
  const g = prop('snowGround')
  const rnd = seeded(o.seed ?? 'snow')
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6]
  const fieldGeo = cachedGeometry(`snow:${r3(w)},${r3(d)}:${o.seed ?? 'snow'}`, () => {
    const pg = new THREE.PlaneGeometry(w, d, 40, 40)
    const pos = pg.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      const edge = Math.min(1, (w / 2 - Math.abs(x)) / 1.2, (d / 2 - Math.abs(y)) / 1.2)
      const bump = Math.sin(x * 0.9 + ph[0]) * Math.sin(y * 1.1 + ph[1]) * 0.06 + Math.sin(x * 2.3 + ph[2]) * Math.sin(y * 1.9 + ph[3]) * 0.025
      pos.setZ(i, -0.02 + bump * Math.max(0, edge))
    }
    pg.computeVertexNormals()
    return pg
  })
  const snow = mat.plaster(c.paper)
  const field = mesh(fieldGeo, snow, 0, 0, 0)
  field.rotation.x = -Math.PI / 2
  field.castShadow = false
  g.add(field)
  for (let i = 0; i < 4; i++) {
    const drift = mesh(geo.sphere(1, 24), snow, (rnd() - 0.5) * w * 0.7, -0.05, (rnd() - 0.5) * d * 0.7)
    drift.scale.set(0.6 + rnd() * 0.8, 0.14 + rnd() * 0.1, 0.5 + rnd() * 0.6)
    g.add(drift)
  }
  return g
}

/** A funicular car in enamel with lit windows, a pinstripe, a numbered placard and a cable hook. Long side faces +z. */
export function funicularCar(o: PropOptions & { length?: number; height?: number; width?: number; color?: string; number?: string; lit?: boolean }): THREE.Group {
  const c = o.colors, l = o.length ?? 2.6, h = o.height ?? 2.3, w = o.width ?? 1.7
  const g = prop('funicularCar')
  const shell = mat.enamel(o.color ?? c.accent)
  const iron = mat.lacquer(c.ink)
  const bodyY = 0.42, bodyH = h - bodyY - 0.18
  g.add(box(l, bodyH, w, shell, 0, bodyY + bodyH / 2, 0))
  g.add(box(l + 0.04, 0.24, w + 0.04, iron, 0, bodyY + 0.12, 0))
  g.add(box(l + 0.01, 0.02, w + 0.01, mat.flat(c.trim), 0, bodyY + 0.3, 0))
  g.add(box(l + 0.12, 0.1, w + 0.12, iron, 0, h - 0.13, 0))
  g.add(box(l - 0.1, 0.1, w - 0.2, iron, 0, h - 0.05, 0))
  const winW = (l - 0.5) / 3 - 0.1, winH = bodyH * 0.5, winY = bodyY + bodyH * 0.56
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = -l / 2 + 0.25 + ((l - 0.5) / 3) * (i + 0.5)
      const pane = mesh(geo.plane(winW, winH), o.lit ?? true ? lit(c.light, 1.3) : mat.flat(c.sky), x, winY, side * (w / 2 + 0.004))
      if (side < 0) pane.rotation.y = Math.PI
      pane.castShadow = false
      g.add(pane)
      g.add(box(winW + 0.05, 0.025, 0.02, mat.brass(), x, winY + winH / 2, side * (w / 2 + 0.01)))
      g.add(box(winW + 0.05, 0.025, 0.02, mat.brass(), x, winY - winH / 2, side * (w / 2 + 0.01)))
      g.add(box(0.025, winH + 0.05, 0.02, mat.brass(), x - winW / 2, winY, side * (w / 2 + 0.01)))
      g.add(box(0.025, winH + 0.05, 0.02, mat.brass(), x + winW / 2, winY, side * (w / 2 + 0.01)))
    }
  }
  for (const end of [-1, 1]) {
    g.add(box(0.03, bodyH - 0.3, w - 0.5, mat.brass(), end * (l / 2 + 0.01), bodyY + bodyH / 2 + 0.05, 0))
    g.add(box(0.05, 0.02, 0.6, mat.brass(), end * (l / 2 + 0.03), bodyY + 0.5, 0))
  }
  for (const x of [-l * 0.3, l * 0.3]) for (const side of [-1, 1]) g.add(rodZ(0.15, 0.06, mat.steel(), x, 0.15, side * (w / 2 - 0.03), 24))
  g.add(rodX(0.04, l * 0.6, mat.steel(), 0, 0.15, 0))
  g.add(cyl(0.025, 0.025, 0.35, mat.steel(), 0, h + 0.15, 0, 10))
  const wheel = mesh(geo.torus(0.1, 0.02, Math.PI * 2, 24), mat.steel(), 0, h + 0.36, 0)
  g.add(wheel)
  const plate = placard({ lines: [o.number ?? '2'], width: 0.22, height: 0.22, bg: c.paper, color: c.ink, border: c.ink })
  plate.position.set(0, bodyY + bodyH * 0.2, w / 2 + 0.003)
  g.add(plate)
  g.add(box(l * 0.8, 0.015, 0.006, mat.flat(c.trim), 0, bodyY + bodyH * 0.9, w / 2 + 0.003))
  return g
}

/** A double-faced station clock on an iron post, showing `hours:minutes`. */
export function stationClock(o: PropOptions & { height?: number; diameter?: number; hours?: number; minutes?: number }): THREE.Group {
  const c = o.colors, h = o.height ?? 2.9, dia = o.diameter ?? 0.55, r = dia / 2
  const g = prop('stationClock')
  const iron = mat.lacquer(c.ink)
  g.add(lathe('clock-base', [[0, 0], [0.2, 0], [0.2, 0.05], [0.12, 0.08], [0.06, 0.2], [0, 0.2]], iron, 0, 0, 0, 20))
  const cy = h - r - 0.1
  g.add(cyl(0.035, 0.045, cy - r - 0.2, iron, 0, 0.2 + (cy - r - 0.2) / 2, 0, 14))
  g.add(box(0.14, 0.05, 0.12, mat.brass(), 0, cy - r - 0.06, 0))
  const head = new THREE.Group()
  head.position.y = cy
  head.add(rodZ(r + 0.04, 0.16, iron, 0, 0, 0, 48))
  const faceMat = paintedMaterial(`clockface:${c.paper}:${c.ink}:${c.accent}`, 512, 512, (ctx, s) => paintClockFace(ctx, s, c.paper, c.ink, c.accent), 0.8)
  for (const side of [-1, 1]) {
    const faceGroup = new THREE.Group()
    faceGroup.rotation.y = side < 0 ? Math.PI : 0
    faceGroup.add(mesh(geo.torus(r + 0.005, 0.01, Math.PI * 2, 48), mat.brass(), 0, 0, 0.08))
    const dial = mesh(geo.circle(r, 48), faceMat, 0, 0, 0.081)
    dial.castShadow = false
    faceGroup.add(dial)
    clockHands(faceGroup, r, o.hours ?? 10, o.minutes ?? 10, 0.083, c.ink, mat.brass())
    head.add(faceGroup)
  }
  g.add(head)
  g.add(mesh(geo.sphere(0.04, 14), mat.brass(), 0, cy + r + 0.07, 0))
  return g
}

/** A pillar letterbox in enamel with a brass slot and a 'LETTERS' plate. */
export function letterbox(o: PropOptions & { height?: number; color?: string; text?: string }): THREE.Group {
  const c = o.colors, h = o.height ?? 1.15
  const g = prop('letterbox')
  const shell = mat.enamel(o.color ?? c.accent)
  g.add(cyl(0.22, 0.24, 0.1, mat.lacquer(c.ink), 0, 0.05, 0, 32))
  g.add(cyl(0.2, 0.2, h - 0.3, shell, 0, 0.1 + (h - 0.3) / 2, 0, 32))
  g.add(cyl(0.23, 0.2, 0.05, shell, 0, h - 0.175, 0, 32))
  const dome = mesh(geo.sphere(0.23, 32), shell, 0, h - 0.15, 0)
  dome.scale.y = 0.55
  g.add(dome)
  g.add(mesh(geo.sphere(0.025, 12), mat.brass(), 0, h - 0.02, 0))
  g.add(box(0.24, 0.05, 0.03, mat.brass(), 0, h - 0.34, 0.195))
  g.add(box(0.2, 0.014, 0.01, mat.flat(c.ink), 0, h - 0.34, 0.215))
  const plate = placard({ lines: [o.text ?? 'LETTERS'], width: 0.22, height: 0.06, bg: c.paper, color: c.ink, border: c.ink })
  plate.position.set(0, h - 0.44, 0.203)
  g.add(plate)
  g.add(box(0.26, 0.5, 0.012, shell, 0, 0.42, 0.2))
  g.add(box(0.26, 0.004, 0.014, mat.flat(c.ink), 0, 0.67, 0.2))
  g.add(knob(0.09, 0.42, 0.206, 0.01))
  return g
}

/** A bicycle with spoked wheels, mudguards, a sprung saddle and a wicker basket, facing +x. */
export function bicycle(o: PropOptions & { color?: string }): THREE.Group {
  const c = o.colors
  const g = prop('bicycle')
  const frame = mat.lacquer(o.color ?? c.accent2)
  const dark = mat.lacquer(c.ink)
  const R = 0.33
  for (const x of [-0.56, 0.56]) {
    g.add(mesh(geo.torus(R, 0.016, Math.PI * 2, 40), dark, x, R, 0))
    g.add(rodZ(0.03, 0.06, mat.brass(), x, R, 0, 12))
    for (let i = 0; i < 9; i++) {
      const spoke = box(0.003, R * 2 - 0.03, 0.003, mat.steel(), x, R, 0)
      spoke.rotation.z = (i / 9) * Math.PI
      g.add(spoke)
    }
    const guard = mesh(geo.torus(R + 0.03, 0.012, Math.PI * 0.9, 24), frame, x, R, 0)
    guard.rotation.z = Math.PI * 0.08
    g.add(guard)
  }
  const A = new THREE.Vector3(-0.56, R, 0), B = new THREE.Vector3(0.56, R, 0), C = new THREE.Vector3(-0.08, 0.3, 0)
  const S = new THREE.Vector3(-0.22, 0.86, 0), H = new THREE.Vector3(0.36, 0.86, 0), H2 = new THREE.Vector3(0.44, 0.6, 0)
  for (const [p, q] of [[A, C], [A, S], [C, S], [S, H], [C, H2], [H, H2], [H2, B]]) g.add(tube(p, q, 0.014, frame, 10))
  g.add(rodZ(0.012, 0.5, mat.brass(), 0.36, 0.9, 0))
  for (const s of [-1, 1]) g.add(rodZ(0.016, 0.1, dark, 0.36, 0.9, s * 0.22))
  g.add(cyl(0.012, 0.012, 0.1, frame, -0.22, 0.9, 0, 8))
  g.add(box(0.26, 0.05, 0.13, mat.velvet(c.ink), -0.24, 0.98, 0))
  g.add(rodZ(0.09, 0.008, dark, -0.08, 0.3, 0.02, 24))
  for (const s of [-1, 1]) {
    g.add(tube(new THREE.Vector3(-0.08, 0.3, s * 0.04), new THREE.Vector3(-0.08 + s * 0.12, 0.3 + s * 0.1, s * 0.05), 0.008, mat.steel(), 8))
    g.add(box(0.08, 0.02, 0.04, dark, -0.08 + s * 0.12, 0.3 + s * 0.1, s * 0.07))
  }
  g.add(box(0.28, 0.2, 0.24, wood(c, 'wicker', [4, 2]), 0.6, 0.86, 0))
  g.add(box(0.3, 0.012, 0.26, mat.flat(c.trim), 0.6, 0.96, 0))
  const stand = tube(new THREE.Vector3(-0.35, 0.2, 0.02), new THREE.Vector3(-0.3, 0, 0.22), 0.007, mat.steel(), 8)
  g.add(stand)
  g.rotation.z = 0.06
  return g
}

/** Plan outline of a hull at |x| ≤ 1: pointed at both ends, fullest just aft of centre. */
function hullPlan(x: number): number {
  return Math.pow(Math.max(0, 1 - x * x), 0.8) * (1 - 0.1 * x)
}

/** A hull of length l, beam w and depth h: a lower hemisphere reshaped to a pointed plan with a rising sheer. */
function hullGeometry(l: number, w: number, h: number): THREE.BufferGeometry {
  return cachedGeometry(`hull:${r3(l)},${r3(w)},${r3(h)}`, () => {
    const g = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const ring = Math.sqrt(Math.max(1e-6, 1 - x * x))
      pos.setXYZ(i, x * (l / 2), h + y * h * (0.6 + 0.4 * (1 - x * x)) + 0.14 * x * x, (z / ring) * hullPlan(x) * (w / 2))
    }
    g.computeVertexNormals()
    return g
  })
}

/** A rowing boat with a painted hull, gunwale trim, thwarts and shipped oars; bow toward +x, resting on its keel. */
export function boat(o: PropOptions & { length?: number; width?: number; color?: string; name?: string }): THREE.Group {
  const c = o.colors, l = o.length ?? 3.0, w = o.width ?? 1.1, h = 0.46
  const g = prop('boat')
  g.add(mesh(hullGeometry(l, w, h), mat.lacquer(o.color ?? c.accent), 0, 0, 0))
  const inner = mesh(hullGeometry(l * 0.94, w * 0.9, h * 0.9), twoSided(mat.flat(c.woodGrain), `flat:${c.woodGrain}`), 0, 0.05, 0)
  inner.castShadow = false
  g.add(inner)
  const rim: THREE.Vector3[] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    const x = Math.cos(a)
    rim.push(new THREE.Vector3(x * (l / 2), h + 0.14 * x * x, Math.sin(a) * hullPlan(x) * (w / 2)))
  }
  g.add(mesh(cachedGeometry(`gunwale:${r3(l)},${r3(w)}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 96, 0.022, 8, true)), mat.flat(c.trim)))
  const timber = wood(c, 'boat')
  for (const x of [-l * 0.2, l * 0.14]) g.add(box(0.14, 0.03, hullPlan(x / (l / 2)) * w * 0.9, timber, x, h - 0.1, 0))
  g.add(box(0.22, 0.03, hullPlan(0.7) * w * 0.9, timber, l * 0.35, h - 0.06, 0))
  g.add(box(l * 0.7, 0.05, 0.06, mat.lacquer(c.ink), 0, 0.02, 0))
  for (const s of [-1, 1]) {
    g.add(tube(new THREE.Vector3(-l * 0.32, h + 0.03, s * w * 0.28), new THREE.Vector3(l * 0.3, h + 0.03, s * w * 0.1), 0.014, timber, 8))
    g.add(box(0.36, 0.01, 0.1, timber, -l * 0.32 - 0.15, h + 0.03, s * w * 0.3))
  }
  if (o.name) {
    const plate = placard({ lines: [o.name], width: 0.36, height: 0.09, bg: c.paper, color: c.ink, border: c.ink })
    plate.position.set(l * 0.1, h - 0.16, hullPlan(0.2) * (w / 2) * 0.99)
    plate.rotation.set(0, 0.12, 0)
    g.add(plate)
  }
  return g
}

/** A striped canvas ridge tent with guy ropes, pegs and a pennant; opening toward +z. */
export function tent(o: PropOptions & { width?: number; depth?: number; height?: number; canvas?: string; stripe?: string }): THREE.Group {
  const c = o.colors, w = o.width ?? 2.2, d = o.depth ?? 2.6, h = o.height ?? 1.8
  const g = prop('tent')
  const canvasColor = o.canvas ?? c.paper
  const cloth = twoSided(mat.wallpaper({ pattern: 'stripe', bg: canvasColor, fg: o.stripe ?? c.accent, scale: 1, repeat: [6, 1] }), `tent:${canvasColor}:${o.stripe ?? c.accent}`)
  const slope = Math.hypot(w / 2, h), angle = Math.atan2(h, w / 2)
  for (const s of [-1, 1]) {
    const side = mesh(geo.plane(d, slope), cloth, s * w / 4, h / 2, 0)
    side.rotation.set(0, Math.PI / 2, 0)
    side.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), s * (Math.PI / 2 - angle))
    g.add(side)
  }
  const endGeo = cachedGeometry(`tent-end:${r3(w)},${r3(h)}`, () => {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath()
    return new THREE.ShapeGeometry(s)
  })
  const back = mesh(endGeo, twoSided(mat.flat(canvasColor), `flat:${canvasColor}`), 0, 0, -d / 2)
  g.add(back)
  const flapGeo = cachedGeometry(`tent-flap:${r3(w)},${r3(h)}`, () => {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0); s.lineTo(0, 0); s.lineTo(0, h); s.closePath()
    return new THREE.ShapeGeometry(s)
  })
  const flap = mesh(flapGeo, twoSided(mat.flat(canvasColor), `flat:${canvasColor}`), 0, 0, d / 2 + 0.01)
  g.add(flap)
  g.add(box(0.03, 0.05, 0.06, mat.flat(c.accent), -w / 4, h * 0.55, d / 2 + 0.03))
  const timber = wood(c, 'tentpole')
  for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) g.add(cyl(0.02, 0.025, h, timber, 0, h / 2, z, 10))
  g.add(rodZ(0.018, d, timber, 0, h + 0.01, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const peg = new THREE.Vector3(sx * (w / 2 + 0.5), 0.02, sz * (d / 2 + 0.3))
    g.add(tube(new THREE.Vector3(sx * w / 2, 0.04, sz * (d / 2 - 0.02)), peg, 0.004, mat.flat(c.ink), 6))
    g.add(cyl(0.012, 0.012, 0.12, mat.flat(c.ink), peg.x, 0.03, peg.z, 6).rotateX(sz * 0.4))
  }
  g.add(box(w + 0.3, 0.01, d + 0.3, mat.felt(c.felt), 0, 0.005, 0))
  g.add(cyl(0.006, 0.006, 0.35, timber, 0, h + 0.16, d / 2 - 0.03, 6))
  const pennant = mesh(endGeo, twoSided(mat.flat(c.accent), `flat:${c.accent}`), 0.1, h + 0.28, d / 2 - 0.03)
  pennant.scale.set(0.12 / w, 0.16 / h, 1)
  pennant.rotation.set(0, Math.PI / 2, -Math.PI / 2)
  g.add(pennant)
  return g
}

/** A flagpole with a two-band flag gently waving, a brass finial and a cleat. */
export function flagpole(o: PropOptions & { height?: number; flag?: string; band?: string }): THREE.Group {
  const c = o.colors, h = o.height ?? 4
  const g = prop('flagpole')
  g.add(cyl(0.12, 0.15, 0.1, mat.lacquer(c.ink), 0, 0.05, 0, 20))
  g.add(cyl(0.02, 0.032, h - 0.1, mat.enamel(c.trim), 0, 0.1 + (h - 0.1) / 2, 0, 12))
  g.add(mesh(geo.sphere(0.045, 14), mat.brass(), 0, h + 0.04, 0))
  g.add(box(0.02, 0.06, 0.04, mat.brass(), 0.03, 1.2, 0))
  g.add(cyl(0.003, 0.003, h - 0.3, mat.flat(c.ink), 0.04, 0.1 + (h - 0.3) / 2, 0, 6))
  const fw = 1.0, fh = 0.62
  const flagGeo = cachedGeometry(`flag:${r3(fw)},${r3(fh)}`, () => {
    const pg = new THREE.PlaneGeometry(fw, fh, 24, 4)
    const pos = pg.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const k = (x + fw / 2) / fw
      pos.setZ(i, Math.sin(k * Math.PI * 2.2) * 0.07 * k)
    }
    pg.computeVertexNormals()
    return pg
  })
  const flagColor = o.flag ?? c.accent, bandColor = o.band ?? c.paper
  const flagMat = cachedMaterial(`flagmat:${flagColor}:${bandColor}`, () =>
    new THREE.MeshStandardMaterial({ map: painted(`flagtex:${flagColor}:${bandColor}`, 256, 128, (ctx, w2, h2) => {
      ctx.fillStyle = flagColor; ctx.fillRect(0, 0, w2, h2)
      ctx.fillStyle = bandColor; ctx.fillRect(0, h2 * 0.38, w2, h2 * 0.24)
      ctx.fillStyle = flagColor; ctx.beginPath(); ctx.arc(w2 * 0.3, h2 * 0.5, h2 * 0.09, 0, Math.PI * 2); ctx.fill()
    }), roughness: 0.9, side: THREE.DoubleSide }))
  const flag = mesh(flagGeo, flagMat, 0.04 + fw / 2, h - 0.1 - fh / 2, 0)
  g.add(flag)
  return g
}
