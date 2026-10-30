import { BLOCKS, FLUID } from '../engine/blocks';

/** Box that rays hit for each state, packed like collision boxes (y0 | y1 << 5, sixteenths); 0 is not targetable. */
export const TARGET = new Uint16Array(BLOCKS.stateCount);
for (const t of BLOCKS.types) {
  if (t.layer === 'none' || (BLOCKS.flags[t.id]! & FLUID) !== 0) continue;
  for (let v = 0; v < t.variants; v++) {
    const boxes = t.boxes?.(v);
    const [y0, y1] = t.shape === 'slab' ? (v === 0 ? [0, 8] : [8, 16]) : t.key === 'snow' ? [0, (v + 1) * 2] : t.shape === 'layer' ? [0, 2]
      : boxes ? [Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[4]))] : [0, 16];
    TARGET[t.id + v] = y0 | (y1 << 5);
  }
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Normal of the face hit, pointing back towards the ray. */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

/**
 * Voxel traversal (Amanatides and Woo) from (ox, oy, oz) along the unit vector (dx, dy, dz), up to `reach` cells.
 * `boxAt` returns a packed target box; partial boxes (slabs, snow) are intersected exactly, including from inside
 * their cell.
 */
export function raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number,
  boxAt: (x: number, y: number, z: number) => number): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tdx = stepX ? Math.abs(1 / dx) : Infinity, tdy = stepY ? Math.abs(1 / dy) : Infinity, tdz = stepZ ? Math.abs(1 / dz) : Infinity;
  let tx = stepX > 0 ? (x + 1 - ox) * tdx : stepX < 0 ? (ox - x) * tdx : Infinity;
  let ty = stepY > 0 ? (y + 1 - oy) * tdy : stepY < 0 ? (oy - y) * tdy : Infinity;
  let tz = stepZ > 0 ? (z + 1 - oz) * tdz : stepZ < 0 ? (oz - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  const first = boxAt(x, y, z);
  if (first !== 0 && first !== 16 << 5) {
    const hit = rayBox(ox, oy, oz, dx, dy, dz, x, y, z, first, reach);
    if (hit) return hit;
  }
  for (;;) {
    if (tx < ty && tx < tz) { x += stepX; t = tx; tx += tdx; nx = -stepX; ny = 0; nz = 0; }
    else if (ty < tz) { y += stepY; t = ty; ty += tdy; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tz; tz += tdz; nx = 0; ny = 0; nz = -stepZ; }
    if (t > reach) return null;
    const box = boxAt(x, y, z);
    if (box === 0) continue;
    if (box === 16 << 5) return { x, y, z, nx, ny, nz, distance: t };
    const hit = rayBox(ox, oy, oz, dx, dy, dz, x, y, z, box, reach);
    if (hit) return hit;
  }
}

/** Slab test of a ray against a partial cell box; the normal is that of the face entered. */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  x: number, y: number, z: number, box: number, reach: number): RayHit | null {
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [x, y + (box & 31) / 16, z], hi = [x + 1, y + (box >> 5) / 16, z + 1];
  let near = -Infinity, far = Infinity, axis = -1;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) {
      if (o[a]! < lo[a]! || o[a]! > hi[a]!) return null;
      continue;
    }
    let t0 = (lo[a]! - o[a]!) / d[a]!, t1 = (hi[a]! - o[a]!) / d[a]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) { near = t0; axis = a; }
    far = Math.min(far, t1);
  }
  if (near > far || near < 0 || near > reach || axis < 0) return null;
  const n = [0, 0, 0];
  n[axis] = -Math.sign(d[axis]!);
  return { x, y, z, nx: n[0]!, ny: n[1]!, nz: n[2]!, distance: near };
}
