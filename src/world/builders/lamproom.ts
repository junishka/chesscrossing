// Frame 7: The Lamp Room (top). An octagonal glazed lantern 7 m across on a pine floor, brass
// mullions and a low brass rail all round, the lamp centred on a brass pedestal with two white
// lenses and one red, the telescope at the left rail with three pinned bearings, the glazed door
// at the back to the jetty and a companion trap down to the Landing. Beyond the glass, the sea on
// all sides: a painted cylinder, 4096 × 512, one turn per 240 s, with three fixed painted vignettes
// toward +x for the telescope. The flaw: the upper-right light of the back face is a painted pine
// board chalked 1959. Fittings from palette 3.2, the view from 3.3 by day.
import * as THREE from 'three'
import type { HotspotDef } from '../../types'
import { FONT_SANS } from '../../core/fonts'
import { labelTexture, mat } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import { tokens, type RegionPalette } from '../../content/palette'
import { dressing } from '../../content/frames/lamproom'
import { figure } from '../figures'
import { telescope } from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

// ───────────────────────────── Dimensions ─────────────────────────────

/** The octagon: flat to flat, its apothem and half a face. */
const ACROSS = dressing.octagon.across
const APOTHEM = ACROSS / 2
const HALF = APOTHEM * Math.tan(Math.PI / 8)
/** Glazing: sill, height (3.2 m), transom and head; the cornice above to the ceiling. */
const SILL = 0.5
const GLAZE_H = 3.2
const HEAD = SILL + GLAZE_H
const TRANSOM = 2.05
const CEILING = 4.2
/** The rail all round: height and its octagon's apothem. */
const RAIL_Y = 0.95
const RAIL_APOTHEM = 3.2
const RAIL_HALF = RAIL_APOTHEM * Math.tan(Math.PI / 8)
/** The door in the back face: half its opening width. */
const DOOR_HALF = 0.475
/** The sea cylinder: radius, painted height and the eye level its horizon sits at. */
const SEA_R = 40
const SEA_H = 18
const EYE = 1.6
/** The vignette planes stand just inside the sea, fixed while it turns. */
const VIEW_R = 39
/** Where the telescope's eye is (the three stations), for aiming the vignettes. */
const RAIL_EYE = new THREE.Vector3(-3.3, EYE, 0)
/** The trap to the Landing, its centre on the floor. */
const TRAP = { z: -2.5, w: 0.9, d: 0.8 }
const TWO_PI = Math.PI * 2

/** Face k of the octagon has its outward normal at angle θ = π + k·π/4 (k = 0 is the back face). */
function faceAngle(k: number): number { return Math.PI + (k * Math.PI) / 4 }

// ───────────────────────────── Colour helpers ─────────────────────────────

type Rgb = [number, number, number]

