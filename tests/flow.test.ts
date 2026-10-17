import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/world/chunk';
import { BlockId, blockTopHeight, flowingWaterState, isWaterState, SOURCE_WATER_LEVEL as SOURCE_LEVEL, waterLevel } from '../src/world/blocks';
import { FLOW_REASON, scheduleFlowChecks } from '../src/world/flow';
import { World } from '../src/world/world';

/** Three chunks stacked on the origin column, with open column tops. Water sits in the middle chunk. */
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

/** A flat stone floor at y = 0 over the whole chunk footprint, so the water has room to spread. */
function floor(world: World): void {
  const cells: [number, number, number, number][] = [];
  for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) cells.push([x, 0, z, BlockId.STONE]);
  build(world, cells);
}

/** Places water the way a player edit does: the cell is set, and its neighbourhood is asked to flow. */
function pour(world: World, x: number, y: number, z: number, id: number): void {
  expect(world.setBlock(x, y, z, id)).toBe(true);
  scheduleFlowChecks(world, x, y, z);
}

function settle(world: World, steps = 80): void {
  for (let i = 0; i < steps; i++) world.tickStep(1000);
}

describe('flowing water (spec 25, slice 4)', () => {
  it('a source on flat ground levels out, one level thinner per block', () => {
    const world = stacked();
    floor(world);
    pour(world, 4, 1, 4, BlockId.WATER);
    settle(world);
    expect(world.getBlock(4, 1, 4)).toBe(BlockId.WATER); // the source keeps its level
    // Each block out from the source is one level thinner: level 7 next to it, down to level 1 seven blocks out.
    for (let d = 1; d <= 7; d++) expect(waterLevel(world.getBlock(4 + d, 1, 4))).toBe(8 - d);
    expect(world.getBlock(12, 1, 4)).toBe(BlockId.AIR);
  });

  it('water falls down a hole and spreads out at the bottom', () => {
    const world = stacked();
    // A plate at y = 4 with a hole at (4, 4, 4); a source sits on the plate above the hole.
    const plate: [number, number, number, number][] = [];
    for (let x = 0; x <= 8; x++) for (let z = 0; z <= 8; z++) if (x !== 4 || z !== 4) plate.push([x, 4, z, BlockId.STONE]);
    build(world, plate);
    build(world, [[4, 0, 4, BlockId.STONE]]); // the floor at the bottom of the hole
    pour(world, 4, 5, 4, BlockId.WATER);
    settle(world);
    expect(isWaterState(world.getBlock(4, 4, 4))).toBe(true);
    expect(isWaterState(world.getBlock(4, 1, 4))).toBe(true);
    // Falling water is a falling column; at the bottom it spreads sideways, one level thinner.
    expect(isWaterState(world.getBlock(5, 1, 4))).toBe(true);
  });

  it('water does not pass through a wall, and goes around it', () => {
    const world = stacked();
    floor(world);
    build(world, [[6, 1, 4, BlockId.STONE]]); // a wall two blocks east of the source
    pour(world, 4, 1, 4, BlockId.WATER);
    settle(world);
    expect(world.getBlock(6, 1, 4)).toBe(BlockId.STONE);
    expect(waterLevel(world.getBlock(5, 1, 4))).toBe(7);
    // Straight through the wall would be level 5 at x = 7; going around (through z = 5) it is one level thinner.
    expect(waterLevel(world.getBlock(7, 1, 4))).toBe(3);
  });

  it('flowing water with nothing feeding it drains away', () => {
    const world = stacked();
    floor(world);
    pour(world, 4, 1, 4, flowingWaterState(3, false));
    settle(world);
    expect(world.getBlock(4, 1, 4)).toBe(BlockId.AIR);
    expect(world.getBlock(5, 1, 4)).toBe(BlockId.AIR);
  });

  it('never replaces stone', () => {
    const world = stacked();
    floor(world);
    pour(world, 4, 1, 4, BlockId.WATER);
    settle(world);
    expect(world.getBlock(4, 0, 4)).toBe(BlockId.STONE);
  });

  it('settles to the same result however often it is asked', () => {
    const a = stacked();
    const b = stacked();
    floor(a);
    floor(b);
    pour(a, 4, 1, 4, BlockId.WATER);
    pour(b, 4, 1, 4, BlockId.WATER);
    settle(a, 40);
    settle(b, 120);
    for (let x = 0; x <= 8; x++) expect(a.getBlock(x, 1, 4)).toBe(b.getBlock(x, 1, 4));
  });

  it('a flowing cell stands at its level, and a falling cell stands full', () => {
    expect(blockTopHeight(BlockId.WATER)).toBe(1);
    expect(blockTopHeight(BlockId.STONE)).toBe(1);
    expect(blockTopHeight(flowingWaterState(4, false))).toBe(0.5);
    expect(blockTopHeight(flowingWaterState(8, false))).toBe(1);
    expect(blockTopHeight(flowingWaterState(SOURCE_LEVEL, true))).toBe(1); // a falling cell is always full
  });

  it('uses its own tick reason', () => {
    expect(FLOW_REASON).toBe('flow');
  });
});
