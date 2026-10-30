import * as THREE from 'three';
import { CHUNK_SIZE } from '../config';

/** Quads per pool: 4 MB of vertices and 3 MB of indices. A chunk pass holds at most 24,576. */
export const POOL_QUADS = 1 << 17;
const POOL_CHUNKS = 4096;

/** Index pattern (0, 1, 2, 0, 2, 3) for every quad of a pool, shared by all pools and freed from the heap once uploaded. */
function quadIndex(): THREE.BufferAttribute {
  const idx = new Uint32Array(POOL_QUADS * 6);
  for (let q = 0; q < POOL_QUADS; q++) {
    const v = q * 4, i = q * 6;
    idx[i] = v;
    idx[i + 1] = v + 1;
    idx[i + 2] = v + 2;
    idx[i + 3] = v;
    idx[i + 4] = v + 2;
    idx[i + 5] = v + 3;
  }
  const index = new THREE.BufferAttribute(idx, 1);
  // BatchedMesh still reads the element size from the array, so keep an empty one of the same type.
  index.onUpload(() => {
    (index as { array: unknown }).array = new Uint32Array(0);
  });
  return index;
}

const SPHERE = new THREE.Sphere(new THREE.Vector3(CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2), Math.sqrt(3) * CHUNK_SIZE / 2);
const BOX = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE));
const matrix = new THREE.Matrix4();

/** What BatchedMesh keeps per geometry (three 0.186). */
interface GeometryInfo {
  vertexStart: number; vertexCount: number; reservedVertexCount: number;
  indexStart: number; indexCount: number; reservedIndexCount: number;
  start: number; count: number;
  boundingBox: THREE.Box3 | null; boundingSphere: THREE.Sphere | null; active: boolean;
}

interface BatchedInternals {
  _geometryInfo: GeometryInfo[];
  _availableGeometryIds: number[];
  _geometryCount: number;
  _geometryInitialized: boolean;
}

/**
 * Many chunks of one render pass in one multi-draw: BatchedMesh draws, culls and sorts them, but space is handed out
 * here, first fit with freed ranges merged, because BatchedMesh itself only appends and compacts by copying
 * everything. Each chunk is one geometry and one instance whose matrix holds the chunk's origin. Quad q always sits at
 * vertices 4q..4q+3, so the index buffer is the same fixed pattern for every pool.
 *
 * shortcut: reaches into BatchedMesh's private geometry table (three is pinned at 0.186.0); the test in
 * next/tests/chunkMeshes.test.ts fails if a three upgrade changes it.
 */
export class Pool extends THREE.BatchedMesh {
  /** Free quad ranges as [start, length], sorted by start. */
  readonly free: [number, number][] = [[0, POOL_QUADS]];
  private readonly data: THREE.BufferAttribute;

  constructor(material: THREE.Material, index: THREE.BufferAttribute) {
    super(POOL_CHUNKS, POOL_QUADS * 4, POOL_QUADS * 6, material);
    this.data = new THREE.BufferAttribute(new Uint32Array(POOL_QUADS * 8), 2);
    this.geometry.setAttribute('data', this.data);
    this.geometry.setIndex(index);
    (this as unknown as BatchedInternals)._geometryInitialized = true;
    this.frustumCulled = false;
  }

  /** Adds a chunk pass at a chunk origin in cells; -1 when there is no room. Returns the instance id. */
  place(words: Uint32Array, x: number, y: number, z: number): number {
    const quads = words.length / 8;
    if (this.instanceCount >= POOL_CHUNKS) return -1;
    const start = this.alloc(quads);
    if (start < 0) return -1;
    this.data.array.set(words, start * 8);
    this.data.addUpdateRange(start * 8, quads * 8);
    this.data.needsUpdate = true;
    const self = this as unknown as BatchedInternals;
    const info: GeometryInfo = {
      vertexStart: start * 4, vertexCount: quads * 4, reservedVertexCount: quads * 4,
      indexStart: start * 6, indexCount: quads * 6, reservedIndexCount: quads * 6,
      start: start * 6, count: quads * 6, boundingBox: BOX, boundingSphere: SPHERE, active: true,
    };
    let geometryId: number;
    if (self._availableGeometryIds.length > 0) {
      geometryId = self._availableGeometryIds.pop()!;
      self._geometryInfo[geometryId] = info;
    } else {
      geometryId = self._geometryCount++;
      self._geometryInfo.push(info);
    }
    const instance = this.addInstance(geometryId);
    this.setMatrixAt(instance, matrix.makeTranslation(x, y, z));
    return instance;
  }

