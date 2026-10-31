import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, NEAR_HEIGHT_CHUNKS, NEAR_RADIUS_CHUNKS } from '../config';
import { chunkKey, columnKey, forEachChunkReading, localIndex } from '../core/coords';
import { SEA_CELL } from '../worldgen/generator';
import type { WorkerPool } from '../workers/pool';
import { AIR, BLOCKS } from './blocks';
import { Chunk } from './chunk';
import type { LightEngine } from './light';
import { PAD_VOLUME, padIndex } from './mesher';
import type { World } from './world';

/** Where finished meshes go. */
export interface MeshSink {
  set(key: number, cx: number, cy: number, cz: number, layers: Uint32Array[]): void;
  remove(key: number): void;
  has(key: number): boolean;
}

/** Chunks kept in a save: loaded from there instead of generated, and handed back before they unload. */
export interface SavedChunks {
  has(key: number): boolean;
  load(cx: number, cy: number, cz: number, key: number): Promise<Chunk | null>;
  skyTop(cx: number, cz: number): Int32Array | undefined;
  unload(chunk: Chunk, world: World): void;
}

interface ColumnInfo {
  cx: number;
  cz: number;
  top: Int32Array;
  skyTop: Int32Array;
  climate: Uint8Array;
  biome: Uint8Array;
  water: Int32Array;
  minTop: number;
  caveFloor: number;
  maxTop: number;
}

