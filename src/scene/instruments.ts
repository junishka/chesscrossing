// The Board Room's instruments: the davit, the signal mast, THE RETURNED, the SPARES drawer, the
// tide gauge, the chronometer pair and the brass plates. Everything in metres, +y up, +z toward the
// player; every motion runs through clock.tween so slow motion applies. Numbers from
// docs/BIBLE.md §5.1, §5.5 to §5.8 and §14.1.
import * as THREE from 'three'
import type { ClockState, Color, PieceType, SfxName } from '../types'
import { bus } from '../core/bus'
import { clock, ease, type Easing } from '../core/clock'
import { palette, sides, squares, tokens } from '../content/palette'
import { labelTexture, mat, seeded } from './materials'
import { buildPiece } from './pieces'

// ───────────────────────────── Palette and shared helpers ─────────────────────────────

const room = palette.boardroom
const BRASS = tokens['br.brass']
const INK = tokens['br.ink']
const PAPER = tokens['hs.paper']
const PAPER_WHITE = tokens['paper.white']
const FELT = squares.dark
const EBONY = tokens['br.darkBody']
const LAMP_RED = tokens['br.lampRed']
const TEXTILE = tokens['hs.textile']
const WATER = tokens['out.sea']

function sfx(name: SfxName): void {
  bus.emit('audio:sfx', { name })
}

/** Constant velocity with a short hand-made ease at each end (40 ms in, 60 ms out at `ms` long). */
function handEase(ms: number, inMs = 40, outMs = 60): Easing {
  const total = Math.max(1, ms)
  let a = Math.min(0.5, inMs / total), b = Math.min(0.5, outMs / total)
  if (a + b > 1) { a = b = 0.5 }
  const v = 1 / (1 - (a + b) / 2)
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    if (t < a) return (v * t * t) / (2 * a)
    if (t <= 1 - b) return v * (a / 2 + (t - a))
    const r = 1 - t
    return 1 - (v * r * r) / (2 * b)
  }
}

/**
 * A tween runner that can be skipped: `skip()` jumps every running motion to its end state and
 * resolves it at once; while `skipping` is set, new motions complete immediately.
 */
class Motion {
  skipping = false
  private gen = 0
  private pending = new Set<() => void>()

  run(ms: number, fn: (k: number) => void, easing: Easing = ease.inOutCubic): Promise<void> {
    if (this.skipping) { fn(1); return Promise.resolve() }
    const gen = this.gen
    return new Promise((resolve) => {
      let done = false
      const finish = () => { if (done) return; done = true; this.pending.delete(jump); resolve() }
      const jump = () => { fn(1); finish() }
      this.pending.add(jump)
      void clock.tween(ms, (k) => { if (!done && gen === this.gen) fn(k) }, easing).then(finish)
    })
  }

  skip(): void {
    this.gen++
    this.skipping = true
    for (const jump of Array.from(this.pending)) jump()
  }
}

let envCache: THREE.Texture | null | undefined
function environment(): THREE.Texture | null {
  if (envCache === undefined) envCache = mat.brass().envMap ?? null
  return envCache
}

/** Engraved brass: Jost caps letterspaced 0.12 em painted into a brass ground, the ink as bump so the letters sit in grooves. */
function engraved(o: { lines: string[]; width: number; height: number; size?: number; align?: 'left' | 'center' | 'right'; font?: 'sans' | 'mono'; padding?: number }): THREE.MeshStandardMaterial {
  const texH = 128
  const texW = Math.min(1024, Math.max(64, 2 ** Math.round(Math.log2((o.width / o.height) * texH))))
  const map = labelTexture({ lines: o.lines, bg: BRASS, color: INK, width: texW, height: texH, letterSpacing: o.font === 'mono' ? 0 : 0.12, weight: 500, size: o.size, align: o.align, font: o.font, padding: o.padding })
  const bump = new THREE.CanvasTexture(map.image as HTMLCanvasElement)
  bump.colorSpace = THREE.NoColorSpace
  bump.anisotropy = 4
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.004, metalness: 0.82, roughness: 0.36, envMap: environment(), envMapIntensity: 0.45 })
}

/** A brass plate standing in the x–y plane, face toward +z, origin at its centre. */
function brassPlate(lines: string[], width: number, height: number, thickness = 0.0025, o: { size?: number; align?: 'left' | 'center' | 'right'; font?: 'sans' | 'mono'; padding?: number } = {}): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), mat.brass())
  body.castShadow = true
  body.receiveShadow = true
  g.add(body)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), engraved({ lines, width, height, size: o.size, align: o.align, font: o.font, padding: o.padding }))
  face.position.z = thickness / 2 + 0.0002
  face.receiveShadow = true
  g.add(face)
  return g
}

function shaded(m: THREE.Mesh): THREE.Mesh {
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cyl(rTop: number, rBot: number, h: number, material: THREE.Material, segments = 24): THREE.Mesh {
  return shaded(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), material))
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  return shaded(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material))
}

function feltMat(): THREE.MeshStandardMaterial { return mat.felt(FELT) }
function inkMat(): THREE.MeshStandardMaterial { return mat.flat(INK) }

/** A tiny engraved inventory number (Law IV) on a brass base plate. */
function inventoryPlate(tagText: string, width: number, depth: number): THREE.Mesh {
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), engraved({ lines: [tagText], width, height: depth, padding: 6 }))
  face.rotation.x = -Math.PI / 2
  face.receiveShadow = true
  return face
}

// ───────────────────────────── The davit ─────────────────────────────

/** Fixed numbers of the davit (bible §5.5, §14.1); the arm's rise and throw fill the bible's gap. */
const DAVIT = {
  post: 0.140,
  /** The slewing arm rises from the post head and throws the boom pivot forward over the far rim. */
  armRise: 0.160,
  armThrow: 0.195,
  boomMin: 0.060,
  boomMax: 0.475,
  tipSpeed: 0.300,
  slewRate: THREE.MathUtils.degToRad(120),
  lowerMs: 240,
  hoistMs: 300,
  releaseMs: 100,
  clampMs: 120,
  unparkMs: 200,
  travelLift: 0.110,
  returnRate: 1.4,
  /** Jaw centre above the lacquer when lowered: the brass collar's centre, the piece 1.5 mm in its recess. */
  collarY: 0.005,
  /** Clamp origin (the crosshead) above the jaw centre. */
  cage: 0.116,
  armLen: 0.105,
  jawOpen: 0.028,
}

export interface DavitOptions {
  /** Height of the lacquer surface above the davit's base (the table top). Default 0.009. */
  surfaceY?: number
  /** Which way the boom parks along the far rim: +1 toward +x (default), −1 toward −x. */
  parkSide?: 1 | -1
}

/**
 * The davit (HS-0006): a 0.140 brass post at the far table edge, a slewing arm, a four-stage
 * telescoping boom (reach 0.060 to 0.475 beyond the arm's throw) and a felt-jawed clamp on a
 * cable. Positions given to `goTo` are in the parent's space (the board's, +z toward the player).
 */
