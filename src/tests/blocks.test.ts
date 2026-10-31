import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCKS_SKY, BlockRegistry, CULL_SAME, OPAQUE, SOLID } from '../engine/blocks';

describe('block registry', () => {
  it('starts with air and names every state reversibly', () => {
    expect(BLOCKS.stateName(0)).toBe('air');
    for (let s = 0; s < BLOCKS.stateCount; s++) expect(BLOCKS.parseStateName(BLOCKS.stateName(s))).toBe(s);
    expect(BLOCKS.parseStateName('stone#1')).toBeNull();
    expect(BLOCKS.parseStateName('nope')).toBeNull();
    expect(BLOCKS.stateName(BLOCKS.state('snow', 3))).toBe('snow#3');
  });

  it('derives flags from layer and shape', () => {
    const f = (key: string) => BLOCKS.flags[BLOCKS.state(key)]!;
    expect(f('stone') & (OPAQUE | SOLID | BLOCKS_SKY)).toBe(OPAQUE | SOLID | BLOCKS_SKY);
    expect(f('air')).toBe(0);
    expect(f('water') & OPAQUE).toBe(0);
    expect(f('water') & BLOCKS_SKY).toBe(BLOCKS_SKY);
    expect(f('glass') & (BLOCKS_SKY | CULL_SAME)).toBe(CULL_SAME);
    expect(f('leaves') & (OPAQUE | BLOCKS_SKY)).toBe(BLOCKS_SKY);
    expect(f('tall_grass') & (SOLID | BLOCKS_SKY)).toBe(0);
    expect(BLOCKS.byName('ice').layer).toBe('ice');
    expect(BLOCKS.emission[BLOCKS.state('glowstone')]).toBe(15);
  });

  it('makes two-variant slabs of full solid cubes only', () => {
    const slab = BLOCKS.byName('stone_slab');
    expect(slab.variants).toBe(2);
    expect(slab.slabOf).toBe('stone');
    expect(slab.opaque).toBe(false);
    expect(() => BLOCKS.byName('sand_slab')).toThrow();
    expect(() => BLOCKS.byName('glass_slab')).toThrow();
  });

  it('rejects bad tables', () => {
    const tiles = { top: 'a', side: 'a', bottom: 'a' };
    expect(() => new BlockRegistry([{ key: 'a', name: 'A', tiles }, { key: 'a', name: 'A', tiles }])).toThrow(/Duplicate/);
    expect(() => new BlockRegistry([{ key: 'A b', name: 'A', tiles }])).toThrow(/Invalid/);
    expect(() => new BlockRegistry([{ key: 'a', name: 'A', tiles, variants: 0 }])).toThrow(/variant/);
  });
});
