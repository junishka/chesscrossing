// Per-region light rigs: a warm shadowing key, a cool fill and a hemisphere, tuned for ACES.
import * as THREE from 'three'
import type { RegionId } from '../types'
import { palette } from '../content/palette'

/**
 * Builds the light rig for one region around `center`: key (warm, 2048 shadow map, tight
 * orthographic frustum), fill (cool, from the opposite side) and a hemisphere for the ambient bounce.
 */
export function lightRig(region: RegionId, center: THREE.Vector3): THREE.Group {
  const p = palette[region]
  const group = new THREE.Group()
  group.name = `lights:${region}`

  const key = new THREE.DirectionalLight(new THREE.Color(p.light), 2.4)
  key.name = 'key'
  key.position.copy(center).add(new THREE.Vector3(2.5, 7.5, 8))
  key.target.position.copy(center)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const cam = key.shadow.camera
  cam.left = -8; cam.right = 8; cam.top = 8; cam.bottom = -8
  cam.near = 0.5; cam.far = 40
  cam.updateProjectionMatrix()
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.radius = 4
  group.add(key, key.target)

  const fill = new THREE.DirectionalLight(new THREE.Color(p.sky), 0.8)
  fill.name = 'fill'
  fill.position.copy(center).add(new THREE.Vector3(-6, 2.5, 6))
  fill.target.position.copy(center)
  group.add(fill, fill.target)

  const hemi = new THREE.HemisphereLight(new THREE.Color(p.sky), new THREE.Color(p.wallAlt), 0.9)
  hemi.name = 'hemisphere'
  hemi.position.copy(center).add(new THREE.Vector3(0, 6, 0))
  group.add(hemi)

  return group
}
