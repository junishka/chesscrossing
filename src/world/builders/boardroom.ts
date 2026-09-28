// Frame 1: The Board Room (ground, centre). The Belafonte's cabin: teak boards worn pale at the chairs,
// pale-blue tongue-and-groove with a vertical brush, warm cabin lamps, a window each side with a painted
// sea scrolling behind the glass. The teak table stands at the origin; the board, the davit, the mast,
// THE RETURNED, the spares drawer, the chronometer box and the tide gauge are added by BoardView, so
// their places carry thin transparent hit boxes. The one flaw: the Society's peaked cap on the far
// chair's right post. Bible §3.1, §6 (Frame 1), §11, §14.1, §14.2.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import { FONT_MONO } from '../../core/fonts'
import { labelTexture, mat, seeded } from '../../scene/materials'
import { tokens } from '../../content/palette'
import { dressing } from '../../content/frames/boardroom'
import { pictureFrame, wallClock } from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres: width (x), height (y), depth (z). Back wall at z = −3, side walls at x = ±3.5. */
const ROOM = { w: 7, h: 4.2, d: 6 } as const

/** The wall clock's place on the far wall (left of centre); the tide gauge hangs at (+0.6, 0.98) and is not built here. */
const CLOCK_AT = { x: -0.6, y: dressing.wallCentreY }

/** Where the two chairs stand (z), their seat height and the back's top (§14.2). */
const CHAIR = { z: 0.95, seat: 0.46, backTop: 1.02, size: 0.44 } as const

/** Doors and windows on the side walls, centred on these z values. */
const DOOR = { z: 0.3, w: 1.0, h: 2.2 } as const
const WINDOW = { z: -2.0, w: 1.1, h: 1.1, sill: 1.3 } as const

type Vec3 = [number, number, number]

// ───────────────────────────── Colour helpers (canvas painting only) ─────────────────────────────

interface Rgb { r: number; g: number; b: number }

function parse(hex: string): Rgb {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
}

function css(c: Rgb, alpha = 1): string {
  const cl = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `rgba(${cl(c.r)},${cl(c.g)},${cl(c.b)},${alpha})`
}

function scaleRgb(c: Rgb, k: number): Rgb {
  return { r: c.r * k, g: c.g * k, b: c.b * k }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A painted canvas as an sRGB texture. */
function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  paint(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The wear pass over a finished canvas: every pixel is multiplied by `factor(u, v)` (u across, v down,
 * both 0..1) and by the region's value noise. One pass, once per material.
 */
function wearPass(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, noise: number, factor: (u: number, v: number) => number): void {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const k = factor(x / w, v) * (1 + (rnd() - 0.5) * 2 * noise)
      d[i] = Math.min(255, d[i] * k)
      d[i + 1] = Math.min(255, d[i + 1] * k)
      d[i + 2] = Math.min(255, d[i + 2] * k)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Corner grime (§3.5): a multiply of 1 − 0.10·smoothstep(0.75, 1, r) toward each wall corner. */
function grime(u: number, v: number): number {
  const r = Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2
  return 1 - 0.1 * smoothstep(0.75, 1, r)
}

/** Brush strokes along one direction: 24–48 px long, 2–3 px wide, alpha 0.06 (§3.5). */
function brush(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, vertical: boolean, count: number, light: Rgb, dark: Rgb): void {
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = rnd() * w, y = rnd() * h
    const len = 24 + rnd() * 24
    ctx.lineWidth = 2 + rnd()
    ctx.strokeStyle = css(rnd() < 0.5 ? light : dark, 0.06)
    ctx.beginPath()
    ctx.moveTo(x, y)
    if (vertical) ctx.lineTo(x + (rnd() - 0.5) * 1.5, y + len)
    else ctx.lineTo(x + len, y + (rnd() - 0.5) * 1.5)
    ctx.stroke()
  }
}

// ───────────────────────────── Painted surfaces ─────────────────────────────

/**
 * Pale-blue tongue-and-groove: 100 mm boards, a groove and a bevel highlight between them, vertical
 * brush, 3 % value noise, then the wear pass: corner grime, sun-bleach on the upper third when the wall
 * faces a window, and a scuff band 350 mm up beside each door (`doors` are u-spans of the openings).
 */
function tongueAndGroove(o: { seed: string; metresW: number; metresH: number; bleach: boolean; doors: [number, number][] }): THREE.CanvasTexture {
  const size = 1024
  const rnd = seeded(o.seed)
  const base = parse(tokens['br.wall'])
  const pxPerM = size / o.metresW
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = css(base)
    ctx.fillRect(0, 0, w, h)
    const boardPx = 0.1 * pxPerM
    const n = Math.ceil(o.metresW / 0.1)
    for (let i = 0; i < n; i++) {
      const x0 = Math.round(i * boardPx)
      const x1 = Math.round((i + 1) * boardPx)
      ctx.fillStyle = css(scaleRgb(base, 0.975 + rnd() * 0.05))
      ctx.fillRect(x0, 0, x1 - x0, h)
      ctx.fillStyle = css(scaleRgb(base, 0.72))
      ctx.fillRect(x1 - 2, 0, 2, h)
      ctx.fillStyle = css(scaleRgb(base, 1.08))
      ctx.fillRect(x0, 0, 1, h)
    }
    brush(ctx, w, h, rnd, true, 5000, scaleRgb(base, 1.12), scaleRgb(base, 0.88))
    const scuffY = 0.35 / o.metresH, scuffH = 0.04 / o.metresH
    wearPass(ctx, w, h, rnd, 0.03, (u, v) => {
      let k = grime(u, v)
      if (o.bleach) k *= 1 + 0.06 * smoothstep(0.33 + 0.075, 0.33 - 0.075, v)
      const y = 1 - v
      if (y > scuffY - scuffH / 2 && y < scuffY + scuffH / 2) {
        for (const [a, b] of o.doors) if ((u > a - 0.1 && u < a) || (u > b && u < b + 0.1)) k *= 0.96
      }
      return k
    })
  })
}

/**
 * Teak floor boards 90 mm wide running toward the camera, dark seams and staggered end joints, grain
 * strokes with the boards, worn pale in a disc under each chair, grime toward the corners.
 */