export class Davit {
  readonly group = new THREE.Group()
  /** Where a carried object is attached: the jaw centre. */
  readonly hold = new THREE.Group()
  private readonly slew = new THREE.Group()
  private readonly boom = new THREE.Group()
  private readonly clampGroup = new THREE.Group()
  private readonly stages: THREE.Mesh[] = []
  private readonly stageLen: number[] = []
  private readonly sheave: THREE.Mesh
  private readonly cable: THREE.Mesh
  private readonly jaws: THREE.Group[] = []
  private readonly motion = new Motion()
  private readonly surfaceY: number
  private readonly parkSide: 1 | -1
  private theta: number
  private reach = DAVIT.boomMin
  private lift = DAVIT.travelLift
  private jaw = 1
  private jawRadius = 0.017
  private carried: { obj: THREE.Object3D; parent: THREE.Object3D | null } | null = null
  private parked = true

  constructor(o: DavitOptions = {}) {
    this.surfaceY = o.surfaceY ?? 0.009
    this.parkSide = o.parkSide ?? 1
    this.theta = (this.parkSide * Math.PI) / 2
    const g = this.group
    g.name = 'davit'
    g.userData = { tag: 'HS-0006', name: 'THE DAVIT' }
    const brass = mat.brass()

    const plate = cyl(0.032, 0.034, 0.005, brass, 32)
    plate.position.y = 0.0025
    g.add(plate)
    const label = inventoryPlate('HS-0006', 0.030, 0.008)
    label.position.set(0, 0.0052, 0.020)
    g.add(label)
    const post = cyl(0.007, 0.008, DAVIT.post, brass, 20)
    post.position.y = DAVIT.post / 2
    g.add(post)
    const ring = cyl(0.0095, 0.0095, 0.004, brass, 20)
    ring.position.y = DAVIT.post - 0.030
    g.add(ring)

    this.slew.position.y = DAVIT.post
    g.add(this.slew)
    const head = cyl(0.011, 0.011, 0.014, brass, 24)
    head.position.y = 0.007
    this.slew.add(head)
    const arm = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.012, 0), new THREE.Vector3(0, DAVIT.armRise, 0.015), new THREE.Vector3(0, DAVIT.armRise, DAVIT.armThrow))
    const armMesh = shaded(new THREE.Mesh(new THREE.TubeGeometry(arm, 24, 0.0055, 12, false), brass))
    this.slew.add(armMesh)
    const stay = shaded(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0.014, 0.016), new THREE.Vector3(0, DAVIT.armRise - 0.008, DAVIT.armThrow * 0.62)), 1, 0.0022, 8, false), brass))
    this.slew.add(stay)
    const counter = box(0.024, 0.018, 0.020, brass)
    counter.position.set(0, 0.024, -0.024)
    this.slew.add(counter)

    this.boom.position.set(0, DAVIT.armRise, DAVIT.armThrow)
    this.slew.add(this.boom)
    const radii = [0.006, 0.0048, 0.0038, 0.003]
    const perStage = (DAVIT.boomMax - DAVIT.boomMin) / 3
    for (let i = 0; i < 4; i++) {
      const len = i === 0 ? 0.160 : perStage + 0.022
      const m = shaded(new THREE.Mesh(new THREE.CylinderGeometry(radii[i], radii[i], len, 14), brass))
      m.rotation.x = Math.PI / 2
      this.stages.push(m)
      this.stageLen.push(len)
      this.boom.add(m)
    }
    const collar = cyl(0.0075, 0.0075, 0.006, brass, 14)
    collar.rotation.x = Math.PI / 2
    collar.position.z = DAVIT.boomMin
    this.boom.add(collar)
    this.sheave = cyl(0.007, 0.007, 0.004, brass, 20)
    this.sheave.rotation.z = Math.PI / 2
    this.boom.add(this.sheave)
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 1, 6), inkMat())
    this.cable.castShadow = true
    this.boom.add(this.cable)

    this.boom.add(this.clampGroup)
    const crosshead = box(0.012, 0.008, 0.012, brass)
    this.clampGroup.add(crosshead)
    const yoke = box(DAVIT.jawOpen * 2 + 0.006, 0.005, 0.005, brass)
    yoke.position.y = -0.0065
    this.clampGroup.add(yoke)
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group()
      pivot.position.set(side * DAVIT.jawOpen, -0.008, 0)
      const armBar = box(0.004, DAVIT.armLen, 0.004, brass)
      armBar.position.y = -DAVIT.armLen / 2
      pivot.add(armBar)
      const pad = box(0.005, 0.010, 0.012, feltMat())
      pad.position.set(-side * 0.0045, -(DAVIT.armLen + 0.003), 0)
      pivot.add(pad)
      const knuckle = cyl(0.004, 0.004, 0.006, brass, 12)
      knuckle.rotation.x = Math.PI / 2
      pivot.add(knuckle)
      this.jaws.push(pivot)
      this.clampGroup.add(pivot)
    }
    this.hold.position.y = -DAVIT.cage
    this.clampGroup.add(this.hold)
    this.jaw = 0
    this.pose()
  }

  /** Jaw centre height above the table for the current lift. */
  private jawY(): number { return this.surfaceY + DAVIT.collarY + this.lift }

  /** Applies theta, reach, lift and jaw to the parts. */
  private pose(): void {
    this.slew.rotation.y = this.theta
    let front = DAVIT.boomMin
    const ext = (this.reach - DAVIT.boomMin) / 3
    for (let i = 0; i < 4; i++) {
      if (i > 0) front += ext
      this.stages[i].position.z = front - this.stageLen[i] / 2
    }
    this.sheave.position.set(0, -0.004, this.reach)
    const clampY = this.jawY() + DAVIT.cage - (DAVIT.post + DAVIT.armRise)
    this.clampGroup.position.set(0, clampY, this.reach)
    const len = Math.max(0.002, -0.011 - clampY - 0.004)
    this.cable.scale.y = len
    this.cable.position.set(0, -0.011 - len / 2, this.reach)
    const closed = Math.atan((DAVIT.jawOpen - 0.0045 - this.jawRadius) / DAVIT.armLen)
    this.jaws[0].rotation.z = -closed * this.jaw
    this.jaws[1].rotation.z = closed * this.jaw
  }

  /** Converts a point in the parent's space (x, z on the lacquer) to the davit's local space. */
  toLocal(x: number, z: number): THREE.Vector3 {
    const v = new THREE.Vector3(x, this.surfaceY, z)
    if (this.group.parent) this.group.parent.localToWorld(v)
    else v.add(this.group.position)
    return this.group.worldToLocal(v)
  }

  /** The boom tip (the sheave) in the davit's local space. */
  tipLocal(): THREE.Vector3 {
    return this.boom.localToWorld(new THREE.Vector3(0, -0.004, this.reach)).sub(this.group.getWorldPosition(new THREE.Vector3()))
  }

  /** The boom tip in world space. */
  tipWorld(): THREE.Vector3 {
    return this.boom.localToWorld(new THREE.Vector3(0, -0.004, this.reach))
  }

  /** The jaw centre in world space. */
  jawWorld(): THREE.Vector3 {
    return this.hold.getWorldPosition(new THREE.Vector3())
  }

  /** True while the boom rests in its park pose. */
  get isParked(): boolean { return this.parked }

  /** Any key skips: every running and following motion completes at once until the davit parks. */
  skip(): void { this.motion.skip() }

  private tipXZ(): THREE.Vector2 {
    const d = DAVIT.armThrow + this.reach
    return new THREE.Vector2(Math.sin(this.theta) * d, Math.cos(this.theta) * d)
  }

  /** Slews and extends together so the tip travels a straight line at 0.300 m/s (× rate), slew ≤ 120°/s. */
  private travel(to: THREE.Vector2, rate: number): Promise<void> {
    const from = this.tipXZ()
    const dist = from.distanceTo(to)
    const thetaTo = Math.atan2(to.x, to.y)
    let dTheta = thetaTo - this.theta
    while (dTheta > Math.PI) dTheta -= Math.PI * 2
    while (dTheta < -Math.PI) dTheta += Math.PI * 2
    const ms = Math.max(1, 1000 * Math.max(dist / (DAVIT.tipSpeed * rate), Math.abs(dTheta) / (DAVIT.slewRate * rate)))
    if (dist > 0.002) sfx('ratchet')
    const theta0 = this.theta
    return this.motion.run(ms, (k) => {
      const x = THREE.MathUtils.lerp(from.x, to.x, k), z = THREE.MathUtils.lerp(from.y, to.y, k)
      const d = Math.hypot(x, z)
      this.reach = THREE.MathUtils.clamp(d - DAVIT.armThrow, DAVIT.boomMin, DAVIT.boomMax)
      const t = d > 1e-6 ? Math.atan2(x, z) : this.theta
      let dt = t - theta0
      while (dt > Math.PI) dt -= Math.PI * 2
      while (dt < -Math.PI) dt += Math.PI * 2
      this.theta = theta0 + dt
      this.pose()
    }, handEase(ms))
  }

  private setJaw(target: number, ms: number): Promise<void> {
    const from = this.jaw
    return this.motion.run(ms, (k) => { this.jaw = THREE.MathUtils.lerp(from, target, k); this.pose() }, ease.outCubic)
  }

  private setLift(target: number, ms: number): Promise<void> {
    const from = this.lift
    return this.motion.run(ms, (k) => { this.lift = THREE.MathUtils.lerp(from, target, k); this.pose() }, handEase(ms))
  }

  /** Unpark (200 ms: the jaws open), then slew and extend to (x, z) in the parent's space. */
  async goTo(x: number, z: number): Promise<void> {
    if (this.parked) {
      this.parked = false
      sfx('ratchet')
      await this.setJaw(0, DAVIT.unparkMs)
    }
    const p = this.toLocal(x, z)
    await this.travel(new THREE.Vector2(p.x, p.z), 1)
  }

  /** Lowers the clamp onto the collar, 240 ms. */
  lower(): Promise<void> { return this.setLift(0, DAVIT.lowerMs) }

  /** Raises the clamp to travel height (0.110 above the collar), 240 ms. */
  raise(): Promise<void> { return this.setLift(DAVIT.travelLift, DAVIT.lowerMs) }

  /** Closes the jaws on a collar of `radius` (0.017; pawns 0.013): one click, at which the chair's clock stops. */
  async clamp(radius = 0.017): Promise<void> {
    this.jawRadius = radius
    await this.setJaw(1, DAVIT.clampMs)
    sfx('select')
  }

  /** Opens the jaws, 100 ms. */
  release(): Promise<void> { return this.setJaw(0, DAVIT.releaseMs) }

  /** Hoists the clamp (and what it carries) by `h` metres in 300 ms, with the halyard's creak. */
  hoist(h: number): Promise<void> {
    sfx('creak')
    return this.setLift(this.lift + h, DAVIT.hoistMs)
  }

  /** Attaches an object to the jaws so it moves with them; its world transform is kept. */
  carry(obj: THREE.Object3D): void {
    this.carried = { obj, parent: obj.parent }
    this.hold.attach(obj)
  }

  /** Returns the carried object to its former parent, where it now stands. */
  drop(): THREE.Object3D | null {
    if (!this.carried) return null
    const { obj, parent } = this.carried
    this.carried = null
    const home = parent ?? this.group.parent
    if (home) home.attach(obj)
    return obj
  }

  /** Returns to park at 1.4× speed: boom retracted to 0.060, slewed 90° along the far rim, jaws closed. */
  async park(): Promise<void> {
    if (this.lift < DAVIT.travelLift) await this.setLift(DAVIT.travelLift, DAVIT.lowerMs / DAVIT.returnRate)
    const d = DAVIT.armThrow + DAVIT.boomMin
    await this.travel(new THREE.Vector2(this.parkSide * d, 0), DAVIT.returnRate)
    this.theta = (this.parkSide * Math.PI) / 2
    this.reach = DAVIT.boomMin
    await this.setJaw(1, DAVIT.clampMs)
    this.parked = true
    this.motion.skipping = false
  }
}

