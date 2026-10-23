import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { mulberry32 } from '../src/core/random';
import { BlockId, blockTopHeight, snowState } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { deciduousAt, seasonalWeights } from '../src/world/climateTint';
import { foliageSeason } from '../src/world/calendar';
import { handleRandomTick } from '../src/world/ecology';
import { World } from '../src/world/world';

/** Grass at y = 2 and a leaf canopy at y = 10..11 over column (4, 4); stone ground under (9, 9) with leaves above. */
function grove(fall: number) {
  const world = new World(5);
  const chunk = new Chunk(0, 0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.blocks[localIndex(x, 2, z)] = BlockId.GRASS;
  chunk.blocks[localIndex(9, 2, 9)] = BlockId.STONE;
  for (const [x, z] of [[4, 4], [9, 9]] as const) for (const y of [10, 11]) chunk.blocks[localIndex(x, y, z)] = BlockId.LEAVES;
  world.addChunk(chunk);
  const tops = new Int32Array(256).fill(2);
  tops[4 * 16 + 4] = 11; tops[9 * 16 + 9] = 11;
  world.installColumnTops(0, 0, tops);
  world.leafFall = () => fall;
  return world;
}

function tickMany(world: World, x: number, y: number, z: number, n: number): void {
  const rng = mulberry32(9);
  for (let i = 0; i < n; i++) handleRandomTick(world, x, y, z, rng);
}

describe('leaf litter (T-G6)', () => {
  it('in autumn, leaves drop litter through the canopy onto the grass below', () => {
    const world = grove(1);
    tickMany(world, 4, 10, 4, 2000);
    expect(world.getBlock(4, 3, 4)).toBe(BlockId.LEAF_LITTER);
    expect(blockTopHeight(BlockId.LEAF_LITTER)).toBeLessThan(0.1);
  });

  it('lands only on grass or dirt, and not at all out of autumn', () => {
    const world = grove(1);
    tickMany(world, 9, 11, 9, 2000);
    expect(world.getBlock(9, 3, 9)).toBe(BlockId.AIR); // stone ground
    const summer = grove(0);
    tickMany(summer, 4, 11, 4, 2000);
    expect(summer.getBlock(4, 3, 4)).toBe(BlockId.AIR);
  });

  it('rots once autumn is over, and snow buries it', () => {
    const world = grove(0);
    world.setBlock(4, 3, 4, BlockId.LEAF_LITTER);
    tickMany(world, 4, 3, 4, 1000);
    expect(world.getBlock(4, 3, 4)).toBe(BlockId.AIR);

    const snowy = grove(1);
    snowy.setBlock(6, 3, 6, BlockId.LEAF_LITTER);
    snowy.surfaceWeather = () => ({ temperatureC: -5, snowing: true });
    tickMany(snowy, 6, 2, 6, 1000);
    expect(snowy.getBlock(6, 3, 6)).toBeGreaterThanOrEqual(snowState(1));
  });

  it('leaf fall follows the autumn season and the climate', () => {
    expect(foliageSeason(0.75).autumn).toBe(1);
    expect(foliageSeason(0.25).autumn).toBe(0);
    expect(seasonalWeights(10, 0.5)[0]).toBe(1); // temperate trees shed their leaves
    expect(seasonalWeights(-15, 0.5)[0]).toBe(0); // boreal ones keep them
    const d = deciduousAt(5, 100, 50, 100);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });
});
