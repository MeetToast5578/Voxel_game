import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { localIndex } from '../src/core/coords';
import { BlockId, blocksSky } from '../src/world/blocks';
import { handleTick } from '../src/world/ecology';

describe('ecology - grass spreading', () => {
  it('spreads grass to adjacent lit dirt blocks', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);

    // Place grass at (8, 5, 8) - center of chunk
    chunk.blocks[localIndex(8, 5, 8)] = BlockId.GRASS;
    // Place dirt at (7, 5, 8) - adjacent to grass, nothing above (air = lit)
    chunk.blocks[localIndex(7, 5, 8)] = BlockId.DIRT;
    // Place dirt at (9, 5, 8) with a stone above it (not lit, shouldn't spread)
    chunk.blocks[localIndex(9, 5, 8)] = BlockId.DIRT;
    chunk.blocks[localIndex(9, 6, 8)] = BlockId.STONE;
    // Install column tops so world.setBlock works for grass spreading
    world.installColumnTops(0, 0, new Int32Array(256).fill(5));

    // Call handleTick directly 500 times with different dueTicks (each gets a different hash)
    let spread = false;
    for (let i = 1; i <= 500; i++) {
      handleTick(world, { x: 8, y: 5, z: 8, dueTick: i, reason: 'grass-spread' });
      if (world.getBlock(7, 5, 8) === BlockId.GRASS) {
        spread = true;
        break;
      }
    }
    expect(spread).toBe(true);
    // Stone above (9,6,8) blocks sunlight, so (9,5,8) should NOT get grass
    expect(world.getBlock(9, 5, 8)).toBe(BlockId.DIRT);
  });

  it('does not spread to non-dirt blocks', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);

    chunk.blocks[localIndex(8, 5, 8)] = BlockId.GRASS;
    chunk.blocks[localIndex(7, 5, 8)] = BlockId.STONE; // stone, not dirt
    world.installColumnTops(0, 0, new Int32Array(256).fill(5));

    let spread = false;
    for (let i = 1; i <= 500; i++) {
      handleTick(world, { x: 8, y: 5, z: 8, dueTick: i, reason: 'grass-spread' });
      if (world.getBlock(7, 5, 8) === BlockId.GRASS) {
        spread = true;
        break;
      }
    }
    expect(spread).toBe(false);
    expect(world.getBlock(7, 5, 8)).toBe(BlockId.STONE);
  });

  it('is deterministic', () => {
    const w1 = new World(42);
    const w2 = new World(42);
    const c1 = new Chunk(0, 0, 0);
    const c2 = new Chunk(0, 0, 0);
    w1.addChunk(c1);
    w2.addChunk(c2);

    c1.blocks[localIndex(8, 5, 8)] = BlockId.GRASS;
    c1.blocks[localIndex(7, 5, 8)] = BlockId.DIRT;
    c2.blocks[localIndex(8, 5, 8)] = BlockId.GRASS;
    c2.blocks[localIndex(7, 5, 8)] = BlockId.DIRT;
    w1.installColumnTops(0, 0, new Int32Array(256).fill(5));
    w2.installColumnTops(0, 0, new Int32Array(256).fill(5));
    for (let i = 1; i <= 500; i++) {
      handleTick(w1, { x: 8, y: 5, z: 8, dueTick: i, reason: 'grass-spread' });
      handleTick(w2, { x: 8, y: 5, z: 8, dueTick: i, reason: 'grass-spread' });
    }

    expect(w1.getBlock(7, 5, 8)).toBe(w2.getBlock(7, 5, 8));
  });

  it('handleTick returns handled for grass-spread', () => {
    const world = new World(42);
    const result = handleTick(world, { x: 0, y: 0, z: 0, dueTick: 1, reason: 'grass-spread' });
    expect(result).toBe('handled');
  });

  it('unknown tick reason returns handled', () => {
    const world = new World(42);
    const result = handleTick(world, { x: 0, y: 0, z: 0, dueTick: 1, reason: 'unknown-reason' });
    expect(result).toBe('handled');
  });

  it('blocksSky correctly identifies sky-blocking blocks', () => {
    expect(blocksSky(BlockId.AIR)).toBe(false);
    expect(blocksSky(BlockId.GLASS)).toBe(false);
    expect(blocksSky(BlockId.GRASS)).toBe(true);
    expect(blocksSky(BlockId.STONE)).toBe(true);
    expect(blocksSky(BlockId.WATER)).toBe(true); // water blocks sky in this game
  });
});
