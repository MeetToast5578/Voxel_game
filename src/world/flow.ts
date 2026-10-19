import { WATER_TICK_DELAY } from '../config';
import {
  BlockId, flowingWaterState, getBlockDef, isFallingWater, isFlowingWaterState, isWaterState, SOURCE_WATER_LEVEL, waterLevel,
} from './blocks';
import type { Chunk } from './chunk';
import type { Tick, TickResult } from './tick';
import type { World } from './world';

/** The tick reason for a water flow check (spec 25, slice 4). */
export const FLOW_REASON = 'flow';

/** Side neighbours (horizontal faces). */
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A cell water can flow into: air, or a plant, which the water replaces. */
function open(id: number): boolean {
  return id === BlockId.AIR || getBlockDef(id).shape === 'cross';
}

/**
 * Schedules a flow tick for a changed cell and its six neighbours, as Minecraft does when a block changes: only water
 * cells get one. An air cell takes its water from the water beside it, on that water's own tick, so the water
 * spreads one block per delay and never two blocks in one tick.
 */
export function scheduleFlowChecks(world: World, x: number, y: number, z: number): void {
  const due = world.currentTick + WATER_TICK_DELAY;
  const cells = [[x, y, z], [x, y + 1, z], [x, y - 1, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
  for (const [cx, cy, cz] of cells) {
    if (isWaterState(world.getBlock(cx!, cy!, cz!))) world.scheduleTick(cx!, cy!, cz!, due, FLOW_REASON);
  }
}

/**
 * Schedules a flow check for every flowing (not source) water cell in a chunk. Called when a chunk loads, so water that
 * was saved while flowing settles after a reload. A source block never needs a check on load: it only spreads when a
 * neighbour changes.
 */
export function scheduleFlowingWater(world: World, chunk: Chunk): void {
  const blocks = chunk.blocks;
  const due = world.currentTick + 1;
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i]!;
    if (!isFlowingWaterState(id)) continue;
    const lx = i % 16;
    const lz = Math.floor(i / 16) % 16;
    const ly = Math.floor(i / 256);
    world.scheduleTick(chunk.cx * 16 + lx, chunk.cy * 16 + ly, chunk.cz * 16 + lz, due, FLOW_REASON);
  }
}

/** The level a water neighbour supplies to a cell beside it: one less than its own level. */
function supplyFrom(id: number): number {
  return isWaterState(id) ? waterLevel(id) - 1 : 0;
}

/**
 * Runs one flow check on a water cell (or does nothing for other blocks). A flowing cell is recomputed from what feeds
 * it: water above makes it a falling column; otherwise the strongest neighbour, one level down. A flowing cell with no
 * feed drains to air. Then the cell spreads: a falling cell fills the open cell below it, and a cell above solid ground
 * (or water) spreads one level less to open cells beside it. The source block never changes. Writes that the chunk
 * refuses change nothing.
 */
export function handleFlow(world: World, tick: Tick): TickResult {
  const { x, y, z } = tick;
  const id = world.getBlock(x, y, z);
  if (!isWaterState(id)) return 'handled';
  let strength = SOURCE_WATER_LEVEL;
  if (id !== BlockId.WATER) {
    const above = world.getBlock(x, y + 1, z);
    let feed = 0;
    let falling = false;
    if (isWaterState(above)) {
      feed = SOURCE_WATER_LEVEL;
      falling = true;
    } else {
      for (const [dx, dz] of SIDES) feed = Math.max(feed, supplyFrom(world.getBlock(x + dx, y, z + dz)));
    }
    const next = feed > 0 ? flowingWaterState(feed, falling) : BlockId.AIR;
    if (next !== id) {
      if (!world.setBlock(x, y, z, next)) return 'handled';
      scheduleFlowChecks(world, x, y, z);
    }
    if (next === BlockId.AIR) return 'handled';
    strength = feed;
  }

  const below = world.getBlock(x, y - 1, z);
  if (open(below)) {
    // Water falls: the cell below becomes a falling column.
    if (world.setBlock(x, y - 1, z, flowingWaterState(SOURCE_WATER_LEVEL, true))) scheduleFlowChecks(world, x, y - 1, z);
    return 'handled';
  }
  if (strength <= 1 || !(getBlockDef(below).solid || isWaterState(below))) return 'handled';

  // Spreads one level down, to open cells and to flowing cells that are thinner than this one.
  for (const [dx, dz] of SIDES) {
    const nx = x + dx;
    const nz = z + dz;
    const nid = world.getBlock(nx, y, nz);
    const thinner = isFlowingWaterState(nid) && !isFallingWater(nid) && waterLevel(nid) < strength - 1;
    if (!open(nid) && !thinner) continue;
    if (world.setBlock(nx, y, nz, flowingWaterState(strength - 1, false))) scheduleFlowChecks(world, nx, y, nz);
  }
  return 'handled';
}
