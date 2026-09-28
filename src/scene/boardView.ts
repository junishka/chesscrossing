// The board view: the board, its thirty-two chessmen and every instrument on the table, and the
// choreography of a move (docs/BIBLE.md §5.4, §5.5, §5.8, §5.9, §14.1). It builds nothing of the
// room: the frame builder leaves the table top at y 0.720 and expects the board at (0, 0.729, 0).
// Every motion runs through clock.tween so slow motion applies; nothing here moves on hover.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CameraStation, ClockState, Color, File, GameEndReason, MoveRecord, PieceType, Rank, SfxName, Square } from '../types'
import { bus } from '../core/bus'
import { clock, ease, type Easing } from '../core/clock'
import type { Stage } from './renderer'
import { buildBoard, type BoardBuild, PITCH, RECESS, TRAY } from './board'
import { buildPiece } from './pieces'
import { Davit, SignalMast, ReturnedTray, SparesDrawer, TideGauge, ChronometerPair, consultPlate, cameraPlate } from './instruments'
import { mat } from './materials'
import { boardroom } from '../content/frames/boardroom'
import { isletName, promotedTag, returnedTag } from '../content/survey'
import { FILES } from '../chess/rules'
import type { Position } from '../chess/rules'

// ───────────────────────────── Numbers (§5.5, §14.1) ─────────────────────────────

/** Heights above the lacquer surface (metres) and timings (ms) of the choreography. */
const N = {
  /** A seated base: the square's floor, 1.5 mm down in its recess. */
  rest: -RECESS,
  /** Pickup and glide: 3 mm above the seat, clear of the lip. */
  lift: -RECESS + 0.003,
  drag: 0.018,
  knight: 0.110,
  captureHoist: 0.400,
  speed: 0.220,
  riseMs: 90,
  seatMs: 60,
  knightMs: 220,
  headMs: 200,
  rookLagMs: 250,
  tipMs: 600,
  turnMs: 1400,
  pinRise: 0.008,
  pinSink: 0.012,
  pinMs: 120,
  pinStaggerMs: 12,
  pinSinkMs: 100,
  slowMotion: 0.4,
  /** The davit's jaw centre above a carried piece's base (the brass collar, §14.1). */
  jawAboveBase: 0.0065,
}

/** The lacquer surface above the table top. */
const SURFACE = 0.009
/** The lacquer surface above the room's floor. */
const SURFACE_ABOVE_FLOOR = 0.729
const FIELD = PITCH * 8
const HALF_TRAY = TRAY / 2

/** Where the instruments stand on the table top, relative to the board's centre (dev/instruments.ts, §5.1). */
const LAYOUT = {
  davit: new THREE.Vector3(0, 0, -0.45),
  mast: new THREE.Vector3(-0.56, 0, -0.42),
  drawer: new THREE.Vector3(0.60, 0, 0.02),
  gaugeCopy: new THREE.Vector3(0.335, 0, 0.30),
  consult: new THREE.Vector3(-0.335, 0, 0.292),
  camera: new THREE.Vector3(-0.335, 0, 0.318),
  chrono: new THREE.Vector3(0.47, 0, -0.30),
  /** The far wall stands 2.2 m behind the far rim; the rule hangs a hair in front of it. */
  wallGaugeZ: -(HALF_TRAY + 2.2) + 0.012,
  wallGaugeX: 0.55,
  wallGaugeY: 0.98,
  /** THE RETURNED: cutouts shortened to 0.094 so the tray ends flush with the table's near edge (0.45). */
  trayCutout: [0.094, 0.036] as [number, number],
  trayGap: 0.005,
}

/** Frame stations relative to the frame origin (§14.2), keyed by the lens each is fixed to. */
const LENSES = { table: 22, chart: 80, profile: 35 } as const

function sfx(name: SfxName, velocity?: number): void {
  bus.emit('audio:sfx', velocity === undefined ? { name } : { name, velocity })
}

/** Constant velocity with a short hand-made ease at each end (40 ms in, 60 ms out of `ms`). */
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

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function fileIndex(sq: Square): number { return FILES.indexOf(sq[0] as File) }
function rankIndex(sq: Square): number { return Number(sq[1]) - 1 }

/** The brass collar's radius for the davit's jaws: 0.017, pawns 0.013. */
function collarRadius(type: PieceType): number { return type === 'p' ? 0.013 : 0.017 }

// ───────────────────────────── Motion ─────────────────────────────

/** A frozen phase for stills: the named phase is set to progress `k` and the world clock stopped. */
interface Freeze { phase: string; k: number }

/**
 * The view's tween runner: every step goes through clock.tween (so slow motion applies), can be
 * skipped to its end state, and can be frozen at a chosen progress for a screenshot.
 */
class Motion {
  skipping = false
  freeze: Freeze | null = null
  private pending = new Set<() => void>()

  /** Runs one named step. While skipping, it completes at once. */
  run(phase: string, ms: number, fn: (k: number) => void, easing: Easing = ease.linear, delayMs = 0): Promise<void> {
    if (this.skipping) { fn(1); return Promise.resolve() }
    const fz = this.freeze
    if (fz && fz.phase === phase) {
      fn(easing(fz.k))
      bus.emit('time:scale', { scale: 0 })
      return new Promise((resolve) => { this.pending.add(() => { fn(1); resolve() }) })
    }
    return new Promise((resolve) => {
      let done = false
      const finish = () => { if (done) return; done = true; this.pending.delete(jump); resolve() }
      const jump = () => { fn(1); finish() }
      this.pending.add(jump)
      void clock.tween(ms, (k) => { if (!done) fn(k) }, easing, delayMs).then(finish)
    })
  }

  /** Runs an instrument's own motion as a named step (freezable by stopping the clock part-way through `ms`). */
  hold(phase: string, ms: number, start: () => Promise<void>): Promise<void> {
    const fz = this.freeze
    const p = start()
    if (fz && fz.phase === phase && !this.skipping) {
      let t = 0
      const off = clock.onTick((dt) => {
        t += dt
        if (t >= (fz.k * ms) / 1000) { off(); bus.emit('time:scale', { scale: 0 }) }
      })
    }
    return p
  }

  /** Jumps every running step to its end and lets every following step complete at once. */
  skip(): void {
    this.skipping = true
    for (const jump of Array.from(this.pending)) jump()
    this.pending.clear()
  }
}

// ───────────────────────────── Men ─────────────────────────────

