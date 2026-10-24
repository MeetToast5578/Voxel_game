import { SMELT_S } from '../config';
import { getBlockDef, parseBlockStateName } from '../world/blocks';
import { clickStack, maxStackOf, type ItemStack } from './inventory';

/** What a furnace turns each input into (T-I7), by block key. */
export const SMELTING: Readonly<Record<string, string>> = {
  iron_ore: 'iron_ingot',
  sand: 'glass',
  cobblestone: 'stone',
  clay: 'brick',
  log: 'coal',
  potatoes: 'baked_potato',
};

/** Seconds of burning one item of each fuel gives, by block key. */
export const FUEL_S: Readonly<Record<string, number>> = {
  coal: 80,
  log: 15,
  fallen_log_x: 15,
  fallen_log_z: 15,
  planks: 15,
  crafting_table: 15,
  stick: 5,
};

/** The smelted state of `state`, or null. Only the first state of a type smelts (a seed potato, not a growing one). */
export function smeltResult(state: number): number | null {
  const def = getBlockDef(state);
  const out = def.id === state ? SMELTING[def.key] : undefined;
  return out === undefined ? null : parseBlockStateName(out);
}

export function fuelSeconds(state: number): number {
  return FUEL_S[getBlockDef(state).key] ?? 0;
}

/** One furnace's slots and timers: input, fuel and output, the burn left and the cooking progress, in seconds. */
export interface FurnaceState {
  slots: [input: ItemStack | null, fuel: ItemStack | null, output: ItemStack | null];
  burnS: number;
  burnTotalS: number;
  cookS: number;
}

export const newFurnace = (): FurnaceState => ({ slots: [null, null, null], burnS: 0, burnTotalS: 0, cookS: 0 });

function canSmelt(f: FurnaceState): number | null {
  const [input, , output] = f.slots;
  const result = input ? smeltResult(input.state) : null;
  if (result === null) return null;
  return !output || (output.state === result && output.count < maxStackOf(result)) ? result : null;
}

/**
 * Advances a furnace by `dt` seconds. A new fuel item is lit only when there is something to smelt; the burn then runs
 * out whether or not the input is taken away. An input is done after SMELT_S of burning. Returns whether it is lit.
 */
export function stepFurnace(f: FurnaceState, dt: number): boolean {
  while (dt > 0) {
    let result = canSmelt(f);
    if (f.burnS <= 0 && result !== null && f.slots[1] && fuelSeconds(f.slots[1].state) > 0) {
      f.burnS = f.burnTotalS = fuelSeconds(f.slots[1].state);
      if (--f.slots[1].count === 0) f.slots[1] = null;
    }
    if (f.burnS <= 0) {
      f.burnS = 0;
      f.cookS = 0;
      return false;
    }
    const step = Math.min(dt, f.burnS, result !== null ? SMELT_S - f.cookS : dt);
    f.burnS -= step;
    dt -= step;
    if (result === null) { f.cookS = 0; continue; }
    f.cookS += step;
    if (f.cookS < SMELT_S) continue;
    f.cookS = 0;
    if (--f.slots[0]!.count === 0) f.slots[0] = null;
    const out = f.slots[2];
    f.slots[2] = { state: result, count: (out?.count ?? 0) + 1 };
    result = canSmelt(f);
  }
  return f.burnS > 0;
}

/** A click on furnace slot 0 (input) or 1 (fuel), as on an inventory slot. Returns the new cursor. */
export function clickFurnaceSlot(f: FurnaceState, index: 0 | 1, cursor: ItemStack | null): ItemStack | null {
  return clickStack(f.slots, index, cursor);
}

/** A click on the output: takes it all onto the cursor when the cursor is empty or holds the same and it fits. */
export function takeFurnaceOutput(f: FurnaceState, cursor: ItemStack | null): ItemStack | null {
  const out = f.slots[2];
  if (!out) return cursor;
  if (!cursor) { f.slots[2] = null; return out; }
  if (cursor.state !== out.state || cursor.count + out.count > maxStackOf(out.state)) return cursor;
  f.slots[2] = null;
  return { state: cursor.state, count: cursor.count + out.count };
}
