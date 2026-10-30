import { chunkKey, toChunk } from '../core/coords';

/** What a scheduled tick does when it comes due. */
export const enum TickKind {
  Flow = 0,
  Fall = 1,
  Support = 2,
  Decay = 3,
}

export interface Tick {
  due: number;
  x: number;
  y: number;
  z: number;
  kind: TickKind;
}

/** A tick as saved: remaining delay instead of a due time. */
export type SavedTick = [x: number, y: number, z: number, kind: number, delay: number];

/**
 * Scheduled block updates at the simulation rate. Ticks in unloaded chunks wait, with their remaining delay, until
 * the chunk loads again. One tick per cell and kind: scheduling again keeps the earlier one.
 */
export class TickScheduler {
  now = 0;
  private heap: Tick[] = [];
  private readonly keys = new Set<string>();
  /** Ticks of unloaded chunks, by chunk key, with remaining delays. */
  private readonly dormant = new Map<number, SavedTick[]>();

  get size(): number {
    return this.heap.length;
  }

  get dormantCount(): number {
    let n = 0;
    for (const list of this.dormant.values()) n += list.length;
    return n;
  }

  schedule(x: number, y: number, z: number, kind: TickKind, delay: number): void {
    const id = `${x},${y},${z},${kind}`;
    if (this.keys.has(id)) return;
    this.keys.add(id);
    this.push({ due: this.now + Math.max(1, Math.round(delay)), x, y, z, kind });
  }

  /** Removes and returns the ticks due by now, in due order (ties by insertion order is not guaranteed). */
  takeDue(limit = Infinity): Tick[] {
    const out: Tick[] = [];
    while (this.heap.length > 0 && this.heap[0]!.due <= this.now && out.length < limit) {
      const t = this.pop();
      this.keys.delete(`${t.x},${t.y},${t.z},${t.kind}`);
      out.push(t);
    }
    return out;
  }

  /** Moves the ticks of a chunk that is unloading aside, keeping their remaining delays. */
  park(cx: number, cy: number, cz: number): void {
    const keep: Tick[] = [], parked: SavedTick[] = [];
    for (const t of this.heap) {
      if (toChunk(t.x) === cx && toChunk(t.y) === cy && toChunk(t.z) === cz) {
        parked.push([t.x, t.y, t.z, t.kind, t.due - this.now]);
        this.keys.delete(`${t.x},${t.y},${t.z},${t.kind}`);
      } else keep.push(t);
    }
    if (parked.length === 0) return;
    const key = chunkKey(cx, cy, cz);
    this.dormant.set(key, [...(this.dormant.get(key) ?? []), ...parked]);
    this.heap = [];
    for (const t of keep) this.push(t);
  }

  /** Resumes the parked ticks of a chunk that loaded. */
  resume(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    const list = this.dormant.get(key);
    if (!list) return;
    this.dormant.delete(key);
    for (const [x, y, z, kind, delay] of list) this.schedule(x, y, z, kind as TickKind, delay);
  }

  /** Every pending tick, loaded or parked, for saving. */
  save(): SavedTick[] {
    const out: SavedTick[] = this.heap.map((t) => [t.x, t.y, t.z, t.kind, t.due - this.now]);
    for (const list of this.dormant.values()) out.push(...list);
    return out;
  }

  /** Restores saved ticks as parked; they resume when their chunks load. Malformed entries are skipped. */
  load(ticks: unknown): void {
    if (!Array.isArray(ticks)) return;
    for (const t of ticks) {
      if (!Array.isArray(t) || t.length !== 5 || !t.every((v) => Number.isSafeInteger(v)) || t[3] < 0 || t[3] > 3) continue;
      const [x, y, z, kind, delay] = t as SavedTick;
      const key = chunkKey(toChunk(x), toChunk(y), toChunk(z));
      const list = this.dormant.get(key) ?? [];
      list.push([x, y, z, kind, Math.max(1, delay)]);
      this.dormant.set(key, list);
    }
  }

  private push(t: Tick): void {
    const h = this.heap;
    h.push(t);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]!.due <= t.due) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = t;
  }

  private pop(): Tick {
    const h = this.heap;
    const top = h[0]!;
    const last = h.pop()!;
    const n = h.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, due = last.due;
        if (l < n && h[l]!.due < due) { m = l; due = h[l]!.due; }
        if (r < n && h[r]!.due < due) m = r;
        if (m === i) break;
        h[i] = h[m]!;
        i = m;
      }
      h[i] = last;
    }
    return top;
  }
}
