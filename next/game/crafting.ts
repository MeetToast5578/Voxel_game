import { BLOCKS } from '../engine/blocks';
import type { ItemStack } from './inventory';

/**
 * A shaped recipe: rows of `pattern`, each letter one of the keys in `key` (block or item keys), a space an empty cell.
 * It matches anywhere in the grid, so 2×2 recipes also work in the 3×3 table. Ported from the old game.
 */
export interface Recipe {
  pattern: readonly string[];
  key: Readonly<Record<string, readonly string[]>>;
  result: readonly [key: string, count: number];
}

const TOOL_HEADS = { wooden: ['planks'], stone: ['cobblestone'], iron: ['iron_ingot'] } as const;
const TOOL_PATTERNS = { pickaxe: ['MMM', ' S ', ' S '], axe: ['MM', 'MS', ' S'], shovel: ['M', 'S', 'S'] } as const;

export const RECIPES: readonly Recipe[] = [
  { pattern: ['L'], key: { L: ['log'] }, result: ['planks', 4] },
  { pattern: ['P', 'P'], key: { P: ['planks'] }, result: ['stick', 4] },
  { pattern: ['C', 'S'], key: { C: ['coal'], S: ['stick'] }, result: ['torch', 4] },
  { pattern: ['PP', 'PP'], key: { P: ['planks'] }, result: ['crafting_table', 1] },
  { pattern: ['PPP', 'P P', 'PPP'], key: { P: ['planks'] }, result: ['chest', 1] },
  { pattern: ['CCC', 'C C', 'CCC'], key: { C: ['cobblestone'] }, result: ['furnace', 1] },
  { pattern: ['WWW', 'PPP'], key: { W: ['wheat'], P: ['planks'] }, result: ['bed', 1] },
  { pattern: ['PP', 'PP', 'PP'], key: { P: ['planks'] }, result: ['door', 1] },
  { pattern: ['SS', 'SS'], key: { S: ['sand'] }, result: ['sandstone', 1] },
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
    return s && !s.wear && BLOCKS.variant(s.state) === 0 ? BLOCKS.type(s.state).key : s ? '?' : '';
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
  return recipe ? { state: BLOCKS.state(recipe.result[0]), count: recipe.result[1] } : null;
}

/** Uses up one of each ingredient in the grid after crafting. */
export function consumeIngredients(cells: (ItemStack | null)[]): void {
  cells.forEach((s, i) => {
    if (s && --s.count <= 0) cells[i] = null;
  });
}
