// The Stage: WebGL renderer, scene, camera and the film post-pass (grain, vignette, directional blur).
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ui } from '../content/palette'
import { setEnvironment } from './materials'

const GRAIN_AMOUNT = 0.035

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

const FRAG = /* glsl */ `
uniform sampler2D tFrame;
uniform vec2 resolution;
uniform float time;
uniform float grain;
uniform float vignette;
uniform float blur;
uniform vec2 blurDir;
varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 9 taps along the blur direction, jittered per pixel so the taps do not band.
vec3 sampleBlurred(vec2 uv) {
  if (blur <= 0.0005) return texture2D(tFrame, uv).rgb;
  vec2 step = blurDir * blur * 0.04 / 8.0;
  float jitter = hash(gl_FragCoord.xy + fract(time) * 100.0) - 0.5;
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = -4; i <= 4; i++) {
    float w = 1.0 - abs(float(i)) / 5.0;
    sum += texture2D(tFrame, uv + step * (float(i) + jitter)).rgb * w;
    weight += w;
  }
  return sum / weight;
}

void main() {
  vec3 color = sampleBlurred(vUv);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  // vignette: soft, elliptical, weighted toward the corners
  vec2 q = (vUv - 0.5) * vec2(1.0, resolution.y / resolution.x) * 2.0;
  float d = length(q) * 0.72;
  float vig = 1.0 - vignette * smoothstep(0.35, 1.15, d);
  gl_FragColor.rgb *= vig;
  // grain: animated, luminance-weighted so highlights stay clean
  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  float n = hash(gl_FragCoord.xy + vec2(fract(time * 1.37), fract(time * 0.61)) * 1024.0) - 0.5;
  gl_FragColor.rgb += n * grain * mix(1.0, 0.4, lum);
  #include <colorspace_fragment>
}`

/**
 * Owns the WebGL renderer, the one scene and the perspective camera, and renders through a
 * fullscreen film pass. Resizes itself with the container.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private readonly target: THREE.WebGLRenderTarget
  private readonly post: THREE.ShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly quadScene = new THREE.Scene()
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly container: HTMLElement
  private readonly started = performance.now()

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(new THREE.Color(ui.bg), 1)
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    setEnvironment(pmrem.fromScene(room, 0.04).texture)
    room.dispose()
    pmrem.dispose()

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400)
    this.camera.position.set(0, 1.6, 9)
    this.camera.lookAt(0, 1.4, 0)

    const halfFloat = this.renderer.extensions.has('EXT_color_buffer_float') || this.renderer.extensions.has('EXT_color_buffer_half_float')
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
    })

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tFrame: { value: this.target.texture },
        resolution: { value: new THREE.Vector2(1, 1) },
        time: { value: 0 },
        grain: { value: GRAIN_AMOUNT },
        vignette: { value: 0.32 },
        blur: { value: 0 },
        blurDir: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post)
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)

    this.resize()
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(container)
    } else {
      window.addEventListener('resize', () => this.resize())
    }
  }

  /** Film grain on or off (the amount itself is fixed and subtle). */
  setGrain(on: boolean): void {
    this.post.uniforms.grain.value = on ? GRAIN_AMOUNT : 0
  }

  /** Vignette strength, 0 (none) to 1 (heavy). */
  setVignette(amount: number): void {
    this.post.uniforms.vignette.value = THREE.MathUtils.clamp(amount, 0, 1)
  }

  /** Directional motion blur (0..1) along (dirX, dirY) in screen space; used during whip pans. */
  setMotionBlur(amount: number, dirX: number, dirY: number): void {
    this.post.uniforms.blur.value = THREE.MathUtils.clamp(amount, 0, 1)
    const len = Math.hypot(dirX, dirY) || 1
    ;(this.post.uniforms.blurDir.value as THREE.Vector2).set(dirX / len, dirY / len)
  }

  /** Renders the scene into the film target, then the post pass to the screen. */
  render(): void {
    this.post.uniforms.time.value = (performance.now() - this.started) / 1000
    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.quadScene, this.quadCamera)
  }

  /** Fits renderer, target and camera to the container. */
  resize(): void {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth)
    const h = Math.max(1, this.container.clientHeight || window.innerHeight)
    this.renderer.setSize(w, h, true)
    const pr = this.renderer.getPixelRatio()
    this.target.setSize(Math.round(w * pr), Math.round(h * pr))
    ;(this.post.uniforms.resolution.value as THREE.Vector2).set(w * pr, h * pr)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Raycasts from a pointer position (client px) into `objects`, recursively; nearest first. */
  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection[] {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster.intersectObjects(objects, true)
  }
}
