import { RIVERBED_CLAY_SHARE, RIVERBED_GRAVEL_SHARE, RIVERBED_PATCH_M, roundBlocks } from '../config';
import { hash2 } from '../core/random';
import { BlockId } from './blocks';

/** Coordinate-based sediment patches agree across chunk slices, negative coordinates and cache reloads. */
export function riverbedMaterial(seed: number, x: number, z: number): number {
  const size = roundBlocks(RIVERBED_PATCH_M);
  const patch = hash2(seed + 701, Math.floor(x / size), Math.floor(z / size));
  if (patch < RIVERBED_CLAY_SHARE) return BlockId.CLAY;
  if (patch < RIVERBED_CLAY_SHARE + RIVERBED_GRAVEL_SHARE) return BlockId.GRAVEL;
  return BlockId.SAND;
}
