import { EDIT_CELLS_PER_STEP, UNDO_LIMIT } from '../config';
import { worldToChunk } from '../core/coords';
import { BlockId } from './blocks';
import type { ChunkManager } from './chunkManager';
import type { CellWrite, World } from './world';

/** A cell to change: set it to `id`. A fill (clear false) only replaces air and water; a clear (clear true) only removes breakable blocks. */
export interface EditCell {
  x: number;
  y: number;
  z: number;
  id: number;
  clear: boolean;
}

/** A cell of a running job. For undo, `expect` is the state the cell must still hold. */
interface JobCell extends EditCell {
  expect: number;
}

interface Job {
  kind: 'edit' | 'undo';
  cells: JobCell[];
  next: number;
  /** x, y, z, before, after for each cell actually changed. */
  applied: number[];
}

/**
 * Applies volume actions a few thousand cells per step, so a large volume spans several frames, and keeps the last
 * UNDO_LIMIT actions in memory for undo. One action runs at a time. Pure: the world and the chunk manager are passed in.
 */
export class EditQueue {
  private job: Job | null = null;
  /** Each undo record is flat: x, y, z, before, after for each changed cell. */
  private readonly undos: number[][] = [];

  constructor(
    private readonly world: World,
    private readonly chunks: ChunkManager,
    private readonly breakable: (id: number) => boolean,
  ) {}

  get busy(): boolean {
    return this.job !== null;
  }

  get undoCount(): number {
    return this.undos.length;
  }

  /**
   * Starts an action over these cells, fills and clears together. Refused, returning false, while another action runs,
   * when there are no cells, or when any cell is not in loaded terrain.
   */
  start(cells: readonly EditCell[]): boolean {
    if (this.job || cells.length === 0 || !cells.every((c) => this.loaded(c))) return false;
    this.job = { kind: 'edit', cells: cells.map((c) => ({ ...c, expect: -1 })), next: 0, applied: [] };
    return true;
  }

  /** Starts undo of the last action. Refused when busy, when there is nothing to undo, or when its cells are not loaded. */
  undo(): boolean {
    if (this.job || this.undos.length === 0) return false;
    const record = this.undos[this.undos.length - 1]!;
    const cells: JobCell[] = [];
    for (let i = 0; i < record.length; i += 5) {
      const x = record[i]!;
      const y = record[i + 1]!;
      const z = record[i + 2]!;
      if (!this.loaded({ x, y, z })) return false;
      cells.push({ x, y, z, id: record[i + 3]!, clear: false, expect: record[i + 4]! });
    }
    this.undos.pop();
    this.job = { kind: 'undo', cells, next: 0, applied: [] };
    return true;
  }

  /** Applies the next EDIT_CELLS_PER_STEP cells of the running action. Call once per fixed step. */
  step(): void {
    const job = this.job;
    if (!job) return;
    const end = Math.min(job.cells.length, job.next + EDIT_CELLS_PER_STEP);
    const writes: CellWrite[] = [];
    const changed: number[] = [];
    for (; job.next < end; job.next++) {
      const c = job.cells[job.next]!;
      const current = this.world.getBlock(c.x, c.y, c.z);
      if (current === c.id || !this.accepts(job.kind, current, c)) continue;
      writes.push({ x: c.x, y: c.y, z: c.z, id: c.id });
      changed.push(c.x, c.y, c.z, current, c.id);
    }
    if (writes.length > 0) {
      const effect = this.world.setBlocks(writes);
      if (effect === null) {
        // A chunk unloaded under the action: keep what was applied, and drop the rest.
        this.finish(job);
        return;
      }
      this.chunks.onBlocksChanged(effect);
      for (const v of changed) job.applied.push(v);
    }
    if (job.next >= job.cells.length) this.finish(job);
  }

  private accepts(kind: Job['kind'], current: number, c: JobCell): boolean {
    if (kind === 'undo') return current === c.expect;
    if (c.clear) return current !== BlockId.AIR && this.breakable(current);
    return current === BlockId.AIR || current === BlockId.WATER;
  }

  private finish(job: Job): void {
    this.job = null;
    if (job.kind === 'undo' || job.applied.length === 0) return;
    this.undos.push(job.applied);
    if (this.undos.length > UNDO_LIMIT) this.undos.shift();
  }

  private loaded(c: { x: number; y: number; z: number }): boolean {
    return this.world.isLoadedAt(c.x, c.y, c.z) && this.world.getColumnTops(worldToChunk(c.x), worldToChunk(c.z)) !== undefined;
  }
}
