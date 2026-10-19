import { CHUNK_SIZE, MAX_JOBS_IN_FLIGHT, RANDOM_TICK_BUDGET_MS, roundBlocks, SURFACE_BAND, SURFACE_MAX_DISTANCE_M, TICK_BUDGET_MS, VERTICAL_RENDER_DISTANCE } from '../config';
import { chunkKey, columnKey, worldToChunk } from '../core/coords';
import { buildChunkMesh, type ChunkMeshData } from '../render/mesher';
import { Chunk } from './chunk';
import { neighborIndex } from './light';
import { scheduleFallingBlocks } from './falling';
import { scheduleFlowingWater } from './flow';
import type { BatchEffect, World } from './world';

/** Receives finished meshes. Implemented by render/chunkMeshes.ts (and by fakes in tests). */
export interface MeshSink {
  set(cx: number, cy: number, cz: number, data: ChunkMeshData): void;
  remove(cx: number, cy: number, cz: number): void;
}

/** What the manager needs from the terrain generator (TerrainGenerator, or a fake in tests). */
export interface ChunkGenerator {
  generateChunk(chunk: Chunk): void;
  columnTops(cx: number, cz: number): Int32Array;
}

/** Does the three chunk jobs somewhere else (Web Workers). Implemented by workers/workerPool.ts. */
export interface ChunkJobs {
  columnTops(cx: number, cz: number): Promise<Int32Array>;
  generate(cx: number, cy: number, cz: number): Promise<Uint16Array>;
  /** Receives copies of the 27 block arrays and 9 column-top arrays; may keep them. */
  mesh(cx: number, cy: number, cz: number, neighbors: Uint16Array[], tops: Int32Array[]): Promise<ChunkMeshData>;
}

export interface ChunkStats {
  loaded: number;
  meshed: number;
  pendingGen: number;
  pendingMesh: number;
  /** Columns whose tops are installed. */
  columns: number;
  jobsInFlight: number;
  /** Ticks run in the last step and pending ticks across all loaded chunks. */
  tickRan: number;
  tickPending: number;
  /** Random ticks run in the last step, and how long the pass took, for the F3 overlay. */
  randomTickRan: number;
  randomTickMs: number;
}

interface ColumnPos {
  cx: number;
  cz: number;
  key: string;
}

interface ChunkPos {
  cx: number;
  cy: number;
  cz: number;
  key: string;
}

/** One thing to load: a column's tops (column key) or a chunk's blocks (chunk key). */
type LoadItem = { tops: true; cx: number; cz: number; key: string } | ({ tops: false } & ChunkPos);

/** Column tops are loaded within renderDistance + COLUMN_MARGIN: the 9 columns around every meshed chunk, plus 1. */
const COLUMN_MARGIN = 2;
/** Meshes are removed beyond (renderDistance or vertical distance) + MESH_KEEP_MARGIN. */
const MESH_KEEP_MARGIN = 1;
/** Chunk blocks are dropped beyond (renderDistance or vertical distance) + UNLOAD_MARGIN (hysteresis). */
const UNLOAD_MARGIN = 3;
/** A surface band never reaches more than this many chunks below a column's highest top. */
const MAX_BAND_CHUNKS = 16;
/** With jobs, at most this many chunks waiting for a mesh are checked for readiness per dispatch. */
const MESH_SCAN_LIMIT = 512;
/** The vertical spread of column tops used for the camera far plane is capped at this many blocks. */
const MAX_SURFACE_DISTANCE = roundBlocks(SURFACE_MAX_DISTANCE_M);

interface ColumnInfo {
  /** Lowest and highest chunk y of the surface band. */
  bandLo: number;
  bandHi: number;
  /** Lowest and highest top of the column, in blocks. */
  minTop: number;
  maxTop: number;
}

/**
 * Loads, meshes and unloads chunks around the player in 3D.
 * - Column set: columns within renderDistance + 2; a column's tops are loaded before any of its chunks.
 * - Mesh set: the near cylinder (within renderDistance horizontally and VERTICAL_RENDER_DISTANCE vertically) plus
 *   the surface band of every column within renderDistance (from its lowest top - SURFACE_BAND up to its highest).
 * - Generate set: the mesh set grown by 1 chunk in every direction, so every meshed chunk has its 26 neighbours.
 * Each list is ordered nearest first (3D distance from the player's eye to the chunk centre).
 */
