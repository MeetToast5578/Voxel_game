import { describe, expect, it } from 'vitest';
import { SUPPORT_RADIUS_BLOCKS } from '../src/config';
import { Chunk } from '../src/world/chunk';
import { BlockId } from '../src/world/blocks';
import { handleSupport, scheduleSupportChecks, SUPPORT_REASON, unsupportedGroup } from '../src/world/collapse';
import { scheduleFallChecks } from '../src/world/falling';
import { World } from '../src/world/world';

/** Three chunks stacked on the origin column, with open column tops. */
function stacked(): World {
  const world = new World(1);
  for (const cy of [-1, 0, 1]) world.addChunk(new Chunk(0, cy, 0));
  world.installColumnTops(0, 0, new Int32Array(256).fill(-1000));
  return world;
}

/** Sets blocks without any physics, to build a structure. */
function build(world: World, cells: [number, number, number, number][]): void {
  for (const [x, y, z, id] of cells) expect(world.setBlock(x, y, z, id)).toBe(true);
}

/** Removes a block the way a player break does, then asks its neighbours for a support check. */
function remove(world: World, x: number, y: number, z: number): void {
  expect(world.setBlock(x, y, z, BlockId.AIR)).toBe(true);
  scheduleSupportChecks(world, x, y, z);
}

function settle(world: World, steps = 60): void {
  for (let i = 0; i < steps; i++) world.tickStep(1000);
}

describe('structural collapse (spec 25, slice 5)', () => {
  it('an overhang whose support is removed collapses, and its blocks drop as items', () => {
    const world = stacked();
    build(world, [
      [4, 5, 4, BlockId.STONE], // the wall that holds the arm up
      [5, 5, 4, BlockId.STONE],
      [6, 5, 4, BlockId.STONE],
      [7, 5, 4, BlockId.STONE],
    ]);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(5, 5, 4)).toBe(BlockId.AIR);
    expect(world.getBlock(6, 5, 4)).toBe(BlockId.AIR);
    expect(world.getBlock(7, 5, 4)).toBe(BlockId.AIR);
    const drops = world.takeDrops();
    expect(drops.map((d) => d.id)).toEqual([BlockId.STONE, BlockId.STONE, BlockId.STONE]);
  });

  it('a block with a second, bedrock support stays', () => {
    const world = stacked();
    build(world, [
      [4, 5, 4, BlockId.STONE],
      [5, 5, 4, BlockId.STONE],
      [6, 5, 4, BlockId.STONE],
      [7, 5, 4, BlockId.BEDROCK], // a second support that never breaks
    ]);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(5, 5, 4)).toBe(BlockId.STONE);
    expect(world.getBlock(6, 5, 4)).toBe(BlockId.STONE);
    expect(world.takeDrops()).toEqual([]);
  });

  it('a long overhang is held up by the edge of the check radius, so it does not collapse all at once', () => {
    const world = stacked();
    const arm: [number, number, number, number][] = [[4, 5, 4, BlockId.STONE]];
    // The arm runs past the check radius, so its far end is outside the check.
    for (let x = 5; x <= 4 + SUPPORT_RADIUS_BLOCKS + 2; x++) arm.push([x, 5, 4, BlockId.STONE]);
    build(world, arm);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(4 + SUPPORT_RADIUS_BLOCKS + 2, 5, 4)).toBe(BlockId.STONE);
    expect(world.takeDrops()).toEqual([]);
  });

  it('sand in an unsupported group falls instead of breaking', () => {
    const world = stacked();
    build(world, [
      [5, 0, 4, BlockId.STONE], // the floor, under the sand
      [4, 5, 4, BlockId.STONE], // the wall
      [5, 5, 4, BlockId.SAND], // sand on the arm
    ]);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(5, 1, 4)).toBe(BlockId.SAND);
    expect(world.takeDrops()).toEqual([]);
  });

  it('leaves never collapse, and a plant is not part of a group', () => {
    const world = stacked();
    build(world, [
      [4, 5, 4, BlockId.STONE],
      [5, 5, 4, BlockId.LEAVES],
      [3, 5, 4, BlockId.TALL_GRASS],
    ]);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(5, 5, 4)).toBe(BlockId.LEAVES);
    expect(world.getBlock(3, 5, 4)).toBe(BlockId.TALL_GRASS);
  });

  it('a closed group in the air drops every block when a neighbour is removed', () => {
    const world = stacked();
    build(world, [
      [5, 10, 4, BlockId.STONE],
      [5, 10, 5, BlockId.STONE],
    ]);
    // Nothing holds the pair up and nothing else touches it, so a check on one of them breaks both.
    expect(unsupportedGroup(world, 5, 10, 4)?.length).toBe(2);
    expect(handleSupport(world, { x: 5, y: 10, z: 4, dueTick: 0, reason: SUPPORT_REASON })).toBe('handled');
    settle(world);
    expect(world.takeDrops()).toHaveLength(2);
  });

  it('a big solid mass is held up by its edge, so one removed block inside it changes nothing', () => {
    const world = stacked();
    const cells: [number, number, number, number][] = [];
    for (let x = 1; x <= 13; x++) for (let z = 1; z <= 13; z++) cells.push([x, 5, z, BlockId.STONE]);
    build(world, cells);
    remove(world, 4, 5, 4);
    settle(world);
    expect(world.getBlock(5, 5, 4)).toBe(BlockId.STONE);
    expect(world.takeDrops()).toEqual([]);
  });

  it('is handled when the start cell is not a collapsible block', () => {
    const world = stacked();
    expect(handleSupport(world, { x: 0, y: 0, z: 0, dueTick: 0, reason: SUPPORT_REASON })).toBe('handled');
    scheduleFallChecks(world, 0, 0, 0); // keeps the import used when the falling rules change
  });
});
