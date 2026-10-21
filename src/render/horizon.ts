import * as THREE from 'three';
import { CHUNK_SIZE, HORIZON_RECENTER_BLOCKS } from '../config';
import type { HorizonData } from '../world/horizon';

/** Dedicated terrain worker; coalesces camera movement and replaces/disposes completed meshes. */
export class Horizon {
  private readonly worker: Worker | null;
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
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: true, fog: false });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHorizonXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHorizonXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHorizonXZ;\nuniform vec2 uCenter;\nuniform float uInner;\nuniform float uOverlap;\nuniform float uFar;\nuniform float uDaylight;\nuniform vec3 uSky;\nuniform float uHaze;')
        .replace('#include <color_fragment>', `#include <color_fragment>\nfloat hd = length(vHorizonXZ-uCenter);\nfloat farRange = uFar * (1.0 - uHaze * 0.65);\ndiffuseColor.rgb = mix(diffuseColor.rgb * uDaylight, uSky, smoothstep(farRange * 0.15, farRange, hd));\ndiffuseColor.a *= smoothstep(uInner, uInner + uOverlap, hd) * (1.0 - smoothstep(farRange * 0.85, farRange, hd));\nif (diffuseColor.a < 0.01) discard;`);
    };
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.renderOrder = -1; this.mesh.visible = false;
    scene.add(this.mesh);
    this.worker = enabled ? new Worker(new URL('../workers/horizonWorker.ts', import.meta.url), { type: 'module' }) : null;
    if (this.worker) {
      this.worker.onerror = e => console.error('horizon worker error:', e.message);
      this.worker.onmessage = (e: MessageEvent<HorizonData>) => {
        const d = e.data, geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(d.indices, 1)); geometry.computeBoundingSphere();
        this.mesh.geometry.dispose(); this.mesh.geometry = geometry; this.mesh.position.set(d.centerX, 0, d.centerZ);
        this.centerX = d.centerX; this.centerZ = d.centerZ; this.radius = d.radius; this.vertices = d.positions.length / 3; this.builds++;
        this.uniforms.uFar.value = d.radius;
        this.busy = false; this.pump();
      };
    }
  }
  update(x: number, z: number, renderDistance: number, visible: boolean): void {
    this.mesh.visible = visible && this.radius > 0;
    if (!this.worker || !visible) return;
    this.uniforms.uCenter.value.set(x, z);
    // Match the circular voxel load radius; coarse terrain must not cover the near scene.
    this.uniforms.uInner.value = Math.max(CHUNK_SIZE, (renderDistance - 1) * CHUNK_SIZE);
    this.uniforms.uOverlap.value = CHUNK_SIZE;
    const step = Math.min(HORIZON_RECENTER_BLOCKS, Math.max(CHUNK_SIZE, renderDistance * CHUNK_SIZE / 2));
    const cx = Math.floor(x / step) * step;
    const cz = Math.floor(z / step) * step;
    const key = `${cx},${cz},${renderDistance}`;
    if (key !== this.key) { this.key = key; this.desired = { seed: this.seed, centerX: cx, centerZ: cz, viewBlocks: renderDistance * CHUNK_SIZE }; }
    this.pump();
  }
  private pump(): void {
    if (!this.worker || this.busy || !this.desired) return;
    const request = this.desired; this.desired = null; this.busy = true; this.worker.postMessage(request);
  }
  setEnvironment(daylight: number, sky: number, haze: number): void {
    this.uniforms.uDaylight.value = daylight; this.uniforms.uSky.value.setHex(sky); this.uniforms.uHaze.value = haze;
  }
  get visible(): boolean { return this.mesh.visible; }
}
