import { SLAB_HEIGHT } from '../config';
import { BlockId, blockVariant, getBlockDef, isSolid, isWaterState, slabBounds } from '../world/blocks';
import type { BodyShape, Vec3 } from './physics';
import type { RaycastHit } from './raycast';

export interface Placement { x: number; y: number; z: number; state: number; }

/** Resolve slab orientation/merging before checking the actual placed volume against the player. */
export function resolvePlacement(
  hit: RaycastHit, getBlock: (x: number, y: number, z: number) => number,
  state: number, pos: Vec3, shape: BodyShape, hitY = hit.y + SLAB_HEIGHT,
): Placement | null {
  const material = getBlockDef(state).slabMaterial;
  let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  let placed = state;
  if (material !== undefined) {
    const aimed = getBlock(hit.x, hit.y, hit.z);
    const aimedDef = getBlockDef(aimed);
    if (aimedDef.slabMaterial === material && ((blockVariant(aimed) === 0 && hit.ny > 0) || (blockVariant(aimed) === 1 && hit.ny < 0))) {
      x = hit.x; y = hit.y; z = hit.z; placed = material;
    } else {
      const top = hit.ny < 0 || (hit.ny === 0 && hitY - Math.floor(hitY) >= SLAB_HEIGHT);
      placed = getBlockDef(state).id + (top ? 1 : 0);
    }
  }
  const existing = getBlock(x, y, z);
  if (placed !== material && existing !== BlockId.AIR && !isWaterState(existing)) {
    const def = getBlockDef(existing);
    if (material !== undefined && def.slabMaterial === material && blockVariant(existing) !== blockVariant(placed)) placed = material;
    else return null;
  }
  const bounds = slabBounds(placed) ?? [0, 1];
  if (isSolid(placed) && x < pos.x + shape.halfWidth && x + 1 > pos.x - shape.halfWidth &&
      y + bounds[0]! < pos.y + shape.height && y + bounds[1]! > pos.y &&
      z < pos.z + shape.halfWidth && z + 1 > pos.z - shape.halfWidth) return null;
  return { x, y, z, state: placed };
}
