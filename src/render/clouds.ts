import { createNoise4D } from 'simplex-noise';
import * as THREE from 'three';
import { mulberry32 } from '../core/random';

const CLOUD_HEIGHT = 100;
const TEXTURE_SIZE = 64; // texels
const BLOCKS_PER_TEXEL = 12;
const PLANE_SIZE = 768; // blocks; beyond the fog anyway
const DRIFT_SPEED = 1.5; // blocks per second toward +X

/** A flat layer of blocky clouds that drifts slowly and stays fixed relative to the world. */
export class Clouds {
  private readonly mesh: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;
  private drift = 0;

  constructor(scene: THREE.Scene, seed: number) {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
    // Sampling 4D noise on two circles makes the texture tile seamlessly in both directions.
    const noise = createNoise4D(mulberry32(seed + 99));
    const r = 1.6;
    for (let y = 0; y < TEXTURE_SIZE; y++)
      for (let x = 0; x < TEXTURE_SIZE; x++) {
        const a = (x / TEXTURE_SIZE) * Math.PI * 2;
        const b = (y / TEXTURE_SIZE) * Math.PI * 2;
        const v = noise(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r);
        const i = (y * TEXTURE_SIZE + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
        image.data[i + 3] = v > 0.25 ? 230 : 0;
      }
    ctx.putImageData(image, 0, 0);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(PLANE_SIZE / (TEXTURE_SIZE * BLOCKS_PER_TEXEL), PLANE_SIZE / (TEXTURE_SIZE * BLOCKS_PER_TEXEL));

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), material);
    this.mesh.rotation.x = -Math.PI / 2; // lie flat; local +Y now points to world -Z
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** Keeps the plane centered on the player while the texture stays put in world space. */
  update(x: number, z: number, frameDt: number, daylight: number): void {
    this.drift += DRIFT_SPEED * frameDt;
    this.mesh.position.set(x, CLOUD_HEIGHT, z);
    const texelWorld = TEXTURE_SIZE * BLOCKS_PER_TEXEL;
    this.texture.offset.set((x - this.drift) / texelWorld, -z / texelWorld);
    (this.mesh.material as THREE.MeshBasicMaterial).color.setScalar(daylight);
  }
}
