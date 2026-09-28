// Residents as static figures from primitives (bible §11): a lathe head, a capsule body, the Society
// jersey with brass buttons and a felt badge on the left breast, and one variation per resident.
// Figures face +z (toward the camera). `head` is a pivot for the 8° turn; `eyes` blink once.
import * as THREE from 'three'
import { clock, ease } from '../core/clock'
import { mat } from '../scene/materials'
import { tokens } from '../content/palette'

export type FigureVariant = 'brace' | 'ida' | 'ferrier' | 'lisle' | 'tuck' | 'voss' | 'plain'

/** Colours a figure is painted with. Every default passes the palette lint (S ≤ 0.62, no pure white/black). */
export interface FigureColors {
  jersey: string
  skin: string
  hair: string
  trousers: string
  boots: string
  brass: string
  badge: string
  oilskin: string
  cardigan: string
  apron: string
}

export interface FigureOptions {
  variant: FigureVariant
  colors?: Partial<FigureColors>
  /** Standing height in metres. Defaults per resident. */
  height?: number
  /** Seated on a chair whose seat is at `seatHeight` (default 0.46). */
  seated?: boolean
  seatHeight?: number
}

/** Muted defaults: the Society jersey teal, a lamp-lit skin, hair in inks and papers. */
export const FIGURE_COLORS: FigureColors = {
  jersey: tokens['hs.textile'],
  skin: '#C9A98A',
  hair: '#4A3A2E',
  trousers: '#4B4640',
  boots: '#2B2620',
  brass: tokens['hs.brass'],
  badge: tokens['hs.raspberry'],
  oilskin: tokens['out.oilskin'],
  cardigan: tokens['hs.raspberry'],
  apron: '#CFC3A4',
}

/** Standing heights by resident (Ida is twelve). */
export const FIGURE_HEIGHTS: Record<FigureVariant, number> = {
  brace: 1.70, ida: 1.45, ferrier: 1.68, lisle: 1.74, tuck: 1.72, voss: 1.66, plain: 1.72,
}

const HAIR: Record<FigureVariant, string> = {
  brace: '#3A2E26', ida: '#8A6A3E', ferrier: '#D9D2C0', lisle: '#8C857A', tuck: '#6B6257', voss: '#D9D2C0', plain: '#4A3A2E',
}

const geometries = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometries.get(key)
  if (hit) return hit as T
  const g = make(); geometries.set(key, g); return g
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.castShadow = true
  o.receiveShadow = true
  return o
}