function parse(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function scale(a: Rgb, k: number): Rgb { return [a[0] * k, a[1] * k, a[2] * k] }
function css(c: Rgb, alpha = 1): string {
  const r = Math.round(Math.min(255, Math.max(0, c[0])))
  const g = Math.round(Math.min(255, Math.max(0, c[1])))
  const b = Math.round(Math.min(255, Math.max(0, c[2])))
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

// ───────────────────────────── Geometry helpers ─────────────────────────────

const geometries = new Map<string, THREE.BufferGeometry>()

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometries.get(key)
  if (hit) return hit as T
  const g = make()
  geometries.set(key, g)
  return g
}

function r3(n: number): string { return String(Math.round(n * 1000) / 1000) }

function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  return cached(`box:${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(w, h, d))
}
function cylGeo(rt: number, rb: number, h: number, seg = 24): THREE.CylinderGeometry {
  return cached(`cyl:${r3(rt)},${r3(rb)},${r3(h)},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
}
function sphereGeo(r: number, seg = 16): THREE.SphereGeometry {
  return cached(`sph:${r3(r)},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)))
}
function torusGeo(r: number, tube: number, seg = 48, arc = TWO_PI): THREE.TorusGeometry {
  return cached(`tor:${r3(r)},${r3(tube)},${seg},${r3(arc)}`, () => new THREE.TorusGeometry(r, tube, 10, seg, arc))
}
function latheGeo(key: string, profile: [number, number][], seg = 48): THREE.LatheGeometry {
  return cached(`lathe:${key}:${seg}`, () => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg))
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  me.castShadow = true
  me.receiveShadow = true
  return me
}
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(boxGeo(w, h, d), m, x, y, z)
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  return mesh(cylGeo(rt, rb, h, seg), m, x, y, z)
}

/** A shape's point in the xz plane: extrusions are rotated so shape y runs toward −z. */
function pt(x: number, z: number): THREE.Vector2 { return new THREE.Vector2(x, -z) }

/** A regular octagon of apothem `a` with the back face toward −z. */
function octagonShape(a: number): THREE.Shape {
  const s = new THREE.Shape()
  const r = a / Math.cos(Math.PI / 8)
  for (let i = 0; i < 8; i++) {
    const t = faceAngle(i) + Math.PI / 8
    const p = pt(Math.sin(t) * r, Math.cos(t) * r)
    if (i === 0) s.moveTo(p.x, p.y); else s.lineTo(p.x, p.y)
  }
  s.closePath()
  return s
}

/** The corners of a regular octagon of apothem `a`, corner i between faces i and i+1, as [x, z]. */
function octagonCorners(a: number): [number, number][] {
  const r = a / Math.cos(Math.PI / 8)
  return Array.from({ length: 8 }, (_, i) => {
    const t = faceAngle(i) + Math.PI / 8
    return [Math.sin(t) * r, Math.cos(t) * r]
  })
}

/**
 * A C-shaped octagonal ring (outer apothem `ao`, inner `ai`) with a gap of half-width `gap` in the
 * back face: the parapet, its cap and its skirting all leave room for the door.
 */
function ringWithGap(ao: number, ai: number, gap: number): THREE.Shape {
  const outer = octagonCorners(ao), inner = octagonCorners(ai)
  const s = new THREE.Shape()
  const first = pt(gap, -ao)
  s.moveTo(first.x, first.y)
  for (let i = 0; i < 8; i++) { const p = pt(outer[i][0], outer[i][1]); s.lineTo(p.x, p.y) }
  let p = pt(-gap, -ao); s.lineTo(p.x, p.y)
  p = pt(-gap, -ai); s.lineTo(p.x, p.y)
  for (let i = 7; i >= 0; i--) { p = pt(inner[i][0], inner[i][1]); s.lineTo(p.x, p.y) }
  p = pt(gap, -ai); s.lineTo(p.x, p.y)
  s.closePath()
  return s
}

/** An extruded shape standing on y = `y0`, `h` tall, laid flat (shape y toward −z). */
function extrude(shape: THREE.Shape, y0: number, h: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 })
  const me = new THREE.Mesh(g, m)
  me.rotation.x = -Math.PI / 2
  me.position.y = y0
  me.castShadow = true
  me.receiveShadow = true
  return me
}

/** Collects instance matrices for one geometry and material, then bakes one InstancedMesh. */
class Instancer {
  private readonly items: THREE.Matrix4[] = []
  constructor(private readonly geometry: THREE.BufferGeometry, private readonly material: THREE.Material, private readonly label: string) {}

  /** A unit box scaled to w × h × d, centred at (x, y, z), turned `ry` about y in `parent`'s space. */
  bar(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, parent?: THREE.Matrix4): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(w, h, d))
    this.items.push(parent ? parent.clone().multiply(m) : m)
  }

  /** A unit cylinder (radius 1, height 1 along y) stretched from `a` to `b` with radius `r`. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const dir = b.clone().sub(a)
    const len = dir.length()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    this.items.push(new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(r, len, r)))
  }

  bake(): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(this.geometry, this.material, this.items.length)
    this.items.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.name = this.label
    return im
  }
}

/** A face's local frame: x along the face, y up, +z the outward normal. */
function faceMatrix(k: number, apothem: number): THREE.Matrix4 {
  const t = faceAngle(k)
  return new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(t) * apothem, 0, Math.cos(t) * apothem), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t), new THREE.Vector3(1, 1, 1))
}

function faceGroup(k: number, apothem: number): THREE.Group {
  const g = new THREE.Group()
  const t = faceAngle(k)
  g.position.set(Math.sin(t) * apothem, 0, Math.cos(t) * apothem)
  g.rotation.y = t
  return g
}

// ───────────────────────────── Painted canvases ─────────────────────────────

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

/** Brush strokes of the wear pass: 24 to 48 px long, 2 to 3 px wide, alpha 0.06, along `angle`. */
function brushStrokes(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, colour: Rgb, angle: number, rnd: () => number): void {
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h
    const len = 24 + rnd() * 24
    ctx.lineWidth = 2 + rnd()
    ctx.strokeStyle = css(scale(colour, rnd() < 0.5 ? 0.9 : 1.1), 0.06)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }
}

/**
 * The sea on all sides, 4096 × 512: the horizon at mid-height (eye level), greenish overcast
 * above, slate-blue sea with foam lines below, the foam longer and denser toward the bottom.
 */
function seaTexture(rnd: () => number): THREE.CanvasTexture {
  const W = dressing.sea.width, H = dressing.sea.height
  const [c, ctx] = canvas2d(W, H)
  const horizon = H / 2
  const sky = parse(tokens['out.sky']), skyGreen = parse(tokens['grid.sky'])
  const sea = parse(tokens['out.sea']), foam = parse(tokens['out.foam']), ink = parse(tokens['out.ink'])
  const channel = parse(tokens['grid.channel'])

  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon)
  skyGrad.addColorStop(0, css(scale(mix(sky, skyGreen, 0.65), 0.97)))
  skyGrad.addColorStop(0.6, css(mix(sky, skyGreen, 0.35)))
  skyGrad.addColorStop(1, css(mix(sky, foam, 0.35)))
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, horizon)

  const seaGrad = ctx.createLinearGradient(0, horizon, 0, H)
  seaGrad.addColorStop(0, css(mix(sea, ink, 0.18)))
  seaGrad.addColorStop(0.25, css(sea))
  seaGrad.addColorStop(1, css(mix(sea, channel, 0.35)))
  ctx.fillStyle = seaGrad
  ctx.fillRect(0, horizon, W, H - horizon)

  // Cloud: long soft bands, a few lighter, a few darker
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * horizon * 0.9
    const rx = 120 + rnd() * 420, ry = 6 + rnd() * 16
    const light = rnd() < 0.6
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rx)
    const tint = light ? mix(sky, foam, 0.6) : mix(sky, skyGreen, 0.8)
    grad.addColorStop(0, css(tint, 0.16))
    grad.addColorStop(1, css(tint, 0))
    ctx.fillStyle = grad
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, ry / rx)
    ctx.beginPath()
    ctx.arc(0, 0, rx, 0, TWO_PI)
    ctx.fill()
    ctx.restore()
    if (x + rx > W) { ctx.save(); ctx.translate(x - W, y); ctx.scale(1, ry / rx); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TWO_PI); ctx.fill(); ctx.restore() }
  }

  // Haze on the horizon line
  const haze = ctx.createLinearGradient(0, horizon - 10, 0, horizon + 2)
  haze.addColorStop(0, css(foam, 0))
  haze.addColorStop(1, css(foam, 0.35))
  ctx.fillStyle = haze
  ctx.fillRect(0, horizon - 10, W, 12)
  ctx.fillStyle = css(mix(sea, ink, 0.3), 0.7)
  ctx.fillRect(0, horizon, W, 2)

  // Foam lines and wave ticks, longer and denser nearer the bottom
  ctx.lineCap = 'round'
  for (let i = 0; i < 2600; i++) {
    const depth = Math.pow(rnd(), 0.55)
    const y = horizon + 3 + depth * (H - horizon - 6)
    const x = rnd() * W
    const len = 6 + depth * 90 * (0.4 + rnd())
    const isFoam = rnd() < 0.62
    ctx.lineWidth = isFoam ? 1 + depth * 2 : 1 + depth
    ctx.strokeStyle = isFoam ? css(foam, 0.18 + depth * 0.4) : css(mix(sea, ink, 0.35), 0.25 + depth * 0.2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len, y + (rnd() - 0.5) * 1.5)
    ctx.stroke()
  }
  brushStrokes(ctx, W, H, 1800, mix(sea, sky, 0.5), 0, rnd)

  const t = texture(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** A rock in flat lichened facets with a thin turf cap, drawn with its waterline at (cx, base). */
function paintRock(ctx: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, rock: Rgb, foam: Rgb, ink: Rgb, turf: Rgb | null, rnd: () => number): void {
  const pts: [number, number][] = []
  const n = 9
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const x = cx - w / 2 + u * w
    const y = base - Math.sin(u * Math.PI) ** 0.7 * h * (0.75 + 0.25 * rnd())
    pts.push([x, i === 0 || i === n ? base + 2 : y])
  }
  ctx.fillStyle = css(rock)
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.clip()
  for (let i = 1; i < n; i++) {
    const [x, y] = pts[i]
    ctx.fillStyle = css(mix(rock, i % 2 ? foam : ink, 0.22))
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w / n, pts[i + 1][1])
    ctx.lineTo(x + w / n + (rnd() - 0.5) * 10, base + 4)
    ctx.lineTo(x - w / n * 0.4, base + 4)
    ctx.closePath()
    ctx.fill()
  }
  if (turf) {
    ctx.strokeStyle = css(turf)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(pts[2][0], pts[2][1] + 1)
    for (let i = 3; i < n - 1; i++) ctx.lineTo(pts[i][0], pts[i][1] + 1)
    ctx.stroke()
  }
  const wet = ctx.createLinearGradient(0, base - 6, 0, base + 2)
  wet.addColorStop(0, css(ink, 0))
  wet.addColorStop(1, css(ink, 0.45))
  ctx.fillStyle = wet
  ctx.fillRect(cx - w, base - 6, w * 2, 8)
  ctx.restore()
  // Foam at the waterline
  ctx.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const x = cx - w / 2 + rnd() * w
    ctx.lineWidth = 1 + rnd() * 1.5
    ctx.strokeStyle = css(foam, 0.35 + rnd() * 0.4)
    ctx.beginPath()
    ctx.moveTo(x, base + 1 + rnd() * 4)
    ctx.lineTo(x + 6 + rnd() * 18, base + 1 + rnd() * 4)
    ctx.stroke()
  }
}

/** The three distant vignettes the telescope finds: the Point's rock, the Holms, Heron Head's beacon. */
function vignetteTexture(kind: 'point' | 'holms' | 'head', rnd: () => number): THREE.CanvasTexture {
  const W = 512, H = 256
  const [c, ctx] = canvas2d(W, H)
  ctx.clearRect(0, 0, W, H)
  const rock = parse(tokens['out.rock']), foam = parse(tokens['out.foam']), ink = parse(tokens['out.ink'])
  const turf = parse(tokens['out.turf']), path = parse(tokens['out.path'])
  const islet = parse(tokens['grid.darkIslet']), beacon = parse(tokens['grid.beacon']), paper = parse(tokens['hs.paper'])
  const mid = H / 2
  if (kind === 'point') {
    paintRock(ctx, W * 0.5, mid + 22, 300, 78, rock, foam, ink, turf, rnd)
    // The causeway leaving the rock toward a1, dead straight
    ctx.strokeStyle = css(path)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(W * 0.5 + 120, mid + 20)
    ctx.lineTo(W * 0.5 + 236, mid + 26)
    ctx.stroke()
    // The legend cairn on its top
    ctx.fillStyle = css(mix(rock, foam, 0.4))
    ctx.fillRect(W * 0.5 - 6, mid - 68, 12, 14)
  } else if (kind === 'holms') {
    const widths = [64, 118, 46, 96, 58]
    let x = W * 0.5 - 220
    for (const w of widths) {
      const h = 9 + rnd() * 13
      paintRock(ctx, x + w / 2, mid + 6, w, h, islet, foam, ink, null, rnd)
      x += w + 22 + rnd() * 18
    }
  } else {
    paintRock(ctx, W * 0.5, mid + 70, 210, 40, mix(islet, rock, 0.4), foam, ink, turf, rnd)
    // The beacon: 4.8 m at about 110 m, three-fifths of the frame's height; two dark bands, a gallery, one red lamp
    const bx = W * 0.5, base = mid + 42, top = base - 143
    const wBase = 22, wTop = 12
    ctx.fillStyle = css(mix(paper, foam, 0.4))
    ctx.beginPath()
    ctx.moveTo(bx - wBase / 2, base)
    ctx.lineTo(bx + wBase / 2, base)
    ctx.lineTo(bx + wTop / 2, top + 14)
    ctx.lineTo(bx - wTop / 2, top + 14)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = css(mix(ink, islet, 0.4))
    for (const [y0, y1] of [[0.28, 0.42], [0.62, 0.76]] as const) {
      const ya = top + 14 + (base - top - 14) * y0, yb = top + 14 + (base - top - 14) * y1
      const wa = wTop + (wBase - wTop) * y0, wb = wTop + (wBase - wTop) * y1
      ctx.beginPath()
      ctx.moveTo(bx - wa / 2, ya); ctx.lineTo(bx + wa / 2, ya); ctx.lineTo(bx + wb / 2, yb); ctx.lineTo(bx - wb / 2, yb)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = css(ink)
    ctx.fillRect(bx - 14, top + 12, 28, 3)
    ctx.fillStyle = css(mix(ink, islet, 0.5))
    ctx.fillRect(bx - 7, top + 2, 14, 11)
    const halo = ctx.createRadialGradient(bx, top + 2, 0, bx, top + 2, 16)
    halo.addColorStop(0, css(beacon, 0.55))
    halo.addColorStop(1, css(beacon, 0))
    ctx.fillStyle = halo
    ctx.fillRect(bx - 16, top - 14, 32, 32)
    ctx.fillStyle = css(beacon)
    ctx.beginPath()
    ctx.arc(bx, top + 2, 4.5, 0, TWO_PI)
    ctx.fill()
  }
  return texture(c)
}

/** The flaw: a pine board painted olive, chalked `1959` by hand, a little chalk dust below the figures. */
function chalkBoardTexture(chalk: string, p: RegionPalette, rnd: () => number): THREE.CanvasTexture {
  const W = 256, H = 512
  const [c, ctx] = canvas2d(W, H)
  const paint = parse(p.wallAlt), grain = parse(p.woodGrain), ink = parse(p.ink), chalkC = parse(p.paper)
  ctx.fillStyle = css(paint)
  ctx.fillRect(0, 0, W, H)
  // Grain through the paint, vertical, and two painted-over knots
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W
    ctx.strokeStyle = css(mix(paint, grain, 0.5), 0.05 + rnd() * 0.08)
    ctx.lineWidth = 1 + rnd() * 2
    ctx.beginPath()
    ctx.moveTo(x, -10)
    ctx.bezierCurveTo(x + (rnd() - 0.5) * 12, H * 0.3, x + (rnd() - 0.5) * 12, H * 0.7, x + (rnd() - 0.5) * 8, H + 10)
    ctx.stroke()
  }
  brushStrokes(ctx, W, H, 500, paint, Math.PI / 2, rnd)
  // Corner grime toward the edges, the lower corners heavier
  const grime = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.62)
  grime.addColorStop(0, css(ink, 0))
  grime.addColorStop(1, css(ink, 0.14))
  ctx.fillStyle = grime
  ctx.fillRect(0, 0, W, H)
  // The chalk figures, struck several times so the stroke breaks like chalk
  ctx.font = `500 96px ${FONT_SANS}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cy = H * 0.42
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = css(chalkC, 0.28 + rnd() * 0.12)
    ctx.fillText(chalk, W / 2 + (rnd() - 0.5) * 3, cy + (rnd() - 0.5) * 3)
  }
  ctx.fillStyle = css(chalkC, 0.55)
  ctx.fillText(chalk, W / 2, cy)
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = css(chalkC, 0.1 + rnd() * 0.25)
    ctx.fillRect(W * 0.15 + rnd() * W * 0.7, cy + 40 + rnd() * 60, 1 + rnd(), 1)
  }
  return texture(c)
}

