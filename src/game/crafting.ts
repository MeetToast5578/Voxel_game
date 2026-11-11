import { ARMOUR_PIECES, BLOCKS } from '../engine/blocks';
import { Inventory, type ItemStack } from './inventory';

/**
 * A shaped recipe: rows of `pattern`, each letter one of the keys in `key` (block or item keys), a space an empty cell.
 * It matches anywhere in the grid, so 2×2 recipes also work in the 3×3 table. Ported from the old game.
 */
export interface Recipe {
  pattern: readonly string[];
  key: Readonly<Record<string, readonly string[]>>;
  result: readonly [key: string, count: number];
  /** Where it is made, when not decided by size (2×2 by hand, 3×3 at a workbench). */
  station?: Station;
}

/** Potions: a bottle and two ingredients, at an alchemy table. */
const BREWS: readonly [potion: string, a: readonly string[], b: readonly string[]][] = [
  ['healing_potion', ['red_mushroom'], ['gel']],
  ['regeneration_potion', ['poppy'], ['gel']],
  ['swiftness_potion', ['dandelion'], ['feather']],
  ['fire_resistance_potion', ['ember_crystal'], ['coal']],
  ['water_breathing_potion', ['raw_fish'], ['reed']],
  ['antidote', ['brown_mushroom'], ['bone_meal']],
];

/** Any rock dug from the ground counts as stone for tools and furnaces: many places have granite or basalt, not stone. */
const ROCK = ['cobblestone', 'granite', 'diorite', 'andesite', 'limestone', 'slate', 'basalt', 'deepslate'];
const TOOL_HEADS = { wooden: ['planks'], stone: ROCK, iron: ['iron_ingot'], diamond: ['diamond'], jade: ['jade'] } as const;
const ARMOUR_PATTERNS = [['MMM', 'M M'], ['M M', 'MMM', 'MMM'], ['MMM', 'M M', 'M M'], ['M M', 'M M']] as const;
const ARMOUR_FROM = { leather: 'leather', iron: 'iron_ingot', diamond: 'diamond', jade: 'jade' } as const;
const TOOL_PATTERNS = { pickaxe: ['MMM', ' S ', ' S '], axe: ['MM', 'MS', ' S'], shovel: ['M', 'S', 'S'], sword: ['M', 'M', 'S'], hoe: ['MM', ' S', ' S'],
  spear: ['  M', ' S ', 'S  '], hammer: ['MMM', 'MSM', ' S '] } as const;

