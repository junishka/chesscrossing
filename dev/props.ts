// Props demo: every prop laid out in rows on a wood floor before a wallpapered wall.
// Query: ?page=N (0..13) &view=front|high. window.__demo.go(page, view) switches at runtime.
import * as THREE from 'three'
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { palette } from '../src/content/palette'
import { Stage } from '../src/scene/renderer'
import { lightRig } from '../src/scene/lights'
import { placard } from '../src/scene/text3d'
import * as P from '../src/world/props'

const c = palette.house
const colors = c

interface Item { label: string; w: number; hung?: boolean; lift?: number; build: () => THREE.Group }
interface Page { title: string; items: Item[]; wallZ?: number; gap?: number; onTable?: boolean }

function wallSegment(): THREE.Group {
  const g = new THREE.Group()
  g.add(P.wall({ colors, width: 2.2, height: 2.8, pattern: 'damask', scale: 0.9 }))
  g.add(P.wainscot({ colors, width: 2.2 }))
  g.add(P.cornice({ colors, width: 2.2, height: 2.8 }))
  return g
}

const titles = ['A Treatise on the Bishop', 'The Rules of the House', 'Tides of the Rook', 'Winter Openings', 'On Waiting', 'Endgames, Vol. II', 'The Knight Errant', 'A Field Guide to Pawns', 'Correspondence', 'Zugzwang']
const out = palette.outside

