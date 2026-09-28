// Text on things: placards, luggage tags, book spines and painted signs.
import * as THREE from 'three'
import { labelTexture, mat } from './materials'
import { ui } from '../content/palette'

/** A flat plaque with text; double sided so it reads from either side of a table. */
export function placard(o: { lines: string[]; width: number; height: number; bg: string; color: string; font?: 'sans' | 'mono'; border?: string; size?: number }): THREE.Mesh {
  const texH = 128
  const texW = Math.min(1024, Math.max(128, 2 ** Math.round(Math.log2((o.width / o.height) * texH))))
  const map = labelTexture({ lines: o.lines, font: o.font, bg: o.bg, color: o.color, border: o.border, size: o.size, width: texW, height: texH })
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), material)
  mesh.name = 'placard'
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

/** Luggage-tag outline: a rectangle with one clipped end, in metres. */
function tagShape(w: number, h: number, clip: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -h / 2)
  s.lineTo(w / 2 - clip, -h / 2)
  s.lineTo(w / 2, -h / 2 + clip)
  s.lineTo(w / 2, h / 2 - clip)
  s.lineTo(w / 2 - clip, h / 2)
  s.lineTo(-w / 2, h / 2)
  s.closePath()
  return s
}

/**
 * A paper luggage tag, text typed in Courier Prime, with a brass eyelet and a short string.
 * Origin at the eyelet; the tag hangs toward −y. Name 'tag'.
 */
export function tag(text: string, o: { color?: string; ink?: string } = {}): THREE.Group {
  const paper = o.color ?? ui.paper
  const ink = o.ink ?? ui.ink
  const w = 0.13, h = 0.065, depth = 0.0015
  const group = new THREE.Group()
  group.name = 'tag'

  const card = new THREE.Mesh(new THREE.ExtrudeGeometry(tagShape(w, h, 0.012), { depth, bevelEnabled: false }), mat.paper(paper))
  card.castShadow = true
  card.receiveShadow = true
  card.position.set(0, -h / 2 - 0.006, -depth / 2)
  group.add(card)

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.72, h * 0.72),
    new THREE.MeshStandardMaterial({ map: labelTexture({ text, font: 'mono', bg: paper, color: ink, width: 256, height: 128, padding: 10, paper: true, letterSpacing: 0.02 }), roughness: 0.9, metalness: 0 }),
  )
  label.position.set(-w * 0.09, -h / 2 - 0.006, depth / 2 + 0.0004)
  group.add(label)

  const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0022, 8, 24), mat.brass())
  eyelet.position.set(w / 2 - 0.016, -0.012, 0)
  eyelet.castShadow = true
  group.add(eyelet)

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(w / 2 - 0.016, -0.012, 0.002),
    new THREE.Vector3(w / 2 - 0.006, 0.012, 0.006),
    new THREE.Vector3(0.012, 0.03, 0.004),
    new THREE.Vector3(0, 0, 0),
  ])
  const string = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0009, 6, false), mat.flat(ink))
  string.castShadow = true
  group.add(string)
  return group
}

/** Rotates a horizontal label canvas 90° clockwise into a tall canvas (title reads top to bottom). */
function rotatedSpineTexture(src: THREE.CanvasTexture): THREE.CanvasTexture {
  const img = src.image as HTMLCanvasElement
  const out = document.createElement('canvas')
  out.width = img.height
  out.height = img.width
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.translate(out.width / 2, out.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
  }
  const tex = new THREE.CanvasTexture(out)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * A clothbound book standing upright, spine toward +z, origin at the bottom centre.
 * The title runs down the spine in letterspaced caps.
 */
export function bookSpine(title: string, o: { color: string; ink: string; height: number; thickness: number; depth: number }): THREE.Mesh {
  const texW = 1024, texH = 256
  const used = Math.min(texH, Math.round((texW * o.thickness) / o.height))
  const flat = labelTexture({ text: title, bg: o.color, color: o.ink, width: texW, height: texH, padding: (texH - used) / 2 + used * 0.22, letterSpacing: 0.22, weight: 500, border: o.ink })
  const spine = rotatedSpineTexture(flat)
  spine.repeat.set(used / texH, 1)
  spine.offset.set((1 - used / texH) / 2, 0)
  const cloth = mat.flat(o.color)
  const pages = mat.paper(ui.paper)
  const spineMat = new THREE.MeshStandardMaterial({ map: spine, roughness: 0.8, metalness: 0 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.thickness, o.height, o.depth), [cloth, cloth, pages, cloth, spineMat, pages])
  mesh.name = 'book'
  mesh.position.y = o.height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** A painted board sign with a hairline border and four brass screws. Origin at the centre. */
export function sign(o: { text: string; width: number; bg: string; color: string; depth?: number }): THREE.Group {
  const depth = o.depth ?? 0.03
  const height = o.width * 0.28
  const group = new THREE.Group()
  group.name = 'sign'
  const board = new THREE.Mesh(new THREE.BoxGeometry(o.width, height, depth), mat.flat(o.bg))
  board.castShadow = true
  board.receiveShadow = true
  group.add(board)
  const face = placard({ lines: [o.text], width: o.width, height, bg: o.bg, color: o.color, border: o.color })
  face.position.z = depth / 2 + 0.0005
  group.add(face)
  const screw = new THREE.CylinderGeometry(0.006, 0.006, 0.003, 12)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s = new THREE.Mesh(screw, mat.brass())
      s.rotation.x = Math.PI / 2
      s.position.set(sx * (o.width / 2 - 0.03), sy * (height / 2 - 0.03), depth / 2 + 0.0015)
      group.add(s)
    }
  }
  return group
}