/** One chessman the view owns: a set piece with a home collar, a drawer spare, or an extra built for a third queen. */
interface Man {
  obj: THREE.Group
  type: PieceType
  color: Color
  kind: 'set' | 'spare'
  home: Square | 'SPARE'
  square: Square | null
  /** Where a drawer spare stands when it is not in play. */
  drawerHome?: { parent: THREE.Object3D; position: THREE.Vector3 }
  /** Set while the piece lies in THE RETURNED. */
  trayed: boolean
  /** Set while a choreography carries the piece. */
  moving: boolean
  /** Generation of the current select, deselect or drag lift, so a newer lift cancels an older one. */
  gen: number
}

interface Pin { mesh: THREE.Mesh; square: Square; sunk: boolean; up: boolean }

/** What one tray entry needs: the piece's colour and type and its tag text. */
interface TrayWant { color: Color; type: PieceType; tag: string; fromFile?: string }

/** Options of animateMove. */
export interface AnimateOptions {
  /** The chair's move (by davit) rather than the player's (by hand). */
  byChair: boolean
  /** Called at the click of the davit's clamp on the chair's own piece: the chair's clock stops. */
  onClamp?: () => void
  /** The god's-eye insert for a capture or promotion; the tag lines are laid in the tray while it runs. */
  insert?: (lines: string[]) => Promise<void>
  /** Asked for the player's promotion while the SPARES drawer stands open. */
  promotionChooser?: () => Promise<PieceType>
}

/** Pieces in THE RETURNED. */
export interface ReturnedCounts { light: number; dark: number }

/** The three stations of the Board Room in world coordinates, and the lens each is fixed to. */
export interface BoardStations { table: CameraStation; chart: CameraStation; profile: CameraStation }

/**
 * The board on the table: the board itself, the thirty-two chessmen (spares in the drawer), the
 * davit, the signal mast, THE RETURNED, the SPARES drawer, the tide gauge (wall rule and table copy),
 * the chronometer pair and the two brass plates. Owns the choreography of every move and the
 * pointer input over the board. Emits nothing on the bus but audio:sfx.
 */
export class BoardView {
  /** The board group (tray, rim, squares, pieces and pins), at `origin` in the parent; it turns on the lazy susan. */
  readonly root: THREE.Group
  /** The instruments' frame: origin at the table top beneath the board's centre; never turns. */
  readonly table = new THREE.Group()
  readonly board: BoardBuild
  readonly davit: Davit
  readonly mast: SignalMast
  readonly drawer: SparesDrawer
  readonly gauge: TideGauge
  readonly chrono: ChronometerPair
  /** THE RETURNED; rebuilt when a sync needs it emptied. */
  tray: ReturnedTray
  /** Table, Chart and Profile in world coordinates. */
  readonly stations: BoardStations
  /** Focal lengths at 35 mm gauge for each station. */
  readonly lenses = LENSES

  private readonly stage: Stage
  private readonly parent: THREE.Object3D
  private readonly origin: THREE.Vector3
  private playerColor: Color
  private readonly men: Man[] = []
  private readonly bySquare = new Map<Square, Man>()
  private readonly trayed: { man: Man; tag: string }[] = []
  private readonly pins: Pin[] = []
  private readonly pinPool: THREE.Mesh[] = []
  private readonly motion = new Motion()
  private selected: Man | null = null
  private legal: Square[] = []
  private interactive = false
  private hovered: Square | null = null
  private squareHandler: ((sq: Square) => void) | null = null
  private hoverHandler: ((sq: Square | null) => void) | null = null
  private drag: { man: Man; from: Square; x: number; y: number; active: boolean } | null = null
  private readonly ray = new THREE.Raycaster()
  private readonly plane = new THREE.Plane()
  private readonly ndc = new THREE.Vector2()
  private readonly hit = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private rect: DOMRect | null = null
  private pickables: THREE.Object3D[] = []
  private pickDirty = true
  private turning = false
  private readonly listeners: { target: EventTarget; type: string; fn: EventListener }[] = []
  private readonly trayPosition = new THREE.Vector3()

  /**
   * @param stage   the Stage, for picking
   * @param parent  the frame's group (its origin on the room's floor)
   * @param origin  the board's centre at the lacquer surface, in the parent's space
   * @param playerColor which side the guest plays
   */
  constructor(stage: Stage, parent: THREE.Object3D, origin: THREE.Vector3, playerColor: Color) {
    this.stage = stage
    this.parent = parent
    this.origin = origin.clone()
    this.playerColor = playerColor

    this.board = buildBoard()
    this.root = this.board.group
    this.root.position.copy(origin)
    parent.add(this.root)
    this.table.name = 'boardTable'
    this.table.position.copy(origin).add(new THREE.Vector3(0, -SURFACE, 0))
    parent.add(this.table)

    // The instruments, where §5.1 puts them.
    this.davit = new Davit({ surfaceY: SURFACE })
    this.davit.group.position.copy(LAYOUT.davit)
    this.table.add(this.davit.group)
    this.mast = new SignalMast()
    this.mast.group.position.copy(LAYOUT.mast)
    this.table.add(this.mast.group)
    this.tray = new ReturnedTray({ cutout: LAYOUT.trayCutout, gap: 0.003 })
    this.trayPosition.set(0, 0, HALF_TRAY + LAYOUT.trayGap + this.tray.depth / 2)
    this.tray.group.position.copy(this.trayPosition)
    this.table.add(this.tray.group)
    this.drawer = new SparesDrawer()
    this.drawer.group.position.copy(LAYOUT.drawer)
    this.table.add(this.drawer.group)
    this.gauge = new TideGauge()
    this.gauge.copy.position.copy(LAYOUT.gaugeCopy)
    this.table.add(this.gauge.copy)
    this.gauge.wall.position.set(LAYOUT.wallGaugeX, LAYOUT.wallGaugeY - (SURFACE_ABOVE_FLOOR - SURFACE), LAYOUT.wallGaugeZ)
    this.table.add(this.gauge.wall)
    this.chrono = new ChronometerPair()
    this.chrono.group.position.copy(LAYOUT.chrono)
    this.table.add(this.chrono.group)
    const consult = consultPlate()
    consult.position.copy(LAYOUT.consult)
    this.table.add(consult)
    const camPlate = cameraPlate()
    camPlate.position.copy(LAYOUT.camera)
    this.table.add(camPlate)

    this.buildMen()
    this.buildPins()
    this.stations = this.computeStations()
    this.bindPointer()
  }

  // ───────────────────────────── Construction ─────────────────────────────

