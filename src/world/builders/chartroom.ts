// Frame 2: The Chart Room (ground, left). docs/BIBLE.md §6 Frame 2, palette §3.2 with the olive band.
// The great chart of the Sixty-Four on a sloped chart table, centred; behind it the Predictor on its
// iron frame, the full-height tide gauge left of it and the barometer right; symmetrical racks of
// rolled charts against the back wall. The one flaw: a tube in the right rack is empty, its tag reading
// SHEET 9 · OUT WITH THE LAUNCH. Constance Brace sits at the table facing the room; nothing moves on hover.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { HotspotDef } from '../../types'
import { FONT_MONO, FONT_SANS } from '../../core/fonts'
import { mat, seeded } from '../../scene/materials'
import { placard, tag } from '../../scene/text3d'
import { tokens, type RegionPalette } from '../../content/palette'
import { FILES, FILE_WORDS, RANKS, RANK_WORDS } from '../../content/survey'
import { dressing } from '../../content/frames/chartroom'
import { figure } from '../figures'
import * as props from '../props'
import type { BuildContext, BuiltFrame } from '../frames'

/** Interior of the room in metres: width, height, depth (open toward +z, back wall at z = −d/2). */
const ROOM = { w: 7, h: 4.2, d: 6 } as const

/** The chart table's slope toward the camera, so the sheet reads from the room station. */
const TABLE_TILT = THREE.MathUtils.degToRad(11)

