export interface RaycastHit {
  /** Block that was hit. */
  x: number;
  y: number;
  z: number;
  /** Normal of the face that was hit (points back toward the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance from the origin to the hit point. */
  distance: number;
}

/**
 * Voxel traversal (Amanatides & Woo). `dir` must be normalized.
 * The origin cell is skipped for cubes; a ray in a slab's empty half can hit its interior face.
 */
export function raycastVoxels(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDistance: number,
  isTarget: (x: number, y: number, z: number) => boolean | readonly [number, number],
): RaycastHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // A ray starting in the empty half of a slab can hit its interior face.
  const initial = isTarget(x, y, z);
  if (initial && initial !== true) {
    const hit = raySlab(ox, oy, oz, dx, dy, dz, x, y, z, initial, maxDistance);
    if (hit) return hit;
  }
  while (true) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDistance) return null;
    const target = isTarget(x, y, z);
    if (target === true) return { x, y, z, nx, ny, nz, distance: t };
    if (target) {
      const hit = raySlab(ox, oy, oz, dx, dy, dz, x, y, z, target, maxDistance);
      if (hit) return hit;
    }
  }
}

/** Ray/partial-cell AABB intersection, including the correct internal top/bottom face. */
function raySlab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x: number, y: number, z: number, bounds: readonly [number, number], reach: number): RaycastHit | null {
  let near = -Infinity, far = Infinity, normal = -1, sign = 0;
  const origins = [ox, oy, oz], dirs = [dx, dy, dz];
  const lows = [x, y + bounds[0], z], highs = [x + 1, y + bounds[1], z + 1];
  for (let axis = 0; axis < 3; axis++) {
    const o = origins[axis]!, d = dirs[axis]!, lo = lows[axis]!, hi = highs[axis]!;
    if (d === 0) { if (o < lo || o >= hi) return null; continue; }
    const a = (lo - o) / d, b = (hi - o) / d;
    const entry = Math.min(a, b);
    if (entry > near) { near = entry; normal = axis; sign = d > 0 ? -1 : 1; }
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  if (near < 0 || near > reach) return null;
  return { x, y, z, nx: normal === 0 ? sign : 0, ny: normal === 1 ? sign : 0, nz: normal === 2 ? sign : 0, distance: near };
}
