import * as THREE from 'three';
import { CHUNK_SIZE, HORIZON_RECENTER_BLOCKS, HORIZON_DETAIL_CONTRAST, HORIZON_SLOPE_SHADE, HORIZON_LIGHT_DIRECTION, terrainTransition } from '../config';
import type { HorizonData } from '../world/horizon';

/** Dedicated terrain worker; coalesces camera movement and replaces/disposes completed meshes. */
export class Horizon {
  private worker: Worker | null = null;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly uniforms = {
    uCenter: { value: new THREE.Vector2() }, uInner: { value: 0 }, uOverlap: { value: CHUNK_SIZE }, uFar: { value: 1 },
    uDaylight: { value: 1 }, uSky: { value: new THREE.Color() }, uHaze: { value: 0 },
  };
  private busy = false;
  private desired: { seed: number; centerX: number; centerZ: number; viewBlocks: number } | null = null;
  private key = '';
  radius = 0;
  centerX = 0;
  centerZ = 0;
  vertices = 0;
  builds = 0;
  constructor(scene: THREE.Scene, private readonly seed: number, enabled: boolean) {
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, alphaHash: true, depthWrite: false, fog: false });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHorizonPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHorizonPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHorizonPosition;\nuniform vec2 uCenter;\nuniform float uInner;\nuniform float uOverlap;\nuniform float uFar;\nuniform float uDaylight;\nuniform vec3 uSky;\nuniform float uHaze;')
        .replace('#include <color_fragment>', `#include <color_fragment>\nvec3 terrainNormal = normalize(cross(dFdx(vHorizonPosition), dFdy(vHorizonPosition)));\nterrainNormal *= sign(terrainNormal.y);\nfloat slopeLight = (1.0 - ${HORIZON_SLOPE_SHADE}) + ${HORIZON_SLOPE_SHADE} * max(0.0, dot(terrainNormal, normalize(vec3(${HORIZON_LIGHT_DIRECTION.map(v => v.toFixed(3)).join(", ")}))));\nvec2 cell = floor(vHorizonPosition.xz);\nfloat detail = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);\ndiffuseColor.rgb *= slopeLight * mix(1.0 - ${HORIZON_DETAIL_CONTRAST}, 1.0 + ${HORIZON_DETAIL_CONTRAST}, detail);\nfloat hd = length(vHorizonPosition.xz-uCenter);\nfloat farRange = uFar * (1.0 - uHaze * 0.65);\ndiffuseColor.rgb = mix(diffuseColor.rgb * uDaylight, uSky, smoothstep(farRange * 0.15, farRange, hd));\ndiffuseColor.a *= smoothstep(uInner, uInner + uOverlap, hd) * (1.0 - smoothstep(farRange * 0.85, farRange, hd));\nif (diffuseColor.a < 0.01) discard;`);
    };
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.renderOrder = -1; this.mesh.visible = false;
    scene.add(this.mesh);
    if (enabled) {
      try { this.worker = new Worker(new URL('../workers/horizonWorker.ts', import.meta.url), { type: 'module' }); }
      catch { console.warn('Horizon worker unavailable; using voxel terrain only.'); }
    }
    if (this.worker) {
      this.worker.onerror = e => {
        e.preventDefault(); this.worker?.terminate(); this.worker = null;
        this.busy = false; this.desired = null; this.radius = 0; this.mesh.visible = false;
        console.warn('Horizon worker failed; using voxel terrain only.');
      };
      this.worker.onmessage = (e: MessageEvent<HorizonData>) => {
        this.setData(e.data);
        this.busy = false; this.pump();
      };
    }
  }
  update(x: number, z: number, renderDistance: number, visible: boolean): void {
    this.mesh.visible = visible && this.radius > 0;
    if (!visible) return;
    this.uniforms.uCenter.value.set(x, z);
    // Match the circular voxel load radius; coarse terrain must not cover the near scene.
    const fade = terrainTransition(renderDistance * CHUNK_SIZE);
    this.uniforms.uInner.value = fade.proxyStart;
    this.uniforms.uOverlap.value = fade.start - fade.proxyStart;
    if (!this.worker) return;
    const step = Math.min(HORIZON_RECENTER_BLOCKS, Math.max(CHUNK_SIZE, renderDistance * CHUNK_SIZE / 2));
    const cx = Math.floor(x / step) * step;
    const cz = Math.floor(z / step) * step;
    const key = `${cx},${cz},${renderDistance}`;
    if (key !== this.key) { this.key = key; this.desired = { seed: this.seed, centerX: cx, centerZ: cz, viewBlocks: renderDistance * CHUNK_SIZE }; }
    this.pump();
  }
  /** Install one complete proxy mesh. It renders before voxels without occluding their true surfaces. */
  setData(d: HorizonData): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(d.indices, 1)); geometry.computeBoundingSphere();
    this.mesh.geometry.dispose(); this.mesh.geometry = geometry; this.mesh.position.set(d.centerX, 0, d.centerZ);
    this.centerX = d.centerX; this.centerZ = d.centerZ; this.radius = d.radius; this.vertices = d.positions.length / 3; this.builds++;
    this.uniforms.uFar.value = d.radius;
  }
  private pump(): void {
    if (!this.worker || this.busy || !this.desired) return;
    const request = this.desired; this.desired = null; this.busy = true; this.worker.postMessage(request);
  }
  setEnvironment(daylight: number, sky: number, haze: number): void {
    this.uniforms.uDaylight.value = daylight; this.uniforms.uSky.value.setHex(sky); this.uniforms.uHaze.value = haze;
  }
  /** Debug comparison preserves the camera/fog range while hiding only the proxy. */
  setDebugHidden(hidden: boolean): void { this.material.visible = !hidden; }

  get visible(): boolean { return this.mesh.visible; }
}
