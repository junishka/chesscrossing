import * as THREE from 'three'
import type { BuildContext, BuiltFrame } from '../frames'
/** stub */
export function build(ctx: BuildContext): BuiltFrame {
  const group = new THREE.Group()
  return { id: ctx.def.id, group, hotspots: new Map() }
}
