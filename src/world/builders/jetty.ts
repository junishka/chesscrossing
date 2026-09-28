// Frame O1: The Jetty (bible §7 O1, §3.3, §14.2). A 1:10 miniature: the jetty runs from the camera at the
// landward end toward −z, bollards in pairs converging on the horizon at the frame's centre, sea either side,
// the Tide Warden on his box at the seaward end facing us. The third bollard on the left has no cap: the flaw.
// Outdoors there are no shadow maps; every object stands on a painted contact disc.
import * as THREE from 'three'
import { tokens } from '../../content/palette'
import { dressing } from '../../content/frames/jetty'
import { figure } from '../figures'
import { boat } from '../props'
import { labelTexture, mat, seeded } from '../../scene/materials'
import { placard } from '../../scene/text3d'
import type { BuildContext, BuiltFrame } from '../frames'

// ───────────────────────────── Datum ─────────────────────────────

/** Top of the jetty deck and of the island turf, above the frame origin. The camera stands 0.2 m over it. */
const DECK_Y = 1.01
/** The turf at the landward end. */
const TURF_Y = 1.0
/** The painted sea. */
const SEA_Y = 0.85
/** The jetty at 1:10: forty yards long, six feet wide. */
const JETTY = { length: dressing.length, width: 0.6, thickness: 0.04 } as const
/** Bollard pairs every 0.46 m from the landward end. */
const BOLLARD_PITCH = 0.46
/** Half the deck width less the bollard's radius: the bollards stand on the deck's edge. */
const BOLLARD_X = 0.28
/** Where the outside things stand at the landward end, either side of the jetty. */
const SHORE = { x: 0.44, z: -1.3 } as const
/** The house miniature on the left horizon and the skerry that answers it on the right. */
const HORIZON = { x: 3.9, z: -12, rockTop: 1.2 } as const

// ───────────────────────────── Local helpers ─────────────────────────────

const geometries = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometries.get(key)
  if (hit) return hit as T
  const g = make()
  geometries.set(key, g)
  return g
}

const boxGeo = (w: number, h: number, d: number): THREE.BoxGeometry => geo(`box:${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d))
const cylGeo = (rt: number, rb: number, h: number, seg = 12): THREE.CylinderGeometry => geo(`cyl:${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
const unitDisc = (): THREE.CircleGeometry => geo('disc', () => new THREE.CircleGeometry(1, 24))

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m)
  me.position.set(x, y, z)
  me.castShadow = false
  me.receiveShadow = false
  return me
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(boxGeo(w, h, d), m, x, y, z)
}

const localMaterials = new Map<string, THREE.Material>()
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = localMaterials.get(key)
  if (hit) return hit as T
  const m = make()
  localMaterials.set(key, m)
  return m
}