function teakFloor(o: { seed: string; chairs: [number, number][] }): THREE.CanvasTexture {
  const size = 1024
  const rnd = seeded(o.seed)
  const base = parse(tokens['br.ground'])
  const grain = parse(tokens['br.darkBody'])
  const ink = parse(tokens['br.ink'])
  const pxPerM = size / ROOM.w
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = css(base)
    ctx.fillRect(0, 0, w, h)
    const boardPx = 0.09 * pxPerM
    const n = Math.ceil(ROOM.w / 0.09)
    for (let i = 0; i < n; i++) {
      const x0 = Math.round(i * boardPx), x1 = Math.round((i + 1) * boardPx)
      ctx.fillStyle = css(scaleRgb(base, 0.93 + rnd() * 0.14))
      ctx.fillRect(x0, 0, x1 - x0, h)
      // grain: long faint streaks along the board
      for (let s = 0; s < 6; s++) {
        const x = x0 + 1 + rnd() * (x1 - x0 - 2)
        ctx.strokeStyle = css(grain, 0.10 + rnd() * 0.12)
        ctx.lineWidth = 0.6 + rnd() * 0.8
        ctx.beginPath()
        const y0 = rnd() * h
        ctx.moveTo(x, y0)
        ctx.lineTo(x + (rnd() - 0.5) * 2, y0 + 120 + rnd() * 400)
        ctx.stroke()
      }
      ctx.fillStyle = css(ink, 0.55)
      ctx.fillRect(x1 - 1, 0, 1, h)
      // end joints, staggered
      let y = (rnd() * 1.4) * pxPerM
      while (y < h) {
        ctx.fillRect(x0, Math.round(y), x1 - x0, 1)
        y += (1.2 + rnd() * 1.1) * pxPerM
      }
    }
    brush(ctx, w, h, rnd, true, 3000, scaleRgb(base, 1.14), scaleRgb(base, 0.86))
    wearPass(ctx, w, h, rnd, 0.03, (u, v) => {
      let k = grime(u, v)
      const x = u * ROOM.w - ROOM.w / 2
      const z = -ROOM.d / 2 + v * ROOM.d
      for (const [cx, cz] of o.chairs) {
        const d = Math.hypot(x - cx, (z - cz) * 0.8)
        k *= 1 + 0.14 * (1 - smoothstep(0.2, 0.7, d))
      }
      return k
    })
  })
}

/** The sea behind a window: a flat painted sky, a hard horizon, slate water with horizontal foam strokes; tiles across. */
function seaTexture(seed: string): THREE.CanvasTexture {
  const rnd = seeded(seed)
  const tex = canvasTexture(1024, 512, (ctx, w, h) => {
    const horizon = Math.round(h * 0.42)
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, tokens['grid.sky'])
    sky.addColorStop(1, tokens['out.sky'])
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, horizon)
    const sea = ctx.createLinearGradient(0, horizon, 0, h)
    sea.addColorStop(0, tokens['grid.channel'])
    sea.addColorStop(0.25, tokens['out.sea'])
    sea.addColorStop(1, tokens['out.sea'])
    ctx.fillStyle = sea
    ctx.fillRect(0, horizon, w, h - horizon)
    ctx.fillStyle = css(parse(tokens['out.foam']), 0.5)
    ctx.fillRect(0, horizon, w, 2)
    const foam = parse(tokens['out.foam']), deep = parse(tokens['grid.channel'])
    ctx.lineCap = 'round'
    for (let i = 0; i < 900; i++) {
      const t = rnd()
      const y = horizon + 4 + t * t * (h - horizon - 8)
      const len = 6 + t * 90 * rnd()
      const x = rnd() * w
      const light = rnd() < 0.55
      ctx.strokeStyle = css(light ? foam : deep, light ? 0.10 + rnd() * 0.22 : 0.12 + rnd() * 0.2)
      ctx.lineWidth = 1 + t * 3
      for (const dx of [0, -w, w]) {
        ctx.beginPath()
        ctx.moveTo(x + dx, y)
        ctx.lineTo(x + dx + len, y + (rnd() - 0.5) * 2)
        ctx.stroke()
      }
    }
    // a low headland on the horizon, far off
    ctx.fillStyle = css(parse(tokens['out.rock']), 0.7)
    ctx.beginPath()
    ctx.moveTo(w * 0.62, horizon)
    ctx.quadraticCurveTo(w * 0.7, horizon - 9, w * 0.8, horizon - 4)
    ctx.lineTo(w * 0.86, horizon)
    ctx.closePath()
    ctx.fill()
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/** Corduroy: fine ribs across the seat, in the lamp red. */
function corduroyMaterial(): THREE.MeshStandardMaterial {
  const base = parse(tokens['br.lampRed'])
  const rnd = seeded('br:corduroy')
  const map = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = css(base)
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x += 5) {
      ctx.fillStyle = css(scaleRgb(base, 1.12))
      ctx.fillRect(x, 0, 2, h)
      ctx.fillStyle = css(scaleRgb(base, 0.82))
      ctx.fillRect(x + 3, 0, 1, h)
    }
    wearPass(ctx, w, h, rnd, 0.04, () => 1)
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(3, 3)
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 })
}

/** The ledger roll: ruled paper with a red margin, the volume typed at its head. */
function ledgerTexture(): THREE.CanvasTexture {
  const paper = tokens['paper.white']
  const ink = parse(tokens['br.ink'])
  const rnd = seeded('br:ledger')
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = css(ink, 0.22)
    for (let y = 90; y < h; y += 26) ctx.fillRect(28, y, w - 56, 1)
    ctx.fillStyle = css(parse(tokens['br.lampRed']), 0.55)
    ctx.fillRect(96, 60, 1, h - 60)
    ctx.fillStyle = css(ink, 0.9)
    ctx.font = `400 22px ${FONT_MONO}`
    ctx.textBaseline = 'middle'
    ctx.fillText('THE LEDGER   VOL. XIV', 106, 48)
    ctx.font = `400 18px ${FONT_MONO}`
    ctx.fillText('HALYARD ISLAND   SEPTEMBER 1965', 106, 76)
    ctx.font = `400 16px ${FONT_MONO}`
    ctx.fillStyle = css(ink, 0.55)
    ctx.fillText('No.', 36, 103)
    ctx.fillText('ENTRY', 106, 103)
    wearPass(ctx, w, h, rnd, 0.02, (u, v) => 1 - 0.05 * smoothstep(0.6, 1, Math.hypot(u * 2 - 1, v * 2 - 1) / Math.SQRT2))
  })
}