interface Planned {
  cx: number;
  cz: number;
  /** Squared horizontal distance to the player's column, in chunks. */
  d2: number;
}

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
  /** Chunks to remesh before anything else, because the player just changed them. */
  private readonly urgent = new Set<number>();
  /** Face-pair connectivity of meshed chunks, for cave culling. */
  readonly visibility = new Map<number, number>();
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
  saves: SavedChunks | null = null;
  /** Called after a chunk joins the world, and before one leaves it. */
  onLoad: ((chunk: Chunk) => void) | null = null;
  onUnload: ((chunk: Chunk) => void) | null = null;
  /** Mesh results applied so far (for tests measuring edit latency). */
  meshesApplied = 0;

  constructor(private readonly world: World, private readonly pool: WorkerPool, private readonly meshes: MeshSink,
    private readonly light: LightEngine, viewChunks: number) {
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

  /**
   * Everything around the current position is loaded and has been meshed at least once. Remeshing after block updates
   * (grass spreading, leaves decaying) never stops in a live world, so it does not count.
   */
  get idle(): boolean {
    if (this.center === null || this.stale || this.columnJobs.size > 0 || this.genJobs.size > 0) return false;
    if (!this.columns.every((c) => this.infos.has(columnKey(c.cx, c.cz)))) return false;
    for (const key of this.meshSet) if (!this.meshed.has(key) || (this.meshJobs.has(key) && !this.meshes.has(key))) return false;
    return true;
  }

  /** Whether a chunk's mesh is out of date or being rebuilt. */
  isPending(key: number): boolean {
    return this.dirty.has(key) || this.meshJobs.has(key);
  }

  /** Marks single chunks for remeshing, such as those whose light changed; `urgent` ones go first. */
  markChunks(keys: Iterable<number>, urgent = false): void {
    for (const key of keys) {
      if (!this.world.chunks.has(key)) continue;
      this.dirty.add(key);
      if (urgent) this.urgent.add(key);
      this.stale = true;
    }
  }

  /** After a cell changed: remesh, first of all, the chunks whose meshes read it. */
  markCell(x: number, y: number, z: number): void {
    forEachChunkReading(x, y, z, (cx, cy, cz) => this.markChunks([chunkKey(cx, cy, cz)], true));
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
        this.infos.set(key, { cx: col.cx, cz: col.cz, top: r.top, skyTop: r.skyTop, climate: r.climate, biome: r.biome, water: r.water, minTop: r.minTop, caveFloor: r.caveFloor, maxTop: r.maxTop });
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
    // Caves opening the surface here or next door are seen into, down to their floor.
    let floor = info.minTop;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      floor = Math.min(floor, this.infos.get(columnKey(info.cx + dx, info.cz + dz))?.caveFloor ?? Infinity);
    }
    const lo = Math.floor((floor - 1) / CHUNK_SIZE), hi = Math.floor((info.maxTop + 1) / CHUNK_SIZE);
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
      this.onUnload?.(ch);
      this.saves?.unload(ch, this.world);
      this.world.remove(ch.cx, ch.cy, ch.cz);
      this.visibility.delete(key);
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
    // Chunks with no mesh at all go before remeshes, so block updates near the player cannot starve the view.
    const order = (k: number) => dist(k) + (this.meshes.has(k) ? 1e9 : 0);
    this.meshQueue = [...this.dirty].filter((k) => meshSet.has(k)).sort((a, b) => order(a) - order(b));
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
      // Open sky above the terrain needs no worker (unless something was built there).
      if (info && cy * CHUNK_SIZE > info.maxTop && cy * CHUNK_SIZE >= SEA_CELL && !this.saves?.has(key)) {
        this.addChunk(new Chunk(cx, cy, cz, AIR, 15), info);
        this.genCursor++;
        continue;
      }
      if (this.saves?.has(key)) {
        this.genCursor++;
        this.loadSaved(key, cx, cy, cz);
        continue;
      }
      const w = this.pool.workerFor(cx, cz);
      if (!this.pool.hasRoom(w)) return;
      this.genCursor++;
      this.generate(key, cx, cy, cz, w);
    }
  }

  private loadSaved(key: number, cx: number, cy: number, cz: number): void {
    this.genJobs.add(key);
    this.saves!.load(cx, cy, cz, key).then((chunk) => {
      this.genJobs.delete(key);
      if (!this.genSet.has(key) || this.world.chunks.has(key)) return;
      if (chunk) this.addChunk(chunk, this.infos.get(columnKey(cx, cz)));
      else this.generate(key, cx, cy, cz, this.pool.workerFor(cx, cz));
    });
  }

  private generate(key: number, cx: number, cy: number, cz: number, w: number): void {
    this.genJobs.add(key);
    this.pool.run(w, { type: 'generate', cx, cy, cz }).then((r) => {
      this.genJobs.delete(key);
      if (!this.genSet.has(key) || this.world.chunks.has(key)) return;
      const chunk = new Chunk(cx, cy, cz, r.uniform >= 0 ? r.uniform : AIR);
      if (r.states) chunk.load(r.states);
      if (r.light) chunk.loadLight(r.light);
      else chunk.loadLight(new Uint8Array(1).fill(r.uniformLight));
      chunk.version = 0;
      this.addChunk(chunk, this.infos.get(columnKey(cx, cz)));
    }, () => {
      this.genJobs.delete(key);
      this.failures++;
      this.stale = true;
    });
  }

  private addChunk(chunk: Chunk, info: ColumnInfo | undefined): void {
    const column = this.world.add(chunk);
    if (column.chunkCount === 1 && info) {
      // A column with changed chunks has its sky tops in the save.
      const skyTop = this.saves?.skyTop(chunk.cx, chunk.cz) ?? info.skyTop;
      column.surface.set(info.top);
      column.maxTop = info.maxTop;
      column.climate.set(info.climate);
      column.biome.set(info.biome);
      column.water.set(info.water);
      column.skyTop.set(skyTop);
      column.generatedSkyTop.set(skyTop);
    }
    this.light.stitch(chunk);
    this.onLoad?.(chunk);
    this.markDirty(chunk.cx, chunk.cy, chunk.cz);
    this.markChunks(this.light.drainChanged());
  }

  private dispatchMeshes(): void {
    for (const key of this.urgent) {
      const coords = this.coords.get(key);
      if (!coords || this.meshJobs.has(key)) continue;
      const w = this.pool.leastBusy();
      if (!this.pool.hasRoom(w, 2)) break;
      this.urgent.delete(key);
      if (this.dirty.has(key) && this.meshSet.has(key)) this.startMesh(key, coords, w);
    }
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
      const w = this.pool.leastBusy();
      if (!this.pool.hasRoom(w)) return;
      this.meshCursor++;
      this.startMesh(key, coords, w);
    }
  }

  private startMesh(key: number, [cx, cy, cz]: [number, number, number], worker: number): void {
    this.dirty.delete(key);
    this.meshed.add(key);
    this.meshJobs.add(key);
    const input = this.meshInput(cx, cy, cz);
    this.pool.run(worker, { type: 'mesh', ...input }, [input.states.buffer, input.light.buffer, input.climate.buffer]).then((r) => {
      this.meshJobs.delete(key);
      if (!this.world.chunks.has(key) || !this.meshSet.has(key)) return;
      this.meshes.set(key, cx, cy, cz, r.layers);
      this.visibility.set(key, r.visibility);
      this.meshesApplied++;
      if (this.dirty.has(key)) this.stale = true;
    }, () => {
      this.meshJobs.delete(key);
      this.meshed.delete(key);
      this.dirty.add(key);
      this.failures++;
      this.stale = true;
    });
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
    const light = new Uint8Array(PAD_VOLUME);
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