const pages: Page[] = [
  { title: 'tabletop A', onTable: true, gap: 0.3, items: [
    { label: 'telephone', w: 0.3, build: () => P.telephone({ colors }) },
    { label: 'typewriter', w: 0.45, build: () => P.typewriter({ colors }) },
    { label: 'tea set', w: 0.5, build: () => P.teaSet({ colors }) },
    { label: 'mantel clock', w: 0.3, build: () => P.mantelClock({ colors, hours: 4, minutes: 35 }) },
  ] },
  { title: 'tabletop B', onTable: true, gap: 0.3, items: [
    { label: 'book', w: 0.3, build: () => P.book({ colors, title: 'On Waiting', lying: true }) },
    { label: 'globe', w: 0.4, build: () => P.globe({ colors }) },
    { label: 'record player', w: 0.5, build: () => P.recordPlayer({ colors }) },
    { label: 'table lamp', w: 0.3, build: () => P.lampTable({ colors }) },
  ] },
  { title: 'seating', gap: 0.35, items: [
    { label: 'chair', w: 0.5, build: () => P.chair({ colors }) },
    { label: 'armchair', w: 0.9, build: () => P.armchair({ colors }) },
    { label: 'stool', w: 0.4, build: () => P.stool({ colors }) },
    { label: 'bench', w: 1.6, build: () => P.bench({ colors }) },
    { label: 'table', w: 1.2, build: () => P.table({ colors }) },
  ] },
  { title: 'big furniture', gap: 0.4, items: [
    { label: 'dining table', w: 2.2, build: () => P.diningTable({ colors }) },
    { label: 'bed', w: 1.5, build: () => P.bed({ colors }) },
    { label: 'desk', w: 1.4, build: () => P.desk({ colors }) },
  ] },
  { title: 'storage', gap: 0.35, items: [
    { label: 'bookshelf', w: 1.0, build: () => P.bookshelf({ colors, titles }) },
    { label: 'cabinet', w: 1.0, build: () => P.cabinet({ colors }) },
    { label: 'drawers', w: 0.9, build: () => P.drawers({ colors }) },
    { label: 'trunk', w: 0.9, build: () => P.trunk({ colors, monogram: 'M. Z.', stickers: ['HOTEL', 'NO. 7'] }) },
    { label: 'suitcases', w: 0.8, build: () => P.suitcaseStack({ colors }) },
  ] },
  { title: 'corner', gap: 0.35, items: [
    { label: 'chess table', w: 0.6, build: () => P.chessTableSmall({ colors }) },
    { label: 'plant', w: 0.5, build: () => P.plant({ colors, leaf: out.accent2 }) },
    { label: 'floor lamp', w: 0.5, build: () => P.lampFloor({ colors }) },
    { label: 'telescope', w: 1.0, build: () => P.telescope({ colors }) },
    { label: 'ladder', w: 0.6, build: () => P.ladder({ colors }) },
    { label: 'staircase', w: 1.2, build: () => P.staircase({ colors, steps: 8 }) },
  ] },
  { title: 'openings', gap: 0.4, items: [
    { label: 'wall', w: 2.2, hung: true, build: wallSegment },
    { label: 'doorway', w: 1.3, hung: true, build: () => P.doorway({ colors, ajar: 0.7 }) },
    { label: 'window', w: 2.0, hung: true, build: () => P.window({ colors, curtains: true }) },
    { label: 'radiator', w: 1.0, hung: true, build: () => P.radiator({ colors }) },
  ] },
  { title: 'hearth', gap: 0.4, items: [
    { label: 'fireplace', w: 1.8, hung: true, build: () => P.fireplace({ colors }) },
    { label: 'curtain', w: 1.5, hung: true, build: () => P.curtain({ colors, tieback: true }) },
    { label: 'chandelier', w: 0.9, build: () => P.chandelier({ colors, height: 3.4 }) },
    { label: 'rug', w: 2.3, lift: 0.001, build: () => P.rug({ colors }) },
  ] },
  { title: 'hung', gap: 0.3, items: [
    { label: 'mountain', w: 0.65, hung: true, build: () => P.pictureFrame({ colors, kind: 'mountain' }) },
    { label: 'sea', w: 0.65, hung: true, build: () => P.pictureFrame({ colors, kind: 'sea' }) },
    { label: 'portrait', w: 0.5, hung: true, build: () => P.pictureFrame({ colors, kind: 'portrait', width: 0.45, height: 0.6 }) },
    { label: 'map', w: 0.75, hung: true, build: () => P.pictureFrame({ colors, kind: 'map', width: 0.7, height: 0.5 }) },
    { label: 'mirror', w: 0.55, hung: true, build: () => P.mirror({ colors }) },
    { label: 'sconce', w: 0.4, hung: true, build: () => P.sconce({ colors }) },
    { label: 'wall clock', w: 0.5, hung: true, build: () => P.wallClock({ colors, hours: 7, minutes: 52 }) },
    { label: 'sign', w: 1.1, hung: true, build: () => P.sign({ colors, text: 'Board Room', post: false }) },
  ] },
  { title: 'outside A', wallZ: -3.2, gap: 0.4, items: [
    { label: 'lamppost', w: 0.7, build: () => P.lamppost({ colors: out }) },
    { label: 'fence', w: 3.0, build: () => P.fence({ colors: out }) },
    { label: 'tree', w: 2.3, build: () => P.tree({ colors: out }) },
    { label: 'letterbox', w: 0.6, build: () => P.letterbox({ colors: out }) },
  ] },
  { title: 'outside B', wallZ: -3.2, gap: 0.35, items: [
    { label: 'hedge', w: 2.1, build: () => P.hedge({ colors: out }) },
    { label: 'station clock', w: 0.8, build: () => P.stationClock({ colors: out, hours: 11, minutes: 5 }) },
    { label: 'sign post', w: 1.1, build: () => P.sign({ colors: out, text: 'To the Lake' }) },
    { label: 'bicycle', w: 1.4, build: () => P.bicycle({ colors: out }) },
    { label: 'flagpole', w: 1.1, build: () => P.flagpole({ colors: out }) },
  ] },
  { title: 'camp', wallZ: -3.2, gap: 0.5, items: [
    { label: 'boat', w: 3.1, build: () => P.boat({ colors: out, name: 'PATIENCE' }) },
    { label: 'tent', w: 2.5, build: () => P.tent({ colors: out }) },
  ] },
  { title: 'large', wallZ: -4.5, gap: 0.5, items: [
    { label: 'funicular', w: 2.9, build: () => P.funicularCar({ colors: out }) },
    { label: 'snow', w: 4.2, lift: 0.06, build: () => P.snowGround({ colors: palette.beyond, width: 4, depth: 3 }) },
  ] },
  { title: 'floors', gap: 0.5, items: [
    { label: 'floor', w: 2.2, lift: 0.03, build: () => P.floor({ colors: palette.boardroom, width: 2, depth: 1.5 }) },
    { label: 'tile', w: 1.7, lift: 0.03, build: () => P.tile({ colors, width: 1.6, depth: 1.2 }) },
  ] },
]

