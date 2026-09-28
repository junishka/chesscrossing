// The frame registry: every tableau is built once by its builder, positioned on the world grid
// and given a light rig. Directional lights are global in Three.js, so only the active frame's
// rig is switched on (cross-faded during a transition), and only its key light casts shadows.
import * as THREE from 'three'
import type { CameraStation, FrameDef } from '../types'
import { clock, ease } from '../core/clock'
import { palette, type RegionPalette } from '../content/palette'
import { seeded } from '../scene/materials'
import { lightRig } from '../scene/lights'
import { registry } from './builders/index'
import { buildPlaceholder } from './builders/_placeholder'

/** A frame after construction: its group, its hotspot objects by id and where a resident stands. */
export interface BuiltFrame {
  id: string
  group: THREE.Group
  hotspots: Map<string, THREE.Object3D>
  residentAnchor?: THREE.Object3D
}

/** What a builder receives: the definition, the world origin, the region palette and a seeded PRNG. */
export interface BuildContext {
  def: FrameDef
  origin: THREE.Vector3
  region: RegionPalette
  rnd: () => number
}

/** Builds one tableau in local space (origin at the floor centre; the room opens toward +z). */
export type FrameBuilder = (ctx: BuildContext) => BuiltFrame

/** Frame builders by frame id, populated from `world/builders/index.ts`. */
export const builders: Map<string, FrameBuilder> = new Map(Object.entries(registry))

interface Rig { group: THREE.Group; key?: THREE.DirectionalLight; lights: THREE.Light[]; level: number }

/** Light rigs by frame id, so `setActiveFrame` can switch the one lit, shadow-casting rig. */
const rigs = new Map<string, Rig>()
let activeFrameId: string | null = null
let fadeGeneration = 0

/** Where the room's light rig is centred, relative to the frame origin. */
const RIG_CENTER = new THREE.Vector3(0, 1.2, 0)

function originOf(id: string, layout: Record<string, [number, number, number]>): THREE.Vector3 {
  const at = layout[id]
  if (!at) console.warn(`[frames] no layout entry for "${id}", placing it at the origin`)
  return new THREE.Vector3().fromArray(at ?? [0, 0, 0])
}

function keyLightOf(rig: THREE.Group): THREE.DirectionalLight | undefined {
  const key = rig.getObjectByName('key')
  return key instanceof THREE.DirectionalLight ? key : undefined
}

/** Every light in a rig, remembering its designed intensity so it can be scaled. */
function lightsOf(rig: THREE.Group): THREE.Light[] {
  const out: THREE.Light[] = []
  rig.traverse((o) => {
    if (o instanceof THREE.Light) { o.userData.base = o.intensity; out.push(o) }
  })
  return out
}

/** Scales a rig's lights to `level` (0 = off and hidden, 1 = as designed). */
function setLevel(rig: Rig, level: number): void {
  rig.level = level
  for (const l of rig.lights) l.intensity = (l.userData.base as number) * level
  rig.group.visible = level > 0
}

/**
 * Builds every frame with its builder (or the placeholder room), positions each group at
 * `layout[id]`, adds a light rig per frame and adds everything to the scene. Every rig is off
 * until `setActiveFrame` names the frame the camera is in.
 */
export function buildAll(
  scene: THREE.Scene,
  frames: FrameDef[],
  layout: Record<string, [number, number, number]>,
): Map<string, BuiltFrame> {
  const built = new Map<string, BuiltFrame>()
  for (const def of frames) {
    const origin = originOf(def.id, layout)
    const build = builders.get(def.id) ?? buildPlaceholder
    const frame = build({ def, origin, region: palette[def.region], rnd: seeded(def.id) })
    frame.group.name = `frame:${def.id}`
    frame.group.position.copy(origin)

    const rig = lightRig(def.region, RIG_CENTER)
    const key = keyLightOf(rig)
    if (key) key.castShadow = false
    const entry: Rig = { group: rig, key, lights: lightsOf(rig), level: 1 }
    setLevel(entry, 0)
    rigs.set(def.id, entry)
    frame.group.add(rig)

    scene.add(frame.group)
    built.set(def.id, frame)
  }
  return built
}

/**
 * Lights this frame's rig only, with shadows from its key light. With `fadeMs` the previous rig
 * fades out while this one fades in (both cast shadows meanwhile), so the room being left does
 * not go dark while the camera is still looking at it. Once settled, the old rig is hidden and
 * its shadow map released: one shadow map in the whole scene.
 */
export function setActiveFrame(id: string, fadeMs = 0): void {
  if (activeFrameId === id) return
  activeFrameId = id
  const gen = ++fadeGeneration
  const next = rigs.get(id)
  if (next?.key) next.key.castShadow = true
  const finish = (): void => {
    for (const [frameId, rig] of rigs) {
      const on = frameId === id
      setLevel(rig, on ? 1 : 0)
      if (!on && rig.key && rig.key.castShadow) {
        rig.key.castShadow = false
        rig.key.shadow.dispose()
        rig.key.shadow.map = null
      }
    }
  }
  if (fadeMs <= 0) { finish(); return }
  const from = new Map<Rig, number>()
  for (const rig of rigs.values()) if (rig === next || rig.level > 0) from.set(rig, rig.level)
  void clock.tween(fadeMs, (k) => {
    if (gen !== fadeGeneration) return
    for (const [rig, start] of from) setLevel(rig, start + ((rig === next ? 1 : 0) - start) * k)
    if (k >= 1) finish()
  }, ease.inOutCubic)
}

/** The frame's camera station in world space (definitions are relative to the frame origin). */
export function stationOf(def: FrameDef, layout: Record<string, [number, number, number]>): CameraStation {
  const [ox, oy, oz] = layout[def.id] ?? [0, 0, 0]
  const [px, py, pz] = def.camera.position
  const [tx, ty, tz] = def.camera.target
  return { position: [ox + px, oy + py, oz + pz], target: [ox + tx, oy + ty, oz + tz], fov: def.camera.fov }
}