export class ChunkManager {
  renderDistance: number;
  readonly verticalDistance = VERTICAL_RENDER_DISTANCE;
  /** Meshed chunks by key. */
  private readonly meshed = new Map<string, ChunkPos>();
  private readonly dirty = new Set<string>();
  private readonly columns = new Map<string, ColumnInfo>();
  /** Column tops and chunks to load, nearest first; a column's tops come before any of its chunks. */
  private loadList: LoadItem[] = [];
  private meshList: ChunkPos[] = [];
  private columnSet = new Set<string>();
  private genSet = new Set<string>();
  private meshSet = new Set<string>();
  private centerKey = '';
  private center = { cx: 0, cy: 0, cz: 0 };
  private eye = { x: 0, y: 0, z: 0 };
  /** Set when column tops change: the surface bands, and so the sets, must be recomputed. */
  private setsStale = false;
  /** One game tick: the scheduled block updates (falling blocks, fluid flow, ...), then the random-tick pass. */
  tick(): void {
    this.lastTickStats = this.world.tickStep(TICK_BUDGET_MS);
    this.lastRandomTickStats = this.world.randomTickStep(RANDOM_TICK_BUDGET_MS);
  }

  /** Result of the last tickStep, for the F3 overlay. */
  private lastTickStats = { ran: 0, pending: 0 };
  /** Result of the last randomTickStep, for the F3 overlay. */
  private lastRandomTickStats = { ran: 0, ms: 0 };
  /**
   * Everything in loadList before loadCursor is loaded, and everything in meshList before meshCursor is meshed
   * and clean, so each frame starts scanning there. Reset whenever the lists change or a chunk becomes dirty.
   */
  private loadCursor = 0;
  private meshCursor = 0;
  // Only used with ChunkJobs:
  private readonly fetchingTops = new Set<string>();
  private readonly generating = new Set<string>();
  private readonly meshing = new Set<string>();
  /** Bumped whenever a chunk's mesh becomes outdated, so late worker results can be recognized and dropped. */
  private readonly versions = new Map<string, number>();
  /** True while a refill of the job slots is scheduled (see jobDone). */
  private refillScheduled = false;

  constructor(
    private readonly world: World,
    private readonly generator: ChunkGenerator,
    private readonly sink: MeshSink,
    renderDistance: number,
    private readonly jobs: ChunkJobs | null = null,
  ) {
    this.renderDistance = renderDistance;
  }