  /** The thirty-two set pieces with their home collars and inventory ordinals, and the drawer's eight spares. */
  private buildMen(): void {
    const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
    for (const color of ['w', 'b'] as const) {
      const backRank: Rank = color === 'w' ? 1 : 8
      const pawnRank: Rank = color === 'w' ? 2 : 7
      const seen: Partial<Record<PieceType, number>> = {}
      FILES.forEach((f, i) => {
        const type = back[i]
        const index = (seen[type] ?? 0) + 1
        seen[type] = index
        this.addMan(buildPiece(type, color, `${f}${backRank}`, { index }), type, color, 'set', `${f}${backRank}`)
      })
      FILES.forEach((f, i) => this.addMan(buildPiece('p', color, `${f}${pawnRank}`, { index: i + 1 }), 'p', color, 'set', `${f}${pawnRank}`))
      for (const spare of this.drawer.spares(color)) {
        const type = spare.userData.spare as PieceType
        const man = this.addMan(spare as THREE.Group, type, color, 'spare', 'SPARE')
        man.drawerHome = { parent: spare.parent ?? this.drawer.group, position: spare.position.clone() }
      }
    }
  }

  private addMan(obj: THREE.Group, type: PieceType, color: Color, kind: 'set' | 'spare', home: Square | 'SPARE'): Man {
    const man: Man = { obj, type, color, kind, home, square: null, trayed: false, moving: false, gen: 0 }
    obj.userData.man = true
    if (kind === 'set') { obj.visible = false; this.root.add(obj) }
    this.men.push(man)
    return man
  }

  /** A pool of thirty-two brass survey pins: a 3 mm shank under a 6 mm head, hidden inside the table until raised. */
  private buildPins(): void {
    const shankLen = 0.024, headH = 0.0025
    const shank = new THREE.CylinderGeometry(0.0015, 0.0015, shankLen, 10)
    shank.translate(0, shankLen / 2, 0)
    const head = new THREE.CylinderGeometry(0.003, 0.0028, headH, 16)
    head.translate(0, shankLen + headH / 2, 0)
    const geometry = mergeGeometries([shank, head], false) ?? shank
    geometry.userData.top = shankLen + headH
    const brass = mat.brass()
    for (let i = 0; i < 32; i++) {
      const pin = new THREE.Mesh(geometry, brass)
      pin.name = 'pin'
      pin.castShadow = true
      pin.visible = false
      pin.position.y = this.pinHiddenY()
      this.root.add(pin)
      this.pinPool.push(pin)
    }
  }

  private pinTop(): number { return (this.pinPool[0]?.geometry.userData.top as number | undefined) ?? 0.0265 }
  private pinHiddenY(): number { return -0.050 }
  private pinUpY(): number { return N.pinRise - this.pinTop() }

  /** The frame's stations (§14.2) carried into world space, relative to where this board actually stands. */
  private computeStations(): BoardStations {
    this.parent.updateWorldMatrix(true, false)
    const centre = this.root.getWorldPosition(new THREE.Vector3())
    const rel = (st: CameraStation): CameraStation => ({
      position: [st.position[0] + centre.x, st.position[1] - SURFACE_ABOVE_FLOOR + centre.y, st.position[2] + centre.z],
      target: [st.target[0] + centre.x, st.target[1] - SURFACE_ABOVE_FLOOR + centre.y, st.target[2] + centre.z],
      ...(st.fov !== undefined ? { fov: st.fov } : {}),
    })
    const s = boardroom.stations ?? {}
    const fallback: CameraStation = { position: [0, 1.15, 0.642], target: [0, 0.751, -0.275] }
    return { table: rel(s.table ?? fallback), chart: rel(s.chart ?? fallback), profile: rel(s.profile ?? fallback) }
  }

  // ───────────────────────────── Geometry helpers ─────────────────────────────

  /** A square's centre in board space at the seated height. */
  private spot(sq: Square): THREE.Vector3 { return this.board.squareCenter(sq) }

  /** A square's centre in the table's space (the davit's), whichever way the susan has turned. */
  private tableXZ(sq: Square): { x: number; z: number } {
    const v = this.spot(sq)
    this.root.localToWorld(v)
    this.table.worldToLocal(v)
    return { x: v.x, z: v.z }
  }

  private seatAt(man: Man, sq: Square): void {
    const p = this.spot(sq)
    man.obj.position.set(p.x, N.rest, p.z)
    man.obj.rotation.set(0, 0, 0)
    man.obj.scale.setScalar(1)
    man.obj.visible = true
    if (man.square && this.bySquare.get(man.square) === man) this.bySquare.delete(man.square)
    man.square = sq
    man.trayed = false
    this.bySquare.set(sq, man)
    this.pickDirty = true
  }

  private unseat(man: Man): void {
    if (man.square && this.bySquare.get(man.square) === man) this.bySquare.delete(man.square)
    man.square = null
    this.pickDirty = true
  }

  /** Hides a man: a set piece under the table, a spare back in its drawer socket. */
  private stow(man: Man): void {
    this.unseat(man)
    man.trayed = false
    man.moving = false
    man.obj.rotation.set(0, 0, 0)
    man.obj.scale.setScalar(1)
    if (man.drawerHome) {
      man.drawerHome.parent.add(man.obj)
      man.obj.position.copy(man.drawerHome.position)
      man.obj.visible = true
    } else {
      this.root.add(man.obj)
      man.obj.visible = false
    }
  }

  private manOf(obj: THREE.Object3D): Man | null {
    let o: THREE.Object3D | null = obj
    while (o) {
      if (o.userData.man) return this.men.find((m) => m.obj === o) ?? null
      o = o.parent
    }
    return null
  }

  // ───────────────────────────── Placement ─────────────────────────────