/** A matte colour with flat facets (lichened granite, the pines). */
function faceted(color: string): THREE.MeshStandardMaterial {
  return memo(`faceted:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true }))
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function texture(c: HTMLCanvasElement, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  return tex
}

/** A palette hex with an alpha, for brush ticks and foam lines painted over a base colour. */
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Short brush strokes in `color` over the canvas, `count` of them, `len` px long, along `angle`, with a wobble. */
function ticks(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, o: { color: string; count: number; len: number; width: number; angle: number; wobble: number }): void {
  ctx.strokeStyle = o.color
  ctx.lineWidth = o.width
  ctx.lineCap = 'round'
  for (let i = 0; i < o.count; i++) {
    const x = rnd() * w, y = rnd() * h
    const a = o.angle + (rnd() - 0.5) * o.wobble
    const l = o.len * (0.6 + rnd() * 0.8)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
}

// ───────────────────────────── Painted surfaces ─────────────────────────────

/** Slate sea: the base colour under broad horizontal brush ticks, foam lines painted in `out.foam`. Tileable by margin. */
function seaMaterial(): THREE.MeshStandardMaterial {
  return memo('sea', () => {
    const size = 512
    const [c, ctx] = canvas(size, size)
    const rnd = seeded('jetty:sea')
    ctx.fillStyle = tokens['out.sea']
    ctx.fillRect(0, 0, size, size)
    ticks(ctx, size, size, rnd, { color: tint(tokens['out.ink'], 0.07), count: 700, len: 46, width: 3, angle: 0, wobble: 0.08 })
    ticks(ctx, size, size, rnd, { color: tint(tokens['out.foam'], 0.06), count: 700, len: 40, width: 3, angle: 0, wobble: 0.08 })
    ticks(ctx, size, size, rnd, { color: tint(tokens['grid.channel'], 0.08), count: 300, len: 60, width: 4, angle: 0, wobble: 0.05 })
    // Foam lines: thin, slightly bowed, sparse, drawn inside a margin so the tile edges stay clean.
    ctx.strokeStyle = tint(tokens['out.foam'], 0.85)
    ctx.lineWidth = 1.6
    for (let i = 0; i < 46; i++) {
      const x = 24 + rnd() * (size - 120), y = 12 + rnd() * (size - 24)
      const l = 30 + rnd() * 70
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + l / 2, y - 2 - rnd() * 3, x + l, y + (rnd() - 0.5) * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = tint(tokens['out.foam'], 0.45)
    ctx.lineWidth = 1
    for (let i = 0; i < 60; i++) {
      const x = 16 + rnd() * (size - 80), y = rnd() * size
      const l = 14 + rnd() * 34
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + l, y + (rnd() - 0.5) * 1.5)
      ctx.stroke()
    }
    const map = texture(c, [88, 32])
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 })
  })
}

/** The flat painted sky, one percent darker at the top. */
function skyMaterial(): THREE.MeshBasicMaterial {
  return memo('sky', () => {
    const [c, ctx] = canvas(16, 256)
    ctx.fillStyle = tokens['out.sky']
    ctx.fillRect(0, 0, 16, 256)
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, tint(tokens['out.ink'], 0.02))
    g.addColorStop(1, tint(tokens['out.ink'], 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 16, 256)
    const map = texture(c)
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
    return new THREE.MeshBasicMaterial({ map })
  })
}

/** Short khaki turf with 2 mm brush ticks (at 1:10, still ticks). */
function turfMaterial(repeat: [number, number]): THREE.MeshStandardMaterial {
  return memo(`turf:${repeat.join(',')}`, () => {
    const size = 256
    const [c, ctx] = canvas(size, size)
    const rnd = seeded('jetty:turf')
    ctx.fillStyle = tokens['out.turf']
    ctx.fillRect(0, 0, size, size)
    ticks(ctx, size, size, rnd, { color: tint(tokens['out.pine'], 0.28), count: 1400, len: 6, width: 1.4, angle: -Math.PI / 2, wobble: 0.6 })
    ticks(ctx, size, size, rnd, { color: tint(tokens['out.path'], 0.22), count: 900, len: 5, width: 1.2, angle: -Math.PI / 2, wobble: 0.6 })
    ticks(ctx, size, size, rnd, { color: tint(tokens['out.ink'], 0.1), count: 300, len: 7, width: 1, angle: -Math.PI / 2, wobble: 0.5 })
    return new THREE.MeshStandardMaterial({ map: texture(c, repeat), roughness: 1, metalness: 0 })
  })
}

/** The deck: planks across the jetty with dark seams and end joints, brushed with the grain, on the timber base. */
function deckMaterial(p: BuildContext['region']): THREE.MeshStandardMaterial {
  return memo('deck', () => {
    const w = 256, h = 1024
    const [c, ctx] = canvas(w, h)
    const rnd = seeded('jetty:deck')
    ctx.fillStyle = p.wood
    ctx.fillRect(0, 0, w, h)
    const plank = Math.round((0.025 / JETTY.length) * h)
    for (let y = 0; y < h; y += plank) {
      const t = rnd()
      ctx.fillStyle = tint(t < 0.5 ? p.woodGrain : p.trim, 0.08 + rnd() * 0.16)
      ctx.fillRect(0, y, w, plank)
    }
    ticks(ctx, w, h, rnd, { color: tint(p.woodGrain, 0.18), count: 2600, len: 30, width: 1.2, angle: 0, wobble: 0.02 })
    ticks(ctx, w, h, rnd, { color: tint(p.trim, 0.1), count: 1200, len: 24, width: 1, angle: 0, wobble: 0.02 })
    ctx.fillStyle = tint(p.ink, 0.62)
    for (let y = 0; y < h; y += plank) {
      ctx.fillRect(0, y, w, 1)
      if (rnd() < 0.3) ctx.fillRect(Math.round(w * (0.3 + rnd() * 0.4)), y, 1, plank)
    }
    const map = texture(c)
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
    return new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0 })
  })
}

/** The painted contact disc: a soft dark circle laid under anything that stands outdoors. */
function discMaterial(): THREE.MeshBasicMaterial {
  return memo('disc', () => {
    const size = 64
    const [c, ctx] = canvas(size, size)
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, tint(tokens['out.ink'], 0.42))
    g.addColorStop(0.6, tint(tokens['out.ink'], 0.26))
    g.addColorStop(1, tint(tokens['out.ink'], 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  })
}

/** Weatherboarded timber for the house miniature: horizontal boards with a shadow line under each. */
function weatherboardMaterial(p: BuildContext['region']): THREE.MeshStandardMaterial {
  return memo('weatherboard', () => {
    const size = 256
    const [c, ctx] = canvas(size, size)
    const rnd = seeded('jetty:house')
    ctx.fillStyle = p.wood
    ctx.fillRect(0, 0, size, size)
    const board = 16
    for (let y = 0; y < size; y += board) {
      ctx.fillStyle = tint(p.trim, 0.04 + rnd() * 0.1)
      ctx.fillRect(0, y, size, board)
      ctx.fillStyle = tint(p.ink, 0.5)
      ctx.fillRect(0, y + board - 2, size, 2)
    }
    ticks(ctx, size, size, rnd, { color: tint(p.woodGrain, 0.2), count: 600, len: 26, width: 1, angle: 0, wobble: 0.02 })
    return new THREE.MeshStandardMaterial({ map: texture(c, [4, 3.5]), roughness: 0.85, metalness: 0 })
  })
}

/** A painted strip of letterspaced caps laid flat on a surface (yard numbers, tags). Faces +y; reads toward −z. */
function strip(text: string, width: number, height: number, bg: string, color: string): THREE.Mesh {
  const texW = Math.min(512, Math.max(64, 2 ** Math.round(Math.log2((width / height) * 64))))
  const map = labelTexture({ text, bg, color, width: texW, height: 64, letterSpacing: 0.08, weight: 600 })
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 })
  const me = mesh(new THREE.PlaneGeometry(width, height), m)
  me.rotation.x = -Math.PI / 2
  return me
}

/** A tiny inventory plate: `HS-####` in caps on paper, facing +z. */
function tagPlate(tag: string, p: BuildContext['region'], width = 0.05): THREE.Mesh {
  const plate = placard({ lines: [tag], width, height: width * 0.28, bg: p.paper, color: p.ink, border: p.ink })
  plate.receiveShadow = false
  return plate
}

// ───────────────────────────── Contact discs ─────────────────────────────

interface Disc { x: number; y: number; z: number; rx: number; rz: number }

/** One instanced mesh of every contact disc in the frame. */
function discs(list: Disc[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(unitDisc(), discMaterial(), list.length)
  im.name = 'contact-discs'
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  list.forEach((d, i) => {
    m.compose(new THREE.Vector3(d.x, d.y, d.z), q, new THREE.Vector3(d.rx, d.rz, 1))
    im.setMatrixAt(i, m)
  })
  im.instanceMatrix.needsUpdate = true
  im.renderOrder = 1
  im.frustumCulled = false
  return im
}

// ───────────────────────────── The jetty ─────────────────────────────

/** Deck, bollards in pairs (the flaw: the capless third on the left), yard numbers every five yards, the HS tag. */
function jetty(ctx: BuildContext, contacts: Disc[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'jetty'
  const { length: L, width: W, thickness: T } = JETTY

  const side = mat.flat(p.woodGrain)
  const deck = box(W, T, L, [side, side, deckMaterial(p), side, side, side], 0, DECK_Y - T / 2, -L / 2)
  g.add(deck)
  // Edge beams either side, a shade darker, so the deck reads as built rather than cut.
  for (const sx of [-1, 1]) g.add(box(0.03, T + 0.02, L, side, sx * (W / 2 - 0.015), DECK_Y - T / 2 - 0.01, -L / 2))

  // Bollards: posts for all sixteen, caps for fifteen.
  const pairs = dressing.bollards.pairs
  const postH = 0.075
  const posts = new THREE.InstancedMesh(cylGeo(0.013, 0.016, postH, 12), mat.flat(p.woodGrain), pairs * 2)
  posts.name = 'bollards'
  const capH = 0.014
  const capless = dressing.bollards.capless
  const caps = new THREE.InstancedMesh(cylGeo(0.021, 0.017, capH, 12), mat.enamel(p.accent), pairs * 2 - 1)
  caps.name = 'bollard-caps'
  const m = new THREE.Matrix4()
  let capIndex = 0
  for (let i = 0; i < pairs; i++) {
    const z = -(BOLLARD_PITCH / 2 + BOLLARD_PITCH * i)
    for (const hand of ['left', 'right'] as const) {
      const x = hand === 'left' ? -BOLLARD_X : BOLLARD_X
      const n = i * 2 + (hand === 'left' ? 0 : 1)
      posts.setMatrixAt(n, m.makeTranslation(x, DECK_Y + postH / 2, z))
      contacts.push({ x, y: DECK_Y + 0.0008, z, rx: 0.03, rz: 0.03 })
      if (hand === capless.side && i === capless.index) continue
      caps.setMatrixAt(capIndex++, m.makeTranslation(x, DECK_Y + postH + capH / 2, z))
    }
  }
  posts.instanceMatrix.needsUpdate = true
  caps.instanceMatrix.needsUpdate = true
  g.add(posts, caps)

  // Yard numbers every five yards, painted on the planks; forty sits just short of the end, clear of the box.
  const yards = 40
  for (let n = dressing.bollards.numberedEvery; n <= yards; n += dressing.bollards.numberedEvery) {
    const z = n === yards ? -(L - 0.26) : -(n / yards) * L
    const s = strip(String(n), 0.15, 0.075, p.trim, p.ink)
    s.position.set(0, DECK_Y + 0.0012, z)
    g.add(s)
  }
  const tag = strip('HS-0901', 0.1, 0.024, p.trim, p.ink)
  tag.position.set(0.17, DECK_Y + 0.0012, -1.32)
  g.add(tag)
  return g
}

// ───────────────────────────── The shore ─────────────────────────────

/** Turf at the landward end, with a lip of rock along its seaward edge and outcrops at the corners. */
function shore(ctx: BuildContext, contacts: Disc[], rocks: THREE.Matrix4[]): THREE.Group {
  const g = new THREE.Group()
  g.name = 'shore'
  const turf = mesh(new THREE.PlaneGeometry(9, 4.8), turfMaterial([18, 9.6]), 0, TURF_Y, 0.9)
  turf.rotation.x = -Math.PI / 2
  g.add(turf)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const rnd = seeded('jetty:rocks')
  const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number): void => {
    q.setFromEuler(new THREE.Euler(0, yaw, 0))
    rocks.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)))
  }
  // The lip along the seaward edge, mirrored across the jetty's axis.
  const lip: [number, number, number, number][] = [[0.52, 0.17, 0.12, 0.15], [0.95, 0.24, 0.14, 0.2], [1.5, 0.3, 0.15, 0.24], [2.2, 0.36, 0.16, 0.28], [3.1, 0.5, 0.18, 0.34], [4.2, 0.7, 0.2, 0.4]]
  for (const [x, sx, sy, sz] of lip) {
    const yaw = rnd() * Math.PI
    for (const s of [-1, 1]) place(s * x, TURF_Y - 0.02, -1.42, sx, sy, sz, s * yaw)
  }
  // Corner outcrops, sitting in the frame's lower corners.
  for (const s of [-1, 1]) {
    place(s * 0.82, TURF_Y - 0.02, -0.55, 0.26, 0.11, 0.2, s * 0.4)
    place(s * 1.25, TURF_Y - 0.02, -0.95, 0.2, 0.08, 0.16, s * 1.1)
    contacts.push({ x: s * 0.82, y: TURF_Y + 0.0008, z: -0.55, rx: 0.32, rz: 0.26 })
  }
  return g
}

