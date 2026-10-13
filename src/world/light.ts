import { CHUNK_SIZE } from '../config';
import { columnIndex, localIndex } from '../core/coords';
import { EMISSION_TABLE, OPAQUE_TABLE } from './blocks';

export const MAX_LIGHT = 15;
/** Width of a light region along every axis: the 3x3x3 chunks around the chunk being meshed. */
export const REGION_SIZE = CHUNK_SIZE * 3;
const R = REGION_SIZE;
const STRIDE_Y = R * R;
const REGION_VOLUME = R * R * R;

/*
 * Why a 3x3x3 region gives exact light for the centre chunk: light loses 1 per block and starts at most at 15,
 * so it reaches at most 14 blocks from its source. The centre chunk sits 16 cells from every face of the
 * region, so every cell of the centre chunk and of its 1-block border is at least 15 cells from the outside.
 * Light from beyond the region, or along a path that leaves the region, would arrive at 0 or less. Direct
 * sunlight comes from the column tops, which are exact however much of the column is loaded.
 */

/** Brightness multiplier for light levels 0..15 (each level is 80% of the one above). */
export const LIGHT_CURVE: readonly number[] = Array.from({ length: MAX_LIGHT + 1 }, (_, l) => 0.05 + 0.95 * 0.8 ** (MAX_LIGHT - l));

/** Index into a region array; rx, ry, rz are 0..47 and the centre chunk starts at 16 on every axis. */
export function regionIndex(rx: number, ry: number, rz: number): number {
  return (ry * R + rz) * R + rx;
}

/** Index of neighbour chunk (dx, dy, dz), each -1..1, in the 27-chunk neighbour list; the centre is 13. */
export function neighborIndex(dx: number, dy: number, dz: number): number {
  return (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1);
}

/** Copies 27 chunks (index (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1)) into one 48 x 48 x 48 array. */
export function buildRegion(neighbors: readonly Uint16Array[]): Uint16Array {
  if (neighbors.length !== 27) throw new Error('buildRegion needs 27 chunks');
  const region = new Uint16Array(REGION_VOLUME);
  // Fill the region in its own order: each region row (fixed y and z) is 3 contiguous 16-block chunk rows.
  let to = 0;
  for (let ry = 0; ry < R; ry++) {
    const dy = Math.floor(ry / CHUNK_SIZE);
    const ly = ry % CHUNK_SIZE;
    for (let rz = 0; rz < R; rz++) {
      const dz = Math.floor(rz / CHUNK_SIZE);
      const from = localIndex(0, ly, rz % CHUNK_SIZE);
      for (let dx = 0; dx < 3; dx++) {
        const src = neighbors[dy * 9 + dz * 3 + dx]!;
        for (let k = 0; k < CHUNK_SIZE; k++) region[to++] = src[from + k]!;
      }
    }
  }
  return region;
}

/** Flood-fill queue shared by every call (the light code is synchronous, one call at a time per thread). */
let sharedQueue: Int32Array | null = null;
function queueBuffer(): Int32Array {
  sharedQueue ??= new Int32Array(REGION_VOLUME);
  return sharedQueue;
}

