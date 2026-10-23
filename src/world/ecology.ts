import { type World } from './world';
import { type Tick, type TickResult } from './tick';
import { BlockId, CROP_STAGES, SNOW_LAYERS, blocksSky, blockVariant, getBlockDef, isCropState, isSnowState, snowLayers, snowState } from './blocks';
import { type Chunk } from './chunk';
import { CHUNK_SIZE, CHUNK_VOLUME, CROP_GROW_CHANCE, ICE_FREEZE_CHANCE, LEAF_LITTER_CHANCE, LEAF_LITTER_REACH, LEAF_LITTER_ROT_CHANCE, PLANT_SPROUT_CHANCE, SAPLING_SUCCESSION_CHANCE, RANDOM_TICKS_PER_CHUNK, ICE_THAW_CHANCE, SAPLING_DROP_CHANCE, SAPLING_GROW_CHANCE, SNOW_MELT_CHANCE, SNOW_SETTLE_CHANCE } from '../config';
import { growSapling, isSaplingState, saplingState } from './saplings';
import { cropGrowthFactor, growCrop } from './crops';
import { floorDiv } from '../core/math';
import { mulberry32 } from '../core/random';
import { mixSeed } from './randomTick';
import { leafSupport, orphanedLeaves } from './leafDecay';
import { FALL_REASON, handleFall } from './falling';
import { SUPPORT_REASON, handleSupport } from './collapse';
import { FLOW_REASON, handleFlow } from './flow';

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
    case SUPPORT_REASON:
      return handleSupport(world, tick);
    case FLOW_REASON:
      return handleFlow(world, tick);
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
    const support = leafSupport((x, y, z) => world.isLoadedAt(x, y, z) ? world.getBlock(x, y, z) : undefined,
      tick.x, tick.y, tick.z, LEAF_DECAY_LIMIT);
    if (support === 'orphaned' && world.setBlock(tick.x, tick.y, tick.z, BlockId.AIR)) {
      const roll = mulberry32(mixSeed(world.seed, tick.x, tick.y, tick.z, tick.dueTick));
      const sapling = leafSapling(world, tick.x, tick.z, roll);
      if (sapling !== null) world.queueDrop(sapling, tick.x, tick.y, tick.z);
    }
    else if (support === 'unknown') world.scheduleTick(tick.x, tick.y, tick.z, world.currentTick + 1, 'leaf-decay');
  }
  return 'handled';
}

/**
 * Handle one random tick at (x, y, z). Rules are added here as the world gains them
 * (leaf decay, snow settling, crops). `rng` is the deterministic per-chunk stream, so a
 * rule may roll as often as it likes.
 */
export function handleRandomTick(world: World, x: number, y: number, z: number, rng: () => number): void {
  const id = world.getBlock(x, y, z);
  if (id === BlockId.GRASS) {
    spreadGrassFrom(world, x, y, z, rng);
    sprout(world, x, y, z, rng);
  } else if (id === BlockId.TALL_GRASS || id === BlockId.FERN) seedSapling(world, x, y, z, rng);
  // A sapling grows only with open sky above it (it does not block the sky itself, so the top is its ground).
  else if (isSaplingState(id) && world.topAt(x, z) === y - 1 && rng() < SAPLING_GROW_CHANCE) growSapling(world, x, y, z);
  else if (isCropState(id)) growCrop(world, x, y, z, rng);
  else if (id === BlockId.LEAVES || id === BlockId.LEAF_LITTER) leafLitter(world, id, x, y, z, rng);
  if (world.surfaceWeather) settleSnowAndIce(world, x, y, z, rng);
}

/**
 * Plant succession (T-G5), first step: bare grass under open sky regrows the plant the generator would put there, so
 * cleared ground slowly returns to its natural cover. Columns that are bare by nature stay bare.
 */
function sprout(world: World, x: number, y: number, z: number, roll: () => number): void {
  if (!world.groundPlantAt || roll() >= PLANT_SPROUT_CHANCE) return;
  if (world.getBlock(x, y + 1, z) !== BlockId.AIR || world.topAt(x, z) !== y) return;
  const plant = world.groundPlantAt(x, z);
  if (plant !== BlockId.AIR) world.setBlock(x, y + 1, z, plant);
}