  /**
   * Places the position at once: every piece on its square (a set piece on its home square when it
   * can be, spares from the drawer for extra queens), the rest hidden, spares in the drawer, and the
   * captured pieces laid in THE RETURNED in the order taken when `captured` is given (tags from the
   * position's history where it has one). Clears pins, selection, a tipped king and the mast.
   */
  sync(position: Position, captured?: { byWhite: PieceType[]; byBlack: PieceType[] }): void {
    this.cancelDrag(false)
    this.selected = null
    this.legal = []
    this.hidePins()
    if (this.mast.current) void this.mast.lower()

    const wanted = position.board()
    const assigned = new Set<Man>()
    const placement = new Map<Square, Man>()
    // Pass 1: a piece already on its square stays.
    for (const p of wanted) {
      const here = this.bySquare.get(p.square)
      if (here && here.type === p.type && here.color === p.color && !here.trayed) { placement.set(p.square, here); assigned.add(here) }
    }
    // Pass 2: a set piece whose home this is.
    for (const p of wanted) {
      if (placement.has(p.square)) continue
      const man = this.men.find((m) => !assigned.has(m) && m.kind === 'set' && m.type === p.type && m.color === p.color && m.home === p.square)
      if (man) { placement.set(p.square, man); assigned.add(man) }
    }
    // Pass 3: any free set piece, then a drawer spare, then an extra.
    for (const p of wanted) {
      if (placement.has(p.square)) continue
      const man = this.men.find((m) => !assigned.has(m) && m.kind === 'set' && m.type === p.type && m.color === p.color)
        ?? this.men.find((m) => !assigned.has(m) && m.kind === 'spare' && m.type === p.type && m.color === p.color)
        ?? this.extra(p.type, p.color)
      placement.set(p.square, man)
      assigned.add(man)
    }

    // The tray: what it should hold, and whether what it holds is a prefix of that.
    const wantTray = captured ? this.trayWants(position, captured) : []
    let prefix = wantTray.length >= this.trayed.length
    for (let i = 0; prefix && i < this.trayed.length; i++) {
      const have = this.trayed[i], want = wantTray[i]
      if (have.man.color !== want.color || have.man.type !== want.type || have.tag !== want.tag || assigned.has(have.man)) prefix = false
    }
    if (!prefix) this.rebuildTray()
    for (const t of this.trayed) assigned.add(t.man)

    // Everyone else is stowed before the tray takes its pieces.
    for (const m of this.men) if (!assigned.has(m)) this.stow(m)
    this.bySquare.clear()
    for (const [sq, man] of placement) {
      this.root.add(man.obj)
      this.seatAt(man, sq)
    }
    for (let i = this.trayed.length; i < wantTray.length; i++) {
      const want = wantTray[i]
      const man = this.men.find((m) => !assigned.has(m) && m.kind === 'set' && m.type === want.type && m.color === want.color && (!want.fromFile || m.home[0] === want.fromFile))
        ?? this.men.find((m) => !assigned.has(m) && m.type === want.type && m.color === want.color)
        ?? this.extra(want.type, want.color)
      assigned.add(man)
      void this.lay(man, want.tag)
    }
    this.pickDirty = true
  }

  /** The tray's wanted contents from the captured lists, tagged from the history when it accounts for them. */
  private trayWants(position: Position, captured: { byWhite: PieceType[]; byBlack: PieceType[] }): TrayWant[] {
    const history = position.history()
    const out: TrayWant[] = []
    const fromHistory: TrayWant[] = []
    let capW = 0, capB = 0
    for (const r of history) {
      if (r.isCapture && r.captured && r.capturedSquare) {
        if (r.color === 'w') capW++; else capB++
        fromHistory.push({ color: r.color === 'w' ? 'b' : 'w', type: r.captured, tag: returnedTag(r.moveNumber, r.capturedSquare) })
      }
      if (r.isPromotion) fromHistory.push({ color: r.color, type: 'p', tag: promotedTag(r.moveNumber, r.to), fromFile: r.from[0] })
    }
    if (capW === captured.byWhite.length && capB === captured.byBlack.length) return fromHistory
    for (const type of captured.byWhite) out.push({ color: 'b', type, tag: 'RETURNED' })
    for (const type of captured.byBlack) out.push({ color: 'w', type, tag: 'RETURNED' })
    return out
  }

  /** A fresh tray in the same place; the pieces of the old one are stowed. */
  private rebuildTray(): void {
    for (const t of this.trayed) this.stow(t.man)
    this.trayed.length = 0
    this.table.remove(this.tray.group)
    this.tray = new ReturnedTray({ cutout: LAYOUT.trayCutout, gap: 0.003 })
    this.tray.group.position.copy(this.trayPosition)
    this.table.add(this.tray.group)
  }

  /** A piece beyond the set and the spares (a third queen): built on demand, collared SPARE. */
  private extra(type: PieceType, color: Color): Man {
    const man = this.addMan(buildPiece(type, color, 'SPARE'), type, color, 'spare', 'SPARE')
    this.root.add(man.obj)
    return man
  }

  /** Lays a man in THE RETURNED with its tag (the tag slides in; 'tray'). */
  private async lay(man: Man, tag: string): Promise<void> {
    this.unseat(man)
    man.trayed = true
    man.obj.visible = true
    this.trayed.push({ man, tag })
    sfx('tray')
    await this.tray.place(man.obj, tag)
  }

  // ───────────────────────────── Choreography ─────────────────────────────

  /**
   * Plays one move as the bible choreographs it (§5.5): the player's piece rises, glides at
   * 0.220 m/s and seats; a knight hops; the chair's piece travels by davit; a captured piece is
   * hoisted out of frame and laid in THE RETURNED under the insert; castling seats the rook 250 ms
   * after the king; a promotion opens the SPARES drawer; check hoists U, mate N over C. Resolves when
   * the pieces and the davit are still again (the mast may still be hauling).
   */
  async animateMove(move: MoveRecord, o: AnimateOptions): Promise<void> {
    const mover = this.bySquare.get(move.from)
    if (!mover) return
    this.cancelDrag(false)
    if (this.selected === mover) this.selected = null
    const tails: Promise<void>[] = []
    const claim = (m: Man) => { m.moving = true; m.gen++ }
    claim(mover)
    /** The davit still returning an en-passant pawn while the capturer glides; it parks afterwards. */
    let returning: Promise<void> | null = null
    const rook = move.rookFrom ? this.bySquare.get(move.rookFrom) : undefined
    if (rook) claim(rook)
    try {
      // Capture: the capturer rises and holds while the davit returns the piece.
      if (move.isCapture && move.capturedSquare) {
        const victim = this.bySquare.get(move.capturedSquare)
        if (victim && victim !== mover) {
          claim(victim)
          if (!o.byChair && !move.isEnPassant) await this.riseTo(mover, N.lift)
          const returned = this.returnPiece(victim, move, o, ['RETURNED', `MOVE ${move.moveNumber}`, isletName(victim.square ?? move.capturedSquare).toUpperCase()])
          if (move.isEnPassant && !o.byChair) returning = returned
          else await returned
        }
      }

      if (o.byChair) {
        await this.chairCarry(mover, move.from, move.to, o, move.isMate && !move.isPromotion)
        if (rook && move.rookTo) await this.chairCarry(rook, move.rookFrom as Square, move.rookTo, o, false)
        if (move.isPromotion) await this.promote(mover, move, o, true)
        else tails.push(this.davit.park())
      } else {
        if (move.piece === 'n') await this.knightHop(mover, move.to, move.isMate)
        else if (rook && move.rookTo) await this.castleByHand(mover, rook, move)
        else await this.glideTo(mover, move.to, { rise: true, seat: true, slow: move.isMate && !move.isPromotion })
        if (returning) await returning
        if (move.isPromotion) await this.promote(mover, move, o, false)
        if (!this.davit.isParked) tails.push(this.davit.park())
      }

      this.hidePins()
      if (move.isMate) void this.mast.hoist('NC')
      else if (move.isCheck) { sfx('check'); void this.mast.hoist('U') }
      else if (this.mast.current === 'U') void this.mast.lower()
    } finally {
      await Promise.all(tails)
      mover.moving = false
      if (rook) rook.moving = false
      this.motion.skipping = false
      this.pickDirty = true
    }
  }

