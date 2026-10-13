import { SEA_LEVEL, WORLD_HEIGHT } from '../config';
import { isSolid } from './blocks';
import type { TerrainGenerator } from './generator';

/** Finds a dry-land column near the origin, searching outward in square rings. Returns block-center coordinates. */
export function findSpawnColumn(generator: TerrainGenerator): { x: number; z: number } {
  for (let r = 0; r <= 512; r += 8) {
    for (let dz = -r; dz <= r; dz += 8) {
      for (let dx = -r; dx <= r; dx += 8) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // only the ring's border
        if (generator.getHeight(dx, dz) > SEA_LEVEL + 1) return { x: dx + 0.5, z: dz + 0.5 };
      }
    }
  }
  return { x: 0.5, z: 0.5 };
}

/** Y coordinate just above the highest solid block of a column (where the player's feet go). */
export function surfaceY(getBlock: (x: number, y: number, z: number) => number, x: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (isSolid(getBlock(bx, y, bz))) return y + 1;
  }
  return WORLD_HEIGHT;
}
