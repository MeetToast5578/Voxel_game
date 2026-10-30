import * as THREE from 'three';
import type { RayHit } from '../game/raycast';

/** Outline of the targeted cell. */
export class Highlight {
  private readonly lines: THREE.LineSegments;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.lines.visible = false;
    scene.add(this.lines);
  }

  set(hit: RayHit | null): void {
    this.lines.visible = hit !== null;
    if (hit) this.lines.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }
}
