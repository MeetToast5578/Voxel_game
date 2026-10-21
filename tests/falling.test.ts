import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/world/chunk';
import { BlockId } from '../src/world/blocks';
import { FALL_REASON, scheduleFallChecks, scheduleFallingBlocks } from '../src/world/falling';
import { World } from '../src/world/world';

/** Three chunks stacked on the origin column, so falls can cross the chunk border at y = 16. Column tops start open. */
function stacked(): World {
  const world = new World(1);
  for (const cy of [-1, 0, 1]) world.addChunk(new Chunk(0, cy, 0));
  world.installColumnTops(0, 0, new Int32Array(256).fill(-1000));
  return world;
}

/** Sets a block and asks for the fall checks a player edit would ask for. */
function place(world: World, x: number, y: number, z: number, id: number): void {
  expect(world.setBlock(x, y, z, id)).toBe(true);
  scheduleFallChecks(world, x, y, z);
}

function settle(world: World, steps = 40): void {
  for (let i = 0; i < steps; i++) world.tickStep(1000);
}

describe('falling blocks (spec 25, slice 3)', () => {
  it('falls one block every two ticks, as in Minecraft, so a fall takes time', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 5, 0, BlockId.SAND);
    world.tickStep(1000);
    expect(world.getBlock(0, 5, 0)).toBe(BlockId.SAND); // one tick is not enough to move
    world.tickStep(1000);
    expect(world.getBlock(0, 4, 0)).toBe(BlockId.SAND); // the first move, on the second tick
  });

  it('a single column of sand falls to the ground', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 10, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
  });

  it('a stack of two sand blocks falls and lands in order', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 10, 0, BlockId.SAND);
    place(world, 0, 11, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
    expect(world.getBlock(0, 2, 0)).toBe(BlockId.SAND);
    expect(world.getBlock(0, 3, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 11, 0)).toBe(BlockId.AIR);
  });

  it.each([BlockId.TALL_GRASS, BlockId.LILY_PAD, BlockId.MOSS])('sand falling onto plant %i replaces it', (plant) => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 2, 0, plant);
    place(world, 0, 6, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
    expect(world.getBlock(0, 2, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 6, 0)).toBe(BlockId.AIR);
  });

  it('sand falling into water replaces the water', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 1, 0, BlockId.WATER);
    place(world, 0, 4, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
  });

  it('a fall across a chunk border completes with no gap or duplicate', () => {
    const world = stacked();
    place(world, 0, -1, 0, BlockId.STONE); // floor in the chunk below
    place(world, 0, 20, 0, BlockId.SAND); // starts in the chunk above the border at y = 16
    settle(world);
    let sand = 0;
    for (let y = -16; y < 32; y++) if (world.getBlock(0, y, 0) === BlockId.SAND) sand++;
    expect(sand).toBe(1);
    expect(world.getBlock(0, 0, 0)).toBe(BlockId.SAND);
  });

  it('removing the block under a falling block starts its fall', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 5, 0, BlockId.STONE);
    place(world, 0, 6, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 6, 0)).toBe(BlockId.SAND); // the stone at 5 holds it up
    expect(world.setBlock(0, 5, 0, BlockId.AIR)).toBe(true);
    scheduleFallChecks(world, 0, 5, 0);
    settle(world);
    expect(world.getBlock(0, 6, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
  });

  it('a block that is already on solid ground stays where it is', () => {
    const world = stacked();
    place(world, 0, 0, 0, BlockId.STONE);
    place(world, 0, 1, 0, BlockId.SAND);
    settle(world);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
    expect(world.getBlock(0, 2, 0)).toBe(BlockId.AIR);
  });

  it('a falling block that was saved mid-fall resumes its fall once its chunk loads', () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.blocks[0] = BlockId.STONE; // world (0, 0, 0): the floor
    chunk.blocks[(7 * 16 + 0) * 16 + 0] = BlockId.SAND; // mid-air at world y = 7 (local index (ly*16+lz)*16+lx)
    const world = new World(1);
    world.addChunk(new Chunk(0, -1, 0));
    world.addChunk(chunk);
    world.addChunk(new Chunk(0, 1, 0));
    world.installColumnTops(0, 0, new Int32Array(256).fill(-1000));
    // The chunk was loaded from a save: no tick was saved, so the load-time scan has to find the sand.
    scheduleFallingBlocks(world, chunk);
    settle(world);
    expect(world.getBlock(0, 7, 0)).toBe(BlockId.AIR);
    expect(world.getBlock(0, 1, 0)).toBe(BlockId.SAND);
  });

  it('does not fall into a chunk that is not loaded', () => {
    const world = new World(1);
    world.addChunk(new Chunk(0, 0, 0)); // only the chunk at y 0..15 is loaded
    world.installColumnTops(0, 0, new Int32Array(256).fill(-1000));
    place(world, 0, 0, 0, BlockId.SAND);
    settle(world);
    // The cell below (y = -1) is in an unloaded chunk, so the write is refused and the sand stays put.
    expect(world.getBlock(0, 0, 0)).toBe(BlockId.SAND);
  });

  it('uses its own tick reason, so other rules never run it', () => {
    expect(FALL_REASON).toBe('fall');
  });
});
