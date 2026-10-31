import { SMELT_S } from '../config';
import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from './inventory';
import { maxStack } from './inventory';

/** A furnace's slots and progress. It smelts while there is something to smelt, fuel and room for the result. */
export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** Seconds of burning left in the current piece of fuel. */
  burn: number;
  /** Seconds spent on the current item. */
  progress: number;
}

export const newFurnace = (): FurnaceState => ({ input: null, fuel: null, output: null, burn: 0, progress: 0 });

/** What the furnace would make of its input, if anything. */
export function smeltResult(input: ItemStack | null): number | null {
  if (!input) return null;
  const to = BLOCKS.type(input.state).smeltsTo;
  return to ? BLOCKS.state(to) : null;
}

/** Advances a furnace by dt seconds. Returns whether it is burning (for the lit block). */
export function tickFurnace(f: FurnaceState, dt: number): boolean {
  const result = smeltResult(f.input);
  const room = result !== null && (!f.output || (f.output.state === result && f.output.count < maxStack(result)));
  if (f.burn <= 0 && room && f.fuel) {
    const seconds = BLOCKS.type(f.fuel.state).fuel ?? 0;
    if (seconds > 0) {
      f.burn = seconds;
      // A lava bucket leaves its bucket behind.
      const empty = BLOCKS.type(f.fuel.state).emptiesTo;
      if (--f.fuel.count <= 0) f.fuel = empty ? { state: BLOCKS.state(empty), count: 1 } : null;
    }
  }
  if (f.burn > 0) {
    f.burn = Math.max(0, f.burn - dt);
    if (room) {
      f.progress += dt;
      if (f.progress >= SMELT_S) {
        f.progress = 0;
        if (f.output) f.output.count++;
        else f.output = { state: result!, count: 1 };
        if (--f.input!.count <= 0) f.input = null;
      }
    } else f.progress = 0;
    return true;
  }
  f.progress = 0;
  return false;
}
