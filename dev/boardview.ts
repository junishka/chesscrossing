// Board view demo (port 5189): the BoardView on a teak table in a pale-blue tongue-and-groove room,
// under lightRig('boardroom'), seen from the bible's three stations. A scripted Ruy Lopez runs on
// window.__demo: white by the player (by hand), black by the chair (by davit).
// Query: ?view=table|chart|profile|tray
import * as THREE from 'three'
import { Chess } from 'chess.js'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { bus } from '../src/core/bus'
import { palette } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { mat } from '../src/scene/materials'
import { lightRig } from '../src/scene/lights'
import { CameraRig } from '../src/scene/camera'
import { BoardView } from '../src/scene/boardView'
import { Position } from '../src/chess/rules'
import type { CameraStation, MoveRecord, PieceType, Square } from '../src/types'

const p = palette.boardroom
const TABLE_Y = 0.720
const LACQUER_Y = 0.729
const WALL_Z = -0.242 - 2.2
const ASPECT = 1.85

/** The scripted game: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O. */
const SCRIPT = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O']
/** A short line ending in check: 1. e4 f5 2. Qh5+. */
const CHECK_LINE = ['e4', 'f5', 'Qh5+']

function shaded(m: THREE.Mesh): THREE.Mesh { m.castShadow = true; m.receiveShadow = true; return m }

/** The Board Room's shell: teak floor, pale-blue tongue-and-groove on the far wall, a dado, skirting. */
function room(): THREE.Group {
  const g = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'floor', repeat: [1, 14] }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -1)
  floor.receiveShadow = true
  g.add(floor)
  // Tongue-and-groove boards 0.09 wide: the stripe wallpaper at that pitch, bg the wall blue, fg its darker groove.
  const boards = mat.wallpaper({ pattern: 'stripe', bg: p.wall, fg: p.wallAlt, scale: 0.8, repeat: [7 / 0.36, 4.2 / 0.36] })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), boards)
  wall.position.set(0, 2.1, WALL_Z)
  wall.receiveShadow = true
  g.add(wall)
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.2), boards)
    side.position.set(sx * 3.5, 2.1, WALL_Z / 2)
    side.rotation.y = -sx * Math.PI / 2
    side.receiveShadow = true
    g.add(side)
  }
  const skirting = shaded(new THREE.Mesh(new THREE.BoxGeometry(7, 0.14, 0.03), mat.lacquer(p.trim)))
  skirting.position.set(0, 0.07, WALL_Z + 0.015)
  g.add(skirting)
  const dado = shaded(new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 0.025), mat.lacquer(p.trim)))
  dado.position.set(0, 1.28, WALL_Z + 0.0125)
  g.add(dado)
  // The wall clock, left of the gauge at the same height, for the symmetry of Table view (§5.9).
  const clockFace = new THREE.Group()
  const bezel = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 48), mat.brass()))
  bezel.rotation.x = Math.PI / 2
  clockFace.add(bezel)
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.135, 48), mat.paper(p.paper))
  face.position.z = 0.0205
  clockFace.add(face)
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.006, i % 3 === 0 ? 0.022 : 0.012, 0.002), mat.flat(p.ink))
    const a = (i / 12) * Math.PI * 2
    tick.position.set(Math.sin(a) * 0.115, Math.cos(a) * 0.115, 0.022)
    tick.rotation.z = -a
    clockFace.add(tick)
  }
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.075, 0.002), mat.flat(p.ink))
  hour.position.set(0.03, 0.02, 0.023)
  hour.rotation.z = -0.95
  const minute = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.11, 0.002), mat.flat(p.ink))
  minute.position.set(-0.03, 0.04, 0.024)
  minute.rotation.z = 0.55
  clockFace.add(hour, minute)
  clockFace.position.set(-0.55, 0.98, WALL_Z + 0.02)
  g.add(clockFace)
  return g
}

