// Placeholder entry, replaced by the real application once modules land.
import * as THREE from 'three'

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#d9c3a5')
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 9, 0.001)
camera.lookAt(0, 0, 0)

const key = new THREE.DirectionalLight('#fff4e0', 2.2)
key.position.set(3, 8, 4)
key.castShadow = true
scene.add(key, new THREE.HemisphereLight('#f4e6cf', '#5a4632', 0.8))

const board = new THREE.Group()
for (let r = 0; r < 8; r++)
  for (let c = 0; c < 8; c++) {
    const light = (r + c) % 2 === 0
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 1),
      new THREE.MeshStandardMaterial({ color: light ? '#e6d2ae' : '#6b3f2a', roughness: 0.6 }),
    )
    m.position.set(c - 3.5, 0, r - 3.5)
    m.receiveShadow = true
    board.add(m)
  }
scene.add(board)

const pawn = new THREE.Mesh(
  new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(0.32, 0), new THREE.Vector2(0.3, 0.06), new THREE.Vector2(0.14, 0.25), new THREE.Vector2(0.11, 0.55), new THREE.Vector2(0.2, 0.62), new THREE.Vector2(0.16, 0.72), new THREE.Vector2(0, 0.8)],
    48,
  ),
  new THREE.MeshStandardMaterial({ color: '#f0e4c8', roughness: 0.4 }),
)
pawn.castShadow = true
pawn.position.set(0.5, 0.05, 0.5)
scene.add(pawn)

renderer.render(scene, camera)
;(window as any).__ready = true
