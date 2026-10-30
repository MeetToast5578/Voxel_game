import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';

const MAX_QUADS = CHUNK_VOLUME * 6;

/** Index pattern (0, 1, 2, 0, 2, 3) for every quad, shared by all chunk meshes and uploaded once. */
function quadIndex(): THREE.BufferAttribute {
  const idx = new Uint32Array(MAX_QUADS * 6);
  for (let q = 0; q < MAX_QUADS; q++) {
    const v = q * 4, i = q * 6;
    idx[i] = v;
    idx[i + 1] = v + 1;
    idx[i + 2] = v + 2;
    idx[i + 3] = v;
    idx[i + 4] = v + 2;
    idx[i + 5] = v + 3;
  }
  return new THREE.BufferAttribute(idx, 1);
}

const RADIUS = Math.sqrt(3) * CHUNK_SIZE / 2;

/** The meshes of every chunk, one per non-empty pass. Vertex data is released from the JS heap once uploaded. */
export class ChunkMeshes {
  private readonly meshes = new Map<number, THREE.Mesh[]>();
  private readonly index = quadIndex();
  quads = 0;

  constructor(private readonly scene: THREE.Scene, private readonly materials: THREE.Material[]) {}

  get count(): number {
    return this.meshes.size;
  }

  has(key: number): boolean {
    return this.meshes.has(key);
  }

  set(key: number, cx: number, cy: number, cz: number, layers: Uint32Array[]): void {
    this.remove(key);
    const list: THREE.Mesh[] = [];
    layers.forEach((words, pass) => {
      if (words.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      const data = new THREE.Uint32BufferAttribute(words, 2);
      data.onUpload(() => {
        (data as { array: unknown }).array = null;
      });
      geometry.setAttribute('data', data);
      geometry.setIndex(this.index);
      const quads = words.length / 8;
      geometry.setDrawRange(0, quads * 6);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2), RADIUS);
      const mesh = new THREE.Mesh(geometry, this.materials[pass]!);
      mesh.position.set(cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = pass;
      mesh.userData.quads = quads;
      this.quads += quads;
      this.scene.add(mesh);
      list.push(mesh);
    });
    this.meshes.set(key, list);
  }

  remove(key: number): void {
    const list = this.meshes.get(key);
    if (!list) return;
    for (const mesh of list) {
      this.scene.remove(mesh);
      this.quads -= mesh.userData.quads as number;
      // Detach the shared index first: disposing a geometry frees its index buffer on the GPU.
      mesh.geometry.setIndex(null);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  keys(): IterableIterator<number> {
    return this.meshes.keys();
  }
}

