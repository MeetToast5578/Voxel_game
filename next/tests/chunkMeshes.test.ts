import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkMeshes, POOL_QUADS, type Pool } from '../render/chunkMeshes';

function quads(n: number, fill = 7): Uint32Array {
  return new Uint32Array(n * 8).fill(fill);
}

/** What BatchedMesh would draw this frame: [byte start, index count, instance] per draw. */
function draws(pool: Pool, camera: THREE.Camera): [number, number, number][] {
  pool.onBeforeRender(null as unknown as THREE.WebGLRenderer, new THREE.Scene(), camera, pool.geometry, pool.material as THREE.Material, null as unknown as THREE.Group);
  const p = pool as unknown as { _multiDrawStarts: Int32Array; _multiDrawCounts: Int32Array; _multiDrawCount: number; _indirectTexture: THREE.DataTexture };
  const ids = p._indirectTexture.image.data as Uint32Array;
  return Array.from({ length: p._multiDrawCount }, (_, i) => [p._multiDrawStarts[i]!, p._multiDrawCounts[i]!, ids[i]!]);
}

function setup() {
  const scene = new THREE.Scene();
  const meshes = new ChunkMeshes(scene, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
  camera.position.set(0, 200, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { scene, meshes, camera, pools: () => scene.children as Pool[] };
}

describe('ChunkMeshes', () => {
  it('draws every chunk pass from its own range of one pool, at its origin', () => {
    const { meshes, camera, pools } = setup();
    meshes.set(1, 0, 0, 0, [quads(10), quads(3)]);
    meshes.set(2, 1, 0, 0, [quads(5), new Uint32Array(0)]);
    expect(pools().length).toBe(2);
    expect(meshes.quads).toBe(18);
    const opaque = pools()[0]!;
    // Byte offsets into the Uint32 index: quad q starts at index 6q.
    expect(draws(opaque, camera).sort((a, b) => a[0] - b[0]).map((d) => d.slice(0, 2))).toEqual([[0, 60], [10 * 6 * 4, 30]]);
    const m = new THREE.Matrix4();
    opaque.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBe(16);
    const data = opaque.geometry.getAttribute('data').array as Uint32Array;
    expect(data[10 * 8]).toBe(7);
    expect(data[15 * 8]).toBe(0);
  });

  it('reuses and merges freed space, and hides culled chunks', () => {
    const { meshes, camera, pools } = setup();
    for (let k = 0; k < 4; k++) meshes.set(k, k, 0, 0, [quads(100)]);
    meshes.remove(1);
    meshes.remove(2);
    const pool = pools()[0]!;
    expect(pool.free).toEqual([[100, 200], [400, POOL_QUADS - 400]]);
    meshes.set(9, 5, 0, 0, [quads(150)]);
    expect(pool.free[0]).toEqual([250, 50]);
    meshes.applyVisibility(new Set([0, 9]));
    expect(draws(pool, camera).length).toBe(2);
    meshes.remove(0);
    meshes.remove(3);
    meshes.remove(9);
    expect(pool.free).toEqual([[0, POOL_QUADS]]);
    expect(meshes.quads).toBe(0);
  });

  it('opens another pool when one is full', () => {
    const { meshes, pools } = setup();
    const big = quads(24576);
    const fit = Math.floor(POOL_QUADS / 24576);
    for (let k = 0; k <= fit; k++) meshes.set(k, k, 0, 0, [big]);
    expect(pools().length).toBe(2);
    expect(meshes.poolCount).toBe(2);
  });
});
