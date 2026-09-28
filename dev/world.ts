// World demo: four placeholder frames (three on a row, one above) joined by doors, driven by the
// Navigator. Exposes window.__demo = { goto, nav, events } for scripted screenshots and checks.
import * as THREE from 'three'
import { loadFonts, FONT_SANS } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { bus } from '../src/core/bus'
import { palette, ui } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { CameraRig } from '../src/scene/camera'
import { buildAll } from '../src/world/frames'
import { Navigator } from '../src/world/navigator'
import type { CameraStation, Events, FrameDef, Transition } from '../src/types'

const station: CameraStation = { position: [0, 1.55, 9.6], target: [0, 1.55, 0] }

const frames: FrameDef[] = [
  {
    id: 'hall', title: 'The Hall', region: 'house', camera: station, aspect: 2.39, music: 'house',
    card: { chapter: 'Chapter One', title: 'The Hall', subtitle: 'Arrived Wednesday' },
    hotspots: [
      { id: 'to-study', kind: 'door', label: 'The Study', to: 'study', via: 'dolly-left' },
      { id: 'to-kitchen', kind: 'door', label: 'The Kitchen', to: 'kitchen', via: 'dolly-right' },
      { id: 'stair', kind: 'door', label: 'Up', to: 'attic', via: 'lift-up' },
      { id: 'telephone', kind: 'object', label: 'Telephone', egg: 'ee-01', card: { title: 'The telephone', body: 'It rings for no one.' } },
      { id: 'board', kind: 'board', label: 'The Board' },
      { id: 'second', kind: 'resident', label: 'The Second', resident: 'second' },
    ],
  },
  {
    id: 'study', title: 'The Study', region: 'boardroom', camera: station, aspect: 2.39, music: 'boardroom',
    hotspots: [
      { id: 'to-hall', kind: 'door', label: 'The Hall', to: 'hall', via: 'dolly-right' },
      { id: 'globe', kind: 'object', label: 'Globe' },
      { id: 'ledger', kind: 'object', label: 'Ledger' },
    ],
  },
  {
    id: 'kitchen', title: 'The Kitchen', region: 'outside', camera: station, aspect: 2.39, music: 'house',
    hotspots: [
      { id: 'to-hall', kind: 'door', label: 'The Hall', to: 'hall', via: 'dolly-left' },
      { id: 'range', kind: 'object', label: 'The Range' },
    ],
  },
  {
    id: 'attic', title: 'The Attic', region: 'beyond', camera: station, aspect: 1.85, music: 'beyond',
    hotspots: [
      { id: 'down', kind: 'door', label: 'Down', to: 'hall', via: 'lift-down' },
      { id: 'trunk', kind: 'object', label: 'Trunk' },
      { id: 'telescope', kind: 'egg', label: 'Telescope', egg: 'ee-01' },
    ],
  },
]

const layout: Record<string, [number, number, number]> = {
  hall: [0, 0, 0], study: [-7.4, 0, 0], kitchen: [7.4, 0, 0], attic: [0, 4.6, 0],
}

/** Dev-only hover label: Jost, letterspaced caps, following the pointer. */
function hoverLabel(): (text: string | null, x: number, y: number) => void {
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'fixed', pointerEvents: 'none', fontFamily: FONT_SANS, fontWeight: '500', fontSize: '12px',
    letterSpacing: '0.22em', textTransform: 'uppercase', color: ui.paper, background: ui.bg,
    padding: '6px 12px', display: 'none', transform: 'translate(-50%, 18px)',
  })
  document.body.appendChild(el)
  return (text, x, y) => {
    el.style.display = text ? 'block' : 'none'
    if (text) { el.textContent = text; el.style.left = `${x}px`; el.style.top = `${y}px` }
  }
}

/** Dev-only letterbox bars. */
function letterbox(): (aspect: number | undefined) => void {
  const bars = [document.createElement('div'), document.createElement('div')]
  bars.forEach((b, i) => {
    Object.assign(b.style, { position: 'fixed', left: '0', right: '0', height: '0', background: ui.bg, pointerEvents: 'none', [i ? 'bottom' : 'top']: '0' })
    document.body.appendChild(b)
  })
  return (aspect) => {
    const h = aspect ? Math.max(0, (window.innerHeight - window.innerWidth / aspect) / 2) : 0
    bars.forEach((b) => { b.style.height = `${h}px` })
  }
}

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(palette.house.sky)
  const built = buildAll(stage.scene, frames, layout)
  const rig = new CameraRig(stage.camera, stage)
  const nav = new Navigator(stage, rig, frames, layout, built)

  const events: { name: keyof Events; payload: unknown }[] = []
  const watched: (keyof Events)[] = ['world:enter', 'world:inspect', 'world:egg', 'ui:title', 'ui:mode', 'audio:music']
  for (const name of watched) bus.on(name, (payload) => events.push({ name, payload }))

  nav.callbacks = {
    onHover: hoverLabel(),
    onAspect: letterbox(),
    onResident: (id) => events.push({ name: 'ui:mode', payload: { resident: id } }),
    onBoard: () => events.push({ name: 'ui:mode', payload: { board: true } }),
  }

  clock.onTick(() => stage.render())
  clock.start()
  await nav.goto('hall', 'cut')
  nav.enable(true)

  const demo = {
    nav, stage, events,
    goto: (id: string, via: Transition = 'cut') => nav.goto(id, via),
  }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
}

void main()
