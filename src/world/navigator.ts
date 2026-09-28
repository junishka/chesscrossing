// The navigator: hotspot picking in the current frame, hover feedback, and camera moves between frames.
import * as THREE from 'three'
import type { EggDef, FrameDef, HotspotDef, Transition } from '../types'
import { bus } from '../core/bus'
import { store } from '../core/store'
import { clock, ease } from '../core/clock'
import { eggs } from '../content/eggs'
import type { Stage } from '../scene/renderer'
import { durationOf, type CameraRig } from '../scene/camera'
import { setActiveFrame, stationOf, type BuiltFrame } from './frames'

/** What main.ts wires the navigator to; every callback is optional. */
export interface NavigatorCallbacks {
  /** Hover label text (null when nothing is hovered) and the pointer position in client px. */
  onHover?: (label: string | null, x: number, y: number) => void
  /** A resident was clicked; fired before `ui:mode converse`. */
  onResident?: (id: string) => void
  /** The board was clicked. */
  onBoard?: () => void
  /** The frame's letterbox ratio on entry (undefined = none). */
  onAspect?: (aspect: number | undefined) => void
}

type Layout = Record<string, [number, number, number]>

/** Fraction of the object's height it rises on hover. */
const LIFT = 0.03
const HOVER_MS = 180
/** Pointer travel (px) beyond which a press is a drag, not a click. */
const CLICK_SLOP = 6

/** The resting height and lift state of a hotspot object; kept per object so repeated hovers never drift it. */
interface Lift {
  object: THREE.Object3D
  baseY: number
  lift: number
  k: number
  generation: number
}

interface Hover { id: string; label: string; lift: Lift }

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
}

/** Walks up from a picked mesh to the object that carries `userData.hotspot`. */
function hotspotIdOf(object: THREE.Object3D | null): string | null {
  for (let o = object; o; o = o.parent) {
    const id = o.userData.hotspot
    if (typeof id === 'string') return id
  }
  return null
}

function heightOf(object: THREE.Object3D): number {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  return Number.isFinite(size.y) ? size.y : 0
}

const ARROWS: Record<string, Transition[]> = {
  ArrowLeft: ['dolly-left', 'whip-left'],
  ArrowRight: ['dolly-right', 'whip-right'],
  ArrowUp: ['lift-up'],
  ArrowDown: ['lift-down'],
}

/**
 * Moves the camera between frames and turns pointer input into world events.
 * Pointer picking runs only against the current frame's hotspot objects.
 */
export class Navigator {
  current: FrameDef
  /** Wired by main.ts. */
  callbacks: NavigatorCallbacks = {}

  private readonly stage: Stage
  private readonly rig: CameraRig
  private readonly frames: Map<string, FrameDef>
  private readonly layout: Layout
  private readonly built: Map<string, BuiltFrame>
  private readonly canvas: HTMLElement
  private enabled = false
  private transition: Promise<void> | null = null
  private hover: Hover | null = null
  private readonly lifts = new Map<THREE.Object3D, Lift>()
  private press: { x: number; y: number; id: string | null } | null = null
  private theme: string | null | undefined = undefined
  private entered = false
  private missingEggs = new Set<string>()

  constructor(stage: Stage, rig: CameraRig, frames: FrameDef[], layout: Layout, built: Map<string, BuiltFrame>) {
    this.stage = stage
    this.rig = rig
    this.frames = new Map(frames.map((f) => [f.id, f]))
    this.layout = layout
    this.built = built
    this.canvas = stage.renderer.domElement
    if (!frames.length) throw new Error('[navigator] no frames')
    this.current = frames[0]

    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('keydown', this.onKeyDown)
  }

  /** Turns pointer and keyboard handling on or off (off during transitions and other UI modes). */
  enable(on: boolean): void {
    this.enabled = on
    if (!on) { this.press = null; this.setHover(null, 0, 0) }
  }

  /**
   * Moves to a frame: title card on first visit, `world:enter`, music when the theme changes,
   * letterbox for the frame's aspect, shadows on the frame's key light, then the camera move.
   * A goto issued during a transition is ignored.
   */
  goto(frameId: string, via: Transition = 'cut'): Promise<void> {
    if (this.transition) return this.transition
    const def = this.frames.get(frameId)
    if (!def) { console.warn(`[navigator] unknown frame "${frameId}"`); return Promise.resolve() }
    const wasEnabled = this.enabled
    this.enable(false)
    this.transition = this.travel(def, via).finally(() => {
      this.transition = null
      if (wasEnabled) this.enable(true)
    })
    return this.transition
  }

  private async travel(def: FrameDef, via: Transition): Promise<void> {
    const from = this.entered ? this.current.id : undefined
    this.entered = true
    this.current = def
    const first = store.mark('visited', def.id)
    if (first && def.card) bus.emit('ui:title', { ...def.card })
    bus.emit('world:enter', { frame: def.id, via, from })
    const theme = def.music ?? null
    if (theme !== this.theme) { this.theme = theme; bus.emit('audio:music', { theme }) }
    this.callbacks.onAspect?.(def.aspect)
    setActiveFrame(def.id, durationOf(via))
    await this.rig.goTo(stationOf(def, this.layout), via)
  }