export const RECIPES: readonly Recipe[] = [
  {pattern:['PPP','PPP',' S '],key:{P:['planks'],S:['stick']},result:['sign',3]},
  {pattern:['SSS','SLS','SSS'],key:{S:['stick'],L:['leather']},result:['item_frame',1]},
  {pattern:['PPP','PGP','PPP'],key:{P:['planks'],G:['gold_ingot']},result:['trading_post',1]},
  {pattern:['OIO','OEO','OIO'],key:{O:['obsidian'],I:['iron_ingot'],E:['ember_crystal']},result:['ember_forge',1]},
  { pattern: ['L'], key: { L: ['log'] }, result: ['planks', 4] },
  { pattern: ['P', 'P'], key: { P: ['planks'] }, result: ['stick', 4] },
  { pattern: ['C', 'S'], key: { C: ['coal'], S: ['stick'] }, result: ['torch', 4] },
  { pattern: ['G', 'S'], key: { G: ['gel'], S: ['stick'] }, result: ['torch', 3] },
  { pattern: ['GGG', 'GOG', 'GGG'], key: { G: ['gel'], O: ['gold_ingot'] }, result: ['slime_crown', 1] },
  { pattern: ['FTF', 'GEG', 'FTF'], key: { F: ['feather'], T: ['torch'], G: ['gel'], E: ['ember_crystal'] }, result: ['moth_lure', 1] },
  { pattern: [' LG', ' SL', 'S  '], key: { L: ['lapis'], G: ['gel'], S: ['stick'] }, result: ['spark_wand', 1] },
  { pattern: [' EG', ' SE', 'S  '], key: { E: ['ember_crystal'], G: ['gold_ingot'], S: ['stick'] }, result: ['ember_staff', 1] },
  { pattern: ['PP', 'PP'], key: { P: ['planks'] }, result: ['crafting_table', 1] },
  { pattern: ['P  ', 'PPP', 'P P'], key: { P: ['planks'] }, result: ['chair', 2] },
  { pattern: ['PPP', ' P ', ' P '], key: { P: ['planks'] }, result: ['wooden_table', 1] },
  { pattern: ['S', 'G'], key: { S: ['string'], G: ['gel'] }, result: ['candle', 2] },
  { pattern: ['G G', 'PPP'], key: { G: ['glass_bottle'], P: ['planks'] }, result: ['alchemy_table', 1] },
  { pattern: ['G G', ' G '], key: { G: ['glass'] }, result: ['glass_bottle', 3] },
  { pattern: [' II', ' SI', 'S  '], key: { I: ['iron_ingot'], S: ['string'] }, result: ['grappling_hook', 1] },
  { pattern: ['I', 'S'], key: { I: ['iron_ingot'], S: ['stick'] }, result: ['throwing_knife', 6] },
  { pattern: ['PP', ' P'], key: { P: ['planks'] }, result: ['boomerang', 1] },
  { pattern: ['M', 'A'], key: { M: ['iron_ingot'], A: ['arrow'] }, result: ['iron_arrow', 4] },
  { pattern: ['M', 'A'], key: { M: ['ember_crystal'], A: ['arrow'] }, result: ['ember_arrow', 8] },
  { pattern: ['M', 'A'], key: { M: ['jade'], A: ['arrow'] }, result: ['jade_arrow', 8] },
  { pattern: ['L L', 'F F'], key: { L: ['leather'], F: ['feather'] }, result: ['dash_boots', 1] },
  ...BREWS.map(([potion, a, b]) => ({ pattern: ['ABG'], key: { A: a, B: b, G: ['glass_bottle'] }, result: [potion, 1] as const, station: 'alchemy' as const })),
  { pattern: ['PPP', 'P P', 'PPP'], key: { P: ['planks'] }, result: ['chest', 1] },
  { pattern: ['CCC', 'C C', 'CCC'], key: { C: ROCK }, result: ['furnace', 1] },
  { pattern: ['WWW', 'PPP'], key: { W: ['wool', 'wheat'], P: ['planks'] }, result: ['bed', 1] },
  { pattern: ['PP', 'PP', 'PP'], key: { P: ['planks'] }, result: ['door', 1] },
  { pattern: ['SS', 'SS'], key: { S: ['sand'] }, result: ['sandstone', 1] },
  { pattern: ['SS', 'LL'], key: { S: ['stick'], L: ['log'] }, result: ['campfire', 1] },
  { pattern: ['S S', 'SSS', 'S S'], key: { S: ['stick'] }, result: ['ladder', 3] },
  { pattern: ['I I', ' I '], key: { I: ['iron_ingot'] }, result: ['bucket', 1] },
  { pattern: ['RRR'], key: { R: ['reed'] }, result: ['paper', 3] },
  { pattern: ['S', 'F'], key: { S: ['stick'], F: ['feather'] }, result: ['arrow', 4] },
  { pattern: [' SX', 'S X', ' SX'], key: { S: ['stick'], X: ['string'] }, result: ['bow', 1] },
  { pattern: ['B'], key: { B: ['bone'] }, result: ['bone_meal', 3] },
  { pattern: ['  S', ' SX', 'S X'], key: { S: ['stick'], X: ['string'] }, result: ['fishing_rod', 1] },
  { pattern: ['P P', 'PPP'], key: { P: ['planks'] }, result: ['boat', 1] },
  { pattern: ['ESE', 'SGS', 'EEE'], key: { E: ['ember_crystal'], S: ['beacon_shard'], G: ['glass'] }, result: ['beacon', 1] },
  { pattern: [' G ', 'GIG', ' G '], key: { G: ['gold_ingot'], I: ['iron_ingot'] }, result: ['compass', 1] },
  { pattern: ['PPP', 'PCP', 'PLP'], key: { P: ['paper'], C: ['compass'], L: ['lapis'] }, result: ['map', 1] },
  { pattern: [' I ', 'ITI', ' I '], key: { I: ['iron_ingot'], T: ['torch'] }, result: ['lantern', 1] },
  { pattern: ['F F', 'LGL'], key: { F: ['feather'], L: ['leather'], G: ['gold_ingot'] }, result: ['swift_anklet', 1] },
  { pattern: ['FFF', 'FSF', 'FGF'], key: { F: ['feather'], S: ['string'], G: ['gold_ingot'] }, result: ['feather_charm', 1] },
  { pattern: ['III', 'I I', 'IGI'], key: { I: ['iron_ingot'], G: ['gold_ingot'] }, result: ['iron_band', 1] },
  { pattern: ['S S', 'SFS', ' L '], key: { S: ['string'], F: ['raw_fish'], L: ['lapis'] }, result: ['gill_pendant', 1] },
  { pattern: [' G ', 'GEG', ' G '], key: { G: ['gold_ingot'], E: ['ember_crystal'] }, result: ['heart_locket', 1] },
  ...Object.entries(ARMOUR_FROM).flatMap(([m, from]) => ARMOUR_PATTERNS.map((pattern, slot) =>
    ({ pattern, key: { M: [from] }, result: [`${m}_${ARMOUR_PIECES[slot]}`, 1] as const }))),
  ...Object.entries(TOOL_HEADS).flatMap(([tier, head]) => Object.entries(TOOL_PATTERNS).map(([kind, pattern]) =>
    ({ pattern, key: { M: head, S: ['stick'] }, result: [`${tier}_${kind}`, 1] as const }))),
  ...BLOCKS.types.filter((t) => t.key.endsWith('_stairs')).map((t) => ({
    pattern: ['M  ', 'MM ', 'MMM'], key: { M: [t.key.slice(0, -'_stairs'.length)] }, result: [t.key, 4] as const,
  })),
  ...BLOCKS.types.filter((t) => t.slabOf).map((t) => ({ pattern: ['MMM'], key: { M: [t.slabOf!] }, result: [t.key, 6] as const })),
];