  /** Removes a chunk pass added with `place`. */
  unplace(instance: number): void {
    const self = this as unknown as BatchedInternals;
    const geometryId = this.getGeometryIdAt(instance);
    const info = self._geometryInfo[geometryId]!;
    this.release(info.vertexStart / 4, info.vertexCount / 4);
    this.deleteGeometry(geometryId);
  }

  private alloc(quads: number): number {
    const free = this.free;
    for (let i = 0; i < free.length; i++) {
      const range = free[i]!;
      if (range[1] < quads) continue;
      const start = range[0];
      if (range[1] === quads) free.splice(i, 1);
      else {
        range[0] += quads;
        range[1] -= quads;
      }
      return start;
    }
    return -1;
  }

  private release(start: number, quads: number): void {
    const free = this.free;
    let i = 0;
    while (i < free.length && free[i]![0] < start) i++;
    free.splice(i, 0, [start, quads]);
    // Merge with the next range, then with the previous one.
    if (i + 1 < free.length && start + quads === free[i + 1]![0]) {
      free[i]![1] += free[i + 1]![1];
      free.splice(i + 1, 1);
    }
    if (i > 0 && free[i - 1]![0] + free[i - 1]![1] === start) {
      free[i - 1]![1] += free[i]![1];
      free.splice(i, 1);
    }
  }
}

interface Placed {
  pool: Pool;
  instance: number;
  quads: number;
}

/** The meshes of every chunk: each non-empty pass of a chunk is one draw inside its pass's pools. */
export class ChunkMeshes {
  private readonly placed = new Map<number, Placed[]>();
  private readonly pools: Pool[][];
  private readonly index = quadIndex();
  quads = 0;

  constructor(private readonly scene: THREE.Scene, private readonly materials: THREE.Material[]) {
    this.pools = materials.map(() => []);
  }

  get count(): number {
    return this.placed.size;
  }

  /** Draw calls the terrain needs at most: one per pool. */
  get poolCount(): number {
    return this.pools.reduce((n, list) => n + list.length, 0);
  }

  has(key: number): boolean {
    return this.placed.has(key);
  }

  set(key: number, cx: number, cy: number, cz: number, layers: Uint32Array[]): void {
    this.remove(key);
    const list: Placed[] = [];
    layers.forEach((words, pass) => {
      if (words.length === 0) return;
      const pools = this.pools[pass]!;
      const x = cx * CHUNK_SIZE, y = cy * CHUNK_SIZE, z = cz * CHUNK_SIZE;
      let instance = -1, pool: Pool | undefined;
      for (pool of pools) {
        instance = pool.place(words, x, y, z);
        if (instance >= 0) break;
      }
      if (instance < 0) {
        pool = new Pool(this.materials[pass]!, this.index);
        pool.renderOrder = pass;
        pools.push(pool);
        this.scene.add(pool);
        instance = pool.place(words, x, y, z);
      }
      const quads = words.length / 8;
      this.quads += quads;
      list.push({ pool: pool!, instance, quads });
    });
    this.placed.set(key, list);
  }

  remove(key: number): void {
    const list = this.placed.get(key);
    if (!list) return;
    for (const p of list) {
      p.pool.unplace(p.instance);
      this.quads -= p.quads;
    }
    this.placed.delete(key);
  }

  /** Shows only the chunks in `visible` (cave culling); the rest stay loaded but are not drawn. */
  applyVisibility(visible: Set<number>): void {
    for (const [key, list] of this.placed) {
      const show = visible.has(key);
      for (const p of list) p.pool.setVisibleAt(p.instance, show);
    }
  }

  keys(): IterableIterator<number> {
    return this.placed.keys();
  }
}
