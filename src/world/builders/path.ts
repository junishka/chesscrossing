// Frame O2: The Path to the Point (bible §7, §3.3, §12 EE-22 and EE-23, §14.2). A 1:10 miniature built in
// local space with the origin at the path's midpoint: the crushed-shell path runs along x, the pine windbreak
// stands behind it (−z), the sea beyond the pines, a painted sky at the back. The camera (def.camera) is
// 4 m off the path at y 1.4, square to it, and dollies along x; the path sits on a turf terrace so a level
// camera keeps it in the lower third of the frame. No shadow maps outdoors: every object stands on a painted
// contact disc. Nothing moves on hover; only the sea's foam drifts (group.userData.tick).
import * as THREE from 'three'
import type { HotspotDef } from '../../types'
import { mat } from '../../scene/materials'
import { placard, tag } from '../../scene/text3d'
import { tokens } from '../../content/palette'
import { dressing } from '../../content/frames/path'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { tent as tentProp } from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

// ───────────────────────────── Dimensions (metres, 1:10) ─────────────────────────────

/** Height of the turf terrace the path lies on (the camera stands on the lower shore, 1.4 m up). */
const TERRACE = 0.95
/** The path: 31 m long along x, 1.2 m wide, dead straight. */
const PATH_LEN = dressing.path.length
const PATH_W = 1.2
/** Survey stones stand on the far side of the path, signposts on the near (camera) side. */
const STONE_Z = -0.95
const SIGN_Z = 0.95
/** The two staggered rows of the windbreak. */
const PINE_ROWS = [-3.9, -5.1] as const
const PINE_PITCH = 1.3
const PINE_REACH = 21
/** Where the turf ends in a low rock edge and the sea begins. */
const SHORE_Z = -7.6
const SEA_DROP = 0.55
/** Contact discs: a dark translucent circle under everything that stands on the turf. */
const DISC_ALPHA = 0.26

// ───────────────────────────── Colour helpers (palette values only) ─────────────────────────────

type Rgb = [number, number, number]

function parse(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function toHex(c: Rgb): string {
  return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** Linear mix of two palette hexes: `k` = 0 gives `a`, 1 gives `b`. */
function mix(a: string, b: string, k: number): string {
  const pa = parse(a), pb = parse(b)
  return toHex([pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k])
}

/** A palette hex scaled in value (0.99 = one percent darker). */
function shade(hex: string, k: number): string {
  const p = parse(hex)
  return toHex([p[0] * k, p[1] * k, p[2] * k])
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

// ───────────────────────────── Canvas textures ─────────────────────────────

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  paint(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

/** Khaki turf: a soft mottle and thousands of short brush ticks (2 mm at 1:1, painted a little larger). One tile = 2 m. */
function turfTexture(turf: string, ink: string, paper: string, rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = turf
    ctx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 90; i++) {
      const r = 30 + rnd() * 70
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      const dark = rnd() < 0.5
      g.addColorStop(0, rgba(dark ? ink : paper, 0.09))
      g.addColorStop(1, rgba(dark ? ink : paper, 0))
      ctx.save()
      ctx.translate(rnd() * 512, rnd() * 512)
      ctx.fillStyle = g
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.restore()
    }
    for (let i = 0; i < 7000; i++) {
      const x = rnd() * 512, y = rnd() * 512
      const len = 3 + rnd() * 7
      const lean = (rnd() - 0.5) * 0.6
      const dark = rnd() < 0.55
      ctx.lineWidth = 1 + (rnd() < 0.3 ? 1 : 0)
      ctx.strokeStyle = rgba(dark ? ink : paper, dark ? 0.26 : 0.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + lean * len, y - len)
      ctx.stroke()
    }
  })
}

/** Crushed shell: a fine speckle over the path colour, a darker kerb line along both edges. One tile = 1.2 m along the path. */
function shellTexture(path: string, ink: string, paper: string, rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = path
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * 256, y = rnd() * 256
      const light = rnd() < 0.6
      ctx.fillStyle = rgba(light ? paper : ink, light ? 0.7 : 0.3)
      ctx.fillRect(x, y, 1 + (rnd() < 0.35 ? 1 : 0), 1 + (rnd() < 0.2 ? 1 : 0))
    }
    ctx.fillStyle = rgba(ink, 0.18)
    ctx.fillRect(0, 0, 256, 3)
    ctx.fillRect(0, 253, 256, 3)
  })
}