// ───────────────────────────── The signal mast ─────────────────────────────

export type FlagCode = 'U' | 'N' | 'C' | 'P'
export type HoistCode = FlagCode | 'NC'

const FLAG_W = 0.028, FLAG_H = 0.021
const MAST = { height: 0.090, hoistMs: 700, pocketTop: 0.012 }

const flagCache = new Map<FlagCode, THREE.CanvasTexture>()

/** International code flags U, N, C and P, painted small with the palette's red, textile blue and paper white. */
function flagTexture(code: FlagCode): THREE.CanvasTexture {
  const hit = flagCache.get(code)
  if (hit) return hit
  const w = 64, h = 48
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const red = LAMP_RED, blue = TEXTILE, white = PAPER_WHITE
  const rect = (x: number, y: number, rw: number, rh: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, rw, rh) }
  switch (code) {
    case 'U':
      rect(0, 0, w / 2, h / 2, red); rect(w / 2, 0, w / 2, h / 2, white); rect(0, h / 2, w / 2, h / 2, white); rect(w / 2, h / 2, w / 2, h / 2, red)
      break
    case 'N':
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) rect((i * w) / 4, (j * h) / 4, w / 4, h / 4, (i + j) % 2 === 0 ? blue : white)
      break
    case 'C':
      [blue, white, red, white, blue].forEach((c, i) => rect(0, (i * h) / 5, w, h / 5, c))
      break
    case 'P':
      rect(0, 0, w, h, blue); rect(w / 3, h / 3, w / 3, h / 3, white)
      break
  }
  // Bunting: a few weft strokes at low alpha (Law VI, 2 to 4 percent).
  const rnd = seeded('flag:' + code)
  ctx.strokeStyle = 'rgba(35,33,30,0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const y = rnd() * h
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (rnd() - 0.5) * 2); ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  flagCache.set(code, tex)
  return tex
}

/**
 * The signal mast (HS-0005): a 0.090 brass mast at the far table edge, left corner, with a halyard
 * and a felt pocket of four flags. Flags fly toward +x in the x–y plane so they face the Table camera.
 */
