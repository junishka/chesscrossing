// Frame 6: The Station Master's Quarters (first floor, right). Locked until Chapter Four; built whole.
// A bed centred against the back wall under a curtained window, hospital corners, a corduroy blanket;
// a chair each side facing the bed; a shelf of thirty-four identical notebooks above the headboard;
// two chests with lamps, the sextant in its open box on the left, the mantel clock stopped at 05:20 on
// the right; the door to the Landing on the left wall, a wardrobe mirroring it on the right.
// The one flaw: the right chair holds his reading glasses, folded; the left the travelling set.
// Palette 3.2, darker: the walls are the mustard distemper at 0.85. Nothing here moves.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import type { RegionPalette } from '../../content/palette'
import { tokens } from '../../content/palette'
import { dressing } from '../../content/frames/quarters'
import { feltTexture, mat, plasterTexture, tileTexture } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { floor as floorProp, lampTable, mantelClock, pictureFrame } from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres. */
const ROOM = { w: 7, h: 4.2, d: 6 } as const
/** The wall tone multiplier the bible asks for in this room ("Palette 3.2, darker"). */
const DARKER = 0.85
/** Door opening. */
const DOOR = { w: 1.0, h: 2.2 } as const
/** Where the door sits along the left wall. */
const DOOR_Z = -0.6

/** `#rrggbb` of a colour scaled by `k` (the darker distemper; the grain of a cloth). */
function shade(hex: string, k: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString()
}

// ───────────────────────────── Merged geometry kit ─────────────────────────────

/**
 * Accumulates parts per material and flushes one mesh per material, so a chair or a bed is a
 * couple of draw calls rather than twenty. Parts are positioned by a matrix before merging.
 */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  private add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    const geo = g.clone()
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1))
    geo.applyMatrix4(mtx)
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

  torus(r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0, arc = Math.PI * 2, rot?: THREE.Euler, seg = 32): void {
    this.add(new THREE.TorusGeometry(r, tube, 8, seg, arc), m, x, y, z, rot)
  }

  lathe(profile: [number, number][], m: THREE.Material, x = 0, y = 0, z = 0, seg = 20, scale?: THREE.Vector3): void {
    this.add(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, x, y, z, undefined, scale)
  }

  /** One mesh per material, added to `into`; returns the meshes. */
  flush(into: THREE.Object3D, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, m)
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      into.add(mesh)
      out.push(mesh)
    }
    this.parts.clear()
    return out
  }
}

// ───────────────────────────── Local materials ─────────────────────────────

/** Hairline of pigment: 0..1 smoothstep. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Lime plaster with the bible's wear painted in once: corner grime as a multiply of
 * `1 − 0.10·smoothstep(0.75, 1, r)` toward each corner, and, where `scuff` names a span of u,
 * a 40 mm scuff band 350 mm above the floor at −4 percent value (the wall beside a door).
 */
function wornPlaster(color: string, seed: string, wallHeight: number, scuff?: [number, number]): THREE.MeshStandardMaterial {
  const src = plasterTexture(color, seed).image as HTMLCanvasElement
  const size = src.width
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(src, 0, 0)
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
      px[i] = px[i] * k
      px[i + 1] = px[i + 1] * k
      px[i + 2] = px[i + 2] * k
    }
  }
  ctx.putImageData(img, 0, 0)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const bump = new THREE.CanvasTexture(canvas)
  bump.colorSpace = THREE.NoColorSpace
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.008, roughness: 0.95, metalness: 0 })
}

/** Fine-wale corduroy: the textile teal with a vertical rib every 3 mm, a felt tooth under it. */
function corduroy(color: string): THREE.MeshStandardMaterial {
  const src = feltTexture(color, 'corduroy').image as HTMLCanvasElement
  const size = src.width
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, size, size)
  const px = img.data
  const wale = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const phase = (x % wale) / wale
      const k = 0.93 + 0.12 * Math.pow(Math.sin(phase * Math.PI), 1.5)
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
  map.repeat.set(4, 4)
  const bump = new THREE.CanvasTexture(canvas)
  bump.colorSpace = THREE.NoColorSpace
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.set(4, 4)
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.01, roughness: 0.92, metalness: 0 })
}

/** The cloth spine of a notebook: cloth with a small paper label and a hairline, painted once for all 34. */
function notebookSpine(cloth: string, paper: string, ink: string): THREE.MeshStandardMaterial {
  const w = 64, h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.fillStyle = cloth
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = paper
  ctx.fillRect(12, 30, w - 24, 54)
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.5
  ctx.strokeRect(15, 33, w - 30, 48)
  ctx.fillStyle = ink
  ctx.fillRect(18, 50, w - 36, 2)
  ctx.fillRect(18, 60, w - 36, 2)
  ctx.globalAlpha = 0.35
  ctx.fillRect(0, h - 20, w, 2)
  ctx.fillRect(0, 18, w, 2)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 })
}

