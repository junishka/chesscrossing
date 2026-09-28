// Instruments demo (port 5188): the Board Room table with every instrument where the bible puts it,
// the wall gauge behind, and a scripted chair's move on window.__demo.
// Query: ?view=table|profile|chart.
import * as THREE from 'three'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { bus } from '../src/core/bus'
import { palette } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { mat } from '../src/scene/materials'
import { lightRig } from '../src/scene/lights'
import { CameraRig } from '../src/scene/camera'
import { buildBoard } from '../src/scene/board'
import { buildPiece } from '../src/scene/pieces'
import { Davit, SignalMast, ReturnedTray, SparesDrawer, TideGauge, ChronometerPair, consultPlate, cameraPlate, orderPlacard } from '../src/scene/instruments'
import type { CameraStation, PieceType, Square, Color } from '../src/types'

const p = palette.boardroom
const TABLE_Y = 0.720, LACQUER_Y = 0.729
const WALL_Z = -0.242 - 2.2

function shaded(m: THREE.Mesh): THREE.Mesh { m.castShadow = true; m.receiveShadow = true; return m }

function room(): THREE.Group {
  const g = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'floor', repeat: [1, 14] }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, -0.5)
  floor.receiveShadow = true
  g.add(floor)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), mat.wallpaper({ pattern: 'stripe', bg: p.wall, fg: p.wallAlt, scale: 0.8, repeat: [7 / 0.64, 4.2 / 0.64] }))
  wall.position.set(0, 2.1, WALL_Z)
  wall.receiveShadow = true
  g.add(wall)
  const skirting = shaded(new THREE.Mesh(new THREE.BoxGeometry(7, 0.14, 0.03), mat.lacquer(p.trim)))
  skirting.position.set(0, 0.07, WALL_Z + 0.015)
  g.add(skirting)
  return g
}

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
  return g
}

const START: [PieceType, Color, Square][] = []
const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
'abcdefgh'.split('').forEach((f, i) => {
  START.push([backRank[i], 'w', `${f}1` as Square], ['p', 'w', `${f}2` as Square], ['p', 'b', `${f}7` as Square], [backRank[i], 'b', `${f}8` as Square])
})

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(p.wall)
  stage.setVignette(0)
  stage.scene.add(room(), table())
  const ch = chair()
  ch.position.set(0, 0, -0.78)
  stage.scene.add(ch)

  const board = buildBoard()
  board.group.position.set(0, LACQUER_Y, 0)
  stage.scene.add(board.group)
  const pieces = new Map<Square, THREE.Group>()
  for (const [type, color, sq] of START) {
    const piece = buildPiece(type, color, sq)
    piece.position.copy(board.squareCenter(sq))
    if (type === 'n' && color === 'w') { const head = piece.getObjectByName('head'); if (head) head.rotation.y = Math.PI }
    board.group.add(piece)
    pieces.set(sq, piece)
  }

  // The table frame: origin at the table's centre on its top; the board's x and z.
  const tf = new THREE.Group()
  tf.position.set(0, TABLE_Y, 0)
  stage.scene.add(tf)

  const davit = new Davit({ surfaceY: LACQUER_Y - TABLE_Y })
  davit.group.position.set(0, 0, -0.45)
  tf.add(davit.group)

  const mast = new SignalMast()
  mast.group.position.set(-0.56, 0, -0.42)
  tf.add(mast.group)

  const tray = new ReturnedTray()
  tray.group.position.set(0, 0, 0.264 + 0.008 + tray.depth / 2)
  tf.add(tray.group)

  const drawer = new SparesDrawer()
  drawer.group.position.set(0.60, 0, 0.02)
  tf.add(drawer.group)

  const gauge = new TideGauge()
  gauge.copy.position.set(0.335, 0, 0.30)
  tf.add(gauge.copy)
  gauge.wall.position.set(0.55, 0.98, WALL_Z + 0.012)
  stage.scene.add(gauge.wall)

  const consult = consultPlate()
  consult.position.set(-0.335, 0, 0.292)
  tf.add(consult)
  const camPlate = cameraPlate()
  camPlate.position.set(-0.335, 0, 0.318)
  tf.add(camPlate)
  const order = orderPlacard()
  order.position.set(-0.40, 0, -0.30)
  tf.add(order)

  const chrono = new ChronometerPair()
  chrono.group.position.set(0.47, 0, -0.30)
  tf.add(chrono.group)
  chrono.set({ w: 5 * 60000 + 12000, b: 4 * 60000 + 47000, running: 'b', incrementMs: 3000 })

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

  // 35 mm gauge, 1.85:1 frame: vertical field from the focal length.
  const fovOf = (mm: number) => THREE.MathUtils.radToDeg(2 * Math.atan(18.9 / (2 * mm)))
  const pitch = THREE.MathUtils.degToRad(23.5)
  const stations: Record<string, CameraStation> = {
    table: { position: [0, 1.15, 0.642], target: [0, 1.15 - Math.sin(pitch), 0.642 - Math.cos(pitch)], fov: fovOf(22) },
    profile: { position: [-0.95, 0.80, 0], target: [-0.95 + Math.cos(0.0698), 0.80 - Math.sin(0.0698), 0], fov: fovOf(35) },
    chart: { position: [0, LACQUER_Y + 2.24, 0], target: [0, LACQUER_Y, -0.0001], fov: fovOf(80) },
    davit: { position: [-0.62, 1.05, -0.05], target: [0.05, 0.86, -0.40], fov: fovOf(35) },
    insert: { position: [0, 1.25, 0.60], target: [0, 0.72, 0.36], fov: fovOf(50) },
    drawer: { position: [1.05, 1.05, 0.55], target: [0.62, 0.66, 0.0], fov: fovOf(40) },
  }
  const rig = new CameraRig(stage.camera, stage)
  const view = new URLSearchParams(location.search).get('view') ?? 'table'
  rig.jump(stations[view] ?? stations.table)

  clock.onTick(() => stage.render())
  clock.start()

  const sqXZ = (sq: Square) => { const c = board.squareCenter(sq); return { x: c.x, z: c.z } }

  const demo = {
    stage, rig, davit, mast, tray, drawer, gauge, chrono, board, pieces,
    go: (name: string) => rig.jump(stations[name] ?? stations.table),
    /** The chair's move e7–e5 by davit, the full leg table. */
    chair: async (from: Square = 'e7', to: Square = 'e5') => {
      const piece = pieces.get(from)
      if (!piece) return
      const a = sqXZ(from), b = sqXZ(to)
      await davit.goTo(a.x, a.z)
      await davit.lower()
      await davit.clamp(piece.userData.type === 'p' ? 0.013 : 0.017)
      davit.carry(piece)
      await davit.hoist(0.110)
      await davit.goTo(b.x, b.z)
      await davit.lower()
      await davit.release()
      davit.drop()
      pieces.delete(from)
      pieces.set(to, piece)
      await davit.raise()
      await davit.park()
    },
    /** A capture into THE RETURNED with its tag. */
    capture: async (sq: Square = 'd7', text = 'RETURNED  MOVE 23  EIDER REACH') => {
      const piece = pieces.get(sq)
      if (!piece) return -1
      pieces.delete(sq)
      return tray.place(piece, text)
    },
    /** Freezes the clock after `ms` of scaled time, for a screenshot mid-motion. */
    freeze: (ms: number) => {
      let t = 0
      const off = clock.onTick((dt) => { t += dt; if (t >= ms / 1000) { off(); bus.emit('time:scale', { scale: 0 }) } })
    },
    resume: () => bus.emit('time:scale', { scale: 1 }),
  }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
}

void main()