export class SignalMast {
  readonly group = new THREE.Group()
  /** What flies now, or null when the pocket holds everything. */
  current: HoistCode | null = null
  private readonly flags = new Map<FlagCode, THREE.Mesh>()
  private readonly motion = new Motion()
  private flying: FlagCode[] = []
  private height = 0

  constructor() {
    const g = this.group
    g.name = 'signalMast'
    g.userData = { tag: 'HS-0005', name: 'SIGNAL MAST' }
    const brass = mat.brass()
    const plate = cyl(0.016, 0.017, 0.004, brass, 24)
    plate.position.y = 0.002
    g.add(plate)
    const label = inventoryPlate('HS-0005', 0.022, 0.006)
    label.position.set(0, 0.0042, -0.010)
    g.add(label)
    const mast = cyl(0.0025, 0.0035, MAST.height, brass, 16)
    mast.position.y = MAST.height / 2
    g.add(mast)
    const truck = cyl(0.004, 0.004, 0.003, brass, 12)
    truck.position.y = MAST.height + 0.0015
    g.add(truck)
    const block = cyl(0.004, 0.004, 0.003, brass, 12)
    block.rotation.x = Math.PI / 2
    block.position.set(0.0, MAST.height - 0.006, 0)
    g.add(block)
    for (const sx of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, MAST.height - 0.020, 5), inkMat())
      line.position.set(sx * 0.0045, 0.014 + (MAST.height - 0.020) / 2, 0)
      g.add(line)
    }
    const cleat = box(0.010, 0.003, 0.003, brass)
    cleat.position.set(0.0055, 0.016, 0)
    g.add(cleat)
    const pocket = box(0.026, MAST.pocketTop, 0.012, feltMat())
    pocket.position.set(0.019, MAST.pocketTop / 2, 0.008)
    g.add(pocket)
    for (const code of ['U', 'N', 'C', 'P'] as const) {
      const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H)
      geo.translate(FLAG_W / 2, 0, 0)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(code), roughness: 0.92, metalness: 0, side: THREE.DoubleSide }))
      m.castShadow = true
      m.position.set(0.0045, 0, 0)
      m.visible = false
      m.name = 'flag:' + code
      this.flags.set(code, m)
      g.add(m)
    }
  }

  /** Full hoist: the top flag's head at the block. */
  private get full(): number { return MAST.height - 0.008 - FLAG_H / 2 }

  private place(h: number): void {
    this.height = h
    this.flying.forEach((code, i) => {
      const m = this.flags.get(code)
      if (!m) return
      const y = h - i * (FLAG_H + 0.004)
      m.position.y = y
      m.visible = y > MAST.pocketTop + FLAG_H / 2 - 0.004
    })
  }

  private haul(to: number, ms = MAST.hoistMs): Promise<void> {
    const from = this.height
    sfx('creak')
    return this.motion.run(ms, (k) => this.place(THREE.MathUtils.lerp(from, to, k)), handEase(ms))
  }

  /** Hoists a flag (or N over C) in 700 ms; anything else flying is lowered first. */
  async hoist(flag: HoistCode): Promise<void> {
    if (this.current === flag) return
    if (this.current) await this.lower()
    this.current = flag
    this.flying = flag === 'NC' ? ['N', 'C'] : [flag]
    this.place(0)
    await this.haul(this.full)
  }

  /** Lowers what flies into the pocket, 700 ms. */
  async lower(): Promise<void> {
    if (!this.current) return
    await this.haul(0)
    for (const m of this.flags.values()) m.visible = false
    this.current = null
    this.flying = []
  }

  /** Both flags to half height (a draw): what flies, or N over C if nothing does. */
  async halfMast(): Promise<void> {
    if (!this.current) {
      this.current = 'NC'
      this.flying = ['N', 'C']
      this.place(0)
    }
    await this.haul(this.full / 2 + FLAG_H / 2)
  }
}

// ───────────────────────────── THE RETURNED ─────────────────────────────

export interface ReturnedTrayOptions {
  /** Cutouts per row. Default 16. */
  columns?: number
  /** Cutout size along z (the lying piece) and x. Default [0.100, 0.036]. */
  cutout?: [number, number]
  /** Felt between cutouts. Default 0.003. */
  gap?: number
  /** The ebonised wall around the felt. Default 0.006. */
  wall?: number
}

/**
 * THE RETURNED (bible §5.8): a felt-lined tray in the dark-square colour, two rows of sixteen
 * cutouts, light pieces above (−z), dark below (+z), every piece on its side with its base toward
 * the player and a typed paper tag on it. Origin at the tray's centre on the table top.
 */
export class ReturnedTray {
  readonly group = new THREE.Group()
  readonly width: number
  readonly depth: number
  private readonly columns: number
  private readonly cutout: [number, number]
  private readonly pitch: number
  private readonly wall: number
  private readonly slots: (THREE.Object3D | null)[]
  private readonly tags: THREE.Mesh[][]
  private readonly motion = new Motion()

