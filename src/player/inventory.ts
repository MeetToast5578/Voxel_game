import { HOTBAR_SIZE, INVENTORY_SIZE, MAX_STACK, STARTING_STACK } from '../config';
import { mod } from '../core/math';
import { BLOCK_STATE_COUNT, BlockId } from '../world/blocks';

export const DEFAULT_HOTBAR: readonly number[] = [
  BlockId.STONE,
  BlockId.DIRT,
  BlockId.GRASS,
  BlockId.COBBLESTONE,
  BlockId.PLANKS,
  BlockId.LOG,
  BlockId.GLOWSTONE,
  BlockId.GLASS,
  BlockId.BRICK,
];

/** A number of one block state. Counts run from 1 to MAX_STACK. */
export interface ItemStack {
  state: number;
  count: number;
}

/** The slots of a new world: the default hotbar, a full stack of each block, and an empty grid. */
export function startingSlots(): (ItemStack | null)[] {
  const slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  DEFAULT_HOTBAR.forEach((state, i) => {
    slots[i] = { state, count: STARTING_STACK };
  });
  return slots;
}

/**
 * The player's items: INVENTORY_SIZE slots, where slots 0 to HOTBAR_SIZE-1 are the hotbar, and the selected hotbar slot.
 * Pure; the UI and the game call its methods.
 */
export class Inventory {
  readonly slots: (ItemStack | null)[];
  selected = 0;

  constructor(slots: readonly (ItemStack | null)[] = startingSlots()) {
    if (slots.length !== INVENTORY_SIZE) throw new Error(`Inventory needs exactly ${INVENTORY_SIZE} slots`);
    this.slots = slots.map((s) => (s ? { ...s } : null));
  }

  /** The stack in the selected hotbar slot, or null when it is empty. */
  get selectedStack(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  /** The block state in the selected hotbar slot, or air when it is empty. */
  get selectedBlock(): number {
    return this.selectedStack?.state ?? BlockId.AIR;
  }

  /** index 0..8; anything else is ignored. */
  select(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < HOTBAR_SIZE) this.selected = index;
  }

  /** steps > 0 moves right, steps < 0 moves left; wraps around. */
  scroll(steps: number): void {
    this.selected = mod(this.selected + steps, HOTBAR_SIZE);
  }

  /** Puts a full stack of a block state into a slot. An invalid index, air or an unregistered state is ignored. */
  setSlot(index: number, state: number, count = MAX_STACK): void {
    if (!Number.isInteger(index) || index < 0 || index >= INVENTORY_SIZE) return;
    if (!validState(state)) return;
    this.slots[index] = { state, count: Math.min(count, MAX_STACK) };
  }

  /** Adds count items of a block state, filling existing stacks first. Returns how many did not fit. */
  add(state: number, count = 1): number {
    return validState(state) ? this.fill(state, count, -1) : count;
  }

  /** Takes one item from the selected slot. Returns false when that slot is empty. */
  consumeSelected(): boolean {
    const stack = this.selectedStack;
    if (!stack) return false;
    stack.count -= 1;
    if (stack.count === 0) this.slots[this.selected] = null;
    return true;
  }

  /** How many items of a block state the whole inventory holds. */
  count(state: number): number {
    return this.slots.reduce((n, s) => (s?.state === state ? n + s.count : n), 0);
  }

  /**
   * Takes count items of a block state from any slots, hotbar first. Returns false, changing nothing, when the
   * inventory holds fewer than count.
   */
  consume(state: number, count: number): boolean {
    if (count < 0 || this.count(state) < count) return false;
    let left = count;
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.state !== state) continue;
      const taken = Math.min(left, s.count);
      s.count -= taken;
      left -= taken;
      if (s.count === 0) this.slots[i] = null;
    }
    return true;
  }

  /**
   * A click on a slot while `cursor` is held (or null). Returns the new cursor. An empty cursor takes the stack; a
   * cursor puts down into an empty slot, merges into the same block (up to MAX_STACK, the rest stays held), or swaps
   * with a different block.
   */
  clickSlot(index: number, cursor: ItemStack | null): ItemStack | null {
    if (!Number.isInteger(index) || index < 0 || index >= INVENTORY_SIZE) return cursor;
    const slot = this.slots[index] ?? null;
    if (!cursor) {
      this.slots[index] = null;
      return slot;
    }
    if (!slot) {
      this.slots[index] = cursor;
      return null;
    }
    if (slot.state !== cursor.state) {
      this.slots[index] = cursor;
      return slot;
    }
    const moved = Math.min(cursor.count, MAX_STACK - slot.count);
    slot.count += moved;
    const rest = cursor.count - moved;
    return rest > 0 ? { state: cursor.state, count: rest } : null;
  }

  /**
   * "Pick block": select the hotbar slot holding `state`. Otherwise a full stack of it replaces the selected slot, and
   * the stack that was there moves into the grid (if it does not fit, nothing is replaced).
   */
  pick(state: number): void {
    if (!validState(state)) return;
    const hotbar = this.slots.findIndex((s, i) => i < HOTBAR_SIZE && s?.state === state);
    if (hotbar >= 0) {
      this.selected = hotbar;
      return;
    }
    const old = this.slots[this.selected] ?? null;
    this.slots[this.selected] = null;
    const left = old ? this.fill(old.state, old.count, this.selected) : 0;
    if (left > 0) {
      this.slots[this.selected] = { state: old!.state, count: left };
      return;
    }
    this.slots[this.selected] = { state, count: MAX_STACK };
  }

  /** Adds to existing stacks of the state, then to empty slots (not slot `skip`). Returns the leftover. */
  private fill(state: number, count: number, skip: number): number {
    let left = count;
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      const s = this.slots[i];
      if (i === skip || !s || s.state !== state || s.count >= MAX_STACK) continue;
      const moved = Math.min(left, MAX_STACK - s.count);
      s.count += moved;
      left -= moved;
    }
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      if (i === skip || this.slots[i]) continue;
      const moved = Math.min(left, MAX_STACK);
      this.slots[i] = { state, count: moved };
      left -= moved;
    }
    return left;
  }
}

function validState(state: number): boolean {
  return Number.isInteger(state) && state > BlockId.AIR && state < BLOCK_STATE_COUNT;
}