  /** Lifts a piece straight to `y` in 90 ms with the felt's un-stick. */
  private riseTo(man: Man, y: number, ms = N.riseMs): Promise<void> {
    const from = man.obj.position.y
    if (Math.abs(from - y) < 1e-5) return Promise.resolve()
    if (y > from) sfx('rise')
    return this.motion.run('rise', ms, (k) => { man.obj.position.y = THREE.MathUtils.lerp(from, y, k) }, ease.outCubic)
  }

  /** Seats a piece from where it hovers onto `sq` in 60 ms with the brass tick. */
  private async seat(man: Man, sq: Square): Promise<void> {
    const p = this.spot(sq)
    const from = man.obj.position.clone()
    await this.motion.run('seat', N.seatMs, (k) => {
      man.obj.position.set(THREE.MathUtils.lerp(from.x, p.x, k), THREE.MathUtils.lerp(from.y, N.rest, k), THREE.MathUtils.lerp(from.z, p.z, k))
    }, ease.inCubic)
    sfx('seat')
    this.seatAt(man, sq)
  }

  /** The glide: constant 0.220 m/s at the lifted height, 40 ms in, 60 ms out, pins sinking under it. */
  private travel(man: Man, sq: Square, y: number, o: { slow?: boolean; delayMs?: number } = {}): Promise<void> {
    const p = this.spot(sq)
    const x0 = man.obj.position.x, z0 = man.obj.position.z
    const dist = Math.hypot(p.x - x0, p.z - z0)
    const ms = (dist / N.speed) * 1000
    if (ms < 1) return Promise.resolve()
    if (o.slow) void clock.slowMotion(N.slowMotion, ms / N.slowMotion)
    sfx('glide', 1)
    return this.motion.run('glide', ms, (k) => {
      man.obj.position.x = THREE.MathUtils.lerp(x0, p.x, k)
      man.obj.position.z = THREE.MathUtils.lerp(z0, p.z, k)
      man.obj.position.y = y
      this.passPins(man)
    }, handEase(ms), o.delayMs ?? 0)
  }

  /** Rise, glide, seat: the player's ordinary move. */
  private async glideTo(man: Man, sq: Square, o: { rise: boolean; seat: boolean; slow?: boolean; delayMs?: number }): Promise<void> {
    if (o.rise) await this.riseTo(man, N.lift)
    await this.travel(man, sq, N.lift, { slow: o.slow, delayMs: o.delayMs })
    if (o.seat) await this.seat(man, sq)
  }

  /** The knight: up 0.110 in 220 ms, straight across, down in 220 ms, then the head turns to face the way it came. */
  private async knightHop(man: Man, sq: Square, slow: boolean): Promise<void> {
    const from = man.obj.position.clone()
    const p = this.spot(sq)
    const top = N.rest + N.knight
    sfx('rise')
    await this.motion.run('knight-rise', N.knightMs, (k) => { man.obj.position.y = THREE.MathUtils.lerp(from.y, top, k) }, ease.outCubic)
    await this.travel(man, sq, top, { slow })
    await this.motion.run('knight-descend', N.knightMs, (k) => { man.obj.position.y = THREE.MathUtils.lerp(top, N.rest, k) }, ease.inCubic)
    sfx('seat')
    this.seatAt(man, sq)
    await this.turnHead(man, p.x - from.x, p.z - from.z)
  }

  /** Turns a knight's periscope head to face a direction of travel in 200 ms. */
  private turnHead(man: Man, dx: number, dz: number): Promise<void> {
    const head = man.obj.getObjectByName('head')
    if (!head || (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6)) return Promise.resolve()
    const from = head.rotation.y
    const delta = wrapAngle(Math.atan2(dx, dz) - from)
    sfx('knight')
    return this.motion.run('knight-head', N.headMs, (k) => { head.rotation.y = from + delta * k }, ease.inOutCubic)
  }

  /** The player castles: king and rook rise and glide together; the king seats first, the rook 250 ms later. */
  private async castleByHand(king: Man, rook: Man, move: MoveRecord): Promise<void> {
    const rookTo = move.rookTo as Square
    const kingMs = (Math.hypot(this.spot(move.to).x - king.obj.position.x, this.spot(move.to).z - king.obj.position.z) / N.speed) * 1000
    const rookMs = (Math.hypot(this.spot(rookTo).x - rook.obj.position.x, this.spot(rookTo).z - rook.obj.position.z) / N.speed) * 1000
    await Promise.all([this.riseTo(king, N.lift), this.riseTo(rook, N.lift)])
    const lag = Math.max(0, kingMs + N.rookLagMs - rookMs)
    await Promise.all([
      this.glideTo(king, move.to, { rise: false, seat: true, slow: move.isMate }),
      this.glideTo(rook, rookTo, { rise: false, seat: true, delayMs: lag }),
    ])
  }

