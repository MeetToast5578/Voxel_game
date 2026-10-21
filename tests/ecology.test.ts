import { describe, expect, it } from 'vitest';
import { RANDOM_TICKS_PER_CHUNK } from '../src/config';
import { mulberry32 } from '../src/core/random';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { localIndex } from '../src/core/coords';
import { BlockId, blocksSky } from '../src/world/blocks';
import { handleRandomTick, handleTick, scheduleLeafDecay } from '../src/world/ecology';
import { orphanedLeaves } from '../src/world/leafDecay';

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

describe('ecology - random ticks', () => {
  /** One chunk with grass at (8,5,8), lit dirt at (7,5,8) and dirt under stone at (9,5,8). */
  function grassWorld(): World {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    chunk.blocks[localIndex(8, 5, 8)] = BlockId.GRASS;
    chunk.blocks[localIndex(7, 5, 8)] = BlockId.DIRT;
    chunk.blocks[localIndex(9, 5, 8)] = BlockId.DIRT;
    chunk.blocks[localIndex(9, 6, 8)] = BlockId.STONE;
    world.installColumnTops(0, 0, new Int32Array(256).fill(5));
    return world;
  }

  it('spreads grass to adjacent lit dirt, but not under a roof', () => {
    const world = grassWorld();
    const rng = mulberry32(1);
    for (let i = 0; i < 5000 && world.getBlock(7, 5, 8) !== BlockId.GRASS; i++) {
      handleRandomTick(world, 8, 5, 8, rng);
    }
    expect(world.getBlock(7, 5, 8)).toBe(BlockId.GRASS);
    expect(world.getBlock(9, 5, 8)).toBe(BlockId.DIRT); // stone above: never spreads
  });

  it('does nothing to a cell that is not grass', () => {
    const world = new World(1);
    world.addChunk(new Chunk(0, 0, 0));
    world.installColumnTops(0, 0, new Int32Array(256).fill(5));
    handleRandomTick(world, 1, 1, 1, () => 0);
    expect(world.getBlock(1, 1, 1)).toBe(BlockId.AIR);
  });

  it('randomTickStep visits RANDOM_TICKS_PER_CHUNK cells per loaded chunk, deterministically', () => {
    const run = () => {
      const world = grassWorld();
      const seen: string[] = [];
      const stats = world.randomTickStep(1000, (_w, x, y, z) => seen.push(`${x},${y},${z}`));
      return { seen, stats };
    };
    const a = run();
    const b = run();
    expect(a.seen).toEqual(b.seen);
    expect(a.stats.ran).toBe(RANDOM_TICKS_PER_CHUNK);
  });

  it('randomTickStep stops at once when the budget is zero', () => {
    const world = grassWorld();
    expect(world.randomTickStep(0).ran).toBe(0);
  });
});

describe('ecology - leaf decay', () => {
  it('finds the leaves a broken log alone was holding up, and none when a log remains', () => {
    const cells = new Map<string, number>();
    const set = (x: number, y: number, z: number, id: number) => cells.set(`${x},${y},${z}`, id);
    const get = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? BlockId.AIR;

    // The log's cell is already empty (that is what "broken" means).
    set(0, 1, 0, BlockId.LEAVES);
    set(1, 1, 0, BlockId.LEAVES);
    set(-1, 1, 0, BlockId.LEAVES);
    set(0, 2, 0, BlockId.LEAVES); // attached to (0,1,0), not to the log

    const orphans = orphanedLeaves(get, 0, 0, 0, 100);
    expect(orphans.map((o) => `${o.x},${o.y},${o.z}`).sort()).toEqual(['-1,1,0', '0,1,0', '0,2,0', '1,1,0']);
    expect(Math.max(...orphans.map((o) => o.depth))).toBe(2);

    // A second log next to the break still holds the canopy up.
    set(0, -1, 0, BlockId.LOG);
    expect(orphanedLeaves(get, 0, 0, 0, 100)).toEqual([]);
  });

  it('fells an orphaned canopy through the tick queue, in a cascade', () => {
    const world = new World(3);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    world.installColumnTops(0, 0, new Int32Array(256).fill(8));
    chunk.blocks[localIndex(8, 5, 8)] = BlockId.LOG;
    chunk.blocks[localIndex(8, 6, 8)] = BlockId.LEAVES;
    chunk.blocks[localIndex(9, 6, 8)] = BlockId.LEAVES;
    world.setBlock(8, 5, 8, BlockId.AIR);
    expect(scheduleLeafDecay(world, 8, 5, 8)).toBe(2);
    for (let i = 0; i < 10; i++) world.tickStep(100);
    expect(world.getBlock(8, 6, 8)).toBe(BlockId.AIR);
    expect(world.getBlock(9, 6, 8)).toBe(BlockId.AIR);
  });

  it('does not fell a canopy that another log still holds up', () => {
    const world = new World(4);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    world.installColumnTops(0, 0, new Int32Array(256).fill(8));
    chunk.blocks[localIndex(8, 4, 8)] = BlockId.LOG;
    chunk.blocks[localIndex(8, 5, 8)] = BlockId.LOG;
    chunk.blocks[localIndex(8, 6, 8)] = BlockId.LEAVES;
    world.setBlock(8, 5, 8, BlockId.AIR); // bottom log stays, so the leaves stay
    expect(scheduleLeafDecay(world, 8, 5, 8)).toBe(0);
    expect(world.getBlock(8, 6, 8)).toBe(BlockId.LEAVES);
  });
});

it('retains leaves when a replacement log restores support before the decay tick', () => {
  const world = new World(1); world.addChunk(new Chunk(0, 0, 0));
  world.installColumnTops(0, 0, new Int32Array(256).fill(8));
  world.setBlock(8, 6, 8, BlockId.LEAVES);
  world.scheduleTick(8, 6, 8, 2, 'leaf-decay');
  world.setBlock(8, 5, 8, BlockId.LOG);
  world.tickStep(100); world.tickStep(100);
  expect(world.getBlock(8, 6, 8)).toBe(BlockId.LEAVES);
});

it('defers a border leaf decay until missing neighbouring terrain is known', () => {
  const world = new World(1); world.addChunk(new Chunk(0, 0, 0));
  world.installColumnTops(0, 0, new Int32Array(256).fill(8));
  world.setBlock(15, 6, 8, BlockId.LEAVES);
  world.scheduleTick(15, 6, 8, 1, 'leaf-decay'); world.tickStep(100);
  expect(world.getBlock(15, 6, 8)).toBe(BlockId.LEAVES);
  world.addChunk(new Chunk(1, 0, 0)); world.tickStep(100);
  expect(world.getBlock(15, 6, 8)).toBe(BlockId.AIR);
});