// ───────────────────────────── Merged geometry kit ─────────────────────────────

/**
 * Collects primitives by material and flushes one merged mesh per material, so a chair or a staircase
 * costs a handful of draw calls instead of forty.
 */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  place(geo: THREE.BufferGeometry, m: THREE.Material, at: Vec3, rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): void {
    const mtx = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale),
    )
    geo.applyMatrix4(mtx)
    const list = this.parts.get(m) ?? []
    list.push(geo)
    this.parts.set(m, list)
  }

  box(w: number, h: number, d: number, m: THREE.Material, at: Vec3, rot?: Vec3): void {
    this.place(new THREE.BoxGeometry(w, h, d), m, at, rot)
  }

  cyl(rt: number, rb: number, h: number, m: THREE.Material, at: Vec3, seg = 16, rot?: Vec3): void {
    this.place(new THREE.CylinderGeometry(rt, rb, h, seg), m, at, rot)
  }

  sphere(r: number, m: THREE.Material, at: Vec3, seg = 14): void {
    this.place(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), m, at)
  }

  lathe(profile: [number, number][], m: THREE.Material, at: Vec3, seg = 24, rot?: Vec3): void {
    this.place(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg), m, at, rot)
  }

  plane(w: number, h: number, m: THREE.Material, at: Vec3, rot?: Vec3): void {
    this.place(new THREE.PlaneGeometry(w, h), m, at, rot)
  }

  /** Adds one mesh per material to `into` and empties the kit. */
  flush(into: THREE.Object3D, name: string, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, m)
      mesh.name = name
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      into.add(mesh)
      out.push(mesh)
    }
    this.parts.clear()
    return out
  }
}

// ───────────────────────────── Small parts ─────────────────────────────

/** A plane that receives shadows; used for walls, floor and ceiling. */
function surface(w: number, h: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  mesh.receiveShadow = true
  mesh.castShadow = false
  return mesh
}

/** An engraved brass plate: ink lettering in Jost caps, letterspaced, on brushed brass with a hairline border. */
function brassPlate(lines: string[], w: number, h: number, tex: [number, number] = [512, 128], size?: number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'brassPlate'
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), mat.brass())
  back.castShadow = true
  back.receiveShadow = true
  g.add(back)
  const map = labelTexture({ lines, bg: tokens['br.brass'], color: tokens['br.ink'], width: tex[0], height: tex[1], border: tokens['br.ink'], size, letterSpacing: 0.16 })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.55 }))
  face.position.z = 0.0035
  face.receiveShadow = true
  g.add(face)
  return g
}

/** The inventory tag, painted small on a brass label plate 60 × 16 mm. Origin at the plate's centre, facing +z. */
function inventoryTag(tag: string): THREE.Mesh {
  const map = labelTexture({ text: tag, bg: tokens['br.brass'], color: tokens['br.ink'], width: 128, height: 32, padding: 4, letterSpacing: 0.1 })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.015), new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.5 }))
  mesh.name = `tag:${tag}`
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/** A transparent hit box for an object BoardView places later, so hover labels work at its spot. */
function hitBox(id: string, size: Vec3, at: Vec3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  m.name = `hit:${id}`
  m.position.set(...at)
  m.castShadow = false
  m.receiveShadow = false
  m.userData.hotspot = id
  return m
}

/** Every material the room is built from, made once per build. */
interface Kitbag {
  teak: THREE.MeshStandardMaterial
  beech: THREE.MeshStandardMaterial
  walnut: THREE.MeshStandardMaterial
  trim: THREE.MeshPhysicalMaterial
  brass: THREE.MeshStandardMaterial
  ink: THREE.MeshPhysicalMaterial
  serge: THREE.MeshStandardMaterial
  corduroy: THREE.MeshStandardMaterial
  felt: THREE.MeshStandardMaterial
  paper: THREE.MeshStandardMaterial
  wallLacquer: THREE.MeshPhysicalMaterial
  shade: THREE.MeshStandardMaterial
  bulb: THREE.MeshStandardMaterial
  tarnish: THREE.MeshStandardMaterial
  glass: THREE.MeshStandardMaterial
}

