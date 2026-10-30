import { createNoise4D } from 'simplex-noise';
import * as THREE from 'three';
import { CLOUD_HEIGHT_M, CLOUD_TEXEL_M, HORIZON_RADIUS_M, toCells } from '../config';
import { mulberry32 } from '../core/random';

const SIZE = 64; // texels; the texture tiles
const TEXEL = toCells(CLOUD_TEXEL_M);
const PLANE = toCells(HORIZON_RADIUS_M) * 2;

/**
 * A flat layer of blocky clouds that drifts with the wind. The plane follows the camera while its texture stays put
 * in the world. Cloud cover thickens it by lowering the threshold a texel needs to be cloud.
 */
export class Clouds {
  private readonly mesh: THREE.Mesh;
  private readonly texture: THREE.DataTexture;
  private readonly field = new Float32Array(SIZE * SIZE);
  private drift = 0;
  private cover = -1;

  constructor(scene: THREE.Scene, seed: number) {
    // Noise on two circles in 4D tiles seamlessly in both directions.
    const noise = createNoise4D(mulberry32(seed + 99));
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const a = (x / SIZE) * Math.PI * 2, b = (y / SIZE) * Math.PI * 2, r = 1.6;
      this.field[y * SIZE + x] = noise(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r);
    }
    this.texture = new THREE.DataTexture(new Uint8Array(SIZE * SIZE * 4), SIZE, SIZE);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(PLANE / (SIZE * TEXEL), PLANE / (SIZE * TEXEL));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE), new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(x: number, z: number, dt: number, windM_S: number, cover: number, brightness: number): void {
    this.drift += toCells(windM_S * 0.5) * dt;
    this.mesh.position.set(x, toCells(CLOUD_HEIGHT_M), z);
    const span = SIZE * TEXEL;
    this.texture.offset.set((x - this.drift) / span, -z / span);
    (this.mesh.material as THREE.MeshBasicMaterial).color.setScalar(brightness);
    const level = Math.round(cover * 20) / 20;
    if (level === this.cover) return;
    this.cover = level;
    const threshold = 0.45 - level * 0.7;
    const data = this.texture.image.data as Uint8Array;
    for (let i = 0; i < SIZE * SIZE; i++) {
      data.set([255, 255, 255, this.field[i]! > threshold ? 220 : 0], i * 4);
    }
    this.texture.needsUpdate = true;
  }
}