/** The grid trimmed to the rows and columns that hold something, as rows of type keys ('' empty). */
function trim(cells: readonly (ItemStack | null)[], size: number): string[][] {
  const rows = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
    const s = cells[y * size + x];
    // Only fresh items count: a worn tool or a grown crop is not an ingredient.
    return s && !s.wear && (BLOCKS.variant(s.state) === 0 || ['log','planks'].includes(BLOCKS.type(s.state).key)) ? BLOCKS.type(s.state).key : s ? '?' : '';
  }));
  const ys = rows.map((r) => r.some((c) => c !== '')), xs = Array.from({ length: size }, (_, x) => rows.some((r) => r[x] !== ''));
  const y0 = ys.indexOf(true), y1 = ys.lastIndexOf(true), x0 = xs.indexOf(true), x1 = xs.lastIndexOf(true);
  return y0 < 0 ? [] : rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

/** What a `size`×`size` grid crafts, or null. */
export function craftResult(cells: readonly (ItemStack | null)[], size: number): ItemStack | null {
  const grid = trim(cells, size);
  if (grid.length === 0) return null;
  const recipe = RECIPES.find((r) => r.pattern.length === grid.length && r.pattern.every((row, y) => row.length === grid[y]!.length &&
    [...row].every((ch, x) => (ch === ' ' ? grid[y]![x] === '' : r.key[ch]!.includes(grid[y]![x]!)))));
  if (!recipe) return null;
  const log = cells.find(s => s && BLOCKS.type(s.state).key === 'log');
  const variant = recipe.result[0] === 'planks' && log ? (BLOCKS.variant(log.state)<14?BLOCKS.variant(log.state):0) : 0;
  return {state: BLOCKS.state(recipe.result[0], variant), count: recipe.result[1]};
}

/** Whether a recipe fits a `size`×`size` grid. */
export function fits(r: Recipe, size: number): boolean {
  return r.pattern.length <= size && r.pattern.every((row) => row.length <= size);
}