/** The tide board: a painted board on two posts, chalked with today's water. Faces +z. */
function tideBoard(ctx: BuildContext, contacts: Disc[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'tide-board'
  const post = mat.flat(p.woodGrain)
  for (const s of [-1, 1]) {
    g.add(box(0.012, 0.36, 0.012, post, s * 0.12, TURF_Y + 0.18, 0))
    contacts.push({ x: SHORE.x + s * 0.12, y: TURF_Y + 0.0008, z: SHORE.z, rx: 0.022, rz: 0.022 })
  }
  const bw = 0.3, bh = 0.16
  const boardY = TURF_Y + 0.36
  g.add(box(bw, bh, 0.01, mat.flat(p.ink), 0, boardY, 0))
  const face = placard({
    lines: [dressing.tideBoard.heading, 'HIGH WATER 11:04', 'LOW WATER 17:20'],
    width: bw - 0.016, height: bh - 0.016, bg: p.ink, color: tokens['out.foam'], border: tokens['out.foam'],
  })
  face.receiveShadow = false
  face.position.set(0, boardY, 0.0055)
  g.add(face)
  const plate = tagPlate('HS-0905', p, 0.05)
  plate.position.set(0.12, TURF_Y + 0.25, 0.0065)
  g.add(plate)
  g.position.set(SHORE.x, 0, SHORE.z)
  return g
}

/** A fingerboard signpost pointing right, toward the path. Faces +z. */
function signpost(ctx: BuildContext, contacts: Disc[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'signpost'
  const postH = 0.44
  g.add(mesh(cylGeo(0.011, 0.013, postH, 10), mat.flat(p.ink), 0, TURF_Y + postH / 2, 0))
  const finial = mesh(geo('finial', () => new THREE.SphereGeometry(0.014, 12, 8)), mat.brass(), 0, TURF_Y + postH + 0.01, 0)
  g.add(finial)
  const bw = 0.2, bh = 0.056, depth = 0.01
  const shape = new THREE.Shape()
  shape.moveTo(-bw / 2, -bh / 2)
  shape.lineTo(bw / 2 - bh / 2, -bh / 2)
  shape.lineTo(bw / 2, 0)
  shape.lineTo(bw / 2 - bh / 2, bh / 2)
  shape.lineTo(-bw / 2, bh / 2)
  shape.closePath()
  const board = mesh(geo('fingerboard', () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })), mat.enamel(p.accent), bw / 2 - 0.012, TURF_Y + 0.36, -depth / 2)
  g.add(board)
  const face = placard({ lines: [ctx.def.hotspots.find((h) => h.id === 'jetty.door.path')?.label ?? 'THE PATH'], width: bw - 0.05, height: bh - 0.014, bg: p.accent, color: p.ink })
  face.receiveShadow = false
  face.position.set(bw / 2 - 0.012 - 0.012, TURF_Y + 0.36, depth / 2 + 0.0006)
  g.add(face)
  contacts.push({ x: -SHORE.x, y: TURF_Y + 0.0008, z: SHORE.z, rx: 0.028, rz: 0.028 })
  g.position.set(-SHORE.x, 0, SHORE.z)
  return g
}