function kitbag(ctx: BuildContext): Kitbag {
  const p = ctx.region
  return {
    teak: mat.wood({ base: p.ground, grain: p.woodGrain, seed: 'br:teak', repeat: [2, 1] }),
    beech: mat.wood({ base: tokens['out.path'], grain: tokens['hs.ground'], seed: 'br:beech', repeat: [1, 2] }),
    walnut: mat.wood({ base: p.ground, grain: tokens['br.darkBody'], seed: 'br:walnut', repeat: [1, 1] }),
    trim: mat.lacquer(p.trim),
    brass: mat.brass(),
    ink: mat.lacquer(p.ink),
    serge: mat.felt(tokens['grid.darkIslet']),
    corduroy: corduroyMaterial(),
    felt: mat.felt(p.felt),
    paper: mat.paper(tokens['paper.white']),
    wallLacquer: mat.lacquer(p.wall),
    shade: new THREE.MeshStandardMaterial({ color: p.paper, emissive: new THREE.Color(p.light), emissiveIntensity: 0.4, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    bulb: new THREE.MeshStandardMaterial({ color: p.light, emissive: new THREE.Color(p.light), emissiveIntensity: 1.0, roughness: 0.9, metalness: 0 }),
    tarnish: new THREE.MeshStandardMaterial({ color: tokens['hs.brass'], roughness: 0.62, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: p.paper, transparent: true, opacity: 0.09, roughness: 0.08, metalness: 0.1, depthWrite: false }),
  }
}

// ───────────────────────────── The shell ─────────────────────────────

/** Floor, three walls, ceiling, skirting and cornice; the two windows with their sea planes. Returns the sea texture for the tick. */
function shell(ctx: BuildContext, kb: Kitbag, into: THREE.Group): THREE.CanvasTexture {
  const { w, h, d } = ROOM
  const p = ctx.region

  const floorMap = teakFloor({ seed: 'br:floor', chairs: [[0, CHAIR.z], [0, -CHAIR.z]] })
  const floor = surface(w, d, new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.55, metalness: 0 }))
  floor.rotation.x = -Math.PI / 2
  floor.name = 'floor'
  into.add(floor)

  // Door openings as u-spans on each side wall's canvas (drawn as seen from inside the room).
  const leftDoor: [number, number] = [(3 - (DOOR.z + DOOR.w / 2)) / d, (3 - (DOOR.z - DOOR.w / 2)) / d]
  const rightDoor: [number, number] = [(DOOR.z - DOOR.w / 2 + 3) / d, (DOOR.z + DOOR.w / 2 + 3) / d]

  const backMap = tongueAndGroove({ seed: 'br:wall:back', metresW: w, metresH: h, bleach: false, doors: [] })
  const back = surface(w, h, new THREE.MeshStandardMaterial({ map: backMap, roughness: 0.7, metalness: 0 }))
  back.position.set(0, h / 2, -d / 2)
  back.name = 'wall:back'
  into.add(back)

  for (const sx of [-1, 1] as const) {
    const map = tongueAndGroove({ seed: `br:wall:${sx}`, metresW: d, metresH: h, bleach: true, doors: [sx < 0 ? leftDoor : rightDoor] })
    const side = surface(d, h, new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 }))
    side.rotation.y = (-sx * Math.PI) / 2
    side.position.set((sx * w) / 2, h / 2, 0)
    side.name = `wall:${sx < 0 ? 'left' : 'right'}`
    into.add(side)
  }

  const ceiling = surface(w, d, mat.plaster(p.trim))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  ceiling.name = 'ceiling'
  into.add(ceiling)

  // Skirting, cornice and a chair rail, all in the pale lacquer; the skirting stops at the doors.
  const kit = new Kit()
  kit.box(w, 0.12, 0.025, kb.trim, [0, 0.06, -d / 2 + 0.0125])
  kit.box(w, 0.09, 0.09, kb.trim, [0, h - 0.045, -d / 2 + 0.045])
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.0125)
    const nearLen = 3 - (DOOR.z + DOOR.w / 2 + 0.05)
    const farLen = (DOOR.z - DOOR.w / 2 - 0.05) + 3
    kit.box(0.025, 0.12, nearLen, kb.trim, [x, 0.06, 3 - nearLen / 2])
    kit.box(0.025, 0.12, farLen, kb.trim, [x, 0.06, -3 + farLen / 2])
    kit.box(0.09, 0.09, d, kb.trim, [sx * (w / 2 - 0.045), h - 0.045, 0])
  }
  // A beam across the ceiling at the room's centre line: the cabin's deckhead.
  kit.box(w, 0.12, 0.16, kb.trim, [0, h - 0.06, -1.5])
  kit.box(w, 0.12, 0.16, kb.trim, [0, h - 0.06, 1.5])

  // Windows: frame and mullions in the pale lacquer, a brass catch, the sill; the sea plane sits proud of the wall.
  const sea = seaTexture('br:sea')
  const seaMat = new THREE.MeshBasicMaterial({ map: sea })
  const glassKit = new Kit()
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2)
    const rot: Vec3 = [0, (-sx * Math.PI) / 2, 0]
    const cy = WINDOW.sill + WINDOW.h / 2
    const f = 0.07, proud = 0.05
    // frame members run along z on the side wall: build them in wall-local space (x along the wall) then rotate
    const local = (lz: number, ly: number, proud: number): Vec3 => [x - sx * proud, ly, lz]
    for (const s of [-1, 1]) kit.box(f, WINDOW.h + 0.1, proud, kb.trim, local(WINDOW.z + s * (WINDOW.w / 2 + f / 2), cy, proud / 2), rot)
    kit.box(WINDOW.w + 2 * f, f, proud, kb.trim, local(WINDOW.z, WINDOW.sill + WINDOW.h + f / 2, proud / 2), rot)
    kit.box(WINDOW.w + 2 * f, f, proud, kb.trim, local(WINDOW.z, WINDOW.sill - f / 2, proud / 2), rot)
    kit.box(0.035, WINDOW.h, 0.03, kb.trim, local(WINDOW.z, cy, 0.02), rot)
    kit.box(WINDOW.w, 0.035, 0.03, kb.trim, local(WINDOW.z, cy, 0.02), rot)
    kit.box(WINDOW.w + 2 * f + 0.12, 0.04, 0.12, kb.trim, local(WINDOW.z, WINDOW.sill - f - 0.02, 0.06), rot)
    glassKit.box(0.05, 0.012, 0.012, kb.brass, local(WINDOW.z, cy + 0.03, 0.04), rot)
    glassKit.plane(WINDOW.w, WINDOW.h, seaMat, local(WINDOW.z, cy, 0.012), rot)
    glassKit.plane(WINDOW.w, WINDOW.h, kb.glass, local(WINDOW.z, cy, 0.03), rot)
  }
  kit.flush(into, 'trim')
  const glassMeshes = glassKit.flush(into, 'window', false)
  for (const m of glassMeshes) if (m.material === seaMat || m.material === kb.glass) { m.castShadow = false; m.receiveShadow = false }
  return sea
}

// ───────────────────────────── Doors and the stair ─────────────────────────────

/**
 * A cased doorway on a side wall: jambs and head in the pale lacquer, a dark recess, a leaf in the wall's
 * blue hung from the wall's far end and ajar into the room, a brass knob, and the destination's brass plate
 * above. Built with the wall at local z = 0 opening toward +z, then turned to its wall.
 */
