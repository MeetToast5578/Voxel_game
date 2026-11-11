import { modFromIndex, modIndex } from './modifiers';
import { BLOCKS } from '../engine/blocks';

/** Items in one slot: a block or item state, how many, and for tools how many uses are spent. */
export interface ItemStack {
  state: number;
  count: number;
  wear?: number;
  /** Ember forge upgrade level, 0–3. */
  upgrade?: number;
  /** A weapon's modifier (see modifiers.ts). */
  mod?: string;
}

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export function maxStack(state: number): number {
  return BLOCKS.type(state).maxStack ?? 64;
}

/** Whether two stacks hold the same thing (and so can merge). Worn tools never merge. */
export function sameKind(a: ItemStack, b: ItemStack): boolean {
  return a.state === b.state && (a.upgrade??0)===(b.upgrade??0) && !a.wear && !b.wear && maxStack(a.state) > 1;
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
      this.slots[i] = { ...stack, count: move };
      left -= move;
    }
    return left;
  }

  /** Takes one held item; placing can refill a depleted block stack from the backpack. */
  useHeld(refill = false): void {
    const s = this.held;
    if (!s) return;
    if (--s.count <= 0) {
      this.slots[this.selected] = null;
      if (refill && !BLOCKS.type(s.state).item && maxStack(s.state) > 1) {
        const next = this.slots.findIndex((stack, i) => i >= HOTBAR_SIZE && stack !== null && sameKind(stack, s));
        if (next >= 0) {
          this.slots[this.selected] = this.slots[next]!;
          this.slots[next] = null;
        }
      }
    }
  }

  count(state: number): number {
    return this.slots.reduce((n, s) => n + (s && s.state === state ? s.count : 0), 0);
  }

  clear(): void {
    this.slots.fill(null);
  }

  /** For saving: [stateName, count, wear] per slot, or null. */
  save(): ([string, number, number, number, number] | null)[] {
    return this.slots.map((s) => (s ? [BLOCKS.stateName(s.state), s.count, s.wear ?? 0, s.upgrade ?? 0, modIndex(s.mod)] : null));
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
      this.slots[i] = { state, count: Math.min(count, maxStack(state)), ...(wear ? { wear } : {}), ...(Number(e[3]) > 0 ? { upgrade: Math.min(3, Math.floor(Number(e[3]))) } : {}), ...(modFromIndex(e[4]) ? { mod: modFromIndex(e[4]) } : {}) };
    });
  }
}

/** Merge into a destination range, then empty slots. Returns the count that could not fit. */
export function insertStack(slots:(ItemStack|null)[],stack:ItemStack,from=0,to=slots.length):number {
  let left=stack.count;const cap=maxStack(stack.state);
  for(let i=from;i<to&&left>0;i++){
    const s=slots[i];if(!s||!sameKind(s,stack))continue;
    const moved=Math.max(0,Math.min(left,cap-s.count));s.count+=moved;left-=moved;
  }
  for(let i=from;i<to&&left>0;i++)if(!slots[i]){const moved=Math.min(left,cap);slots[i]={...stack,count:moved};left-=moved;}
  return left;
}
/** Transfer only what fits, preserving source remainder and equipment metadata. */
export function moveStack(source:(ItemStack|null)[],index:number,target:(ItemStack|null)[],from=0,to=target.length):number {
  const s=source[index];if(!s)return 0;
  // Never transfer into the source slot when moving between hotbar and backpack.
  if(source===target&&index>=from&&index<to)return 0;
  const left=insertStack(target,s,from,to),moved=s.count-left;
  if(moved){if(left)s.count=left;else source[index]=null;}
  return moved;
}
/** Output slots permit withdrawal only; a full/mismatched cursor leaves output untouched. */
export function takeOutput(source:ItemStack|null,cursor:ItemStack|null,right=false):{source:ItemStack|null;cursor:ItemStack|null} {
  if(!source)return {source,cursor};
  if(cursor&&!sameKind(cursor,source))return {source,cursor};
  const room=maxStack(source.state)-(cursor?.count??0),count=Math.max(0,Math.min(room,right?1:source.count));
  if(!count)return {source,cursor};
  return {source:source.count>count?{...source,count:source.count-count}:null,cursor:cursor?{...cursor,count:cursor.count+count}:{...source,count}};
}