  constructor(o: ReturnedTrayOptions = {}) {
    this.columns = o.columns ?? 16
    this.cutout = o.cutout ?? [0.100, 0.036]
    const gap = o.gap ?? 0.003
    this.wall = o.wall ?? 0.006
    this.pitch = this.cutout[1] + gap
    this.width = this.columns * this.cutout[1] + (this.columns - 1) * gap + 2 * this.wall
    this.depth = 2 * this.cutout[0] + gap + 2 * this.wall
    this.slots = new Array<THREE.Object3D | null>(this.columns * 2).fill(null)
    this.tags = Array.from({ length: this.columns * 2 }, () => [])
    const g = this.group
    g.name = 'returned'
    g.userData = { name: 'THE RETURNED' }
    const H = 0.012

    const floor = box(this.width - 2 * this.wall, 0.006, this.depth - 2 * this.wall, feltMat())
    floor.position.y = 0.003
    g.add(floor)
    const shape = new THREE.Shape()
    const iw = this.width / 2 - this.wall, id = this.depth / 2 - this.wall
    shape.moveTo(-iw, -id); shape.lineTo(iw, -id); shape.lineTo(iw, id); shape.lineTo(-iw, id); shape.closePath()
    for (let i = 0; i < this.columns * 2; i++) {
      const c = this.cell(i)
      const hw = this.cutout[1] / 2 - 0.0004, hd = this.cutout[0] / 2 - 0.0004
      const hole = new THREE.Path()
      hole.moveTo(c.x - hw, -c.z - hd); hole.lineTo(c.x + hw, -c.z - hd); hole.lineTo(c.x + hw, -c.z + hd); hole.lineTo(c.x - hw, -c.z + hd); hole.closePath()
      shape.holes.push(hole)
    }
    const ridges = shaded(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: H - 0.006, bevelEnabled: false }), feltMat()))
    ridges.rotation.x = -Math.PI / 2
    ridges.position.y = 0.006
    g.add(ridges)
    const ebony = mat.wood({ base: EBONY, grain: INK, seed: 'returned', repeat: [4, 1] })
    for (const sz of [-1, 1]) {
      const w = box(this.width, H, this.wall, ebony)
      w.position.set(0, H / 2, sz * (this.depth / 2 - this.wall / 2))
      g.add(w)
    }
    for (const sx of [-1, 1]) {
      const w = box(this.wall, H, this.depth, ebony)
      w.position.set(sx * (this.width / 2 - this.wall / 2), H / 2, 0)
      g.add(w)
    }
    const name = new THREE.Mesh(new THREE.PlaneGeometry(0.060, 0.005), engraved({ lines: ['THE RETURNED'], width: 0.060, height: 0.005, padding: 4 }))
    name.rotation.x = -Math.PI / 2
    name.position.set(0, H + 0.0002, this.depth / 2 - this.wall / 2)
    g.add(name)
  }

  /** Centre of cutout `i` (0..columns−1 light, columns..2·columns−1 dark). */
  private cell(i: number): { x: number; z: number } {
    const row = i < this.columns ? 0 : 1
    const col = i % this.columns
    const x = -this.width / 2 + this.wall + this.cutout[1] / 2 + col * this.pitch
    const z = (row === 0 ? -1 : 1) * (this.cutout[0] / 2 + (this.pitch - this.cutout[1]) / 2)
    return { x, z }
  }

  /** How many of each side lie in the tray. */
  count(): { light: number; dark: number } {
    let light = 0, dark = 0
    this.slots.forEach((s, i) => { if (s) { if (i < this.columns) light++; else dark++ } })
    return { light, dark }
  }

  private static radiusOf(piece: THREE.Object3D): number {
    let r = 0.013
    piece.traverse((n) => {
      const m = n as THREE.Mesh
      if (!m.isMesh) return
      m.geometry.computeBoundingBox()
      const b = m.geometry.boundingBox
      if (!b) return
      const sx = Math.abs(m.scale.x), sz = Math.abs(m.scale.z)
      r = Math.max(r, Math.abs(b.max.x) * sx, Math.abs(b.min.x) * sx, Math.abs(b.max.z) * sz, Math.abs(b.min.z) * sz)
    })
    return Math.min(r, 0.018)
  }

  private paperTag(text: string): THREE.Mesh {
    const lines = text.split(/\s{2,}/).filter((s) => s.length)
    const map = labelTexture({ lines, font: 'mono', bg: PAPER, color: INK, width: 256, height: 128, padding: 14, paper: true, align: 'left', letterSpacing: 0.02 })
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.0006, 0.015), [mat.paper(PAPER), mat.paper(PAPER), new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 }), mat.paper(PAPER), mat.paper(PAPER), mat.paper(PAPER)])
    m.castShadow = true
    m.name = 'tag'
    return m
  }

  /**
   * Lays `piece` on its side in the next free cutout of its colour (`userData.color`), base toward
   * +z, then slides a paper tag 0.030 × 0.015 onto it; emits 'paper'. Resolves to the slot index.
   */
  async place(piece: THREE.Object3D, tagText: string): Promise<number> {
    const color: Color = piece.userData.color === 'b' ? 'b' : 'w'
    const start = color === 'w' ? 0 : this.columns
    let index = -1
    for (let i = start; i < start + this.columns; i++) if (!this.slots[i]) { index = i; break }
    if (index < 0) return -1
    const radius = ReturnedTray.radiusOf(piece)
    const c = this.cell(index)
    this.slots[index] = piece
    this.group.add(piece)
    piece.rotation.set(-Math.PI / 2, 0, 0)
    piece.position.set(c.x, 0.006 + radius, c.z + this.cutout[0] / 2 - 0.003)
    piece.scale.setScalar(1)
    const tag = this.paperTag(tagText)
    const rest = new THREE.Vector3(c.x, 0.006 + radius * 1.55 + 0.0004, c.z + this.cutout[0] / 2 - 0.028)
    tag.position.copy(rest).add(new THREE.Vector3(0, 0.004, -0.040))
    tag.rotation.y = 0.03
    this.group.add(tag)
    this.tags[index].push(tag)
    sfx('paper')
    await this.motion.run(300, (k) => { tag.position.lerpVectors(rest.clone().add(new THREE.Vector3(0, 0.004, -0.040)), rest, k) }, handEase(300))
    return index
  }

  /** A second tag on slot `index`, laid across the first (COUNTED.  B.L. after a night in the tray). */
  secondTag(index: number, text: string): void {
    if (!this.slots[index]) return
    const first = this.tags[index][0]
    const tag = this.paperTag(text)
    tag.position.copy(first ? first.position : new THREE.Vector3(this.cell(index).x, 0.02, this.cell(index).z))
    tag.position.y += 0.0007
    tag.position.z += 0.010
    tag.rotation.y = -0.06
    this.group.add(tag)
    this.tags[index].push(tag)
    sfx('paper')
  }
}

// ───────────────────────────── The SPARES drawer ─────────────────────────────

const SPARE_TYPES: PieceType[] = ['q', 'r', 'b', 'n']
const DRAWER = { w: 0.190, h: 0.108, d: 0.100, throwOut: 0.150, ms: 520, caseH: 0.120, top: -0.040 }

/**
 * The SPARES drawer (HS-0009): a pair of drawers, one per colour, flush with the right table edge
 * and sliding out toward +x. Four collared spares each: queen, rook, bishop, knight, standing in
 * felt. The light side's spare rook is built without its slot. Origin at the table's right edge on the table top.
 */
export class SparesDrawer {
  readonly group = new THREE.Group()
  /** The four spares of each colour; each carries `userData.spare` (its type) and `userData.color`. */
  readonly pieces: Record<Color, THREE.Object3D[]> = { w: [], b: [] }
  private readonly drawers: Record<Color, THREE.Group>
  private readonly motion = new Motion()
  private openColor: Color | null = null

  constructor() {
    const g = this.group
    g.name = 'spares'
    g.userData = { tag: 'HS-0009', name: 'THE SPARES DRAWER' }
    const ebony = mat.wood({ base: EBONY, grain: INK, seed: 'spares', repeat: [2, 1] })
    const caseD = DRAWER.d * 2 + 0.024
    const shell = box(DRAWER.w + 0.012, DRAWER.caseH, caseD, ebony)
    shell.position.set(-(DRAWER.w + 0.012) / 2 - 0.004, DRAWER.top - DRAWER.caseH / 2, 0)
    g.add(shell)
    this.drawers = { w: this.drawer('w', -(DRAWER.d / 2 + 0.006)), b: this.drawer('b', DRAWER.d / 2 + 0.006) }
    g.add(this.drawers.w, this.drawers.b)
  }