function buildPage(page: Page): { group: THREE.Group; width: number; height: number; base: number } {
  const group = new THREE.Group()
  const wallZ = page.wallZ ?? -2.4
  const gap = page.gap ?? 0.45
  const total = page.items.reduce((s, it) => s + it.w, 0) + gap * (page.items.length - 1)
  const base = page.onTable ? 0.76 : 0
  let x = -total / 2
  let height = base + 0.5
  const bounds = new THREE.Box3()
  for (const it of page.items) {
    const g = it.build()
    g.position.set(x + it.w / 2, base + (it.lift ?? 0), it.hung ? wallZ : 0)
    group.add(g)
    bounds.setFromObject(g)
    height = Math.max(height, bounds.max.y)
    const label = placard({ lines: [it.label], width: Math.min(it.w, 0.9), height: 0.09, bg: c.paper, color: c.ink })
    label.position.set(x + it.w / 2, base + 0.012, page.onTable ? 0.32 : 1.1)
    label.rotation.x = -Math.PI / 2 + 0.25
    group.add(label)
    x += it.w + gap
  }
  if (page.onTable) group.add(P.diningTable({ colors, length: total + 1.0, width: 0.9 }))
  const floorW = Math.max(16, total + 6)
  const floor = P.floor({ colors, width: floorW, depth: 14 })
  floor.position.z = wallZ + 7
  group.add(floor)
  const wall = P.wall({ colors, width: floorW, height: 4.2, pattern: 'lattice', scale: 0.8 })
  wall.position.z = wallZ - 0.001
  group.add(wall)
  const cornice = P.cornice({ colors, width: floorW })
  cornice.position.z = wallZ
  group.add(cornice)
  return { group, width: total, height, base }
}

async function main(): Promise<void> {
  await loadFonts()
  const app = document.getElementById('app')
  if (!app) return
  const stage = new Stage(app)
  stage.scene.background = new THREE.Color(c.sky)
  stage.scene.add(lightRig('house', new THREE.Vector3(0, 1, -1)))
  stage.camera.fov = 30
  stage.camera.updateProjectionMatrix()

  let current: THREE.Group | null = null
  const go = (pageIndex: number, view: 'front' | 'high') => {
    if (current) stage.scene.remove(current)
    const page = pages[Math.max(0, Math.min(pages.length - 1, pageIndex))]
    const built = buildPage(page)
    current = built.group
    stage.scene.add(current)
    const aspect = window.innerWidth / window.innerHeight
    const tanV = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2))
    const span = built.height - built.base
    const distW = (built.width / 2 + 0.35) / (tanV * aspect)
    const distH = (span * 1.3) / (2 * tanV)
    const dist = Math.max(distW, distH, 1.5)
    const eye = built.base + span * 0.45
    if (view === 'front') {
      stage.camera.position.set(0, eye, dist)
      stage.camera.lookAt(0, eye, 0)
    } else {
      stage.camera.position.set(dist * 0.5, built.base + dist * 0.6 + span * 0.3, dist * 0.75)
      stage.camera.lookAt(0, built.base + span * 0.3, -0.2)
    }
  }
  const params = new URLSearchParams(location.search)
  const view = params.get('view') === 'high' ? 'high' : 'front'
  go(Number(params.get('page') ?? 0), view)

  clock.onTick(() => stage.render())
  clock.start()
  ;(window as unknown as { __demo: { go: typeof go; pages: number } }).__demo = { go, pages: pages.length }
}

void main()