/** Next step: tall grass or a fern where trees grow turns into a sapling of the local species, which grows into a tree. */
function seedSapling(world: World, x: number, y: number, z: number, roll: () => number): void {
  if (!world.treeSpeciesAt || roll() >= SAPLING_SUCCESSION_CHANCE || world.topAt(x, z) !== y - 1) return;
  const species = world.treeSpeciesAt(x, z);
  const sapling = species ? saplingState(species) : null;
  if (sapling !== null) world.setBlock(x, y, z, sapling);
}

/**
 * Leaf litter (T-G6). In autumn a leaf block drops a leaf straight down through air and other leaves; it lands as litter
 * on grass or dirt with open air above. Out of autumn (no leaf fall at the cell), litter rots away.
 */
function leafLitter(world: World, id: number, x: number, y: number, z: number, roll: () => number): void {
  const fall = world.leafFall?.(x, y, z) ?? 0;
  if (id === BlockId.LEAF_LITTER) {
    if (fall === 0 && roll() < LEAF_LITTER_ROT_CHANCE) world.setBlock(x, y, z, BlockId.AIR);
    return;
  }
  if (fall === 0 || roll() >= LEAF_LITTER_CHANCE * fall) return;
  for (let ly = y - 1; ly >= y - LEAF_LITTER_REACH; ly--) {
    const below = world.getBlock(x, ly, z);
    if (below === BlockId.AIR || below === BlockId.LEAVES) continue;
    if ((below === BlockId.GRASS || below === BlockId.DIRT) && world.getBlock(x, ly + 1, z) === BlockId.AIR) {
      world.setBlock(x, ly + 1, z, BlockId.LEAF_LITTER);
    }
    return;
  }
}

/**
 * The sapling a leaf block at column (x, z) drops when it is broken or decays, or null (T-G3). All trees share one
 * leaves block, so the species is the one that grows there (World.treeSpeciesAt, set by the game).
 */
export function leafSapling(world: World, x: number, z: number, roll: () => number): number | null {
  if (!world.treeSpeciesAt || roll() >= SAPLING_DROP_CHANCE) return null;
  const species = world.treeSpeciesAt(x, z);
  return species ? saplingState(species) : null;
}

/**
 * Snow and ice (T-G2) at the top of column (x, z). Each column is handled only from the chunk that holds its top, so
 * how many chunks are loaded above or below does not change the rate. Snow settles on solid full tops while it is
 * snowing and builds up to SNOW_LAYERS; above 0 °C it melts a layer at a time. Still water at the top freezes below
 * 0 °C and thaws above it.
 */
function settleSnowAndIce(world: World, x: number, y: number, z: number, roll: () => number): void {
  const top = world.topAt(x, z);
  if (top === undefined || floorDiv(top, CHUNK_SIZE) !== floorDiv(y, CHUNK_SIZE)) return;
  const weather = world.surfaceWeather!(x, top + 1, z);
  const ground = world.getBlock(x, top, z);
  if (ground === BlockId.WATER) {
    if (weather.temperatureC < 0 && roll() < ICE_FREEZE_CHANCE) world.setBlock(x, top, z, BlockId.ICE);
    return;
  }
  if (ground === BlockId.ICE && weather.temperatureC > 0) {
    if (roll() < ICE_THAW_CHANCE) world.setBlock(x, top, z, BlockId.WATER);
    return;
  }
  const above = world.getBlock(x, top + 1, z);
  if (isSnowState(above)) {
    const layers = snowLayers(above);
    if (weather.temperatureC > 0) {
      if (roll() < SNOW_MELT_CHANCE) world.setBlock(x, top + 1, z, layers > 1 ? snowState(layers - 1) : BlockId.AIR);
    } else if (weather.snowing && layers < SNOW_LAYERS && roll() < SNOW_SETTLE_CHANCE) {
      world.setBlock(x, top + 1, z, snowState(layers + 1));
    }
    return;
  }
  const def = getBlockDef(ground);
  // Snow buries leaf litter, replacing it.
  const open = above === BlockId.AIR || above === BlockId.LEAF_LITTER;
  if (open && weather.snowing && def.solid && def.shape === 'cube' && roll() < SNOW_SETTLE_CHANCE) {
    world.setBlock(x, top + 1, z, snowState(1));
  }
}

