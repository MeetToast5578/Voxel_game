import * as THREE from 'three';
import { CHUNK_SIZE } from '../config';
import { chunkKey } from '../core/coords';
import type { MeshSink } from '../world/chunkManager';
import type { ChunkMeshData, MeshData } from './mesher';

interface ChunkMeshPair {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

/** Owns the three.js meshes of all chunks. Implements MeshSink for the ChunkManager. */
export class ChunkMeshes implements MeshSink {
  private readonly meshes = new Map<string, ChunkMeshPair>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly solidMaterial: THREE.Material,
    private readonly waterMaterial: THREE.Material,
  ) {}

  get count(): number {
    return this.meshes.size;
  }

  set(cx: number, cz: number, data: ChunkMeshData): void {
    this.remove(cx, cz);
    const solid = this.createMesh(data.solid, this.solidMaterial, cx, cz);
    const water = this.createMesh(data.translucent, this.waterMaterial, cx, cz);
    if (water) water.renderOrder = 1; // draw water after all solid geometry
    this.meshes.set(chunkKey(cx, cz), { solid, water });
  }

  remove(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const pair = this.meshes.get(key);
    if (!pair) return;
    for (const mesh of [pair.solid, pair.water]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose(); // materials are shared: never dispose them here
    }
    this.meshes.delete(key);
  }

  private createMesh(data: MeshData, material: THREE.Material, cx: number, cz: number): THREE.Mesh | null {
    if (data.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setAttribute('aLight', new THREE.BufferAttribute(data.light, 2));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    return mesh;
  }
}
