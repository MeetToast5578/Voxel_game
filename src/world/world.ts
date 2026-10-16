import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { chunkKey, columnIndex, columnKey, localIndex, worldToChunk, worldToLocal } from '../core/coords';
import { BlockId, blocksSky } from './blocks';
import { Chunk } from './chunk';
import { type TickHandoff } from './tick';

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

export class World {
  readonly seed: number;
  private readonly chunkMap = new Map<string, Chunk>();
  /** Player edits: chunkKey -> (localIndex -> block state). Survives chunk unloading. */
  private readonly editMap = new Map<string, Map<number, number>>();
  /** Chunk keys whose edits changed since the last takeDirtyEdits (what the next save must write). */
  private readonly dirtyEdits = new Set<string>();
  /** columnKey -> chunk keys in that column that have edits. */
  private readonly editedChunksByColumn = new Map<string, Set<string>>();
  /** columnKey -> world y of the highest sky-blocking block per cell (index lz * 16 + lx). */
  private readonly tops = new Map<string, Int32Array>();
  /** columnKey -> number of loaded chunks in that column. */
  private readonly loadedPerColumn = new Map<string, number>();
  /** Global tick counter, incremented once per tickStep. */
  private tickCounter = 0;

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
    const col = columnKey(chunk.cx, chunk.cz);
    this.loadedPerColumn.set(col, (this.loadedPerColumn.get(col) ?? 0) + 1);
  }

  removeChunk(cx: number, cy: number, cz: number): void {
    if (!this.chunkMap.delete(chunkKey(cx, cy, cz))) return;
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
    chunk.blocks[index] = id;
    this.recordEdit(chunkKey(cx, cy, cz), index, id);

    const cell = columnIndex(lx, lz);
    const top = tops[cell]!;
    if (blocksSky(id)) {
      if (wy > top) tops[cell] = wy;
    } else if (wy === top) {
      tops[cell] = this.scanDown(cx, cz, lx, lz, wy - 1);
    }
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
    return { chunks: [...chunks.values()], tops: [...spans.values()] };
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

  /** Schedule a tick at world coordinates (wx, wy, wz) due at `dueTick`. Returns any handoff to a neighbour chunk. */
  scheduleTick(wx: number, wy: number, wz: number, dueTick: number, reason: string): TickHandoff | null {
    const cx = worldToChunk(wx);
    const cy = worldToChunk(wy);
    const cz = worldToChunk(wz);
    const chunk = this.getChunk(cx, cy, cz);
    if (!chunk) return null;
    return chunk.ticks.schedule({ x: wx, y: wy, z: wz, dueTick, reason }, cx, cy, cz);
  }

  /**
   * Run one tick step over all loaded chunks. Each chunk's queue runs up to `budgetMs`; ticks past the
   * budget wait for the next step. Handoff ticks (cells at a chunk border) are re-scheduled in the
   * neighbour's queue. Returns { ran, pending } stats.
   */
  tickStep(budgetMs: number): { ran: number; pending: number } {
    this.tickCounter++;
    let ran = 0;
    let pending = 0;

    for (const chunk of this.chunks()) {
      const { handedOff, ran: r } = chunk.ticks.run(this.tickCounter, budgetMs, () => 'handled');
      ran += r;
      pending += chunk.ticks.size;
      // Re-schedule border handoffs in the neighbour chunk's queue.
      for (const t of handedOff) {
        const tcx = worldToChunk(t.x);
        const tcy = worldToChunk(t.y);
        const tcz = worldToChunk(t.z);
        const target = this.getChunk(tcx, tcy, tcz);
        if (target) {
          target.ticks.schedule(t, tcx, tcy, tcz);
          pending += 1;
        }
        // If the neighbour isn't loaded, the handoff is dropped.
      }
    }

    return { ran, pending };
  }

  /** Current global tick number. */
  get currentTick(): number { return this.tickCounter; }

  /** Total number of pending ticks across all loaded chunks. */
  get pendingTickCount(): number {
    let n = 0;
    for (const chunk of this.chunks()) n += chunk.ticks.size;
    return n;
  }
}