/** A tiny engraved brass tag with the object's inventory number, to be stuck on the object. */
function hsTag(text: string, p: RegionPalette, width = 0.07): THREE.Mesh {
  const m = placard({ lines: [text], width, height: width * 0.26, bg: p.brass, color: p.ink, border: p.ink })
  m.name = `tag:${text}`
  return m
}

/** A small painted board with the destination's name, letterspaced caps. */
function namePlate(text: string, p: RegionPalette, width: number): THREE.Mesh {
  const m = placard({ lines: [text], width, height: width * 0.22, bg: p.paper, color: p.ink, border: p.ink })
  m.name = `plate:${text}`
  return m
}

// ───────────────────────────── The shell ─────────────────────────────

/** Floor, three darker plaster walls with their wear, skirting, cornice and ceiling. */
function shell(ctx: BuildContext, wallTone: string): THREE.Group {
  const { w, h, d } = ROOM
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'shell'

  g.add(floorProp({ colors: p, width: w, depth: d, seed: 'floor:quarters' }))

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wornPlaster(wallTone, 'plaster:quarters:back', h))
  back.position.set(0, h / 2, -d / 2)
  back.receiveShadow = true
  g.add(back)

  // Side walls: u runs along +z on the left wall (from the back corner) and along −z on the right.
  const doorU0 = (3 - DOOR_Z) / d - 1.1 / d, doorU1 = (3 - DOOR_Z) / d + 1.1 / d
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wornPlaster(wallTone, 'plaster:quarters:left', h, [doorU0, doorU1]))
  left.rotation.y = Math.PI / 2
  left.position.set(-w / 2, h / 2, 0)
  left.receiveShadow = true
  g.add(left)
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wornPlaster(wallTone, 'plaster:quarters:right', h))
  right.rotation.y = -Math.PI / 2
  right.position.set(w / 2, h / 2, 0)
  right.receiveShadow = true
  g.add(right)

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaster(shade(p.trim, 0.92)))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  ceiling.receiveShadow = true
  g.add(ceiling)

  const kit = new Kit()
  const trim = mat.lacquer(p.trim)
  const plaster = mat.plaster(p.trim)
  // Skirting.
  kit.box(w, 0.14, 0.03, trim, 0, 0.07, -d / 2 + 0.015)
  kit.box(0.03, 0.14, d, trim, -w / 2 + 0.015, 0.07, 0)
  kit.box(0.03, 0.14, d, trim, w / 2 - 0.015, 0.07, 0)
  // Picture rail.
  kit.box(w, 0.04, 0.03, trim, 0, 3.3, -d / 2 + 0.015)
  kit.box(0.03, 0.04, d, trim, -w / 2 + 0.015, 3.3, 0)
  kit.box(0.03, 0.04, d, trim, w / 2 - 0.015, 3.3, 0)
  // Cornice: three steps along each wall.
  const s = 0.16
  const steps: [number, number, number][] = [[s * 0.55, s, s * 0.275], [s * 0.3, s * 0.6, s * 0.7], [s * 0.15, s * 0.3, s * 0.925]]
  for (const [sh, sd, dy] of steps) {
    kit.box(w, sh, sd, plaster, 0, h - dy, -d / 2 + sd / 2)
    kit.box(sd, sh, d, plaster, -w / 2 + sd / 2, h - dy, 0)
    kit.box(sd, sh, d, plaster, w / 2 - sd / 2, h - dy, 0)
  }
  kit.flush(g, false)
  return g
}

// ───────────────────────────── The doorway and its mirror ─────────────────────────────

