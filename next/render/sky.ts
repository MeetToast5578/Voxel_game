import * as THREE from 'three';
import { mulberry32 } from '../core/random';

/** Sky colours at the zenith and the horizon for a sun height (-1..1) and cloud cover (0..1), in display space. */
export function skyColors(sunY: number, cloud: number, zenith: THREE.Color, horizon: THREE.Color): void {
  const day = Math.min(1, Math.max(0, (sunY + 0.15) / 0.4));
  const dusk = Math.max(0, 1 - Math.abs(sunY) / 0.25);
  zenith.setRGB(0.02 + 0.33 * day, 0.03 + 0.5 * day, 0.08 + 0.82 * day);
  horizon.setRGB(0.04 + 0.62 * day + 0.45 * dusk, 0.05 + 0.75 * day + 0.12 * dusk, 0.1 + 0.85 * day - 0.05 * dusk);
  // Overcast skies turn grey.
  const grey = 0.08 + 0.55 * day;
  zenith.lerp(new THREE.Color(grey, grey, grey * 1.05), cloud * 0.75);
  horizon.lerp(new THREE.Color(grey * 1.05, grey * 1.05, grey * 1.1), cloud * 0.7);
}

const DOME_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane, behind everything
}`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform float dusk;
uniform float flash;
uniform float underground;
uniform vec3 caveFog;
in vec3 vDir;
out vec4 outColor;
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 c = mix(horizon, zenith, pow(up, 0.6));
  // Below the horizon the sky stays the horizon colour, which is also the fog colour: far terrain fades into it.
  if (d.y < 0.0) c = horizon;
  float toward = max(dot(d, normalize(sunDir)), 0.0);
  // A warm band around the sun near sunrise and sunset, and a glow around the sun by day.
  c += vec3(1.0, 0.45, 0.15) * dusk * pow(toward, 6.0) * (1.0 - up) * 0.8;
  c += vec3(1.0, 0.9, 0.7) * pow(toward, 64.0) * 0.4 * clamp(sunDir.y * 4.0 + 0.5, 0.0, 1.0);
  c = mix(c, vec3(0.85, 0.88, 1.0), flash);
  // Under ground, whatever shows through gaps beyond the loaded chunks is the dark cave fog.
  c = mix(c, caveFog, underground);
  outColor = vec4(c, 1.0);
}`;

/** A disc texture for the sun, and the moon lit by its phase. */
function discTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  draw(canvas.getContext('2d')!, 64);
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Sky dome, sun, moon, stars and lightning. Everything sits around the camera, at no fixed place in the world. */
export class Sky {
  readonly zenith = new THREE.Color();
  readonly horizon = new THREE.Color();
  private readonly dome: THREE.Mesh;
  private readonly domeUniforms: Record<string, THREE.IUniform>;
  private readonly sun: THREE.Sprite;
  private readonly moon: THREE.Sprite;
  private readonly stars: THREE.Points;
  private readonly group = new THREE.Group();
  private moonPhaseDrawn = -1;
  private readonly moonCanvas: THREE.CanvasTexture;

  constructor(scene: THREE.Scene, seed: number) {
    this.domeUniforms = {
      zenith: { value: this.zenith }, horizon: { value: this.horizon }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      dusk: { value: 0 }, flash: { value: 0 }, underground: { value: 0 }, caveFog: { value: new THREE.Color(0.02, 0.02, 0.025) },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT, uniforms: this.domeUniforms,
      side: THREE.BackSide, depthWrite: false,
    }));
    this.dome.renderOrder = -20;
    this.dome.frustumCulled = false;
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture((ctx, s) => {
        ctx.fillStyle = '#fff6d8';
        ctx.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
      }), color: 0xffffff, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.moonCanvas = discTexture(() => undefined);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moonCanvas, depthWrite: false, fog: false, transparent: true }));
    const rand = mulberry32(seed + 77);
    const starPositions = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      // Uniform on the sphere.
      const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      starPositions.set([r * Math.cos(a), u, r * Math.sin(a)], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false,
    }));
    for (const o of [this.dome, this.sun, this.moon, this.stars]) {
      o.renderOrder = -20;
      o.frustumCulled = false;
      this.group.add(o);
    }
    scene.add(this.group);
  }

  /**
   * Places everything around `camera` for a sun direction (unit), moon phase (0 new, 0.5 full), cloud cover and a
   * lightning flash (0..1), and updates `zenith` and `horizon`.
   */
  update(camera: THREE.Camera, distance: number, sun: [number, number, number], moonPhase: number, cloud: number,
    flash: number, starAngle: number, underground = 0): void {
    this.domeUniforms.underground!.value = underground;
    this.group.position.copy(camera.position);
    this.dome.scale.setScalar(distance);
    skyColors(sun[1], cloud, this.zenith, this.horizon);
    this.domeUniforms.sunDir!.value.set(sun[0], sun[1], sun[2]);
    this.domeUniforms.dusk!.value = Math.max(0, 1 - Math.abs(sun[1]) / 0.25) * (1 - cloud);
    this.domeUniforms.flash!.value = flash;
    const d = distance * 0.8;
    this.sun.position.set(sun[0] * d, sun[1] * d, sun[2] * d);
    this.sun.scale.setScalar(distance * 0.12);
    this.sun.visible = sun[1] > -0.1 && cloud < 0.85 && underground < 0.5;
    this.moon.position.set(-sun[0] * d, -sun[1] * d, -sun[2] * d);
    this.moon.scale.setScalar(distance * 0.08);
    this.moon.visible = sun[1] < 0.1 && cloud < 0.85 && underground < 0.5;
    const night = Math.min(1, Math.max(0, (-sun[1] + 0.05) / 0.25));
    (this.stars.material as THREE.PointsMaterial).opacity = night * (1 - cloud) * (1 - underground);
    this.stars.scale.setScalar(d);
    this.stars.rotation.set(starAngle, 0, 0.4);
    this.drawMoon(moonPhase);
  }

  /** The moon's lit part: a disc with a shadow sliding across it through the month. */
  private drawMoon(phase: number): void {
    const bucket = Math.round(phase * 16) % 16;
    if (bucket === this.moonPhaseDrawn) return;
    this.moonPhaseDrawn = bucket;
    const canvas = this.moonCanvas.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#e8ecf4';
    ctx.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
    // Shadow offset: covers the disc at new moon, leaves it whole at full moon.
    const lit = (1 - Math.cos((bucket / 16) * Math.PI * 2)) / 2;
    const offset = (bucket < 8 ? -1 : 1) * lit * s * 0.5;
    ctx.fillStyle = 'rgba(8, 10, 20, 0.92)';
    if (lit < 0.97) ctx.fillRect(s * 0.25 + offset, s * 0.25, s * 0.5, s * 0.5);
    ctx.clearRect(0, 0, s * 0.25, s);
    ctx.clearRect(s * 0.75, 0, s * 0.25, s);
    this.moonCanvas.needsUpdate = true;
  }
}
