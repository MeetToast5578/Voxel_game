import * as THREE from 'three';
import type { RayHit } from '../game/raycast';
import { TILE_NAMES, TILE_SIZE, tilePixels } from './tilePixels';

/** Outline of the targeted cell, and cracks spreading over it while it is being broken. */
export class Highlight {
  private readonly lines: THREE.LineSegments;
  private readonly cracks: THREE.Mesh;
  private readonly stages: THREE.DataTexture[] = [];

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.lines.visible = false;
    scene.add(this.lines);
    const pixels = tilePixels(), size = TILE_SIZE * TILE_SIZE * 4;
    for (let i = 0; i < 10; i++) {
      const layer = TILE_NAMES.indexOf(`crack_${i}`);
      const t = new THREE.DataTexture(new Uint8Array(pixels.subarray(layer * size, (layer + 1) * size)), TILE_SIZE, TILE_SIZE);
      t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      this.stages.push(t);
    }
    this.cracks = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: this.stages[0]!, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false }));
    this.cracks.visible = false;
    scene.add(this.cracks);
  }

  /** `progress` 0..1 shows cracks (0 none). */
  set(hit: RayHit | null, progress = 0): void {
    this.lines.visible = hit !== null;
    this.cracks.visible = hit !== null && progress > 0;
    if (!hit) return;
    this.lines.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.cracks.position.copy(this.lines.position);
    if (progress > 0) (this.cracks.material as THREE.MeshBasicMaterial).map = this.stages[Math.min(9, Math.floor(progress * 10))]!;
  }
}
