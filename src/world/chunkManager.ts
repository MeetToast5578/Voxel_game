import { chunkKey, worldToChunk } from '../core/coords';
import { buildChunkMesh, type ChunkMeshData } from '../render/mesher';
import { Chunk } from './chunk';
import type { TerrainGenerator } from './generator';
import type { World } from './world';

/** Receives finished meshes. Implemented by render/chunkMeshes.ts (and by fakes in tests). */
export interface MeshSink {
  set(cx: number, cz: number, data: ChunkMeshData): void;
  remove(cx: number, cz: number): void;
}

/** Does generation and meshing somewhere else (Web Workers). Implemented by workers/workerPool.ts. */
export interface ChunkJobs {
  generate(cx: number, cz: number): Promise<Uint8Array>;
  /** Receives copies of the 9 block arrays; may keep them. */
  mesh(neighbors: Uint8Array[]): Promise<ChunkMeshData>;
}

/** With ChunkJobs: at most this many generate/mesh jobs are waiting for a result at once. */
const MAX_JOBS_IN_FLIGHT = 8;

interface ChunkPos {
  cx: number;
  cz: number;
  key: string;
}

export interface ChunkStats {
  loaded: number;
  meshed: number;
  pendingGen: number;
  pendingMesh: number;
}

/** Chunks inside this circle are generated; it must contain every neighbor of every meshed chunk. */
const GEN_MARGIN = 2;
/** Chunks farther than renderDistance + UNLOAD_MARGIN are unloaded (hysteresis avoids load/unload flicker). */
const UNLOAD_MARGIN = 3;

function ring(centerX: number, centerZ: number, radius: number): ChunkPos[] {
  const out: (ChunkPos & { d: number })[] = [];
  const r = Math.ceil(radius);
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dz * dz;
      if (d <= radius * radius) out.push({ cx: centerX + dx, cz: centerZ + dz, key: chunkKey(centerX + dx, centerZ + dz), d });
    }
  out.sort((a, b) => a.d - b.d);
  return out;
}