/** Painted distemper for the parapet, with a scuff band beside the door and grime toward the corners. */
function parapetMaterial(p: RegionPalette, rnd: () => number): THREE.MeshStandardMaterial {
  const S = 512
  const [c, ctx] = canvas2d(S, S)
  const wall = parse(p.wall), ink = parse(p.ink)
  ctx.fillStyle = css(wall)
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = css(scale(wall, rnd() < 0.5 ? 0.93 : 1.06), 0.18)
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5)
  }
  brushStrokes(ctx, S, S, 700, wall, Math.PI / 2, rnd)
  // The scuff: −4 percent value in a 40 mm band 350 mm above the floor (the tile spans one metre)
  ctx.fillStyle = css(ink, 0.09)
  ctx.fillRect(0, S * (1 - 0.37), S, S * 0.04)
  const t = texture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0 })
}

/** Pine boards for the floor: the wood texture with seams painted over it, tiled per metre. */
function floorMaterial(p: RegionPalette, rnd: () => number): THREE.MeshStandardMaterial {
  const wood = mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'lamproom:floor', repeat: [1, 1] })
  const src = wood.map?.image as HTMLCanvasElement | undefined
  const S = 512
  const [c, ctx] = canvas2d(S, S)
  if (src) ctx.drawImage(src, 0, 0, S, S)
  else { ctx.fillStyle = p.ground; ctx.fillRect(0, 0, S, S) }
  // Six boards per metre-tile, grain along x, joints staggered
  ctx.fillStyle = css(parse(p.ink), 0.55)
  for (let i = 0; i < 6; i++) {
    const y = Math.round((S / 6) * i)
    ctx.fillRect(0, y, S, 2)
    ctx.fillRect(Math.round(S * ((i * 0.37 + rnd() * 0.2) % 1)), y, 2, Math.round(S / 6))
  }
  const t = texture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0 })
}

