import { describe, expect, it } from 'vitest';
import {
  BLOCK_STATE_COUNT, BLOCKS, BlockId, blockStateName, blockVariant, buildBlockRegistry, getBlockDef, isOpaque, isSolid,
  lightEmission, makeBlockState, parseBlockStateName, type BlockTypeDef,
} from '../src/world/blocks';

describe('blocks', () => {
  it('block types occupy contiguous, non-overlapping state ranges', () => {
    let next = 0;
    BLOCKS.forEach((b) => { expect(b.id).toBe(next); next += b.variants; });
    expect(next).toBe(BLOCK_STATE_COUNT);
    expect(BLOCKS.filter(d => d.shape !== 'slab').length).toBe(Object.keys(BlockId).length);
  });
  it('air, water and see-through blocks', () => {
    expect(isSolid(BlockId.AIR)).toBe(false);
    expect(isOpaque(BlockId.AIR)).toBe(false);
    expect(isSolid(BlockId.WATER)).toBe(false);
    expect(getBlockDef(BlockId.WATER).layer).toBe('translucent');
    expect(getBlockDef(BlockId.WATER).targetable).toBe(false);
    expect(isOpaque(BlockId.LEAVES)).toBe(false);
    expect(isSolid(BlockId.LEAVES)).toBe(true);
    expect(isOpaque(BlockId.GLASS)).toBe(false);
    expect(isOpaque(BlockId.STONE)).toBe(true);
    expect(getBlockDef(BlockId.BEDROCK).breakable).toBe(false);
  });
  it('every non-air block has a render layer and valid tiles', () => {
    for (const b of BLOCKS.slice(1)) {
      expect(b.layer).not.toBe('none');
      for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(256);
      }
    }
  });
  it('getBlockDef throws on unknown ids', () => {
    expect(() => getBlockDef(200)).toThrow();
  });
});