/** The door to the Landing: cased opening in the left wall, the leaf ajar, its brass plate, the name above. */
function doorway(hs: HotspotDef, p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const kit = new Kit()
  const trim = mat.lacquer(p.trim)
  const jamb = 0.1, depth = 0.14
  for (const sx of [-1, 1]) kit.box(jamb, DOOR.h, depth, trim, sx * (DOOR.w / 2 + jamb / 2), DOOR.h / 2, depth / 2)
  kit.box(DOOR.w + jamb * 2, jamb, depth, trim, 0, DOOR.h + jamb / 2, depth / 2)
  kit.box(DOOR.w + jamb * 2 + 0.12, 0.06, 0.03, trim, 0, DOOR.h + jamb + 0.03, depth + 0.015)
  kit.box(DOOR.w, 0.012, depth, mat.brass(), 0, 0.006, depth / 2)
  kit.flush(g)

  const dark = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), mat.flat(p.ink))
  dark.position.set(0, DOOR.h / 2, 0.004)
  g.add(dark)

  // The leaf hangs from the far jamb (the wall's back end) and stands ajar into the room.
  const pivot = new THREE.Group()
  pivot.position.set(DOOR.w / 2, 0, depth - 0.03)
  pivot.rotation.y = 0.62
  const lw = DOOR.w - 0.02, lh = DOOR.h - 0.02, t = 0.045
  const leaf = new Kit()
  const paint = mat.lacquer(p.wallAlt)
  leaf.box(lw, lh, t, paint, -lw / 2, lh / 2, 0)
  const panelW = lw - 0.22, upper = lh * 0.42, lower = lh * 0.3
  for (const s of [-1, 1]) {
    leaf.box(panelW, upper, 0.012, paint, -lw / 2, lh - 0.14 - upper / 2, s * (t / 2 + 0.006))
    leaf.box(panelW, lower, 0.012, paint, -lw / 2, 0.14 + lower / 2, s * (t / 2 + 0.006))
  }
  leaf.sphere(0.02, mat.brass(), -(lw - 0.09), 1.0, t / 2 + 0.02)
  leaf.sphere(0.02, mat.brass(), -(lw - 0.09), 1.0, -t / 2 - 0.02)
  leaf.box(0.03, 0.09, 0.006, mat.brass(), -(lw - 0.09), 1.0, t / 2 + 0.003)
  for (const y of [0.25, lh / 2, lh - 0.25]) leaf.box(0.012, 0.09, t + 0.01, mat.brass(), -0.006, y, 0)
  leaf.flush(pivot)
  // The plate the Landing reads before Chapter Four.
  const plate = placard({ lines: ['HS-0500 · QUARTERS', '"MADE UP. STANDING ORDER 12."'], width: 0.5, height: 0.13, bg: p.brass, color: p.ink, border: p.ink })
  plate.name = 'plate:HS-0500'
  plate.position.set(-lw / 2, lh - 0.14 - upper / 2, t / 2 + 0.013)
  pivot.add(plate)
  g.add(pivot)

  const name = namePlate(hs.label, p, 0.7)
  name.position.set(0, DOOR.h + 0.32, 0.03)
  g.add(name)
  return g
}

/** A painted wardrobe of the door's size on the right wall: the door's mirror image. */
function wardrobe(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'wardrobe'
  const w = DOOR.w + 0.2, h = DOOR.h + 0.1, d = 0.5
  const kit = new Kit()
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'wardrobe', repeat: [1, 2] })
  const paint = mat.lacquer(p.wallAlt)
  kit.box(w, h - 0.1, d, timber, 0, 0.1 + (h - 0.1) / 2, d / 2)
  kit.box(w - 0.08, 0.1, d - 0.06, mat.lacquer(p.ink), 0, 0.05, d / 2)
  kit.box(w + 0.06, 0.06, d + 0.03, timber, 0, h - 0.03, d / 2 + 0.01)
  const dw = w / 2 - 0.04, dh = h - 0.26
  for (const s of [-1, 1]) {
    const x = s * (dw / 2 + 0.012)
    kit.box(dw, dh, 0.02, paint, x, 0.14 + dh / 2, d + 0.01)
    kit.box(dw - 0.14, dh - 0.16, 0.01, paint, x, 0.14 + dh / 2, d + 0.025)
    kit.sphere(0.013, mat.brass(), s * 0.05, 0.14 + dh / 2, d + 0.035)
    for (const y of [0.3, h - 0.3]) kit.box(0.012, 0.07, 0.02, mat.brass(), s * (w / 2 - 0.02), y, d + 0.02)
  }
  kit.box(0.02, 0.04, 0.006, mat.brass(), 0.05, 0.14 + dh / 2 - 0.05, d + 0.023)
  kit.flush(g)
  return g
}

// ───────────────────────────── The window and its curtains ─────────────────────────────