/** An engraved brass plate: ink caps on brass, letterspaced, on a thin brass backing. Origin at the centre, facing +z. */
function brassPlate(lines: string[], width: number, height: number, p: RegionPalette): THREE.Group {
  const g = new THREE.Group()
  g.name = 'plate'
  const texH = lines.length > 2 ? 256 : 128
  const texW = Math.min(1024, Math.max(128, 2 ** Math.round(Math.log2((width / height) * texH))))
  const map = labelTexture({ lines, bg: p.brass, color: p.ink, border: p.ink, width: texW, height: texH, letterSpacing: 0.18, weight: 500 })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.35 }))
  face.position.z = 0.0035
  face.receiveShadow = true
  g.add(face)
  g.add(box(width + 0.01, height + 0.01, 0.006, mat.brass()))
  return g
}

/** The destination plate over a door: paper, ink caps. */
function namePlate(text: string, width: number, p: RegionPalette): THREE.Mesh {
  return placard({ lines: [text], width, height: width * 0.22, bg: p.paper, color: p.ink, border: p.ink })
}

function hotspotById(ctx: BuildContext, id: string): HotspotDef {
  const hs = ctx.def.hotspots.find((h) => h.id === id)
  if (!hs) throw new Error(`lamproom: hotspot ${id} missing from the definition`)
  return hs
}

// ───────────────────────────── The lantern ─────────────────────────────

interface Shell { group: THREE.Group; brassBars: Instancer; brassRods: Instancer }

