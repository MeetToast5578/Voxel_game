import { CHUNK_SIZE, GRAVITY_TICK_DELAY } from '../config';
import { BlockId, getBlockDef, isFluidState } from './blocks';
import type { Chunk } from './chunk';
import type { Tick, TickResult } from './tick';
import type { World } from './world';
import { scheduleFlowChecks } from './flow';

/** The tick reason for a fall check: "does the block at this cell fall, and where does it land". */
export const FALL_REASON = 'fall';

/**
 * A cell a falling block may drop into. Air, water and plants are replaced, as in Minecraft; anything solid stops the
 * fall.
 */
export function canFallInto(id: number): boolean {
  return id === BlockId.AIR || isFluidState(id) || getBlockDef(id).shape !== 'cube';
}

/**
 * Schedules a fall check for a cell that just changed, and for the cell above it, since a block there may have lost
 * its support. The checks run after the gravity delay, as in Minecraft.
 */
export function scheduleFallChecks(world: World, x: number, y: number, z: number): void {
  const due = world.currentTick + GRAVITY_TICK_DELAY;
  world.scheduleTick(x, y, z, due, FALL_REASON);
  world.scheduleTick(x, y + 1, z, due, FALL_REASON);
}

/**
 * Schedules a fall check for every falling block in a chunk that has room below it. Called when a chunk is loaded, so
 * old saves without scheduled work still resume their falls. Restored queues already contain exact remaining
 * delays, so those cells are skipped rather than accelerated by this legacy recovery scan.
 */
export function scheduleFallingBlocks(world: World, chunk: Chunk): void {
  const blocks = chunk.blocks;
  const due = world.currentTick + 1;
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i]!;
    if (id === BlockId.AIR || !getBlockDef(id).falls) continue;
    const lx = i % CHUNK_SIZE;
    const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
    const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
    const x = chunk.cx * CHUNK_SIZE + lx;
    const y = chunk.cy * CHUNK_SIZE + ly;
    const z = chunk.cz * CHUNK_SIZE + lz;
    if (!world.hasScheduledTick(x, y, z, FALL_REASON) && canFallInto(world.getBlock(x, y - 1, z))) world.scheduleTick(x, y, z, due, FALL_REASON);
  }
}

/**
 * Runs one fall check. A falling block moves one cell down when the cell below can take it, and the cell it leaves
 * becomes air. The block below is written first: if that write is refused (the chunk is not loaded), nothing moves.
 */
export function handleFall(world: World, tick: Tick): TickResult {
  const { x, y, z } = tick;
  const id = world.getBlock(x, y, z);
  if (id === BlockId.AIR || !getBlockDef(id).falls) return 'handled';
  if (!canFallInto(world.getBlock(x, y - 1, z))) return 'handled';
  if (!world.isLoadedAt(x, y - 1, z) || !world.setBlock(x, y - 1, z, id)) {
    world.scheduleTick(x, y, z, world.currentTick + GRAVITY_TICK_DELAY, FALL_REASON);
    return 'handled';
  }
  world.setBlock(x, y, z, BlockId.AIR);
  // The block keeps falling from its new cell, and the cell it left may have freed the block above.
  world.scheduleTick(x, y - 1, z, world.currentTick + GRAVITY_TICK_DELAY, FALL_REASON);
  scheduleFallChecks(world, x, y, z);
  scheduleFlowChecks(world, x, y, z);
  scheduleFlowChecks(world, x, y - 1, z);
  return 'handled';
}
