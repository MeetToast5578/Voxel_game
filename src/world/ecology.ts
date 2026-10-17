import { type World } from './world';
import { type Tick, type TickResult } from './tick';
import { BlockId, blocksSky } from './blocks';
import { mulberry32 } from '../core/random';
import { mixSeed } from './randomTick';
import { orphanedLeaves } from './leafDecay';
import { FALL_REASON, handleFall } from './falling';

/** Chance per tick that grass spreads to an adjacent lit dirt block. */
export const GRASS_SPREAD_CHANCE = 0.02;
/** Minimum sky light level for grass to spread. */
export const GRASS_SPREAD_LIGHT_MIN = 8;
/** Most leaves one broken log may fell, so a huge canopy cannot stall a tick step. */
export const LEAF_DECAY_LIMIT = 4096;

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
    case 'leaf-decay':
      return handleLeafDecay(world, tick);
    case FALL_REASON:
      return handleFall(world, tick);
    default:
      return 'handled';
  }
}

/**
 * When a log is removed at (x, y, z), schedule the leaves it was holding up. Each leaf is
 * due a little later the further it sits from the break, so the canopy fades outward.
 * Returns how many leaves were scheduled (0 when another log still holds the tree up).
 */
export function scheduleLeafDecay(world: World, x: number, y: number, z: number): number {
  const orphans = orphanedLeaves((bx, by, bz) => world.getBlock(bx, by, bz), x, y, z, LEAF_DECAY_LIMIT);
  for (const leaf of orphans) {
    world.scheduleTick(leaf.x, leaf.y, leaf.z, world.currentTick + 1 + Math.min(leaf.depth, 20), 'leaf-decay');
  }
  return orphans.length;
}

/** A leaf scheduled to decay: remove it if it is still a leaf (a log placed since the chop would keep it). */
function handleLeafDecay(world: World, tick: Tick): TickResult {
  if (world.getBlock(tick.x, tick.y, tick.z) === BlockId.LEAVES) {
    world.setBlock(tick.x, tick.y, tick.z, BlockId.AIR);
  }
  return 'handled';
}

/**
 * Handle one random tick at (x, y, z). Rules are added here as the world gains them
 * (leaf decay, snow settling, crops). `rng` is the deterministic per-chunk stream, so a
 * rule may roll as often as it likes.
 */
export function handleRandomTick(world: World, x: number, y: number, z: number, rng: () => number): void {
  if (world.getBlock(x, y, z) === BlockId.GRASS) spreadGrassFrom(world, x, y, z, rng);
}

/**
 * Grass spreading: grass at (x, y, z) attempts to spread to adjacent dirt blocks that are
 * lit by sunlight. Written once, driven either by a scheduled tick or a random tick.
 */
function spreadGrassFrom(world: World, x: number, y: number, z: number, roll: () => number): void {
  if (world.getBlock(x, y, z) !== BlockId.GRASS) return;
  for (const n of HORIZONTAL_NEIGHBORS) {
    const nx = x + n.x;
    const ny = y + n.y;
    const nz = z + n.z;
    // Only spread to dirt blocks.
    if (world.getBlock(nx, ny, nz) !== BlockId.DIRT) continue;
    // Only spread where sunlight reaches: nothing sky-blocking directly above.
    if (blocksSky(world.getBlock(nx, ny + 1, nz))) continue;
    if (roll() < GRASS_SPREAD_CHANCE) world.setBlock(nx, ny, nz, BlockId.GRASS);
  }
}

/** A scheduled grass-spread tick rolls on its own stream, keyed by the tick's due time. */
function handleGrassSpread(world: World, tick: Tick): TickResult {
  const rng = mulberry32(mixSeed(world.seed, tick.x, tick.y, tick.z, tick.dueTick));
  spreadGrassFrom(world, tick.x, tick.y, tick.z, rng);
  return 'handled';
}

