import * as THREE from 'three';
import { HORIZON_RADIUS_M, toCells } from '../config';

const VERTEX = /* glsl */ `
in vec3 color;
uniform vec3 sunDir;
out vec3 vColor;
out float vDist;
out vec2 vXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = world.xz;
  float shade = 0.55 + 0.45 * max(dot(normalize(normal), normalize(vec3(-0.4, 1.0, 0.3))), 0.0);
  vColor = color * shade;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform float daylight;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float hole;
in vec3 vColor;
in vec2 vXZ;
out vec4 outColor;
void main() {
  float d = length(vXZ - cameraPosition.xz);
  // Inside the loaded terrain the real chunks are drawn instead.
  if (d < hole) discard;
  vec3 c = vColor * (0.04 + 0.96 * daylight);
  outColor = vec4(mix(c, fogColor, (1.0 - exp(-3.0 * clamp((d - fogNear) / (fogFar - fogNear), 0.0, 1.0))) / (1.0 - exp(-3.0))), 1.0);
}`;

/** Rings of far terrain heights around a centre, built in a worker and drawn under the real chunks. */
export class Horizon {
  readonly mesh: THREE.Mesh;
  readonly radii: Float32Array;
  readonly segments = 128;
  /** Where the current rings are centred (cells), or null before the first build. */
  center: [number, number] | null = null;

  constructor(scene: THREE.Scene, uniforms: Record<string, THREE.IUniform>, innerCells: number) {
    this.radii = new Float32Array(48);
    this.setInner(innerCells);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: { ...uniforms, hole: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Sets the innermost ring's radius (cells); the rings must then be built again. */
  setInner(innerCells: number): void {
    const outer = toCells(HORIZON_RADIUS_M), rings = this.radii.length;
    // Rings grow geometrically: fine near the view's edge, coarse far out.
    for (let i = 0; i < rings; i++) this.radii[i] = innerCells * Math.pow(outer / innerCells, i / (rings - 1));
    this.center = null;
  }

  /** The hole radius (cells) where real terrain is drawn instead. */
  setHole(cells: number): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.hole!.value = cells;
  }

  /** Builds the mesh from sampled heights (cells) and colours, centred on (x, z). */
  set(x: number, z: number, heights: Float32Array, colors: Uint8Array): void {
    const rings = this.radii.length, seg = this.segments;
    const positions = new Float32Array(rings * seg * 3), rgb = new Float32Array(rings * seg * 3);
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < seg; k++) {
        const i = r * seg + k, a = (k / seg) * Math.PI * 2;
        positions.set([Math.cos(a) * this.radii[r]!, heights[i]!, Math.sin(a) * this.radii[r]!], i * 3);
        rgb.set([colors[i * 3]! / 255, colors[i * 3 + 1]! / 255, colors[i * 3 + 2]! / 255], i * 3);
      }
    }
    const index: number[] = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let k = 0; k < seg; k++) {
        const a = r * seg + k, b = r * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
        index.push(a, b, c, b, d, c);
      }
    }
    const g = this.mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    this.mesh.position.set(x, 0, z);
    this.mesh.updateMatrix();
    this.center = [x, z];
    this.mesh.visible = true;
  }
}
