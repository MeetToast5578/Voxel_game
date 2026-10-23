import { CHUNK_SIZE, LAVA_TICK_DELAY, WATER_TICK_DELAY } from '../config';
import {
  BlockId, flowingWaterState, flowingLavaState, getBlockDef, isPlantState, isFallingWater, isFlowingWaterState,
  isWaterState, SOURCE_WATER_LEVEL, waterLevel, isFluidState, isLavaState, isFlowingLavaState, lavaLevel, isFallingLava,
} from './blocks';
import type { Chunk } from './chunk';
import type { Tick, TickResult } from './tick';
import type { World } from './world';

/** Both fluids share dispatch; each carries its own delay and only accepts its own feed. */
export const FLOW_REASON = 'flow';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const FACES = [[0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const;
const NEIGHBOURS = FACES.slice(1);
const WATER = { source: BlockId.WATER, same: isWaterState, flowing: isFlowingWaterState,
  level: waterLevel, falling: isFallingWater, state: flowingWaterState, delay: WATER_TICK_DELAY };
const LAVA = { source: BlockId.LAVA, same: isLavaState, flowing: isFlowingLavaState,
  level: lavaLevel, falling: isFallingLava, state: flowingLavaState, delay: LAVA_TICK_DELAY };
const fluid = (id: number) => isLavaState(id) ? LAVA : WATER;
const open = (id: number) => id === BlockId.AIR || isPlantState(id);

/** Schedule the changed cell and neighbours, using the delay belonging to each fluid. */
export function scheduleFlowChecks(world: World, x: number, y: number, z: number): void {
  for (const [dx, dy, dz] of FACES) {
    const cx = x + dx, cy = y + dy, cz = z + dz;
    const id = world.getBlock(cx, cy, cz);
    if (isFluidState(id)) world.scheduleTick(cx, cy, cz, world.currentTick + fluid(id).delay, FLOW_REASON);
  }
}

/** Resume flowing cells and source interfaces on load. Quiescent generated reservoirs stay quiescent. */
export function scheduleFlowingWater(world: World, chunk: Chunk): void {
  const hasWater = chunk.blocks.some(isWaterState), hasLava = chunk.blocks.some(isLavaState);
  for (let i = 0; i < chunk.blocks.length; i++) {
    const id = chunk.blocks[i]!;
    if (!isFluidState(id)) continue;
    const lx = i % CHUNK_SIZE, lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
    const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
    const x = chunk.cx * CHUNK_SIZE + lx, y = chunk.cy * CHUNK_SIZE + ly, z = chunk.cz * CHUNK_SIZE + lz;
    if (world.hasScheduledTick(x, y, z, FLOW_REASON)) continue;
    let mixed = false;
    if (!fluid(id).flowing(id)) for (const [dx, dy, dz] of NEIGHBOURS) {
      // A uniform fluid chunk can only meet the other fluid across a chunk face. Avoid
      // six world lookups per interior source in large generated reservoirs.
      const inside = lx + dx >= 0 && lx + dx < CHUNK_SIZE && ly + dy >= 0 && ly + dy < CHUNK_SIZE && lz + dz >= 0 && lz + dz < CHUNK_SIZE;
      if (inside && !(isLavaState(id) ? hasWater : hasLava)) continue;
      const n = world.getBlock(x + dx, y + dy, z + dz);
      if (isLavaState(id) ? isWaterState(n) : isLavaState(n)) { mixed = true; break; }
    }
    if (fluid(id).flowing(id) || mixed)
      world.scheduleTick(x, y, z, world.currentTick + fluid(id).delay, FLOW_REASON);
  }
}

/** Contact changes the lava cell, never the water cell. Downward contact has priority. */
function coolLava(world: World, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (!isLavaState(id)) return false;
  let product: number;
  if (isWaterState(world.getBlock(x, y - 1, z))) product = BlockId.STONE;
  else if (NEIGHBOURS.some(([dx, dy, dz]) => isWaterState(world.getBlock(x + dx, y + dy, z + dz))))
    product = id === BlockId.LAVA ? BlockId.OBSIDIAN : BlockId.COBBLESTONE;
  else return false;
  if (!world.setBlock(x, y, z, product)) return false;
  scheduleFlowChecks(world, x, y, z);
  return true;
}

/** Scheduled cellular flow. Levels thin sideways and drain without feed; gravity wins over spreading. */
export function handleFlow(world: World, tick: Tick): TickResult {
  const { x, y, z } = tick;
  const id = world.getBlock(x, y, z);
  if (!isFluidState(id)) return 'handled';
  if (isLavaState(id)) {
    if (coolLava(world, x, y, z)) return 'handled';
  } else {
    for (const [dx, dy, dz] of NEIGHBOURS) coolLava(world, x + dx, y + dy, z + dz);
  }
  const f = fluid(id);
  // Missing chunks are unknown, not air. Keep this interface alive until streaming completes.
  if (NEIGHBOURS.some(([dx, dy, dz]) => !world.isLoadedAt(x + dx, y + dy, z + dz))) {
    world.scheduleTick(x, y, z, world.currentTick + f.delay, FLOW_REASON);
    return 'handled';
  }
  let strength = SOURCE_WATER_LEVEL;
  if (id !== f.source) {
    const above = world.getBlock(x, y + 1, z);
    let feed = 0;
    const falling = f.same(above);
    if (falling) feed = SOURCE_WATER_LEVEL;
    else for (const [dx, dz] of SIDES) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (f.same(n)) feed = Math.max(feed, f.level(n) - 1);
    }
    const next = feed > 0 ? f.state(feed, falling) : BlockId.AIR;
    if (next !== id) {
      if (!world.setBlock(x, y, z, next)) return 'handled';
      scheduleFlowChecks(world, x, y, z);
    }
    if (next === BlockId.AIR) return 'handled';
    strength = feed;
  }
  const below = world.getBlock(x, y - 1, z);
  if (open(below)) {
    if (world.setBlock(x, y - 1, z, f.state(SOURCE_WATER_LEVEL, true))) scheduleFlowChecks(world, x, y - 1, z);
    return 'handled';
  }
  if (strength <= 1 || !(getBlockDef(below).solid || f.same(below))) return 'handled';
  for (const [dx, dz] of SIDES) {
    const nx = x + dx, nz = z + dz, nid = world.getBlock(nx, y, nz);
    const thinner = f.flowing(nid) && !f.falling(nid) && f.level(nid) < strength - 1;
    if (!open(nid) && !thinner) continue;
    if (world.setBlock(nx, y, nz, f.state(strength - 1, false))) scheduleFlowChecks(world, nx, y, nz);
  }
  return 'handled';
}
