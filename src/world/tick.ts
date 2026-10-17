import { CHUNK_SIZE } from '../config';
import { floorDiv } from '../core/math';

/** A scheduled tick: a world cell to update at or after `dueTick`, for a given `reason`. */
export interface Tick {
  x: number; // world x
  y: number; // world y
  z: number; // world z
  dueTick: number; // tick number when this becomes due
  reason: string; // why it was scheduled (e.g. 'falling-sand', 'fluid-flow')
}

export type TickResult = 'handled' | 'handoff' | 'skip';

/** Handoff target: a tick that belongs in a neighbouring chunk's queue. */
export interface TickHandoff {
  cx: number;
  cy: number;
  cz: number;
  tick: Tick;
}

function compareTicks(a: Tick, b: Tick): number {
  if (a.dueTick !== b.dueTick) return a.dueTick - b.dueTick;
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.z - b.z;
}

/** A per-chunk queue of scheduled ticks. Runs in fixed order: due tick, then cell position. */
export class TickQueue {
  private ticks: Tick[] = [];

  /** Schedule a tick in this chunk. Returns a handoff when the cell lies outside this chunk. */
  schedule(tick: Tick, cx: number, cy: number, cz: number): TickHandoff | null {
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    if (
      tick.x < x0 || tick.x >= x0 + CHUNK_SIZE ||
      tick.y < y0 || tick.y >= y0 + CHUNK_SIZE ||
      tick.z < z0 || tick.z >= z0 + CHUNK_SIZE
    ) {
      return {
        cx: floorDiv(tick.x, CHUNK_SIZE),
        cy: floorDiv(tick.y, CHUNK_SIZE),
        cz: floorDiv(tick.z, CHUNK_SIZE),
        tick,
      };
    }
    this.ticks.push(tick);
    this.ticks.sort(compareTicks);
    return null;
  }

  /**
   * Run all due ticks up to the time budget. `handle` is called for each due tick
   * with `ctx` as context and returns 'handled', 'handoff', or 'skip'. Handoff ticks
   * are returned so the caller can re-schedule them in the neighbouring chunk's queue.
   */
  run<T>(
    nowTick: number,
    budgetMs: number,
    handle: (tick: Tick, ctx: T) => TickResult,
    ctx: T,
  ): { handedOff: Tick[]; ran: number } {
    const start = performance.now();
    const handedOff: Tick[] = [];
    let ran = 0;
    const kept: Tick[] = [];
    // Work in rounds. A handler may schedule into this queue while it runs; those ticks wait in this.ticks, which is
    // emptied before each round, so the round being iterated is never re-sorted under the loop. A tick scheduled
    // for now runs in the next round of this same step, if the budget allows.
    let round = this.ticks;
    this.ticks = [];
    while (round.length > 0) {
      for (const tick of round) {
        if (tick.dueTick > nowTick || performance.now() - start >= budgetMs) {
          kept.push(tick);
          continue;
        }
        const result = handle(tick, ctx);
        ran++;
        if (result === 'handoff') {
          handedOff.push(tick);
        }
      }
      round = this.ticks;
      this.ticks = [];
    }

    this.ticks = kept.concat(this.ticks).sort(compareTicks);
    return { handedOff, ran };
  }

  get size(): number { return this.ticks.length; }
  get isEmpty(): boolean { return this.ticks.length === 0; }
}