// ───────────────────────────── The seaward end ─────────────────────────────

/** The Warden's box: a crate on the last planks, its tag on the front. */
function wardensBox(ctx: BuildContext, contacts: Disc[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'wardens-box'
  const size = 0.1, h = 0.05
  const timber = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'jetty:box', repeat: [1, 1] })
  g.add(box(size, h, size, timber, 0, DECK_Y + h / 2, 0))
  const band = mat.flat(p.woodGrain)
  for (const s of [-1, 1]) g.add(box(size + 0.002, 0.008, size + 0.002, band, 0, DECK_Y + h / 2 + s * (h / 2 - 0.008), 0))
  const plate = tagPlate('HS-0907', p, 0.04)
  plate.position.set(0, DECK_Y + h / 2, size / 2 + 0.0015)
  g.add(plate)
  contacts.push({ x: 0, y: DECK_Y + 0.0008, z: -(JETTY.length - 0.09), rx: 0.085, rz: 0.085 })
  g.position.set(0, 0, -(JETTY.length - 0.09))
  return g
}

/** Rowan Tuck in the oilskin, at 1:10, standing on the box and facing the camera. */
function warden(): THREE.Group {
  const fig = figure({ variant: 'tuck' })
  fig.scale.setScalar(0.1)
  fig.position.set(0, DECK_Y + 0.05, -(JETTY.length - 0.09))
  return fig
}

