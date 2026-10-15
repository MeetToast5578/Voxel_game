import { BEACH_BAND, roundBlocks, SEA_LEVEL, SPAWN_RADIUS_M, SPAWN_STEP_M } from '../config';
import { isSolid } from './blocks';
import type { TerrainGenerator } from './generator';

/** Finds a dry-land column near the origin, searching outward in square rings. Returns block-center coordinates. */
export function findSpawnColumn(generator: TerrainGenerator): { x: number; z: number } {
  // The step divides every ring radius (radii are multiples of it), so the ring border is always visited.
  const step = roundBlocks(SPAWN_STEP_M);
  for (let r = 0; r <= roundBlocks(SPAWN_RADIUS_M); r += step) {
    for (let dz = -r; dz <= r; dz += step) {
      for (let dx = -r; dx <= r; dx += step) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // only the ring's border
        if (generator.getHeight(dx, dz) > SEA_LEVEL + BEACH_BAND) return { x: dx + 0.5, z: dz + 0.5 };
      }
    }
  }
  return { x: 0.5, z: 0.5 };
}

/** A spawn search never scans further than this below the column top (through water, for example). */
const MAX_SURFACE_SCAN = 256;

/**
 * Y coordinate just above the highest solid block of a column (where the player's feet go). The scan starts at
 * the column top (the highest sky-blocking block; nothing above it is solid).
 */
export function surfaceY(getBlock: (x: number, y: number, z: number) => number, x: number, z: number, top: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = top; y > top - MAX_SURFACE_SCAN; y--) {
    if (isSolid(getBlock(bx, y, bz))) return y + 1;
  }
  return top + 1;
}