/** A sash window on the back wall with its curtains drawn: a slit of daylight between the panels. Back at z = 0. */
function curtainedWindow(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'window'
  const w = 1.5, h = 1.25, sill = 1.85, d = 0.12, f = 0.07
  const cy = sill + h / 2, mid = d / 2
  const kit = new Kit()
  const trim = mat.lacquer(p.trim)
  for (const s of [-1, 1]) kit.box(f, h, d, trim, s * (w / 2 - f / 2), cy, mid)
  kit.box(w, f, d, trim, 0, sill + h - f / 2, mid)
  kit.box(w, f, d, trim, 0, sill + f / 2, mid)
  const iw = w - 2 * f, ih = h - 2 * f
  kit.box(0.03, ih, 0.04, trim, 0, cy, mid)
  kit.box(iw, 0.05, 0.045, trim, 0, cy, mid)
  kit.box(w + 0.16, 0.05, d + 0.08, trim, 0, sill - 0.025, mid + 0.04)
  kit.box(w + 0.1, 0.08, 0.03, trim, 0, sill + h + 0.04, d + 0.015)
  kit.flush(g)
  // The pane: flat September light behind drawn cloth; only a slit of it reaches the room.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshStandardMaterial({ color: p.sky, emissive: p.sky, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0 }))
  pane.position.set(0, cy, 0.008)
  g.add(pane)

  // Curtains drawn: two panels of the textile, meeting at the centre, on a brass rod with rings.
  const cw = w / 2 + 0.25, ch = 1.6, folds = 5
  const cloth = new THREE.MeshStandardMaterial({ map: mat.velvet(p.felt).map, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide })
  const panelGeo = new THREE.PlaneGeometry(cw, ch, folds * 12, 24)
  const pos = panelGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    const k = (y + ch / 2) / ch
    const depth = 0.028 + 0.022 * k
    pos.setZ(i, Math.sin(((x + cw / 2) / cw) * folds * Math.PI * 2) * depth)
  }
  panelGeo.computeVertexNormals()
  const rodY = sill + h + 0.28
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(panelGeo, cloth)
    panel.position.set(s * (cw / 2 + 0.008), rodY - 0.06 - ch / 2, d + 0.08)
    panel.castShadow = true
    panel.receiveShadow = true
    g.add(panel)
  }
  const rod = new Kit()
  rod.rodX(0.014, cw * 2 + 0.3, mat.brass(), 0, rodY, d + 0.08)
  for (const s of [-1, 1]) {
    rod.sphere(0.03, mat.brass(), s * (cw + 0.16), rodY, d + 0.08)
    rod.box(0.03, 0.03, 0.08, mat.brass(), s * (cw - 0.1), rodY, d + 0.04)
  }
  rod.flush(g)
  const ringGeo = new THREE.TorusGeometry(0.022, 0.004, 6, 16)
  const rings = new THREE.InstancedMesh(ringGeo, mat.brass(), 2 * (folds + 1))
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
  let n = 0
  for (const s of [-1, 1]) for (let i = 0; i <= folds; i++) {
    const x = s * (0.02 + (cw / folds) * i)
    rings.setMatrixAt(n++, m.compose(new THREE.Vector3(x, rodY, d + 0.08), q, new THREE.Vector3(1, 1, 1)))
  }
  rings.castShadow = true
  g.add(rings)
  return g
}

// ───────────────────────────── The bed ─────────────────────────────

/** The bed, made up: hospital corners, the corduroy blanket, one pillow, turned posts. Head at −z. */
function bed(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'bed'
  const w = 1.4, l = 2.0
  const kit = new Kit()
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'bed', repeat: [2, 1] })
  const ink = mat.lacquer(p.ink)
  const sheet = mat.paper(p.paper)
  const cord = corduroy(p.felt)

  kit.box(w, 0.14, l, timber, 0, 0.27, 0)
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.06), sz * (l / 2 - 0.06)])
  for (const [x, z] of legs) kit.cyl(0.035, 0.045, 0.2, ink, x, 0.1, z, 12)
  // Head and foot boards with turned posts and finials.
  const post: [number, number][] = [[0.04, 0], [0.04, 0.9], [0.05, 0.95], [0.035, 1.0], [0.035, 1.18], [0.05, 1.22], [0.045, 1.26], [0.02, 1.3], [0, 1.34]]
  for (const sx of [-1, 1]) {
    kit.lathe(post, timber, sx * (w / 2 + 0.03), 0, -l / 2 - 0.04, 16)
    kit.lathe(post, timber, sx * (w / 2 + 0.03), 0, l / 2 + 0.04, 16, new THREE.Vector3(1, 0.62, 1))
  }
  kit.box(w, 0.9, 0.05, timber, 0, 0.75, -l / 2 - 0.04)
  kit.box(w, 0.06, 0.08, mat.lacquer(p.trim), 0, 1.2, -l / 2 - 0.04)
  kit.box(w, 0.45, 0.05, timber, 0, 0.5, l / 2 + 0.04)
  kit.box(w, 0.05, 0.07, mat.lacquer(p.trim), 0, 0.75, l / 2 + 0.04)
  // Mattress and sheet.
  kit.box(w - 0.06, 0.2, l - 0.06, sheet, 0, 0.44, 0)
  // Blanket: over the top from a hand's breadth below the pillow to the foot, down both sides and the foot.
  const bz0 = -l / 2 + 0.5, bz1 = l / 2 - 0.02
  const bl = bz1 - bz0, bc = (bz0 + bz1) / 2
  kit.box(w - 0.02, 0.03, bl, cord, 0, 0.555, bc)
  for (const sx of [-1, 1]) kit.box(0.02, 0.26, bl - 0.16, cord, sx * (w / 2 - 0.02), 0.44, bc - 0.08)
  kit.box(w - 0.06, 0.26, 0.02, cord, 0, 0.44, bz1 + 0.005)
  // Hospital corners: a 45° fold tucked at each foot corner.
  for (const sx of [-1, 1]) {
    kit.box(0.012, 0.25, 0.3, cord, sx * (w / 2 - 0.09), 0.44, bz1 - 0.1, new THREE.Euler(0, sx * Math.PI / 4, 0))
  }
  // The top sheet turned down over the blanket's head edge.
  kit.box(w - 0.02, 0.035, 0.28, sheet, 0, 0.56, bz0 + 0.1)
  kit.box(w - 0.04, 0.012, 0.22, cord, 0, 0.583, bz0 + 0.12)
  // One pillow, plumped and square to the headboard.
  kit.box(0.72, 0.13, 0.4, sheet, 0, 0.6, -l / 2 + 0.25, new THREE.Euler(-0.16, 0, 0))
  kit.flush(g)
  return g
}