function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  return mesh(geo(`cap|${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16)), m)
}

/** An egg-shaped head: a lathe of a slightly tapered profile, chin down. */
function headGeometry(): THREE.LatheGeometry {
  return geo('head', () => {
    const pts: THREE.Vector2[] = []
    const n = 14
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const y = -0.11 + 0.22 * t
      const r = 0.088 * Math.sin(Math.PI * t) * (0.86 + 0.14 * t)
      pts.push(new THREE.Vector2(Math.max(0.001, r), y))
    }
    return new THREE.LatheGeometry(pts, 24)
  })
}

/**
 * Builds a resident. Origin at the floor between the feet; faces +z. Children by name: `head` (pivot at the
 * neck, holds the face, hair and `eyes`), `torso`, `badge`. userData: { figure: variant }.
 */
export function figure(o: FigureOptions): THREE.Group {
  const c: FigureColors = { ...FIGURE_COLORS, hair: HAIR[o.variant], ...(o.colors ?? {}) }
  const H = o.height ?? FIGURE_HEIGHTS[o.variant]
  const s = H / 1.72
  const g = new THREE.Group()
  g.name = `figure:${o.variant}`
  g.userData.figure = o.variant

  const skin = mat.flat(c.skin)
  const jersey = mat.velvet(c.jersey)
  const trousers = mat.flat(c.trousers)
  const boots = mat.flat(c.boots)
  const hair = mat.flat(c.hair)

  const legLen = 0.78 * s
  const torsoLen = 0.52 * s
  const seated = !!o.seated
  const seatY = o.seatHeight ?? 0.46
  const hipY = seated ? seatY + 0.02 : legLen

  // Legs and boots
  const thighR = 0.075 * s
  for (const side of [-1, 1]) {
    const x = side * 0.11 * s
    if (seated) {
      const thigh = capsule(thighR, 0.36 * s, trousers)
      thigh.rotation.x = Math.PI / 2
      thigh.position.set(x, hipY, 0.2 * s)
      g.add(thigh)
      const shin = capsule(thighR * 0.9, 0.34 * s, trousers)
      shin.position.set(x, hipY / 2 + 0.02, 0.4 * s)
      g.add(shin)
      g.add(mesh(geo(`boot|${s}`, () => new THREE.BoxGeometry(0.11 * s, 0.07 * s, 0.26 * s)), boots, x, 0.035 * s, 0.46 * s))
    } else {
      const leg = capsule(thighR, legLen - 0.16 * s, trousers)
      leg.position.set(x, legLen / 2 + 0.04 * s, 0)
      g.add(leg)
      g.add(mesh(geo(`boot|${s}`, () => new THREE.BoxGeometry(0.11 * s, 0.07 * s, 0.26 * s)), boots, x, 0.035 * s, 0.04 * s))
    }
  }

  // Torso: a capsule widened at the shoulders
  const torso = capsule(0.17 * s, torsoLen - 0.2 * s, jersey)
  torso.name = 'torso'
  torso.scale.set(1.15, 1, 0.72)
  torso.position.set(0, hipY + torsoLen / 2, 0)
  g.add(torso)

  // Buttons and the badge on the left breast (the figure's left is +x)
  const button = geo('button', () => new THREE.SphereGeometry(0.009, 10, 8))
  for (let i = 0; i < 3; i++) g.add(mesh(button, mat.brass(), 0, hipY + torsoLen * (0.35 + i * 0.18), 0.125 * s))
  const badge = new THREE.Group()
  badge.name = 'badge'
  badge.add(mesh(geo('badge', () => new THREE.CircleGeometry(0.02, 20)), mat.felt(c.badge), 0, 0, 0.001))
  badge.add(mesh(geo('badgeRing', () => new THREE.RingGeometry(0.02, 0.024, 20)), mat.brass(), 0, 0, 0.0012))
  badge.position.set(0.075 * s, hipY + torsoLen * 0.78, 0.126 * s)
  g.add(badge)

  // Arms and hands
  const shoulderY = hipY + torsoLen - 0.04 * s
  for (const side of [-1, 1]) {
    const x = side * 0.22 * s
    const rolled = o.variant === 'lisle'
    const sleeveLen = (rolled ? 0.3 : 0.5) * s
    const arm = capsule(0.05 * s, sleeveLen, jersey)
    arm.rotation.z = side * 0.08
    arm.position.set(x, shoulderY - sleeveLen / 2 - 0.02 * s, 0.01 * s)
    g.add(arm)
    if (rolled) {
      const fore = capsule(0.045 * s, 0.2 * s, skin)
      fore.rotation.z = side * 0.08
      fore.position.set(x + side * 0.02 * s, shoulderY - sleeveLen - 0.12 * s, 0.01 * s)
      g.add(fore)
    }
    if (o.variant === 'voss') {
      // Through at the elbows: a darker patch on each elbow
      g.add(mesh(geo('patch', () => new THREE.CircleGeometry(0.035, 16)), mat.flat('#3E5559'), x + side * 0.055 * s, shoulderY - 0.27 * s, 0.02 * s))
    }
    g.add(mesh(geo(`hand|${s}`, () => new THREE.SphereGeometry(0.045 * s, 12, 10)), skin, x + side * 0.04 * s, shoulderY - 0.56 * s, 0.02 * s))
  }

  // Variations worn over the jersey
  if (o.variant === 'tuck') {
    const coat = capsule(0.19 * s, torsoLen + 0.25 * s, mat.enamel(c.oilskin))
    coat.scale.set(1.15, 1, 0.78)
    coat.position.set(0, hipY + torsoLen / 2 - 0.12 * s, 0)
    g.add(coat)
    const brim = mesh(geo('souwester', () => new THREE.CylinderGeometry(0.16, 0.14, 0.03, 20)), mat.enamel(c.oilskin), 0, 0.08, -0.02)
    brim.name = 'hat'
    g.userData.hat = brim
  }
  if (o.variant === 'ida') {
    const cardigan = capsule(0.175 * s, torsoLen - 0.24 * s, mat.velvet(c.cardigan))
    cardigan.scale.set(1.18, 1, 0.78)
    cardigan.position.set(0, hipY + torsoLen / 2 - 0.03 * s, -0.004)
    g.add(cardigan)
  }
  if (o.variant === 'ferrier') {
    const apron = mesh(geo(`apron|${s}`, () => new THREE.BoxGeometry(0.3 * s, torsoLen + 0.3 * s, 0.01)), mat.paper(c.apron), 0, hipY + torsoLen / 2 - 0.15 * s, 0.13 * s)
    g.add(apron)
  }
  if (o.variant === 'brace') {
    // Buttoned to the neck: a collar in the jersey colour
    g.add(mesh(geo('collar', () => new THREE.CylinderGeometry(0.07, 0.085, 0.06, 16)), jersey, 0, shoulderY + 0.05 * s, 0))
  }

  // Head pivot at the neck
  const head = new THREE.Group()
  head.name = 'head'
  head.position.set(0, shoulderY + 0.07 * s, 0)
  const face = mesh(headGeometry(), skin, 0, 0.12 * s, 0)
  face.scale.setScalar(s)
  head.add(face)
  const cap = mesh(geo('hairCap', () => new THREE.SphereGeometry(0.093, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair, 0, 0.14 * s, -0.008)
  cap.scale.set(s, s * 1.05, s)
  head.add(cap)
  if (o.variant === 'brace') head.add(mesh(geo('bun', () => new THREE.SphereGeometry(0.04, 14, 10)), hair, 0, 0.14 * s, -0.09 * s))
  if (o.variant === 'ida') for (const side of [-1, 1]) {
    const plait = capsule(0.018, 0.16, hair)
    plait.position.set(side * 0.085 * s, 0.02 * s, -0.02)
    head.add(plait)
  }
  if (o.variant === 'voss') for (const side of [-1, 1]) {
    const lock = capsule(0.02, 0.08, hair)
    lock.position.set(side * 0.09 * s, 0.06 * s, -0.03)
    head.add(lock)
  }
  if (o.variant === 'ferrier') {
    head.add(mesh(geo('capCrown', () => new THREE.CylinderGeometry(0.095, 0.1, 0.05, 20)), mat.velvet(c.trousers), 0, 0.2 * s, -0.01))
    head.add(mesh(geo('capPeak', () => new THREE.BoxGeometry(0.1, 0.01, 0.06)), mat.velvet(c.trousers), 0, 0.18 * s, 0.1 * s))
  }
  if (o.variant === 'tuck' && g.userData.hat) {
    const hat = g.userData.hat as THREE.Mesh
    hat.position.set(0, 0.2 * s, -0.01)
    head.add(hat)
    head.add(mesh(geo('souCrown', () => new THREE.SphereGeometry(0.095, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat.enamel(c.oilskin), 0, 0.2 * s, -0.01))
  }
  const eyes = new THREE.Group()
  eyes.name = 'eyes'
  const eye = geo('eye', () => new THREE.CircleGeometry(0.008, 12))
  const ink = mat.flat('#2B2620')
  eyes.add(mesh(eye, ink, -0.03 * s, 0.13 * s, 0.084 * s))
  eyes.add(mesh(eye, ink, 0.03 * s, 0.13 * s, 0.084 * s))
  head.add(eyes)
  g.add(head)

  return g
}

/** Turns the head `degrees` toward the camera over `ms` (bible §11: 8 degrees, 400 ms) and back with the same call. */
export function turnHead(fig: THREE.Object3D, degrees: number, ms = 400): Promise<void> {
  const head = fig.getObjectByName('head')
  if (!head) return Promise.resolve()
  const from = head.rotation.y
  const to = THREE.MathUtils.degToRad(degrees)
  return clock.tween(ms, (k) => { head.rotation.y = from + (to - from) * k }, ease.inOutCubic)
}

/** One blink: the eyes close and open over 120 ms. */
export async function blink(fig: THREE.Object3D): Promise<void> {
  const eyes = fig.getObjectByName('eyes')
  if (!eyes) return
  await clock.tween(60, (k) => { eyes.scale.y = 1 - 0.9 * k }, ease.outCubic)
  await clock.tween(60, (k) => { eyes.scale.y = 0.1 + 0.9 * k }, ease.outCubic)
}