// ───────────────────────────── Helpers ─────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** A palette hex with alpha, for canvas painting. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** A canvas painted once, wrapped as an sRGB texture. */
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
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/** Letterspaced Jost capitals on a canvas; falls back to plain text where letterSpacing is unsupported. */
function caps(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 500, spacing = 0.12, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${weight} ${size}px ${FONT_SANS}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${spacing * size}px`
  ctx.fillText(text.toUpperCase(), x, y)
  if ('letterSpacing' in c) c.letterSpacing = '0px'
}

/** Collects geometry per material and merges it into one mesh per material: one draw call each. */
class Merger {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler, scale?: THREE.Vector3): void {
    const g = geometry.clone()
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1))
    g.applyMatrix4(m)
    const list = this.parts.get(material) ?? []
    list.push(g)
    this.parts.set(material, list)
  }

  box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, rot)
  }

  cyl(rt: number, rb: number, h: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0, rot?: THREE.Euler): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, rot)
  }

  /** Emits one mesh per material into `into`, with shadows, and returns them. */
  build(into: THREE.Object3D, name: string, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, material)
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

const ROT_X90 = new THREE.Euler(Math.PI / 2, 0, 0)
const ROT_Z90 = new THREE.Euler(0, 0, Math.PI / 2)

/** A small paper plate with the inventory tag in letterspaced caps (HS-0102 and the rest). */
function hsPlate(text: string, p: RegionPalette, width = 0.11): THREE.Mesh {
  const plate = placard({ lines: [text], width, height: width * 0.3, bg: p.paper, color: p.ink, border: p.ink })
  plate.name = `hs:${text}`
  return plate
}

/** An engraved brass placard: capitals on brass, a hairline border, centred. */
function brassPlacard(lines: string[], width: number, height: number, p: RegionPalette): THREE.Mesh {
  const plate = placard({ lines, width, height, bg: p.brass, color: p.ink, border: p.ink })
  plate.name = 'placard:brass'
  return plate
}

/** A translucent painted plane for the wear pass (corner grime, a scuff, a bare patch). */
function wearPlane(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Mesh {
  const map = canvasTexture(64, 64, paint)
  const m = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  mesh.name = 'wear'
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

// ───────────────────────────── The shell ─────────────────────────────

function shell(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const { w, h, d } = ROOM
  const g = new THREE.Group()
  g.name = 'shell'

  const floor = props.floor({ colors: p, width: w, depth: d + 2, seed: 'chartroom:floor' })
  floor.position.z = 1
  g.add(floor)

  const back = props.wall({ colors: p, width: w, height: h, seed: 'chartroom:back' })
  back.position.z = -d / 2
  g.add(back)
  for (const s of [-1, 1]) {
    const side = props.wall({ colors: p, width: d, height: h, seed: `chartroom:side${s}` })
    side.position.x = s * (w / 2)
    side.rotation.y = -s * (Math.PI / 2)
    g.add(side)
  }

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.plaster(p.trim))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = h
  ceiling.receiveShadow = true
  g.add(ceiling)

  // The olive knot-and-anchor band: a lattice in hs.olive over the mustard, under the cornice, on all three walls.
  const bandY = 3.2, bandH = 0.84
  const paper = mat.wallpaper({ pattern: 'lattice', bg: p.wall, fg: p.wallAlt, scale: 1, repeat: [w / 0.96, bandH / 0.96] })
  const bandBack = new THREE.Mesh(new THREE.PlaneGeometry(w, bandH), paper)
  bandBack.position.set(0, bandY, -d / 2 + 0.004)
  bandBack.receiveShadow = true
  g.add(bandBack)
  const paperSide = mat.wallpaper({ pattern: 'lattice', bg: p.wall, fg: p.wallAlt, scale: 1, repeat: [d / 0.96, bandH / 0.96] })
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(d, bandH), paperSide)
    band.position.set(s * (w / 2 - 0.004), bandY, 0)
    band.rotation.y = -s * (Math.PI / 2)
    band.receiveShadow = true
    g.add(band)
  }

  // Trims, merged: the band's olive rails, a dado rail, the cornice, all round three walls.
  const m = new Merger()
  const olive = mat.lacquer(p.wallAlt)
  const trim = mat.lacquer(p.trim)
  const plaster = mat.plaster(p.trim)
  const runs: { len: number; x: number; z: number; rot: THREE.Euler }[] = [
    { len: w, x: 0, z: -d / 2, rot: new THREE.Euler() },
    { len: d, x: -w / 2, z: 0, rot: new THREE.Euler(0, Math.PI / 2, 0) },
    { len: d, x: w / 2, z: 0, rot: new THREE.Euler(0, -Math.PI / 2, 0) },
  ]
  for (const r of runs) {
    const along = (dz: number, y: number, h2: number, t: number, material: THREE.Material): void => {
      // A box of length `len` along the wall, `t` proud of it, at height `y`; dz is its centre's distance off the wall.
      const off = new THREE.Vector3(0, 0, dz).applyEuler(r.rot)
      m.box(r.len, h2, t, material, r.x + off.x, y, r.z + off.z, r.rot)
    }
    along(0.012, bandY + bandH / 2 + 0.02, 0.04, 0.024, olive)
    along(0.012, bandY - bandH / 2 - 0.02, 0.04, 0.024, olive)
    along(0.02, 1.04, 0.05, 0.04, trim)
    along(0.08, h - 0.05, 0.1, 0.16, plaster)
    along(0.045, h - 0.14, 0.08, 0.09, plaster)
    along(0.025, h - 0.21, 0.06, 0.05, trim)
  }
  m.build(g, 'trims', false)

  // Wear: corner grime toward the back corners, grime along the floor line, a scuff band and a bare patch by the door.
  const grime = (ctx2: CanvasRenderingContext2D, cw: number, ch: number, dir: 'left' | 'right' | 'down'): void => {
    const grad = dir === 'down' ? ctx2.createLinearGradient(0, 0, 0, ch) : ctx2.createLinearGradient(0, 0, cw, 0)
    const a = rgba(p.ink, 0), b = rgba(p.ink, 0.16)
    grad.addColorStop(0, dir === 'right' ? b : a)
    grad.addColorStop(1, dir === 'right' ? a : b)
    ctx2.fillStyle = grad
    ctx2.fillRect(0, 0, cw, ch)
  }
  for (const s of [-1, 1]) {
    const corner = wearPlane(0.9, h - 0.3, (c, cw, ch) => grime(c, cw, ch, s < 0 ? 'right' : 'left'))
    corner.position.set(s * (w / 2 - 0.45), h / 2, -d / 2 + 0.006)
    g.add(corner)
  }
  const foot = wearPlane(w, 0.32, (c, cw, ch) => grime(c, cw, ch, 'down'))
  foot.position.set(0, 0.3, -d / 2 + 0.006)
  g.add(foot)
  const scuff = wearPlane(1.2, 0.04, (c, cw, ch) => { c.fillStyle = rgba(p.ink, 0.2); c.fillRect(0, 0, cw, ch) })
  scuff.position.set(w / 2 - 0.006, 0.35, -0.95)
  scuff.rotation.y = -Math.PI / 2
  g.add(scuff)
  const bare = wearPlane(1.1, 0.9, (c, cw, ch) => {
    const grad = c.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2)
    grad.addColorStop(0, rgba(p.paper, 0.22))
    grad.addColorStop(1, rgba(p.paper, 0))
    c.fillStyle = grad
    c.fillRect(0, 0, cw, ch)
  })
  bare.rotation.x = -Math.PI / 2
  bare.position.set(w / 2 - 0.5, 0.003, 0.6)
  g.add(bare)
  return g
}

// ───────────────────────────── The chart ─────────────────────────────

/** The great chart of the Sixty-Four on a 1024² canvas: islets in two tones, every survey name, pencil ticks, a rose, the title. */
function chartTexture(p: RegionPalette, rnd: () => number): THREE.CanvasTexture {
  const light = tokens['grid.lightIslet'], dark = tokens['grid.darkIslet'], sea = tokens['out.sea']
  return canvasTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    // Foxing at 0.4 percent.
    for (let i = 0; i < 4200; i++) {
      c.fillStyle = rgba(p.brass, 0.1 + rnd() * 0.18)
      c.beginPath(); c.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.6, 0, Math.PI * 2); c.fill()
    }
    // Neat line and border.
    c.strokeStyle = p.ink
    c.lineWidth = 3
    c.strokeRect(28, 28, w - 56, h - 56)
    c.lineWidth = 1
    c.strokeRect(38, 38, w - 76, h - 76)

    // The water: a wash and painted foam lines around the grid.
    const gx = 120, gy = 96, cell = 98
    const gw = cell * 8
    c.fillStyle = rgba(sea, 0.16)
    c.fillRect(gx - 30, gy - 30, gw + 60, gw + 60)
    c.strokeStyle = rgba(sea, 0.35)
    c.lineWidth = 1
    for (let i = 0; i < 260; i++) {
      const x = gx - 30 + rnd() * (gw + 60), y = gy - 30 + rnd() * (gw + 60)
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + rnd() * 14, y + (rnd() - 0.5) * 2); c.stroke()
    }

    // Sixty-four islets, light and dark like the squares, each with its survey name.
    for (let fi = 0; fi < 8; fi++) {
      for (let ri = 0; ri < 8; ri++) {
        const x = gx + fi * cell, y = gy + (7 - ri) * cell
        const isDark = (fi + ri) % 2 === 0
        c.fillStyle = isDark ? dark : light
        c.strokeStyle = p.ink
        c.lineWidth = 1.2
        c.beginPath()
        const n = 9, cx = x + cell / 2, cy = y + cell / 2
        for (let k = 0; k <= n; k++) {
          const a = (k / n) * Math.PI * 2
          const r = cell * (0.36 + (rnd() - 0.5) * 0.08)
          const px = cx + Math.cos(a) * r * 1.08, py = cy + Math.sin(a) * r * 0.86
          if (k === 0) c.moveTo(px, py); else c.lineTo(px, py)
        }
        c.closePath()
        c.fill()
        c.stroke()
        // Soundings: a few small figures in the channel.
        c.fillStyle = rgba(p.ink, 0.7)
        c.font = `400 8px ${FONT_SANS}`
        c.textAlign = 'left'
        c.fillText(String(2 + Math.floor(rnd() * 7)), x + 4, y + 12)
        const file = FILES[fi], rank = RANKS[ri]
        const ink = isDark ? p.paper : p.ink
        caps(c, FILE_WORDS[file], cx, cy - 7, 10.5, ink, 500, 0.1)
        caps(c, RANK_WORDS[rank], cx, cy + 7, 10.5, ink, 500, 0.1)
        c.fillStyle = rgba(ink, 0.8)
        c.font = `400 8px ${FONT_SANS}`
        c.textAlign = 'right'
        c.fillText(`${file}${rank}`, x + cell - 6, y + cell - 6)
        // Pencil ticks on the visited islets, in the Navigator's hand.
        if (rnd() < 0.22) {
          c.strokeStyle = rgba(p.ink, 0.55)
          c.lineWidth = 1.5
          c.beginPath(); c.moveTo(x + 8, y + cell - 14); c.lineTo(x + 12, y + cell - 8); c.lineTo(x + 20, y + cell - 20); c.stroke()
        }
      }
    }
    // File and rank letters in the margins.
    for (let fi = 0; fi < 8; fi++) {
      caps(c, FILES[fi], gx + fi * cell + cell / 2, gy - 18, 13, p.ink)
      caps(c, FILES[fi], gx + fi * cell + cell / 2, gy + gw + 18, 13, p.ink)
    }
    for (let ri = 0; ri < 8; ri++) {
      caps(c, String(RANKS[ri]), gx - 20, gy + (7 - ri) * cell + cell / 2, 13, p.ink)
      caps(c, String(RANKS[ri]), gx + gw + 20, gy + (7 - ri) * cell + cell / 2, 13, p.ink)
    }

    // The compass rose, top right of the margin.
    const rx = w - 92, ry = 70, rr = 34
    c.strokeStyle = p.ink
    c.lineWidth = 1
    c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.stroke()
    c.beginPath(); c.arc(rx, ry, rr * 0.55, 0, Math.PI * 2); c.stroke()
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2
      const long = k % 2 === 0 ? rr : rr * 0.6
      c.fillStyle = k % 4 === 0 ? p.ink : rgba(p.ink, 0.55)
      c.beginPath()
      c.moveTo(rx + Math.cos(a) * long, ry + Math.sin(a) * long)
      c.lineTo(rx + Math.cos(a + 0.35) * rr * 0.16, ry + Math.sin(a + 0.35) * rr * 0.16)
      c.lineTo(rx + Math.cos(a - 0.35) * rr * 0.16, ry + Math.sin(a - 0.35) * rr * 0.16)
      c.closePath(); c.fill()
    }
    caps(c, 'N', rx, ry - rr - 12, 12, tokens['hs.raspberry'])

    // Title cartouche along the bottom margin.
    caps(c, 'THE SIXTY-FOUR  ·  SHEET 1', w / 2, h - 96, 26, p.ink, 500, 0.18)
    caps(c, 'HALYARD ISLAND HYDROGRAPHIC STATION.  SCALE 1 : 2,500.', w / 2, h - 66, 12, p.ink)
    caps(c, 'DRAWN BY A. HARDY 1931.  CORRECTED 1948, 1957.', w / 2, h - 46, 12, p.ink)
    // Scale bar, bottom left.
    c.fillStyle = p.ink
    for (let k = 0; k < 6; k++) { if (k % 2 === 0) c.fillRect(60 + k * 22, h - 132, 22, 5) }
    c.strokeRect(60, h - 132, 132, 5)
    caps(c, '0', 60, h - 142, 8, p.ink)
    caps(c, '300 YDS', 192, h - 142, 8, p.ink)
    // A fold line where the linen backing has creased, and the linen's weave showing through at the edges.
    c.strokeStyle = rgba(p.ink, 0.1)
    c.lineWidth = 2
    c.beginPath(); c.moveTo(w / 2, 30); c.lineTo(w / 2, h - 30); c.stroke()
    c.beginPath(); c.moveTo(30, h / 2); c.lineTo(w - 30, h / 2); c.stroke()
  })
}

/** The chart table: turned legs, a sloped top, the chart, the tide tables card, the dividers. Returns the hotspot objects. */
function chartTable(ctx: BuildContext): { group: THREE.Group; chart: THREE.Object3D; tables: THREE.Object3D; top: THREE.Group } {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'chartTable'
  const w = 1.8, d = 1.5, frameH = 0.6
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'chartroom:table', repeat: [2, 1] })
  const ink = mat.lacquer(p.ink)
  const m = new Merger()
  // Legs and apron in painted pine; the apron is a frame under the sloped top.
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (w / 2 - 0.1), sz * (d / 2 - 0.1)])
  for (const [x, z] of legs) m.cyl(0.03, 0.042, frameH - 0.06, 14, ink, x, (frameH - 0.06) / 2, z)
  m.box(w - 0.12, 0.09, d - 0.12, wood, 0, frameH - 0.05, 0)
  for (const s of [-1, 1]) m.box(w - 0.24, 0.035, 0.035, ink, 0, 0.16, s * (d / 2 - 0.1))
  m.box(0.035, 0.035, d - 0.24, ink, 0, 0.16, 0)
  // The riser at the far end that gives the top its slope.
  m.box(w - 0.3, 0.22, 0.12, wood, 0, frameH + 0.1, -d / 2 + 0.18)
  m.build(g, 'table:frame')
  for (const [x, z] of legs) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), mat.felt(p.felt))
    foot.position.set(x, 0.004, z)
    g.add(foot)
  }

  // The sloped top: pivot 0.25 m behind the centre, so the far edge rises and the near edge drops.
  const top = new THREE.Group()
  top.name = 'table:top'
  top.position.set(0, frameH + 0.2, -0.25)
  top.rotation.x = TABLE_TILT
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), wood)
  slab.position.set(0, 0, 0.25)
  slab.castShadow = true
  slab.receiveShadow = true
  top.add(slab)
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.03), ink)
  lip.position.set(0, 0.03, 0.25 + d / 2 - 0.015)
  lip.castShadow = true
  top.add(lip)

  const size = dressing.chart.size
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: chartTexture(p, seeded('chartroom:chart')), roughness: 0.9, metalness: 0 }))
  chart.name = 'chart'
  chart.rotation.x = -Math.PI / 2
  chart.position.set(0, 0.027, 0.25)
  chart.receiveShadow = true
  chart.castShadow = false
  top.add(chart)
  // Brass chart weights at the near corners hold the sheet on the slope.
  const brass = mat.brass()
  for (const s of [-1, 1]) {
    const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), brass)
    weight.position.set(s * (size / 2 - 0.06), 0.033, 0.25 + size / 2 - 0.06)
    weight.castShadow = true
    top.add(weight)
  }
  const hs102 = hsPlate('HS-0102', p, 0.1)
  hs102.position.set(-w / 2 + 0.12, -0.002, 0.25 + d / 2 + 0.0002)
  top.add(hs102)

  // The tide tables card, at the near right of the chart.
  const tables = new THREE.Group()
  tables.name = 'tideTables'
  const card = placard({ lines: ['TIDE TABLES, 1965', 'HALYARD ISLAND', 'LOW WATER ON THE 30TH AT 16:12.'], width: 0.26, height: 0.17, bg: p.paper, color: p.ink, border: p.ink })
  card.rotation.x = -Math.PI / 2
  card.position.set(0, 0.03, 0)
  tables.add(card)
  const hs119 = hsPlate('HS-0119', p, 0.07)
  hs119.rotation.x = -Math.PI / 2
  hs119.position.set(0.09, 0.0305, 0.105)
  tables.add(hs119)
  tables.position.set(w / 2 - 0.26, 0, 0.25 + d / 2 - 0.2)
  tables.rotation.y = -0.08
  top.add(tables)

  // Miss Brace's dividers: a small brass V standing on the sheet where her hand rests.
  const dividers = new THREE.Group()
  dividers.name = 'dividers'
  const dm = new Merger()
  for (const s of [-1, 1]) dm.cyl(0.0035, 0.0015, 0.15, 8, brass, s * 0.02, 0.073, 0, new THREE.Euler(0, 0, -s * 0.26))
  dm.add(new THREE.SphereGeometry(0.009, 12, 8), brass, 0, 0.148, 0)
  dm.build(dividers, 'dividers')
  dividers.position.set(0.28, 0.03, 0.25 - 0.3)
  dividers.rotation.y = 0.6
  top.add(dividers)

  g.add(top)
  return { group: g, chart, tables, top }
}

// ───────────────────────────── The Navigator's chair ─────────────────────────────

/** An oak chair, one merged mesh in timber, a felt seat pad and the inventory plate on the top rail. */
function oakChair(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'navigatorChair'
  const oak = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'chartroom:oak', repeat: [1, 1] })
  const m = new Merger()
  const s = 0.46, sh = 0.46, h = 1.0
  m.box(s, 0.035, s, oak, 0, sh - 0.0175, 0)
  const legs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (s / 2 - 0.03), sz * (s / 2 - 0.03)])
  for (const [x, z] of legs) m.box(0.04, sh - 0.035, 0.04, oak, x, (sh - 0.035) / 2, z)
  for (const sx of [-1, 1]) m.box(0.025, 0.03, s - 0.1, oak, sx * (s / 2 - 0.03), 0.18, 0)
  m.box(s - 0.1, 0.03, 0.025, oak, 0, 0.18, s / 2 - 0.03)
  for (const sx of [-1, 1]) m.box(0.04, h - sh, 0.04, oak, sx * (s / 2 - 0.03), sh + (h - sh) / 2, -s / 2 + 0.03)
  m.box(s - 0.02, 0.08, 0.03, oak, 0, h - 0.04, -s / 2 + 0.03)
  m.box(0.09, h - sh - 0.12, 0.02, oak, 0, sh + (h - sh - 0.12) / 2, -s / 2 + 0.03)
  m.build(g, 'chair')
  const pad = new THREE.Mesh(new THREE.BoxGeometry(s - 0.06, 0.03, s - 0.06), mat.felt(p.felt))
  pad.position.set(0, sh + 0.015, 0.01)
  pad.castShadow = true
  pad.receiveShadow = true
  g.add(pad)
  const hs = hsPlate('HS-0121', p, 0.09)
  hs.position.set(0, h - 0.04, -s / 2 + 0.03 + 0.0155)
  g.add(hs)
  return g
}

// ───────────────────────────── The Predictor ─────────────────────────────

/** The barometer's or the Predictor's painted dial: a paper face, ticks and a red pointer mark. */
function dialTexture(p: RegionPalette, labels: string[], size: number, title: string, needleAt: number): THREE.CanvasTexture {
  return canvasTexture(size, size, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2, r = w * 0.42
    c.strokeStyle = p.ink
    c.lineWidth = w * 0.006
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
    const n = labels.length
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (n - 1)
      const inner = r * 0.86
      c.lineWidth = w * 0.008
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner); c.stroke()
      caps(c, String(i), cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, w * 0.07, i === needleAt ? tokens['hs.raspberry'] : p.ink, 500, 0.04)
      caps(c, labels[i], cx + Math.cos(a) * r * 0.56, cy + Math.sin(a) * r * 0.56, w * 0.026, p.ink, 400, 0.08)
      for (let k = 1; k < 4 && i < n - 1; k++) {
        const b = a + ((a1 - a0) / (n - 1)) * (k / 4)
        c.lineWidth = w * 0.004
        c.beginPath(); c.moveTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); c.lineTo(cx + Math.cos(b) * r * 0.93, cy + Math.sin(b) * r * 0.93); c.stroke()
      }
    }
    caps(c, title, cx, cy + r * 0.3, w * 0.045, p.ink, 500, 0.16)
    caps(c, 'HALYARD I.  1931', cx, cy + r * 0.42, w * 0.03, p.ink, 400, 0.12)
  })
}

/** Ruled paper for the Predictor's drum: a column of low waters and the chair's moves, typed. */
function drumTexture(p: RegionPalette): THREE.CanvasTexture {
  return canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = p.paper
    c.fillRect(0, 0, w, h)
    c.strokeStyle = rgba(p.ink, 0.25)
    c.lineWidth = 1
    for (let y = 8; y < h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
    c.fillStyle = rgba(p.ink, 0.75)
    c.font = `400 10px ${FONT_MONO}`
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    const rows = ['14 SEPT  LW 16:02  1.1 M', '15 SEPT  LW 16:44  1.2 M', '16 SEPT  LW 17:20  1.2 M', '17 SEPT  LW 17:58  1.3 M', '18 SEPT  LW 18:34  1.4 M', '19 SEPT  LW 19:10  1.4 M', '20 SEPT  LW 19:50  1.5 M']
    for (let col = 0; col < 2; col++) rows.forEach((row, i) => c.fillText(row, 12 + col * 256, 16 + i * 32))
    c.strokeStyle = rgba(tokens['hs.raspberry'], 0.7)
    c.beginPath(); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5); c.stroke()
  })
}

/** The tide-predicting machine: an iron frame, a brass bedplate, forty-one pulleys on two rails, the wire, a drum and one dial. */
function predictor(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'predictor'
  const L = dressing.predictor.length, D = 0.5, bedY = 0.92
  const iron = mat.lacquer(p.ink)
  const brass = mat.brass()

  // Iron frame: four legs, side rails, a stretcher; the brass bedplate on top.
  const m = new Merger()
  const feet: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * (L / 2 - 0.06), sz * (D / 2 - 0.05)])
  for (const [x, z] of feet) {
    m.box(0.05, bedY - 0.03, 0.05, iron, x, (bedY - 0.03) / 2, z)
    m.box(0.11, 0.03, 0.11, iron, x, 0.015, z)
  }
  for (const s of [-1, 1]) {
    m.box(L - 0.12, 0.06, 0.05, iron, 0, bedY - 0.06, s * (D / 2 - 0.05))
    m.box(L - 0.12, 0.03, 0.03, iron, 0, 0.22, s * (D / 2 - 0.05))
  }
  m.box(0.05, 0.06, D - 0.1, iron, 0, bedY - 0.06, 0)
  m.build(g, 'predictor:iron')

  const bm = new Merger()
  bm.box(L, 0.03, D, brass, 0, bedY - 0.015, 0)
  // End standards, the two pulley rails between them, the crank at the right, the dial's bezel at the left.
  const railY = [1.34, 1.6]
  for (const s of [-1, 1]) {
    bm.box(0.05, 0.9, 0.08, brass, s * (L / 2 - 0.08), bedY + 0.45, 0)
    bm.box(0.12, 0.03, 0.12, brass, s * (L / 2 - 0.08), bedY + 0.015, 0)
  }
  for (const y of railY) bm.cyl(0.011, 0.011, L - 0.16, 10, brass, 0, y, 0, ROT_Z90)
  bm.cyl(0.012, 0.012, 0.16, 8, brass, L / 2 - 0.08, 1.2, 0.08, ROT_X90)
  bm.cyl(0.006, 0.006, 0.12, 8, brass, L / 2 - 0.08 + 0.06, 1.2, 0.18, ROT_Z90)
  bm.cyl(0.012, 0.012, 0.06, 10, brass, L / 2 - 0.08 + 0.12, 1.2, 0.18, ROT_Z90)
  bm.add(new THREE.TorusGeometry(0.1, 0.008, 8, 40), brass, -0.55, 1.16, D / 2 + 0.005)
  bm.build(g, 'predictor:brass')

  // Forty-one pulleys: brass discs on the two rails, alternating, instanced.
  const n = dressing.predictor.pulleys
  const x0 = -L / 2 + 0.16, x1 = 0.32
  const pitch = (x1 - x0) / (n - 1)
  const pulleyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24)
  pulleyGeo.rotateX(Math.PI / 2)
  const pulleys = new THREE.InstancedMesh(pulleyGeo, brass, n)
  pulleys.name = 'pulleys'
  pulleys.castShadow = true
  pulleys.receiveShadow = true
  const tm = new THREE.Matrix4()
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch, y = railY[i % 2]
    tm.makeTranslation(x, y, 0)
    pulleys.setMatrixAt(i, tm)
    pts.push(new THREE.Vector3(x, y + (i % 2 === 0 ? -0.03 : 0.03), 0.02))
  }
  pulleys.instanceMatrix.needsUpdate = true
  g.add(pulleys)
  // The wire, over and under the pulleys, from the left standard to the drum's pen.
  const wirePts = [new THREE.Vector3(-L / 2 + 0.08, 1.05, 0.02), ...pts, new THREE.Vector3(0.5, 1.5, 0.02), new THREE.Vector3(0.55, 1.62, 0.1)]
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts, false, 'catmullrom', 0.2), n * 6, 0.0022, 5, false), brass)
  wire.name = 'wire'
  wire.castShadow = false
  g.add(wire)

  // The paper drum at the right end on a brass axle, and the pen arm over it.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 32), new THREE.MeshStandardMaterial({ map: drumTexture(p), roughness: 0.92, metalness: 0 }))
  drum.name = 'drum'
  drum.rotation.z = Math.PI / 2
  drum.position.set(0.56, 1.42, 0)
  drum.castShadow = true
  drum.receiveShadow = true
  g.add(drum)
  const dm = new Merger()
  dm.cyl(0.014, 0.014, 0.4, 10, brass, 0.56, 1.42, 0, ROT_Z90)
  dm.cyl(0.03, 0.03, 0.02, 16, brass, 0.4, 1.42, 0, ROT_Z90)
  dm.cyl(0.004, 0.004, 0.16, 6, brass, 0.56, 1.58, 0.06, new THREE.Euler(Math.PI / 2 + 0.6, 0, 0))
  dm.build(g, 'predictor:axle')

  // The one dial on the left standard's front, a needle just past the day.
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.092, 40), new THREE.MeshStandardMaterial({ map: dialTexture(p, ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], 256, 'WOUND', 2), roughness: 0.8, metalness: 0 }))
  dial.position.set(-0.55, 1.16, D / 2 + 0.004)
  dial.receiveShadow = true
  dial.castShadow = false
  g.add(dial)
  // The needle two days past Sunday: the dial runs from 135° (SUN) through the top to 45° (SAT).
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.003), iron)
  needle.geometry.translate(0.03, 0, 0)
  needle.position.set(-0.55, 1.16, D / 2 + 0.008)
  needle.rotation.z = -(Math.PI * 0.75 + (Math.PI * 1.5 * 2.3) / 6)
  g.add(needle)
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.098, 40), mat.glass())
  glass.position.set(-0.55, 1.16, D / 2 + 0.014)
  glass.castShadow = false
  g.add(glass)

  // The engraved placard on the front rail, the inventory plate on the right standard.
  const plate = brassPlacard([dressing.placard], 1.0, 0.075, p)
  plate.position.set(0, bedY - 0.06, D / 2 - 0.05 + 0.026)
  g.add(plate)
  const hs = hsPlate('HS-0110', p, 0.09)
  hs.position.set(L / 2 - 0.08, bedY + 0.78, 0.041)
  g.add(hs)

  /** Advances the drum one line (the insert and the idle scheduler call this; nothing turns on its own). */
  g.userData.advanceDrum = (): void => { drum.rotation.x += (Math.PI * 2) / 16 }
  return g
}

// ───────────────────────────── The gauge and the barometer ─────────────────────────────

/** The full-height tide gauge: a mahogany board, a graduated brass rule, a sliding pointer at today's level. */
function tideGauge(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'tideGauge'
  const boardH = 3.5, y0 = 0.3
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, boardH, 0.03), mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'chartroom:gauge', repeat: [1, 4] }))
  board.position.set(0, y0 + boardH / 2, 0.015)
  board.castShadow = true
  board.receiveShadow = true
  g.add(board)
  const scale = canvasTexture(128, 2048, (c, w, h) => {
    c.fillStyle = p.brass
    c.fillRect(0, 0, w, h)
    c.strokeStyle = p.ink
    c.fillStyle = p.ink
    const feet = 12
    for (let i = 0; i <= feet * 10; i++) {
      const y = h - 24 - (i / (feet * 10)) * (h - 48)
      const long = i % 10 === 0, half = i % 5 === 0
      c.lineWidth = long ? 3 : 1.5
      c.beginPath(); c.moveTo(w * 0.62, y); c.lineTo(w * (long ? 0.98 : half ? 0.86 : 0.76), y); c.stroke()
      if (long) caps(c, String(i / 10), w * 0.3, y, 24, p.ink, 500, 0.04)
    }
    caps(c, 'FT', w * 0.3, 14, 14, p.ink, 500, 0.1)
  })
  const rule = new THREE.Mesh(new THREE.BoxGeometry(0.1, boardH - 0.2, 0.012), [mat.brass(), mat.brass(), mat.brass(), mat.brass(), new THREE.MeshStandardMaterial({ map: scale, roughness: 0.4, metalness: 0.7 }), mat.brass()])
  rule.position.set(0, y0 + boardH / 2, 0.036)
  rule.castShadow = true
  rule.receiveShadow = true
  g.add(rule)
  const m = new Merger()
  const brass = mat.brass()
  const level = y0 + 0.1 + (boardH - 0.2) * 0.46
  m.box(0.16, 0.026, 0.03, brass, 0, level, 0.05)
  m.add(new THREE.ConeGeometry(0.014, 0.03, 4), brass, -0.1, level, 0.05, new THREE.Euler(0, Math.PI / 4, -Math.PI / 2))
  for (const s of [-1, 1]) m.cyl(0.008, 0.008, 0.01, 10, brass, s * 0.1, y0 + boardH - 0.06, 0.03, ROT_X90)
  m.build(g, 'gauge:brass')
  const placardMesh = brassPlacard(['TIDE GAUGE.', 'READ FROM THE LEFT.  DO NOT ADJUST.'], 0.62, 0.1, p)
  placardMesh.position.set(0, y0 - 0.09, 0.02)
  g.add(placardMesh)
  return g
}

/** The barometer: a mahogany banjo board, a brass-bezelled dial reading the sea state, the needle at 8. */
function barometer(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'barometer'
  const cy = 2.0, r = 0.2
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.0, 0.03), mat.wood({ base: p.woodGrain, grain: p.ink, seed: 'chartroom:gauge', repeat: [1, 4] }))
  board.position.set(0, cy + 0.2, 0.015)
  board.castShadow = true
  board.receiveShadow = true
  g.add(board)
  const brass = mat.brass()
  const m = new Merger()
  m.cyl(r + 0.03, r + 0.03, 0.06, 48, brass, 0, cy, 0.06, ROT_X90)
  m.add(new THREE.TorusGeometry(r + 0.005, 0.01, 8, 48), brass, 0, cy, 0.092)
  m.cyl(0.02, 0.02, 0.02, 12, brass, 0, cy + 0.68, 0.03, ROT_X90)
  m.cyl(0.006, 0.006, 0.36, 8, brass, 0, cy + 0.44, 0.035)
  m.build(g, 'barometer:brass')
  const states = dressing.barometer.states
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ map: dialTexture(p, states, 512, 'SEA STATE', dressing.barometer.foundAt), roughness: 0.8, metalness: 0 }))
  face.position.set(0, cy, 0.091)
  face.receiveShadow = true
  face.castShadow = false
  g.add(face)
  // The needle at 8: the dial runs from 135° (0) through the top to 45° (8).
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25
  const angle = a0 + ((a1 - a0) * dressing.barometer.foundAt) / (states.length - 1)
  const needle = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, 0.007, 0.003), mat.lacquer(p.ink))
  needle.geometry.translate(r * 0.36, 0, 0)
  needle.position.set(0, cy, 0.096)
  needle.rotation.z = -angle
  g.add(needle)
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), brass)
  hub.position.set(0, cy, 0.096)
  g.add(hub)
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat.glass())
  glass.position.set(0, cy, 0.104)
  glass.castShadow = false
  g.add(glass)
  const hs = hsPlate('HS-0113', p, 0.09)
  hs.position.set(0, cy - r - 0.09, 0.031)
  g.add(hs)
  return g
}

// ───────────────────────────── The racks of rolled charts ─────────────────────────────

interface RackOptions { side: -1 | 1; emptyCell?: { col: number; row: number } }

/** Rolled charts, one instanced cylinder shared by both racks. */
function rollInstances(count: number): { mesh: THREE.InstancedMesh; next: () => number } {
  const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.62, 16)
  geo.rotateX(Math.PI / 2)
  const mesh = new THREE.InstancedMesh(geo, mat.paper(tokens['hs.paper']), count)
  mesh.name = 'rolls'
  mesh.castShadow = true
  mesh.receiveShadow = true
  let i = 0
  return { mesh, next: () => i++ }
}

/** A cupboard with a pigeonhole rack above it, filled with rolled charts; one cell may be empty (the flaw). */
function chartRack(ctx: BuildContext, o: RackOptions, rolls: ReturnType<typeof rollInstances>): { group: THREE.Group; empty?: THREE.Group } {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `chartRack:${o.side < 0 ? 'left' : 'right'}`
  const cols = 5, rows = 6, cw = 0.19, ch = 0.19, W = cols * cw + 0.06, baseH = 0.55, D = 0.5
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'chartroom:rack', repeat: [1, 1] })
  const m = new Merger()
  // The cupboard: carcass, two doors, a plinth.
  m.box(W, baseH, D, wood, 0, baseH / 2, 0)
  m.box(W, 0.04, D + 0.02, mat.lacquer(p.ink), 0, 0.02, 0.01)
  for (const s of [-1, 1]) m.box(W / 2 - 0.05, baseH - 0.14, 0.02, wood, s * (W / 4), baseH / 2 + 0.02, D / 2 + 0.01)
  // The rack: sides, top, shelves, dividers.
  const rackH = rows * ch + 0.03
  for (const s of [-1, 1]) m.box(0.03, rackH, D, wood, s * (W / 2 - 0.015), baseH + rackH / 2, 0)
  for (let r = 0; r <= rows; r++) m.box(W - 0.06, 0.02, D, wood, 0, baseH + 0.01 + r * ch, 0)
  for (let c = 1; c < cols; c++) m.box(0.02, rackH, D - 0.02, wood, -W / 2 + 0.03 + c * cw, baseH + rackH / 2, 0)
  m.box(W, 0.06, D + 0.02, wood, 0, baseH + rackH + 0.03, 0.01)
  m.build(g, 'rack:wood')
  const bm = new Merger()
  for (const s of [-1, 1]) bm.add(new THREE.SphereGeometry(0.012, 10, 8), mat.brass(), s * 0.05, baseH / 2 + 0.02, D / 2 + 0.03)
  bm.build(g, 'rack:brass')

  // The dark backs of the pigeonholes, merged; the rolls, instanced.
  const dark = new Merger()
  const inkFlat = mat.flat(p.ink)
  const tm = new THREE.Matrix4()
  const rnd = seeded(`chartroom:rack:${o.side}`)
  let empty: THREE.Group | undefined
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + 0.03 + c * cw + cw / 2, y = baseH + 0.02 + r * ch + ch / 2
      const isEmpty = o.emptyCell !== undefined && o.emptyCell.col === c && o.emptyCell.row === r
      if (isEmpty) {
        empty = new THREE.Group()
        empty.name = 'emptyTube'
        const back = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.02, ch - 0.02), inkFlat)
        back.position.set(x, y, -D / 2 + 0.01)
        back.receiveShadow = true
        empty.add(back)
        const hole = new THREE.Mesh(new THREE.BoxGeometry(cw - 0.02, ch - 0.02, D - 0.02), new THREE.MeshStandardMaterial({ color: p.ink, roughness: 1, metalness: 0, transparent: true, opacity: 0.001, depthWrite: false }))
        hole.position.set(x, y, 0)
        hole.castShadow = false
        empty.add(hole)
        const label = tag(dressing.emptyTube, { color: p.paper, ink: p.ink })
        label.position.set(x + 0.02, y + ch / 2 - 0.02, D / 2 + 0.012)
        label.rotation.z = -0.12
        empty.add(label)
        g.add(empty)
        continue
      }
      dark.add(new THREE.PlaneGeometry(cw - 0.02, ch - 0.02), inkFlat, x, y, -D / 2 + 0.01)
      const i = rolls.next()
      const k = 0.9 + rnd() * 0.16
      tm.compose(new THREE.Vector3(x + (rnd() - 0.5) * 0.02, y - 0.01 + (rnd() - 0.5) * 0.01, -0.06 + rnd() * 0.08), new THREE.Quaternion(), new THREE.Vector3(k, k, 1))
      // The rack's own transform is applied after build; instance matrices are corrected in `finishRolls`.
      rolls.mesh.userData.pending ??= []
      ;(rolls.mesh.userData.pending as { i: number; local: THREE.Matrix4; rack: THREE.Group }[]).push({ i, local: tm.clone(), rack: g })
    }
  }
  dark.build(g, 'rack:holes', false)
  return { group: g, empty }
}

/** Bakes every roll's matrix into the shared instanced mesh once the racks are placed. */
function finishRolls(rolls: ReturnType<typeof rollInstances>): void {
  const pending = (rolls.mesh.userData.pending ?? []) as { i: number; local: THREE.Matrix4; rack: THREE.Group }[]
  for (const { i, local, rack } of pending) {
    rack.updateMatrix()
    rolls.mesh.setMatrixAt(i, rack.matrix.clone().multiply(local))
  }
  rolls.mesh.count = pending.length
  rolls.mesh.instanceMatrix.needsUpdate = true
  delete rolls.mesh.userData.pending
}

// ───────────────────────────── Exits ─────────────────────────────

/** A cased doorway (back at z = 0, facing +z) with a panelled leaf ajar and the destination on a plate above. */
function doorway(hs: HotspotDef, ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `door:${hs.id}`
  const w = 1.0, h = 2.2, jamb = 0.1, d = 0.14
  const trim = mat.lacquer(p.trim)
  const m = new Merger()
  for (const s of [-1, 1]) m.box(jamb, h, d, trim, s * (w / 2 + jamb / 2), h / 2, d / 2)
  m.box(w + jamb * 2, jamb, d, trim, 0, h + jamb / 2, d / 2)
  m.box(w + jamb * 2 + 0.12, 0.06, 0.03, trim, 0, h + jamb + 0.03, d + 0.015)
  m.build(g, 'door:case', false)
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.flat(p.ink))
  dark.position.set(0, h / 2, 0.004)
  dark.receiveShadow = true
  g.add(dark)
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), mat.brass())
  sill.position.set(0, 0.006, d / 2)
  g.add(sill)

  // The leaf, olive, hinged on the far jamb, open into the room.
  const pivot = new THREE.Group()
  pivot.position.set(-w / 2, 0, d - 0.03)
  pivot.rotation.y = -0.5
  const lw = w - 0.02, lh = h - 0.02, t = 0.045
  const paint = mat.lacquer(p.wallAlt)
  const lm = new Merger()
  lm.box(lw, lh, t, paint, lw / 2 + 0.01, lh / 2, 0)
  const panelW = lw - 0.22, upper = lh * 0.42, lower = lh * 0.3
  for (const s of [-1, 1]) {
    lm.box(panelW, upper, 0.012, paint, lw / 2 + 0.01, lh - 0.14 - upper / 2, s * (t / 2 + 0.006))
    lm.box(panelW, lower, 0.012, paint, lw / 2 + 0.01, 0.14 + lower / 2, s * (t / 2 + 0.006))
  }
  lm.build(pivot, 'door:leaf')
  const bm = new Merger()
  for (const s of [-1, 1]) bm.add(new THREE.SphereGeometry(0.022, 14, 10), mat.brass(), lw - 0.08, 1.0, s * (t / 2 + 0.02))
  for (const y of [0.25, lh / 2, lh - 0.25]) bm.box(0.012, 0.09, t + 0.01, mat.brass(), 0.016, y, 0)
  bm.build(pivot, 'door:brass')
  g.add(pivot)

  const plate = placard({ lines: [hs.label], width: 0.7, height: 0.14, bg: p.paper, color: p.ink, border: p.ink })
  plate.position.set(0, h + jamb + 0.2, d + 0.03)
  g.add(plate)
  return g
}

/** The floor trap to the workshop: a planked hatch in an iron frame, strap hinges, a brass lifting ring, the destination on a plate. */
function trap(hs: HotspotDef, ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = `trap:${hs.id}`
  const s = 0.9
  const wood = mat.wood({ base: p.wood, grain: p.woodGrain, seed: 'chartroom:trap', repeat: [1, 1] })
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(s - 0.08, 0.035, s - 0.08), wood)
  hatch.position.y = 0.0175
  hatch.castShadow = true
  hatch.receiveShadow = true
  g.add(hatch)
  const iron = mat.lacquer(p.ink)
  const m = new Merger()
  for (const sx of [-1, 1]) m.box(0.04, 0.03, s, iron, sx * (s / 2 - 0.02), 0.015, 0)
  for (const sz of [-1, 1]) m.box(s, 0.03, 0.04, iron, 0, 0.015, sz * (s / 2 - 0.02))
  for (let i = 1; i < 5; i++) m.box(0.006, 0.004, s - 0.08, iron, -s / 2 + 0.04 + i * ((s - 0.08) / 5), 0.037, 0)
  for (const sx of [-0.6, 0.6]) m.box(0.06, 0.006, 0.36, iron, sx * (s / 2 - 0.1), 0.038, -s / 2 + 0.24)
  m.build(g, 'trap:iron')
  const bm = new Merger()
  bm.add(new THREE.TorusGeometry(0.055, 0.008, 8, 32), mat.brass(), 0, 0.044, 0.12, new THREE.Euler(Math.PI / 2, 0, 0))
  bm.box(0.05, 0.012, 0.03, mat.brass(), 0, 0.041, 0.06)
  bm.build(g, 'trap:brass')
  const plate = placard({ lines: [hs.label], width: 0.36, height: 0.075, bg: p.paper, color: p.ink, border: p.ink })
  plate.rotation.x = -Math.PI / 2
  plate.position.set(0, 0.036, -0.2)
  g.add(plate)
  return g
}

// ───────────────────────────── Lamps ─────────────────────────────

/** A brass pendant with an olive enamel shade and a warm bulb over the table; the one kind of light the builder adds. */
function pendant(ctx: BuildContext): THREE.Group {
  const p = ctx.region
  const g = new THREE.Group()
  g.name = 'pendant'
  const brass = mat.brass()
  const top = ROOM.h, y = 2.95
  const m = new Merger()
  m.cyl(0.06, 0.06, 0.02, 24, mat.plaster(p.trim), 0, top - 0.01, 0)
  m.cyl(0.006, 0.006, top - y - 0.02, 8, brass, 0, (top + y) / 2, 0)
  m.cyl(0.03, 0.02, 0.05, 16, brass, 0, y + 0.02, 0)
  m.build(g, 'pendant:brass')
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.17, 0.15, 36, 1, true), new THREE.MeshStandardMaterial({ color: p.wallAlt, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide }))
  shade.position.y = y - 0.075
  shade.castShadow = true
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshStandardMaterial({ color: p.light, emissive: p.light, emissiveIntensity: 1.0, roughness: 0.9, metalness: 0 }))
  bulb.position.y = y - 0.1
  g.add(bulb)
  const light = new THREE.PointLight(new THREE.Color(p.light), 2.2, 5.5, 2)
  light.position.y = y - 0.14
  light.castShadow = false
  g.add(light)
  return g
}

// ───────────────────────────── The frame ─────────────────────────────

/** Builds the Chart Room: the chart table with Miss Brace, the Predictor, the gauge and the barometer, the racks, the door and the trap. */
export function build(ctx: BuildContext): BuiltFrame {
  const p = ctx.region
  const { w, d } = ROOM
  const group = new THREE.Group()
  const out: BuiltFrame = { id: ctx.def.id, group, hotspots: new Map() }
  const hs = (id: string): HotspotDef | undefined => ctx.def.hotspots.find((h) => h.id === id)
  const register = (id: string, object: THREE.Object3D): void => {
    object.userData.hotspot = id
    out.hotspots.set(id, object)
  }

  group.add(shell(ctx))

  // The chart table, centred, and the Navigator's chair at its far side.
  const table = chartTable(ctx)
  table.group.position.set(0, 0, 0.8)
  group.add(table.group)
  register('chartroom.chart', table.chart)
  register('chartroom.tables', table.tables)

  const chair = oakChair(ctx)
  chair.position.set(0, 0, -0.3)
  group.add(chair)
  register('chartroom.navchair', chair)

  const brace = figure({ variant: 'brace', seated: true, seatHeight: 0.49 })
  brace.position.set(0, 0, -0.46)
  group.add(brace)
  register('chartroom.brace', brace)
  out.residentAnchor = brace

  // The Predictor against the back wall; the gauge left of it, the barometer right.
  const machine = predictor(ctx)
  machine.position.set(0, 0, -d / 2 + 0.42)
  group.add(machine)
  register('chartroom.predictor', machine)

  const gauge = tideGauge(ctx)
  gauge.position.set(-1.6, 0, -d / 2)
  group.add(gauge)

  const baro = barometer(ctx)
  baro.position.set(1.6, 0, -d / 2)
  group.add(baro)
  register('chartroom.barometer', baro)

  // Symmetrical racks of rolled charts; one tube in the right rack is empty.
  const rolls = rollInstances(60)
  const left = chartRack(ctx, { side: -1 }, rolls)
  left.group.position.set(-2.55, 0, -d / 2 + 0.26)
  group.add(left.group)
  const right = chartRack(ctx, { side: 1, emptyCell: { col: 2, row: 4 } }, rolls)
  right.group.position.set(2.55, 0, -d / 2 + 0.26)
  group.add(right.group)
  finishRolls(rolls)
  group.add(rolls.mesh)
  if (right.empty) register('chartroom.tube', right.empty)

  // Exits: the door on the right wall to the Board Room, the trap in the floor to the Workshop.
  const doorDef = hs('chartroom.door.boardroom')
  if (doorDef) {
    const door = doorway(doorDef, ctx)
    door.position.set(w / 2, 0, 0.3)
    door.rotation.y = -Math.PI / 2
    group.add(door)
    register(doorDef.id, door)
  }
  const trapDef = hs('chartroom.trap')
  if (trapDef) {
    const hatch = trap(trapDef, ctx)
    hatch.position.set(-2.35, 0, 1.6)
    group.add(hatch)
    register(trapDef.id, hatch)
  }

  // Two pendants over the table.
  for (const s of [-1, 1]) {
    const lamp = pendant(ctx)
    lamp.position.set(s * 0.75, 0, 0.6)
    group.add(lamp)
  }

  // Every hotspot the definition names has an object; any not built above gets a small paper plate on the floor so nothing dangles.
  for (const def of ctx.def.hotspots) {
    if (out.hotspots.has(def.id)) continue
    const plate = placard({ lines: [def.label], width: 0.3, height: 0.08, bg: p.paper, color: p.ink, border: p.ink })
    plate.rotation.x = -Math.PI / 2
    plate.position.set(0, 0.004, 2.2)
    group.add(plate)
    register(def.id, plate)
  }
  return out
}
