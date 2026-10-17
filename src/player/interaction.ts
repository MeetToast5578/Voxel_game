import { BlockId, getBlockDef, isSolid, isWaterState } from '../world/blocks';
import type { BodyShape, Vec3 } from './physics';
import type { RaycastHit } from './raycast';

/** True if block cell (bx, by, bz) overlaps the body standing at pos (feet center). Touching is not overlapping. */
export function blockIntersectsBody(bx: number, by: number, bz: number, pos: Vec3, shape: BodyShape): boolean {
  return (
    bx < pos.x + shape.halfWidth &&
    bx + 1 > pos.x - shape.halfWidth &&
    by < pos.y + shape.height &&
    by + 1 > pos.y &&
    bz < pos.z + shape.halfWidth &&
    bz + 1 > pos.z - shape.halfWidth
  );
}

export function canBreak(id: number): boolean {
  return getBlockDef(id).breakable;
}

/** The cell where a block would be placed for this hit, or null if placing there is not allowed. */
export function placementTarget(
  hit: RaycastHit,
  getBlock: (x: number, y: number, z: number) => number,
  blockToPlace: number,
  playerPos: Vec3,
  shape: BodyShape,
): { x: number; y: number; z: number } | null {
  const x = hit.x + hit.nx;
  const y = hit.y + hit.ny;
  const z = hit.z + hit.nz;
  const existing = getBlock(x, y, z);
  if (existing !== BlockId.AIR && !isWaterState(existing)) return null;
  if (isSolid(blockToPlace) && blockIntersectsBody(x, y, z, playerPos, shape)) return null;
  return { x, y, z };
}
