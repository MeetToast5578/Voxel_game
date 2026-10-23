import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { BlockId, SAPLING_SPECIES, getBlockDef } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { handleRandomTick, leafSapling } from '../src/world/ecology';
import { growSapling, isSaplingState, saplingState } from '../src/world/saplings';
import { World } from '../src/world/world';

const GROUND = 40;

/** Grass at y = GROUND over chunks cx, cz -3..3 and cy 0..6 (enough for an oak), column tops installed. */
function meadow(): World {
  const world = new World(7);
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) {
    for (let cy = 0; cy <= 6; cy++) {
      const chunk = new Chunk(cx, cy, cz);
      if (cy === 2) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.blocks[localIndex(x, GROUND - 32, z)] = BlockId.GRASS;
      world.addChunk(chunk);
    }
    world.installColumnTops(cx, cz, new Int32Array(256).fill(GROUND));
  }
  return world;
}

describe('saplings (T-G3)', () => {
  it('has one sapling per species with leaves, and none for cacti or dead snags', () => {
    expect(saplingState('oak')).toBe(BlockId.SAPLING);
    expect(saplingState('saguaro')).toBeNull();
    expect(saplingState('dead_snag')).toBeNull();
    for (const species of SAPLING_SPECIES) {
      const state = saplingState(species)!;
      expect(isSaplingState(state)).toBe(true);
      expect(getBlockDef(state).shape).toBe('cross');
    }
    expect(isSaplingState(BlockId.SAPLING + SAPLING_SPECIES.length)).toBe(false);
  });

  it('grows into its species tree on grass, keeping blocks that were already there', () => {
    const world = meadow();
    world.setBlock(8, GROUND + 1, 8, saplingState('oak')!);
    world.setBlock(9, GROUND + 20, 8, BlockId.STONE); // something in the way of the crown
    expect(growSapling(world, 8, GROUND + 1, 8)).toBe(true);
    expect(world.getBlock(8, GROUND + 1, 8)).toBe(BlockId.LOG);
    expect(world.getBlock(8, GROUND, 8)).toBe(BlockId.GRASS); // the ground is left as it was
    expect(world.getBlock(9, GROUND + 20, 8)).toBe(BlockId.STONE);
    let leaves = 0;
    for (let x = -8; x <= 24; x++) for (let z = -8; z <= 24; z++) for (let y = GROUND + 1; y <= GROUND + 45; y++) {
      if (world.getBlock(x, y, z) === BlockId.LEAVES) leaves++;
    }
    expect(leaves).toBeGreaterThan(50);
  });

  it('stays a sapling under a roof, on stone, or where the tree would leave the loaded world', () => {
    const roofed = meadow();
    roofed.setBlock(8, GROUND + 1, 8, saplingState('bush')!);
    roofed.setBlock(8, GROUND + 3, 8, BlockId.STONE);
    expect(growSapling(roofed, 8, GROUND + 1, 8)).toBe(false);
    const rock = meadow();
    rock.setBlock(8, GROUND, 8, BlockId.STONE);
    rock.setBlock(8, GROUND + 1, 8, saplingState('bush')!);
    expect(growSapling(rock, 8, GROUND + 1, 8)).toBe(false);
    const edge = meadow();
    edge.setBlock(55, GROUND + 1, 8, saplingState('oak')!); // the crown would reach past chunk cx = 3
    expect(growSapling(edge, 55, GROUND + 1, 8)).toBe(false);
    expect(edge.getBlock(55, GROUND + 1, 8)).toBe(saplingState('oak'));
  });

  it('grows on a random tick only with open sky above', () => {
    const world = meadow();
    world.setBlock(8, GROUND + 1, 8, saplingState('bush')!);
    handleRandomTick(world, 8, GROUND + 1, 8, () => 0);
    expect(world.getBlock(8, GROUND + 1, 8)).toBe(BlockId.LOG);
    const shaded = meadow();
    shaded.setBlock(8, GROUND + 1, 8, saplingState('bush')!);
    shaded.setBlock(8, GROUND + 9, 8, BlockId.STONE); // high above: room to grow, but no sky
    handleRandomTick(shaded, 8, GROUND + 1, 8, () => 0);
    expect(isSaplingState(shaded.getBlock(8, GROUND + 1, 8))).toBe(true);
  });

  it('drops a sapling of the species that grows there from some leaves', () => {
    const world = meadow();
    expect(leafSapling(world, 0, 0, () => 0)).toBeNull(); // the game has not said what grows where
    world.treeSpeciesAt = () => 'spruce';
    expect(leafSapling(world, 0, 0, () => 0)).toBe(saplingState('spruce'));
    expect(leafSapling(world, 0, 0, () => 0.99)).toBeNull();
    world.treeSpeciesAt = () => null;
    expect(leafSapling(world, 0, 0, () => 0)).toBeNull();
  });
});