/** The table: teak, 1.2 × 0.9, top at 0.72, centred on the room's centre. */
function table(): THREE.Group {
  const g = new THREE.Group()
  const teak = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'table', repeat: [3, 2] })
  const top = shaded(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.9), teak))
  top.position.y = TABLE_Y - 0.02
  g.add(top)
  const apron = shaded(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.82), teak))
  apron.position.y = TABLE_Y - 0.08
  g.add(apron)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, TABLE_Y - 0.04, 16), teak))
    leg.position.set(sx * 0.52, (TABLE_Y - 0.04) / 2, sz * 0.37)
    g.add(leg)
  }
  return g
}

/** The Station Master's chair behind the table: beech and corduroy, back top at 1.02. */
function chair(): THREE.Group {
  const g = new THREE.Group()
  const beech = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'chair', repeat: [1, 1] })
  const seat = shaded(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), mat.velvet(p.accent2)))
  seat.position.y = 0.46
  g.add(seat)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.44, 12), beech))
    leg.position.set(sx * 0.19, 0.22, sz * 0.18)
    g.add(leg)
  }
  const back = shaded(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.03), beech))
  back.position.set(0, 0.75, -0.19)
  g.add(back)
  for (const sx of [-1, 1]) {
    const post = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 12), beech))
    post.position.set(sx * 0.205, 1.06, -0.19)
    g.add(post)
  }
  return g
}