  private drawer(color: Color, z: number): THREE.Group {
    const d = new THREE.Group()
    d.name = 'drawer:' + color
    d.position.set(0, DRAWER.top - DRAWER.caseH / 2, z)
    const ebony = mat.wood({ base: EBONY, grain: INK, seed: 'drawer:' + color, repeat: [2, 1] })
    const bottom = box(DRAWER.w, 0.004, DRAWER.d, ebony)
    bottom.position.set(-DRAWER.w / 2, -DRAWER.h / 2 + 0.002, 0)
    d.add(bottom)
    const felt = box(DRAWER.w - 0.012, 0.004, DRAWER.d - 0.012, feltMat())
    felt.position.set(-DRAWER.w / 2, -DRAWER.h / 2 + 0.006, 0)
    d.add(felt)
    for (const sz of [-1, 1]) {
      const side = box(DRAWER.w, DRAWER.h, 0.004, ebony)
      side.position.set(-DRAWER.w / 2, 0, sz * (DRAWER.d / 2 - 0.002))
      d.add(side)
    }
    const back = box(0.004, DRAWER.h, DRAWER.d, ebony)
    back.position.set(-DRAWER.w + 0.002, 0, 0)
    d.add(back)
    const front = box(0.008, DRAWER.h + 0.006, DRAWER.d + 0.010, ebony)
    front.position.set(-0.004, 0, 0)
    d.add(front)
    const pull = cyl(0.005, 0.006, 0.010, mat.brass(), 16)
    pull.rotation.z = -Math.PI / 2
    pull.position.set(0.005, -0.010, 0)
    d.add(pull)
    const plate = brassPlate(['SPARES'], 0.034, 0.009, 0.0015, { padding: 5 })
    plate.rotation.y = Math.PI / 2
    plate.position.set(0.001, 0.028, 0)
    d.add(plate)
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.005), engraved({ lines: ['HS-0009'], width: 0.018, height: 0.005, padding: 4 }))
    hs.rotation.y = Math.PI / 2
    hs.position.set(0.0002, -0.040, 0)
    d.add(hs)

    const pitch = (DRAWER.w - 0.024) / 4
    SPARE_TYPES.forEach((type, i) => {
      const piece = buildPiece(type, color, 'SPARE', type === 'r' && color === 'w' ? { slot: false } : {})
      if (type === 'r' && color === 'w') piece.userData.noSlot = true
      piece.userData.spare = type
      piece.userData.color = color
      piece.userData.pickable = false
      piece.position.set(-DRAWER.w + 0.012 + pitch * (i + 0.5), -DRAWER.h / 2 + 0.008, 0)
      const socket = cyl(0.019, 0.019, 0.002, feltMat(), 24)
      socket.position.set(piece.position.x, -DRAWER.h / 2 + 0.0085, 0)
      d.add(socket)
      d.add(piece)
      this.pieces[color].push(piece)
    })
    return d
  }

  /** The four spares of a colour, for picking. */
  spares(color: Color): THREE.Object3D[] { return this.pieces[color] }

  /** Which drawer stands open, or null. */
  get openSide(): Color | null { return this.openColor }

  private slide(color: Color, out: boolean): Promise<void> {
    const d = this.drawers[color]
    const from = d.position.x, to = out ? DRAWER.throwOut : 0
    sfx('drawer')
    return this.motion.run(DRAWER.ms, (k) => { d.position.x = THREE.MathUtils.lerp(from, to, k) }, handEase(DRAWER.ms, 60, 120))
  }

  /** Slides the colour's drawer open in 520 ms on its four pieces, which become pickable. */
  async open(color: Color): Promise<void> {
    if (this.openColor && this.openColor !== color) await this.close()
    if (this.openColor === color) return
    this.openColor = color
    for (const p of this.pieces[color]) p.userData.pickable = true
    await this.slide(color, true)
  }

  /** Closes the open drawer, 520 ms. */
  async close(): Promise<void> {
    const c = this.openColor
    if (!c) return
    for (const p of this.pieces[c]) p.userData.pickable = false
    this.openColor = null
    await this.slide(c, false)
  }
}

// ───────────────────────────── The tide gauge ─────────────────────────────

const GAUGE = { height: 0.240, width: 0.036, perPawn: 0.020, band: 0.020, rate: 0.012, clampPawns: 5 }

