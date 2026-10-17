import * as THREE from 'three';
import type { LooseBody } from '../items/looseBodies';
import { blockGeometry } from './blockGeometry';

/** Draws the loose bodies as full blocks that tumble as they fall (spec 25, slice 6). */
export class BodyMeshes {
  private readonly meshes = new Map<number, THREE.Mesh>();

  constructor(private readonly scene: THREE.Scene, private readonly material: THREE.Material) {}

  /** Makes the scene match the bodies: new bodies get a mesh, and settled ones lose theirs. */
  sync(bodies: readonly LooseBody[]): void {
    const alive = new Set<number>();
    for (const body of bodies) {
      alive.add(body.id);
      let mesh = this.meshes.get(body.id);
      if (!mesh) {
        mesh = new THREE.Mesh(blockGeometry(body.state, 1), this.material);
        this.scene.add(mesh);
        this.meshes.set(body.id, mesh);
      }
      mesh.position.set(body.x, body.y + 0.5, body.z);
      mesh.rotation.set(body.angleX, body.angleY, body.angleZ);
    }
    for (const [id, mesh] of this.meshes) {
      if (alive.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }
  }
}