/** Slate sea with painted foam lines: short horizontal strokes, denser toward the near edge (the bottom of the tile). */
function seaTexture(sea: string, foam: string, rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = sea
    ctx.fillRect(0, 0, 1024, 256)
    ctx.lineCap = 'round'
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 1024, y = rnd() * 256
      const len = 30 + rnd() * 150
      const w = 1.5 + rnd() * 2.5
      ctx.lineWidth = w
      ctx.strokeStyle = rgba(foam, 0.35 + rnd() * 0.45)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.bezierCurveTo(x + len * 0.3, y - 1.5 + rnd() * 3, x + len * 0.7, y + 1.5 - rnd() * 3, x + len, y)
      ctx.stroke()
      if (x + len > 1024) {
        ctx.beginPath()
        ctx.moveTo(x - 1024, y)
        ctx.lineTo(x - 1024 + len, y)
        ctx.stroke()
      }
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rgba(foam, 0.12 + rnd() * 0.2)
      ctx.fillRect(rnd() * 1024, rnd() * 256, 2 + rnd() * 5, 1)
    }
  })
}

/** The painted sky: flat, one percent darker at the top. */
function skyTexture(sky: string): THREE.CanvasTexture {
  const tex = canvasTexture(8, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, shade(sky, 0.99))
    g.addColorStop(1, sky)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 256)
  })
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ───────────────────────────── Small geometry ─────────────────────────────

/** A standing survey stone: a tapered slab with a rounded crown, flat facets, origin at its base. */
function stoneGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-0.07, 0)
  s.lineTo(0.07, 0)
  s.lineTo(0.062, 0.17)
  s.lineTo(0.04, 0.235)
  s.lineTo(0.0, 0.25)
  s.lineTo(-0.045, 0.232)
  s.lineTo(-0.065, 0.16)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1 })
  g.translate(0, 0, -0.0375)
  return g
}

/** A stone the newer hand cut in 1957: square shoulders, sharper edges, a little wider. */
function squareStoneGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.15, 0.25, 0.08)
  g.translate(0, 0.125, 0)
  return g
}

/** A windbreak pine: two flat cones stacked, the upper one narrower, as one unit-height geometry (base at y = 0). */
function pineGeometry(): THREE.BufferGeometry {
  const lower = new THREE.ConeGeometry(1, 0.72, 7, 1)
  lower.translate(0, 0.36, 0)
  const upper = new THREE.ConeGeometry(0.66, 0.5, 7, 1)
  upper.translate(0, 0.75, 0)
  const merged = mergeGeometries([lower, upper], false)
  if (!merged) throw new Error('pine geometry')
  return merged
}

function disc(radius: number, material: THREE.Material, x: number, z: number, y = TERRACE + 0.004): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y, z)
  m.renderOrder = 1
  return m
}

/** A contact disc, stretched along x for long objects. */
function ovalDisc(rx: number, rz: number, material: THREE.Material, x: number, z: number, y = TERRACE + 0.004): THREE.Mesh {
  const m = disc(1, material, x, z, y)
  m.scale.set(rx, rz, 1)
  return m
}

// ───────────────────────────── The tableau ─────────────────────────────

