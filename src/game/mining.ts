import { SAPLING_CHANCE, SEED_CHANCE } from '../config';
import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from './inventory';

/** Speed of each tool tier on blocks it suits (wood, stone, iron, diamond). */
const TIER_SPEED = [2, 4, 6, 8];
/** Without the tool tier a block needs, breaking takes this many times longer and gives nothing. */
const WRONG_TOOL_SLOWDOWN = 3.3;

/** Whether `tool` (or a bare hand) is good enough for `state` to drop anything. */
export function canHarvest(state: number, tool: ItemStack | null): boolean {
  const t = BLOCKS.type(state);
  if (t.needsTier === undefined) return true;
  const def = tool ? BLOCKS.type(tool.state).tool : undefined;
  return def !== undefined && def.kind === t.mineWith && def.tier >= t.needsTier;
}

/** Seconds to break `state` with `tool` held. */
export function breakSeconds(state: number, tool: ItemStack | null): number {
  const t = BLOCKS.type(state);
  const def = tool ? BLOCKS.type(tool.state).tool : undefined;
  const speed = def && def.kind === t.mineWith ? TIER_SPEED[def.tier]! : 1;
  return (t.hardness / speed) * (canHarvest(state, tool) ? 1 : WRONG_TOOL_SLOWDOWN);
}

/** What breaking `state` gives, given a random number in [0, 1) for chance drops. */
export function dropsOf(state: number, tool: ItemStack | null, roll: number): ItemStack[] {
  const t = BLOCKS.type(state);
  if (!canHarvest(state, tool)) return [];
  const v = BLOCKS.variant(state);
  if (t.key === 'tall_grass') return roll < SEED_CHANCE ? [{ state: BLOCKS.state('wheat'), count: 1 }] : [];
  if (t.key === 'leaves' && v === 0) return roll < SAPLING_CHANCE ? [{ state: BLOCKS.state('sapling'), count: 1 }] : [];
  // Ripe crops give a handful of what was planted.
  if (t.variantTiles) return [{ state: t.id, count: v === t.variants - 1 ? 3 : 1 }];
  if (t.key === 'door' || t.key === 'bed') return [{ state: t.id, count: 1 }];
  if (t.drops === '') return [];
  // Everything else gives its first state (slabs, stairs and facing blocks lose their orientation); saplings keep
  // their species.
  return [{ state: t.drops ? BLOCKS.state(t.drops) : t.key === 'sapling' ? state : t.id, count: 1 }];
}

/** Wears the held tool by one use; returns false when it breaks. */
export function wearTool(tool: ItemStack): boolean {
  const def = BLOCKS.type(tool.state).tool;
  if (!def) return true;
  tool.wear = (tool.wear ?? 0) + 1;
  return tool.wear < def.durability;
}
