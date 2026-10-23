import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { BlockId, CROP_STAGES, SNOW_LAYERS, snowState } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { metaRecord, parseMeta, type WorldMeta } from '../src/storage/save';
import { World } from '../src/world/world';

/** A grass field at y = 5 with a wheat seed on (3, 6, 3) and water at (8, 5, 8); the weather is the test's. */
function farm(weather: { temperatureC: number; snowing: boolean }) {
  const world = new World(7);
  const chunk = new Chunk(0, 0, 0);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.blocks[localIndex(x, 5, z)] = BlockId.GRASS;
  chunk.blocks[localIndex(8, 5, 8)] = BlockId.WATER;
  world.addChunk(chunk);
  world.installColumnTops(0, 0, new Int32Array(256).fill(5));
  world.setBlock(3, 6, 3, BlockId.WHEAT); // an edit, like a planted seed
  world.surfaceWeather = () => weather;
  return world;
}

/** Unloads chunk (0, 0, 0), lets `ticks` pass, and loads it again with its edits, as the chunk manager does. */
function away(world: World, ticks: number): void {
  const blocks = world.getChunk(0, 0, 0)!.blocks.slice();
  world.removeChunk(0, 0, 0);
  world.loadTicks([], world.currentTick + ticks);
  const chunk = new Chunk(0, 0, 0);
  chunk.blocks.set(blocks);
  world.applyEdits(chunk);
  world.addChunk(chunk);
}

describe('catch-up on reload (T-G7)', () => {
  it('a long absence in warm weather ripens a crop; a short one changes nothing', () => {
    const warm = farm({ temperatureC: 22, snowing: false });
    away(warm, 5);
    expect(warm.getBlock(3, 6, 3)).toBe(BlockId.WHEAT);
    away(warm, 200_000);
    expect(warm.getBlock(3, 6, 3)).toBe(BlockId.WHEAT + CROP_STAGES - 1);
  });

  it('a crop does not grow in the cold', () => {
    const cold = farm({ temperatureC: -5, snowing: false });
    away(cold, 200_000);
    expect(cold.getBlock(3, 6, 3)).toBe(BlockId.WHEAT);
  });

  it('snow builds up and water freezes in a snowstorm, then both go in a thaw', () => {
    const weather = { temperatureC: -5, snowing: true };
    const world = farm(weather);
    away(world, 200_000);
    expect(world.getBlock(10, 6, 10)).toBe(snowState(SNOW_LAYERS));
    expect(world.getBlock(8, 5, 8)).toBe(BlockId.ICE);
    Object.assign(weather, { temperatureC: 10, snowing: false });
    away(world, 200_000);
    expect(world.getBlock(10, 6, 10)).toBe(BlockId.AIR);
    expect(world.getBlock(8, 5, 8)).toBe(BlockId.WATER);
  });

  it('an unloaded edited chunk keeps its age through a save', () => {
    const world = farm({ temperatureC: 22, snowing: false });
    world.removeChunk(0, 0, 0);
    world.loadTicks([], world.currentTick + 30);
    expect(world.snapshotChunkAges()).toEqual([['0,0,0', 30]]);
    const meta = { seed: 7, chunkAges: world.snapshotChunkAges(), player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false },
      selectedSlot: 0, inventory: [], items: [], timeOfDay: 0, timeOfYear: 0, gameMode: 'creative', health: 20, hunger: 20, air: 15 } as WorldMeta;
    expect(parseMeta(JSON.stringify(metaRecord(meta)))?.chunkAges).toEqual([['0,0,0', 30]]);
    expect(parseMeta({ ...metaRecord(meta), chunkAges: [['bad', 1], ['1,2,3', -1]] })?.chunkAges).toEqual([]);
    const reloaded = new World(7);
    reloaded.loadTicks([], 100);
    reloaded.loadChunkAges([['0,0,0', 30]]);
    expect(reloaded.snapshotChunkAges()).toEqual([]); // no edits loaded in this world, so nothing to catch up
  });
});