// ───────────────────────────── The chairs and what they hold ─────────────────────────────

/** A slat-back bedroom chair, facing +z, seat at 0.46. Two draw calls. */
function chair(p: RegionPalette, seed: string): THREE.Group {
  const g = new THREE.Group()
  g.name = 'chair'
  const s = 0.42, h = 0.9, sh = 0.46
  const kit = new Kit()
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed })
  kit.box(s, 0.035, s, timber, 0, sh - 0.0175, 0)
  kit.box(s - 0.06, 0.04, s - 0.06, mat.felt(p.felt), 0, sh + 0.018, 0)
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (s / 2 - 0.035), sz * (s / 2 - 0.035)])
  for (const [x, z] of legs) kit.cyl(0.02, 0.026, sh - 0.035, timber, x, (sh - 0.035) / 2, z, 12)
  for (const sx of [-1, 1]) kit.box(0.018, 0.03, s - 0.1, timber, sx * (s / 2 - 0.035), 0.16, 0)
  kit.box(s - 0.1, 0.03, 0.018, timber, 0, 0.16, -s / 2 + 0.035)
  const back = h - sh
  for (const sx of [-1, 1]) kit.cyl(0.018, 0.022, back, timber, sx * (s / 2 - 0.035), sh + back / 2, -s / 2 + 0.035, 12, new THREE.Euler(-0.08, 0, 0))
  kit.box(s - 0.02, 0.07, 0.03, timber, 0, h - 0.045, -s / 2 + 0.005)
  for (const y of [0.18, 0.3]) kit.box(s - 0.1, 0.045, 0.014, timber, 0, sh + y, -s / 2 + 0.02)
  kit.flush(g)
  return g
}

/** Pieces of the FEN as [file, rank, colour, type]. */
function piecesOf(fen: string): [number, number, 'w' | 'b', string][] {
  const out: [number, number, 'w' | 'b', string][] = []
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, i) => {
    const rank = 7 - i
    let file = 0
    for (const ch of row) {
      const n = Number(ch)
      if (Number.isInteger(n)) { file += n; continue }
      out.push([file, rank, ch === ch.toUpperCase() ? 'w' : 'b', ch.toLowerCase()])
      file++
    }
  })
  return out
}

/** The travelling set: a leather box open flat, its boxwood pieces standing in the position, White to move. */
function travellingSet(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'travellingSet'
  const half = 0.2, depth = 0.17, lip = 0.03
  const leather = mat.lacquer(shade(p.ink, 1.35))
  const kit = new Kit()
  // Two halves hinged along z = −depth/2... the lid lies open behind the board (toward −x).
  for (const s of [-1, 1]) {
    kit.box(half, 0.012, depth, leather, s * (half / 2 + 0.004), 0.006, 0)
    kit.box(half, lip, 0.008, leather, s * (half / 2 + 0.004), lip / 2, depth / 2 - 0.004)
    kit.box(half, lip, 0.008, leather, s * (half / 2 + 0.004), lip / 2, -depth / 2 + 0.004)
    kit.box(0.008, lip, depth, leather, s * (half + 0.004 - 0.004), lip / 2, 0)
  }
  kit.rodZ(0.004, depth, mat.brass(), 0, 0.012, 0, 8)
  kit.flush(g)
  // The board in the right half; the lid's felt in the left.
  const sq = 0.018, bw = sq * 8
  const boardMat = new THREE.MeshStandardMaterial({ map: tileTexture({ a: tokens['br.lightSquare'], b: tokens['br.darkSquare'], grout: tokens['br.darkSquare'], repeat: [4, 4] }), roughness: 0.5, metalness: 0 })
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw), boardMat)
  board.rotation.x = -Math.PI / 2
  board.position.set(half / 2 + 0.004, 0.0125, 0)
  board.receiveShadow = true
  g.add(board)
  const lining = new THREE.Mesh(new THREE.PlaneGeometry(half - 0.02, depth - 0.02), mat.felt(p.felt))
  lining.rotation.x = -Math.PI / 2
  lining.position.set(-half / 2 - 0.004, 0.0125, 0)
  g.add(lining)
  // Boxwood pieces, an instanced lathe per side; kings and rooks taller.
  const pawn: [number, number][] = [[0, 0], [0.0042, 0], [0.0042, 0.0012], [0.0026, 0.0024], [0.0021, 0.0062], [0.0034, 0.0072], [0.0022, 0.008], [0.0022, 0.0092], [0.0028, 0.0104], [0, 0.0118]]
  const geo = new THREE.LatheGeometry(pawn.map(([r, h]) => new THREE.Vector2(r, h)), 12)
  const pieces = piecesOf(dressing.setFen)
  const sides: Record<'w' | 'b', THREE.InstancedMesh> = {
    w: new THREE.InstancedMesh(geo, mat.lacquer(tokens['br.lightBody']), pieces.filter((x) => x[2] === 'w').length),
    b: new THREE.InstancedMesh(geo, mat.lacquer(tokens['br.darkBody']), pieces.filter((x) => x[2] === 'b').length),
  }
  const count = { w: 0, b: 0 }
  const m = new THREE.Matrix4()
  const tall: Record<string, number> = { k: 1.7, q: 1.55, r: 1.3, b: 1.35, n: 1.25, p: 1 }
  for (const [file, rank, side, type] of pieces) {
    const x = half / 2 + 0.004 - bw / 2 + sq * (file + 0.5)
    const z = bw / 2 - sq * (rank + 0.5)
    const k = tall[type] ?? 1
    m.compose(new THREE.Vector3(x, 0.013, z), new THREE.Quaternion(), new THREE.Vector3(1, k, 1))
    sides[side].setMatrixAt(count[side]++, m)
  }
  for (const im of [sides.w, sides.b]) { im.castShadow = true; g.add(im) }
  const tag = hsTag('HS-0501', p, 0.05)
  tag.rotation.x = -Math.PI / 2
  tag.position.set(-half / 2 - 0.004, 0.0135, depth / 2 - 0.02)
  g.add(tag)
  return g
}

