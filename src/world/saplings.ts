import { type TreeSpecies } from '../config';
import { BlockId, SAPLING_SPECIES, isPlantState } from './blocks';
import { treeBlocks } from './trees';
import { type World } from './world';

/** The sapling state for a species, or null for a species without one (cacti, dead snags). */
export function saplingState(species: TreeSpecies): number | null {
  const variant = SAPLING_SPECIES.indexOf(species);
  return variant < 0 ? null : BlockId.SAPLING + variant;
}

export function isSaplingState(state: number): boolean {
  return state >= BlockId.SAPLING && state < BlockId.SAPLING + SAPLING_SPECIES.length;
}

/** A tree may grow into air, plants (snow included) and leaves; never into anything else. */
function replaceable(id: number): boolean {
  return id === BlockId.AIR || id === BlockId.LEAVES || isPlantState(id);
}

/** Cells above a sapling that must be open before it can grow, so a sapling under a roof stays a sapling. */
const TRUNK_ROOM = 4;

/**
 * Grows the sapling at (x, y, z) into its species' tree, from the same feature generator as world trees (T-G3).
 * It needs grass or dirt below and TRUNK_ROOM open cells above, and every cell of the tree loaded, so a tree is never
 * cut off at the edge of the loaded world. Existing blocks are respected: logs and leaves only go into replaceable
 * cells (leaves never replace logs). Returns whether it grew.
 */
export function growSapling(world: World, x: number, y: number, z: number): boolean {
  const state = world.getBlock(x, y, z);
  if (!isSaplingState(state)) return false;
  const ground = world.getBlock(x, y - 1, z);
  if (ground !== BlockId.GRASS && ground !== BlockId.DIRT) return false;
  for (let k = 1; k <= TRUNK_ROOM; k++) if (!world.isLoadedAt(x, y + k, z) || !replaceable(world.getBlock(x, y + k, z))) return false;
  const blocks = treeBlocks(world.seed, x, y - 1, z, SAPLING_SPECIES[state - BlockId.SAPLING]!)
    .filter((b) => b.y >= y); // the generator's own footing block is the ground already there
  if (!blocks.every((b) => world.isLoadedAt(b.x, b.y, b.z))) return false;
  for (const b of blocks) {
    const here = world.getBlock(b.x, b.y, b.z);
    if (!replaceable(here) || (b.id === BlockId.LEAVES && here === BlockId.LEAVES)) continue;
    world.setBlock(b.x, b.y, b.z, b.id);
  }
  return true;
}
