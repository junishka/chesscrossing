// The chessmen: turned by the Keeper in 1931 and 1948. One lathe profile, six crowns (docs/BIBLE.md §5.2, §14.1).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Color, PieceType, Square } from '../types'
import { labelTexture, mat, seeded } from './materials'
import { sides, tokens } from '../content/palette'

// ───────────────────────────── Numbers (§5.2, §14.1) ─────────────────────────────

/** Overall heights in metres, crown included. The king is not taller than the queen. */
export const PIECE_HEIGHTS: Record<PieceType, number> = { k: 0.096, q: 0.096, b: 0.078, n: 0.07, r: 0.064, p: 0.048 }

/** Base diameters: 0.034, pawns 0.026. */
const BASE_DIAMETER: Record<PieceType, number> = { k: 0.034, q: 0.034, b: 0.034, n: 0.034, r: 0.034, p: 0.026 }

/** Height of the crown above the lathe's top platform; the lathe stops at height − crown. */
const CROWN_HEIGHT: Record<PieceType, number> = { k: 0.013, q: 0.021, b: 0.022, n: 0.017, r: 0.02, p: 0.0065 }

/** Circumference segments: 32, 24 for pawns. */
const SEGMENTS: Record<PieceType, number> = { k: 32, q: 32, b: 32, n: 32, r: 32, p: 24 }

const FELT_STEP = 0.004
const BRASS_STEP = 0.005
const COLLAR_TOP = FELT_STEP + BRASS_STEP
const WAIST_FRACTION = 0.4

const INK = tokens['br.ink']
const BRASS = tokens['br.brass']

// ───────────────────────────── Profile ─────────────────────────────

/**
 * The 20-point lathe profile for a piece type (x = radius, y = height, metres, from the base centre):
 * a tall cylinder with one waist at 40 percent of the piece's height and a flared foot, both collars
 * as steps (felt 0.004 at the foot, brass 0.005 above it), closed at the bottom and at the top platform
 * where the crown sits. Rows 0–2 are felt, 3–4 brass, 5 onward body.
 */
export function pieceProfile(type: PieceType): THREE.Vector2[] {
  const R = BASE_DIAMETER[type] / 2
  const H = PIECE_HEIGHTS[type]
  const top = H - CROWN_HEIGHT[type]
  const waist = WAIST_FRACTION * H
  const footTop = 0.018
  const L = (t: number) => waist + t * (top - waist)
  const p = (r: number, y: number) => new THREE.Vector2(r, y)
  return [
    p(0, 0),
    p(R, 0),
    p(R, FELT_STEP),
    p(R * 0.93, FELT_STEP),
    p(R * 0.93, COLLAR_TOP),
    p(R * 0.85, COLLAR_TOP),
    p(R * 0.82, COLLAR_TOP + 0.0025),
    p(R * 0.72, footTop),
    p(R * 0.62, (footTop + waist) / 2),
    p(R * 0.56, waist),
    p(R * 0.6, L(0.22)),
    p(R * 0.66, L(0.45)),
    p(R * 0.7, L(0.66)),
    p(R * 0.66, L(0.78)),
    p(R * 0.54, L(0.87)),
    p(R * 0.52, L(0.93)),
    p(R * 0.58, L(0.95)),
    p(R * 0.58, L(0.985)),
    p(R * 0.5, top),
    p(0, top),
  ]
}

/** Profile rows that belong to each material group (a row lies between point j and point j + 1). */
function groupOfRow(row: number): 0 | 1 | 2 {
  if (row <= 2) return 1 // felt: bottom cap, felt side, felt ledge
  if (row <= 4) return 2 // brass: side, ledge
  return 0 // body
}

/** Profile points duplicated so the steps and the top edge shade with a crisp corner. */
const SHARP = new Set([1, 2, 3, 4, 5, 16, 17, 18])

/**
 * Builds the lathe for a type: three's LatheGeometry over the profile (with the step corners
 * duplicated for hard shading), its index rewritten row by row so the felt, brass and body rows form
 * three contiguous material groups (0 body, 1 felt, 2 brass). Degenerate rows are dropped.
 */