/** Builds Frame O2, the Path to the Point, as a 1:10 miniature in local space. */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const rnd = ctx.rnd
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const hotspotById = new Map<string, HotspotDef>(ctx.def.hotspots.map((h) => [h.id, h]))

  const turf = tokens['out.turf']
  const rock = tokens['out.rock']
  const sea = tokens['out.sea']
  const foam = tokens['out.foam']
  const sky = tokens['out.sky']
  const oilskin = tokens['out.oilskin']
  const pine = tokens['out.pine']
  const shell = tokens['out.path']
  const ink = tokens['out.ink']
  const paper = p.paper

  const discMaterial = new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: DISC_ALPHA, depthWrite: false })
  const register = (id: string, object: THREE.Object3D): void => {
    if (!hotspotById.has(id)) return
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }

  // ── Sky, sea and shore ──
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(700, 320), new THREE.MeshBasicMaterial({ map: skyTexture(sky) }))
  skyPlane.position.set(0, 100, -160)
  skyPlane.name = 'sky'
  group.add(skyPlane)

  const seaMap = seaTexture(sea, foam, rnd)
  seaMap.repeat.set(24, 48)
  const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(700, 220), new THREE.MeshStandardMaterial({ map: seaMap, roughness: 0.85, metalness: 0 }))
  seaPlane.rotation.x = -Math.PI / 2
  seaPlane.position.set(0, TERRACE - SEA_DROP, SHORE_Z - 110)
  seaPlane.name = 'sea'
  group.add(seaPlane)

  // The turf terrace and, out of frame, the lower shore the camera stands on
  const turfMap = turfTexture(turf, ink, paper, rnd)
  const turfMaterial = new THREE.MeshStandardMaterial({ map: turfMap, roughness: 0.95, metalness: 0 })
  const terraceDepth = 2.6 - SHORE_Z
  const terrace = new THREE.Mesh(new THREE.PlaneGeometry(90, terraceDepth), turfMaterial.clone())
  ;(terrace.material as THREE.MeshStandardMaterial).map = turfMap.clone()
  ;(terrace.material as THREE.MeshStandardMaterial).map!.repeat.set(45, terraceDepth / 2)
  terrace.rotation.x = -Math.PI / 2
  terrace.position.set(0, TERRACE, (2.6 + SHORE_Z) / 2)
  terrace.name = 'turf'
  group.add(terrace)

  const bank = new THREE.Mesh(new THREE.PlaneGeometry(90, Math.hypot(2.0, TERRACE)), turfMaterial)
  turfMap.repeat.set(45, 1.1)
  bank.rotation.x = -Math.PI / 2 + Math.atan2(TERRACE, 2.0)
  bank.position.set(0, TERRACE / 2, 2.6 + 1.0)
  group.add(bank)

  const shore = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), new THREE.MeshStandardMaterial({ color: mix(turf, rock, 0.35), roughness: 1, metalness: 0 }))
  shore.rotation.x = -Math.PI / 2
  shore.position.set(0, 0, 4.6 + 7)
  group.add(shore)

  // The rock edge where the turf drops to the sea: flat lichened facets
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: rock, roughness: 0.95, metalness: 0, flatShading: true })
  const edge = new THREE.Mesh(new THREE.BoxGeometry(90, SEA_DROP + 0.15, 0.9, 60, 1, 1), edgeMaterial)
  const pos = edge.geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) continue
    pos.setY(i, pos.getY(i) - rnd() * 0.1)
    pos.setZ(i, pos.getZ(i) + (rnd() - 0.5) * 0.12)
  }
  edge.geometry.computeVertexNormals()
  edge.position.set(0, TERRACE - SEA_DROP - 0.15 + (SEA_DROP + 0.15) / 2, SHORE_Z - 0.45)
  group.add(edge)

  // ── The path ──
  const shellMap = shellTexture(shell, ink, paper, rnd)
  shellMap.repeat.set(PATH_LEN / PATH_W, 1)
  const pathMesh = new THREE.Mesh(new THREE.BoxGeometry(PATH_LEN, 0.012, PATH_W), new THREE.MeshStandardMaterial({ map: shellMap, roughness: 0.9, metalness: 0 }))
  pathMesh.position.set(0, TERRACE + 0.006, 0)
  pathMesh.name = 'path'
  group.add(pathMesh)
  register('path.ahead', pathMesh)

  // ── The pine windbreak: two staggered rows of flat cones, mirrored about x = 0 ──
  const pineMaterial = new THREE.MeshStandardMaterial({ color: pine, roughness: 0.92, metalness: 0, flatShading: true })
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: mix(ink, rock, 0.4), roughness: 0.9, metalness: 0 })
  const half: { x: number; z: number; h: number; turn: number }[] = []
  PINE_ROWS.forEach((z, row) => {
    for (let x = row === 0 ? 0 : PINE_PITCH / 2; x <= PINE_REACH; x += PINE_PITCH) {
      half.push({ x: x + (rnd() - 0.5) * 0.2, z: z + (rnd() - 0.5) * 0.3, h: 0.8 + rnd() * 0.6, turn: rnd() * Math.PI })
    }
  })
  const pines = half.flatMap((t) => (t.x < PINE_PITCH / 4 ? [t] : [t, { ...t, x: -t.x }]))
  const coneGeometry = pineGeometry()
  const cones = new THREE.InstancedMesh(coneGeometry, pineMaterial, pines.length)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.045, 0.16, 6), trunkMaterial, pines.length)
  const pineDiscs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), discMaterial, pines.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  pines.forEach((t, i) => {
    const r = t.h * 0.26
    q.setFromEuler(new THREE.Euler(0, t.turn, 0))
    m4.compose(new THREE.Vector3(t.x, TERRACE + 0.1, t.z), q, new THREE.Vector3(r, t.h, r))
    cones.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(t.x, TERRACE + 0.08, t.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
    trunks.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(t.x, TERRACE + 0.003, t.z), flat, new THREE.Vector3(r * 1.05, r * 1.05, 1))
    pineDiscs.setMatrixAt(i, m4)
  })
  cones.name = 'pines'
  pineDiscs.renderOrder = 1
  group.add(cones, trunks, pineDiscs)

  // ── Survey stones S-1 … S-9, every 3.4 m on the far side; S-6 the flaw ──
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: rock, roughness: 0.95, metalness: 0, flatShading: true })
  const newStoneMaterial = new THREE.MeshStandardMaterial({ color: mix(rock, paper, 0.22), roughness: 0.8, metalness: 0, flatShading: true })
  const oldStone = stoneGeometry()
  const newStone = squareStoneGeometry()
  const stoneDiscs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), discMaterial, dressing.stones.length)
  stoneDiscs.renderOrder = 1
  dressing.stones.forEach((s, i) => {
    const flaw = s.year !== 1931
    const g = new THREE.Group()
    g.name = `stone:${s.id}`
    g.position.set(s.x, TERRACE, STONE_Z)
    const body = new THREE.Mesh(flaw ? newStone : oldStone, flaw ? newStoneMaterial : stoneMaterial)
    if (!flaw) body.rotation.y = (rnd() - 0.5) * 0.12
    g.add(body)
    // The painted figures: the founder's letterspaced capitals, or the 1957 hand (typed, a size larger, a little crooked)
    const face = placard({
      lines: [s.id, String(s.year)],
      width: flaw ? 0.13 : 0.105,
      height: flaw ? 0.15 : 0.14,
      bg: flaw ? mix(rock, paper, 0.22) : rock,
      color: flaw ? paper : mix(paper, shell, 0.3),
      font: flaw ? 'mono' : 'sans',
    })
    face.position.set(0, flaw ? 0.125 : 0.12, (flaw ? 0.04 : 0.0375) + 0.0015)
    if (flaw) face.rotation.z = 0.04
    g.add(face)
    m4.compose(new THREE.Vector3(s.x, TERRACE + 0.004, STONE_Z), flat, new THREE.Vector3(flaw ? 0.13 : 0.12, 0.09, 1))
    stoneDiscs.setMatrixAt(i, m4)
    group.add(g)
    register(`path.stone.${s.id.toLowerCase().replace('-', '')}`, g)
  })
  group.add(stoneDiscs)

  // ── Signposts on the near side: oilskin-painted boards on posts, lettered in ink ──
  const postMaterial = mat.lacquer(oilskin)
  const boardMaterial = mat.flat(oilskin)
  for (const post of dressing.signposts) {
    const g = new THREE.Group()
    g.name = `signpost:${post.id}`
    g.position.set(post.x, TERRACE, SIGN_Z)
    const long = post.text.includes('·')
    const lines = long ? post.text.split(' · ').map((l, i) => (i === 0 ? `${l} ·` : l)) : [post.text]
    const w = long ? 0.8 : 0.16 + post.text.length * 0.031
    const h = long ? 0.27 : 0.16
    const postH = 0.58
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, postH, 10), postMaterial)
    pole.position.set(0, postH / 2, 0)
    g.add(pole)
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.025, 12), postMaterial)
    foot.position.set(0, 0.0125, 0)
    g.add(foot)
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.022), boardMaterial)
    board.position.set(0, postH + h / 2 - 0.02, 0)
    g.add(board)
    const face = placard({ lines, width: w, height: h, bg: oilskin, color: ink, border: ink })
    face.position.set(0, postH + h / 2 - 0.02, 0.0115)
    g.add(face)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), mat.brass())
    finial.position.set(0, postH + h + 0.0, 0)
    g.add(finial)
    g.add(disc(0.075, discMaterial, 0, 0, 0.004))
    group.add(g)
    register(`path.post.${post.id}`, g)
  }

  // ── Gateposts at either end of the path: the way on to the Point (+x) and back to the jetty (−x) ──
  const gateMaterial = mat.flat(paper)
  for (const sx of [-1, 1] as const) {
    const g = new THREE.Group()
    g.name = sx > 0 ? 'gate:point' : 'gate:jetty'
    g.position.set(sx * (PATH_LEN / 2 + 0.25), TERRACE, 0)
    for (const sz of [-1, 1]) {
      const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), gateMaterial)
      postMesh.position.set(0, 0.21, sz * (PATH_W / 2 + 0.06))
      g.add(postMesh)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.05, 4), gateMaterial)
      cap.rotation.y = Math.PI / 4
      cap.position.set(0, 0.445, sz * (PATH_W / 2 + 0.06))
      g.add(cap)
      g.add(disc(0.07, discMaterial, 0, sz * (PATH_W / 2 + 0.06), 0.004))
    }
    group.add(g)
    register(sx > 0 ? 'path.door.point' : 'path.door.jetty', g)
  }

  // ── The tent, khaki, near S-7: Voss's, not struck (EE-22) ──
  const tentGroup = new THREE.Group()
  tentGroup.name = 'tent'
  const s7 = dressing.stones.find((s) => s.id === 'S-7')
  const tentX = (s7?.x ?? 6.8) + 0.9
  const tentZ = -1.55
  tentGroup.position.set(tentX, TERRACE, tentZ)
  const canvas = tentProp({ colors: p, seed: 'voss', width: 2.2, depth: 2.6, height: 1.8, canvas: oilskin, stripe: oilskin })
  // Inside, through the open flap: a folded blanket, a tin, a chess book open at the Ruy Lopez (prop units, scaled with the tent)
  const blanket = new THREE.Group()
  const wool = mat.felt(tokens['hs.textile'])
  for (let i = 0; i < 3; i++) {
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.62 - i * 0.03, 0.11, 0.46 - i * 0.02), wool)
    fold.position.set(0, 0.055 + i * 0.11, 0)
    blanket.add(fold)
  }
  blanket.position.set(0.45, 0, -0.45)
  canvas.add(blanket)
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.15, 14), mat.steel())
  tin.position.set(0.78, 0.075, 0.25)
  canvas.add(tin)
  const tinLid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 14), mat.brass())
  tinLid.position.set(0.78, 0.16, 0.25)
  canvas.add(tinLid)
  const book = new THREE.Group()
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.28), mat.lacquer(sea))
  cover.position.set(0, 0.0125, 0)
  book.add(cover)
  const pageL = placard({ lines: ['A. RUY LOPEZ.', '1. e4 e5 2. Nf3', 'Nc6 3. Bb5'], width: 0.2, height: 0.26, bg: paper, color: ink, font: 'mono' })
  pageL.rotation.x = -Math.PI / 2
  pageL.position.set(-0.105, 0.026, 0)
  book.add(pageL)
  const pageR = placard({ lines: ['RUY LOPEZ'], width: 0.2, height: 0.26, bg: paper, color: ink, font: 'mono' })
  pageR.rotation.x = -Math.PI / 2
  pageR.position.set(0.105, 0.026, 0)
  book.add(pageR)
  book.position.set(0.42, 0, 0.55)
  book.rotation.y = -0.35
  canvas.add(book)
  canvas.scale.setScalar(0.1)
  tentGroup.add(canvas)
  // The luggage tag on the front pole, typed: the index tag and the caption
  const label = tag('HS-0914\nVoss. Not struck.', { color: paper, ink })
  label.scale.setScalar(1.35)
  label.position.set(0.035, 0.17, 0.155)
  label.rotation.y = 0.15
  tentGroup.add(label)
  tentGroup.add(ovalDisc(0.2, 0.19, discMaterial, 0, 0, 0.002))
  group.add(tentGroup)
  register('path.tent', tentGroup)

  // ── The station house, a separate 1:10 miniature on the left horizon ──
  const house = new THREE.Group()
  house.name = 'house'
  house.position.set(-24, TERRACE, -6)
  const wallMaterial = mat.flat(tokens['hs.wall'])
  const roofMaterial = mat.flat(mix(ink, rock, 0.5))
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.5), edgeMaterial)
  base.position.set(0, 0.09, 0)
  house.add(base)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.26, 0.9), wallMaterial)
  body.position.set(0, 0.18 + 0.63, 0)
  house.add(body)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0), roofMaterial)
  roof.position.set(0, 0.18 + 1.29, 0)
  house.add(roof)
  const paneMaterial = mat.flat(paper)
  for (let floor = 0; floor < 3; floor++) for (let col = 0; col < 5; col++) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), paneMaterial)
    pane.position.set((col - 2) * 0.42, 0.18 + 0.28 + floor * 0.42, 0.451)
    house.add(pane)
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.34, 8), paneMaterial)
  lampRoom.position.set(0, 0.18 + 1.32 + 0.17, 0)
  house.add(lampRoom)
  const lampRoof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 8), roofMaterial)
  lampRoof.position.set(0, 0.18 + 1.66 + 0.1, 0)
  house.add(lampRoof)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: tokens['br.lampRed'], emissive: tokens['br.lampRed'], emissiveIntensity: 0.5, roughness: 0.8 }))
  lamp.position.set(0, 0.18 + 1.49, 0.2)
  house.add(lamp)
  house.add(ovalDisc(1.5, 1.0, discMaterial, 0, 0, 0.004))
  group.add(house)

  // ── Static matrices; no shadows outdoors; the sea drifts ──
  group.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = false
    if (o !== group) { o.updateMatrix(); o.matrixAutoUpdate = false }
  })
  group.userData.tick = (dt: number): void => {
    seaMap.offset.x = (seaMap.offset.x + dt * 0.004) % 1
    seaMap.offset.y = (seaMap.offset.y + dt * 0.0015) % 1
  }
  return out
}