function doorway(hs: HotspotDef, kb: Kitbag, side: -1 | 1): THREE.Group {
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const hinge = side < 0 ? 1 : -1
  const kit = new Kit()
  const recess = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), mat.flat(tokens['br.ink']))
  recess.position.set(0, DOOR.h / 2, 0.006)
  recess.castShadow = false
  g.add(recess)
  for (const s of [-1, 1]) kit.box(0.09, DOOR.h + 0.09, 0.11, kb.trim, [s * (DOOR.w / 2 + 0.045), (DOOR.h + 0.09) / 2, 0.055])
  kit.box(DOOR.w + 0.18, 0.09, 0.11, kb.trim, [0, DOOR.h + 0.045, 0.055])
  kit.box(DOOR.w, 0.012, 0.11, kb.brass, [0, 0.006, 0.055])
  // the leaf, hung from `hinge`, swung 0.5 rad into the room
  const leafW = DOOR.w - 0.06, leafH = DOOR.h - 0.05
  const pivot = new THREE.Group()
  pivot.position.set(hinge * (DOOR.w / 2 - 0.02), 0, 0.09)
  pivot.rotation.y = hinge * 0.5
  const lx = -hinge * leafW / 2
  const leafKit = new Kit()
  leafKit.box(leafW, leafH, 0.04, kb.wallLacquer, [lx, leafH / 2 + 0.01, 0])
  for (const [y, ph] of [[1.55, 0.72], [0.58, 0.62]] as const) {
    leafKit.box(leafW - 0.22, ph, 0.012, kb.wallLacquer, [lx, y, 0.024])
    leafKit.box(leafW - 0.22, ph, 0.012, kb.wallLacquer, [lx, y, -0.024])
  }
  leafKit.box(0.22, 0.012, 0.028, kb.brass, [-hinge * (leafW - 0.16), 1.0, 0])
  leafKit.sphere(0.024, kb.brass, [-hinge * (leafW - 0.09), 1.0, 0.035])
  leafKit.sphere(0.024, kb.brass, [-hinge * (leafW - 0.09), 1.0, -0.035])
  leafKit.box(leafW - 0.1, 0.16, 0.006, kb.brass, [lx, 0.12, 0.024])
  leafKit.flush(pivot, 'leaf')
  g.add(pivot)
  kit.flush(g, 'casing')
  const plate = brassPlate([hs.label], 0.56, 0.085, [512, 96])
  plate.position.set(0, DOOR.h + 0.24, 0.02)
  g.add(plate)
  return g
}

/**
 * The stair to the Landing: eight teak treads climbing along the back wall toward the right, pale risers
 * and a closed string, a brass-capped newel at each end, balusters as one instanced mesh, and above the
 * top step the dark opening of the stair shaft with its plate.
 */
function staircase(hs: HotspotDef, kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = `stair:${hs.id}`
  const n = 8, rise = 0.19, run = 0.26, width = 0.9
  const x0 = 1.15, zc = -ROOM.d / 2 + width / 2
  const kit = new Kit()
  for (let i = 0; i < n; i++) {
    const x = x0 + i * run
    kit.box(run + 0.03, 0.035, width, kb.teak, [x + run / 2, (i + 1) * rise - 0.0175, zc])
    kit.box(0.02, rise - 0.035, width, kb.trim, [x + 0.01, i * rise + (rise - 0.035) / 2, zc])
  }
  const length = Math.hypot(n * run, n * rise), angle = Math.atan2(rise, run)
  const front = -ROOM.d / 2 + width
  // closed string and the panel beneath, on the room side
  kit.box(length + 0.1, 0.3, 0.03, kb.trim, [x0 + (n * run) / 2, (n * rise) / 2 - 0.02, front + 0.015], [0, 0, angle])
  const spandrel = new THREE.Shape()
  spandrel.moveTo(x0, 0)
  spandrel.lineTo(x0 + n * run, 0)
  spandrel.lineTo(x0 + n * run, n * rise - 0.12)
  spandrel.closePath()
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(spandrel), kb.wallLacquer)
  panel.position.z = front + 0.005
  panel.castShadow = true
  panel.receiveShadow = true
  panel.name = 'spandrel'
  g.add(panel)
  // a landing at the top and the shaft opening in the wall above it
  kit.box(ROOM.w / 2 - (x0 + n * run) - 0.04, 0.035, width, kb.teak, [(x0 + n * run + ROOM.w / 2 - 0.04) / 2, n * rise - 0.0175, zc])
  const ox = x0 + n * run - 0.75, ow = ROOM.w / 2 - 0.16 - ox, oh = 2.05
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), mat.flat(tokens['br.ink']))
  opening.position.set(ox + ow / 2, n * rise + oh / 2, -ROOM.d / 2 + 0.006)
  opening.castShadow = false
  opening.name = 'shaft'
  g.add(opening)
  for (const s of [-1, 1]) kit.box(0.08, oh + 0.08, 0.08, kb.trim, [ox + ow / 2 + s * (ow / 2 + 0.04), n * rise + (oh + 0.08) / 2, -ROOM.d / 2 + 0.04])
  kit.box(ow + 0.16, 0.08, 0.08, kb.trim, [ox + ow / 2, n * rise + oh + 0.04, -ROOM.d / 2 + 0.04])
  // handrail and newels
  const railX = front - 0.05
  kit.box(0.08, 1.0, 0.08, kb.teak, [x0 - 0.02, 0.5, railX])
  kit.box(0.08, 1.0, 0.08, kb.teak, [x0 + n * run + 0.04, n * rise + 0.5, railX])
  kit.sphere(0.045, kb.brass, [x0 - 0.02, 1.04, railX], 16)
  kit.sphere(0.045, kb.brass, [x0 + n * run + 0.04, n * rise + 1.04, railX], 16)
  kit.box(length + 0.06, 0.045, 0.045, kb.teak, [x0 + (n * run) / 2 + 0.01, (n * rise) / 2 + 0.9, railX], [0, 0, angle])
  kit.flush(g, 'stair')
  const baluster = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.013, 0.86, 10), kb.trim, n * 2)
  const m = new THREE.Matrix4()
  let k = 0
  for (let i = 0; i < n; i++) for (const f of [0.28, 0.72]) {
    m.makeTranslation(x0 + i * run + run * f, (i + 1) * rise + 0.43 + (f - 0.5) * rise, railX)
    baluster.setMatrixAt(k++, m)
  }
  baluster.instanceMatrix.needsUpdate = true
  baluster.castShadow = true
  baluster.receiveShadow = true
  baluster.name = 'balusters'
  g.add(baluster)
  const plate = brassPlate([hs.label], 0.56, 0.085, [512, 96])
  plate.position.set(ox + ow / 2, n * rise + oh + 0.24, -ROOM.d / 2 + 0.02)
  g.add(plate)
  return g
}

