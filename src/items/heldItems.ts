/**
 * What the player has picked up, counted per block state (spec 23). Pure. Not saved yet: stacks and the inventory
 * screen come with roadmap phase 7 item 4.
 */
export class HeldItems {
  private readonly counts = new Map<number, number>();

  add(blockId: number): void {
    this.counts.set(blockId, this.count(blockId) + 1);
  }

  count(blockId: number): number {
    return this.counts.get(blockId) ?? 0;
  }

  get total(): number {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }

  /** [blockId, count] pairs, sorted by block id, for display. */
  entries(): [number, number][] {
    return [...this.counts].sort((a, b) => a[0] - b[0]);
  }
}