function buildLathe(type: PieceType): THREE.LatheGeometry {
  const profile = pieceProfile(type)
  const expanded: THREE.Vector2[] = []
  const origin: number[] = []
  profile.forEach((pt, j) => {
    expanded.push(pt)
    origin.push(j)
    if (SHARP.has(j)) { expanded.push(pt.clone()); origin.push(j) }
  })
  const segments = SEGMENTS[type]
  const geometry = new THREE.LatheGeometry(expanded, segments)
  const n = expanded.length
  const rowsByGroup: number[][] = [[], [], []]
  for (let k = 0; k < n - 1; k++) {
    if (origin[k] === origin[k + 1]) continue
    rowsByGroup[groupOfRow(origin[k])].push(k)
  }
  const index: number[] = []
  geometry.clearGroups()
  for (let g = 0; g < 3; g++) {
    const start = index.length
    for (const k of rowsByGroup[g]) {
      // A cap row fans from the axis: one of its two triangles per segment is degenerate and is left out.
      const lowerOnAxis = expanded[k].x === 0
      const upperOnAxis = expanded[k + 1].x === 0
      for (let i = 0; i < segments; i++) {
        const a = k + i * n
        const b = a + n
        const c = b + 1
        const d = a + 1
        if (!lowerOnAxis) index.push(a, b, d)
        if (!upperOnAxis) index.push(c, d, b)
      }
    }
    geometry.addGroup(start, index.length - start, g)
  }
  geometry.setIndex(index)
  return geometry
}

// ───────────────────────────── Crowns ─────────────────────────────

interface CrownParts {
  /** Parts in the body's finish. */
  body?: THREE.BufferGeometry
  /** Parts in brass. */
  brass?: THREE.BufferGeometry
  /** Parts in felt (the king's disc). */
  felt?: THREE.BufferGeometry
  /** Parts in ink: saw-cuts and slots. */
  ink?: THREE.BufferGeometry
  /** The knight's head, kept separate so it can turn. */
  head?: THREE.BufferGeometry
}

function at(geometry: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  return geometry.translate(x, y, z)
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | undefined {
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  const out = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  return out ?? undefined
}

/** The crown for a type, built on the lathe's top platform at `top` with platform radius `r`. */
function buildCrown(type: PieceType, top: number, r: number, slot: boolean): CrownParts {
  const crown = CROWN_HEIGHT[type]
  switch (type) {
    case 'k': {
      // A flat felt disc 0.030 in the side's colour with a brass pin at the centre.
      const disc = at(new THREE.CylinderGeometry(0.015, 0.015, 0.003, 24), 0, top + 0.0015, 0)
      const pin = at(new THREE.CylinderGeometry(0.0012, 0.0012, crown - 0.003, 12), 0, top + 0.003 + (crown - 0.003) / 2, 0)
      const pinHead = at(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 12), 0, top + crown - 0.0006, 0)
      return { felt: disc, brass: merged([pin, pinHead]) }
    }
    case 'q': {
      // A turned sphere 0.022 with a 0.003 brass ring at its equator; told from the king by the ring.
      const centre = top + crown - 0.011
      const sphere = at(new THREE.SphereGeometry(0.011, 20, 12), 0, centre, 0)
      const ring = at(new THREE.CylinderGeometry(0.0118, 0.0118, 0.003, 24, 1, true), 0, centre, 0)
      return { body: sphere, brass: ring }
    }
    case 'b': {
      // A tapered cone with one horizontal saw-cut; the cut runs along the file and opens to +x.
      const cutY = top + crown * 0.55
      const kerf = 0.0012
      const rAt = (y: number) => THREE.MathUtils.lerp(r, 0.0022, (y - top) / crown)
      const lower = at(new THREE.CylinderGeometry(rAt(cutY - kerf / 2), r, cutY - kerf / 2 - top, 24), 0, (top + cutY - kerf / 2) / 2, 0)
      const upper = at(new THREE.CylinderGeometry(0.0022, rAt(cutY + kerf / 2), top + crown - (cutY + kerf / 2), 24), 0, (cutY + kerf / 2 + top + crown) / 2, 0)
      // The kerf: a dark core where the blade stopped, and an open sector on the +x side where it entered.
      const core = at(new THREE.CylinderGeometry(rAt(cutY) * 0.42, rAt(cutY) * 0.42, kerf, 16), 0, cutY, 0)
      const cut = at(new THREE.CylinderGeometry(rAt(cutY) + 0.00005, rAt(cutY) + 0.00005, kerf, 12, 1, true, Math.PI / 2 - 1.05, 2.1), 0, cutY, 0)
      return { body: merged([lower, upper]), ink: merged([core, cut]) }
    }
    case 'n': {
      // A smaller cylinder set off-axis at the top: a periscope head. Built at the origin and hung on the 'head' pivot.
      const head = at(new THREE.CylinderGeometry(0.0062, 0.0062, crown, 24), 0, crown / 2, 0.0052)
      return { head }
    }
    case 'r': {
      // A squat tapered tower, a brass band at two-thirds and one slot: a beacon, not a castle.
      const tower = at(new THREE.CylinderGeometry(r * 0.86, r, crown, 24), 0, top + crown / 2, 0)
      const band = at(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.002, 24, 1, true), 0, top + crown * (2 / 3), 0)
      const parts: CrownParts = { body: tower, brass: band }
      if (slot) parts.ink = at(new THREE.BoxGeometry(0.0022, 0.0035, r * 0.5), 0, top + crown - 0.0015, r * 0.66)
      return parts
    }
    case 'p': {
      // A plain dome; nothing on it but the collars.
      const dome = at(new THREE.SphereGeometry(r, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, top, 0)
      return { body: dome }
    }
  }
}