/** The plan chest on the left of the far wall, balancing the stair: five long teak drawers with brass pulls and label holders. */
function planChest(kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = 'planChest'
  const w = 1.9, h = 1.02, d = 0.52
  const kit = new Kit()
  kit.box(w - 0.1, 0.1, d - 0.08, kb.ink, [0, 0.05, 0])
  kit.box(w, h - 0.14, d, kb.teak, [0, 0.1 + (h - 0.14) / 2, 0])
  kit.box(w + 0.06, 0.03, d + 0.04, kb.teak, [0, h - 0.015, 0.01])
  const rows = 5, rh = (h - 0.16) / rows
  for (let i = 0; i < rows; i++) {
    const y = 0.11 + rh * (i + 0.5)
    kit.box(w - 0.08, rh - 0.02, 0.014, kb.teak, [0, y, d / 2 + 0.007])
    for (const s of [-1, 1]) {
      kit.box(0.09, 0.014, 0.012, kb.brass, [s * 0.5, y - 0.005, d / 2 + 0.02])
      kit.cyl(0.006, 0.006, 0.018, kb.brass, [s * 0.5, y - 0.005, d / 2 + 0.014], 8, [Math.PI / 2, 0, 0])
    }
    kit.box(0.07, 0.024, 0.004, kb.brass, [0, y, d / 2 + 0.016])
  }
  kit.flush(g, 'planChest')
  return g
}

// ───────────────────────────── Furniture ─────────────────────────────

/** The teak table, 1.2 × 0.9, top at 0.72: a thick top, an apron, four turned legs on felt. */
function teakTable(kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = 'table'
  const { width: w, depth: d, top } = dressing.table
  const kit = new Kit()
  kit.box(w, 0.04, d, kb.teak, [0, top - 0.02, 0])
  kit.box(w - 0.1, 0.08, d - 0.1, kb.teak, [0, top - 0.08, 0])
  const legProfile: [number, number][] = [[0.032, 0], [0.032, 0.05], [0.046, 0.08], [0.046, 0.3], [0.034, 0.34], [0.05, 0.4], [0.05, 0.44], [0.036, 0.48], [0.036, 0.62]]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const at: Vec3 = [sx * (w / 2 - 0.09), 0, sz * (d / 2 - 0.09)]
    kit.lathe(legProfile, kb.teak, at, 20)
    kit.cyl(0.034, 0.034, 0.008, kb.felt, [at[0], 0.004, at[2]], 16)
  }
  kit.flush(g, 'table')
  return g
}

/** A beech chair with a corduroy seat, facing +z; two stiles rise to a turned ball at `CHAIR.backTop`. */
function beechChair(kb: Kitbag, seed: string): THREE.Group {
  const g = new THREE.Group()
  g.name = `chair:${seed}`
  const s = CHAIR.size, sh = CHAIR.seat
  const kit = new Kit()
  kit.box(s, 0.035, s, kb.beech, [0, sh - 0.0175, 0])
  const half = s / 2 - 0.03
  for (const sx of [-1, 1]) kit.cyl(0.019, 0.024, sh - 0.035, kb.beech, [sx * half, (sh - 0.035) / 2, half], 12)
  const stileH = CHAIR.backTop - 0.02
  for (const sx of [-1, 1]) {
    kit.cyl(0.02, 0.026, stileH, kb.beech, [sx * half, stileH / 2, -half], 12)
    kit.sphere(0.022, kb.beech, [sx * half, CHAIR.backTop - 0.022, -half], 12)
  }
  kit.box(s - 0.06, 0.075, 0.028, kb.beech, [0, 0.92, -half])
  for (const y of [0.63, 0.76]) kit.box(s - 0.1, 0.048, 0.014, kb.beech, [0, y, -half + 0.004])
  for (const sx of [-1, 1]) kit.box(0.018, 0.028, s - 0.1, kb.beech, [sx * half, 0.19, 0])
  kit.box(s - 0.1, 0.028, 0.018, kb.beech, [0, 0.19, half])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl(0.026, 0.026, 0.008, kb.felt, [sx * half, 0.004, sz * half], 12)
  kit.flush(g, 'chairFrame')
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(s - 0.04, 0.045, s - 0.04), kb.corduroy)
  cushion.position.set(0, sh + 0.0225, 0.01)
  cushion.castShadow = true
  cushion.receiveShadow = true
  cushion.name = 'cushion'
  g.add(cushion)
  return g
}

/** The Society's peaked cap: navy serge crown and band, a lacquered peak, the badge tarnished. Origin at the crown's centre. */
function peakedCap(kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cap'
  const kit = new Kit()
  kit.cyl(0.082, 0.082, 0.032, kb.ink, [0, 0.016, 0], 24)
  kit.lathe([[0.082, 0.03], [0.1, 0.05], [0.108, 0.07], [0.098, 0.088], [0.06, 0.1], [0.001, 0.104]], kb.serge, [0, 0, 0], 24)
  kit.place(new THREE.CylinderGeometry(0.098, 0.098, 0.005, 20, 1, false, -Math.PI / 2, Math.PI), kb.ink, [0, 0.003, 0.01], [0.22, 0, 0])
  kit.place(new THREE.TorusGeometry(0.0155, 0.0025, 6, 16), kb.tarnish, [0, 0.02, 0.083], [0, 0, 0])
  kit.cyl(0.011, 0.011, 0.004, kb.tarnish, [0, 0.02, 0.083], 12, [Math.PI / 2, 0, 0])
  kit.flush(g, 'cap')
  return g
}