/** Tender No. 1, lying alongside the jetty's end on the right, its painter to the last bollard. */
function dinghy(ctx: BuildContext, contacts: Disc[]): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'mooring'
  const hull = boat({ colors: p, color: p.paper, seed: 'jetty:tender' })
  hull.scale.setScalar(0.1)
  hull.position.set(0, -0.012, 0)
  g.add(hull)
  const name = placard({ lines: ['TENDER No. 1'], width: 0.1, height: 0.02, bg: p.paper, color: p.ink })
  name.receiveShadow = false
  name.position.set(0.02, 0.028, 0.052)
  name.rotation.set(0, 0.06, 0)
  g.add(name)
  const at = new THREE.Vector3(0.58, SEA_Y, -(JETTY.length - 0.25))
  g.position.copy(at)
  contacts.push({ x: at.x, y: SEA_Y + 0.0008, z: at.z, rx: 0.2, rz: 0.09 })
  // The painter: from the last right bollard to the stern.
  const a = new THREE.Vector3(BOLLARD_X, DECK_Y + 0.06, -(BOLLARD_PITCH / 2 + BOLLARD_PITCH * (dressing.bollards.pairs - 1)))
  const b = new THREE.Vector3(at.x - 0.14, SEA_Y + 0.045, at.z)
  const mid = a.clone().lerp(b, 0.5).setY(Math.min(a.y, b.y) - 0.02)
  const curve = new THREE.CatmullRomCurve3([a, mid, b])
  const painter = mesh(new THREE.TubeGeometry(curve, 12, 0.003, 5, false), mat.flat(p.ink))
  painter.name = 'painter'
  return new THREE.Group().add(g, painter)
}

