import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { craftResult } from '../game/crafting';
import { smeltResult } from '../game/furnace';
import type { ItemStack } from '../game/inventory';
import { breakSeconds, canHarvest, dropsOf } from '../game/mining';
import { Play } from '../game/play';
import { bearing } from '../ui/minimap';
import { Generator } from '../worldgen/generator';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const one = (key: string): ItemStack => ({ state: S(key), count: 1 });
const grid = (rows: string[]) => rows.flatMap((r) => [...r].map((c) => (c === ' ' ? null : one({ D: 'diamond', S: 'stick', L: 'leather', G: 'gold_ingot', I: 'iron_ingot' }[c]!))));

describe('progression past iron', () => {
  it('smelts gold, mines diamonds with iron, and makes diamond tools that dig fastest', () => {
    expect(smeltResult(one('gold_ore'))).toBe(S('gold_ingot'));
    expect(dropsOf(S('diamond_ore'), one('iron_pickaxe'), 0)).toEqual([one('diamond')]);
    expect(canHarvest(S('diamond_ore'), one('stone_pickaxe'))).toBe(false);
    expect(craftResult(grid(['DDD', ' S ', ' S ']), 3)).toEqual(one('diamond_pickaxe'));
    expect(breakSeconds(S('stone'), one('diamond_pickaxe'))).toBeLessThan(breakSeconds(S('stone'), one('iron_pickaxe')));
  });

  it('keeps ember crystals for diamond pickaxes only', () => {
    expect(canHarvest(S('ember_ore'), one('iron_pickaxe'))).toBe(false);
    expect(dropsOf(S('ember_ore'), one('diamond_pickaxe'), 0)).toEqual([one('ember_crystal')]);
  });

  it('generates ember ore only below -100 m, and no redstone or emerald', () => {
    const gen = new Generator(3), out = new Uint16Array(CHUNK_VOLUME);
    let ember = 0;
    for (let cy = -60; cy <= 2; cy += 1) for (let cx = 0; cx < 3; cx++) {
      if (gen.generate(cx, cy, 0, out) >= 0) continue;
      for (let i = 0; i < CHUNK_VOLUME; i++) {
        const key = BLOCKS.type(out[i]!).key;
        expect(key === 'redstone_ore' || key === 'emerald_ore').toBe(false);
        if (key !== 'ember_ore') continue;
        ember++;
        expect((cy * CHUNK_SIZE + (i >> 8)) * 0.6).toBeLessThanOrEqual(-100);
      }
    }
    expect(ember).toBeGreaterThan(0);
  });

  it('crafts armour, which stops harm, keeps warm, wears out and is saved', () => {
    expect(craftResult(grid(['L L', 'LLL', 'LLL']), 3)).toEqual(one('leather_chestplate'));
    const world = new World();
    world.add(new Chunk(0, 0, 0, 0));
    const play = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true }, 'survival');
    expect(play.protect(10)).toBe(10);
    play.armour[1] = one('iron_chestplate');
    play.armour[0] = one('leather_helmet');
    expect(play.protect(10)).toBeCloseTo(10 * (1 - 7 * 0.04));
    expect(play.warmth).toBe(4);
    const back = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true });
    back.load(JSON.parse(JSON.stringify(play.save())));
    expect(back.armour[1]).toEqual({ state: S('iron_chestplate'), count: 1, wear: 1 });
    // Only a piece for that slot goes in it.
    back.cursor = one('leather_boots');
    back.clickArmour(0, false);
    expect(back.cursor).toEqual(one('leather_boots'));
  });

  it('makes compasses from gold and iron, and points them the right way', () => {
    expect(craftResult(grid([' G ', 'GIG', ' G ']), 3)).toEqual(one('compass'));
    // Looking along -z (yaw 0): ahead is 0, to +x is right (+π/2), behind is ±π.
    expect(bearing(0, 0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearing(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(bearing(0, 0, 0, 0, 10))).toBeCloseTo(Math.PI);
  });
});
