import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, CHUNK_SIZE, CHUNK_VOLUME, DEPTHS_LAVA_M, DEPTHS_TOP_M } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Generator } from '../worldgen/generator';
import { canHarvest } from '../game/mining';
import { RECIPES } from '../game/crafting';

const N = CHUNK_SIZE;
const name = (s: number) => BLOCKS.type(s).key;

describe('the Ember Depths', () => {
  it('are basalt with ember stone and emberite, caverns of air over lava below the lava sea', () => {
    const gen = new Generator(1), counts = new Map<string, number>();
    let airBelowSea = 0, lavaAboveSea = 0;
    // A slab of chunks from the top of the Depths down past the lava sea.
    const cy0 = Math.floor(DEPTHS_LAVA_M / BLOCK_SIZE_M / N) - 1, cy1 = Math.floor((DEPTHS_TOP_M - 20) / BLOCK_SIZE_M / N);
    // Caverns are tens of metres across: sample chunks spread over 240 m.
    for (let cx = 0; cx < 40; cx += 5) for (let cz = 0; cz < 40; cz += 5) for (let cy = cy0; cy <= cy1; cy++) {
      const out = new Uint16Array(CHUNK_VOLUME), u = gen.generate(cx, cy, cz, out);
      if (u >= 0) out.fill(u);
      out.forEach((s, i) => {
        const k = name(s), ym = (cy * N + Math.floor(i / (N * N))) * BLOCK_SIZE_M;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        if (k === 'air' && ym < DEPTHS_LAVA_M - 8) airBelowSea++;
        if (k === 'lava' && ym > DEPTHS_LAVA_M + 8) lavaAboveSea++;
      });
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect((counts.get('basalt') ?? 0) / total).toBeGreaterThan(0.4);
    expect(counts.get('ember_stone') ?? 0).toBeGreaterThan(0);
    expect(counts.get('emberite_ore') ?? 0).toBeGreaterThan(0);
    expect(counts.get('lava') ?? 0).toBeGreaterThan(0);
    expect((counts.get('air') ?? 0) / total).toBeGreaterThan(0.05);
    expect(airBelowSea).toBe(0);
    expect(lavaAboveSea).toBe(0);
  });

  it('emberite needs a jade pickaxe, and its ingots make the sixth tier of gear', () => {
    const ore = BLOCKS.state('emberite_ore');
    expect(canHarvest(ore, { state: BLOCKS.state('diamond_pickaxe'), count: 1 })).toBe(false);
    expect(canHarvest(ore, { state: BLOCKS.state('jade_pickaxe'), count: 1 })).toBe(true);
    expect(BLOCKS.type(ore).smeltsTo).toBe('emberite_ingot');
    for (const k of ['emberite_pickaxe', 'emberite_sword', 'emberite_spear', 'emberite_hammer', 'emberite_helmet', 'emberite_chestplate'])
      expect(RECIPES.some((r) => BLOCKS.type(BLOCKS.state(r.result[0])).key === k), k).toBe(true);
    expect(BLOCKS.type(BLOCKS.state('emberite_pickaxe')).tool!.tier).toBe(6);
  });
});