/** The lectern left of the table: a teak pedestal, a sloped desk with the ledger roll on brass spindles, the typed Olivetti panel on its front. */
function lectern(kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = 'lectern'
  const kit = new Kit()
  kit.box(0.42, 0.05, 0.36, kb.ink, [0, 0.025, 0])
  kit.box(0.32, 0.9, 0.26, kb.teak, [0, 0.5, 0])
  kit.box(0.36, 0.03, 0.3, kb.teak, [0, 0.965, 0])
  const tilt = 0.38
  const desk = new THREE.Group()
  desk.position.set(0, 1.03, 0.02)
  desk.rotation.x = tilt
  const deskKit = new Kit()
  deskKit.box(0.54, 0.03, 0.42, kb.teak, [0, 0, 0])
  deskKit.box(0.54, 0.03, 0.03, kb.teak, [0, 0.02, 0.2])
  for (const z of [-0.17, 0.17]) {
    deskKit.cyl(0.013, 0.013, 0.5, kb.brass, [0, 0.03, z], 14, [0, 0, Math.PI / 2])
    for (const sx of [-1, 1]) deskKit.cyl(0.02, 0.02, 0.012, kb.brass, [sx * 0.255, 0.03, z], 12, [0, 0, Math.PI / 2])
  }
  deskKit.flush(desk, 'desk')
  const roll = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshStandardMaterial({ map: ledgerTexture(), roughness: 0.95, metalness: 0 }))
  roll.rotation.x = -Math.PI / 2
  roll.position.set(0, 0.032, 0)
  roll.receiveShadow = true
  roll.name = 'ledgerRoll'
  desk.add(roll)
  g.add(desk)
  kit.flush(g, 'lectern')
  const typed = labelTexture({ lines: ['OLIVETTI', dressing.firstCard], font: 'mono', bg: tokens['paper.white'], color: tokens['br.ink'], width: 512, height: 128, padding: 22, paper: true, align: 'left' })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.065), new THREE.MeshStandardMaterial({ map: typed, roughness: 0.95, metalness: 0 }))
  panel.position.set(0, 0.8, 0.132)
  panel.name = 'olivettiPanel'
  panel.receiveShadow = true
  g.add(panel)
  const tag = inventoryTag('HS-0003')
  tag.position.set(0, 0.72, 0.132)
  g.add(tag)
  return g
}

/** The small walnut side table right of the table, top at 0.72, for the chronometer box. */
function sideTable(kb: Kitbag): THREE.Group {
  const g = new THREE.Group()
  g.name = 'sideTable'
  const kit = new Kit()
  kit.box(0.38, 0.03, 0.32, kb.walnut, [0, 0.705, 0])
  kit.box(0.32, 0.07, 0.26, kb.walnut, [0, 0.655, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.cyl(0.014, 0.02, 0.62, kb.walnut, [sx * 0.15, 0.31, sz * 0.12], 12)
    kit.cyl(0.02, 0.02, 0.006, kb.felt, [sx * 0.15, 0.003, sz * 0.12], 12)
  }
  kit.flush(g, 'sideTable')
  const tag = inventoryTag('HS-0002')
  tag.position.set(0, 0.655, 0.131)
  g.add(tag)
  return g
}

/** A brass cabin lamp on the far wall: backplate, arm, a small shade and one warm point light (no shadows). */
function cabinLamp(kb: Kitbag, light: string): THREE.Group {
  const g = new THREE.Group()
  g.name = 'cabinLamp'
  const kit = new Kit()
  kit.box(0.1, 0.16, 0.014, kb.brass, [0, 0, 0.007])
  kit.cyl(0.008, 0.008, 0.24, kb.brass, [0, 0.02, 0.13], 10, [Math.PI / 2, 0, 0])
  kit.sphere(0.018, kb.brass, [0, 0.02, 0.25], 12)
  kit.cyl(0.014, 0.02, 0.03, kb.brass, [0, -0.005, 0.25], 12)
  kit.flush(g, 'lamp')
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.1, 28, 1, true), kb.shade)
  shade.position.set(0, -0.07, 0.25)
  shade.castShadow = false
  shade.name = 'shade'
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), kb.bulb)
  bulb.position.set(0, -0.08, 0.25)
  bulb.castShadow = false
  g.add(bulb)
  const point = new THREE.PointLight(new THREE.Color(light), 4.5, 7, 2)
  point.position.set(0, -0.12, 0.27)
  point.castShadow = false
  point.name = 'lampLight'
  g.add(point)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

function hotspot(ctx: BuildContext, id: string): HotspotDef {
  const hs = ctx.def.hotspots.find((h) => h.id === id)
  if (!hs) throw new Error(`boardroom: no hotspot ${id} in the frame definition`)
  return hs
}

/** Freezes an object's local matrix so nothing moves it afterwards (bible §11: hover moves nothing). */
function freeze(o: THREE.Object3D): void {
  o.updateMatrix()
  o.matrixAutoUpdate = false
}

