import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, NEAR_HEIGHT_CHUNKS, NEAR_RADIUS_CHUNKS } from '../config';
import { chunkKey, columnKey, localIndex } from '../core/coords';
import { SEA_CELL } from '../worldgen/generator';
import type { WorkerPool } from '../workers/pool';
import { AIR, BLOCKS } from './blocks';
import { Chunk } from './chunk';
import { PAD_VOLUME, padIndex } from './mesher';
import type { World } from './world';

/** Where finished meshes go. */
export interface MeshSink {
  set(key: number, cx: number, cy: number, cz: number, layers: Uint32Array[]): void;
  remove(key: number): void;
}

interface ColumnInfo {
  cx: number;
  cz: number;
  top: Int32Array;
  climate: Uint8Array;
  minTop: number;
  maxTop: number;
}

interface Planned {
  cx: number;
  cz: number;
  /** Squared horizontal distance to the player's column, in chunks. */
  d2: number;
}

/** Fully lit sky everywhere until stored light exists (phase 3). */
const FULL_SKY = 0xf0;
const REBUILD_MS = 100;

/**
 * Decides which chunks to generate and mesh around the player, dispatches the work to the pool and applies results.
 * Per column: the surface band (from the column's generated heights), the sea surface, and a short cylinder around
 * the player are meshed; every meshed chunk's 26 neighbours are generated. Results are never thrown away: a chunk
 * that changed while its mesh was being built is simply meshed again.
 */
export class Streamer {
  viewChunks: number;
  private center: [number, number, number] | null = null;
  private columns: Planned[] = [];
  private readonly infos = new Map<number, ColumnInfo>();
  private readonly columnJobs = new Set<number>();
  private readonly genJobs = new Set<number>();
  private readonly meshJobs = new Set<number>();
  /** Chunks whose mesh is missing or out of date. */
  private readonly dirty = new Set<number>();
  /** Chunks with a current or in-progress mesh (empty meshes included). */
  private readonly meshed = new Set<number>();
  /** Chunks that should have a mesh, and chunks that should be loaded, by key. */
  private meshSet = new Set<number>();
  private genSet = new Set<number>();
  private genQueue: number[] = [];
  private meshQueue: number[] = [];
  private genCursor = 0;
  private meshCursor = 0;
  private stale = true;
  private lastRebuild = -Infinity;
  private readonly coords = new Map<number, [number, number, number]>();
  private readonly scratchStates = new Uint16Array(CHUNK_VOLUME);
  private readonly scratchLight = new Uint8Array(CHUNK_VOLUME);
  failures = 0;

  constructor(private readonly world: World, private readonly pool: WorkerPool, private readonly meshes: MeshSink, viewChunks: number) {
    this.viewChunks = viewChunks;
  }

  get pendingColumns(): number {
    return this.columnJobs.size;
  }