// ───────────────────────────── The horizon ─────────────────────────────

/** The station house at 1:10 on its headland: three storeys of weatherboard, a slate roof, the lamp room with its red lens. */
function house(ctx: BuildContext, contacts: Disc[], rocks: THREE.Matrix4[], out: BuiltFrame): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'station-house'
  const cx = -HORIZON.x, cz = HORIZON.z, top = HORIZON.rockTop

  // Headland: two rock masses and a turf slab.
  const q = new THREE.Quaternion()
  rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, SEA_Y, cz), q.setFromEuler(new THREE.Euler(0, 0.12, 0)), new THREE.Vector3(2.6, 0.36, 1.7)))
  rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx - 2.2, SEA_Y, cz + 0.6), q.setFromEuler(new THREE.Euler(0, -0.5, 0)), new THREE.Vector3(1.9, 0.28, 1.3)))
  rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + 1.6, SEA_Y, cz + 0.4), q.setFromEuler(new THREE.Euler(0, 0.9, 0)), new THREE.Vector3(1.1, 0.22, 0.9)))
  const slab = box(3.4, 0.06, 2.2, turfMaterial([18, 9.6]), cx - 0.3, top - 0.03, cz - 0.2)
  g.add(slab)

  const hw = dressing.houseMiniature.width, hd = 0.6, storey = 0.42, storeys = 3
  const hh = storey * storeys
  const body = box(hw, hh, hd, weatherboardMaterial(p), cx, top + hh / 2, cz)
  g.add(body)
  // Corner boards and the ground sill in the pale trim.
  const trim = mat.flat(p.trim)
  for (const s of [-1, 1]) g.add(box(0.03, hh, 0.03, trim, cx + s * (hw / 2), top + hh / 2, cz + hd / 2))
  g.add(box(hw + 0.06, 0.03, hd + 0.06, trim, cx, top + 0.015, cz))

  // Windows: two per room per storey on the front, sashes in ink within pale frames.
  const rooms = 3, perRoom = 2
  const count = rooms * perRoom * storeys
  const frames = new THREE.InstancedMesh(boxGeo(0.11, 0.17, 0.012), trim, count)
  const sashes = new THREE.InstancedMesh(boxGeo(0.084, 0.144, 0.012), mat.flat(p.ink), count)
  const mm = new THREE.Matrix4()
  let n = 0
  for (let f = 0; f < storeys; f++) {
    for (let r = 0; r < rooms; r++) {
      for (let w = 0; w < perRoom; w++) {
        const x = cx + (r - 1) * (hw / rooms) + (w - 0.5) * 0.3
        const y = top + f * storey + storey * 0.55
        frames.setMatrixAt(n, mm.makeTranslation(x, y, cz + hd / 2 + 0.004))
        sashes.setMatrixAt(n, mm.makeTranslation(x, y, cz + hd / 2 + 0.008))
        n++
      }
    }
  }
  frames.instanceMatrix.needsUpdate = true
  sashes.instanceMatrix.needsUpdate = true
  g.add(frames, sashes)
  // The house door, centre ground, in the accent, with its step.
  g.add(box(0.12, 0.24, 0.014, mat.enamel(p.accent), cx, top + 0.12, cz + hd / 2 + 0.004))
  g.add(box(0.2, 0.02, 0.08, trim, cx, top + 0.01, cz + hd / 2 + 0.04))

  // Roof: a slate prism along x with a small overhang.
  const rh = 0.3, overhang = 0.05
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-(hd / 2 + overhang), 0)
  roofShape.lineTo(hd / 2 + overhang, 0)
  roofShape.lineTo(0, rh)
  roofShape.closePath()
  const roofGeo = geo('roof', () => new THREE.ExtrudeGeometry(roofShape, { depth: hw + overhang * 2, bevelEnabled: false }))
  const roof = mesh(roofGeo, faceted(tokens['out.rock']), cx - (hw / 2 + overhang), top + hh, cz)
  roof.rotation.y = Math.PI / 2
  g.add(roof)
  // Gable ends in weatherboard.
  const gableGeo = geo('gable', () => new THREE.ShapeGeometry(roofShape))
  for (const s of [-1, 1]) {
    const gable = mesh(gableGeo, weatherboardMaterial(p), cx + s * (hw / 2 - 0.002), top + hh, cz)
    gable.rotation.y = s * Math.PI / 2
    g.add(gable)
  }

  // The lamp room on the ridge: an octagon of mullions on a floor disc under a cone, the red lens inside.
  const lamp = new THREE.Group()
  lamp.name = 'lamp-room'
  const ly = top + hh + rh
  const lr = 0.17, lh = 0.26
  lamp.add(mesh(cylGeo(lr + 0.03, lr + 0.03, 0.03, 8), trim, cx, ly + 0.015, cz))
  const mullions = new THREE.InstancedMesh(boxGeo(0.014, lh, 0.014), mat.flat(p.ink), 8)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    mullions.setMatrixAt(i, mm.makeTranslation(cx + Math.cos(a) * lr, ly + 0.03 + lh / 2, cz + Math.sin(a) * lr))
  }
  mullions.instanceMatrix.needsUpdate = true
  lamp.add(mullions)
  lamp.add(mesh(cylGeo(lr + 0.04, lr + 0.04, 0.02, 8), mat.flat(p.ink), cx, ly + 0.03 + lh + 0.01, cz))
  lamp.add(mesh(cylGeo(0.005, lr + 0.06, 0.16, 8), faceted(tokens['out.rock']), cx, ly + 0.03 + lh + 0.02 + 0.08, cz))
  lamp.add(mesh(geo('lampFinial', () => new THREE.SphereGeometry(0.02, 10, 8)), mat.brass(), cx, ly + 0.03 + lh + 0.19, cz))
  const lens = mesh(geo('lens', () => new THREE.SphereGeometry(0.045, 14, 10)), memo('lens', () => new THREE.MeshStandardMaterial({ color: tokens['grid.beacon'], emissive: tokens['grid.beacon'], emissiveIntensity: 1.6, roughness: 0.4, metalness: 0 })), cx, ly + 0.03 + lh / 2, cz)
  lamp.add(lens)
  g.add(lamp)
  lamp.userData.hotspot = 'jetty.door.lamproom'
  out.hotspots.set('jetty.door.lamproom', lamp)

  // The boathouse slipway at the headland's right, down into the sea.
  const slip = new THREE.Group()
  slip.name = 'slipway'
  const sx = cx + hw / 2 - 0.25, sz = cz + 1.45
  slip.add(box(0.4, 0.36, 0.08, trim, sx, top - 0.06, sz - 0.04))
  slip.add(box(0.34, 0.3, 0.06, mat.flat(p.ink), sx, top - 0.08, sz))
  const ramp = box(0.34, 0.03, 0.8, mat.flat(p.trim), sx, (top - 0.2 + SEA_Y) / 2, sz + 0.36)
  ramp.rotation.x = Math.atan2(top - 0.2 - SEA_Y, 0.8)
  slip.add(ramp)
  g.add(slip)
  slip.userData.hotspot = 'jetty.door.boathouse'
  out.hotspots.set('jetty.door.boathouse', slip)

  // The windbreak behind: flat conical pines.
  const pines = 8
  const pineMesh = new THREE.InstancedMesh(geo('pine', () => new THREE.ConeGeometry(0.16, 1, 7)), faceted(tokens['out.pine']), pines)
  const rnd = seeded('jetty:pines')
  for (let i = 0; i < pines; i++) {
    const x = cx - 1.5 + i * 0.43 + (rnd() - 0.5) * 0.1
    const h = 0.75 + rnd() * 0.35
    const z = cz - 0.95 - rnd() * 0.15
    pineMesh.setMatrixAt(i, mm.compose(new THREE.Vector3(x, top + h / 2, z), q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0)), new THREE.Vector3(1, h, 1)))
    contacts.push({ x, y: top + 0.0008, z, rx: 0.17, rz: 0.17 })
  }
  pineMesh.instanceMatrix.needsUpdate = true
  g.add(pineMesh)
  contacts.push({ x: cx, y: top + 0.0008, z: cz + 0.05, rx: hw * 0.62, rz: hd * 0.8 })
  return g
}

