// Scene demo: a tableau that exercises Stage, materials, text3d, lights and CameraRig.
import * as THREE from 'three'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { bus } from '../src/core/bus'
import { palette } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { mat } from '../src/scene/materials'
import { placard, tag, bookSpine, sign } from '../src/scene/text3d'
import { lightRig } from '../src/scene/lights'
import { CameraRig } from '../src/scene/camera'
import type { CameraStation, Transition } from '../src/types'

const p = palette.boardroom
const W = 7, H = 4.2, D = 6

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function room(): THREE.Group {
  const g = new THREE.Group()
  const floorMat = mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'floor', repeat: [1, 12] })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 8), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.z = 4
  floor.receiveShadow = true
  g.add(floor)

  const paperMat = mat.wallpaper({ pattern: 'damask', bg: p.wall, fg: p.wallAlt, scale: 0.9, repeat: [6, 3] })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperMat)
  back.position.set(0, H / 2, -D / 2)
  back.receiveShadow = true
  g.add(back)
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), mat.plaster(p.wallAlt))
    side.rotation.y = -sx * Math.PI / 2
    side.position.set(sx * W / 2, H / 2, 0)
    side.receiveShadow = true
    g.add(side)
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat.plaster(p.trim))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = H
  g.add(ceiling)

  const trim = mat.lacquer(p.trim)
  g.add(box(W, 1.05, 0.04, mat.plaster(p.trim), 0, 0.525, -D / 2 + 0.02))
  g.add(box(W, 0.06, 0.05, trim, 0, 1.08, -D / 2 + 0.025))
  g.add(box(W, 0.14, 0.05, trim, 0, 0.07, -D / 2 + 0.03))
  g.add(box(W, 0.16, 0.16, trim, 0, H - 0.08, -D / 2 + 0.08))
  for (const sx of [-1, 1]) {
    g.add(box(0.05, 0.14, D, trim, sx * (W / 2 - 0.03), 0.07, 0))
    g.add(box(0.16, 0.16, D, trim, sx * (W / 2 - 0.08), H - 0.08, 0))
  }
  const frame = sign({ text: 'The Boardroom', width: 1.5, bg: p.accent, color: p.paper, depth: 0.04 })
  frame.position.set(0, 2.55, -D / 2 + 0.06)
  g.add(frame)
  return g
}

function table(): THREE.Group {
  const g = new THREE.Group()
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'table', repeat: [2, 1] })
  const tw = 2.2, td = 1.1, th = 0.78
  g.add(box(tw, 0.06, td, wood, 0, th - 0.03, 0))
  const feltTop = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.16, td - 0.16), mat.felt(p.felt))
  feltTop.rotation.x = -Math.PI / 2
  feltTop.position.y = th + 0.002
  feltTop.receiveShadow = true
  g.add(feltTop)
  g.add(box(tw - 0.1, 0.09, td - 0.1, wood, 0, th - 0.105, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, th - 0.15, 16), mat.lacquer(p.ink))
    leg.position.set(sx * (tw / 2 - 0.14), (th - 0.15) / 2, sz * (td / 2 - 0.14))
    leg.castShadow = true
    g.add(leg)
  }

  const plate = placard({ lines: ['Chesscrossing', 'Est. MCMLXV'], width: 0.5, height: 0.13, bg: p.brass, color: p.ink, border: p.ink })
  const plateMat = plate.material as THREE.MeshStandardMaterial
  plateMat.metalness = 0.75
  plateMat.roughness = 0.4
  const backing = box(0.52, 0.15, 0.012, mat.brass())
  const stand = new THREE.Group()
  stand.add(backing, plate)
  plate.position.z = 0.0065
  stand.rotation.x = -0.22
  stand.position.set(0, th + 0.08, 0.28)
  g.add(stand)
  const foot = box(0.2, 0.012, 0.16, mat.brass(), 0, th + 0.006, 0.34)
  g.add(foot)

  const t = tag('BISHOP, BLACK\nc8 — move 14', { color: p.paper, ink: p.ink })
  t.rotation.x = -Math.PI / 2
  t.rotation.z = 0.35
  t.position.set(-0.72, th + 0.004, 0.2)
  g.add(t)

  const titles: [string, string, string][] = [
    ['A Treatise on the Bishop', p.accent, p.paper],
    ['The Rules of the House', p.accent2, p.ink],
    ['Tides of the Rook', p.ink, p.brass],
  ]
  titles.forEach(([title, color, ink], i) => {
    const b = bookSpine(title, { color, ink, height: 0.24 + i * 0.02, thickness: 0.045 + i * 0.008, depth: 0.16 })
    b.position.set(0.62 + i * 0.062, th + b.position.y, -0.18)
    g.add(b)
  })
  const bookend = box(0.02, 0.18, 0.15, mat.brass(), 0.57, th + 0.09, -0.18)
  g.add(bookend)
  return g
}

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(p.sky)
  stage.scene.add(room(), table(), lightRig('boardroom', new THREE.Vector3(0, 1, 0)))

  const frontal: CameraStation = { position: [0, 1.55, 9.6], target: [0, 1.55, 0] }
  const left: CameraStation = { position: [-2.2, 1.55, 9.6], target: [-2.2, 1.55, 0] }
  const close: CameraStation = { position: [0, 1.35, 2.6], target: [0, 0.85, 0], fov: 26 }
  const up: CameraStation = { position: [0, 6.15, 9.6], target: [0, 6.15, 0] }
  const rig = new CameraRig(stage.camera, stage)
  rig.jump(frontal)

  clock.onTick(() => stage.render())
  clock.start()

  const demo = {
    stage, rig,
    go: (to: 'frontal' | 'left' | 'close' | 'up', via: Transition, ms?: number) =>
      rig.goTo({ frontal, left, close, up }[to], via, ms),
    whip: (ms?: number) => rig.goTo(left, 'whip-left', ms),
    push: (ms?: number) => rig.goTo(close, 'push-in', ms),
    lift: (ms?: number) => rig.goTo(up, 'lift-up', ms),
    back: (ms?: number) => rig.goTo(frontal, 'cut', ms),
    /** Starts a whip and freezes the clock at fraction `at` of it, so a screenshot can catch the blur. */
    freezeWhip: (at = 0.5, ms = 2000) => {
      let t = 0
      const off = clock.onTick((dt) => {
        t += dt
        if (t >= (ms / 1000) * at) { off(); bus.emit('time:scale', { scale: 0 }) }
      })
      void rig.goTo(left, 'whip-left', ms)
    },
  }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
}

void main()
