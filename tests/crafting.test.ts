import { describe, expect, it } from 'vitest';
import { NO_PICKAXE_SLOWDOWN, TOOL_TIERS } from '../src/config';
import { CraftingGrid, craftResult } from '../src/player/crafting';
import { Inventory, maxStackOf, type ItemStack } from '../src/player/inventory';
import { afterUse, breakSeconds, dropsWhenMined, minedWith, toolOf, usesLeft } from '../src/player/tools';
import { BlockId, getBlockDef, parseBlockStateName, slabState } from '../src/world/blocks';

const s = (name: string) => parseBlockStateName(name)!;
/** A size×size grid from rows of block names ('' for empty). */
function grid(rows: string[][], size = rows.length): (ItemStack | null)[] {
  const cells: (ItemStack | null)[] = new Array(size * size).fill(null);
  rows.forEach((row, y) => row.forEach((name, x) => { if (name) cells[y * size + x] = { state: s(name), count: 1 }; }));
  return cells;
}

describe('crafting recipes (T-I6)', () => {
  it('turns a log into planks anywhere in the grid, and planks into sticks and a table', () => {
    expect(craftResult(grid([['', ''], ['', 'log']]), 2)).toEqual({ state: BlockId.PLANKS, count: 4 });
    expect(craftResult(grid([['planks'], ['planks']], 2), 2)).toEqual({ state: BlockId.STICK, count: 4 });
    expect(craftResult(grid([['planks', 'planks'], ['planks', 'planks']]), 2)).toEqual({ state: BlockId.CRAFTING_TABLE, count: 1 });
  });

  it('makes tools, a bed and slabs at the 3×3 table; a wrong shape makes nothing', () => {
    const pick = grid([['planks', 'planks', 'planks'], ['', 'stick', ''], ['', 'stick', '']]);
    expect(craftResult(pick, 3)).toEqual({ state: s('wooden_pickaxe'), count: 1 });
    expect(craftResult(grid([['cobblestone', 'cobblestone', 'cobblestone'], ['', 'stick', ''], ['', 'stick', '']]), 3))
      .toEqual({ state: s('stone_pickaxe'), count: 1 });
    expect(craftResult(grid([['wheat', 'wheat', 'wheat'], ['planks', 'planks', 'planks'], ['', '', '']]), 3)).toEqual({ state: BlockId.BED, count: 1 });
    expect(craftResult(grid([['', '', ''], ['', '', ''], ['brick', 'brick', 'brick']]), 3)).toEqual({ state: slabState(BlockId.BRICK), count: 6 });
    expect(craftResult(grid([['planks', 'stick'], ['planks', '']]), 2)).toBeNull();
    expect(craftResult(grid([['', ''], ['', '']]), 2)).toBeNull();
  });

  it('taking the result uses one of each ingredient, and the grid gives back what is left', () => {
    const g = new CraftingGrid();
    g.cells[0] = { state: BlockId.LOG, count: 2 };
    let cursor = g.take(null);
    expect(cursor).toEqual({ state: BlockId.PLANKS, count: 4 });
    cursor = g.take(cursor);
    expect(cursor).toEqual({ state: BlockId.PLANKS, count: 8 });
    expect(g.result).toBeNull();
    expect(g.take({ state: BlockId.STONE, count: 1 })).toEqual({ state: BlockId.STONE, count: 1 }); // nothing to craft
    g.cells[3] = { state: BlockId.DIRT, count: 5 };
    expect(g.clear()).toEqual([{ state: BlockId.DIRT, count: 5 }]);
  });
});

describe('tools (T-I5)', () => {
  const wood = s('wooden_pickaxe'), stoneAxe = s('stone_axe');

  it('know their kind, tier and wear; tools stack to one', () => {
    expect(toolOf(wood)).toEqual({ kind: 'pickaxe', speed: TOOL_TIERS.wooden.speed });
    expect(toolOf(BlockId.STICK)).toBeNull();
    expect(maxStackOf(wood)).toBe(1);
    expect(usesLeft(wood)).toBe(TOOL_TIERS.wooden.uses);
    expect(afterUse(wood)).toBe(wood + 1);
    expect(afterUse(wood + TOOL_TIERS.wooden.uses - 1)).toBeNull(); // the last use breaks it
    expect(afterUse(BlockId.DIRT)).toBe(BlockId.DIRT);
    expect(getBlockDef(wood).item).toBe(true);
    const inv = new Inventory(new Array(36).fill(null));
    expect(inv.add(wood, 2)).toBe(0);
    expect(inv.slots.filter(Boolean)).toHaveLength(2);
  });

  it('the right tool mines faster; stone needs a pickaxe in survival to drop', () => {
    expect(minedWith(BlockId.STONE)).toBe('pickaxe');
    expect(minedWith(BlockId.LOG)).toBe('axe');
    expect(minedWith(BlockId.DIRT)).toBe('shovel');
    expect(minedWith(BlockId.TALL_GRASS)).toBeNull();
    const stone = getBlockDef(BlockId.STONE).hardness;
    expect(breakSeconds(BlockId.STONE, wood, true)).toBe(stone / TOOL_TIERS.wooden.speed);
    expect(breakSeconds(BlockId.STONE, BlockId.DIRT, true)).toBe(stone * NO_PICKAXE_SLOWDOWN);
    expect(breakSeconds(BlockId.STONE, BlockId.DIRT, false)).toBe(stone);
    expect(breakSeconds(BlockId.LOG, stoneAxe, true)).toBe(getBlockDef(BlockId.LOG).hardness / TOOL_TIERS.stone.speed);
    expect(dropsWhenMined(BlockId.STONE, BlockId.AIR)).toBe(false);
    expect(dropsWhenMined(BlockId.STONE, wood)).toBe(true);
    expect(dropsWhenMined(BlockId.LOG, BlockId.AIR)).toBe(true);
  });
});