/** A low skerry on the right horizon with Tuck's thirteen cormorants in a row. */
function skerry(rocks: THREE.Matrix4[]): THREE.InstancedMesh {
  const cx = HORIZON.x, cz = HORIZON.z
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0))
  rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, SEA_Y, cz), q, new THREE.Vector3(1.2, 0.2, 0.7)))
  rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + 1.1, SEA_Y, cz + 0.3), q, new THREE.Vector3(0.6, 0.12, 0.45)))
  const birds = new THREE.InstancedMesh(geo('cormorant', () => new THREE.ConeGeometry(0.012, 0.05, 5)), mat.flat(tokens['out.ink']), 13)
  birds.name = 'cormorants'
  const rnd = seeded('jetty:cormorants')
  const m = new THREE.Matrix4()
  for (let i = 0; i < 13; i++) {
    const x = cx - 0.75 + i * 0.125
    const y = SEA_Y + 0.2 * (1 - Math.pow((x - cx) / 1.2, 2)) * 0.9 + 0.022
    m.makeTranslation(x, y, cz + (rnd() - 0.5) * 0.08)
    birds.setMatrixAt(i, m)
  }
  birds.instanceMatrix.needsUpdate = true
  return birds
}

/** Every rock in the frame, one faceted geometry instanced with its matrices. */
function rockMesh(rocks: THREE.Matrix4[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo('rock', () => new THREE.DodecahedronGeometry(1, 0)), faceted(tokens['out.rock']), rocks.length)
  im.name = 'rocks'
  rocks.forEach((m, i) => im.setMatrixAt(i, m))
  im.instanceMatrix.needsUpdate = true
  return im
}

