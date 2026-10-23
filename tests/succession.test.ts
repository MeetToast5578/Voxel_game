import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { mulberry32 } from '../src/core/random';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { handleRandomTick } from '../src/world/ecology';
import { isSaplingState } from '../src/world/saplings';
import { World } from '../src/world/world';

/** Grass at y = 4 everywhere, a stone roof over (9, 9), and hooks the test controls. */
function meadow(plant: number, species: 'oak' | null) {
  const world = new World(2);
  const chunk = new Chunk(0, 0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.blocks[localIndex(x, 4, z)] = BlockId.GRASS;
  chunk.blocks[localIndex(9, 8, 9)] = BlockId.STONE;
  world.addChunk(chunk);
  const tops = new Int32Array(256).fill(4);
  tops[9 * 16 + 9] = 8;
  world.installColumnTops(0, 0, tops);
  world.groundPlantAt = () => plant;
  world.treeSpeciesAt = () => species;
  return world;
}

const ticks = (world: World, x: number, y: number, z: number, n: number) => {
  const rng = mulberry32(4);
  for (let i = 0; i < n; i++) handleRandomTick(world, x, y, z, rng);
};

describe('plant succession (T-G5)', () => {
  it('bare open grass regrows its natural plant; roofed grass and naturally bare columns stay bare', () => {
    const world = meadow(BlockId.POPPY, null);
    ticks(world, 3, 4, 3, 1000);
    expect(world.getBlock(3, 5, 3)).toBe(BlockId.POPPY);
    ticks(world, 9, 4, 9, 1000);
    expect(world.getBlock(9, 5, 9)).toBe(BlockId.AIR);
    const bare = meadow(BlockId.AIR, null);
    ticks(bare, 3, 4, 3, 1000);
    expect(bare.getBlock(3, 5, 3)).toBe(BlockId.AIR);
  });

  it('tall grass becomes a sapling where trees grow, and stays grass where they do not', () => {
    const forest = meadow(BlockId.TALL_GRASS, 'oak');
    forest.setBlock(3, 5, 3, BlockId.TALL_GRASS);
    ticks(forest, 3, 5, 3, 5000);
    expect(isSaplingState(forest.getBlock(3, 5, 3))).toBe(true);
    const plain = meadow(BlockId.TALL_GRASS, null);
    plain.setBlock(3, 5, 3, BlockId.TALL_GRASS);
    ticks(plain, 3, 5, 3, 5000);
    expect(plain.getBlock(3, 5, 3)).toBe(BlockId.TALL_GRASS);
  });
});
