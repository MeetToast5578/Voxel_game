import { BLOCKS } from '../engine/blocks';
import { SPECIES } from '../creatures/species';
import { CRAFTS } from './crafting';
import { MILESTONES } from './journal';
import { LOOT_ITEMS, type LootTable } from './loot';
import { SHOPS, TRADE_OFFERS } from './workshops';

const PLACES: Record<LootTable, string> = { surface: 'chests in ruins and camps', mine: 'chests in old mines', vault: 'deep vault chests', shrine: 'ember shrine chests',
  sky: 'chests on sky islands', pyramid: 'desert pyramid chests', temple: 'jungle temple chests' };
const name = (key: string) => BLOCKS.byName(key).name;
const unique = <T,>(list: T[]) => [...new Set(list)];
// Tooltips ask for the same items on every redraw; the tables never change.
const sourceCache = new Map<string, string[]>(), useCache = new Map<string, string[]>();

/**
 * Where an item comes from, in short phrases: crafted, smelted, dug from a block, dropped by a creature, found in chests,
 * sold in a shop, or given for a milestone. Empty if none (creative only).
 */
export function sourcesOf(key: string): string[] {
  let out = sourceCache.get(key);
  if (out) return out;
  sourceCache.set(key, (out = []));
  if (CRAFTS.some((c) => c.result[0] === key)) out.push('crafted');
  const smelted = BLOCKS.types.filter((t) => t.smeltsTo === key).map((t) => t.name);
  if (smelted.length) out.push(`smelted from ${smelted.join(', ')}`);
  const mined = BLOCKS.types.filter((t) => t.drops === key && t.key !== key).map((t) => t.name);
  if (mined.length) out.push(`dug from ${mined.join(', ')}`);
  if (key === 'wheat') out.push('found in tall grass');
  if (key === 'sapling') out.push('dropped by leaves');
  if (key === 'raw_fish') out.push('caught with a fishing rod');
  const bag = BLOCKS.byName(key).bag;
  if (bag) out.push(`dropped by the ${SPECIES.find((s) => s.key === bag)?.name ?? bag}`);
  if (key === 'water_bucket' || key === 'lava_bucket') out.push('scooped up with a bucket');
  const by = SPECIES.filter((s) => s.loot?.some(([k]) => k === key) || (key === 'raw_meat' && s.meat > 0)).map((s) => s.name);
  if (by.length) out.push(`dropped by ${unique(by).slice(0, 4).join(', ')}${by.length > 4 ? ' and more' : ''}`);
  const chests = (Object.keys(LOOT_ITEMS) as LootTable[]).filter((t) => LOOT_ITEMS[t].includes(key)).map((t) => PLACES[t]);
  if (chests.length) out.push(`found in ${chests.join(', ')}`);
  const shops = Object.entries({ trader: TRADE_OFFERS, ...SHOPS }).filter(([, offers]) => offers.some((o) => o.gives[0] === key)).map(([who]) => who);
  if (shops.length) out.push(`sold by the ${shops.join(', ')}`);
  if (MILESTONES.some((m) => m.reward[0] === key)) out.push('a milestone reward');
  return out;
}

/** The names of what an item goes into: recipes that use it, and smelting. */
export function usesOf(key: string): string[] {
  const hit = useCache.get(key);
  if (hit) return hit;
  const made = CRAFTS.filter((c) => c.needs.some((n) => n.keys.includes(key))).map((c) => name(c.result[0]));
  const t = BLOCKS.byName(key);
  const out = unique([...made, ...(t.smeltsTo ? [name(t.smeltsTo)] : [])]);
  useCache.set(key, out);
  return out;
}