/** The sea and the sky: two painted planes; the sea's texture drifts with the frame's tick. */
function seaAndSky(): { group: THREE.Group; sea: THREE.MeshStandardMaterial } {
  const g = new THREE.Group()
  g.name = 'sea-and-sky'
  const seaMat = seaMaterial()
  const sea = mesh(new THREE.PlaneGeometry(220, 80), seaMat, 0, SEA_Y, -36)
  sea.rotation.x = -Math.PI / 2
  sea.name = 'sea'
  g.add(sea)
  const sky = mesh(new THREE.PlaneGeometry(240, 70), skyMaterial(), 0, SEA_Y + 35 - 0.02, -76)
  sky.name = 'sky'
  g.add(sky)
  return { group: g, sea: seaMat }
}

// ───────────────────────────── Build ─────────────────────────────

/**
 * Builds Frame O1, The Jetty, in local space with the origin at the jetty's landward end. Registers every hotspot
 * of the frame definition: the jetty, the tide board, the Warden's box, the mooring, Tuck, and the three doors
 * (the signpost to the path; the lamp room and the slipway on the house miniature). `group.userData.tick(dt)`
 * drifts the sea.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const contacts: Disc[] = []
  const rocks: THREE.Matrix4[] = []

  const { group: backdrop, sea } = seaAndSky()
  group.add(backdrop)
  group.add(shore(ctx, contacts, rocks))

  const deck = jetty(ctx, contacts)
  deck.userData.hotspot = 'jetty.jetty'
  out.hotspots.set('jetty.jetty', deck)
  group.add(deck)

  const board = tideBoard(ctx, contacts)
  board.userData.hotspot = 'jetty.tideboard'
  out.hotspots.set('jetty.tideboard', board)
  group.add(board)

  const post = signpost(ctx, contacts)
  post.userData.hotspot = 'jetty.door.path'
  out.hotspots.set('jetty.door.path', post)
  group.add(post)

  const crate = wardensBox(ctx, contacts)
  crate.userData.hotspot = 'jetty.box'
  out.hotspots.set('jetty.box', crate)
  group.add(crate)

  const tuck = warden()
  tuck.userData.hotspot = 'jetty.tuck'
  out.hotspots.set('jetty.tuck', tuck)
  out.residentAnchor = tuck
  group.add(tuck)

  const tender = dinghy(ctx, contacts)
  tender.userData.hotspot = 'jetty.mooring'
  out.hotspots.set('jetty.mooring', tender)
  group.add(tender)

  group.add(house(ctx, contacts, rocks, out))
  group.add(skerry(rocks))
  group.add(rockMesh(rocks))
  group.add(discs(contacts))

  // No shadow maps outdoors: nothing casts, nothing receives; the discs carry the contact.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false }
  })

  const map = sea.map
  group.userData.tick = (dt: number): void => {
    if (map) map.offset.y = (map.offset.y + dt * 0.0025) % 1
  }
  return out
}
