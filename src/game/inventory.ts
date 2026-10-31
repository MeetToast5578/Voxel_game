import { BLOCKS } from '../engine/blocks';

/** Items in one slot: a block or item state, how many, and for tools how many uses are spent. */
export interface ItemStack {
  state: number;
  count: number;
  wear?: number;
}

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export function maxStack(state: number): number {
  return BLOCKS.type(state).maxStack ?? 64;
}

/** Whether two stacks hold the same thing (and so can merge). Worn tools never merge. */
export function sameKind(a: ItemStack, b: ItemStack): boolean {
  return a.state === b.state && !a.wear && !b.wear && maxStack(a.state) > 1;
}

/**
 * A click on slot `i` of `slots` with `cursor` held (as in Minecraft): a left click picks up, puts down, merges or swaps;
 * a right click takes half or puts down one. Returns the new cursor.
 */
export function clickSlot(slots: (ItemStack | null)[], i: number, cursor: ItemStack | null, right = false): ItemStack | null {
  const slot = slots[i] ?? null;
  if (!cursor) {
    if (!slot) return null;
    if (right) {
      const take = Math.ceil(slot.count / 2);
      slot.count -= take;
      if (slot.count === 0) slots[i] = null;
      return { ...slot, count: take };
    }
    slots[i] = null;
    return slot;
  }
  if (!slot) {
    if (right) {
      slots[i] = { ...cursor, count: 1 };
      return cursor.count > 1 ? { ...cursor, count: cursor.count - 1 } : null;
    }
    slots[i] = cursor;
    return null;
  }
  if (sameKind(slot, cursor)) {
    const room = maxStack(slot.state) - slot.count;
    const move = Math.min(room, right ? 1 : cursor.count);
    slot.count += move;
    return cursor.count - move > 0 ? { ...cursor, count: cursor.count - move } : null;
  }
  slots[i] = cursor;
  return slot;
}

/** The player's 36 slots; the first 9 are the hotbar. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;

  get held(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  /** Adds items, filling matching stacks first, then empty slots (hotbar first). Returns how many did not fit. */
  add(stack: ItemStack): number {
    let left = stack.count;
    const cap = maxStack(stack.state);
    for (const s of this.slots) {
      if (left === 0) break;
      if (s && sameKind(s, stack) && s.count < cap) {
        const move = Math.min(cap - s.count, left);
        s.count += move;
        left -= move;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const move = Math.min(cap, left);
      this.slots[i] = { state: stack.state, count: move, ...(stack.wear ? { wear: stack.wear } : {}) };
      left -= move;
    }
    return left;
  }

  /** Takes one of the held item (a block placed, food eaten). */
  useHeld(): void {
    const s = this.held;
    if (!s) return;
    if (--s.count <= 0) this.slots[this.selected] = null;
  }

  count(state: number): number {
    return this.slots.reduce((n, s) => n + (s && s.state === state ? s.count : 0), 0);
  }

  clear(): void {
    this.slots.fill(null);
  }

  /** For saving: [stateName, count, wear] per slot, or null. */
  save(): ([string, number, number] | null)[] {
    return this.slots.map((s) => (s ? [BLOCKS.stateName(s.state), s.count, s.wear ?? 0] : null));
  }

  /** Restores a saved inventory; anything unknown or malformed is dropped. */
  load(saved: unknown): void {
    this.clear();
    if (!Array.isArray(saved)) return;
    saved.slice(0, INVENTORY_SIZE).forEach((e, i) => {
      if (!Array.isArray(e) || typeof e[0] !== 'string') return;
      const state = BLOCKS.parseStateName(e[0]);
      const count = Math.floor(Number(e[1]));
      if (state === null || !(count > 0)) return;
      const wear = Math.max(0, Math.floor(Number(e[2]) || 0));
      this.slots[i] = { state, count: Math.min(count, maxStack(state)), ...(wear ? { wear } : {}) };
    });
  }
}
