// Board demo: the board on a teak table in a plaster room, all thirty-two pieces in the start position,
// seen from the bible's three stations (§5.9) and one close crop of a knight.
// Query: ?view=table|chart|profile|knight|c6 &hover=e4. window.__demo.go(view) switches at runtime.
import * as THREE from 'three'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { palette, tokens } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { lightRig } from '../src/scene/lights'
import { mat } from '../src/scene/materials'
import { buildBoard } from '../src/scene/board'
import { buildPiece, inventoryNumber } from '../src/scene/pieces'
import type { Color, File, PieceType, Rank, Square } from '../src/types'

type View = 'table' | 'chart' | 'profile' | 'knight' | 'c6'

const TABLE_TOP = 0.72
const LACQUER = 0.729
const br = palette.boardroom

/** The start position with each piece's home square and its ordinal among its kind. */
function startPosition(): { type: PieceType; color: Color; home: Square; index: number }[] {
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  const files: File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const out: { type: PieceType; color: Color; home: Square; index: number }[] = []
  for (const color of ['w', 'b'] as const) {
    const backRank: Rank = color === 'w' ? 1 : 8
    const pawnRank: Rank = color === 'w' ? 2 : 7
    const seen: Partial<Record<PieceType, number>> = {}
    files.forEach((f, i) => {
      const type = back[i]
      const index = (seen[type] ?? 0) + 1
      seen[type] = index
      out.push({ type, color, home: `${f}${backRank}`, index })
    })
    files.forEach((f, i) => out.push({ type: 'p', color, home: `${f}${pawnRank}`, index: i + 1 }))
  }
  return out
}

/** A plaster room around a teak table: the ground and walls only, enough to light the board. */
function buildRoom(): THREE.Group {
  const g = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), mat.wood({ base: br.ground, grain: br.woodGrain, seed: 'floor', repeat: [8, 7] }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)
  const plaster = mat.plaster(br.wall)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), plaster)
  back.position.set(0, 2.1, -2.7)
  back.receiveShadow = true
  g.add(back)
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.2), plaster)
    side.position.set(sx * 3.5, 2.1, 0)
    side.rotation.y = -sx * Math.PI / 2
    side.receiveShadow = true
    g.add(side)
  }
  // The table: teak, 1.2 × 0.9, top at 0.72.
  const teak = mat.wood({ base: br.ground, grain: br.woodGrain, seed: 'table', repeat: [3, 2] })
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.035, 0.9), teak)
  top.position.y = TABLE_TOP - 0.0175
  top.castShadow = true
  top.receiveShadow = true
  g.add(top)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE_TOP - 0.035, 0.05), teak)
      leg.position.set(sx * 0.55, (TABLE_TOP - 0.035) / 2, sz * 0.4)
      leg.castShadow = true
      g.add(leg)
    }
  }
  return g
}

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(tokens['ui.surround'])
  stage.setVignette(0)

  const centre = new THREE.Vector3(0, LACQUER, 0)
  const rig = lightRig('boardroom', centre)
  // Fit the shadow map to the table for the demo, so the pieces' shadows resolve.
  const key = rig.getObjectByName('key') as THREE.DirectionalLight | undefined
  if (key) {
    key.position.copy(centre).add(new THREE.Vector3(0.9, 2.6, 1.4))
    const cam = key.shadow.camera
    cam.left = -0.9; cam.right = 0.9; cam.top = 0.9; cam.bottom = -0.9
    cam.near = 0.5; cam.far = 8
    cam.updateProjectionMatrix()
    key.shadow.bias = -0.00015
    key.shadow.normalBias = 0.002
    key.shadow.radius = 2
  }
  stage.scene.add(rig)
  stage.scene.add(buildRoom())

  const board = buildBoard()
  board.group.position.y = LACQUER
  stage.scene.add(board.group)

  const pieces = new Map<Square, THREE.Group>()
  for (const p of startPosition()) {
    const piece = buildPiece(p.type, p.color, p.home, { index: p.index })
    piece.position.copy(board.squareCenter(p.home))
    board.group.add(piece)
    pieces.set(p.home, piece)
  }

  const params = new URLSearchParams(location.search)
  const hover = params.get('hover')
  if (hover && /^[a-h][1-8]$/.test(hover)) board.setRimHover(hover[0] as File, Number(hover[1]) as Rank)

  const camera = stage.camera
  camera.filmGauge = 35
  camera.near = 0.02
  const go = (view: View): void => {
    camera.up.set(0, 1, 0)
    if (view === 'table') {
      // Seated eye 1.15 m above the floor, 0.40 m behind the near rim, 23.5° down, 22 mm.
      camera.position.set(0, 1.15, 0.642)
      const pitch = THREE.MathUtils.degToRad(23.5)
      camera.lookAt(new THREE.Vector3(0, 1.15 - Math.sin(pitch), 0.642 - Math.cos(pitch)))
      camera.setFocalLength(22)
    } else if (view === 'chart') {
      camera.up.set(0, 0, -1)
      camera.position.set(0, LACQUER + 2.24, 0)
      camera.lookAt(new THREE.Vector3(0, LACQUER, 0))
      camera.setFocalLength(80)
    } else if (view === 'profile') {
      camera.position.set(-0.95, 0.8, 0)
      const pitch = THREE.MathUtils.degToRad(4)
      camera.lookAt(new THREE.Vector3(-0.95 + Math.cos(pitch), 0.8 - Math.sin(pitch), 0))
      camera.setFocalLength(35)
    } else if (view === 'c6') {
      // Cinder Holm from 0.16 m above, to find the hairline crack.
      const c6 = board.squareCenter('c6').add(new THREE.Vector3(0, LACQUER, 0))
      camera.up.set(0, 0, -1)
      camera.position.copy(c6).add(new THREE.Vector3(0, 0.16, 0))
      camera.lookAt(c6)
      camera.setFocalLength(50)
    } else {
      // A close crop, 0.35 m from the light side's king's knight.
      const knight = pieces.get('g1')
      const target = new THREE.Vector3(0, 0.04, 0)
      if (knight) knight.getWorldPosition(target).add(new THREE.Vector3(0, 0.038, 0))
      camera.position.copy(target).add(new THREE.Vector3(0.24, 0.16, 0.2))
      camera.lookAt(target)
      camera.setFocalLength(50)
    }
    camera.updateProjectionMatrix()
  }
  const wanted = params.get('view')
  go(wanted === 'chart' || wanted === 'profile' || wanted === 'knight' || wanted === 'c6' ? wanted : 'table')

  clock.onTick(() => stage.render())
  clock.start()
  const demo = { go, board, pieces, inventoryNumber, stage }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
}

void main()