/** His reading glasses, folded: two steel rings, a bridge, the arms laid across the lenses. */
function readingGlasses(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'readingGlasses'
  const kit = new Kit()
  const steel = mat.steel()
  const r = 0.021, tube = 0.0014
  const flat = new THREE.Euler(Math.PI / 2, 0, 0)
  for (const s of [-1, 1]) kit.torus(r, tube, steel, s * (r + 0.006), 0.0035, 0, Math.PI * 2, flat, 28)
  kit.rodX(tube, 0.012, steel, 0, 0.0035, -0.004, 8)
  // Arms folded: they lie back across the lenses, one over the other.
  for (const [s, dy] of [[-1, 0.006], [1, 0.0095]] as [number, number][]) {
    kit.cyl(tube, tube, 0.088, steel, s * (r + 0.006 - 0.022), dy, 0.0, 8, new THREE.Euler(0, 0, Math.PI / 2))
    kit.cyl(tube, tube, 0.012, steel, s * (2 * r + 0.006), 0.0035 + (dy - 0.0035) / 2, -0.002, 8, new THREE.Euler(0.4, 0, 0))
  }
  kit.flush(g)
  const lens = mat.glass()
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(r - 0.001, 24), lens)
    l.rotation.x = -Math.PI / 2
    l.position.set(s * (r + 0.006), 0.0036, 0)
    g.add(l)
  }
  const tag = hsTag('HS-0507', p, 0.045)
  tag.rotation.x = -Math.PI / 2
  tag.position.set(0, 0.001, 0.06)
  g.add(tag)
  return g
}

// ───────────────────────────── Chests, shelf, sextant ─────────────────────────────

/** A three-drawer chest in painted pine; brass knobs are instanced by the caller. Origin at the floor centre. */
function chest(p: RegionPalette, seed: string): { group: THREE.Group; knobs: THREE.Vector3[]; top: number } {
  const g = new THREE.Group()
  g.name = 'chest'
  const w = 0.82, h = 0.84, d = 0.46, legH = 0.1
  const kit = new Kit()
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed, repeat: [1, 1] })
  const paint = mat.lacquer(p.wallAlt)
  kit.box(w, h - legH - 0.03, d, timber, 0, legH + (h - legH - 0.03) / 2, 0)
  kit.box(w + 0.05, 0.03, d + 0.03, timber, 0, h - 0.015, 0.01)
  const n = 3, rh = (h - legH - 0.06) / n
  const knobs: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const y = legH + 0.02 + rh * (i + 0.5)
    kit.box(w - 0.06, rh - 0.02, 0.02, paint, 0, y, d / 2 + 0.01)
    knobs.push(new THREE.Vector3(-w * 0.22, y, d / 2 + 0.02), new THREE.Vector3(w * 0.22, y, d / 2 + 0.02))
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(0.03, 0.038, legH, mat.lacquer(p.ink), sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.07), 12)
  kit.flush(g)
  return { group: g, knobs, top: h }
}