/** Floor, parapet with its cap and skirting, cornice and ceiling, and the eight glazed faces with the door gap. */
function shell(ctx: BuildContext, rnd: () => number): Shell {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'shell'
  const brass = mat.brass()
  const brassBars = new Instancer(boxGeo(1, 1, 1), brass, 'brass-bars')
  const brassRods = new Instancer(cylGeo(1, 1, 1, 14), brass, 'brass-rods')
  const trim = mat.lacquer(p.trim)
  const timber = mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'lamproom:sill', repeat: [1, 1] })

  // Floor: an octagonal slab 0.3 m thick with the trap cut through it, top at y = 0
  const floorShape = octagonShape(APOTHEM + 0.1)
  const trap = new THREE.Path()
  trap.moveTo(-TRAP.w / 2, -(TRAP.z - TRAP.d / 2))
  trap.lineTo(TRAP.w / 2, -(TRAP.z - TRAP.d / 2))
  trap.lineTo(TRAP.w / 2, -(TRAP.z + TRAP.d / 2))
  trap.lineTo(-TRAP.w / 2, -(TRAP.z + TRAP.d / 2))
  trap.closePath()
  floorShape.holes.push(trap)
  const floor = extrude(floorShape, -0.3, 0.3, floorMaterial(p, rnd))
  floor.name = 'floor'
  g.add(floor)

  // Parapet (distemper), its pine cap and lacquered skirting, all with the door gap
  g.add(extrude(ringWithGap(APOTHEM + 0.1, APOTHEM - 0.16, DOOR_HALF + 0.05), 0, SILL - 0.04, parapetMaterial(p, rnd)))
  g.add(extrude(ringWithGap(APOTHEM + 0.12, APOTHEM - 0.2, DOOR_HALF + 0.05), SILL - 0.04, 0.04, timber))
  g.add(extrude(ringWithGap(APOTHEM - 0.15, APOTHEM - 0.19, DOOR_HALF + 0.05), 0, 0.1, trim))

  // Cornice: a painted band from the glazing head to the ceiling, a brass bead under it; the ceiling with eight ribs and a boss
  g.add(extrude(ringWithGap(APOTHEM + 0.12, APOTHEM - 0.12, 0), HEAD, CEILING - HEAD, mat.plaster(p.trim)))
  g.add(extrude(ringWithGap(APOTHEM + 0.13, APOTHEM - 0.13, 0), HEAD - 0.02, 0.03, brass))
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(octagonShape(APOTHEM + 0.12)), mat.plaster(p.paper))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = CEILING
  ceiling.receiveShadow = true
  g.add(ceiling)
  const ribs = new Instancer(boxGeo(1, 1, 1), trim, 'ribs')
  for (const [x, z] of octagonCorners(APOTHEM)) {
    const len = Math.hypot(x, z)
    ribs.bar(0.08, 0.08, len, x / 2, CEILING - 0.04, z / 2, Math.atan2(x, z))
  }
  g.add(ribs.bake())
  g.add(cyl(0.22, 0.26, 0.06, trim, 0, CEILING - 0.03, 0, 32))
  g.add(cyl(0.08, 0.1, 0.03, brass, 0, CEILING - 0.075, 0, 24))

  // Corner posts
  for (const [x, z] of octagonCorners(APOTHEM)) {
    brassBars.bar(0.1, GLAZE_H + 0.04, 0.1, x, SILL + GLAZE_H / 2, z, Math.atan2(x, z))
  }

  // The eight faces: sill and head rails, transom, centre mullion (jambs on the door face) and glass
  const paneMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(p.paper), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.13,
    clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide, depthWrite: false,
    envMap: brass.envMap, envMapIntensity: 0.7,
  })
  const pane = (w: number, h: number, x: number, y: number, parent: THREE.Group): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paneMat)
    m.position.set(x, y, 0)
    m.castShadow = false
    m.receiveShadow = false
    m.name = 'pane'
    parent.add(m)
  }
  for (let k = 0; k < 8; k++) {
    const fm = faceMatrix(k, APOTHEM)
    const fg = faceGroup(k, APOTHEM)
    fg.name = `face:${k}`
    g.add(fg)
    brassBars.bar(2 * HALF, 0.08, 0.08, 0, HEAD - 0.04, 0, 0, fm)
    brassBars.bar(2 * HALF - 0.1, 0.05, 0.05, 0, TRANSOM, 0, 0, fm)
    if (k === 0) {
      // The back face: the door between two jambs, a light either side, the transom light over the door
      for (const s of [-1, 1]) {
        brassBars.bar(0.05, HEAD, 0.05, s * (DOOR_HALF + 0.025), HEAD / 2, 0, 0, fm)
        const w = HALF - 0.05 - (DOOR_HALF + 0.05)
        brassBars.bar(w, 0.06, 0.08, s * (DOOR_HALF + 0.05 + w / 2), SILL + 0.03, 0, 0, fm)
      }
      pane(HALF - DOOR_HALF - 0.1, GLAZE_H - 0.14, -(DOOR_HALF + 0.05 + (HALF - DOOR_HALF - 0.1) / 2), SILL + GLAZE_H / 2, fg)
      pane(HALF - DOOR_HALF - 0.1, TRANSOM - SILL - 0.06, DOOR_HALF + 0.05 + (HALF - DOOR_HALF - 0.1) / 2, (SILL + TRANSOM) / 2, fg)
      pane(2 * DOOR_HALF - 0.05, HEAD - TRANSOM - 0.1, 0, (TRANSOM + HEAD) / 2, fg)
    } else {
      brassBars.bar(2 * HALF, 0.06, 0.08, 0, SILL + 0.03, 0, 0, fm)
      brassBars.bar(0.05, GLAZE_H, 0.05, 0, SILL + GLAZE_H / 2, 0, 0, fm)
      pane(2 * HALF - 0.1, GLAZE_H - 0.14, 0, SILL + GLAZE_H / 2, fg)
    }
  }

  // The rail all round on brass stanchions from the floor, open at the door with turned newels
  for (let k = 0; k < 8; k++) {
    const fm = faceMatrix(k, RAIL_APOTHEM)
    const at = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, 0).applyMatrix4(fm)
    const spans: [number, number][] = k === 0 ? [[-RAIL_HALF, -DOOR_HALF - 0.15], [DOOR_HALF + 0.15, RAIL_HALF]] : [[-RAIL_HALF, RAIL_HALF]]
    for (const [a, b] of spans) {
      brassRods.rod(at(a, RAIL_Y), at(b, RAIL_Y), 0.022)
      const posts = k === 0 ? [a === -RAIL_HALF ? b : a] : [-RAIL_HALF / 2, RAIL_HALF / 2]
      for (const x of posts) {
        brassRods.rod(at(x, 0.01), at(x, RAIL_Y), 0.014)
        brassRods.rod(at(x, 0.0), at(x, 0.02), 0.03)
      }
      if (k === 0) {
        const end = a === -RAIL_HALF ? b : a
        g.add(mesh(sphereGeo(0.04, 16), brass, at(end, RAIL_Y + 0.02).x, RAIL_Y + 0.02, at(end, RAIL_Y).z))
      }
    }
  }
  for (const [x, z] of octagonCorners(RAIL_APOTHEM)) {
    brassRods.rod(new THREE.Vector3(x, 0.01, z), new THREE.Vector3(x, RAIL_Y + 0.05, z), 0.016)
    brassRods.rod(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.02, z), 0.032)
    g.add(mesh(sphereGeo(0.03, 12), brass, x, RAIL_Y + 0.06, z))
  }

  return { group: g, brassBars, brassRods }
}

// ───────────────────────────── The door and the trap ─────────────────────────────