  /**
   * The chair's move by davit: unpark, tip to the piece at 0.300 m/s, lower, clamp (the chair's
   * clock stops), hoist 0.110, travel, lower, release; the davit is left over the square for the caller to park.
   */
  private async chairCarry(man: Man, from: Square, to: Square, o: AnimateOptions, slow: boolean): Promise<void> {
    const a = this.tableXZ(from), b = this.tableXZ(to)
    const davit = this.davit
    const tipMs = (p: { x: number; z: number }) => {
      const t = davit.tipWorld()
      this.table.worldToLocal(t)
      return (Math.hypot(p.x - t.x, p.z - t.z) / 0.300) * 1000
    }
    await this.motion.hold('davit-tip', tipMs(a) + 200, () => davit.goTo(a.x, a.z))
    await this.motion.hold('davit-lower', 240, () => davit.lower())
    await this.motion.hold('davit-clamp', 120, () => davit.clamp(collarRadius(man.type)))
    sfx('clamp')
    o.onClamp?.()
    davit.carry(man.obj)
    await this.motion.hold('davit-hoist', 300, () => davit.hoist(N.knight))
    const ms = tipMs(b)
    if (slow) void clock.slowMotion(N.slowMotion, ms / N.slowMotion)
    await this.motion.hold('davit-travel', ms, () => davit.goTo(b.x, b.z))
    await this.motion.hold('davit-lower', 240, () => davit.lower())
    sfx('seat')
    await this.motion.hold('davit-release', 100, () => davit.release())
    davit.drop()
    const p0 = this.spot(from)
    this.seatAt(man, to)
    const p1 = this.spot(to)
    await this.motion.hold('davit-raise', 240, () => davit.raise())
    if (man.type === 'n') await this.turnHead(man, p1.x - p0.x, p1.z - p0.z)
  }

  /**
   * The davit hoists what it holds out of the top of frame: 0.400 above the lacquer in 600 ms,
   * straight up, no tumble (two 300 ms legs of the davit's own hoist).
   */
  private async hoistOut(): Promise<void> {
    sfx('hoist')
    const jaw = this.davit.jawWorld()
    this.table.worldToLocal(jaw)
    const already = Math.max(0, jaw.y - SURFACE - 0.005)
    const leg = Math.max(0.001, (N.captureHoist - already) / 2)
    await this.motion.hold('capture-hoist', 600, async () => { await this.davit.hoist(leg); await this.davit.hoist(leg) })
  }

  /**
   * A capture: the davit fetches the piece, hoists it out of frame, and while the insert runs the
   * piece is laid in THE RETURNED with its tag; the davit comes back down to travel height meanwhile.
   */
  private async returnPiece(victim: Man, move: MoveRecord, o: AnimateOptions, lines: string[]): Promise<void> {
    const sq = victim.square ?? move.capturedSquare ?? move.to
    const p = this.tableXZ(sq)
    const davit = this.davit
    await this.motion.hold('davit-tip', 1500, () => davit.goTo(p.x, p.z))
    await this.motion.hold('davit-lower', 240, () => davit.lower())
    await this.motion.hold('davit-clamp', 120, () => davit.clamp(collarRadius(victim.type)))
    sfx('clamp')
    davit.carry(victim.obj)
    await this.hoistOut()
    davit.drop()
    const tag = lines.join('  ')
    await Promise.all([this.lay(victim, tag), o.insert?.(lines) ?? Promise.resolve(), this.motion.hold('davit-raise', 240, () => davit.raise())])
    victim.moving = false
  }

  /**
   * Promotion: the davit fetches the pawn from its new square, hoists it out of frame and lays it
   * in THE RETURNED as PROMOTED; the SPARES drawer opens; the piece is chosen (the chair's comes
   * with the move); the drawer closes and the davit sets the spare down on the square and parks.
   */
  private async promote(pawn: Man, move: MoveRecord, o: AnimateOptions, byChair: boolean): Promise<void> {
    const davit = this.davit
    const p = this.tableXZ(move.to)
    await this.motion.hold('davit-tip', 1500, () => davit.goTo(p.x, p.z))
    await this.motion.hold('davit-lower', 240, () => davit.lower())
    await this.motion.hold('davit-clamp', 120, () => davit.clamp(collarRadius('p')))
    sfx('clamp')
    davit.carry(pawn.obj)
    await this.hoistOut()
    davit.drop()
    const lines = ['PROMOTED', `MOVE ${move.moveNumber}`, isletName(move.to).toUpperCase()]
    await Promise.all([this.lay(pawn, lines.join('  ')), o.insert?.(lines) ?? Promise.resolve()])
    pawn.moving = false
    sfx('spares')
    await this.motion.hold('drawer-open', 520, () => this.drawer.open(pawn.color))
    let type: PieceType | undefined = move.promotion
    if (!byChair && o.promotionChooser) type = await o.promotionChooser()
    const chosen: PieceType = type ?? 'q'
    await this.motion.hold('drawer-close', 520, () => this.drawer.close())
    const spare = this.men.find((m) => m.kind === 'spare' && m.type === chosen && m.color === pawn.color && !m.square && !m.trayed)
      ?? this.men.find((m) => m.type === chosen && m.color === pawn.color && !m.square && !m.trayed)
      ?? this.extra(chosen, pawn.color)
    spare.moving = true
    // Into the jaws, out of frame, then down onto the square.
    const jaw = davit.jawWorld()
    this.root.worldToLocal(jaw)
    spare.obj.rotation.set(0, 0, 0)
    spare.obj.scale.setScalar(1)
    spare.obj.position.set(jaw.x, jaw.y - N.jawAboveBase, jaw.z)
    spare.obj.visible = true
    this.root.add(spare.obj)
    davit.carry(spare.obj)
    await this.motion.hold('davit-raise', 240, () => davit.raise())
    await this.motion.hold('davit-lower', 240, () => davit.lower())
    sfx('seat')
    await this.motion.hold('davit-release', 100, () => davit.release())
    davit.drop()
    this.seatAt(spare, move.to)
    spare.moving = false
    await this.motion.hold('davit-raise', 240, () => davit.raise())
    await this.davit.park()
  }

  /** A king tips over by itself in 600 ms, base toward the chair, and knocks on the lacquer. */
  async tipKing(color: Color): Promise<void> {
    const king = this.men.find((m) => m.type === 'k' && m.color === color && m.square)
    if (!king) return
    king.moving = true
    const r = 0.017
    const o = king.obj.position.clone()
    const pivot = new THREE.Vector3(o.x, o.y, o.z + r)
    await this.motion.run('tip', N.tipMs, (k) => {
      const a = (Math.PI / 2) * k
      king.obj.rotation.x = a
      king.obj.position.set(pivot.x, pivot.y + r * Math.sin(a), pivot.z - r * Math.cos(a))
    }, ease.inCubic)
    sfx('knock')
    king.moving = false
  }