/**
 * Builds the Board Room in local space (origin at the floor centre, open toward +z). Registers every
 * hotspot of the frame definition; the board, the instruments and the tide gauge are BoardView's, and
 * their hotspots are thin transparent hit boxes at their places. `group.userData.tick(dt)` scrolls the sea.
 */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const p = ctx.region
  const kb = kitbag(ctx)
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }

  const sea = shell(ctx, kb, group)

  // Doors on the side walls, the stair on the far wall right of centre, the plan chest left of centre.
  const chartDoor = doorway(hotspot(ctx, 'boardroom.door.chartroom'), kb, -1)
  chartDoor.position.set(-ROOM.w / 2, 0, DOOR.z)
  chartDoor.rotation.y = Math.PI / 2
  group.add(chartDoor)
  register('boardroom.door.chartroom', chartDoor)

  const galleyDoor = doorway(hotspot(ctx, 'boardroom.door.galley'), kb, 1)
  galleyDoor.position.set(ROOM.w / 2, 0, DOOR.z)
  galleyDoor.rotation.y = -Math.PI / 2
  group.add(galleyDoor)
  register('boardroom.door.galley', galleyDoor)

  const stair = staircase(hotspot(ctx, 'boardroom.stair'), kb)
  group.add(stair)
  register('boardroom.stair', stair)

  const chest = planChest(kb)
  chest.position.set(-2.2, 0, -ROOM.d / 2 + 0.27)
  group.add(chest)

  // The far wall: the clock left of centre, nothing at the gauge's place; the two placards beneath them.
  const clock = wallClock({ colors: p, diameter: 0.34, y: CLOCK_AT.y, hours: 4, minutes: 12, seed: 'br:clock' })
  clock.position.set(CLOCK_AT.x, 0, -ROOM.d / 2)
  group.add(clock)
  const gaugeRule = dressing.placards[0]
  const order4 = dressing.placards[1]
  const leftPlacard = brassPlate([order4], 0.72, 0.075, [1024, 96])
  leftPlacard.position.set(CLOCK_AT.x, 0.74, -ROOM.d / 2 + 0.004)
  group.add(leftPlacard)
  const rightPlacard = brassPlate([gaugeRule], 0.72, 0.075, [1024, 96])
  rightPlacard.position.set(-CLOCK_AT.x, 0.74, -ROOM.d / 2 + 0.004)
  group.add(rightPlacard)

  // Cabin lamps, one each side of the far wall.
  for (const sx of [-1, 1]) {
    const lamp = cabinLamp(kb, p.light)
    lamp.position.set(sx * 2.55, 2.35, -ROOM.d / 2)
    group.add(lamp)
  }

  // The menu plate on the left wall; a framed chart of the same size on the right wall answers it.
  const menu = brassPlate(dressing.menuPlate, 0.8, 0.6, [512, 512])
  menu.position.set(-ROOM.w / 2 + 0.004, 1.85, -0.9)
  menu.rotation.y = Math.PI / 2
  group.add(menu)
  const chart = pictureFrame({ colors: p, kind: 'map', width: 0.8, height: 0.6, y: 1.85, seed: 'br:chart' })
  chart.position.set(ROOM.w / 2, 0, -0.9)
  chart.rotation.y = -Math.PI / 2
  group.add(chart)

  // The table at the origin, its tags on the apron, and the hit boxes for what BoardView will place.
  const table = teakTable(kb)
  group.add(table)
  const { width: tw, depth: td, top } = dressing.table
  const apron = (tag: string, at: Vec3, rot: Vec3 = [0, 0, 0]): void => {
    const t = inventoryTag(tag)
    t.position.set(...at)
    t.rotation.set(...rot)
    table.add(t)
  }
  apron('HS-0001', [0, top - 0.08, td / 2 - 0.05 + 0.001])
  apron('HS-0007', [-0.34, top - 0.08, td / 2 - 0.05 + 0.001])
  apron('HS-0009', [tw / 2 - 0.05 + 0.001, top - 0.08, 0], [0, Math.PI / 2, 0])
  apron('HS-0006', [0, top - 0.08, -(td / 2 - 0.05) - 0.001], [0, Math.PI, 0])
  apron('HS-0005', [-0.4, top - 0.08, -(td / 2 - 0.05) - 0.001], [0, Math.PI, 0])

  const boardSize = dressing.board.size
  const hits: [string, Vec3, Vec3][] = [
    ['boardroom.board', [0.6, 0.02, 0.6], [0, 0.735, 0]],
    ['boardroom.mast', [0.06, 0.1, 0.06], [-boardSize / 2 - 0.05, top + 0.05, -td / 2 + 0.06]],
    ['boardroom.davit', [0.08, 0.15, 0.08], [0, top + 0.075, -td / 2 + 0.06]],
    ['boardroom.spares', [0.06, 0.05, 0.42], [tw / 2 - 0.03, top - 0.03, 0]],
    ['boardroom.returned', [boardSize, 0.02, 0.11], [0, top + 0.01, boardSize / 2 + 0.03 + 0.055]],
    ['boardroom.consult', [0.09, 0.012, 0.04], [-boardSize / 2 - 0.07, top + 0.006, boardSize / 2 + 0.02]],
    ['boardroom.turn', [0.09, 0.012, 0.04], [-boardSize / 2 - 0.07, top + 0.006, boardSize / 2 + 0.08]],
  ]
  for (const [id, size, at] of hits) {
    const hit = hitBox(id, size, at)
    group.add(hit)
    out.hotspots.set(id, hit)
  }

  // The chronometer's side table, right of the table.
  const side = sideTable(kb)
  side.position.set(0.85, 0, 0)
  group.add(side)
  const chrono = hitBox('boardroom.chronometer', [0.3, 0.14, 0.2], [0.85, 0.72 + 0.07, 0])
  group.add(chrono)
  out.hotspots.set('boardroom.chronometer', chrono)

  // Two chairs across the table. The far one is the Station Master's; the cap on its right post is the flaw.
  const near = beechChair(kb, 'near')
  near.position.set(0, 0, CHAIR.z)
  near.rotation.y = Math.PI
  group.add(near)

  const far = beechChair(kb, 'far')
  far.position.set(0, 0, -CHAIR.z)
  group.add(far)
  register('boardroom.chair', far)
  const chairTag = inventoryTag('HS-0008')
  chairTag.position.set(0, 0.92, -(CHAIR.size / 2 - 0.03) + 0.015)
  far.add(chairTag)
  if (dressing.cap.post === 'right') {
    const cap = peakedCap(kb)
    const half = CHAIR.size / 2 - 0.03
    cap.position.set(half + 0.035, CHAIR.backTop - 0.055, -half + 0.02)
    cap.rotation.set(0.32, 0.35, -0.42)
    far.add(cap)
  }

  // The lectern left of the table, holding the ledger and the Olivetti panel.
  const desk = lectern(kb)
  desk.position.set(-1.1, 0, 0.55)
  desk.rotation.y = 0.28
  group.add(desk)
  register('boardroom.ledger', desk)

  // Where Miss Brace stands when consulted: the left of frame.
  const anchor = new THREE.Group()
  anchor.name = 'resident:brace'
  anchor.position.set(-2.3, 0, 0.7)
  group.add(anchor)
  out.residentAnchor = anchor

  // The sea scrolls slowly behind both panes; nothing else in the room moves.
  group.userData.tick = (dt: number): void => {
    sea.offset.x = (sea.offset.x + dt * 0.006) % 1
  }

  for (const child of group.children) freeze(child)
  return out
}