  // ───────────────────────────── Picking ─────────────────────────────

  private hotspotObjects(): THREE.Object3D[] {
    const frame = this.built.get(this.current.id)
    return frame ? Array.from(frame.hotspots.values()) : []
  }

  private pick(x: number, y: number): string | null {
    const hits = this.stage.pick(x, y, this.hotspotObjects())
    return hits.length ? hotspotIdOf(hits[0].object) : null
  }

  private hotspotDef(id: string): HotspotDef | undefined {
    return this.current.hotspots.find((h) => h.id === id)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled) return
    this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY)
  }

  private readonly onPointerLeave = (): void => {
    this.press = null
    this.setHover(null, 0, 0)
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled || e.button !== 0) return
    this.press = { x: e.clientX, y: e.clientY, id: this.pick(e.clientX, e.clientY) }
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    const press = this.press
    this.press = null
    if (!this.enabled || !press || press.id === null || e.button !== 0) return
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return
    if (this.pick(e.clientX, e.clientY) !== press.id) return
    const def = this.hotspotDef(press.id)
    if (def) this.activate(def)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || isTyping(e.target)) return
    const vias = ARROWS[e.key]
    if (!vias) return
    const door = this.current.hotspots.find((h) => h.kind === 'door' && h.to && h.via && vias.includes(h.via))
    if (!door?.to) return
    e.preventDefault()
    void this.goto(door.to, door.via)
  }

  // ───────────────────────────── Hover ─────────────────────────────

  /** Updates the hovered hotspot: cursor, label callback and the lift tween. */
  private setHover(id: string | null, x: number, y: number): void {
    if (this.hover?.id === id) { if (id) this.callbacks.onHover?.(this.hover.label, x, y); return }
    if (this.hover) this.settle(this.hover)
    this.hover = null
    this.canvas.style.cursor = id ? 'pointer' : ''
    if (!id) { this.callbacks.onHover?.(null, x, y); return }

    const object = this.built.get(this.current.id)?.hotspots.get(id)
    const def = this.hotspotDef(id)
    if (!object || !def) { this.callbacks.onHover?.(null, x, y); return }
    this.hover = { id, label: def.label, lift: this.liftOf(object) }
    this.callbacks.onHover?.(def.label, x, y)
    bus.emit('audio:sfx', { name: 'hover', velocity: 0.4 })
    this.raise(this.hover.lift, 1)
  }

  /** The object's lift record, created on first hover from its resting height. */
  private liftOf(object: THREE.Object3D): Lift {
    let l = this.lifts.get(object)
    if (!l) {
      l = { object, baseY: object.position.y, lift: Math.max(0.012, heightOf(object) * LIFT), k: 0, generation: 0 }
      this.lifts.set(object, l)
    }
    return l
  }

  /** Tweens the lift fraction of an object toward `to` (1 = lifted, 0 = resting) from wherever it is now. */
  private raise(l: Lift, to: number): void {
    const gen = ++l.generation
    const from = l.k
    void clock.tween(HOVER_MS * Math.abs(to - from), (t) => {
      if (l.generation !== gen) return
      l.k = from + (to - from) * t
      l.object.position.y = l.baseY + l.lift * l.k
    }, ease.outCubic)
  }

  private settle(h: Hover): void {
    this.raise(h.lift, 0)
  }

  // ───────────────────────────── Activation ─────────────────────────────

  private activate(hs: HotspotDef): void {
    switch (hs.kind) {
      case 'object':
      case 'egg':
        this.inspect(hs)
        break
      case 'door':
        if (hs.to) void this.goto(hs.to, hs.via ?? 'cut')
        break
      case 'resident': {
        const id = hs.resident ?? this.current.resident
        if (id) this.callbacks.onResident?.(id)
        bus.emit('ui:mode', { mode: 'converse' })
        break
      }
      case 'board':
        this.callbacks.onBoard?.()
        break
      default:
        // Inserts, actions and any later kinds: announce the click; the station layer handles the rest.
        this.inspect(hs)
        break
    }
  }

  private inspect(hs: HotspotDef): void {
    const first = store.mark('inspected', `${this.current.id}/${hs.id}`)
    bus.emit('audio:sfx', { name: 'select', velocity: 0.6 })
    bus.emit('world:inspect', { hotspot: hs, frame: this.current.id, first })
    if (hs.egg) this.revealEgg(hs.egg)
  }

  private revealEgg(eggId: string): void {
    const egg = eggs.find((e: EggDef) => e.id === eggId)
    if (!egg) {
      if (!this.missingEggs.has(eggId)) { this.missingEggs.add(eggId); console.warn(`[navigator] no egg "${eggId}" in content/eggs`) }
      return
    }
    const first = store.mark('eggs', egg.id)
    bus.emit('world:egg', { egg, first })
  }
}