  /** Call once per frame with the player's eye position. Loads, meshes and unloads within the time budgets. */
  update(x: number, y: number, z: number, genBudgetMs: number, meshBudgetMs: number): void {
    const cx = worldToChunk(Math.floor(x));
    const cy = worldToChunk(Math.floor(y));
    const cz = worldToChunk(Math.floor(z));
    const key = `${chunkKey(cx, cy, cz)}@${this.renderDistance}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.center = { cx, cy, cz };
      this.eye = { x, y, z };
      this.recomputeSets();
      this.unloadFar();
    } else if (this.setsStale) {
      this.recomputeSets();
    }

    if (this.jobs) {
      this.dispatchJobs(this.jobs);
      return;
    }

    // 1) Column tops and chunks, nearest first, within the generation budget.
    let deadline = performance.now() + genBudgetMs;
    let doneOne = false;
    this.advanceCursors();
    for (let i = this.loadCursor; i < this.loadList.length; i++) {
      const item = this.loadList[i]!;
      if (this.isLoaded(item)) continue;
      if (doneOne && performance.now() > deadline) break;
      if (item.tops) this.installTops(item.cx, item.cz, this.generator.columnTops(item.cx, item.cz));
      else {
        const chunk = new Chunk(item.cx, item.cy, item.cz);
        this.generator.generateChunk(chunk);
        this.addChunk(chunk);
      }
      doneOne = true;
    }

    // 2) Mesh chunks that are new or dirty and have their 26 neighbours and 9 column tops, nearest first.
    deadline = performance.now() + meshBudgetMs;
    doneOne = false;
    for (let i = this.meshCursor; i < this.meshList.length; i++) {
      const p = this.meshList[i]!;
      if (!this.needsMesh(p) || !this.neighborsReady(p.cx, p.cy, p.cz)) continue;
      if (doneOne && performance.now() > deadline) break;
      this.meshNow(p);
      doneOne = true;
    }
  }

  /**
   * Call after a block changes. Immediately remeshes every meshed chunk whose padded volume contains the block
   * (faces and AO read 1 block over the border). Light travels up to 14 blocks, so the rest of the 3x3x3 chunks
   * around it are marked dirty; update() rebuilds them over the next frames, nearest first.
   * When the edit moved the column top from oldTop to newTop, sky light changed below both, so meshed chunks of
   * the 3x3 columns around it that overlap [min - 15, max + 1] are marked dirty too.
   */
  onBlockChanged(wx: number, wy: number, wz: number, oldTop?: number, newTop?: number): void {
    const done = new Set<string>();
    for (let oy = -1; oy <= 1; oy++)
      for (let oz = -1; oz <= 1; oz++)
        for (let ox = -1; ox <= 1; ox++) {
          const p = this.pos(worldToChunk(wx + ox), worldToChunk(wy + oy), worldToChunk(wz + oz));
          if (done.has(p.key)) continue;
          done.add(p.key);
          this.bumpVersion(p.key);
          if (this.meshed.has(p.key) && this.neighborsReady(p.cx, p.cy, p.cz)) this.meshNow(p);
        }
    const ccx = worldToChunk(wx);
    const ccy = worldToChunk(wy);
    const ccz = worldToChunk(wz);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) this.markDirty(chunkKey(ccx + dx, ccy + dy, ccz + dz), done);

    if (oldTop !== undefined && newTop !== undefined && oldTop !== newTop) {
      const lo = Math.min(oldTop, newTop) - (CHUNK_SIZE - 1);
      const hi = Math.max(oldTop, newTop) + 1;
      for (const p of this.meshed.values()) {
        if (Math.abs(p.cx - ccx) > 1 || Math.abs(p.cz - ccz) > 1) continue;
        const y0 = p.cy * CHUNK_SIZE;
        if (y0 + CHUNK_SIZE - 1 >= lo && y0 <= hi) this.markDirty(p.key, done);
      }
      this.refreshColumn(ccx, ccz);
    }
  }

  /**
   * Batch version of onBlockChanged, for a volume edit. Nothing is remeshed here: each affected chunk is marked dirty
   * once (same rules as onBlockChanged), and update() rebuilds them under the mesh budget, so a large edit never stalls
   * one frame.
   */
  onBlocksChanged(effect: BatchEffect): void {
    const done = new Set<string>();
    const mark = (key: string): void => {
      if (done.has(key)) return;
      done.add(key);
      this.bumpVersion(key);
      if (this.meshed.has(key)) this.dirty.add(key);
    };
    for (const c of effect.chunks)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) mark(chunkKey(c.cx + dx, c.cy + dy, c.cz + dz));

    if (effect.tops.length > 0) {
      const spans = new Map<string, { lo: number; hi: number }>();
      for (const s of effect.tops) {
        spans.set(columnKey(s.cx, s.cz), s);
        this.refreshColumn(s.cx, s.cz);
      }
      for (const p of this.meshed.values()) {
        let affected = false;
        for (let dz = -1; dz <= 1 && !affected; dz++)
          for (let dx = -1; dx <= 1 && !affected; dx++) {
            const s = spans.get(columnKey(p.cx + dx, p.cz + dz));
            if (s && p.cy * CHUNK_SIZE + CHUNK_SIZE - 1 >= s.lo - (CHUNK_SIZE - 1) && p.cy * CHUNK_SIZE <= s.hi + 1) affected = true;
          }
        if (affected) mark(p.key);
      }
    }
    this.meshCursor = 0;
  }

  /** True when every chunk of the (2 radius + 1)³ cube around the chunk containing (x, y, z) has a mesh. */
  isAreaMeshed(x: number, y: number, z: number, radius: number): boolean {
    const cx = worldToChunk(Math.floor(x));
    const cy = worldToChunk(Math.floor(y));
    const cz = worldToChunk(Math.floor(z));
    for (let dy = -radius; dy <= radius; dy++)
      for (let dz = -radius; dz <= radius; dz++)
        for (let dx = -radius; dx <= radius; dx++)
          if (!this.meshed.has(chunkKey(cx + dx, cy + dy, cz + dz))) return false;
    return true;
  }

  /** True if chunk (cx, cy, cz) currently has a mesh. */
  isMeshed(cx: number, cy: number, cz: number): boolean {
    return this.meshed.has(chunkKey(cx, cy, cz));
  }

  /** True if chunk (cx, cy, cz) is in the mesh set (it should be meshed once its neighbours are loaded). */
  wantsMesh(cx: number, cy: number, cz: number): boolean {
    return this.meshSet.has(chunkKey(cx, cy, cz));
  }

  /** Forces every chunk to be rebuilt (e.g. after lighting changes). */
  markAllDirty(): void {
    for (const key of this.meshed.keys()) this.dirty.add(key);
    this.meshCursor = 0;
  }

  /** Largest vertical distance from y to any loaded column's lowest or highest top, capped at 2,000 blocks. */
  surfaceDistance(y: number): number {
    let d = 0;
    for (const info of this.columns.values()) d = Math.max(d, Math.abs(info.minTop - y), Math.abs(info.maxTop - y));
    return Math.min(d, MAX_SURFACE_DISTANCE);
  }

  /** Counts are computed when read (the F3 overlay reads them a few times per second). */
  get stats(): ChunkStats {
    let pendingGen = 0;
    for (let i = this.loadCursor; i < this.loadList.length; i++) if (!this.isLoaded(this.loadList[i]!)) pendingGen++;
    let pendingMesh = 0;
    for (let i = this.meshCursor; i < this.meshList.length; i++) if (this.needsMesh(this.meshList[i]!)) pendingMesh++;
    return {
      loaded: this.world.chunkCount,
      meshed: this.meshed.size,
      pendingGen,
      pendingMesh,
      columns: this.world.columnCount,
      jobsInFlight: this.jobsInFlight(),
      tickRan: this.lastTickStats.ran,
      tickPending: this.lastTickStats.pending,
      randomTickRan: this.lastRandomTickStats.ran,
      randomTickMs: Math.round(this.lastRandomTickStats.ms * 100) / 100,
    };
  }

  /**
   * Async version of the work in update(): starts worker jobs instead of doing the work here. Ready meshes go
   * first, so the area around the player is shown while farther chunks are still loading.
   */
  private dispatchJobs(jobs: ChunkJobs): void {
    this.advanceCursors();
    let checked = 0;
    for (let i = this.meshCursor; i < this.meshList.length && this.jobsInFlight() < MAX_JOBS_IN_FLIGHT; i++) {
      const p = this.meshList[i]!;
      if (!this.needsMesh(p) || this.meshing.has(p.key)) continue;
      // Readiness checks are the expensive part; nearer chunks become ready first, so stop after a while.
      if (++checked > MESH_SCAN_LIMIT) break;
      if (!this.neighborsReady(p.cx, p.cy, p.cz)) continue;
      this.meshing.add(p.key);
      this.dirty.delete(p.key);
      const version = this.versions.get(p.key) ?? 0;
      const neighbors = this.neighborBlocks(p.cx, p.cy, p.cz).map((b) => b.slice());
      const tops = this.neighborTops(p.cx, p.cz).map((t) => t.slice());
      void jobs.mesh(p.cx, p.cy, p.cz, neighbors, tops).then((data) => {
        this.meshing.delete(p.key);
        this.jobDone(jobs);
        // Drop the result if the chunk changed meanwhile (it is dirty again) or left the mesh set.
        if ((this.versions.get(p.key) ?? 0) !== version) return;
        if (!this.meshSet.has(p.key) || !this.neighborsReady(p.cx, p.cy, p.cz)) return;
        this.sink.set(p.cx, p.cy, p.cz, data);
        this.meshed.set(p.key, p);
      });
    }
    for (let i = this.loadCursor; i < this.loadList.length && this.jobsInFlight() < MAX_JOBS_IN_FLIGHT; i++) {
      const item = this.loadList[i]!;
      if (this.isLoaded(item) || (item.tops ? this.fetchingTops : this.generating).has(item.key)) continue;
      if (item.tops) {
        this.fetchingTops.add(item.key);
        void jobs.columnTops(item.cx, item.cz).then((tops) => {
          this.fetchingTops.delete(item.key);
          this.jobDone(jobs);
          if (this.world.getColumnTops(item.cx, item.cz) || !this.columnSet.has(item.key)) return;
          this.installTops(item.cx, item.cz, tops);
        });
      } else {
        this.generating.add(item.key);
        void jobs.generate(item.cx, item.cy, item.cz).then((blocks) => {
          this.generating.delete(item.key);
          this.jobDone(jobs);
          if (this.world.hasChunk(item.cx, item.cy, item.cz) || !this.genSet.has(item.key)) return;
          const chunk = new Chunk(item.cx, item.cy, item.cz);
          chunk.blocks.set(blocks);
          this.addChunk(chunk);
        });
      }
    }
  }

  private needsMesh(p: ChunkPos): boolean {
    return !this.meshed.has(p.key) || this.dirty.has(p.key);
  }

  /** Moves both cursors past the items at the front of their lists that need no work. */
  private advanceCursors(): void {
    while (this.loadCursor < this.loadList.length && this.isLoaded(this.loadList[this.loadCursor]!)) this.loadCursor++;
    while (this.meshCursor < this.meshList.length && !this.needsMesh(this.meshList[this.meshCursor]!)) this.meshCursor++;
  }

  /**
   * Refills the job slots soon after results come back instead of waiting for the next frame, so the workers stay
   * busy even when the frame rate is low. Results arriving together share one refill.
   */
  private jobDone(jobs: ChunkJobs): void {
    if (this.refillScheduled) return;
    this.refillScheduled = true;
    setTimeout(() => {
      this.refillScheduled = false;
      this.dispatchJobs(jobs);
    }, 0);
  }

  private isLoaded(item: LoadItem): boolean {
    return item.tops ? this.world.getColumnTops(item.cx, item.cz) !== undefined : this.world.hasChunk(item.cx, item.cy, item.cz);
  }

  private installTops(cx: number, cz: number, tops: Int32Array): void {
    this.world.installColumnTops(cx, cz, tops);
    if (this.refreshColumn(cx, cz)) this.addBand(cx, cz);
  }

  private addChunk(chunk: Chunk): void {
    this.world.applyEdits(chunk);
    this.world.addChunk(chunk);
    // A falling block saved mid-fall resumes its fall once its chunk is loaded (see falling.ts).
    scheduleFallingBlocks(this.world, chunk);
    scheduleFlowingWater(this.world, chunk);
  }

  /**
   * Recomputes a column's surface band from its tops. Returns true if the column had no band before (new tops:
   * the caller adds the band to the load sets); otherwise the sets are recomputed on the next update.
   */
  private refreshColumn(cx: number, cz: number): boolean {
    const tops = this.world.getColumnTops(cx, cz);
    if (!tops) return false;
    const key = columnKey(cx, cz);
    const isNew = !this.columns.has(key);
    let minTop = Infinity;
    let maxTop = -Infinity;
    for (let i = 0; i < tops.length; i++) {
      minTop = Math.min(minTop, tops[i]!);
      maxTop = Math.max(maxTop, tops[i]!);
    }
    const bandHi = worldToChunk(maxTop);
    const bandLo = Math.max(worldToChunk(minTop) - SURFACE_BAND, bandHi - MAX_BAND_CHUNKS);
    this.columns.set(key, { bandLo, bandHi, minTop: Math.max(minTop, maxTop - MAX_SURFACE_DISTANCE), maxTop });
    if (!isNew) this.setsStale = true;
    return isNew;
  }

  /**
   * Adds a new column's surface band to the mesh and generate sets, in sorted position. Much cheaper than a full
   * recompute, which matters while hundreds of column tops arrive during loading.
   */
  private addBand(cx: number, cz: number): void {
    const info = this.columns.get(columnKey(cx, cz))!;
    const R = this.renderDistance;
    if ((cx - this.center.cx) ** 2 + (cz - this.center.cz) ** 2 > R * R) return; // only columns within R mesh
    for (let cy = info.bandLo; cy <= info.bandHi; cy++) {
      const key = chunkKey(cx, cy, cz);
      if (this.meshSet.has(key)) continue;
      this.meshSet.add(key);
      const p = { cx, cy, cz, key };
      const d = this.chunkDistance(p);
      const i = sortedIndex(this.meshList.length, (k) => this.chunkDistance(this.meshList[k]!) <= d);
      this.meshList.splice(i, 0, p);
      this.meshCursor = Math.min(this.meshCursor, i);
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (let cy = info.bandLo - 1; cy <= info.bandHi + 1; cy++) {
          const key = chunkKey(cx + dx, cy, cz + dz);
          if (this.genSet.has(key)) continue;
          this.genSet.add(key);
          const item: LoadItem = { tops: false, cx: cx + dx, cy, cz: cz + dz, key };
          const d = this.loadDistance(item);
          // Ties go after existing items, so a column's tops (sorted first on ties) stay ahead of its chunks.
          const i = sortedIndex(this.loadList.length, (k) => this.loadDistance(this.loadList[k]!) <= d);
          this.loadList.splice(i, 0, item);
          this.loadCursor = Math.min(this.loadCursor, i);
        }
  }

  /** Squared distance in blocks from the eye: 3D to a chunk's centre. */
  private chunkDistance(p: { cx: number; cy: number; cz: number }): number {
    return this.columnDistance(p.cx, p.cz) + ((p.cy + 0.5) * CHUNK_SIZE - this.eye.y) ** 2;
  }

  /** Squared horizontal distance in blocks from the eye to a column's centre line (never more than its chunks'). */
  private columnDistance(cx: number, cz: number): number {
    return ((cx + 0.5) * CHUNK_SIZE - this.eye.x) ** 2 + ((cz + 0.5) * CHUNK_SIZE - this.eye.z) ** 2;
  }

  private loadDistance(item: LoadItem): number {
    return item.tops ? this.columnDistance(item.cx, item.cz) : this.chunkDistance(item);
  }

  private recomputeSets(): void {
    this.setsStale = false;
    const { cx: pcx, cy: pcy, cz: pcz } = this.center;
    const R = this.renderDistance;
    const V = this.verticalDistance;

    // Columns, nearest first.
    const columnRadius = R + COLUMN_MARGIN;
    const columns: (ColumnPos & { d: number })[] = [];
    for (let dz = -columnRadius; dz <= columnRadius; dz++)
      for (let dx = -columnRadius; dx <= columnRadius; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= columnRadius * columnRadius) columns.push({ cx: pcx + dx, cz: pcz + dz, key: columnKey(pcx + dx, pcz + dz), d });
      }
    this.columnSet = new Set(columns.map((c) => c.key));

    // Mesh intervals (chunk y ranges) per column within R: the near cylinder and the surface band.
    const meshRanges = new Map<string, [number, number][]>();
    for (const c of columns) {
      if (c.d > R * R) continue;
      const ranges: [number, number][] = [[pcy - V, pcy + V]];
      const info = this.columns.get(c.key);
      if (info) ranges.push([info.bandLo, info.bandHi]);
      meshRanges.set(c.key, ranges);
    }

    const meshList: ChunkPos[] = [];
    const genList: ChunkPos[] = [];
    const meshSet = new Set<string>();
    const genSet = new Set<string>();
    for (const c of columns) {
      // Mesh set: the union of this column's ranges.
      const own = meshRanges.get(c.key);
      if (own) for (const cy of rangeValues(own)) this.pushChunk(c.cx, cy, c.cz, meshList, meshSet);
      // Generate set: the mesh ranges of the 3x3 columns around it, each grown by 1.
      const grown: [number, number][] = [];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const ranges = meshRanges.get(columnKey(c.cx + dx, c.cz + dz));
          if (ranges) for (const [lo, hi] of ranges) grown.push([lo - 1, hi + 1]);
        }
      for (const cy of rangeValues(grown)) this.pushChunk(c.cx, cy, c.cz, genList, genSet);
    }
    // A column is never farther than any of its chunks, so its tops sort before them (ties: tops first).
    this.meshList = meshList.map((p) => ({ p, d: this.chunkDistance(p) })).sort((a, b) => a.d - b.d).map((e) => e.p);
    this.meshCursor = 0;
    this.loadCursor = 0;
    const load: { item: LoadItem; d: number; order: number }[] = [];
    for (const c of columns) load.push({ item: { tops: true, cx: c.cx, cz: c.cz, key: c.key }, d: this.columnDistance(c.cx, c.cz), order: 0 });
    for (const p of genList) load.push({ item: { tops: false, ...p }, d: this.chunkDistance(p), order: 1 });
    load.sort((a, b) => a.d - b.d || a.order - b.order);
    this.loadList = load.map((e) => e.item);
    this.meshSet = meshSet;
    this.genSet = genSet;
  }

  private pushChunk(cx: number, cy: number, cz: number, list: ChunkPos[], set: Set<string>): void {
    const key = chunkKey(cx, cy, cz);
    if (set.has(key)) return;
    set.add(key);
    list.push({ cx, cy, cz, key });
  }

  private pos(cx: number, cy: number, cz: number): ChunkPos {
    return { cx, cy, cz, key: chunkKey(cx, cy, cz) };
  }

  private markDirty(key: string, skip: Set<string>): void {
    if (skip.has(key) || !this.meshed.has(key)) return;
    skip.add(key);
    this.bumpVersion(key);
    this.dirty.add(key);
    this.meshCursor = 0;
  }

  private jobsInFlight(): number {
    return this.fetchingTops.size + this.generating.size + this.meshing.size;
  }

  private bumpVersion(key: string): void {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  /** True if chunk cy of column (cx, cz) is in that column's surface band, grown by `margin` chunks. */
  private inBand(cx: number, cy: number, cz: number, margin: number): boolean {
    const info = this.columns.get(columnKey(cx, cz));
    return info !== undefined && cy >= info.bandLo - margin && cy <= info.bandHi + margin;
  }

  private neighborBlocks(cx: number, cy: number, cz: number): Uint16Array[] {
    const neighbors: Uint16Array[] = new Array(27);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          neighbors[neighborIndex(dx, dy, dz)] = this.world.getChunk(cx + dx, cy + dy, cz + dz)!.blocks;
    return neighbors;
  }

  private neighborTops(cx: number, cz: number): Int32Array[] {
    const tops: Int32Array[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) tops.push(this.world.getColumnTops(cx + dx, cz + dz)!);
    return tops;
  }

  private neighborsReady(cx: number, cy: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.world.getColumnTops(cx + dx, cz + dz)) return false;
        for (let dy = -1; dy <= 1; dy++) if (!this.world.hasChunk(cx + dx, cy + dy, cz + dz)) return false;
      }
    return true;
  }

  private meshNow(p: ChunkPos): void {
    this.sink.set(p.cx, p.cy, p.cz, buildChunkMesh(this.neighborBlocks(p.cx, p.cy, p.cz), this.neighborTops(p.cx, p.cz), p.cy));
    this.meshed.set(p.key, p);
    this.dirty.delete(p.key);
  }

  private unloadFar(): void {
    const { cx: pcx, cy: pcy, cz: pcz } = this.center;
    const R = this.renderDistance;
    const V = this.verticalDistance;
    const horizontal = (cx: number, cz: number) => (cx - pcx) ** 2 + (cz - pcz) ** 2;

    const meshR = R + MESH_KEEP_MARGIN;
    for (const p of [...this.meshed.values()]) {
      const far = horizontal(p.cx, p.cz) > meshR * meshR;
      const outside = Math.abs(p.cy - pcy) > V + MESH_KEEP_MARGIN && !this.inBand(p.cx, p.cy, p.cz, 0);
      if (far || outside) {
        this.sink.remove(p.cx, p.cy, p.cz);
        this.meshed.delete(p.key);
        this.dirty.delete(p.key);
      }
    }

    const dropR = R + UNLOAD_MARGIN;
    for (const chunk of this.world.chunks()) {
      const far = horizontal(chunk.cx, chunk.cz) > dropR * dropR;
      // The band's neighbours (1 chunk) are loaded too; keep one more chunk of hysteresis around them.
      const outside = Math.abs(chunk.cy - pcy) > V + UNLOAD_MARGIN && !this.inBand(chunk.cx, chunk.cy, chunk.cz, 2);
      if (far || outside) this.world.removeChunk(chunk.cx, chunk.cy, chunk.cz);
    }

    for (const key of this.world.columnKeys()) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      if (horizontal(cx, cz) <= dropR * dropR) continue;
      if (this.world.removeColumnTops(cx, cz)) this.columns.delete(key);
    }
  }
}

/** The first index in 0..length for which before(index) is false, where before is true for a prefix. */
function sortedIndex(length: number, before: (index: number) => boolean): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The distinct integers covered by a list of inclusive ranges, ascending. */
function rangeValues(ranges: readonly [number, number][]): number[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let next = -Infinity;
  for (const [lo, hi] of sorted) {
    for (let v = Math.max(lo, next); v <= hi; v++) out.push(v);
    next = Math.max(next, hi + 1);
  }
  return out;
}
