import { CHUNK_SIZE, CHUNK_VOLUME, RANDOM_TICKS_PER_CHUNK, type TreeSpecies } from '../config';
import { chunkKey, columnIndex, columnKey, localIndex, worldToChunk, worldToLocal } from '../core/coords';
import { BlockId, blocksSky } from './blocks';
import { Chunk } from './chunk';
import { type PendingTick, type TickHandoff } from './tick';
import { catchUpChunk, handleTick, handleRandomTick } from './ecology';
import { forEachRandomCell } from './randomTick';
import { floorDiv } from '../core/math';

/** Generates the blocks of a chunk synchronously (without player edits). */
export type ChunkFallback = (cx: number, cy: number, cz: number) => Uint16Array;

/** Column top of a cell with no sky-blocking block within reach of a downward scan. */
export const NO_TOP = -0x7fffffff;
/** A downward top scan gives up after this many chunks (only possible in worlds without solid ground). */
const TOP_SCAN_CHUNKS = 64;

const emptyFallback: ChunkFallback = () => new Uint16Array(CHUNK_VOLUME);

/** One block to write in a batch edit. */
export interface CellWrite {
  x: number;
  y: number;
  z: number;
  id: number;
}

/** What a batch edit changed: each touched chunk once, and each column whose top moved (lo and hi are its old and new tops). */
export interface BatchEffect {
  chunks: { cx: number; cy: number; cz: number }[];
  tops: { cx: number; cz: number; lo: number; hi: number }[];
}

/** A block broken by the physics, at its cell. */
export interface DroppedBlock {
  id: number;
  x: number;
  y: number;
  z: number;
  /** True when the block was part of a big enough collapse to tumble as a loose body (spec 25, slice 6). */
  body: boolean;
}

/** The weather just above a column top, for snow and ice (T-G2). */
export interface SurfaceWeather {
  temperatureC: number;
  snowing: boolean;
}