/** The rule's face: engraved graduations, the red bands in the outer 0.020, mate-in-N in a band when given. */
function ruleTexture(mate: { top?: number; bottom?: number }): THREE.CanvasTexture {
  const w = 128, h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.fillStyle = BRASS
  ctx.fillRect(0, 0, w, h)
  const rnd = seeded('gauge')
  ctx.strokeStyle = 'rgba(35,33,30,0.07)'
  for (let i = 0; i < 300; i++) { const y = rnd() * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  const bandPx = (GAUGE.band / GAUGE.height) * h
  ctx.fillStyle = LAMP_RED
  ctx.fillRect(0, 0, w, bandPx)
  ctx.fillRect(0, h - bandPx, w, bandPx)
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  const pxPerPawn = (GAUGE.perPawn / GAUGE.height) * h
  const mid = h / 2
  ctx.font = `500 ${Math.round(pxPerPawn * 0.42)}px Jost`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  for (let p = -5; p <= 5; p++) {
    const y = mid - p * pxPerPawn
    ctx.lineWidth = p === 0 ? 4 : 2.5
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(p === 0 ? w * 0.6 : w * 0.42, y); ctx.stroke()
    if (p !== 0) ctx.fillText(String(Math.abs(p)), w - 10, y)
    if (p < 5) { ctx.lineWidth = 1.5; const yh = y - pxPerPawn / 2; ctx.beginPath(); ctx.moveTo(0, yh); ctx.lineTo(w * 0.22, yh); ctx.stroke() }
  }
  ctx.textAlign = 'center'
  ctx.font = `500 ${Math.round(pxPerPawn * 0.32)}px Jost`
  const spaced = (text: string, y: number) => {
    const sp = pxPerPawn * 0.04
    let total = 0
    for (const ch of text) total += ctx.measureText(ch).width + sp
    let x = w / 2 - total / 2
    for (const ch of text) { ctx.fillText(ch, x + ctx.measureText(ch).width / 2, y); x += ctx.measureText(ch).width + sp }
  }
  spaced('THE CHAIR', bandPx + pxPerPawn * 0.35)
  spaced('VISITOR', h - bandPx - pxPerPawn * 0.35)
  ctx.fillStyle = PAPER_WHITE
  ctx.font = `500 ${Math.round(bandPx * 0.62)}px Jost`
  if (mate.top) ctx.fillText(String(mate.top), w / 2, bandPx / 2)
  if (mate.bottom) ctx.fillText(String(mate.bottom), w / 2, h - bandPx / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The tide gauge (bible §5.7): a brass rule 0.240 tall on the wall (centre at y 0.98), the
 * mid-mark at 0.120, one pawn per 0.020, clamped at ±5 pawns, red bands in the outer 0.020, a
 * painted water line rate-limited to 0.012 m/s; and a 1:4 table copy driven by the same value.
 * `set(chairCp)` takes centipawns from the chair's side: positive, the water rises toward the chair.
 */
export class TideGauge {
  /** The wall rule; origin at its centre (the mid-mark). */
  readonly wall = new THREE.Group()
  /** The 0.060 table copy; origin at its foot on the table. */
  readonly copy = new THREE.Group()
  private readonly faces: THREE.MeshStandardMaterial[] = []
  private readonly waters: { line: THREE.Mesh; fill: THREE.Mesh; scale: number }[] = []
  private target = 0
  private smoothed = 0
  private mate: { top?: number; bottom?: number } = {}
  private readonly offTick: () => void

  constructor() {
    this.wall.name = 'tideGauge'
    this.copy.name = 'tideGauge:copy'
    this.build(this.wall, 1, 0)
    this.build(this.copy, 0.25, GAUGE.height / 8)
    const brass = mat.brass()
    const foot = box(0.024, 0.003, 0.014, brass)
    foot.position.y = 0.0015
    this.copy.add(foot)
    const label = brassPlate(['TIDE GAUGE.  READ FROM THE LEFT.  DO NOT ADJUST.'], 0.150, 0.014, 0.003, { padding: 6 })
    label.position.set(0, -GAUGE.height / 2 - 0.022, 0)
    this.wall.add(label)
    for (const sy of [-1, 1]) {
      const screw = cyl(0.003, 0.003, 0.002, brass, 12)
      screw.rotation.x = Math.PI / 2
      screw.position.set(0, sy * (GAUGE.height / 2 - 0.006), 0.0035)
      this.wall.add(screw)
    }
    this.offTick = clock.onTick((dt) => this.tick(dt))
    this.apply()
  }

  private build(g: THREE.Group, s: number, yOffset: number): void {
    const w = GAUGE.width * s, h = GAUGE.height * s
    const rule = box(w, h, 0.005 * s, mat.brass())
    rule.position.y = yOffset
    g.add(rule)
    const faceMat = new THREE.MeshStandardMaterial({ map: ruleTexture(this.mate), metalness: 0.82, roughness: 0.36, envMap: environment(), envMapIntensity: 0.45 })
    faceMat.bumpMap = new THREE.CanvasTexture(faceMat.map!.image as HTMLCanvasElement)
    faceMat.bumpMap.colorSpace = THREE.NoColorSpace
    faceMat.bumpScale = 0.003 * s
    this.faces.push(faceMat)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat)
    face.position.set(0, yOffset, 0.0025 * s + 0.0002)
    face.receiveShadow = true
    g.add(face)
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: WATER, transparent: true, opacity: 0.42, roughness: 0.3, metalness: 0, depthWrite: false }))
    fill.position.z = 0.0025 * s + 0.0006
    g.add(fill)
    const line = box(w + 0.006 * s, 0.0025 * s, 0.0016 * s, mat.enamel(WATER))
    line.position.z = 0.0025 * s + 0.0010
    g.add(line)
    const pointer = box(0.006 * s, 0.006 * s, 0.003 * s, mat.brass())
    pointer.position.set(-w / 2 - 0.006 * s, 0, 0.0025 * s + 0.0012)
    line.add(pointer)
    this.waters.push({ line, fill, scale: s })
    g.userData.yOffset = yOffset
  }

  private apply(): void {
    for (const w of this.waters) {
      const base = w.scale === 1 ? 0 : GAUGE.height / 8
      const y = this.smoothed * w.scale
      w.line.position.y = base + y
      const bottom = base - (GAUGE.height / 2) * w.scale
      const height = Math.max(0.0005, (this.smoothed + GAUGE.height / 2) * w.scale)
      w.fill.scale.set(GAUGE.width * w.scale, height, 1)
      w.fill.position.y = bottom + height / 2
    }
  }

  private tick(dt: number): void {
    const step = GAUGE.rate * dt
    const d = this.target - this.smoothed
    if (Math.abs(d) <= step) this.smoothed = this.target
    else this.smoothed += Math.sign(d) * step
    this.apply()
  }

  /** The smoothed level in metres from the mid-mark (+ toward the chair); Slack Water reads this. */
  get level(): number { return this.smoothed }

  /** The smoothed level in pawns, ±5. */
  get pawns(): number { return this.smoothed / GAUGE.perPawn }

  /** Sets the reading: centipawns from the chair's side, and mate-in-N (signed the same way) for the red band. */
  set(chairCp: number, mateIn?: number): void {
    const pawns = THREE.MathUtils.clamp(chairCp / 100, -GAUGE.clampPawns, GAUGE.clampPawns)
    const next: { top?: number; bottom?: number } = {}
    if (mateIn && mateIn > 0) next.top = Math.abs(mateIn)
    if (mateIn && mateIn < 0) next.bottom = Math.abs(mateIn)
    this.target = mateIn ? Math.sign(mateIn) * (GAUGE.height / 2) : pawns * GAUGE.perPawn
    if (next.top !== this.mate.top || next.bottom !== this.mate.bottom) {
      this.mate = next
      const tex = ruleTexture(next)
      for (const f of this.faces) {
        f.map = tex
        f.bumpMap = new THREE.CanvasTexture(tex.image as HTMLCanvasElement)
        f.bumpMap.colorSpace = THREE.NoColorSpace
        f.needsUpdate = true
      }
    }
  }

  /** Stops following the clock (only for tearing a dev scene down). */
  dispose(): void { this.offTick() }
}

// ───────────────────────────── The chronometer pair ─────────────────────────────

const CHRONO = { w: 0.170, h: 0.096, d: 0.056, dial: 0.060, dialY: 0.058 }

function dialTexture(): THREE.CanvasTexture {
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = s; canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, s, s)
  const rnd = seeded('dial')
  ctx.strokeStyle = 'rgba(35,33,30,0.05)'
  for (let i = 0; i < 400; i++) { const x = rnd() * s, y = rnd() * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 4, y + rnd() * 4); ctx.stroke() }
  const c = s / 2, r = s / 2 - 6
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke()
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const long = i % 5 === 0
    ctx.lineWidth = long ? 3 : 1.2
    ctx.beginPath()
    ctx.moveTo(c + Math.sin(a) * (r - (long ? 16 : 8)), c - Math.cos(a) * (r - (long ? 16 : 8)))
    ctx.lineTo(c + Math.sin(a) * r, c - Math.cos(a) * r)
    ctx.stroke()
  }
  ctx.font = '500 26px Jost'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * Math.PI * 2
    ctx.fillText(String(n), c + Math.sin(a) * (r - 34), c - Math.cos(a) * (r - 34))
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

interface Dial { minute: THREE.Group; second: THREE.Group; flag: THREE.Group; fallen: boolean }

/**
 * The chronometer pair (HS-0002, bible §5.6): a walnut box with two 0.060 brass dials, black hands
 * and a red fall flag at 12 on each; the left dial is the light side, the right the dark. An engraved
 * plate lists the watches. Origin at the box's foot, centre; the dials face +z.
 */
export class ChronometerPair {
  readonly group = new THREE.Group()
  private readonly dials: Record<Color, Dial>
  private readonly lever: THREE.Group
  private leverSide: Color | null = null
  private readonly motion = new Motion()