/** Where a recipe can be made: anywhere, with a workbench in reach (recipes that need the 3×3 grid), or beside an
 * alchemy table (potions). */
export type Station = 'hand' | 'table' | 'alchemy';

/** A recipe as a list entry: so many of each ingredient, no layout. */
export interface Craft {
  id: string;
  result: readonly [key: string, count: number];
  needs: readonly { keys: readonly string[]; count: number }[];
  station: Station;
}

/** Every recipe as a list entry, the shaped duplicates (same result and ingredients) merged. */
export const CRAFTS: readonly Craft[] = (() => {
  const seen = new Map<string, Craft>();
  for (const r of RECIPES) {
    const counts = new Map<string, number>();
    for (const row of r.pattern) for (const ch of row) if (ch !== ' ') counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const needs = [...counts].map(([ch, count]) => ({ keys: r.key[ch]!, count }));
    const id = `${r.result[0]}:${needs.map((n) => `${n.keys.join('|')}*${n.count}`).join(',')}`;
    if (!seen.has(id)) seen.set(id, { id, result: r.result, needs, station: r.station ?? (fits(r, 2) ? 'hand' : 'table') });
  }
  return [...seen.values()];
})();

/** Only fresh items count: a worn tool, an upgraded one or a grown crop is not an ingredient. Wood keeps its species. */
function usable(s: ItemStack | null, keys: readonly string[]): s is ItemStack {
  if (!s || s.wear || s.upgrade) return false;
  const t = BLOCKS.type(s.state);
  return keys.includes(t.key) && (BLOCKS.variant(s.state) === 0 || t.key === 'log' || t.key === 'planks');
}

/** How many of `keys` the slots hold that can go into a recipe. */
export function haveFor(slots: readonly (ItemStack | null)[], keys: readonly string[]): number {
  return slots.reduce((n, s) => n + (usable(s, keys) ? s.count : 0), 0);
}

/** Whether `c` can be made now from `slots` with the stations at hand (a workbench, an alchemy table, or neither). */
export function canCraft(c: Craft, slots: readonly (ItemStack | null)[], at: Station | readonly Station[]): boolean {
  return (c.station === 'hand' || at === c.station || (Array.isArray(at) && at.includes(c.station))) && c.needs.every((n) => haveFor(slots, n.keys) >= n.count);
}

/** How many times `c` could be made from `slots` (ingredients are never shared between needs). */
export function timesCraftable(c: Craft, slots: readonly (ItemStack | null)[]): number {
  return Math.min(...c.needs.map((n) => Math.floor(haveFor(slots, n.keys) / n.count)));
}

/**
 * Makes `c` up to `times` times out of `inv`, the results going into `inv`. All or nothing per batch: a batch whose
 * result does not fit stops it, ingredients untouched. Wooden results take the species of the most plentiful log or
 * plank used. Returns how many batches were made.
 */
export function craft(c: Craft, inv: Inventory, station: Station | readonly Station[], times = 1): number {
  let made = 0;
  for (; made < times && canCraft(c, inv.slots, station); made++) {
    const next = new Inventory();
    inv.slots.forEach((s, i) => (next.slots[i] = s && { ...s }));
    let variant = 0;
    for (const n of c.needs) {
      // Take from the biggest stacks first, so a mix of species uses up the one there is most of.
      const order = next.slots.map((_, i) => i).filter((i) => usable(next.slots[i]!, n.keys)).sort((a, b) => next.slots[b]!.count - next.slots[a]!.count);
      let left = n.count;
      for (const i of order) {
        const s = next.slots[i]!, k = BLOCKS.type(s.state).key;
        if ((k === 'log' || k === 'planks') && left === n.count) variant = BLOCKS.variant(s.state);
        const take = Math.min(left, s.count);
        s.count -= take;
        left -= take;
        if (s.count === 0) next.slots[i] = null;
        if (left === 0) break;
      }
    }
    const key = c.result[0];
    const out = { state: BLOCKS.state(key, key === 'planks' && variant < 14 ? variant : 0), count: c.result[1] };
    if (next.add(out) !== 0) break;
    next.slots.forEach((s, i) => (inv.slots[i] = s));
  }
  return made;
}
