// The camera rig: the camera never walks, it moves between composed stations.
import * as THREE from 'three'
import type { CameraStation, SfxName, Transition } from '../types'
import { bus } from '../core/bus'
import { clock, ease } from '../core/clock'
import type { Stage } from './renderer'

/** Durations (docs/ARCHITECTURE.md "Bible supersedes", BIBLE.md §11): whip 350, dolly 900, lift 1100; the room ↔ Table dolly is 900 too. */
const DURATION: Record<Transition, number> = {
  'whip-left': 350, 'whip-right': 350,
  'dolly-left': 900, 'dolly-right': 900,
  'lift-up': 1100, 'lift-down': 1100,
  'push-in': 900, 'pull-out': 900,
  'cut': 0,
}

/** The hand at each end of a linear dolly (40 ms in, 60 ms out) and of a lift (60 ms each end). */
const DOLLY_ENDS = { inMs: 40, outMs: 60 }
const LIFT_ENDS = { inMs: 60, outMs: 60 }

/**
 * Constant velocity with a linear ramp up over `inMs` and down over `outMs` (a trapezoid of speed),
 * as position 0..1 over normalised time: Anderson's dollies are constant; the ease is only the hand.
 */
export function linearWithEnds(ms: number, inMs: number, outMs: number): (t: number) => number {
  const a = ms > 0 ? Math.min(0.45, inMs / ms) : 0
  const b = ms > 0 ? Math.min(0.45, outMs / ms) : 0
  const v = 1 / (1 - a / 2 - b / 2)
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    if (a > 0 && t < a) return (v * t * t) / (2 * a)
    if (b > 0 && t > 1 - b) return 1 - (v * (1 - t) * (1 - t)) / (2 * b)
    return v * (a / 2 + (t - a))
  }
}

const MIN_WHIP_YAW = THREE.MathUtils.degToRad(40)

/** Default duration (ms) of a transition, so other modules can time things to the camera. */
export function durationOf(via: Transition): number { return DURATION[via] }

interface Pose { position: THREE.Vector3; target: THREE.Vector3; fov: number }

function yawOf(dir: THREE.Vector3): number { return Math.atan2(dir.x, dir.z) }
function pitchOf(dir: THREE.Vector3): number { return Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) }