export class ChunkManager {
  renderDistance: number;
  private readonly meshed = new Set<string>();
  private readonly dirty = new Set<string>();
  private genList: ChunkPos[] = [];
  private meshList: ChunkPos[] = [];
  private centerKey = '';
  private centerCx = 0;
  private centerCz = 0;
  private pendingGen = 0;
  private pendingMesh = 0;
  // Only used with ChunkJobs:
  private readonly generating = new Set<string>();
  private readonly meshing = new Set<string>();
  /** Bumped whenever a chunk's mesh becomes outdated, so late worker results can be recognized and dropped. */
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly generator: TerrainGenerator,
    private readonly sink: MeshSink,
    renderDistance: number,
    private readonly jobs: ChunkJobs | null = null,
  ) {
    this.renderDistance = renderDistance;
  }

  /** Call once per frame. Generates, meshes and unloads chunks around (x, z) within the time budgets. */
  update(x: number, z: number, genBudgetMs: number, meshBudgetMs: number): void {
    const cx = worldToChunk(Math.floor(x));
    const cz = worldToChunk(Math.floor(z));
    const key = `${chunkKey(cx, cz)}@${this.renderDistance}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.centerCx = cx;
      this.centerCz = cz;
      this.genList = ring(cx, cz, this.renderDistance + GEN_MARGIN);
      this.meshList = ring(cx, cz, this.renderDistance);
      this.unloadFar();
    }

    if (this.jobs) {
      this.dispatchJobs(this.jobs);
      return;
    }

    // 1) Generate missing chunks, nearest first.
    let deadline = performance.now() + genBudgetMs;
    let doneOne = false;
    this.pendingGen = 0;
    for (const p of this.genList) {
      if (this.world.hasChunk(p.cx, p.cz)) continue;
      if (doneOne && performance.now() > deadline) {
        this.pendingGen++;
        continue;
      }
      const chunk = new Chunk(p.cx, p.cz);
      this.generator.generateChunk(chunk);
      this.world.applyEdits(chunk);
      this.world.addChunk(chunk);
      doneOne = true;
    }

    // 2) Mesh chunks that are new or dirty and have all 8 neighbors generated, nearest first.
    deadline = performance.now() + meshBudgetMs;
    doneOne = false;
    this.pendingMesh = 0;
    for (const p of this.meshList) {
      if (this.meshed.has(p.key) && !this.dirty.has(p.key)) continue;
      if (!this.neighborsReady(p.cx, p.cz)) {
        this.pendingMesh++;
        continue;
      }
      if (doneOne && performance.now() > deadline) {
        this.pendingMesh++;
        continue;
      }
      this.meshChunk(p.cx, p.cz);
      doneOne = true;
    }
  }

  /**
   * Call after a block changes. Immediately remeshes every chunk whose mesh can see that block (faces and AO
   * read 1 block over the border). Light travels up to 14 blocks, so the 8 chunks around the changed one are
   * also marked dirty; update() rebuilds them over the next frames, nearest first.
   */
  onBlockChanged(wx: number, _wy: number, wz: number): void {
    const done = new Set<string>();
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = worldToChunk(wx + dx);
        const cz = worldToChunk(wz + dz);
        const key = chunkKey(cx, cz);
        if (done.has(key)) continue;
        done.add(key);
        this.bumpVersion(key);
        if (this.meshed.has(key) && this.neighborsReady(cx, cz)) this.meshChunk(cx, cz);
      }
    const ccx = worldToChunk(wx);
    const ccz = worldToChunk(wz);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(ccx + dx, ccz + dz);
        if (done.has(key) || !this.meshed.has(key)) continue;
        this.bumpVersion(key);
        this.dirty.add(key);
      }
  }

  /** True when every chunk within `radius` chunks of the chunk containing (x, z) has a mesh. */
  isAreaMeshed(x: number, z: number, radius: number): boolean {
    const cx = worldToChunk(Math.floor(x));
    const cz = worldToChunk(Math.floor(z));
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) if (!this.meshed.has(chunkKey(cx + dx, cz + dz))) return false;
    return true;
  }

  /** Forces every chunk to be rebuilt (e.g. after render distance or lighting changes). */
  markAllDirty(): void {
    for (const key of this.meshed) this.dirty.add(key);
  }

  get stats(): ChunkStats {
    return { loaded: this.world.chunkCount, meshed: this.meshed.size, pendingGen: this.pendingGen, pendingMesh: this.pendingMesh };
  }

  /** Async version of update(): starts worker jobs instead of doing the work here. */
  private dispatchJobs(jobs: ChunkJobs): void {
    this.pendingGen = 0;
    this.pendingMesh = 0;
    const genRadius = this.renderDistance + GEN_MARGIN;
    for (const p of this.genList) {
      if (this.world.hasChunk(p.cx, p.cz) || this.generating.has(p.key)) continue;
      if (this.jobsInFlight() >= MAX_JOBS_IN_FLIGHT) {
        this.pendingGen++;
        continue;
      }
      this.generating.add(p.key);
      void jobs.generate(p.cx, p.cz).then((blocks) => {
        this.generating.delete(p.key);
        if (this.world.hasChunk(p.cx, p.cz) || !this.isNearCenter(p.cx, p.cz, genRadius)) return;
        const chunk = new Chunk(p.cx, p.cz);
        chunk.blocks.set(blocks);
        this.world.applyEdits(chunk);
        this.world.addChunk(chunk);
      });
    }
    for (const p of this.meshList) {
      if ((this.meshed.has(p.key) && !this.dirty.has(p.key)) || this.meshing.has(p.key)) continue;
      if (!this.neighborsReady(p.cx, p.cz) || this.jobsInFlight() >= MAX_JOBS_IN_FLIGHT) {
        this.pendingMesh++;
        continue;
      }
      this.meshing.add(p.key);
      this.dirty.delete(p.key);
      const version = this.versions.get(p.key) ?? 0;
      void jobs.mesh(this.neighborBlocks(p.cx, p.cz).map((b) => b.slice())).then((data) => {
        this.meshing.delete(p.key);
        // Drop the result if the chunk changed meanwhile (it is dirty again) or went out of range.
        if ((this.versions.get(p.key) ?? 0) !== version) return;
        if (!this.isNearCenter(p.cx, p.cz, this.renderDistance + 1) || !this.neighborsReady(p.cx, p.cz)) return;
        this.sink.set(p.cx, p.cz, data);
        this.meshed.add(p.key);
      });
    }
  }

  private jobsInFlight(): number {
    return this.generating.size + this.meshing.size;
  }

  private bumpVersion(key: string): void {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  private isNearCenter(cx: number, cz: number, radius: number): boolean {
    const dx = cx - this.centerCx;
    const dz = cz - this.centerCz;
    return dx * dx + dz * dz <= radius * radius;
  }

  private neighborBlocks(cx: number, cz: number): Uint8Array[] {
    const neighbors: Uint8Array[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) neighbors.push(this.world.getChunk(cx + dx, cz + dz)!.blocks);
    return neighbors;
  }

  private neighborsReady(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (!this.world.hasChunk(cx + dx, cz + dz)) return false;
    return true;
  }

  private meshChunk(cx: number, cz: number): void {
    this.sink.set(cx, cz, buildChunkMesh(this.neighborBlocks(cx, cz)));
    const key = chunkKey(cx, cz);
    this.meshed.add(key);
    this.dirty.delete(key);
  }

  private unloadFar(): void {
    const max = this.renderDistance + UNLOAD_MARGIN;
    const meshMax = this.renderDistance + 1;
    for (const key of [...this.meshed]) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      const dx = cx - this.centerCx;
      const dz = cz - this.centerCz;
      if (dx * dx + dz * dz > meshMax * meshMax) {
        this.sink.remove(cx, cz);
        this.meshed.delete(key);
        this.dirty.delete(key);
      }
    }
    for (const chunk of this.world.chunks()) {
      const dx = chunk.cx - this.centerCx;
      const dz = chunk.cz - this.centerCz;
      if (dx * dx + dz * dz > max * max) this.world.removeChunk(chunk.cx, chunk.cz);
    }
  }
}