// ───────────────────────────── Caches ─────────────────────────────

interface PieceGeometry { lathe: THREE.LatheGeometry; crown: CrownParts; sleeve: THREE.CylinderGeometry; number: THREE.PlaneGeometry }

const geometries = new Map<string, PieceGeometry>()

function geometryFor(type: PieceType, slot: boolean): PieceGeometry {
  const key = `${type}:${slot ? 'slot' : 'plain'}`
  const hit = geometries.get(key)
  if (hit) return hit
  const R = BASE_DIAMETER[type] / 2
  const top = PIECE_HEIGHTS[type] - CROWN_HEIGHT[type]
  const built: PieceGeometry = {
    lathe: buildLathe(type),
    crown: buildCrown(type, top, R * 0.5, slot),
    sleeve: new THREE.CylinderGeometry(R * 0.93 + 0.00008, R * 0.93 + 0.00008, BRASS_STEP, SEGMENTS[type], 1, true),
    number: new THREE.PlaneGeometry(R * 1.3, R * 0.6),
  }
  geometries.set(key, built)
  return built
}

type Part = 'body' | 'felt' | 'brass' | 'ink'
const materials = new Map<string, THREE.Material>()

/** Materials cached per (colour, part): cream lacquer or waxed ebonised pear, the side's felt, brass, ink. */
function materialFor(color: Color, part: Part): THREE.Material {
  const key = `${color}:${part}`
  const hit = materials.get(key)
  if (hit) return hit
  let m: THREE.Material
  switch (part) {
    case 'body':
      if (color === 'w') {
        // Lime under cream lacquer: the clear coat is the second specular lobe.
        m = mat.lacquer(sides.w.body).clone()
        ;(m as THREE.MeshPhysicalMaterial).roughness = 0.42
        ;(m as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.18
      } else {
        // Ebonised pear, waxed: a low sheen, not a lacquer.
        m = mat.lacquer(sides.b.body).clone()
        const w = m as THREE.MeshPhysicalMaterial
        w.roughness = 0.5
        w.clearcoat = 0.35
        w.clearcoatRoughness = 0.32
        w.envMapIntensity = 0.3
      }
      break
    case 'felt':
      m = mat.felt(color === 'w' ? sides.w.felt : sides.b.felt)
      break
    case 'brass':
      m = mat.brass()
      break
    case 'ink':
      m = mat.flat(INK)
      break
  }
  materials.set(key, m)
  return m
}

const engravings = new Map<string, THREE.Material>()

/** The brass collar's engraving: the home square in ink, four times around, on a transparent sleeve. */
function engravingFor(home: Square | 'SPARE'): THREE.Material {
  const hit = engravings.get(home)
  if (hit) return hit
  const spare = home === 'SPARE'
  const one = labelTexture({ text: home, bg: 'rgba(0,0,0,0)', color: INK, width: 128, height: 64, padding: spare ? 6 : 12, uppercase: spare, letterSpacing: spare ? 0.12 : 0.02, weight: 500 })
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const img = one.image as HTMLCanvasElement
    for (let i = 0; i < 4; i++) ctx.drawImage(img, i * 128, 0)
  }
  one.dispose()
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  map.wrapS = THREE.RepeatWrapping
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.35, roughness: 0.6, metalness: 0.2, side: THREE.FrontSide })
  engravings.set(home, m)
  return m
}

const numbers = new Map<string, THREE.Material>()

/** The ink inventory number under the base, on a transparent plane. */
function numberFor(text: string): THREE.Material {
  const hit = numbers.get(text)
  if (hit) return hit
  const map = labelTexture({ text, bg: 'rgba(0,0,0,0)', color: INK, width: 128, height: 64, padding: 8, letterSpacing: 0.12, weight: 500 })
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.35, roughness: 0.9, metalness: 0 })
  numbers.set(text, m)
  return m
}

