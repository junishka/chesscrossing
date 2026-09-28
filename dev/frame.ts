// Frame harness: renders one frame from its own station and lens, in its own aspect.
// URL: /dev/frame.html?id=galley[&station=table][&w=1440][&all=1]
// window.__frame = { stage, rig, built, def, goto(station), station(name) }
import * as THREE from 'three'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { Stage } from '../src/scene/renderer'
import { CameraRig } from '../src/scene/camera'
import { buildAll, setActiveFrame } from '../src/world/frames'
import { frames, layout, frameById, FILM_GAUGE } from '../src/content/frames/index'
import type { CameraStation } from '../src/types'

const params = new URLSearchParams(location.search)
const id = params.get('id') ?? 'boardroom'
const def = frameById(id)
if (!def) throw new Error(`unknown frame ${id}`)
const aspect = def.aspect ?? 1.85
const width = Number(params.get('w') ?? 1440)
const app = document.getElementById('app')!
app.style.width = `${width}px`
app.style.height = `${Math.round(width / aspect)}px`

await loadFonts()
const stage = new Stage(app)
const list = params.get('all') ? frames : [def]
const built = buildAll(stage.scene, list, layout)
setActiveFrame(id)
const rig = new CameraRig(stage.camera, stage)
const origin = new THREE.Vector3().fromArray(layout[id] ?? [0, 0, 0])

function worldStation(st: CameraStation): CameraStation {
  return {
    position: [st.position[0] + origin.x, st.position[1] + origin.y, st.position[2] + origin.z],
    target: [st.target[0] + origin.x, st.target[1] + origin.y, st.target[2] + origin.z],
    fov: st.fov,
  }
}

function lensFor(name: string | null): number {
  if (!name) return def!.lens ?? 40
  const fixed: Record<string, number> = { table: 22, chart: 80, profile: 35, telescope1: 135, telescope2: 135, telescope3: 135, section: 40 }
  return fixed[name] ?? def!.lens ?? 40
}

function station(name: string | null): CameraStation {
  const st = (name && def!.stations?.[name]) || def!.camera
  return worldStation(st)
}

function goto(name: string | null): void {
  const st = station(name)
  rig.jump(st)
  stage.camera.filmGauge = FILM_GAUGE
  stage.camera.setFocalLength(lensFor(name))
  stage.camera.updateProjectionMatrix()
}

goto(params.get('station'))
clock.start()
clock.onTick(() => stage.render())
;(window as any).__frame = { stage, rig, built, def, goto, station, THREE }
;(window as any).__ready = true