  get pendingChunks(): number {
    return this.genJobs.size + this.meshJobs.size;
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  /** Marks a chunk and its neighbours for remeshing (for example after an edit). */
  markDirty(cx: number, cy: number, cz: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = chunkKey(cx + dx, cy + dy, cz + dz);
          if (this.world.chunks.has(key)) this.dirty.add(key);
        }
      }
    }
    this.stale = true;
  }

  /** Re-plans columns, for example after the view distance changed. */
  replan(): void {
    this.center = null;
  }

  update(px: number, py: number, pz: number, now = performance.now()): void {
    const c: [number, number, number] = [Math.floor(px / CHUNK_SIZE), Math.floor(py / CHUNK_SIZE), Math.floor(pz / CHUNK_SIZE)];
    if (!this.center || c[0] !== this.center[0] || c[1] !== this.center[1] || c[2] !== this.center[2]) {
      this.center = c;
      this.planColumns();
      this.stale = true;
    }
    this.requestColumns();
    if (this.stale && now - this.lastRebuild >= REBUILD_MS) {
      this.rebuild();
      this.lastRebuild = now;
    }
    this.dispatchGeneration();
    this.dispatchMeshes();
  }

  /** Columns within view (plus one ring for neighbours), nearest first; drops columns well outside it. */
  private planColumns(): void {
    const [pcx, , pcz] = this.center!;
    const r = this.viewChunks + 1;
    const list: Planned[] = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= r * r) list.push({ cx: pcx + dx, cz: pcz + dz, d2 });
      }
    }
    list.sort((a, b) => a.d2 - b.d2);
    this.columns = list;
    const keep = (r + 2) * (r + 2);
    for (const [key, info] of this.infos) {
      if ((info.cx - pcx) ** 2 + (info.cz - pcz) ** 2 > keep) this.infos.delete(key);
    }
  }

  private requestColumns(): void {
    for (const col of this.columns) {
      const key = columnKey(col.cx, col.cz);
      if (this.infos.has(key) || this.columnJobs.has(key)) continue;
      const w = this.pool.workerFor(col.cx, col.cz);
      if (!this.pool.hasRoom(w)) continue;
      this.columnJobs.add(key);
      this.pool.run(w, { type: 'column', cx: col.cx, cz: col.cz }).then((r) => {
        this.columnJobs.delete(key);
        this.infos.set(key, { cx: col.cx, cz: col.cz, top: r.top, climate: r.climate, minTop: r.minTop, maxTop: r.maxTop });
        this.stale = true;
      }, () => {
        this.columnJobs.delete(key);
        this.failures++;
      });
    }
  }

  /** The chunk heights to mesh in a column, or null until its heights are known. */
  private meshRange(col: Planned, info: ColumnInfo): number[] {
    const ys = new Set<number>();
    const lo = Math.floor((info.minTop - 1) / CHUNK_SIZE), hi = Math.floor((info.maxTop + 1) / CHUNK_SIZE);
    for (let y = lo; y <= hi; y++) ys.add(y);
    if (info.minTop < SEA_CELL) ys.add(Math.floor((SEA_CELL - 1) / CHUNK_SIZE));
    if (col.d2 <= NEAR_RADIUS_CHUNKS * NEAR_RADIUS_CHUNKS) {
      const pcy = this.center![1];
      for (let y = pcy - NEAR_HEIGHT_CHUNKS; y <= pcy + NEAR_HEIGHT_CHUNKS; y++) ys.add(y);
    }
    return [...ys];
  }

  /** Recomputes which chunks to generate and mesh, unloads the rest, and sorts both queues nearest first. */
  private rebuild(): void {
    this.stale = false;
    const [pcx, pcy, pcz] = this.center!;
    const view2 = this.viewChunks * this.viewChunks;
    const meshSet = new Set<number>(), genSet = new Set<number>();
    for (const col of this.columns) {
      if (col.d2 > view2) break;
      const info = this.infos.get(columnKey(col.cx, col.cz));
      if (!info) continue;
      for (const cy of this.meshRange(col, info)) {
        const key = chunkKey(col.cx, cy, col.cz);
        meshSet.add(key);
        this.coords.set(key, [col.cx, cy, col.cz]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nk = chunkKey(col.cx + dx, cy + dy, col.cz + dz);
              genSet.add(nk);
              if (!this.coords.has(nk)) this.coords.set(nk, [col.cx + dx, cy + dy, col.cz + dz]);
            }
          }
        }
      }
    }
    this.meshSet = meshSet;
    this.genSet = genSet;
    // Unload chunks and meshes that are no longer wanted.
    for (const key of [...this.world.chunks.keys()]) {
      if (genSet.has(key)) continue;
      const ch = this.world.chunks.get(key)!;
      this.world.remove(ch.cx, ch.cy, ch.cz);
      this.meshes.remove(key);
      this.meshed.delete(key);
      this.dirty.delete(key);
    }
    for (const key of this.meshed) {
      if (meshSet.has(key)) continue;
      this.meshes.remove(key);
      this.meshed.delete(key);
    }
    for (const key of this.dirty) if (!meshSet.has(key)) this.dirty.delete(key);
    for (const key of meshSet) if (!this.meshed.has(key) && this.world.chunks.has(key)) this.dirty.add(key);
    for (const key of [...this.coords.keys()]) if (!genSet.has(key)) this.coords.delete(key);
    const dist = (key: number) => {
      const [x, y, z] = this.coords.get(key)!;
      return (x - pcx) ** 2 + ((y - pcy) * 2) ** 2 + (z - pcz) ** 2;
    };
    this.genQueue = [...genSet].filter((k) => !this.world.chunks.has(k)).sort((a, b) => dist(a) - dist(b));
    this.meshQueue = [...this.dirty].filter((k) => meshSet.has(k)).sort((a, b) => dist(a) - dist(b));
    this.genCursor = 0;
    this.meshCursor = 0;
  }

  private dispatchGeneration(): void {
    while (this.genCursor < this.genQueue.length) {
      const key = this.genQueue[this.genCursor]!;
      if (this.world.chunks.has(key) || this.genJobs.has(key) || !this.genSet.has(key)) {
        this.genCursor++;
        continue;
      }
      const [cx, cy, cz] = this.coords.get(key)!;
      const info = this.infos.get(columnKey(cx, cz));
      // Open sky above the terrain needs no worker.
      if (info && cy * CHUNK_SIZE > info.maxTop && cy * CHUNK_SIZE >= SEA_CELL) {
        this.addChunk(new Chunk(cx, cy, cz, AIR, 15), info);
        this.genCursor++;
        continue;
      }
      const w = this.pool.workerFor(cx, cz);
      if (!this.pool.hasRoom(w)) return;
      this.genCursor++;
      this.genJobs.add(key);
      this.pool.run(w, { type: 'generate', cx, cy, cz }).then((r) => {
        this.genJobs.delete(key);
        if (!this.genSet.has(key) || this.world.chunks.has(key)) return;
        const chunk = new Chunk(cx, cy, cz, r.uniform >= 0 ? r.uniform : AIR, 15);
        if (r.states) chunk.load(r.states);
        chunk.version = 0;
        this.addChunk(chunk, this.infos.get(columnKey(cx, cz)));
      }, () => {
        this.genJobs.delete(key);
        this.failures++;
        this.stale = true;
      });
    }
  }

  private addChunk(chunk: Chunk, info: ColumnInfo | undefined): void {
    const column = this.world.add(chunk);
    if (info) column.surface.set(info.top);
    this.markDirty(chunk.cx, chunk.cy, chunk.cz);
  }

  private dispatchMeshes(): void {
    while (this.meshCursor < this.meshQueue.length) {
      const key = this.meshQueue[this.meshCursor]!;
      const coords = this.coords.get(key);
      if (!coords || !this.dirty.has(key) || this.meshJobs.has(key) || !this.meshSet.has(key)) {
        this.meshCursor++;
        continue;
      }
      const [cx, cy, cz] = coords;
      const chunk = this.world.chunks.get(key);
      if (!chunk || !this.neighboursLoaded(cx, cy, cz)) {
        this.meshCursor++;
        continue;
      }
      if (chunk.uniform && BLOCKS.types[BLOCKS.typeIndex[chunk.get(0)]!]!.layer === 'none') {
        // Air has no faces of its own.
        this.dirty.delete(key);
        this.meshes.remove(key);
        this.meshed.add(key);
        this.meshCursor++;
        continue;
      }
      const w = this.pool.workerFor(cx, cz);
      if (!this.pool.hasRoom(w)) return;
      this.meshCursor++;
      this.dirty.delete(key);
      this.meshed.add(key);
      this.meshJobs.add(key);
      const input = this.meshInput(cx, cy, cz);
      this.pool.run(w, { type: 'mesh', ...input }, [input.states.buffer, input.light.buffer, input.climate.buffer]).then((r) => {
        this.meshJobs.delete(key);
        if (!this.world.chunks.has(key) || !this.meshSet.has(key)) return;
        this.meshes.set(key, cx, cy, cz, r.layers);
        if (this.dirty.has(key)) this.stale = true;
      }, () => {
        this.meshJobs.delete(key);
        this.meshed.delete(key);
        this.dirty.add(key);
        this.failures++;
        this.stale = true;
      });
    }
  }

  private neighboursLoaded(cx: number, cy: number, cz: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) if (!this.world.chunks.has(chunkKey(cx + dx, cy + dy, cz + dz))) return false;
      }
    }
    return true;
  }

  /** The chunk's cells with a one-cell border from its neighbours, plus their light and the column's climate. */
  meshInput(cx: number, cy: number, cz: number): { states: Uint16Array; light: Uint8Array; climate: Uint8Array } {
    const states = new Uint16Array(PAD_VOLUME);
    const light = new Uint8Array(PAD_VOLUME).fill(FULL_SKY);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const chunk = this.world.chunk(cx + dx, cy + dy, cz + dz);
          if (!chunk) continue;
          chunk.copyTo(this.scratchStates);
          chunk.copyLightTo(this.scratchLight);
          // Range of padded coordinates this neighbour covers, and the matching local coordinate offset.
          const xs = dx < 0 ? [-1, -1] : dx > 0 ? [CHUNK_SIZE, CHUNK_SIZE] : [0, CHUNK_SIZE - 1];
          const ys = dy < 0 ? [-1, -1] : dy > 0 ? [CHUNK_SIZE, CHUNK_SIZE] : [0, CHUNK_SIZE - 1];
          const zs = dz < 0 ? [-1, -1] : dz > 0 ? [CHUNK_SIZE, CHUNK_SIZE] : [0, CHUNK_SIZE - 1];
          for (let y = ys[0]!; y <= ys[1]!; y++) {
            for (let z = zs[0]!; z <= zs[1]!; z++) {
              let p = padIndex(xs[0]!, y, z);
              let i = localIndex(xs[0]! - dx * CHUNK_SIZE, y - dy * CHUNK_SIZE, z - dz * CHUNK_SIZE);
              for (let x = xs[0]!; x <= xs[1]!; x++, p++, i++) {
                states[p] = this.scratchStates[i]!;
                light[p] = this.scratchLight[i]!;
              }
            }
          }
        }
      }
    }
    const climate = new Uint8Array(CHUNK_AREA);
    const info = this.infos.get(columnKey(cx, cz));
    if (info) climate.set(info.climate);
    return { states, light, climate };
  }
}