/** The glazed door to the jetty in the back face's centre light, hinged on the right, its plate over it. */
function jettyDoor(hs: HotspotDef, ctx: BuildContext, bars: Instancer): THREE.Group {
  const p = ctx.region
  const g = faceGroup(0, APOTHEM)
  g.name = `door:${hs.id}`
  const fm = faceMatrix(0, APOTHEM)
  const w = 2 * DOOR_HALF - 0.02, h = TRANSOM - 0.04
  const paint = mat.lacquer(p.trim)
  const leafBars = new Instancer(boxGeo(1, 1, 1), paint, 'door-leaf')
  const local = new THREE.Matrix4()
  for (const s of [-1, 1]) leafBars.bar(0.07, h, 0.045, s * (w / 2 - 0.035), h / 2, 0, 0, local)
  leafBars.bar(w - 0.14, 0.09, 0.045, 0, h - 0.045, 0, 0, local)
  leafBars.bar(w - 0.14, 0.07, 0.045, 0, SILL + 0.035, 0, 0, local)
  leafBars.bar(w - 0.14, 0.2, 0.045, 0, 0.1, 0, 0, local)
  g.add(leafBars.bake())
  const panel = box(w - 0.14, SILL - 0.2, 0.03, mat.flat(p.trim), 0, (SILL + 0.2) / 2, 0)
  g.add(panel)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - SILL - 0.16), mat.glass(p.paper))
  glass.position.set(0, (SILL + 0.07 + h - 0.09) / 2, 0)
  glass.castShadow = false
  g.add(glass)
  // Hinges, the lever inside, a brass threshold
  for (const y of [0.3, h / 2, h - 0.3]) bars.bar(0.02, 0.1, 0.06, w / 2 + 0.005, y, 0, 0, fm)
  bars.bar(0.012, 0.012, 0.11, -(w / 2 - 0.12), 1.02, -0.05, 0, fm)
  bars.bar(0.11, 0.012, 0.012, -(w / 2 - 0.12) + 0.04, 1.02, -0.1, 0, fm)
  bars.bar(w + 0.1, 0.012, 0.16, 0, 0.006, 0, 0, fm)
  const plate = namePlate(hs.label, 0.6, p)
  plate.position.set(0, TRANSOM + 0.16, -0.035)
  plate.rotation.y = Math.PI
  g.add(plate)
  return g
}

/** The trap to the Landing: an open hatch in the floor with two brass grab rails and its plate. */
function landingTrap(hs: HotspotDef, ctx: BuildContext, rods: Instancer): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  g.position.set(0, 0, TRAP.z)
  const dark = mesh(boxGeo(TRAP.w, 0.02, TRAP.d), mat.flat(p.ink), 0, -0.29, 0)
  dark.castShadow = false
  g.add(dark)
  // Ladder top: two pine stiles and a rung visible in the hatch
  const timber = mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'lamproom:ladder', repeat: [1, 3] })
  for (const s of [-1, 1]) g.add(box(0.05, 0.6, 0.03, timber, s * 0.3, -0.3, -TRAP.d / 2 + 0.06))
  g.add(box(0.56, 0.03, 0.03, timber, 0, -0.14, -TRAP.d / 2 + 0.06))
  // Grab rails: a U of brass either side of the hatch
  for (const s of [-1, 1]) {
    const x = s * (TRAP.w / 2 + 0.05)
    for (const z of [-TRAP.d / 2 + 0.05, TRAP.d / 2 - 0.05]) {
      rods.rod(new THREE.Vector3(x, 0.01, TRAP.z + z), new THREE.Vector3(x, 0.86, TRAP.z + z), 0.014)
      rods.rod(new THREE.Vector3(x, 0, TRAP.z + z), new THREE.Vector3(x, 0.02, TRAP.z + z), 0.03)
    }
    rods.rod(new THREE.Vector3(x, 0.86, TRAP.z - TRAP.d / 2 + 0.05), new THREE.Vector3(x, 0.86, TRAP.z + TRAP.d / 2 - 0.05), 0.016)
  }
  // Brass hatch frame lying in the floor
  rods.rod(new THREE.Vector3(-TRAP.w / 2 - 0.02, 0.005, TRAP.z - TRAP.d / 2), new THREE.Vector3(TRAP.w / 2 + 0.02, 0.005, TRAP.z - TRAP.d / 2), 0.012)
  rods.rod(new THREE.Vector3(-TRAP.w / 2 - 0.02, 0.005, TRAP.z + TRAP.d / 2), new THREE.Vector3(TRAP.w / 2 + 0.02, 0.005, TRAP.z + TRAP.d / 2), 0.012)
  const plate = namePlate(hs.label, 0.56, p)
  plate.position.set(0, 0.9, -TRAP.d / 2 + 0.05)
  g.add(plate)
  return g
}

// ───────────────────────────── The lamp ─────────────────────────────

/** A bullseye lens: a lathe of a stepped convex profile in glass, its axis along +z. */
function lensGeometry(): THREE.LatheGeometry {
  const profile: [number, number][] = [
    [0.001, 0.055], [0.05, 0.05], [0.075, 0.034], [0.078, 0.046], [0.125, 0.03], [0.128, 0.042],
    [0.175, 0.026], [0.178, 0.036], [0.225, 0.018], [0.25, 0.004], [0.25, -0.01], [0.001, -0.01],
  ]
  return latheGeo('lens', profile, 56)
}

const PEDESTAL: [number, number][] = [
  [0.001, 0], [0.44, 0], [0.44, 0.04], [0.4, 0.06], [0.32, 0.08], [0.3, 0.14], [0.25, 0.18], [0.24, 0.3],
  [0.235, 0.95], [0.26, 1.0], [0.26, 1.04], [0.3, 1.08], [0.36, 1.12], [0.37, 1.2], [0.001, 1.2],
]

/**
 * The lamp on its 1.2 m brass pedestal: a rotating housing of two white lenses and one red in
 * brass rings between a base ring and a domed cap, the burner's chimney at the centre. The red
 * lens faces the camera; `userData.lit(on)` raises its emission and the burner's glow.
 */
