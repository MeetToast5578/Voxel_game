import * as THREE from 'three';
import { ITEM_SIZE } from '../config';
import type { ItemEntity } from '../items/itemEntities';
import { blockGeometry } from './blockGeometry';

/** Draws the dropped items as small spinning, bobbing blocks (spec 24). */
export class ItemMeshes {
  private readonly meshes = new Map<number, THREE.Mesh>();

  constructor(private readonly scene: THREE.Scene, private readonly material: THREE.Material) {}

  /** Makes the scene match the items: new items get a mesh, and removed items lose theirs. time is in seconds. */
  sync(items: readonly ItemEntity[], time: number): void {
    const alive = new Set<number>();
    for (const item of items) {
      alive.add(item.id);
      let mesh = this.meshes.get(item.id);
      if (!mesh) {
        mesh = new THREE.Mesh(blockGeometry(item.state, ITEM_SIZE), this.material);
        this.scene.add(mesh);
        this.meshes.set(item.id, mesh);
      }
      mesh.position.set(item.x, item.y + ITEM_SIZE / 2 + Math.sin(time * 3 + item.id) * 0.03, item.z);
      mesh.rotation.y = time * 1.5 + item.id;
    }
    for (const [id, mesh] of this.meshes) {
      if (alive.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }
  }
}
