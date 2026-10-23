import { describe, expect, it } from 'vitest';
import { CROP_HARVEST_YIELD, FOOD_HUNGER } from '../src/config';
import { localIndex } from '../src/core/coords';
import { BlockId, CROP_STAGES, Tile, blockDrop, blockFaceTile, foodValue, isCropState, slabState } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { cropGrowthFactor, growCrop } from '../src/world/crops';
import { handleRandomTick } from '../src/world/ecology';
import { World } from '../src/world/world';

/** Grass at y = 5 in one chunk, column tops installed, and weather the test controls. */
function field(weather: { temperatureC: number; snowing: boolean } | null) {
  const world = new World(3);
  const chunk = new Chunk(0, 0, 0);
  world.addChunk(chunk);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.blocks[localIndex(x, 5, z)] = BlockId.GRASS;
  world.installColumnTops(0, 0, new Int32Array(256).fill(5));
  if (weather) world.surfaceWeather = () => weather;
  return world;
}

describe('crops (T-G4)', () => {
  it('has wheat, carrots and potatoes, each with its own tile per growth stage', () => {
    for (const crop of [BlockId.WHEAT, BlockId.CARROTS, BlockId.POTATOES]) {
      for (let stage = 0; stage < CROP_STAGES; stage++) expect(isCropState(crop + stage)).toBe(true);
      expect(blockFaceTile(crop + 1, 1, 0, 0)).toBe(blockFaceTile(crop, 1, 0, 0) + 1);
    }
    expect(blockFaceTile(BlockId.WHEAT + CROP_STAGES - 1, 1, 0, 0)).toBe(Tile.WHEAT + CROP_STAGES - 1);
    expect(isCropState(BlockId.POTATOES + CROP_STAGES)).toBe(false);
    expect(isCropState(BlockId.SAPLING)).toBe(false);
  });

  it('grows fastest when warm, not in the cold or extreme heat, and root crops tolerate more cold', () => {
    expect(cropGrowthFactor(BlockId.WHEAT, 0)).toBe(0);
    expect(cropGrowthFactor(BlockId.WHEAT, 12.5)).toBeCloseTo(0.5);
    expect(cropGrowthFactor(BlockId.WHEAT + 2, 20)).toBe(1);
    expect(cropGrowthFactor(BlockId.WHEAT, 45)).toBe(0);
    expect(cropGrowthFactor(BlockId.CARROTS, 4)).toBeGreaterThan(cropGrowthFactor(BlockId.WHEAT, 4));
  });

  it('advances a stage at a time under open sky on grass, and stays ripe', () => {
    const world = field({ temperatureC: 20, snowing: false });
    world.setBlock(8, 6, 8, BlockId.CARROTS);
    handleRandomTick(world, 8, 6, 8, () => 0);
    expect(world.getBlock(8, 6, 8)).toBe(BlockId.CARROTS + 1);
    for (let i = 0; i < 10; i++) growCrop(world, 8, 6, 8, () => 0);
    expect(world.getBlock(8, 6, 8)).toBe(BlockId.CARROTS + CROP_STAGES - 1);
  });

  it('does not grow in the cold, under a roof, on stone, or without the game weather', () => {
    const cold = field({ temperatureC: -2, snowing: false });
    cold.setBlock(8, 6, 8, BlockId.WHEAT);
    growCrop(cold, 8, 6, 8, () => 0);
    expect(cold.getBlock(8, 6, 8)).toBe(BlockId.WHEAT);
    const roofed = field({ temperatureC: 20, snowing: false });
    roofed.setBlock(8, 6, 8, BlockId.WHEAT);
    roofed.setBlock(8, 9, 8, BlockId.STONE);
    growCrop(roofed, 8, 6, 8, () => 0);
    expect(roofed.getBlock(8, 6, 8)).toBe(BlockId.WHEAT);
    const rock = field({ temperatureC: 20, snowing: false });
    rock.setBlock(8, 5, 8, BlockId.STONE);
    rock.setBlock(8, 6, 8, BlockId.WHEAT);
    growCrop(rock, 8, 6, 8, () => 0);
    expect(rock.getBlock(8, 6, 8)).toBe(BlockId.WHEAT);
    const noWeather = field(null);
    noWeather.setBlock(8, 6, 8, BlockId.WHEAT);
    growCrop(noWeather, 8, 6, 8, () => 0);
    expect(noWeather.getBlock(8, 6, 8)).toBe(BlockId.WHEAT);
  });

  it('drops what you plant: one when unripe, a harvest when ripe; other blocks drop themselves', () => {
    expect(blockDrop(BlockId.POTATOES + 1)).toEqual({ state: BlockId.POTATOES, count: 1 });
    expect(blockDrop(BlockId.POTATOES + CROP_STAGES - 1)).toEqual({ state: BlockId.POTATOES, count: CROP_HARVEST_YIELD });
    expect(blockDrop(BlockId.STONE)).toEqual({ state: BlockId.STONE, count: 1 });
    expect(blockDrop(slabState(BlockId.STONE, true))).toEqual({ state: slabState(BlockId.STONE), count: 1 });
  });
});

describe('food (T-I8)', () => {
  it('the planted stage of each crop restores its hunger value; other states are not food', () => {
    expect(foodValue(BlockId.WHEAT)).toBe(FOOD_HUNGER.wheat);
    expect(foodValue(BlockId.CARROTS)).toBe(FOOD_HUNGER.carrots);
    expect(foodValue(BlockId.POTATOES)).toBe(FOOD_HUNGER.potatoes);
    expect(foodValue(BlockId.POTATOES + CROP_STAGES - 1)).toBe(0); // a growing crop is a block, not an item
    expect(foodValue(BlockId.GRASS)).toBe(0);
  });
});
