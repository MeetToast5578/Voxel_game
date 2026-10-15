import * as THREE from 'three';
import { ITEM_HEIGHT } from '../config';
import { getBlockDef } from '../world/blocks';
import type { DroppedItem } from '../items/droppedItems';
import { tileUV } from './tiles';

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z. */
const FACE_KIND = ['side', 'side', 'top', 'bottom', 'side', 'side'] as const;

/**
 * A cube of the block's atlas tiles, lit by the same material as the chunks (which needs an aLight attribute).
 * Items are fully sky-lit; the daylight uniform still dims them at night.
 */
function createItemGeometry(blockId: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(ITEM_HEIGHT, ITEM_HEIGHT, ITEM_HEIGHT);
  const tiles = getBlockDef(blockId).tiles;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let face = 0; face < 6; face++) {
    const t = tileUV(tiles[FACE_KIND[face]!]);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, t.u0 + uv.getX(i) * (t.u1 - t.u0), t.v0 + uv.getY(i) * (t.v1 - t.v0));
    }
  }
  uv.needsUpdate = true;
  const n = geometry.attributes.position!.count;
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const light = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) light[i * 2] = 1; // sky light 1, block light 0
  geometry.setAttribute('aLight', new THREE.BufferAttribute(light, 2));
  return geometry;
}

/** Draws the dropped items: one mesh per item, geometry shared per block state. */
export class ItemMeshes {
  private readonly meshes = new Map<DroppedItem, THREE.Mesh>();
  private readonly geometries = new Map<number, THREE.BufferGeometry>();

  constructor(private readonly scene: THREE.Scene, private readonly material: THREE.Material) {}

  /** Makes the meshes match the items: new items get a mesh, removed items lose theirs, the rest follow their pose. */
  sync(items: readonly DroppedItem[]): void {
    const live = new Set(items);
    for (const [item, mesh] of this.meshes) {
      if (live.has(item)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(item);
    }
    for (const item of items) {
      let mesh = this.meshes.get(item);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometryFor(item.blockId), this.material);
        this.scene.add(mesh);
        this.meshes.set(item, mesh);
      }
      // The item's position is its bottom centre; the box is centred on its origin.
      mesh.position.set(item.pos.x, item.pos.y + ITEM_HEIGHT / 2, item.pos.z);
      mesh.rotation.y = THREE.MathUtils.degToRad(item.spin);
    }
  }

  private geometryFor(blockId: number): THREE.BufferGeometry {
    let geometry = this.geometries.get(blockId);
    if (!geometry) {
      geometry = createItemGeometry(blockId);
      this.geometries.set(blockId, geometry);
    }
    return geometry;
  }
}