/**
 * Catch-up on reload (T-G7): a chunk that comes back after `elapsed` ticks gets the expected outcome of the random
 * ticks it missed instead of a replay. Crops advance by elapsed × their growth rate, and snow and ice move toward the
 * current weather. Fractions are rounded up or down at random, on a stream fixed by the seed, tick and chunk.
 * shortcut: one weather sample at the chunk's centre, at reload, stands for the whole chunk and absence (chunks load
 * in bursts, so per-column sampling costs too much); replay a weather history if seasons look wrong.
 * Saplings are left to grow once loaded, since a tree can reach into chunks that are not.
 */
export function catchUpChunk(world: World, chunk: Chunk, elapsed: number): void {
  const weatherAt = world.surfaceWeather;
  if (elapsed <= 0 || !weatherAt) return;
  const rng = mulberry32(mixSeed(world.seed, world.currentTick, chunk.cx, chunk.cy, chunk.cz) ^ 0x5eed);
  const round = (expected: number) => Math.floor(expected + rng());
  const happened = (chance: number, tries: number) => rng() < 1 - (1 - chance) ** tries;
  const x0 = chunk.cx * CHUNK_SIZE, y0 = chunk.cy * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  const weather = weatherAt(x0 + CHUNK_SIZE / 2, y0 + CHUNK_SIZE / 2, z0 + CHUNK_SIZE / 2);

  const cellTicks = elapsed * RANDOM_TICKS_PER_CHUNK / CHUNK_VOLUME; // random ticks each cell expected to get
  for (let i = 0; i < CHUNK_VOLUME; i++) {
    const state = chunk.blocks[i]!;
    if (!isCropState(state)) continue;
    const x = x0 + (i & 15), y = y0 + (i >> 8), z = z0 + ((i >> 4) & 15); // the order of localIndex
    const ground = world.getBlock(x, y - 1, z);
    if ((ground !== BlockId.GRASS && ground !== BlockId.DIRT) || world.topAt(x, z) !== y - 1) continue;
    const stages = round(cellTicks * CROP_GROW_CHANCE * cropGrowthFactor(state, weather.temperatureC));
    if (stages > 0) world.setBlock(x, y, z, state + Math.min(stages, CROP_STAGES - 1 - blockVariant(state)));
  }

  // Snow and ice: each column is handled by the chunk that holds its top, as in settleSnowAndIce.
  const columnTicks = elapsed * RANDOM_TICKS_PER_CHUNK / (CHUNK_SIZE * CHUNK_SIZE);
  for (let x = x0; x < x0 + CHUNK_SIZE; x++) for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
    const top = world.topAt(x, z);
    if (top === undefined || floorDiv(top, CHUNK_SIZE) !== chunk.cy) continue;
    const ground = world.getBlock(x, top, z);
    if (ground === BlockId.WATER) {
      if (weather.temperatureC < 0 && happened(ICE_FREEZE_CHANCE, columnTicks)) world.setBlock(x, top, z, BlockId.ICE);
      continue;
    }
    if (ground === BlockId.ICE && weather.temperatureC > 0) {
      if (happened(ICE_THAW_CHANCE, columnTicks)) world.setBlock(x, top, z, BlockId.WATER);
      continue;
    }
    const above = world.getBlock(x, top + 1, z);
    const def = getBlockDef(ground);
    const layers = isSnowState(above) ? snowLayers(above) : above === BlockId.AIR && def.solid && def.shape === 'cube' ? 0 : -1;
    if (layers < 0) continue;
    const next = weather.temperatureC > 0 ? layers - round(columnTicks * SNOW_MELT_CHANCE)
      : weather.snowing ? layers + round(columnTicks * SNOW_SETTLE_CHANCE) : layers;
    const clamped = Math.max(0, Math.min(SNOW_LAYERS, next));
    if (clamped !== layers) world.setBlock(x, top + 1, z, clamped > 0 ? snowState(clamped) : BlockId.AIR);
  }
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