/** Breadth-first flood fill: every queued cell spreads (its light - 1) to non-opaque neighbors inside the region. */
function propagate(region: Uint16Array, light: Uint8Array, queue: Int32Array, tail: number): void {
  const opaque = OPAQUE_TABLE;
  let head = 0;
  while (head < tail) {
    const i = queue[head++]!;
    const l = light[i]!;
    if (l <= 1) continue;
    const x = i % R;
    const z = Math.floor(i / R) % R;
    const y = Math.floor(i / STRIDE_Y);
    const nl = l - 1;
    if (x > 0 && light[i - 1]! < nl && !opaque[region[i - 1]!]) {
      light[i - 1] = nl;
      queue[tail++] = i - 1;
    }
    if (x < R - 1 && light[i + 1]! < nl && !opaque[region[i + 1]!]) {
      light[i + 1] = nl;
      queue[tail++] = i + 1;
    }
    if (z > 0 && light[i - R]! < nl && !opaque[region[i - R]!]) {
      light[i - R] = nl;
      queue[tail++] = i - R;
    }
    if (z < R - 1 && light[i + R]! < nl && !opaque[region[i + R]!]) {
      light[i + R] = nl;
      queue[tail++] = i + R;
    }
    if (y > 0 && light[i - STRIDE_Y]! < nl && !opaque[region[i - STRIDE_Y]!]) {
      light[i - STRIDE_Y] = nl;
      queue[tail++] = i - STRIDE_Y;
    }
    if (y < R - 1 && light[i + STRIDE_Y]! < nl && !opaque[region[i + STRIDE_Y]!]) {
      light[i + STRIDE_Y] = nl;
      queue[tail++] = i + STRIDE_Y;
    }
  }
}

/**
 * Sky light (0..15) for every cell of a region. A cell is in direct sunlight (15) when it is above its column's
 * top; the flood fill then spreads sunlight sideways and down into the shade.
 * tops: the 9 column-top arrays around the centre column, index (dz + 1) * 3 + (dx + 1).
 * regionY0: world y of region row 0, which is (cy - 1) * 16 for the chunk cy being meshed.
 */
export function computeSkyLight(region: Uint16Array, tops: readonly Int32Array[], regionY0: number): Uint8Array {
  const light = new Uint8Array(REGION_VOLUME);
  const skyTop = new Int32Array(R * R); // per region column: lowest region y in direct sunlight (R = none)
  for (let z = 0; z < R; z++)
    for (let x = 0; x < R; x++) {
      const columnTops = tops[Math.floor(z / CHUNK_SIZE) * 3 + Math.floor(x / CHUNK_SIZE)];
      if (!columnTops) throw new Error('computeSkyLight needs 9 column-top arrays');
      const top = columnTops[columnIndex(x % CHUNK_SIZE, z % CHUNK_SIZE)]!;
      const first = Math.min(R, Math.max(0, top - regionY0 + 1));
      skyTop[z * R + x] = first;
      for (let y = first; y < R; y++) light[regionIndex(x, y, z)] = MAX_LIGHT;
    }
  // Seed the flood fill only where light can actually spread: sunlit cells next to a column that is
  // dark at that height, plus the lowest sunlit cell of each column (spreads down into water/leaves).
  const queue = queueBuffer();
  let tail = 0;
  for (let z = 0; z < R; z++)
    for (let x = 0; x < R; x++) {
      const top = skyTop[z * R + x]!;
      let maxNeighborTop = top;
      if (x > 0) maxNeighborTop = Math.max(maxNeighborTop, skyTop[z * R + x - 1]!);
      if (x < R - 1) maxNeighborTop = Math.max(maxNeighborTop, skyTop[z * R + x + 1]!);
      if (z > 0) maxNeighborTop = Math.max(maxNeighborTop, skyTop[(z - 1) * R + x]!);
      if (z < R - 1) maxNeighborTop = Math.max(maxNeighborTop, skyTop[(z + 1) * R + x]!);
      for (let y = top; y < maxNeighborTop; y++) queue[tail++] = regionIndex(x, y, z);
      if (top < maxNeighborTop || top >= R) continue;
      queue[tail++] = regionIndex(x, top, z);
    }
  propagate(region, light, queue, tail);
  return light;
}

/** Block light (0..15) from light-emitting blocks such as glowstone. */
export function computeBlockLight(region: Uint16Array): Uint8Array {
  const light = new Uint8Array(REGION_VOLUME);
  const emission = EMISSION_TABLE;
  const queue = queueBuffer();
  let tail = 0;
  for (let i = 0; i < REGION_VOLUME; i++) {
    const e = emission[region[i]!]!;
    if (e > 0) {
      light[i] = e;
      queue[tail++] = i;
    }
  }
  if (tail > 0) propagate(region, light, queue, tail);
  return light;
}
