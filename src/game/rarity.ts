import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from './inventory';

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

const EPIC = new Set(['cloud_charm', 'ember_ring', 'heart_locket', 'slime_crown', 'beacon_shard']);
const RARE = new Set(['swift_anklet', 'feather_charm', 'iron_band', 'gill_pendant', 'diamond', 'ember_crystal', 'compass', 'map']);
const UNCOMMON = new Set(['gold_ingot', 'lapis', 'lantern', 'bow', 'trade_coin']);

/** How rare an item is, 0 (common) to 4 (legendary): by material and kind, raised by ember upgrades. */
export function rarity(s: ItemStack): number {
  const t = BLOCKS.type(s.state), k = t.key;
  let r = k === 'beacon' || k === 'lit_beacon' ? 4 : EPIC.has(k) ? 3 : RARE.has(k) || k.startsWith('diamond_') ? 2
    : UNCOMMON.has(k) || k.startsWith('iron_') ? 1 : 0;
  r += s.upgrade ?? 0;
  return Math.min(4, r);
}