// ───────────────────────────── Public builders ─────────────────────────────

const TYPE_LETTER: Record<PieceType, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' }

/**
 * The inventory number inked under a base: side letter, hyphen, piece letter, and the piece's
 * 1-based ordinal among its kind when there is more than one (`W-K`, `B-R2`, `W-P5`). A spare takes
 * the next ordinal after the set (`W-Q2`).
 */
export function inventoryNumber(type: PieceType, color: Color, index: number): string {
  const side = color === 'w' ? 'W' : 'B'
  const letter = TYPE_LETTER[type]
  const single = (type === 'k' || type === 'q') && index <= 1
  return single ? `${side}-${letter}` : `${side}-${letter}${Math.max(1, Math.round(index))}`
}

/** Options for a build that the bible marks as an exception. */
export interface PieceOptions {
  /** Rooks only: false leaves the slot off (one spare rook has no slot). Default true. */
  slot?: boolean
  /** Ordinal among the side's pieces of this kind, for the inventory number. Default 1. */
  index?: number
}

/**
 * Builds one piece: a Group named 'piece' with `userData { type, color, home }`, origin at the base
 * centre, +y up. Children: 'lathe' (one LatheGeometry with three material groups: body, felt, brass),
 * 'collar' (the brass collar's engraving), 'number' (the ink inventory number under the base), the crown
 * parts, and for a knight a 'head' pivot at the top platform whose rotation.y turns the periscope
 * head (0 faces +z; a knight is built facing away from its own side). Casts and receives shadows.
 */
export function buildPiece(type: PieceType, color: Color, home: Square | 'SPARE', o: PieceOptions = {}): THREE.Group {
  const slot = o.slot ?? true
  const geo = geometryFor(type, slot)
  const group = new THREE.Group()
  group.name = 'piece'
  group.userData = { type, color, home }

  const lathe = new THREE.Mesh(geo.lathe, [materialFor(color, 'body'), materialFor(color, 'felt'), materialFor(color, 'brass')])
  lathe.name = 'lathe'
  lathe.castShadow = true
  lathe.receiveShadow = true
  group.add(lathe)

  const collar = new THREE.Mesh(geo.sleeve, engravingFor(home))
  collar.name = 'collar'
  collar.position.y = FELT_STEP + BRASS_STEP / 2
  collar.receiveShadow = true
  group.add(collar)

  const number = new THREE.Mesh(geo.number, numberFor(inventoryNumber(type, color, o.index ?? 1)))
  number.name = 'number'
  number.rotation.x = Math.PI / 2
  number.position.y = -0.0002
  group.add(number)

  const add = (g: THREE.BufferGeometry | undefined, part: Part, name: string, parent: THREE.Object3D = group) => {
    if (!g) return
    const mesh = new THREE.Mesh(g, materialFor(color, part))
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
  }
  add(geo.crown.body, 'body', 'crown')
  add(geo.crown.felt, 'felt', 'crown-felt')
  add(geo.crown.brass, 'brass', 'crown-brass')
  add(geo.crown.ink, 'ink', 'crown-ink')
  if (geo.crown.head) {
    const head = new THREE.Group()
    head.name = 'head'
    head.position.y = PIECE_HEIGHTS[type] - CROWN_HEIGHT[type]
    head.rotation.y = color === 'w' ? Math.PI : 0
    add(geo.crown.head, 'body', 'periscope', head)
    group.add(head)
  }
  return group
}

/**
 * A painted contact-shadow disc for outdoor and Chart use, where there are no shadow maps: a soft
 * dark disc of `radius`, lying flat at y 0 (name 'contact', multiply-blended, no depth write).
 * Scale it 1.4× at full lift.
 */
export function buildContactDisc(radius: number): THREE.Mesh {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const rnd = seeded('contact')
    const img = ctx.createImageData(size, size)
    const d = img.data
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size - 0.5
        const dy = (y + 0.5) / size - 0.5
        const r = Math.sqrt(dx * dx + dy * dy) * 2
        const soft = 1 - THREE.MathUtils.smoothstep(r, 0.55, 1)
        const grain = 0.96 + rnd() * 0.04
        const v = Math.round(255 * (1 - 0.55 * soft * grain))
        const i = (y * size + x) * 4
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map, blending: THREE.MultiplyBlending, depthWrite: false, transparent: true, toneMapped: false })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), material)
  mesh.name = 'contact'
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  return mesh
}

/** The brass collar's colour, for anything that must match it (the davit's jaws, the pins). */
export const COLLAR_BRASS = BRASS
