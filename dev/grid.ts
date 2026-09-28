// Grid harness: the O4 islet stage re-dressed from the query, and the chart with its state.
// URL: /dev/grid.html?light=0|1&dusk=0|1&flaw=0..3&object=0..5&square=e4&tags=a,b[&station=chart&pos=e4&visited=a1,b1&ticks=c6]
// window.__frame = { stage, rig, built, def, goto, stats }
import * as THREE from 'three'
import type { Square } from '../src/types'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { Stage } from '../src/scene/renderer'
import { CameraRig } from '../src/scene/camera'
import { buildAll, setActiveFrame } from '../src/world/frames'
import { layout, frameById, FILM_GAUGE } from '../src/content/frames/index'
import { redress, setChart } from '../src/world/builders/grid'
import { plateText, surveyedYear, isHFile } from '../src/content/survey'
import type { CameraStation } from '../src/types'

const params = new URLSearchParams(location.search)
const def = frameById('grid')!
const aspect = def.aspect ?? 2.4
const width = Number(params.get('w') ?? 1440)
const app = document.getElementById('app')!
app.style.width = `${width}px`
app.style.height = `${Math.round(width / aspect)}px`

await loadFonts()
const stage = new Stage(app)
const builtAll = buildAll(stage.scene, [def], layout)
const built = builtAll.get('grid')!
setActiveFrame('grid')
const rig = new CameraRig(stage.camera, stage)
const origin = new THREE.Vector3().fromArray(layout.grid)

const squares = (s: string | null): Square[] => (s ? (s.split(',').filter(Boolean) as Square[]) : [])
const square = (params.get('square') ?? 'e4') as Square
const light = params.get('light') !== '0'
redress(built, {
  square,
  light,
  flaw: Number(params.get('flaw') ?? 0),
  object: Number(params.get('object') ?? 0),
  plateText: plateText(square, surveyedYear(square), !isHFile(square)),
  tags: params.get('tags') ? params.get('tags')!.split(',') : [],
  dusk: params.get('dusk') === '1',
})
setChart(built, {
  position: (params.get('pos') as Square | null) ?? null,
  visited: squares(params.get('visited')),
  tags: squares(params.get('ticks')),
})

function worldStation(st: CameraStation): CameraStation {
  return {
    position: [st.position[0] + origin.x, st.position[1] + origin.y, st.position[2] + origin.z],
    target: [st.target[0] + origin.x, st.target[1] + origin.y, st.target[2] + origin.z],
    fov: st.fov,
  }
}

function goto(name: string | null): void {
  const st = worldStation((name && def.stations?.[name]) || def.camera)
  rig.jump(st)
  stage.camera.filmGauge = FILM_GAUGE
  stage.camera.setFocalLength(name === 'chart' ? 80 : def.lens ?? 40)
  stage.camera.updateProjectionMatrix()
}

goto(params.get('station'))
clock.start()
let last = performance.now()
clock.onTick(() => {
  const now = performance.now()
  built.group.userData.tick?.((now - last) / 1000)
  last = now
  stage.render()
})

function stats(): { render: { calls: number; triangles: number }; traversal: { triangles: number; drawCalls: number } } {
  const info = stage.renderer.info.render
  return { render: { calls: info.calls, triangles: info.triangles }, traversal: built.group.userData.stats() }
}
;(window as any).__frame = { stage, rig, built, def, goto, stats, THREE }
;(window as any).__ready = true