/** Shortest signed angle from a to b. */
function shortest(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function sfxFor(via: Transition): SfxName | null {
  if (via.startsWith('whip')) return 'whip'
  if (via.startsWith('lift')) return 'lift'
  if (via === 'cut') return null
  return 'dolly'
}

/** Owns camera position, look target and fov; moves between stations with cinematic transitions. */
export class CameraRig {
  current: CameraStation
  private readonly camera: THREE.PerspectiveCamera
  private readonly stage: Stage
  private readonly target = new THREE.Vector3()
  private readonly baseFov: number
  private generation = 0
  /** The focal length being ramped, so the fov follows the lens rather than the angle (a zoom, not a dolly of the angle). */
  private readonly focal = { from: 0, to: 0 }

  constructor(camera: THREE.PerspectiveCamera, stage: Stage) {
    this.camera = camera
    this.stage = stage
    this.baseFov = camera.fov
    camera.getWorldDirection(this.target).add(camera.position)
    this.current = { position: camera.position.toArray() as [number, number, number], target: this.target.toArray() as [number, number, number], fov: camera.fov }
    clock.onTick(() => this.camera.lookAt(this.target))
  }

  /** Snaps to a station instantly. */
  jump(st: CameraStation): void {
    this.generation++
    this.current = st
    this.apply(this.poseOf(st))
    this.stage.setMotionBlur(0, 1, 0)
  }

  /** Moves to a station with the given transition; resolves when the camera has landed. */
  async goTo(st: CameraStation, via: Transition, ms?: number): Promise<void> {
    const duration = ms ?? DURATION[via]
    if (via === 'cut' || duration <= 0) { this.jump(st); return }
    const gen = ++this.generation
    // A superseded whip must not leave its blur behind.
    this.stage.setMotionBlur(0, 1, 0)
    const from = this.pose()
    const to = this.poseOf(st)
    this.current = st
    const sfx = sfxFor(via)
    if (sfx) bus.emit('audio:sfx', { name: sfx })

    const alive = () => gen === this.generation
    this.focal.from = this.focalOf(from.fov)
    this.focal.to = this.focalOf(to.fov)
    if (via === 'whip-left' || via === 'whip-right') await this.whip(from, to, via === 'whip-left' ? 1 : -1, duration, alive)
    else if (via === 'lift-up' || via === 'lift-down') await this.move(from, to, duration, linearWithEnds(duration, LIFT_ENDS.inMs, LIFT_ENDS.outMs), alive)
    else await this.move(from, to, duration, linearWithEnds(duration, DOLLY_ENDS.inMs, DOLLY_ENDS.outMs), alive)
    if (alive()) this.apply(to)
  }

  private pose(): Pose {
    return { position: this.camera.position.clone(), target: this.target.clone(), fov: this.camera.fov }
  }

  private poseOf(st: CameraStation): Pose {
    return { position: new THREE.Vector3().fromArray(st.position), target: new THREE.Vector3().fromArray(st.target), fov: st.fov ?? this.baseFov }
  }

  private apply(p: Pose): void {
    this.camera.position.copy(p.position)
    this.target.copy(p.target)
    this.setFov(p.fov)
    this.camera.lookAt(this.target)
  }

  private setFov(fov: number): void {
    if (this.camera.fov === fov) return
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }

  /** Focal length in mm at the camera's film gauge for a vertical field of view in degrees. */
  private focalOf(fov: number): number {
    return (0.5 * this.camera.getFilmHeight()) / Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  }

  /** The lens at time `t` (0..1, linear over the whole transition): the focal length ramps, the fov follows it. */
  private rampLens(t: number): void {
    const { from, to } = this.focal
    if (Math.abs(from - to) < 1e-6) { this.setFov(THREE.MathUtils.radToDeg(2 * Math.atan((0.5 * this.camera.getFilmHeight()) / to))); return }
    const f = THREE.MathUtils.lerp(from, to, THREE.MathUtils.clamp(t, 0, 1))
    this.setFov(THREE.MathUtils.radToDeg(2 * Math.atan((0.5 * this.camera.getFilmHeight()) / f)))
  }

  /**
   * Straight-line move of position and target with `easing`; the lens ramps linearly in focal length over
   * the same time when the destination's differs (Table → Chart: 22 → 80 mm over the 1100 ms lift).
   */
  private move(from: Pose, to: Pose, ms: number, easing: (t: number) => number, alive: () => boolean): Promise<void> {
    return clock.tween(ms, (t) => {
      if (!alive()) return
      const k = easing(t)
      this.camera.position.lerpVectors(from.position, to.position, k)
      this.target.lerpVectors(from.target, to.target, k)
      this.rampLens(t)
      this.camera.lookAt(this.target)
    }, ease.linear)
  }

  /**
   * The whip pan: the camera translates while yawing through the shorter angle (never less
   * than 40° of swing, so it reads as a pan), with horizontal motion blur peaking mid-way.
   */
  private whip(from: Pose, to: Pose, side: 1 | -1, ms: number, alive: () => boolean): Promise<void> {
    const d0 = from.target.clone().sub(from.position), d1 = to.target.clone().sub(to.position)
    const len0 = Math.max(1e-3, d0.length()), len1 = Math.max(1e-3, d1.length())
    if (d0.lengthSq() < 1e-9) d0.set(0, 0, -1)
    if (d1.lengthSq() < 1e-9) d1.set(0, 0, -1)
    d0.normalize(); d1.normalize()
    const yaw0 = yawOf(d0), pitch0 = pitchOf(d0), pitch1 = pitchOf(d1)
    const delta = shortest(yaw0, yawOf(d1))
    const swingSign = Math.abs(delta) > 1e-3 ? Math.sign(delta) : side
    const extra = Math.max(0, MIN_WHIP_YAW - Math.abs(delta)) * swingSign
    const dir = new THREE.Vector3()
    return clock.tween(ms, (k) => {
      if (!alive()) return
      const e = ease.whip(k)
      this.camera.position.lerpVectors(from.position, to.position, e)
      const yaw = yaw0 + delta * e + extra * Math.sin(Math.PI * e)
      const pitch = THREE.MathUtils.lerp(pitch0, pitch1, e)
      dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      this.target.copy(this.camera.position).addScaledVector(dir, THREE.MathUtils.lerp(len0, len1, e))
      this.rampLens(k)
      this.camera.lookAt(this.target)
      this.stage.setMotionBlur(0.9 * Math.sin(Math.PI * k), -side, 0)
    }, ease.linear).then(() => { if (alive()) this.stage.setMotionBlur(0, 1, 0) })
  }
}
