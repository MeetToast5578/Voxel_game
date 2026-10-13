export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyShape {
  /** Half of the body's width on X and Z. */
  halfWidth: number;
  height: number;
}

export interface CollisionResult {
  onGround: boolean;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

export type SolidFn = (x: number, y: number, z: number) => boolean;

const SKIN = 1e-4;

/**
 * Moves an axis-aligned box (pos = center of the feet) by vel * dt, one axis at a time (Y, X, Z).
 * Mutates pos, and zeroes the velocity component on each axis that collides.
 * Precondition: the box does not overlap a solid block before the move, and per call each axis moves less than
 * the body's width (X, Z) or height (Y).
 */
export function moveAndCollide(pos: Vec3, vel: Vec3, dt: number, shape: BodyShape, isSolid: SolidFn): CollisionResult {
  const result: CollisionResult = { onGround: false, hitX: false, hitY: false, hitZ: false };
  const hw = shape.halfWidth;

  // ---- Y ----
  const dy = vel.y * dt;
  if (dy !== 0) {
    pos.y += dy;
    const minX = Math.floor(pos.x - hw), maxX = Math.ceil(pos.x + hw) - 1;
    const minZ = Math.floor(pos.z - hw), maxZ = Math.ceil(pos.z + hw) - 1;
    const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + shape.height) - 1;
    let hitCell: number | null = null;
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++)
          if (isSolid(x, y, z)) {
            if (hitCell === null || (dy > 0 ? y < hitCell : y > hitCell)) hitCell = y;
          }
    if (hitCell !== null) {
      if (dy > 0) {
        pos.y = hitCell - shape.height - SKIN;
      } else {
        pos.y = hitCell + 1 + SKIN;
        result.onGround = true;
      }
      vel.y = 0;
      result.hitY = true;
    }
  }

  // ---- X ----
  const dx = vel.x * dt;
  if (dx !== 0) {
    pos.x += dx;
    const minX = Math.floor(pos.x - hw), maxX = Math.ceil(pos.x + hw) - 1;
    const minZ = Math.floor(pos.z - hw), maxZ = Math.ceil(pos.z + hw) - 1;
    const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + shape.height) - 1;
    let hitCell: number | null = null;
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++)
          if (isSolid(x, y, z)) {
            if (hitCell === null || (dx > 0 ? x < hitCell : x > hitCell)) hitCell = x;
          }
    if (hitCell !== null) {
      pos.x = dx > 0 ? hitCell - hw - SKIN : hitCell + 1 + hw + SKIN;
      vel.x = 0;
      result.hitX = true;
    }
  }

  // ---- Z ----
  const dz = vel.z * dt;
  if (dz !== 0) {
    pos.z += dz;
    const minX = Math.floor(pos.x - hw), maxX = Math.ceil(pos.x + hw) - 1;
    const minZ = Math.floor(pos.z - hw), maxZ = Math.ceil(pos.z + hw) - 1;
    const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + shape.height) - 1;
    let hitCell: number | null = null;
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++)
          if (isSolid(x, y, z)) {
            if (hitCell === null || (dz > 0 ? z < hitCell : z > hitCell)) hitCell = z;
          }
    if (hitCell !== null) {
      pos.z = dz > 0 ? hitCell - hw - SKIN : hitCell + 1 + hw + SKIN;
      vel.z = 0;
      result.hitZ = true;
    }
  }

  return result;
}