  constructor() {
    const g = this.group
    g.name = 'chronometer'
    g.userData = { tag: 'HS-0002', name: 'CHRONOMETER PAIR' }
    const walnut = mat.wood({ base: room.wood, grain: room.woodGrain, seed: 'walnut', repeat: [2, 1] })
    const boxMesh = box(CHRONO.w, CHRONO.h, CHRONO.d, walnut)
    boxMesh.position.y = CHRONO.h / 2
    g.add(boxMesh)
    const lid = box(CHRONO.w + 0.006, 0.006, CHRONO.d + 0.006, walnut)
    lid.position.y = CHRONO.h + 0.003
    g.add(lid)
    const dialFace = dialTexture()
    this.dials = { w: this.dial(-0.045, dialFace), b: this.dial(0.045, dialFace) }
    const plate = brassPlate(['DOG WATCH  5 + 3', 'MIDDLE WATCH  15 + 10', 'LONG WATCH  30 + 0', 'NO WATCH'], 0.120, 0.022, 0.0015, { padding: 5 })
    plate.position.set(0, 0.015, CHRONO.d / 2 + 0.001)
    g.add(plate)
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.020, 0.005), engraved({ lines: ['HS-0002'], width: 0.020, height: 0.005, padding: 4 }))
    hs.position.set(CHRONO.w / 2 - 0.016, 0.006, CHRONO.d / 2 + 0.0004)
    g.add(hs)
    this.lever = new THREE.Group()
    this.lever.position.set(0, CHRONO.h + 0.006, 0)
    const rocker = box(0.070, 0.004, 0.010, mat.brass())
    this.lever.add(rocker)
    for (const sx of [-1, 1]) {
      const button = cyl(0.006, 0.006, 0.006, mat.brass(), 16)
      button.position.set(sx * 0.030, 0.005, 0)
      this.lever.add(button)
    }
    const fulcrum = cyl(0.004, 0.004, 0.012, mat.brass(), 12)
    fulcrum.rotation.x = Math.PI / 2
    fulcrum.position.y = -0.003
    this.lever.add(fulcrum)
    g.add(this.lever)
  }

  private dial(x: number, face: THREE.CanvasTexture): Dial {
    const r = CHRONO.dial / 2
    const z = CHRONO.d / 2
    const bezel = cyl(r + 0.003, r + 0.003, 0.006, mat.brass(), 40)
    bezel.rotation.x = Math.PI / 2
    bezel.position.set(x, CHRONO.dialY, z + 0.002)
    this.group.add(bezel)
    const faceMesh = new THREE.Mesh(new THREE.CircleGeometry(r - 0.001, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.8, metalness: 0 }))
    faceMesh.position.set(x, CHRONO.dialY, z + 0.0052)
    this.group.add(faceMesh)
    const hand = (len: number, wid: number): THREE.Group => {
      const h = new THREE.Group()
      const m = box(wid, len, 0.0006, inkMat())
      m.position.y = len / 2 - 0.004
      m.castShadow = false
      h.add(m)
      return h
    }
    const minute = hand(r - 0.010, 0.0018)
    minute.position.set(x, CHRONO.dialY, z + 0.0058)
    const second = hand(r - 0.006, 0.0008)
    second.position.set(x, CHRONO.dialY, z + 0.0064)
    const cap = cyl(0.0018, 0.0018, 0.0012, mat.brass(), 12)
    cap.rotation.x = Math.PI / 2
    cap.position.set(x, CHRONO.dialY, z + 0.0068)
    const flag = new THREE.Group()
    flag.position.set(x + 0.003, CHRONO.dialY + r - 0.011, z + 0.0056)
    const cloth = box(0.0035, 0.007, 0.0005, mat.felt(LAMP_RED))
    cloth.castShadow = false
    cloth.position.set(-0.002, 0.0035, 0)
    flag.add(cloth)
    this.group.add(minute, second, cap, flag)
    return { minute, second, flag, fallen: false }
  }

  private hands(d: Dial, minutes: number, seconds: number): void {
    d.minute.rotation.z = -((((minutes % 60) + 60) % 60) / 60) * Math.PI * 2
    d.second.rotation.z = -((((seconds % 60) + 60) % 60) / 60) * Math.PI * 2
  }

  private dropFlag(d: Dial, down: boolean): void {
    if (d.fallen === down) return
    d.fallen = down
    if (down) {
      sfx('flagfall')
      void this.motion.run(150, (k) => { d.flag.rotation.z = -1.25 * k }, ease.inCubic)
    } else d.flag.rotation.z = 0
  }

  /** Positions the hands from the milliseconds remaining (the dials read the time left to 12), drops a flag at zero, and tips the lever to the running side. */
  set(state: ClockState): void {
    for (const c of ['w', 'b'] as const) {
      const ms = Math.max(0, state[c])
      const remainingMin = ms / 60000
      const remainingSec = (ms % 60000) / 1000
      this.hands(this.dials[c], 60 - remainingMin, 60 - remainingSec)
      this.dropFlag(this.dials[c], state[c] <= 0)
    }
    if (state.running !== this.leverSide) {
      this.leverSide = state.running
      const to = state.running === 'w' ? 0.14 : state.running === 'b' ? -0.14 : 0
      const from = this.lever.rotation.z
      sfx('lever')
      void this.motion.run(120, (k) => { this.lever.rotation.z = THREE.MathUtils.lerp(from, to, k) }, ease.outCubic)
    }
  }

  /** No Watch: both dials show station time (minute and second hands). */
  setStationTime(minute: number, second: number): void {
    for (const c of ['w', 'b'] as const) {
      this.hands(this.dials[c], minute, second)
      this.dropFlag(this.dials[c], false)
    }
  }
}

// ───────────────────────────── Plates ─────────────────────────────

/** The brass CONSULT plate, lying flat on the table (face up, reading from +z); origin at its centre. */
export function consultPlate(): THREE.Group {
  const g = brassPlate(['CONSULT'], 0.060, 0.016, 0.003, { padding: 5 })
  g.name = 'plate:consult'
  g.userData = { name: 'CONSULT', action: 'consult' }
  g.rotation.x = -Math.PI / 2
  g.position.y = 0.0015
  return g
}

/** The camera plate, TABLE · CHART · PROFILE, lying flat; three hit boxes named table, chart, profile carry `userData.view`. */
export function cameraPlate(): THREE.Group {
  const w = 0.120, h = 0.016
  const g = brassPlate(['TABLE  ·  CHART  ·  PROFILE'], w, h, 0.003, { padding: 5 })
  g.name = 'plate:camera'
  g.userData = { name: 'CAMERA PLATE' }
  const views = ['table', 'chart', 'profile'] as const
  views.forEach((view, i) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w / 3, h, 0.004), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
    hit.name = view
    hit.userData = { view }
    hit.position.x = (i - 1) * (w / 3)
    g.add(hit)
  })
  g.rotation.x = -Math.PI / 2
  g.position.y = 0.0015
  return g
}

/** The standing order's placard, engraved brass on a small foot, tilted back 15°; origin at its foot. */
export function orderPlacard(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'placard:order'
  g.userData = { name: 'STANDING ORDER 4' }
  const plate = brassPlate(['THE BOARD IS NEVER LEFT UNSET.', 'STANDING ORDER 4.'], 0.120, 0.028, 0.0025, { padding: 6 })
  plate.rotation.x = -0.26
  plate.position.set(0, 0.016, 0)
  g.add(plate)
  const foot = box(0.040, 0.003, 0.020, mat.brass())
  foot.position.set(0, 0.0015, 0.002)
  g.add(foot)
  return g
}