/** Which black and white pieces a history took, in order, for BoardView.sync. */
function capturedOf(position: Position): { byWhite: PieceType[]; byBlack: PieceType[] } {
  const byWhite: PieceType[] = [], byBlack: PieceType[] = []
  for (const r of position.history()) if (r.captured) (r.color === 'w' ? byWhite : byBlack).push(r.captured)
  return { byWhite, byBlack }
}

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const fit = () => {
    const w = window.innerWidth
    const h = Math.round(w / ASPECT)
    app.style.width = `${w}px`
    app.style.height = `${Math.min(h, window.innerHeight)}px`
    app.style.top = `${Math.max(0, Math.round((window.innerHeight - h) / 2))}px`
  }
  fit()
  window.addEventListener('resize', fit)
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(p.wall)
  stage.setVignette(0.18)

  const frame = new THREE.Group()
  frame.name = 'frame:boardroom'
  frame.add(room(), table())
  const ch = chair()
  ch.position.set(0, 0, -0.78)
  frame.add(ch)
  stage.scene.add(frame)

  const lights = lightRig('boardroom', new THREE.Vector3(0, 0.75, -0.3))
  const key = lights.getObjectByName('key') as THREE.DirectionalLight | null
  if (key) {
    const cam = key.shadow.camera
    cam.left = -1.6; cam.right = 1.6; cam.top = 1.6; cam.bottom = -1.6
    cam.updateProjectionMatrix()
    key.shadow.bias = -0.00015
    key.shadow.normalBias = 0.004
  }
  stage.scene.add(lights)

  const view = new BoardView(stage, frame, new THREE.Vector3(0, LACQUER_Y, 0), 'w')
  view.setClocks({ w: 15 * 60000, b: 15 * 60000, running: 'w', incrementMs: 10000 })
  view.setGauge(0)
  view.setInteractive(true)

  // 35 mm gauge; the station's fov is the lens's vertical field in a 1.85 frame.
  const rig = new CameraRig(stage.camera, stage)
  stage.camera.filmGauge = 35
  stage.camera.near = 0.02
  const extra: Record<string, { station: CameraStation; lens: number }> = {
    tray: { station: { position: [0, 1.12, 0.62], target: [0, TABLE_Y, 0.33] }, lens: 50 },
    davit: { station: { position: [-0.62, 1.05, -0.05], target: [0.05, 0.86, -0.40] }, lens: 35 },
  }
  const go = (name: string): void => {
    const own = name === 'table' || name === 'chart' || name === 'profile'
    const station = own ? view.stations[name] : (extra[name] ?? extra.tray).station
    const lens = own ? view.lenses[name] : (extra[name] ?? extra.tray).lens
    rig.jump(station)
    stage.camera.setFocalLength(lens)
    stage.camera.updateProjectionMatrix()
  }
  go(new URLSearchParams(location.search).get('view') ?? 'table')

  clock.onTick(() => stage.render())
  clock.start()

  // The game.
  let chess = new Chess()
  let position = new Position()
  const log: { t: number; name: string; velocity?: number }[] = []
  const t0 = performance.now()
  bus.on('audio:sfx', (e) => log.push({ t: Math.round(performance.now() - t0), name: e.name, ...(e.velocity !== undefined ? { velocity: e.velocity } : {}) }))
  const insert = async (lines: string[]): Promise<void> => { log.push({ t: Math.round(performance.now() - t0), name: 'insert:' + lines.join(' / ') }); await clock.wait(500) }

  /** Plays one SAN on both boards and returns its record. */
  const play = (san: string): MoveRecord | null => {
    const m = chess.move(san)
    const record = position.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) })
    return record
  }
  const reset = (): void => { chess = new Chess(); position = new Position() }
  /** The first `n` plies of a line, placed at once. */
  const playTo = (n: number, line: string[] = SCRIPT): void => {
    reset()
    for (let i = 0; i < n && i < line.length; i++) play(line[i])
    view.sync(position, capturedOf(position))
  }
  const animate = async (san: string, byChair: boolean): Promise<void> => {
    const record = play(san)
    if (!record) return
    await view.animateMove(record, { byChair, insert, onClamp: () => log.push({ t: Math.round(performance.now() - t0), name: 'onClamp' }) })
    if (record.isMate || position.status().isGameOver) {
      const st = position.status()
      if (st.reason) await view.finish(st.reason, st.turn)
    }
  }

  view.onSquare((sq) => {
    const selected = demo.selected
    if (selected && selected !== sq) {
      const legal = position.legalTargets(selected)
      if (legal.includes(sq)) {
        const record = position.move({ from: selected, to: sq })
        demo.selected = null
        view.highlight(null, [])
        if (record) { chess.move(record.san); void view.animateMove(record, { byChair: false, insert }) }
        return
      }
    }
    const man = position.get(sq)
    if (man && man.color === position.turn() && selected !== sq) {
      demo.selected = sq
      view.highlight(sq, position.legalTargets(sq))
    } else {
      demo.selected = null
      view.highlight(null, [])
    }
  })

  const demo = {
    stage, rig, board: view, log,
    selected: null as Square | null,
    /** The start position, everything on its home square. */
    start: (): void => playTo(0),
    /** Plays the first n plies of the script at once. */
    playTo,
    /** The player's move, by hand. */
    move: (san: string): Promise<void> => animate(san, false),
    /** The chair's move, by davit. */
    chairMove: (san: string): Promise<void> => animate(san, true),
    /** A camera station: table, chart, profile, tray, davit. */
    view: go,
    /** Freezes the named phase (default: the glide) of the next choreography at progress k. */
    freeze: (k: number, phase = 'glide'): void => view.debugFreeze(phase, k),
    /** Resumes a frozen world. */
    resume: (): void => { view.debugFreeze(null); bus.emit('time:scale', { scale: 1 }) },
    /** Survey pins for the piece on a square. */
    pins: (sq: Square): void => { demo.selected = sq; view.highlight(sq, position.legalTargets(sq)) },
    /** 1. e4 f5 placed, then 2. Qh5+ played by hand: the bell and flag U. */
    check: async (): Promise<void> => { playTo(2, CHECK_LINE); await animate(CHECK_LINE[2], false) },
    /** Any key skips. */
    skip: (): void => view.skip(),
    /** Snapshot of where every piece stands (for scripted checks). */
    fen: (): string => position.fen(),
  }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
  ;(window as unknown as { __ready: boolean }).__ready = true
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') go('table'); else if (e.key === '2') go('chart'); else if (e.key === '3') go('profile')
    else if (e.key === ' ') view.skip()
  })
  playTo(0)
}

void main()
