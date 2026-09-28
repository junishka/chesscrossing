// The placeholder tableau: a generic room used for any frame that has no builder of its own.
// Floor, wallpapered back wall, plaster side walls, cornice and skirting, a doorway per door
// hotspot, the frame title on a painted sign, and a labelled box on a plinth for every other hotspot.
import * as THREE from 'three'
import type { HotspotDef, Transition } from '../../types'
import { mat, type WallpaperPattern } from '../../scene/materials'
import { placard, sign } from '../../scene/text3d'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of a house room in metres: width, height, depth. */
export const ROOM = { w: 7, h: 4.2, d: 6 } as const

const DOOR = { w: 1.0, h: 2.2 } as const
const PATTERNS: WallpaperPattern[] = ['stripe', 'lattice', 'dots', 'damask', 'chevron', 'fleur']

type Wall = 'left' | 'right' | 'back'

const geometries = new Map<string, THREE.BoxGeometry>()

/** Shared box geometry by dimensions. */
function boxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}`
  let g = geometries.get(key)
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geometries.set(key, g) }
  return g
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(boxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function plane(w: number, h: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
  m.receiveShadow = true
  return m
}

/** Which wall a door sits on: the camera moves left or right through side walls, everything else goes through the back. */
function wallFor(via: Transition | undefined): Wall {
  if (via === 'dolly-left' || via === 'whip-left') return 'left'
  if (via === 'dolly-right' || via === 'whip-right') return 'right'
  return 'back'
}

/** A small label plate in letterspaced caps. */
function labelPlate(text: string, width: number, ctx: BuildContext): THREE.Mesh {
  const height = width * 0.22
  return placard({ lines: [text], width, height, bg: ctx.region.paper, color: ctx.region.ink, border: ctx.region.ink })
}

// ───────────────────────────── The room shell ─────────────────────────────

function shell(ctx: BuildContext): THREE.Group {
  const { w, h, d } = ROOM
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'shell'

  const floor = plane(w, d + 4, mat.wood({ base: p.ground, grain: p.woodGrain, seed: `floor:${ctx.def.id}`, repeat: [1, 12] }))
  floor.rotation.x = -Math.PI / 2
  floor.position.z = 2
  g.add(floor)

  const pattern = PATTERNS[Math.floor(ctx.rnd() * PATTERNS.length)]
  const back = plane(w, h, mat.wallpaper({ pattern, bg: p.wall, fg: p.wallAlt, scale: 0.9, repeat: [6, 3] }))
  back.position.set(0, h / 2, -d / 2)
  g.add(back)

  for (const sx of [-1, 1]) {
    const side = plane(d, h, mat.plaster(p.wallAlt))
    side.rotation.y = (-sx * Math.PI) / 2
    side.position.set((sx * w) / 2, h / 2, 0)
    g.add(side)
  }

  const ceiling = plane(w, d, mat.plaster(p.trim))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  g.add(ceiling)

  const trim = mat.lacquer(p.trim)
  g.add(box(w, 0.14, 0.05, trim, 0, 0.07, -d / 2 + 0.03))
  g.add(box(w, 0.05, 0.04, trim, 0, 1.08, -d / 2 + 0.02))
  g.add(box(w, 0.16, 0.16, trim, 0, h - 0.08, -d / 2 + 0.08))
  for (const sx of [-1, 1]) {
    g.add(box(0.05, 0.14, d, trim, sx * (w / 2 - 0.03), 0.07, 0))
    g.add(box(0.04, 0.05, d, trim, sx * (w / 2 - 0.02), 1.08, 0))
    g.add(box(0.16, 0.16, d, trim, sx * (w / 2 - 0.08), h - 0.08, 0))
  }

  const border = plane(3.72, 2.32, mat.flat(p.trim))
  border.rotation.x = -Math.PI / 2
  border.position.set(0, 0.006, 1.1)
  g.add(border)
  const rug = plane(3.6, 2.2, mat.felt(p.felt))
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.012, 1.1)
  g.add(rug)

  const title = sign({ text: ctx.def.title, width: 1.8, bg: p.paper, color: p.ink, depth: 0.03 })
  title.position.set(0, 3.25, -d / 2 + 0.03)
  g.add(title)
  return g
}

// ───────────────────────────── Doorways ─────────────────────────────

/**
 * A doorway facing +z with the wall plane at z = 0: dark recess, lacquered jambs, a leaf ajar,
 * a plate above. `hingeSide` is the local x side the leaf hangs from; side-wall doors hang from the
 * wall's far end so the two walls mirror each other and both openings stay visible.
 */
function doorway(hs: HotspotDef, ctx: BuildContext, hingeSide: -1 | 1): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `door:${hs.id}`

  g.add(box(DOOR.w - 0.04, DOOR.h - 0.04, 0.3, mat.flat(p.ink), 0, DOOR.h / 2, -0.14))

  const trim = mat.lacquer(p.trim)
  for (const sx of [-1, 1]) g.add(box(0.1, DOOR.h + 0.1, 0.12, trim, sx * (DOOR.w / 2 + 0.03), (DOOR.h + 0.1) / 2, 0.04))
  g.add(box(DOOR.w + 0.16, 0.12, 0.12, trim, 0, DOOR.h + 0.06, 0.04))

  const hinge = new THREE.Group()
  hinge.position.set(hingeSide * (DOOR.w / 2 - 0.03), 0, 0.02)
  hinge.rotation.y = hingeSide * 0.5
  const leaf = box(DOOR.w - 0.06, DOOR.h - 0.08, 0.045, mat.lacquer(p.accent), -hingeSide * (DOOR.w - 0.06) / 2, (DOOR.h - 0.08) / 2, 0)
  hinge.add(leaf)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat.brass())
  knob.position.set(-hingeSide * (DOOR.w - 0.18), 1.02, 0.05)
  knob.castShadow = true
  hinge.add(knob)
  g.add(hinge)

  const plate = labelPlate(hs.label, 0.7, ctx)
  plate.position.set(0, DOOR.h + 0.28, 0.03)
  g.add(plate)
  return g
}

/** Positions along a wall for n doors, centred and spread. */
function doorSlots(wall: Wall, n: number): number[] {
  if (wall === 'back') return n === 1 ? [0] : n === 2 ? [-2.3, 2.3] : [-2.3, 0, 2.3]
  return n === 1 ? [-0.6] : [-1.7, 0.7]
}

function placeDoors(defs: HotspotDef[], ctx: BuildContext, out: BuiltFrame): void {
  const { w, d } = ROOM
  const byWall: Record<Wall, HotspotDef[]> = { left: [], right: [], back: [] }
  for (const hs of defs) byWall[wallFor(hs.via)].push(hs)
  for (const wall of ['left', 'right', 'back'] as Wall[]) {
    const slots = doorSlots(wall, byWall[wall].length)
    byWall[wall].forEach((hs, i) => {
      const door = doorway(hs, ctx, wall === 'left' ? 1 : -1)
      const at = slots[Math.min(i, slots.length - 1)]
      if (wall === 'back') door.position.set(at, 0, -d / 2)
      else if (wall === 'left') { door.position.set(-w / 2, 0, at); door.rotation.y = Math.PI / 2 }
      else { door.position.set(w / 2, 0, at); door.rotation.y = -Math.PI / 2 }
      door.userData.hotspot = hs.id
      out.group.add(door)
      out.hotspots.set(hs.id, door)
    })
  }
}

// ───────────────────────────── Furnishing stand-ins ─────────────────────────────

/** A lacquered box on a wooden plinth, the label on the plinth's face. Returns [stand, hotspot object]. */
function exhibit(hs: HotspotDef, ctx: BuildContext): [THREE.Group, THREE.Object3D] {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `exhibit:${hs.id}`
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'plinth', repeat: [1, 2] })
  g.add(box(0.5, 0.85, 0.5, wood, 0, 0.425, 0))
  const label = labelPlate(hs.label, 0.42, ctx)
  label.position.set(0, 0.5, 0.2505)
  g.add(label)
  const size = hs.kind === 'egg' ? 0.26 : 0.34
  const object = box(size, size, size, mat.lacquer(hs.kind === 'egg' ? p.accent2 : p.accent), 0, 0.85 + size / 2, 0)
  object.rotation.y = 0.35 + ctx.rnd() * 0.3
  g.add(object)
  return [g, object]
}

/** A card table: wooden top with a felt inset, four turned legs. The whole table is the hotspot. */
function table(hs: HotspotDef, ctx: BuildContext): [THREE.Group, THREE.Object3D] {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `table:${hs.id}`
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'table', repeat: [2, 1] })
  const tw = 1.4, td = 0.9, th = 0.78
  g.add(box(tw, 0.06, td, wood, 0, th - 0.03, 0))
  g.add(box(tw - 0.1, 0.09, td - 0.1, wood, 0, th - 0.105, 0))
  const felt = plane(tw - 0.16, td - 0.16, mat.felt(p.felt))
  felt.rotation.x = -Math.PI / 2
  felt.position.y = th + 0.002
  g.add(felt)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, th - 0.15, 16), mat.lacquer(p.ink))
    leg.position.set(sx * (tw / 2 - 0.14), (th - 0.15) / 2, sz * (td / 2 - 0.14))
    leg.castShadow = true
    g.add(leg)
  }
  const label = labelPlate(hs.label, 0.5, ctx)
  label.position.set(0, th - 0.105, td / 2 - 0.05 + 0.001)
  g.add(label)
  return [g, g]
}

/** A resident stand-in: a tall lozenge with a paper head, the name on the chest. The figure is the hotspot. */
function figure(hs: HotspotDef, ctx: BuildContext): [THREE.Group, THREE.Object3D] {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `figure:${hs.id}`
  g.add(box(0.46, 1.36, 0.28, mat.flat(p.accent2), 0, 0.68, 0))
  g.add(box(0.2, 0.24, 0.2, mat.paper(p.paper), 0, 1.5, 0))
  g.add(box(0.26, 0.06, 0.26, mat.lacquer(p.ink), 0, 1.65, 0))
  const label = labelPlate(hs.label, 0.4, ctx)
  label.position.set(0, 1.1, 0.141)
  g.add(label)
  return [g, g]
}

/** Board in the middle, everything else alternating outward so the row stays symmetric. */
function rowOrder(defs: HotspotDef[]): HotspotDef[] {
  const boards = defs.filter((h) => h.kind === 'board')
  const rest = defs.filter((h) => h.kind !== 'board')
  const row: HotspotDef[] = boards.slice(0, 1)
  rest.forEach((h, i) => { if (i % 2 === 0) row.push(h); else row.unshift(h) })
  return row.concat(boards.slice(1))
}

function placeRow(defs: HotspotDef[], ctx: BuildContext, out: BuiltFrame): void {
  const row = rowOrder(defs)
  const spacing = Math.min(1.7, (ROOM.w - 1.2) / Math.max(1, row.length))
  row.forEach((hs, i) => {
    const [stand, object] = hs.kind === 'board' ? table(hs, ctx) : hs.kind === 'resident' ? figure(hs, ctx) : exhibit(hs, ctx)
    stand.position.set((i - (row.length - 1) / 2) * spacing, 0, -0.9)
    object.userData.hotspot = hs.id
    out.group.add(stand)
    out.hotspots.set(hs.id, object)
    if (hs.kind === 'resident' && !out.residentAnchor) out.residentAnchor = stand
  })
}

/** Builds the generic room for `ctx.def`. Used whenever no builder is registered for a frame. */
export function buildPlaceholder(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  group.add(shell(ctx))
  placeDoors(ctx.def.hotspots.filter((h) => h.kind === 'door'), ctx, out)
  placeRow(ctx.def.hotspots.filter((h) => h.kind !== 'door'), ctx, out)
  return out
}