describe('block states', () => {
  const OLD_IDS: Record<string, number> = {
    AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, PLANKS: 8, GLASS: 9, BEDROCK: 10,
    COBBLESTONE: 11, BRICK: 12, GLOWSTONE: 13, GRANITE: 14, DIORITE: 15, ANDESITE: 16, SANDSTONE: 17,
    TALL_GRASS: 18, POPPY: 19, FERN: 20, DANDELION: 21, LIMESTONE: 22, SLATE: 23, BASALT: 24, DEEPSLATE: 25,
    BROWN_MUSHROOM: 26, RED_MUSHROOM: 27, COAL_ORE: 28, IRON_ORE: 29, GOLD_ORE: 30, REDSTONE_ORE: 31,
    DIAMOND_ORE: 32, EMERALD_ORE: 33, LAPIS_ORE: 34, GRAVEL: 35, FLOWING_WATER: 36, CACTUS: 52, CLAY: 53, LAVA: 54, FLOWING_LAVA: 55, OBSIDIAN: 71, REED: 72, FALLEN_LOG_X: 73, FALLEN_LOG_Z: 74, LILY_PAD: 75, MOSS: 76,
    SNOW: 143, ICE: 151, SAPLING: 152, WHEAT: 166, CARROTS: 170, POTATOES: 174, LEAF_LITTER: 178,
  };

  it('keeps every BlockId number, named after its key', () => {
    expect(Object.keys(BlockId)).toEqual(Object.keys(OLD_IDS));
    for (const [name, state] of Object.entries(BlockId)) {
      expect(state).toBe(OLD_IDS[name]);
      expect(blockStateName(state)).toBe(name.toLowerCase());
      expect(getBlockDef(state).key).toBe(name.toLowerCase());
      expect(blockVariant(state)).toBe(0);
    }
    // Slab types append after the first 77 states; snow, ice (T-G2), saplings (T-G3) and crops (T-G4) append after the slabs.
    expect(BLOCKS.filter(d => d.shape !== 'slab' && d.id < 77).reduce((n, d) => n + d.variants, 0)).toBe(77);
    expect(Math.min(...BLOCKS.filter(d => d.shape === 'slab').map(d => d.id))).toBe(77);
  });
  it('ores are stone-like blocks: solid, opaque, breakable, with a painted tile', () => {
    for (const id of [BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.GOLD_ORE, BlockId.REDSTONE_ORE, BlockId.DIAMOND_ORE, BlockId.EMERALD_ORE, BlockId.LAPIS_ORE]) {
      expect(isSolid(id)).toBe(true);
      expect(isOpaque(id)).toBe(true);
      expect(getBlockDef(id).breakable).toBe(true);
      expect(Number.isFinite(getBlockDef(id).hardness)).toBe(true);
      expect(getBlockDef(id).hardness).toBeGreaterThanOrEqual(0);
    }
    expect(getBlockDef(BlockId.COAL_ORE).hardness).toBe(2);
    expect(getBlockDef(BlockId.DIAMOND_ORE).hardness).toBe(4);
    expect(getBlockDef(BlockId.EMERALD_ORE).hardness).toBe(4);
  });
  it('round-trips every state through its name', () => {
    for (let state = 0; state < BLOCK_STATE_COUNT; state++) {
      expect(parseBlockStateName(blockStateName(state))).toBe(state);
    }
  });
  it('parses unknown or non-canonical names to null', () => {
    for (const name of ['nope', 'stone#1', 'stone#-1', '#2', '', 'stone#0', 'Stone', 'stone#01'])
      expect(parseBlockStateName(name)).toBeNull();
  });
  it('treats unregistered states as air in the lookups', () => {
    expect(isOpaque(60000)).toBe(false);
    expect(isSolid(60000)).toBe(false);
    expect(lightEmission(60000)).toBe(0);
    expect(() => getBlockDef(60000)).toThrow();
  });
  it('makeBlockState rejects variants out of range', () => {
    const stone = getBlockDef(BlockId.STONE);
    expect(makeBlockState(stone, 0)).toBe(BlockId.STONE);
    expect(() => makeBlockState(stone, 1)).toThrow();
    expect(() => makeBlockState(stone, -1)).toThrow();
  });

  describe('buildBlockRegistry', () => {
    const type = (key: string, variants = 1, opts: Partial<BlockTypeDef> = {}): BlockTypeDef => ({
      key, variants, name: key, solid: true, opaque: true, targetable: true, breakable: true, cullSame: false,
      lightEmission: 0, layer: 'opaque', tiles: { top: 0, side: 0, bottom: 0 }, ...opts,
    });

    it('gives a multi-variant type a run of consecutive states', () => {
      const reg = buildBlockRegistry([
        type('air', 1, { solid: false, opaque: false }), type('snow', 8, { opaque: false }), type('stone'),
      ]);
      const snow = reg.types[1]!;
      expect(reg.stateCount).toBe(10);
      for (let v = 0; v < 8; v++) {
        const state = reg.makeState(snow, v);
        expect(state).toBe(1 + v);
        expect(reg.getBlockDef(state)).toBe(snow);
        expect(reg.variantOf(state)).toBe(v);
        expect(reg.isOpaque(state)).toBe(false);
        expect(reg.isSolid(state)).toBe(true);
        expect(reg.parseStateName(reg.stateName(state))).toBe(state);
      }
      expect(reg.stateName(1)).toBe('snow');
      expect(reg.stateName(8)).toBe('snow#7');
      expect(reg.parseStateName('snow#8')).toBeNull();
      expect(reg.types[2]!.id).toBe(9);
      expect(reg.getBlockDef(9).key).toBe('stone');
      expect(() => reg.makeState(snow, 8)).toThrow();
    });
    it('rejects duplicate keys, bad keys and more than 65,535 states', () => {
      expect(() => buildBlockRegistry([type('a'), type('a')])).toThrow();
      expect(() => buildBlockRegistry([type('Bad')])).toThrow();
      expect(() => buildBlockRegistry([type('a', 0)])).toThrow();
      expect(buildBlockRegistry([type('a', 65535)]).stateCount).toBe(65535);
      expect(() => buildBlockRegistry([type('a', 65535), type('b')])).toThrow();
    });
  });
});

describe('breaking (spec 24)', () => {
  it('every breakable block has a finite hardness, and plants break at once', () => {
    for (const b of BLOCKS) {
      if (!b.breakable) continue;
      expect(Number.isFinite(b.hardness)).toBe(true);
      expect(b.hardness).toBeGreaterThanOrEqual(0);
    }
    for (const id of [BlockId.TALL_GRASS, BlockId.POPPY, BlockId.FERN, BlockId.DANDELION, BlockId.BROWN_MUSHROOM, BlockId.RED_MUSHROOM]) {
      expect(getBlockDef(id).hardness).toBe(0);
    }
    expect(getBlockDef(BlockId.STONE).hardness).toBeGreaterThan(getBlockDef(BlockId.DIRT).hardness);
  });
});


describe('physics rule fields (spec 25, slice 2)', () => {
  it('default to no falling, flow only for flowing fluid states, and support the solid blocks except leaves', () => {
    for (const def of BLOCKS) {
      expect(def.flows).toBe(['flowing_water', 'flowing_lava'].includes(def.key));
      // Leaves are solid but hold nothing up (spec 25, slice 5): a canopy is not a support.
      expect(def.supports).toBe(def.key === 'leaves' || def.slabMaterial === BlockId.LEAVES ? false : def.solid);
      if (def.key !== 'sand' && def.key !== 'gravel') expect(def.falls).toBe(false);
    }
  });

  it('marks sand as falling, and keeps its name and solidity', () => {
    const sand = getBlockDef(BlockId.SAND);
    expect(sand.falls).toBe(true);
    expect(sand.solid).toBe(true);
    expect(blockStateName(BlockId.SAND)).toBe('sand');
  });
});
