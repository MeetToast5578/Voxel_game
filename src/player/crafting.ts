import { BLOCKS, BlockId, getBlockDef, parseBlockStateName } from '../world/blocks';
import { clickStack, maxStackOf, type ItemStack } from './inventory';

/**
 * A shaped recipe (T-I6): rows of `pattern`, where each letter stands for one of the block keys in `key` and a space
 * for an empty cell. It matches anywhere in the grid, so a 2×2 recipe works in the 3×3 table too.
 */
export interface Recipe {
  pattern: readonly string[];
  key: Readonly<Record<string, readonly string[]>>;
  result: readonly [key: string, count: number];
}

const WOOD = ['log', 'fallen_log_x', 'fallen_log_z'];
const TOOL_HEADS = { wooden: ['planks'], stone: ['cobblestone'], iron: ['iron_ingot'] } as const;
const TOOL_PATTERNS = { pickaxe: ['MMM', ' S ', ' S '], axe: ['MM', 'MS', ' S'], shovel: ['M', 'S', 'S'] } as const;

/** Every recipe, as data. Order matters only where two patterns could match the same grid (none do). */
export const RECIPES: readonly Recipe[] = [
  { pattern: ['L'], key: { L: WOOD }, result: ['planks', 4] },
  { pattern: ['P', 'P'], key: { P: ['planks'] }, result: ['stick', 4] },
  { pattern: ['PP', 'PP'], key: { P: ['planks'] }, result: ['crafting_table', 1] },
  { pattern: ['CCC', 'C C', 'CCC'], key: { C: ['cobblestone'] }, result: ['furnace', 1] },
  // Straw from the wheat field on a wooden frame (T-I9).
  { pattern: ['WWW', 'PPP'], key: { W: ['wheat'], P: ['planks'] }, result: ['bed', 1] },
  ...Object.entries(TOOL_HEADS).flatMap(([tier, head]) => Object.entries(TOOL_PATTERNS).map(([kind, pattern]) =>
    ({ pattern, key: { M: head, S: ['stick'] }, result: [`${tier}_${kind}`, 1] as const }))),
  // Three of any cube block with a slab make six slabs.
  ...BLOCKS.filter((d) => d.slabMaterial !== undefined).map((d) => ({
    pattern: ['MMM'], key: { M: [getBlockDef(d.slabMaterial!).key] }, result: [d.key, 6] as const,
  })),
];

/** The grid trimmed to the rows and columns that hold something, as rows of states (0 for empty). */
function trim(cells: readonly (ItemStack | null)[], size: number): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < size; y++) rows.push(Array.from({ length: size }, (_, x) => cells[y * size + x]?.state ?? 0));
  const used = (line: number[]) => line.some((s) => s !== 0);
  const ys = rows.map(used), xs = Array.from({ length: size }, (_, x) => rows.some((r) => r[x] !== 0));
  const y0 = ys.indexOf(true), y1 = ys.lastIndexOf(true), x0 = xs.indexOf(true), x1 = xs.lastIndexOf(true);
  return y0 < 0 ? [] : rows.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

function matches(recipe: Recipe, grid: number[][]): boolean {
  if (recipe.pattern.length !== grid.length || recipe.pattern.some((row, y) => row.length !== grid[y]!.length)) return false;
  return recipe.pattern.every((row, y) => [...row].every((ch, x) => {
    const state = grid[y]![x]!;
    if (ch === ' ') return state === 0;
    return state !== 0 && recipe.key[ch]!.includes(getBlockDef(state).key) && getBlockDef(state).id === state;
  }));
}

/** What a grid of `size`×`size` cells crafts, or null. Only the first state of a type counts (no worn tools). */
export function craftResult(cells: readonly (ItemStack | null)[], size: number): ItemStack | null {
  const grid = trim(cells, size);
  if (grid.length === 0) return null;
  const recipe = RECIPES.find((r) => matches(r, grid));
  if (!recipe) return null;
  const state = parseBlockStateName(recipe.result[0]);
  return state === null ? null : { state, count: recipe.result[1] };
}

/** The crafting grid of the inventory screen: 2×2 in the inventory, 3×3 at a crafting table. */
export class CraftingGrid {
  readonly cells: (ItemStack | null)[] = new Array(9).fill(null);
  size = 2;

  get result(): ItemStack | null {
    return craftResult(this.cells, this.size);
  }

  /** A click on cell `index` with `cursor` held, as on an inventory slot. Returns the new cursor. */
  click(index: number, cursor: ItemStack | null): ItemStack | null {
    return index >= 0 && index < this.size * this.size ? clickStack(this.cells, index, cursor) : cursor;
  }

  /**
   * A click on the result: crafts once, using one item from every filled cell, and adds the result to the cursor.
   * Nothing happens when there is no result or the cursor holds something it cannot join. Returns the new cursor.
   */
  take(cursor: ItemStack | null): ItemStack | null {
    const result = this.result;
    if (!result) return cursor;
    if (cursor && (cursor.state !== result.state || cursor.count + result.count > maxStackOf(result.state))) return cursor;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c) continue;
      c.count -= 1;
      if (c.count === 0) this.cells[i] = null;
    }
    return { state: result.state, count: (cursor?.count ?? 0) + result.count };
  }

  /** Empties the grid and returns what was in it, for the inventory to take back. */
  clear(): ItemStack[] {
    const items = this.cells.filter((c): c is ItemStack => c !== null);
    this.cells.fill(null);
    return items;
  }
}

/** A crafting table is the block that opens the 3×3 grid. */
export const isCraftingTable = (state: number) => state === BlockId.CRAFTING_TABLE;