/** The shelf of thirty-four identical cloth notebooks above the headboard; the last one half out. */
function notebookShelf(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'notebooks'
  const count = dressing.notebooks.count
  const nt = 0.03, nh = 0.19, nd = 0.13, gap = 0.0025
  const run = count * (nt + gap) - gap
  const sw = run + 0.12, sd = 0.17
  const kit = new Kit()
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'shelf', repeat: [2, 1] })
  kit.box(sw, 0.025, sd, timber, 0, -0.0125, sd / 2)
  for (const s of [-1, 1]) {
    kit.box(0.025, 0.1, sd - 0.03, timber, s * (sw / 2 - 0.05), -0.075, (sd - 0.03) / 2)
    kit.box(0.025, nh + 0.02, 0.1, timber, s * (sw / 2 - 0.02), (nh + 0.02) / 2, 0.05)
  }
  kit.flush(g)
  const cloth = mat.flat(p.wallAlt)
  const pages = mat.paper(p.paper)
  const spine = notebookSpine(p.wallAlt, p.paper, p.ink)
  const geo = new THREE.BoxGeometry(nt, nh, nd)
  const books = new THREE.InstancedMesh(geo, [cloth, cloth, pages, cloth, spine, pages], count)
  const m = new THREE.Matrix4()
  for (let i = 0; i < count; i++) {
    const x = -run / 2 + nt / 2 + i * (nt + gap)
    const z = 0.02 + nd / 2 + (i === count - 1 ? nd / 2 : 0)
    books.setMatrixAt(i, m.makeTranslation(x, nh / 2, z))
  }
  books.castShadow = true
  books.receiveShadow = true
  books.name = 'notebooks:instanced'
  g.add(books)
  const tag = hsTag('HS-0503', p, 0.07)
  tag.position.set(0, -0.0125, sd + 0.001)
  g.add(tag)
  return g
}

/** The sextant, brass, lying in its open box; the lid stands back on its hinge. Origin on the chest top. */
function sextantBox(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'sextant'
  const w = 0.3, d = 0.28, h = 0.09
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'sextantbox', repeat: [1, 1] })
  const kit = new Kit()
  kit.box(w, 0.012, d, timber, 0, 0.006, 0)
  kit.box(w, h, 0.012, timber, 0, h / 2, -d / 2 + 0.006)
  kit.box(w, h, 0.012, timber, 0, h / 2, d / 2 - 0.006)
  kit.box(0.012, h, d, timber, -w / 2 + 0.006, h / 2, 0)
  kit.box(0.012, h, d, timber, w / 2 - 0.006, h / 2, 0)
  // The lid, hinged along the back edge, open past upright.
  kit.box(w, 0.06, 0.012, timber, 0, h + 0.03, -d / 2 + 0.006)
  kit.box(w, 0.012, d, timber, 0, h + 0.06 + (d / 2) * Math.cos(0.18), -d / 2 + 0.006 - (d / 2) * Math.sin(0.18), new THREE.Euler(-Math.PI / 2 - 0.18, 0, 0))
  kit.flush(g)
  const lining = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, d - 0.03), mat.felt(p.felt))
  lining.rotation.x = -Math.PI / 2
  lining.position.y = 0.0125
  g.add(lining)
  // The instrument, flat on its side: the arc toward the front of the box, the arms meeting at the apex behind.
  const brass = new Kit()
  const y = 0.03, r = 0.11, apexZ = -0.055
  const a0 = Math.PI * 1.29, a1 = Math.PI * 1.71
  brass.torus(r, 0.006, mat.brass(), 0, y, apexZ, a1 - a0, new THREE.Euler(-Math.PI / 2, 0, a0), 24)
  for (const a of [a0, a1, (a0 + a1) / 2 + 0.16]) {
    const dx = Math.cos(a), dz = -Math.sin(a)
    const len = a === a0 || a === a1 ? r : r + 0.02
    brass.box(0.012, 0.008, len, mat.brass(), dx * len / 2, y + (len > r ? 0.006 : 0), apexZ + dz * len / 2, new THREE.Euler(0, Math.atan2(dx, dz), 0))
  }
  brass.rodX(0.008, 0.07, mat.brass(), 0.01, y + 0.012, apexZ + 0.03, 10)
  brass.box(0.02, 0.018, 0.004, mat.brass(), -0.02, y + 0.012, apexZ + 0.01)
  brass.box(0.016, 0.014, 0.004, mat.brass(), 0.03, y + 0.012, apexZ + 0.02)
  brass.cyl(0.011, 0.011, 0.045, mat.brass(), -0.07, y, apexZ + 0.075, 10, new THREE.Euler(Math.PI / 2, 0, 0))
  brass.flush(g)
  const tag = hsTag('HS-0505', p, 0.05)
  tag.position.set(0, h / 2, d / 2 + 0.001)
  g.add(tag)
  return g
}

