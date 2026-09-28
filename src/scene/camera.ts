// The camera rig: the camera never walks, it moves between composed stations.
import * as THREE from 'three'
import type { CameraStation, SfxName, Transition } from '../types'
import { bus } from '../core/bus'
import { clock, ease } from '../core/clock'
import type { Stage } from './renderer'

const DURATION: Record<Transition, number> = {
  'whip-left': 420, 'whip-right': 420,
  'dolly-left': 900, 'dolly-right': 900,
  'lift-up': 1100, 'lift-down': 1100,
  'push-in': 800, 'pull-out': 800,
  'cut': 0,
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
    if (via === 'whip-left' || via === 'whip-right') await this.whip(from, to, via === 'whip-left' ? 1 : -1, duration, alive)
    else if (via === 'lift-up' || via === 'lift-down') await this.lift(from, to, duration, alive)
    else if (via === 'push-in' || via === 'pull-out') await this.move(from, to, duration, ease.outCubic, alive)
    else await this.move(from, to, duration, ease.inOutCubic, alive)
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

  /** Straight-line move of position, target and fov. */
  private move(from: Pose, to: Pose, ms: number, easing: (t: number) => number, alive: () => boolean): Promise<void> {
    return clock.tween(ms, (k) => {
      if (!alive()) return
      this.camera.position.lerpVectors(from.position, to.position, k)
      this.target.lerpVectors(from.target, to.target, k)
      this.setFov(THREE.MathUtils.lerp(from.fov, to.fov, k))
      this.camera.lookAt(this.target)
    }, easing)
  }

  /** Vertical travel first (quintic), the lateral offset and the gaze settle in the second half. */
  private lift(from: Pose, to: Pose, ms: number, alive: () => boolean): Promise<void> {
    return clock.tween(ms, (t) => {
      if (!alive()) return
      const ky = ease.inOutQuint(t)
      const ks = ease.outCubic(THREE.MathUtils.clamp((t - 0.45) / 0.55, 0, 1))
      this.camera.position.set(
        THREE.MathUtils.lerp(from.position.x, to.position.x, ks),
        THREE.MathUtils.lerp(from.position.y, to.position.y, ky),
        THREE.MathUtils.lerp(from.position.z, to.position.z, ks),
      )
      this.target.set(
        THREE.MathUtils.lerp(from.target.x, to.target.x, ks),
        THREE.MathUtils.lerp(from.target.y, to.target.y, ky),
        THREE.MathUtils.lerp(from.target.z, to.target.z, ks),
      )
      this.setFov(THREE.MathUtils.lerp(from.fov, to.fov, ks))
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
      this.setFov(THREE.MathUtils.lerp(from.fov, to.fov, e))
      this.camera.lookAt(this.target)
      this.stage.setMotionBlur(0.9 * Math.sin(Math.PI * k), -side, 0)
    }, ease.linear).then(() => { if (alive()) this.stage.setMotionBlur(0, 1, 0) })
  }
}
