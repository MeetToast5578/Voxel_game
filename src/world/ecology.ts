import { type World } from './world';
import { type Tick, type TickResult } from './tick';
import { BlockId, blocksSky } from './blocks';

/** Chance per tick that grass spreads to an adjacent lit dirt block. */
export const GRASS_SPREAD_CHANCE = 0.02;
/** Minimum sky light level for grass to spread. */
export const GRASS_SPREAD_LIGHT_MIN = 8;

/** All four horizontal neighbor offsets. */
const HORIZONTAL_NEIGHBORS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * Handle a scheduled tick. Dispatches to the appropriate handler based on
 * `tick.reason`. Returns 'handled', 'handoff', or 'skip'.
 */
export function handleTick(world: World, tick: Tick): TickResult {
  switch (tick.reason) {
    case 'grass-spread':
      return handleGrassSpread(world, tick);
    default:
      return 'handled';
  }
}

/**
 * Grass spreading: grass at (wx, wy, wz) attempts to spread to adjacent dirt
 * blocks that are lit by sunlight. Returns 'handled' (tick consumed) regardless.
 */
function handleGrassSpread(world: World, tick: Tick): TickResult {
  const { x, y, z } = tick;

  // Only spread from grass blocks.
  if (world.getBlock(x, y, z) !== BlockId.GRASS) return 'handled';

  // Check each horizontal neighbor for dirt blocks to convert.
  for (const n of HORIZONTAL_NEIGHBORS) {
    const nx = x + n.x;
    const ny = y + n.y;
    const nz = z + n.z;

    // Only spread to dirt blocks.
    if (world.getBlock(nx, ny, nz) !== BlockId.DIRT) continue;

    // Check if the dirt block is lit by sunlight (sky light > 0).
    // We approximate by checking if the block directly above is not sky-blocking
    // (i.e., sunlight can reach down to this block).
    const above = world.getBlock(nx, ny + 1, nz);
    if (blocksSky(above)) continue; // something blocks sunlight above

    // Random chance to spread.
    // Use a deterministic hash based on position and tick dueTick.
    const hashInput = nx * 73856093 ^ ny * 19349663 ^ nz * 83492791 ^ (tick.dueTick * 2654435761);
    const hash = (hashInput * 16807) % 2147483647;
    const chance = hash / 2147483647;
    if (chance < GRASS_SPREAD_CHANCE) {
      world.setBlock(nx, ny, nz, BlockId.GRASS);
    }
  }

  return 'handled';
}