export class World {
  readonly seed: number;
  /** Set by the game: the weather at a position in blocks. Without it, snow and ice never change. */
  surfaceWeather?: (x: number, y: number, z: number) => SurfaceWeather;
  /** Set by the game: the tree species that grows at a column, for the saplings leaves drop (T-G3). */
  treeSpeciesAt?: (x: number, z: number) => TreeSpecies | null;
  private readonly chunkMap = new Map<string, Chunk>();
  /** Player edits: chunkKey -> (localIndex -> block state). Survives chunk unloading. */
  private readonly editMap = new Map<string, Map<number, number>>();
  private readonly droppedBlocks: DroppedBlock[] = [];
  /** Chunk keys whose edits changed since the last takeDirtyEdits (what the next save must write). */
  private readonly dirtyEdits = new Set<string>();
  /** columnKey -> chunk keys in that column that have edits. */
  private readonly editedChunksByColumn = new Map<string, Set<string>>();
  /** columnKey -> world y of the highest sky-blocking block per cell (index lz * 16 + lx). */
  private readonly tops = new Map<string, Int32Array>();
  private readonly generatedTops = new Map<string, Int32Array>();
  /** columnKey -> number of loaded chunks in that column. */
  private readonly loadedPerColumn = new Map<string, number>();
  /** Global tick counter, incremented once per tickStep. */
  private tickCounter = 0;
  private orderedTickChunks: Chunk[] | null = null;
  private tickChunks(): Chunk[] {
    return this.orderedTickChunks ??= this.chunks().sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.cz - b.cz);
  }
  private readonly dormantTicks = new Map<string, Map<string, PendingTick>>();
  /** chunkKey -> tick a surface or edited chunk unloaded at, so it catches up on the time it missed (T-G7). */
  private readonly unloadedAt = new Map<string, number>();

  /** Ticks since each unloaded chunk with edits left; saved so the catch-up survives a reload of the game. */
  snapshotChunkAges(): [string, number][] {
    return [...this.unloadedAt].filter(([key]) => this.editMap.has(key)).map(([key, tick]) => [key, this.tickCounter - tick]);
  }

  /** Call after loadTicks, which sets the tick the ages count back from. */
  loadChunkAges(ages: readonly (readonly [string, number])[]): void {
    this.unloadedAt.clear();
    for (const [key, age] of ages) this.unloadedAt.set(key, this.tickCounter - age);
  }

  /** Snapshot both active and unloaded work with relative delays, independent of wall-clock time. */
  snapshotTicks(): PendingTick[] {
    const ticks = [...this.dormantTicks.values()].flatMap(queue => [...queue.values()].map(t => ({ ...t })));
    for (const chunk of this.chunkMap.values()) for (const t of chunk.ticks.snapshot())
      ticks.push({ x: t.x, y: t.y, z: t.z, reason: t.reason, delay: Math.max(0, t.dueTick - this.tickCounter) });
    return ticks.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z || a.reason.localeCompare(b.reason));
  }

  /** Load before chunks; old saves without pending work retain their load-time recovery scans. */
  loadTicks(ticks: readonly PendingTick[], gameTick = 0): void {
    this.tickCounter = gameTick;
    this.dormantTicks.clear();
    for (const t of ticks) this.scheduleTick(t.x, t.y, t.z, this.tickCounter + t.delay, t.reason);
  }

  private parkTick(t: PendingTick): void {
    const key = chunkKey(worldToChunk(t.x), worldToChunk(t.y), worldToChunk(t.z));
    let queue = this.dormantTicks.get(key);
    if (!queue) { queue = new Map(); this.dormantTicks.set(key, queue); }
    const id = `${t.x},${t.y},${t.z}:${t.reason}`, previous = queue.get(id);
    if (!previous || t.delay < previous.delay) queue.set(id, { ...t });
  }
  private tickCursor = 0;
  private randomCursor = 0;
  private readonly changedChunks = new Map<string, { cx: number; cy: number; cz: number }>();
  private readonly changedTops = new Map<string, { cx: number; cz: number; lo: number; hi: number }>();

  /** Render invalidation is independent of save dirtiness: saving must never consume mesh updates. */
  takeBlockChanges(): BatchEffect {
    const effect = { chunks: [...this.changedChunks.values()], tops: [...this.changedTops.values()] };
    this.changedChunks.clear();
    this.changedTops.clear();
    return effect;
  }

  private trackChanges(effect: BatchEffect): void {
    for (const c of effect.chunks) this.changedChunks.set(chunkKey(c.cx, c.cy, c.cz), c);
    for (const t of effect.tops) {
      const key = columnKey(t.cx, t.cz), old = this.changedTops.get(key);
      this.changedTops.set(key, { ...t, lo: Math.min(t.lo, old?.lo ?? t.lo), hi: Math.max(t.hi, old?.hi ?? t.hi) });
    }
  }

  constructor(
    seed: number,
    private readonly fallback: ChunkFallback = emptyFallback,
  ) {
    this.seed = seed;
  }

  /** Read-only view of the player edits (for saving). */
  get edits(): ReadonlyMap<string, ReadonlyMap<number, number>> {
    return this.editMap;
  }

  /** Replaces all edits (when loading a save). Call before any column tops are installed. Nothing is dirty after. */
  loadEdits(edits: ReadonlyMap<string, ReadonlyMap<number, number>>): void {
    this.editMap.clear();
    this.editedChunksByColumn.clear();
    for (const [key, chunkEdits] of edits) for (const [index, id] of chunkEdits) this.recordEdit(key, index, id);
    this.dirtyEdits.clear();
  }

  /** Returns the chunk keys whose edits changed since the last call, and forgets them. */
  takeDirtyEdits(): string[] {
    const keys = [...this.dirtyEdits];
    this.dirtyEdits.clear();
    return keys;
  }

  /** Marks chunk keys as changed again (for example because writing them failed). */
  restoreDirtyEdits(keys: readonly string[]): void {
    for (const key of keys) this.dirtyEdits.add(key);
  }

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunkMap.get(chunkKey(cx, cy, cz));
  }

  hasChunk(cx: number, cy: number, cz: number): boolean {
    return this.chunkMap.has(chunkKey(cx, cy, cz));
  }

  addChunk(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cy, chunk.cz);
    if (this.chunkMap.has(key)) return;
    this.chunkMap.set(key, chunk);
    this.orderedTickChunks = null;
    const dormant = this.dormantTicks.get(key);
    this.dormantTicks.delete(key);
    if (dormant) for (const t of dormant.values())
      chunk.ticks.schedule({ x: t.x, y: t.y, z: t.z, reason: t.reason, dueTick: this.tickCounter + t.delay }, chunk.cx, chunk.cy, chunk.cz);
    const col = columnKey(chunk.cx, chunk.cz);
    this.loadedPerColumn.set(col, (this.loadedPerColumn.get(col) ?? 0) + 1);
    const since = this.unloadedAt.get(key);
    this.unloadedAt.delete(key);
    if (since !== undefined) catchUpChunk(this, chunk, this.tickCounter - since);
  }

  removeChunk(cx: number, cy: number, cz: number): void {
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return;
    for (const t of chunk.ticks.snapshot()) this.parkTick({ x: t.x, y: t.y, z: t.z, reason: t.reason, delay: Math.max(0, t.dueTick - this.tickCounter) });
    const key = chunkKey(cx, cy, cz);
    this.chunkMap.delete(key);
    this.orderedTickChunks = null;
    // Only a chunk that holds a column top or edits can change while away; deep chunks are not worth remembering.
    const tops = this.tops.get(columnKey(cx, cz));
    if (this.editMap.has(key) || tops?.some((top) => floorDiv(top, CHUNK_SIZE) === cy)) this.unloadedAt.set(key, this.tickCounter);
    const col = columnKey(cx, cz);
    const n = (this.loadedPerColumn.get(col) ?? 1) - 1;
    if (n > 0) this.loadedPerColumn.set(col, n);
    else this.loadedPerColumn.delete(col);
  }

  /** Snapshot of all loaded chunks (safe to remove chunks while iterating). */
  chunks(): Chunk[] {
    return [...this.chunkMap.values()];
  }

  get chunkCount(): number {
    return this.chunkMap.size;
  }

  /** Number of columns whose tops are installed. */
  get columnCount(): number {
    return this.tops.size;
  }

  /** Column keys whose tops are installed. */
  columnKeys(): string[] {
    return [...this.tops.keys()];
  }

  isLoadedAt(wx: number, wy: number, wz: number): boolean {
    return this.hasChunk(worldToChunk(wx), worldToChunk(wy), worldToChunk(wz));
  }

  /** The block state at a position; AIR where the chunk is not loaded. */
  getBlock(wx: number, wy: number, wz: number): number {
    const chunk = this.getChunk(worldToChunk(wx), worldToChunk(wy), worldToChunk(wz));
    if (!chunk) return BlockId.AIR;
    return chunk.blocks[localIndex(worldToLocal(wx), worldToLocal(wy), worldToLocal(wz))]!;
  }

  /** The tops of column (cx, cz), or undefined until they are installed. Do not modify the array. */
  getColumnTops(cx: number, cz: number): Int32Array | undefined {
    return this.tops.get(columnKey(cx, cz));
  }

  /** Generated skyline before saved structures changed lighting tops. Do not modify. */
  getGeneratedColumnTops(cx: number, cz: number): Int32Array | undefined {
    return this.generatedTops.get(columnKey(cx, cz));
  }

  /** Sparse edited chunks worth rendering, without expanding empty gaps under high builds. */
  editedChunkYs(cx: number, cz: number): number[] {
    const col = columnKey(cx, cz);
    const generated = this.generatedTops.get(col);
    const top = generated ? Math.max(...generated) : -Infinity;
    const ys: number[] = [];
    for (const key of this.editedChunksByColumn.get(col) ?? []) {
      const cy = Number(key.split(',')[1]);
      // Air-only cleanup above generated terrain has no visible geometry.
      if (cy * CHUNK_SIZE <= top || [...this.editMap.get(key)!.values()].some(id => id !== BlockId.AIR)) ys.push(cy);
    }
    return ys;
  }

  /** World y of the highest sky-blocking block at (wx, wz), or undefined if that column has no tops yet. */
  topAt(wx: number, wz: number): number | undefined {
    return this.getColumnTops(worldToChunk(wx), worldToChunk(wz))?.[columnIndex(worldToLocal(wx), worldToLocal(wz))];
  }

  /**
   * Installs the generated tops of a column, corrected for every saved edit in it, so they always equal a scan
   * of the generated-plus-edited blocks. Takes ownership of the array.
   */
  installColumnTops(cx: number, cz: number, generated: Int32Array): void {
    const col = columnKey(cx, cz);
    this.generatedTops.set(col, generated.slice());
    this.tops.set(col, generated);
    const edited = this.editedChunksByColumn.get(col);
    if (!edited) return;
    // Cells with edits: the top is the highest blocking edit above the generated top, else the generated top
    // unless an edit removed it, in which case scan down from there.
    const highestEdit = new Map<number, number>(); // cell -> highest y with a sky-blocking edit
    const removedTop = new Set<number>(); // cells whose generated top block was replaced by a non-blocking one
    for (const key of edited) {
      const cy = Number(key.split(',')[1]);
      for (const [index, id] of this.editMap.get(key)!) {
        const cell = index % (CHUNK_SIZE * CHUNK_SIZE);
        const y = cy * CHUNK_SIZE + Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        if (blocksSky(id)) highestEdit.set(cell, Math.max(highestEdit.get(cell) ?? NO_TOP, y));
        else if (y === generated[cell]) removedTop.add(cell);
      }
    }
    for (const cell of new Set([...highestEdit.keys(), ...removedTop])) {
      const edit = highestEdit.get(cell) ?? NO_TOP;
      const top = generated[cell]!;
      if (edit > top) generated[cell] = edit;
      else if (removedTop.has(cell)) {
        generated[cell] = this.scanDown(cx, cz, cell % CHUNK_SIZE, Math.floor(cell / CHUNK_SIZE), top - 1);
      }
    }
  }

  /** Drops a column's tops. Refused (returns false) while any chunk of the column is loaded. */
  removeColumnTops(cx: number, cz: number): boolean {
    const col = columnKey(cx, cz);
    if (this.loadedPerColumn.has(col)) return false;
    this.tops.delete(col);
    this.generatedTops.delete(col);
    return true;
  }

  /**
   * Changes a block and records it as an edit. Returns false (and changes nothing) when its chunk is not loaded
   * or its column has no tops yet. Keeps the column top exact.
   */
  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    const cx = worldToChunk(wx);
    const cy = worldToChunk(wy);
    const cz = worldToChunk(wz);
    const chunk = this.getChunk(cx, cy, cz);
    const tops = this.getColumnTops(cx, cz);
    if (!chunk || !tops) return false;
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    const index = localIndex(lx, worldToLocal(wy), lz);
    if (chunk.blocks[index] === id) return true;
    chunk.blocks[index] = id;
    this.recordEdit(chunkKey(cx, cy, cz), index, id);

    const cell = columnIndex(lx, lz);
    const top = tops[cell]!;
    if (blocksSky(id)) {
      if (wy > top) tops[cell] = wy;
    } else if (wy === top) {
      tops[cell] = this.scanDown(cx, cz, lx, lz, wy - 1);
    }
    const newTop = tops[cell]!;
    this.trackChanges({ chunks: [{ cx, cy, cz }], tops: newTop === top ? [] : [{ cx, cz, lo: Math.min(top, newTop), hi: Math.max(top, newTop) }] });
    return true;
  }

  /**
   * Changes many blocks at once. Records only the cells whose value changes. All or nothing: returns null and changes
   * nothing when any cell's chunk is not loaded or its column has no tops. Otherwise returns what changed.
   */
  setBlocks(writes: readonly CellWrite[]): BatchEffect | null {
    for (const w of writes) {
      if (!this.isLoadedAt(w.x, w.y, w.z) || !this.getColumnTops(worldToChunk(w.x), worldToChunk(w.z))) return null;
    }
    const chunks = new Map<string, { cx: number; cy: number; cz: number }>();
    const spans = new Map<string, { cx: number; cz: number; lo: number; hi: number }>();
    for (const w of writes) {
      const cx = worldToChunk(w.x);
      const cy = worldToChunk(w.y);
      const cz = worldToChunk(w.z);
      const chunk = this.getChunk(cx, cy, cz)!;
      const lx = worldToLocal(w.x);
      const lz = worldToLocal(w.z);
      const index = localIndex(lx, worldToLocal(w.y), lz);
      if (chunk.blocks[index] === w.id) continue;
      chunk.blocks[index] = w.id;
      const key = chunkKey(cx, cy, cz);
      this.recordEdit(key, index, w.id);
      chunks.set(key, { cx, cy, cz });

      const tops = this.getColumnTops(cx, cz)!;
      const cell = columnIndex(lx, lz);
      const oldTop = tops[cell]!;
      if (blocksSky(w.id)) {
        if (w.y > oldTop) tops[cell] = w.y;
      } else if (w.y === oldTop) {
        tops[cell] = this.scanDown(cx, cz, lx, lz, w.y - 1);
      }
      const newTop = tops[cell]!;
      if (newTop !== oldTop) {
        const colKey = columnKey(cx, cz);
        const span = spans.get(colKey) ?? { cx, cz, lo: Infinity, hi: -Infinity };
        span.lo = Math.min(span.lo, oldTop, newTop);
        span.hi = Math.max(span.hi, oldTop, newTop);
        spans.set(colKey, span);
      }
    }
    const effect = { chunks: [...chunks.values()], tops: [...spans.values()] };
    this.trackChanges(effect);
    return effect;
  }

  /** Re-applies stored player edits to a freshly generated chunk. */
  applyEdits(chunk: Chunk): void {
    this.applyEditsTo(chunkKey(chunk.cx, chunk.cy, chunk.cz), chunk.blocks);
  }

  private applyEditsTo(key: string, blocks: Uint16Array): void {
    const chunkEdits = this.editMap.get(key);
    if (!chunkEdits) return;
    for (const [index, id] of chunkEdits) blocks[index] = id;
  }

  private recordEdit(key: string, index: number, id: number): void {
    let chunkEdits = this.editMap.get(key);
    if (!chunkEdits) {
      chunkEdits = new Map();
      this.editMap.set(key, chunkEdits);
      const [cx, , cz] = key.split(',');
      const col = `${cx},${cz}`;
      let set = this.editedChunksByColumn.get(col);
      if (!set) {
        set = new Set();
        this.editedChunksByColumn.set(col, set);
      }
      set.add(key);
    }
    chunkEdits.set(index, id);
    this.dirtyEdits.add(key);
  }

  /**
   * World y of the highest sky-blocking block at or below fromY in one cell. Reads loaded chunks; for chunks that
   * are not loaded, generates them with the fallback (plus saved edits) without adding them to the world.
   */
  private scanDown(cx: number, cz: number, lx: number, lz: number, fromY: number): number {
    const col = columnKey(cx, cz), cell = columnIndex(lx, lz);
    const generated = this.generatedTops.get(col)?.[cell];
    if (generated !== undefined && fromY > generated) {
      // Above the generated skyline only edits can block sky. Jump empty high-altitude
      // gaps rather than exhausting the downward scan before reaching actual terrain.
      let editedTop = NO_TOP;
      for (const key of this.editedChunksByColumn.get(col) ?? []) {
        const cy = Number(key.split(',')[1]);
        for (const [index, id] of this.editMap.get(key)!) {
          if (index % (CHUNK_SIZE * CHUNK_SIZE) !== cell || !blocksSky(id)) continue;
          const y = cy * CHUNK_SIZE + Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
          if (y <= fromY) editedTop = Math.max(editedTop, y);
        }
      }
      if (editedTop > generated) return editedTop;
      if (generated === NO_TOP) return NO_TOP;
      fromY = generated;
    }
    let cy = worldToChunk(fromY);
    let ly = worldToLocal(fromY);
    for (let n = 0; n < TOP_SCAN_CHUNKS; n++, cy--, ly = CHUNK_SIZE - 1) {
      let blocks: Uint16Array | undefined = this.getChunk(cx, cy, cz)?.blocks;
      if (!blocks) {
        blocks = this.fallback(cx, cy, cz);
        this.applyEditsTo(chunkKey(cx, cy, cz), blocks);
      }
      for (; ly >= 0; ly--) if (blocksSky(blocks[localIndex(lx, ly, lz)]!)) return cy * CHUNK_SIZE + ly;
    }
    return NO_TOP;
  }

  hasScheduledTick(x: number, y: number, z: number, reason: string): boolean {
    return this.getChunk(worldToChunk(x), worldToChunk(y), worldToChunk(z))?.ticks.has(x, y, z, reason) ?? false;
  }

  /** Schedule a tick at world coordinates (wx, wy, wz) due at `dueTick`. Returns any handoff to a neighbour chunk. */
  scheduleTick(wx: number, wy: number, wz: number, dueTick: number, reason: string): TickHandoff | null {
    const cx = worldToChunk(wx);
    const cy = worldToChunk(wy);
    const cz = worldToChunk(wz);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) {
      this.parkTick({ x: wx, y: wy, z: wz, delay: Math.max(0, dueTick - this.tickCounter), reason });
      return null;
    }
    return chunk.ticks.schedule({ x: wx, y: wy, z: wz, dueTick, reason }, cx, cy, cz);
  }

  /**
   * Run one tick step with a shared world budget and rotating chunk fairness; ticks past the
   * budget wait for the next step. Handoff ticks (cells at a chunk border) are re-scheduled in the
   * neighbour's queue. Returns { ran, pending } stats.
   */
  tickStep(budgetMs: number): { ran: number; pending: number } {
    this.tickCounter++;
    let ran = 0;
    const start = performance.now();
    const chunks = this.tickChunks();
    let visited = 0;
    while (visited < chunks.length && performance.now() - start < budgetMs) {
      const chunk = chunks[this.tickCursor % chunks.length]!;
      this.tickCursor = (this.tickCursor + 1) % chunks.length;
      visited++;
      if (chunk.ticks.isEmpty) continue;
      const { handedOff, ran: r } = chunk.ticks.run(this.tickCounter, Math.max(0, budgetMs - (performance.now() - start)), (tick, world) => handleTick(world as World, tick), this);
      ran += r;
      // Re-schedule border handoffs in the neighbour chunk's queue.
      for (const t of handedOff) {
        const tcx = worldToChunk(t.x);
        const tcy = worldToChunk(t.y);
        const tcz = worldToChunk(t.z);
        const target = this.getChunk(tcx, tcy, tcz);
        if (target) {
          target.ticks.schedule(t, tcx, tcy, tcz);
        }
        else this.scheduleTick(t.x, t.y, t.z, t.dueTick, t.reason);
      }
    }

    return { ran, pending: this.pendingTickCount };
  }

  /** Queues a block the physics broke (a collapse), for the game to spawn as an item. */
  queueDrop(id: number, x: number, y: number, z: number, body = false): void {
    this.droppedBlocks.push({ id, x, y, z, body });
  }

  /** Returns and clears the blocks the physics broke since the last call. */
  takeDrops(): DroppedBlock[] {
    return this.droppedBlocks.splice(0);
  }

  /** Current global tick number. */
  get currentTick(): number { return this.tickCounter; }

  /**
   * Run one random-tick pass over all loaded chunks within `budgetMs`. Each chunk draws
   * RANDOM_TICKS_PER_CHUNK cells (deterministically, from seed + tick + chunk) and the
   * ecology handler runs on each. Returns how many cells were visited and how long it took.
   */
  randomTickStep(budgetMs: number, handler: typeof handleRandomTick = handleRandomTick): { ran: number; ms: number } {
    const start = performance.now();
    let ran = 0;
    const chunks = this.tickChunks();
    for (let visited = 0; visited < chunks.length; visited++) {
      if (performance.now() - start >= budgetMs) break;
      const chunk = chunks[this.randomCursor % chunks.length]!;
      this.randomCursor = (this.randomCursor + 1) % chunks.length;
      forEachRandomCell(this.seed, this.tickCounter, chunk.cx, chunk.cy, chunk.cz, RANDOM_TICKS_PER_CHUNK, (wx, wy, wz, rng) => {
        handler(this, wx, wy, wz, rng);
        ran++;
      });
    }
    return { ran, ms: performance.now() - start };
  }

  /** Total number of pending ticks across all loaded chunks. */
  get pendingTickCount(): number {
    let n = 0;
    for (const chunk of this.chunks()) n += chunk.ticks.size;
    return n;
  }
}
