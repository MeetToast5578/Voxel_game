import { describe, expect, it } from 'vitest';
import { MAX_HEALTH, SMELT_S } from '../config';
import { BLOCKS } from '../engine/blocks';
import { consumeIngredients, craftResult } from '../game/crafting';
import { newFurnace, tickFurnace } from '../game/furnace';
import { clickSlot, Inventory, type ItemStack } from '../game/inventory';
import { breakSeconds, canHarvest, dropsOf, wearTool } from '../game/mining';
import { Survival } from '../game/survival';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const stack = (key: string, count = 1): ItemStack => ({ state: S(key), count });

describe('inventory', () => {
  it('merges into existing stacks, then fills empty slots, and reports what did not fit', () => {
    const inv = new Inventory();
    expect(inv.add(stack('dirt', 70))).toBe(0);
    expect(inv.slots[0]!.count).toBe(64);
    expect(inv.slots[1]!.count).toBe(6);
    expect(inv.add(stack('dirt', 3))).toBe(0);
    expect(inv.slots[1]!.count).toBe(9);
    expect(inv.add(stack('wooden_pickaxe', 2))).toBe(0);
    expect(inv.slots[2]!.count).toBe(1);
    expect(inv.slots[3]!.count).toBe(1);
    for (let i = 0; i < 40; i++) inv.add(stack('stone', 64));
    expect(inv.add(stack('glass', 5))).toBe(5);
  });

  it('picks up, splits, merges and swaps with clicks', () => {
    const slots: (ItemStack | null)[] = [stack('dirt', 10), stack('stone', 3), null];
    let cursor = clickSlot(slots, 0, null, true);
    expect(cursor!.count).toBe(5);
    cursor = clickSlot(slots, 0, cursor);
    expect(slots[0]!.count).toBe(10);
    expect(cursor).toBeNull();
    cursor = clickSlot(slots, 1, null);
    cursor = clickSlot(slots, 0, cursor);
    expect(BLOCKS.stateName(slots[0]!.state)).toBe('stone');
    expect(BLOCKS.stateName(cursor!.state)).toBe('dirt');
    cursor = clickSlot(slots, 2, cursor, true);
    expect(slots[2]!.count).toBe(1);
    expect(cursor!.count).toBe(9);
  });

  it('saves and loads, dropping unknown entries', () => {
    const inv = new Inventory();
    inv.add(stack('planks', 12));
    inv.add({ state: S('stone_pickaxe'), count: 1, wear: 7 });
    const back = new Inventory();
    back.load([...inv.save().slice(0, 34), ['nonsense', 3, 0], 'junk']);
    expect(back.save()).toEqual(inv.save());
  });
});

describe('crafting', () => {
  const grid = (rows: string[], size = 3) => {
    const cells: (ItemStack | null)[] = new Array(size * size).fill(null);
    rows.forEach((row, y) => row.split(',').forEach((k, x) => { if (k) cells[y * size + x] = stack(k, 2); }));
    return cells;
  };

  it('makes planks, sticks, tools and torches anywhere in the grid', () => {
    expect(craftResult(grid(['', ',log']), 3)).toEqual(stack('planks', 4));
    expect(craftResult(grid(['planks', 'planks'], 2), 2)).toEqual(stack('stick', 4));
    expect(craftResult(grid(['cobblestone,cobblestone,cobblestone', ',stick', ',stick']), 3)).toEqual(stack('stone_pickaxe'));
    expect(craftResult(grid(['coal', 'stick'], 2), 2)).toEqual(stack('torch', 4));
    expect(craftResult(grid(['dirt', 'stick'], 2), 2)).toBeNull();
  });

  it('uses up one of each ingredient', () => {
    const cells = grid(['planks,planks', 'planks,planks'], 2);
    consumeIngredients(cells);
    expect(cells.map((c) => c?.count)).toEqual([1, 1, 1, 1]);
  });
});

describe('furnace', () => {
  it('smelts with fuel and stops when the fuel runs out', () => {
    const f = newFurnace();
    f.input = stack('iron_ore', 3);
    f.fuel = stack('planks', 1); // 15 s: one item and part of another
    for (let t = 0; t < 40; t += 0.1) tickFurnace(f, 0.1);
    expect(f.output).toEqual(stack('iron_ingot', 1));
    expect(f.input!.count).toBe(2);
    expect(f.fuel).toBeNull();
    f.fuel = stack('coal', 1);
    for (let t = 0; t < SMELT_S * 2 + 1; t += 0.1) tickFurnace(f, 0.1);
    expect(f.output!.count).toBe(3);
    expect(f.input).toBeNull();
  });
});

describe('mining', () => {
  it('needs the right tool tier for ores and is faster with the right tool', () => {
    expect(canHarvest(S('stone'), null)).toBe(false);
    expect(canHarvest(S('stone'), stack('wooden_pickaxe'))).toBe(true);
    expect(canHarvest(S('iron_ore'), stack('wooden_pickaxe'))).toBe(false);
    expect(canHarvest(S('iron_ore'), stack('stone_pickaxe'))).toBe(true);
    expect(breakSeconds(S('dirt'), stack('iron_shovel'))).toBeLessThan(breakSeconds(S('dirt'), null));
    expect(breakSeconds(S('stone'), null)).toBeGreaterThan(breakSeconds(S('stone'), stack('wooden_pickaxe')) * 3);
  });

  it('drops what each block gives', () => {
    const pick = stack('wooden_pickaxe');
    expect(dropsOf(S('stone'), pick, 0.5)).toEqual([stack('cobblestone')]);
    expect(dropsOf(S('grass'), null, 0.5)).toEqual([stack('dirt')]);
    expect(dropsOf(S('coal_ore'), pick, 0.5)).toEqual([stack('coal')]);
    expect(dropsOf(S('glass'), null, 0.5)).toEqual([]);
    expect(dropsOf(S('stone_slab', 1), pick, 0.5)).toEqual([stack('stone_slab')]);
    expect(dropsOf(S('wheat', 3), null, 0.5)).toEqual([stack('wheat', 3)]);
    expect(dropsOf(S('tall_grass'), null, 0.01)).toEqual([stack('wheat')]);
    expect(dropsOf(S('lit_furnace', 2), pick, 0.5)).toEqual([stack('furnace')]);
  });

  it('wears tools out', () => {
    const tool = stack('wooden_axe');
    let uses = 0;
    while (wearTool(tool)) uses++;
    expect(uses).toBe(59);
  });
});

describe('survival', () => {
  it('drowns without air, regenerates when fed, and hurts on hard landings', () => {
    const s = new Survival();
    for (let t = 0; t < 20; t += 0.1) s.update(0.1, { sprinting: false, headInWater: true, inLava: false });
    expect(s.health).toBeLessThan(MAX_HEALTH);
    expect(s.cause).toBe('drowned');
    const hurt = s.health;
    for (let t = 0; t < 5; t += 0.1) s.update(0.1, { sprinting: false, headInWater: false, inLava: false });
    expect(s.health).toBeGreaterThan(hurt);
    s.land(9);
    const before = s.health;
    s.land(15);
    expect(s.health).toBe(before - 5);
    s.hunger = 10;
    expect(s.eat(6)).toBe(true);
    expect(s.hunger).toBe(16);
  });
});
