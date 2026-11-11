import { hash2, mulberry32 } from '../core/random';
import { BLOCK_SIZE_M } from '../config';
import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from './inventory';
import { rollModifier, takesModifier } from './modifiers';

export type LootTable = 'surface' | 'mine' | 'vault' | 'shrine' | 'sky' | 'pyramid' | 'temple';
/** Structures whose chests have their own table, whatever their height. */
export const SITE_TABLES = ['sky_island', 'pyramid', 'temple'] as const;

/** Per table: how many rolls, and [item, fewest, most, weight] entries. Deeper tables give better things. */
const TABLES: Record<LootTable, { rolls: readonly [number, number]; entries: readonly (readonly [string, number, number, number])[]; always?: readonly [string, number][] }> = {
  surface: { rolls: [3, 5], entries: [
    ['cooked_meat', 1, 3, 4], ['baked_potato', 1, 3, 3], ['torch', 2, 6, 4], ['coal', 2, 5, 3], ['stick', 2, 6, 2], ['wheat', 2, 5, 2],
    ['iron_ingot', 1, 2, 2], ['arrow', 2, 6, 2], ['leather', 1, 3, 2], ['stone_pickaxe', 1, 1, 1], ['compass', 1, 1, 0.5], ['bucket', 1, 1, 0.5], ['swift_anklet', 1, 1, 0.4], ['gill_pendant', 1, 1, 0.3], ['healing_potion', 1, 2, 1], ['swiftness_potion', 1, 1, 0.5],
  ] },
  mine: { rolls: [3, 6], entries: [
    ['coal', 3, 8, 4], ['torch', 4, 10, 3], ['iron_ingot', 1, 4, 4], ['gold_ingot', 1, 3, 2], ['lapis', 2, 6, 2], ['bucket', 1, 1, 1],
    ['iron_pickaxe', 1, 1, 0.7], ['bone_meal', 2, 5, 1], ['diamond', 1, 1, 0.4], ['ladder', 3, 8, 2], ['swift_anklet', 1, 1, 0.5], ['iron_band', 1, 1, 0.4], ['life_crystal', 1, 1, 0.8], ['spark_wand', 1, 1, 0.4], ['healing_potion', 1, 3, 1.2], ['antidote', 1, 2, 0.8], ['water_breathing_potion', 1, 1, 0.5],
  ] },
  vault: { rolls: [4, 7], entries: [
    ['diamond', 1, 3, 2], ['gold_ingot', 2, 5, 3], ['iron_ingot', 2, 6, 3], ['iron_chestplate', 1, 1, 1], ['iron_helmet', 1, 1, 1],
    ['bow', 1, 1, 1.5], ['arrow', 4, 12, 2], ['ember_crystal', 1, 2, 0.6], ['bone_meal', 3, 6, 1], ['lantern', 1, 2, 1], ['cloud_charm', 1, 1, 0.8], ['heart_locket', 1, 1, 0.4], ['life_crystal', 1, 2, 1.5], ['ember_staff', 1, 1, 0.4], ['fire_resistance_potion', 1, 2, 1], ['regeneration_potion', 1, 2, 0.8],
  ] },
  // The sky, the desert pyramid and the jungle temple: each with something found nowhere else.
  sky: { rolls: [3, 5], always: [['feather_charm', 1]], entries: [
    ['cloud_charm', 1, 1, 2], ['glider_wings', 1, 1, 1.2], ['swift_anklet', 1, 1, 1], ['life_crystal', 1, 2, 2], ['gold_ingot', 2, 5, 2], ['feather', 3, 8, 3],
    ['swiftness_potion', 1, 2, 2], ['arrow', 4, 12, 2],
  ] },
  pyramid: { rolls: [4, 6], always: [['scarab_charm', 1]], entries: [
    ['gold_ingot', 3, 8, 4], ['diamond', 1, 2, 1], ['lapis', 3, 8, 2], ['fire_resistance_potion', 1, 2, 2], ['bone', 2, 6, 2],
    ['life_crystal', 1, 1, 1], ['trade_coin', 5, 15, 3],
  ] },
  temple: { rolls: [4, 6], always: [['jungle_idol', 1]], entries: [
    ['lapis', 3, 8, 2], ['gold_ingot', 2, 5, 3], ['regeneration_potion', 1, 2, 2], ['antidote', 1, 3, 2], ['jade', 1, 2, 1],
    ['heart_locket', 1, 1, 0.6], ['trade_coin', 5, 15, 3],
  ] },
  shrine: { rolls: [2, 4], always: [['beacon_shard', 1]], entries: [
    ['ember_crystal', 1, 3, 3], ['diamond', 1, 2, 2], ['gold_ingot', 2, 4, 1], ['ember_ring', 1, 1, 1.5], ['cloud_charm', 1, 1, 0.8], ['life_crystal', 1, 2, 2],
  ] },
};

/** Every item each table can hold, for the item guide. */
export const LOOT_ITEMS: Readonly<Record<LootTable, readonly string[]>> = {
  surface: keysOf('surface'), mine: keysOf('mine'), vault: keysOf('vault'), shrine: keysOf('shrine'), sky: keysOf('sky'), pyramid: keysOf('pyramid'), temple: keysOf('temple'),
};
function keysOf(t: LootTable): string[] {
  return [...(TABLES[t].always ?? []).map(([key]) => key), ...TABLES[t].entries.map(([key]) => key)];
}

/** The table of a generated container: ancient chests are shrines'; otherwise by depth (y in cells). */
export function lootTableFor(blockKey: string, y: number): LootTable {
  if (blockKey === 'ancient_chest') return 'shrine';
  const m = y * BLOCK_SIZE_M;
  return m < -60 ? 'vault' : m < -12 ? 'mine' : 'surface';
}

/** The contents of a generated container at cell (x, y, z): the same for a world and place, whenever it is opened. */
export function rollLoot(seed: number, x: number, y: number, z: number, table: LootTable, slots = 27): (ItemStack | null)[] {
  const t = TABLES[table], rand = mulberry32(Math.floor(hash2(seed + 500 + y, x, z) * 2 ** 31));
  const out: (ItemStack | null)[] = new Array(slots).fill(null);
  const items: ItemStack[] = (t.always ?? []).map(([k, n]) => ({ state: BLOCKS.state(k), count: n }));
  const total = t.entries.reduce((a, e) => a + e[3], 0);
  const rolls = t.rolls[0] + Math.floor(rand() * (t.rolls[1] - t.rolls[0] + 1));
  for (let r = 0; r < rolls; r++) {
    let pick = rand() * total;
    const e = t.entries.find((en) => (pick -= en[3]) < 0) ?? t.entries[t.entries.length - 1]!;
    const state = BLOCKS.state(e[0]);
    items.push({ state, count: e[1] + Math.floor(rand() * (e[2] - e[1] + 1)), ...(takesModifier(state) ? { mod: rollModifier(rand) } : {}) });
  }
  // Scattered over the slots.
  for (const item of items) {
    let i = Math.floor(rand() * slots);
    while (out[i]) i = (i + 1) % slots;
    out[i] = item;
  }
  return out;
}
