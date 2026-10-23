import { EDIT_CELLS_PER_STEP, UNDO_LIMIT } from '../config';
import { worldToChunk } from '../core/coords';
import { BlockId, isWaterState } from './blocks';
import { scheduleFallChecks } from './falling';
import { collapsible, scheduleSupportChecks } from './collapse';
import { scheduleFlowChecks } from './flow';
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
  kind: 'edit' | 'undo' | 'redo';
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
  private readonly redos: number[][] = [];

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

  get redoCount(): number { return this.redos.length; }

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
    return this.restore('undo', this.undos);
  }

  /** Replays only cells actually undone and still unchanged, under the same per-step budget. */
  redo(): boolean {
    if (this.job || this.redos.length === 0) return false;
    return this.restore('redo', this.redos);
  }

  private restore(kind: 'undo' | 'redo', history: number[][]): boolean {
    const record = history[history.length - 1]!;
    const cells: JobCell[] = [];
    for (let i = 0; i < record.length; i += 5) {
      const x = record[i]!, y = record[i + 1]!, z = record[i + 2]!;
      if (!this.loaded({ x, y, z })) return false;
      // Each replay reverses the preceding action, whether edit, undo or redo.
      cells.push({ x, y, z, id: record[i + 3]!, clear: false, expect: record[i + 4]! });
    }
    history.pop();
    this.job = { kind, cells, next: 0, applied: [] };
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
      // Sand or gravel that a volume edit left unsupported falls, as it does after a single-block edit.
      for (let i = 0; i < changed.length; i += 5) {
        const x = changed[i]!;
        const y = changed[i + 1]!;
        const z = changed[i + 2]!;
        scheduleFallChecks(this.world, x, y, z);
        scheduleFlowChecks(this.world, x, y, z);
        // A removed block may have been holding up its neighbours (spec 25, slice 5).
        if (changed[i + 4] === BlockId.AIR && collapsible(changed[i + 3]!)) scheduleSupportChecks(this.world, x, y, z);
      }
    }
    if (job.next >= job.cells.length) this.finish(job);
  }

  private accepts(kind: Job['kind'], current: number, c: JobCell): boolean {
    if (kind !== 'edit') return current === c.expect;
    if (c.clear) return current !== BlockId.AIR && this.breakable(current);
    return current === BlockId.AIR || isWaterState(current);
  }

  private finish(job: Job): void {
    this.job = null;
    if (job.applied.length === 0) return;
    if (job.kind === 'edit') this.redos.length = 0;
    const history = job.kind === 'undo' ? this.redos : this.undos;
    history.push(job.applied);
    if (history.length > UNDO_LIMIT) history.shift();
  }

  private loaded(c: { x: number; y: number; z: number }): boolean {
    return this.world.isLoadedAt(c.x, c.y, c.z) && this.world.getColumnTops(worldToChunk(c.x), worldToChunk(c.z)) !== undefined;
  }
}