  /**
   * The end of a game after the last move has played: a draw puts both flags at half height;
   * a resignation tips the loser's king and hoists P; flag fall shows nothing but the gauge;
   * checkmate is already flown by animateMove (N over C is hoisted here if it is not).
   */
  async finish(reason: GameEndReason, loser?: Color): Promise<void> {
    switch (reason) {
      case 'checkmate':
        if (this.mast.current !== 'NC') await this.mast.hoist('NC')
        return
      case 'resignation':
        await this.tipKing(loser ?? this.playerColor)
        await this.mast.hoist('P')
        return
      case 'timeout':
        return
      default:
        await this.mast.halfMast()
    }
  }

  /** Resolves every running choreography to its end state: any key skips the chair's move. */
  skip(): void {
    this.motion.skip()
    this.davit.skip()
  }

  /**
   * For stills only: freezes the named phase of the next choreography at progress `k` by stopping
   * the world clock there (`null` clears). Phases: rise, glide, seat, knight-rise, knight-descend,
   * knight-head, davit-tip, davit-lower, davit-clamp, davit-hoist, davit-travel, davit-release,
   * davit-raise, capture-hoist, drawer-open, drawer-close, tip, pin.
   */
  debugFreeze(phase: string | null, k = 0.5): void {
    this.motion.freeze = phase ? { phase, k: THREE.MathUtils.clamp(k, 0, 1) } : null
  }

  // ───────────────────────────── Pins and selection ─────────────────────────────

  /**
   * Selection: the selected piece rises 3 mm (the only lift), and brass survey pins rise out of
   * every legal square in 120 ms, staggered 12 ms nearest first, each with its click pitched by file.
   * Nothing is coloured: `lastMove` and `check` are accepted for the contract and change nothing here.
   */
  highlight(selected: Square | null, legal: Square[], lastMove?: { from: Square; to: Square }, check?: Square | null): void {
    void lastMove
    void check
    const man = selected ? this.bySquare.get(selected) ?? null : null
    if (this.selected !== man) {
      const old = this.selected
      if (old && !old.moving && old.square) this.lift(old, N.rest)
      this.selected = man
      if (man && !man.moving && !(this.drag && this.drag.man === man && this.drag.active)) this.lift(man, N.lift)
    }
    const same = legal.length === this.legal.length && legal.every((sq, i) => sq === this.legal[i])
    if (same && this.pins.length === legal.length) return
    this.legal = legal.slice()
    this.hidePins()
    if (!selected || legal.length === 0) return
    const origin = this.spot(selected)
    const ordered = legal
      .map((sq) => ({ sq, d: this.spot(sq).distanceTo(origin) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pinPool.length)
    ordered.forEach(({ sq }, i) => {
      const mesh = this.pinPool[i]
      const p = this.spot(sq)
      mesh.position.set(p.x, this.pinHiddenY(), p.z)
      mesh.visible = true
      const pin: Pin = { mesh, square: sq, sunk: false, up: false }
      this.pins.push(pin)
      const from = mesh.position.y, to = this.pinUpY()
      let clicked = false
      void this.motion.run('pin', N.pinMs, (k) => {
        if (!clicked && k > 0) { clicked = true; sfx('pin', fileIndex(sq) / 7) }
        mesh.position.y = THREE.MathUtils.lerp(from, to, k)
        if (k >= 1) pin.up = true
      }, ease.outCubic, i * N.pinStaggerMs)
    })
  }

  /** A select or deselect lift of 3 mm in 90 ms; a newer lift on the same man cancels an older one. */
  private lift(man: Man, y: number): void {
    const gen = ++man.gen
    const from = man.obj.position.y
    if (y > from) sfx('rise')
    void this.motion.run('lift', N.riseMs, (k) => { if (man.gen === gen) man.obj.position.y = THREE.MathUtils.lerp(from, y, k) }, ease.outCubic)
  }

  /** Sinks a pin 12 mm when the moving piece passes over it. */
  private passPins(man: Man): void {
    const x = man.obj.position.x, z = man.obj.position.z
    for (const pin of this.pins) {
      if (pin.sunk) continue
      if (Math.abs(pin.mesh.position.x - x) < PITCH / 2 && Math.abs(pin.mesh.position.z - z) < PITCH / 2) {
        pin.sunk = true
        const from = pin.mesh.position.y, to = this.pinUpY() - N.pinSink
        void this.motion.run('pin-sink', N.pinSinkMs, (k) => { pin.mesh.position.y = THREE.MathUtils.lerp(from, to, k) }, ease.inCubic)
      }
    }
  }

  /** Every pin back into the table. */
  private hidePins(): void {
    for (const pin of this.pins) { pin.mesh.visible = false; pin.mesh.position.y = this.pinHiddenY() }
    this.pins.length = 0
  }

  // ───────────────────────────── Input ─────────────────────────────

  /** Turns pointer input over the board on or off; off sets any dragged piece down and clears the hover. */
  setInteractive(on: boolean): void {
    if (this.interactive === on) return
    this.interactive = on
    if (!on) {
      this.cancelDrag(true)
      this.setHover(null)
    }
  }

  /** Called with the square clicked, or the square a dragged piece is released over when it is legal. */
  onSquare(handler: (sq: Square) => void): void { this.squareHandler = handler }

  /** Called as the hovered square changes (null off the board); the rim words warm at the same time. */
  onHover(handler: (sq: Square | null) => void): void { this.hoverHandler = handler }

  /** The square under a pointer position, or null. */
  hoverSquare(clientX: number, clientY: number): Square | null {
    if (this.pickDirty) this.rebuildPickables()
    const hits = this.stage.pick(clientX, clientY, this.pickables)
    for (const h of hits) {
      const sq = h.object.userData.square as Square | undefined
      if (sq) return sq
      const man = this.manOf(h.object)
      if (man?.square) return man.square
    }
    return null
  }

  private rebuildPickables(): void {
    this.pickables = Array.from(this.board.squares.values())
    for (const m of this.bySquare.values()) this.pickables.push(m.obj)
    this.pickDirty = false
  }

  private setHover(sq: Square | null): void {
    if (sq === this.hovered) return
    this.hovered = sq
    if (sq) this.board.setRimHover(sq[0] as File, Number(sq[1]) as Rank)
    else this.board.setRimHover(null, null)
    this.hoverHandler?.(sq)
  }

  private bindPointer(): void {
    const canvas = this.stage.renderer.domElement
    const on = (target: EventTarget, type: string, fn: EventListener) => { target.addEventListener(type, fn); this.listeners.push({ target, type, fn }) }
    on(canvas, 'pointerdown', ((e: PointerEvent) => this.pointerDown(e)) as EventListener)
    on(window, 'pointermove', ((e: PointerEvent) => this.pointerMove(e)) as EventListener)
    on(window, 'pointerup', ((e: PointerEvent) => this.pointerUp(e)) as EventListener)
    on(canvas, 'contextmenu', ((e: Event) => { if (this.interactive && this.drag) { e.preventDefault(); this.cancelDrag(true) } }) as EventListener)
    on(window, 'keydown', ((e: KeyboardEvent) => { if (e.key === 'Escape' && this.drag) this.cancelDrag(true) }) as EventListener)
  }

  private pendingClick: Square | null = null

  /** Down on the player's own piece selects it and may begin a drag; down elsewhere arms a click. */
  private pointerDown(e: PointerEvent): void {
    if (!this.interactive || e.button !== 0 || this.turning) return
    const sq = this.hoverSquare(e.clientX, e.clientY)
    if (!sq) return
    const man = this.bySquare.get(sq)
    this.rect = this.stage.renderer.domElement.getBoundingClientRect()
    if (man && man.color === this.playerColor && !man.moving) {
      this.drag = { man, from: sq, x: e.clientX, y: e.clientY, active: false }
      this.squareHandler?.(sq)
    } else {
      this.drag = null
      this.pendingClick = sq
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.interactive) return
    const d = this.drag
    if (d) {
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
        d.active = true
        d.man.gen++
        this.carryTo(d.man, N.drag, N.riseMs)
      }
      if (this.projectToBoard(e.clientX, e.clientY, this.hit)) {
        d.man.obj.position.x = THREE.MathUtils.clamp(this.hit.x, -FIELD / 2 - 0.02, FIELD / 2 + 0.02)
        d.man.obj.position.z = THREE.MathUtils.clamp(this.hit.z, -FIELD / 2 - 0.02, FIELD / 2 + 0.02)
      }
      this.setHover(this.hoverSquare(e.clientX, e.clientY))
      return
    }
    this.setHover(this.hoverSquare(e.clientX, e.clientY))
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.interactive) return
    const d = this.drag
    if (d) {
      this.drag = null
      if (!d.active) return
      const over = this.hoverSquare(e.clientX, e.clientY)
      if (over && over !== d.from && this.legal.includes(over)) {
        const man = d.man
        const p = this.spot(over)
        man.obj.position.set(p.x, N.drag, p.z)
        this.squareHandler?.(over)
        // If nobody claims the move, the piece goes home.
        void clock.wait(300).then(() => { if (!man.moving && man.square === d.from && man.obj.position.y > N.lift + 1e-4) this.setDown(man, d.from) })
      } else {
        this.setDown(d.man, d.from)
      }
      return
    }
    const sq = this.pendingClick
    this.pendingClick = null
    if (sq && this.hoverSquare(e.clientX, e.clientY) === sq) this.squareHandler?.(sq)
  }