function lamp(hs: HotspotDef, ctx: BuildContext, rods: Instancer): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `lamp:${hs.id}`
  const brass = mat.brass()
  g.add(mesh(latheGeo('pedestal', PEDESTAL, 48), brass, 0, 0, 0))
  g.add(cyl(0.42, 0.42, 0.05, brass, 0, 1.225, 0, 48))
  g.add(cyl(0.4, 0.4, 0.012, mat.felt(p.felt), 0, 1.256, 0, 48))

  const housing = new THREE.Group()
  housing.name = 'housing'
  housing.position.y = 1.26
  g.add(housing)
  const base = mesh(torusGeo(0.38, 0.022), brass, 0, 0.04, 0)
  base.rotation.x = Math.PI / 2
  housing.add(base)
  const top = mesh(torusGeo(0.38, 0.022), brass, 0, 0.94, 0)
  top.rotation.x = Math.PI / 2
  housing.add(top)
  housing.add(mesh(latheGeo('lamp-cap', [[0.001, 0], [0.4, 0], [0.4, 0.03], [0.34, 0.06], [0.24, 0.13], [0.12, 0.19], [0.05, 0.22], [0.05, 0.26], [0.001, 0.26]], 48), brass, 0, 0.95, 0))
  housing.add(mesh(sphereGeo(0.035, 16), brass, 0, 1.23, 0))
  const lensGeo = lensGeometry()
  const white = mat.glass(p.paper)
  const red = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tokens['grid.beacon']), emissive: new THREE.Color(tokens['grid.beacon']), emissiveIntensity: 0.35,
    roughness: 0.1, metalness: 0, transmission: 0.45, thickness: 0.05, transparent: true, ior: 1.5, envMap: brass.envMap, envMapIntensity: 0.45,
  })
  const kinds = dressing.lamp.lenses
  kinds.forEach((kind, i) => {
    const a = (i / kinds.length) * TWO_PI + (kind === 'red' ? 0 : 0)
    const panel = new THREE.Group()
    panel.rotation.y = a
    panel.position.set(Math.sin(a) * 0.34, 0.49, Math.cos(a) * 0.34)
    const ring = mesh(torusGeo(0.265, 0.018, 48), brass, 0, 0, 0)
    panel.add(ring)
    const lens = mesh(lensGeo, kind === 'red' ? red : white, 0, 0, 0)
    lens.rotation.x = Math.PI / 2
    lens.castShadow = false
    panel.add(lens)
    // Two brass stays from the ring to the axis
    for (const s of [-1, 1]) {
      const from = new THREE.Vector3(s * 0.2, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(a)).add(panel.position).add(housing.position)
      const to = new THREE.Vector3(0, panel.position.y + housing.position.y, 0)
      rods.rod(from, to, 0.008)
    }
    housing.add(panel)
  })
  // Uprights between the panels, from the base ring to the top ring
  for (let i = 0; i < 3; i++) {
    const a = ((i + 0.5) / 3) * TWO_PI
    rods.rod(new THREE.Vector3(Math.sin(a) * 0.38, 1.3, Math.cos(a) * 0.38), new THREE.Vector3(Math.sin(a) * 0.38, 2.2, Math.cos(a) * 0.38), 0.014)
  }
  // The burner: a glass chimney over a mantle, and the lamp's one warm light, off by day
  const chimney = cyl(0.05, 0.055, 0.32, mat.glass(p.paper), 0, 0.5, 0, 24)
  chimney.castShadow = false
  housing.add(chimney)
  const mantle = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.paper), emissive: new THREE.Color(p.light), emissiveIntensity: 0, roughness: 0.9 })
  housing.add(cyl(0.018, 0.022, 0.09, mantle, 0, 0.45, 0, 12))
  housing.add(cyl(0.06, 0.07, 0.06, brass, 0, 0.32, 0, 24))
  housing.add(cyl(0.03, 0.03, 0.26, brass, 0, 0.17, 0, 16))
  const light = new THREE.PointLight(new THREE.Color(tokens['grid.beacon']), 0, 9, 2)
  light.position.set(0, 0.55, 0)
  light.castShadow = false
  light.name = 'lamp-light'
  housing.add(light)

  // Its index plate on a block on the column's front
  g.add(box(0.3, 0.13, 0.03, brass, 0, 1.0, 0.22))
  const plate = brassPlate(['HS-0601', 'THE LAMP', 'BRASS, GLASS · 1931', '"LIT AT DUSK. TWO WHITE, ONE RED.', 'THE RED IS FOR THE SIXTY-FOUR."'], 0.28, 0.11, p)
  plate.position.set(0, 1.0, 0.235)
  g.add(plate)

  g.userData.lit = (on: boolean): void => {
    red.emissiveIntensity = on ? 2.4 : 0.35
    mantle.emissiveIntensity = on ? 1.0 : 0
    light.intensity = on ? 7 : 0
  }
  return g
}

// ───────────────────────────── The telescope and its bearings ─────────────────────────────

/** Where a ray from the telescope's eye toward `target` meets the vignette radius. */
function bearingHit(target: [number, number, number]): THREE.Vector3 {
  const d = new THREE.Vector3().fromArray(target).sub(RAIL_EYE).normalize()
  const px = RAIL_EYE.x, pz = RAIL_EYE.z
  const a = d.x * d.x + d.z * d.z
  const b = 2 * (px * d.x + pz * d.z)
  const c = px * px + pz * pz - VIEW_R * VIEW_R
  const t = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  return RAIL_EYE.clone().addScaledVector(d, t)
}

/**
 * The telescope on its tripod inside the back-left rail, aimed across the room at the Holms, with
 * the three brass bearing pins on the rail and their plates. Returns the objects for the three
 * bearing hotspots: the telescope itself carries the bearing it is pinned to (the Holms).
 */
