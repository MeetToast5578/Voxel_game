import { describe, expect, it } from 'vitest';
import { SMELT_S, TOOL_TIERS } from '../src/config';
import { craftResult } from '../src/player/crafting';
import { clickFurnaceSlot, fuelSeconds, newFurnace, smeltResult, stepFurnace, takeFurnaceOutput } from '../src/player/furnace';
import type { ItemStack } from '../src/player/inventory';
import { breakSeconds } from '../src/player/tools';
import { metaRecord, parseMeta } from '../src/storage/save';
import { BlockId, FACINGS, blockDrop, blockFaceTile, facingVariant, foodValue, getBlockDef, parseBlockStateName, Tile } from '../src/world/blocks';
import { INVENTORY_SIZE } from '../src/config';
import type { WorldMeta } from '../src/storage/save';

const sampleMeta: WorldMeta = {
  seed: 1, selectedSlot: 0, player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false },
  inventory: new Array(INVENTORY_SIZE).fill(null), items: [], timeOfDay: 0.5, timeOfYear: 0, gameMode: 'survival', health: 20, hunger: 20, air: 15,
};

const s = (name: string) => parseBlockStateName(name)!;
const stack = (name: string, count: number): ItemStack => ({ state: s(name), count });

describe('furnaces (T-I7)', () => {
  it('smelts one input per SMELT_S while fuel burns, and stacks the output', () => {
    const f = newFurnace();
    f.slots[0] = stack('iron_ore', 3);
    f.slots[1] = stack('coal', 1);
    expect(stepFurnace(f, SMELT_S * 2 + 1)).toBe(true);
    expect(f.slots[0]).toEqual(stack('iron_ore', 1));
    expect(f.slots[1]).toBeNull();
    expect(f.slots[2]).toEqual(stack('iron_ingot', 2));
    expect(f.burnS).toBeCloseTo(fuelSeconds(BlockId.COAL) - SMELT_S * 2 - 1);
  });

  it('does not light fuel with nothing to smelt, and goes out when the burn ends', () => {
    const f = newFurnace();
    f.slots[1] = stack('stick', 2);
    expect(stepFurnace(f, 30)).toBe(false);
    expect(f.slots[1]!.count).toBe(2);
    f.slots[0] = stack('sand', 5);
    stepFurnace(f, 30); // two sticks burn 10 s: not enough for two glass
    expect(f.slots[1]).toBeNull();
    expect(f.slots[2]).toEqual(stack('glass', 1));
    expect(f.cookS).toBe(0);
    expect(f.burnS).toBe(0);
  });

  it('stops when the output holds something else, and the output is taken whole', () => {
    const f = newFurnace();
    f.slots = [stack('sand', 1), stack('coal', 1), stack('stone', 1)];
    expect(stepFurnace(f, SMELT_S * 2)).toBe(false);
    expect(f.slots[0]).toEqual(stack('sand', 1));
    expect(takeFurnaceOutput(f, stack('glass', 1))).toEqual(stack('glass', 1)); // a different stack in hand: nothing
    expect(takeFurnaceOutput(f, null)).toEqual(stack('stone', 1));
    expect(f.slots[2]).toBeNull();
    expect(clickFurnaceSlot(f, 1, null)).toEqual(stack('coal', 1));
    expect(f.slots[1]).toBeNull();
  });

  it('cooks potatoes into better food, and only the planted state smelts', () => {
    expect(smeltResult(BlockId.POTATOES)).toBe(BlockId.BAKED_POTATO);
    expect(smeltResult(BlockId.POTATOES + 1)).toBeNull();
    expect(foodValue(BlockId.BAKED_POTATO)).toBeGreaterThan(foodValue(BlockId.POTATOES));
    expect(smeltResult(BlockId.DIRT)).toBeNull();
  });

  it('crafts from eight cobblestone; iron tools from ingots mine faster than stone', () => {
    const ring = [s('cobblestone'), s('cobblestone'), s('cobblestone'), s('cobblestone'), null, s('cobblestone'), s('cobblestone'), s('cobblestone'), s('cobblestone')]
      .map((state) => (state ? { state, count: 1 } : null));
    expect(craftResult(ring, 3)).toEqual({ state: BlockId.FURNACE, count: 1 });
    const iron = s('iron_ingot'), stick = BlockId.STICK;
    const pick = [iron, iron, iron, 0, stick, 0, 0, stick, 0].map((state) => (state ? { state, count: 1 } : null));
    expect(craftResult(pick, 3)).toEqual({ state: s('iron_pickaxe'), count: 1 });
    expect(getBlockDef(s('iron_pickaxe')).variants).toBe(TOOL_TIERS.iron.uses);
    expect(breakSeconds(BlockId.STONE, s('iron_pickaxe'), true)).toBeLessThan(breakSeconds(BlockId.STONE, s('stone_pickaxe'), true));
  });

  it('faces the placer, shows its mouth on that side only, and drops a plain furnace', () => {
    expect(FACINGS[facingVariant(0.2, -3)]).toEqual([0, -1]);
    expect(FACINGS[facingVariant(5, 1)]).toEqual([1, 0]);
    const east = BlockId.LIT_FURNACE + facingVariant(1, 0);
    expect(blockFaceTile(east, 1, 0, 0)).toBe(Tile.FURNACE_FRONT_LIT);
    expect(blockFaceTile(east, -1, 0, 0)).toBe(Tile.FURNACE_SIDE);
    expect(blockFaceTile(BlockId.FURNACE + 2, 0, 0, 1)).toBe(Tile.FURNACE_FRONT);
    expect(getBlockDef(BlockId.LIT_FURNACE).lightEmission).toBeGreaterThan(0);
    expect(blockDrop(east)).toEqual({ state: BlockId.FURNACE, count: 1 });
    expect(blockDrop(BlockId.COAL_ORE)).toEqual({ state: BlockId.COAL, count: 1 });
  });

  it('round-trips furnaces in a save, leaves them out when there are none, and repairs bad ones', () => {
    const furnace = { x: 3, y: -2, z: 9, slots: [stack('sand', 4), null, stack('glass', 2)] as [ItemStack, null, ItemStack], burnS: 4, burnTotalS: 15, cookS: 2.5 };
    expect(parseMeta(metaRecord({ ...sampleMeta, furnaces: [furnace] }))?.furnaces).toEqual([furnace]);
    expect('furnaces' in metaRecord(sampleMeta)).toBe(false);
    const repaired = parseMeta({ ...metaRecord(sampleMeta), furnaces: [{ x: 1.5, y: 0, z: 0, slots: [null, null, null] },
      { x: 0, y: 0, z: 0, slots: [{ name: 'nope', count: 1 }, null, null], burnS: -3, cookS: 'x' }] })?.furnaces;
    expect(repaired).toEqual([{ x: 0, y: 0, z: 0, slots: [null, null, null], burnS: 0, burnTotalS: 0, cookS: 0 }]);
  });
});