  /** Lifts a dragged piece to the carry height. */
  private carryTo(man: Man, y: number, ms: number): void {
    const gen = man.gen
    const from = man.obj.position.y
    void this.motion.run('lift', ms, (k) => { if (man.gen === gen) man.obj.position.y = THREE.MathUtils.lerp(from, y, k) }, ease.outCubic)
  }

  /** Sets a dragged piece back down over its own square, still selected (3 mm up) if it is. */
  private setDown(man: Man, from: Square): void {
    const gen = ++man.gen
    const p = this.spot(from)
    const start = man.obj.position.clone()
    const restY = this.selected === man ? N.lift : N.rest
    const ms = 160
    void this.motion.run('lift', ms, (k) => {
      if (man.gen !== gen) return
      man.obj.position.x = THREE.MathUtils.lerp(start.x, p.x, k)
      man.obj.position.z = THREE.MathUtils.lerp(start.z, p.z, k)
    }, ease.outCubic).then(() => {
      if (man.gen !== gen) return
      const y0 = man.obj.position.y
      void this.motion.run('lift', N.riseMs, (k) => { if (man.gen === gen) man.obj.position.y = THREE.MathUtils.lerp(y0, restY, k) }, ease.inCubic)
    })
  }

  private cancelDrag(setDown: boolean): void {
    const d = this.drag
    this.drag = null
    this.pendingClick = null
    if (d && d.active && setDown) this.setDown(d.man, d.from)
  }

  /** Projects a pointer position onto the plane 18 mm above the lacquer; the result is in board space. */
  private projectToBoard(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    const r = this.rect ?? this.stage.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.stage.camera)
    this.root.updateWorldMatrix(true, false)
    const normal = this.tmp.set(0, 1, 0).transformDirection(this.root.matrixWorld)
    const point = this.root.getWorldPosition(out).addScaledVector(normal, N.drag)
    this.plane.setFromNormalAndCoplanarPoint(normal, point)
    const hit = this.ray.ray.intersectPlane(this.plane, out)
    if (!hit) return false
    this.root.worldToLocal(out)
    return true
  }

  // ───────────────────────────── Instruments ─────────────────────────────

  /** The tide gauge: centipawns from the chair's side (positive, the water rises toward the chair) and mate-in-N signed the same way. */
  setGauge(cp: number, mateIn?: number): void { this.gauge.set(cp, mateIn) }

  /** The chronometer pair. */
  setClocks(state: ClockState): void { this.chrono.set(state) }

  /** Pieces lying in THE RETURNED, by side. */
  returned(): ReturnedCounts { return this.tray.count() }

  /** Which side the guest plays; taking the dark side turns the tray 180° on its lazy susan (1400 ms, one tick). */
  setPlayerColor(c: Color): void {
    if (c === this.playerColor) return
    this.playerColor = c
    this.cancelDrag(true)
    const from = this.root.rotation.y
    const to = c === 'w' ? 0 : Math.PI
    this.turning = true
    void this.motion.run('turn', N.turnMs, (k) => { this.root.rotation.y = THREE.MathUtils.lerp(from, to, k) }, ease.linear).then(() => {
      this.root.rotation.y = to
      this.turning = false
      sfx('tick')
    })
  }

  /** Removes the listeners and everything built from the parent. Geometry and materials stay cached. */
  dispose(): void {
    for (const l of this.listeners) l.target.removeEventListener(l.type, l.fn)
    this.listeners.length = 0
    this.gauge.dispose()
    this.parent.remove(this.root)
    this.parent.remove(this.table)
  }
}