function telescopeStation(ctx: BuildContext, rods: Instancer, ids: [string, string, string]): [THREE.Object3D, THREE.Object3D, THREE.Object3D] {
  const p = ctx.region
  const k = 1 + 4 // the back-left face (k = 5)
  const fm = faceMatrix(k, RAIL_APOTHEM)
  const at = (x: number, y: number, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(fm)
  const names = dressing.bearings
  const out: THREE.Object3D[] = []
  const pinX = [0.38, 0, -0.38]
  for (let i = 0; i < 3; i++) {
    const pin = new THREE.Group()
    pin.name = `bearing:${names[i]}`
    const top = at(pinX[i], RAIL_Y + 0.09), bottom = at(pinX[i], RAIL_Y)
    rods.rod(bottom, top, 0.007)
    const head = mesh(sphereGeo(0.014, 12), mat.brass(), top.x, top.y, top.z)
    pin.add(head)
    const plate = brassPlate([names[i]], 0.2, 0.045, p)
    const pos = at(pinX[i], RAIL_Y - 0.06, -0.03)
    plate.position.copy(pos)
    plate.rotation.y = faceAngle(k) + Math.PI
    pin.add(plate)
    out.push(pin)
  }
  const scope = telescope({ colors: p, seed: 'lamproom', height: 1.4, azimuth: -Math.PI / 2 - 0.06, elevation: -0.05 })
  scope.position.set(-1.9, 0, -2.05)
  const plate = brassPlate(['HS-0603', 'TELESCOPE', 'BRASS · 1931', '"THREE BEARINGS, PINNED.', 'THE POINT. THE HOLMS. THE HEAD."'], 0.22, 0.09, p)
  plate.position.set(0.08, 0.98, 0.22)
  scope.add(plate)
  const holms = out[1] as THREE.Group
  holms.add(scope)
  out[0].userData.hotspot = ids[0]
  out[1].userData.hotspot = ids[1]
  out[2].userData.hotspot = ids[2]
  return [out[0], out[1], out[2]]
}

// ───────────────────────────── The flaw ─────────────────────────────

/** The boarded pane: the upper-right light of the back face, a pine board nailed on from inside and chalked. */
function boardedPane(hs: HotspotDef, ctx: BuildContext, rods: Instancer, rnd: () => number): THREE.Group {
  const p = ctx.region
  const g = faceGroup(0, APOTHEM)
  g.name = `board:${hs.id}`
  const fm = faceMatrix(0, APOTHEM)
  const w = HALF - DOOR_HALF - 0.1 + 0.06, h = HEAD - TRANSOM - 0.1 + 0.05
  const x = DOOR_HALF + 0.05 + (HALF - DOOR_HALF - 0.1) / 2, y = (TRANSOM + HEAD) / 2
  const board = box(w, h, 0.025, mat.flat(p.wallAlt), x, y, -0.045)
  g.add(board)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: chalkBoardTexture(dressing.pane.chalk, p, rnd), roughness: 0.92, metalness: 0 }))
  face.position.set(x, y, -0.045 - 0.0126)
  face.rotation.y = Math.PI
  face.receiveShadow = true
  g.add(face)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const nx = x + sx * (w / 2 - 0.05), ny = y + sy * (h / 2 - 0.05)
    rods.rod(new THREE.Vector3(nx, ny, -0.062).applyMatrix4(fm), new THREE.Vector3(nx, ny, -0.056).applyMatrix4(fm), 0.008)
  }
  const plate = brassPlate(['HS-0607 · THE BOARDED PANE', 'PINE, PAINT · 1959 · "A GULL."'], 0.3, 0.05, p)
  plate.position.set(x, y - h / 2 + 0.09, -0.045 - 0.0126 - 0.004)
  plate.rotation.y = Math.PI
  g.add(plate)
  return g
}

// ───────────────────────────── The sea ─────────────────────────────

/** The painted sea cylinder with its sky cap and sea floor, and the three fixed vignettes. Returns [the turning group, the vignettes]. */
function sea(ctx: BuildContext, rnd: () => number): [THREE.Group, THREE.Group] {
  const turning = new THREE.Group()
  turning.name = 'sea'
  turning.position.y = EYE
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(SEA_R, SEA_R, SEA_H, 96, 1, true), new THREE.MeshBasicMaterial({ map: seaTexture(rnd), side: THREE.BackSide }))
  drum.name = 'sea-drum'
  turning.add(drum)
  const skyTop = css(scale(mix(parse(tokens['out.sky']), parse(tokens['grid.sky']), 0.65), 0.97))
  const cap = new THREE.Mesh(new THREE.CircleGeometry(SEA_R + 0.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(skyTop), side: THREE.BackSide }))
  cap.rotation.x = -Math.PI / 2
  cap.position.y = SEA_H / 2
  turning.add(cap)
  const bed = new THREE.Mesh(new THREE.CircleGeometry(SEA_R + 0.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(css(mix(parse(tokens['out.sea']), parse(tokens['grid.channel']), 0.35))) }))
  bed.rotation.x = -Math.PI / 2
  bed.position.y = -SEA_H / 2
  turning.add(bed)

  const views = new THREE.Group()
  views.name = 'vignettes'
  const kinds: ['point' | 'holms' | 'head', string][] = [['point', 'telescope1'], ['holms', 'telescope2'], ['head', 'telescope3']]
  for (const [kind, station] of kinds) {
    const st = ctx.def.stations?.[station]
    if (!st) continue
    const hit = bearingHit(st.target)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: vignetteTexture(kind, rnd), transparent: false, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }))
    m.position.copy(hit)
    m.lookAt(0, hit.y, 0)
    m.name = `vignette:${kind}`
    views.add(m)
  }
  return [turning, views]
}

// ───────────────────────────── The frame ─────────────────────────────

/**
 * Builds the Lamp Room. Registers every hotspot of the definition; exposes `userData.tick(dt)`
 * (the sea turning one revolution per 240 s), `userData.watchOnly` (the Keeper, fourth watch only)
 * and, on the lamp, `userData.lit(on)`.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const rnd = ctx.rnd
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
    if (!object.parent) group.add(object)
  }

  const room = shell(ctx, rnd)
  group.add(room.group)

  const door = jettyDoor(hotspotById(ctx, 'lamproom.door.jetty'), ctx, room.brassBars)
  register('lamproom.door.jetty', door)
  const trap = landingTrap(hotspotById(ctx, 'lamproom.stair'), ctx, room.brassRods)
  register('lamproom.stair', trap)

  const theLamp = lamp(hotspotById(ctx, 'lamproom.lamp'), ctx, room.brassRods)
  register('lamproom.lamp', theLamp)

  const [point, holms, head] = telescopeStation(ctx, room.brassRods, ['lamproom.telescope1', 'lamproom.telescope2', 'lamproom.telescope3'])
  register('lamproom.telescope1', point)
  register('lamproom.telescope2', holms)
  register('lamproom.telescope3', head)

  const board = boardedPane(hotspotById(ctx, 'lamproom.pane'), ctx, room.brassRods, rnd)
  register('lamproom.pane', board)

  // Every brass bar and rod in the room, in two draw calls
  group.add(room.brassBars.bake())
  group.add(room.brassRods.bake())

  // The Keeper by the lamp, fourth watch only
  const keeper = figure({ variant: 'ferrier' })
  keeper.position.set(-1.05, 0, -0.55)
  keeper.rotation.y = 0.12
  keeper.visible = false
  register('lamproom.ferrier', keeper)
  out.residentAnchor = keeper
  group.userData.watchOnly = { object: keeper, watch: dressing.duskWatch }

  // The sea on all sides, turning
  const [turning, views] = sea(ctx, rnd)
  group.add(turning, views)
  const rate = TWO_PI / dressing.sea.turnSeconds
  group.userData.tick = (dt: number): void => {
    turning.rotation.y = (turning.rotation.y + dt * rate) % TWO_PI
  }

  return out
}