/** A felt rug at the foot of the bed with an olive border. */
function rug(p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'rug'
  const w = 2.2, d = 1.3
  const kit = new Kit()
  kit.box(w, 0.012, d, mat.felt(p.wallAlt), 0, 0.006, 0)
  kit.box(w - 0.3, 0.004, d - 0.3, mat.felt(p.felt), 0, 0.013, 0)
  kit.flush(g, false)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/** Builds the Station Master's Quarters in local space: origin at the floor centre, open toward +z. */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const byId = new Map(ctx.def.hotspots.map((h) => [h.id, h] as const))
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }
  const { d } = ROOM
  const backZ = -d / 2

  group.add(shell(ctx, shade(p.wall, DARKER)))

  // The window, curtained, centred on the back wall above the bed.
  const win = curtainedWindow(p)
  win.position.set(0, 0, backZ)
  group.add(win)

  // The bed, head to the wall.
  const theBed = bed(p)
  theBed.position.set(0, 0, backZ + 0.08 + 1.0)
  group.add(theBed)

  // The notebooks above the headboard, under the sill.
  const shelf = notebookShelf(p)
  shelf.position.set(0, 1.44, backZ)
  group.add(shelf)
  register('quarters.notebook', shelf)

  // A chair each side, facing the bed, not the window.
  const chairZ = backZ + 0.08 + 1.05
  for (const s of [-1, 1]) {
    const c = chair(p, s < 0 ? 'chair:left' : 'chair:right')
    c.position.set(s * 1.28, 0, chairZ)
    c.rotation.y = -s * Math.PI / 2
    group.add(c)
    if (s < 0) {
      // The flaw, left: the travelling set, open on the seat, Hardy v. Voss, White to move.
      const set = travellingSet(p)
      set.position.set(0, 0.5, 0.01)
      set.rotation.y = Math.PI
      c.add(set)
      register('quarters.set', set)
    } else {
      // The flaw, right: his reading glasses, folded.
      const glasses = readingGlasses(p)
      glasses.position.set(0, 0.5, 0.02)
      glasses.rotation.y = 0
      c.add(glasses)
      register('quarters.glasses', glasses)
    }
  }

  // Two chests against the back wall, a lamp on each; the sextant left, the clock right.
  const knobs: THREE.Vector3[] = []
  for (const s of [-1, 1]) {
    const { group: ch, knobs: k, top } = chest(p, s < 0 ? 'chest:left' : 'chest:right')
    ch.position.set(s * 2.45, 0, backZ + 0.24)
    group.add(ch)
    for (const v of k) knobs.push(v.clone().add(ch.position))
    const lamp = lampTable({ colors: p, height: 0.52, shade: 0.26, lit: true, base: p.wallAlt, seed: `lamp:${s}` })
    lamp.position.set(s * 0.22, top, 0)
    ch.add(lamp)
    if (s < 0) {
      const sextant = sextantBox(p)
      sextant.position.set(0.18, top, 0.02)
      ch.add(sextant)
      register('quarters.sextant', sextant)
    } else {
      const [hours, minutes] = dressing.clockStoppedAt.split(':').map(Number)
      const clock = mantelClock({ colors: p, hours, minutes })
      clock.position.set(-0.18, top, 0.04)
      ch.add(clock)
      const tag = hsTag('HS-0508', p, 0.06)
      tag.position.set(0, 0.05, 0.051)
      clock.add(tag)
      register('quarters.clock', clock)
    }
    // A small sea picture above each chest, hung on the rail.
    const picture = pictureFrame({ colors: p, kind: 'sea', width: 0.5, height: 0.38, y: 2.35 })
    picture.position.set(s * 2.45, 0, backZ)
    group.add(picture)
  }
  const knobGeo = new THREE.SphereGeometry(0.013, 12, 8)
  const knobMesh = new THREE.InstancedMesh(knobGeo, mat.brass(), knobs.length)
  const m = new THREE.Matrix4()
  knobs.forEach((v, i) => knobMesh.setMatrixAt(i, m.makeTranslation(v.x, v.y, v.z + 0.012)))
  knobMesh.castShadow = true
  group.add(knobMesh)

  const theRug = rug(p)
  theRug.position.set(0, 0, backZ + 0.08 + 2.0 + 0.8)
  group.add(theRug)

  // The door to the Landing on the left wall; a wardrobe its mirror on the right.
  for (const hs of ctx.def.hotspots) {
    if (hs.kind !== 'door') continue
    const door = doorway(hs, p)
    door.position.set(-ROOM.w / 2, 0, DOOR_Z)
    door.rotation.y = Math.PI / 2
    group.add(door)
    register(hs.id, door)
  }
  const ward = wardrobe(p)
  ward.position.set(ROOM.w / 2, 0, DOOR_Z)
  ward.rotation.y = -Math.PI / 2
  group.add(ward)

  // Every hotspot in the definition is an object in the room.
  for (const id of byId.keys()) if (!out.hotspots.has(id)) console.warn(`[quarters] hotspot ${id} has no object`)
  return out
}
