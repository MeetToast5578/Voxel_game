import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { localIndex } from '../core/coords';
import { BlockId, isOpaque, lightEmission } from './blocks';

export const MAX_LIGHT = 15;
/** Width of a light region: the 3x3 chunks around the chunk being meshed. */
export const REGION_SIZE = CHUNK_SIZE * 3;
const R = REGION_SIZE;
const STRIDE_Y = R * R;

/** Brightness multiplier for light levels 0..15 (each level is 80% of the one above). */
export const LIGHT_CURVE: readonly number[] = Array.from({ length: MAX_LIGHT + 1 }, (_, l) => 0.05 + 0.95 * 0.8 ** (MAX_LIGHT - l));

export function regionIndex(rx: number, y: number, rz: number): number {
  return (y * R + rz) * R + rx;
}

/** Copies 9 chunks (index (dz + 1) * 3 + (dx + 1)) into one REGION_SIZE x WORLD_HEIGHT x REGION_SIZE array. */
export function buildRegion(neighbors: readonly Uint8Array[]): Uint8Array {
  const region = new Uint8Array(R * R * WORLD_HEIGHT);
  for (let dz = 0; dz < 3; dz++)
    for (let dx = 0; dx < 3; dx++) {
      const src = neighbors[dz * 3 + dx]!;
      for (let y = 0; y < WORLD_HEIGHT; y++)
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const from = localIndex(0, y, lz); // a row of 16 blocks along x is contiguous
          region.set(src.subarray(from, from + CHUNK_SIZE), regionIndex(dx * CHUNK_SIZE, y, dz * CHUNK_SIZE + lz));
        }
    }
  return region;
}

/** Breadth-first flood fill: every queued cell spreads (its light - 1) to non-opaque neighbors. */
function propagate(region: Uint8Array, light: Uint8Array, queue: Int32Array, tail: number): void {
  let head = 0;
  const visit = (n: number, nl: number) => {
    if (light[n]! < nl && !isOpaque(region[n]!)) {
      light[n] = nl;
      queue[tail++] = n;
    }
  };
  while (head < tail) {
    const i = queue[head++]!;
    const l = light[i]!;
    if (l <= 1) continue;
    const x = i % R;
    const z = Math.floor(i / R) % R;
    const y = Math.floor(i / STRIDE_Y);
    const nl = l - 1;
    if (x > 0) visit(i - 1, nl);
    if (x < R - 1) visit(i + 1, nl);
    if (z > 0) visit(i - R, nl);
    if (z < R - 1) visit(i + R, nl);
    if (y > 0) visit(i - STRIDE_Y, nl);
    if (y < WORLD_HEIGHT - 1) visit(i + STRIDE_Y, nl);
  }
}

/** Sky light (0..15) for every cell of a region. Sunlight falls straight down at full strength through air and glass. */
export function computeSkyLight(region: Uint8Array): Uint8Array {
  const light = new Uint8Array(region.length);
  const skyTop = new Int32Array(R * R); // per column: lowest y that still gets full sunlight
  for (let z = 0; z < R; z++)
    for (let x = 0; x < R; x++) {
      let y = WORLD_HEIGHT - 1;
      for (; y >= 0; y--) {
        const id = region[regionIndex(x, y, z)]!;
        if (id !== BlockId.AIR && id !== BlockId.GLASS) break;
        light[regionIndex(x, y, z)] = MAX_LIGHT;
      }
      skyTop[z * R + x] = y + 1;
    }
  // Seed the flood fill only where light can actually spread: sunlit cells next to a column that is
  // dark at that height, plus the lowest sunlit cell of each column (spreads down into water/leaves).
  const queue = new Int32Array(region.length);
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
      if (top < maxNeighborTop || top >= WORLD_HEIGHT) continue;
      queue[tail++] = regionIndex(x, top, z);
    }
  propagate(region, light, queue, tail);
  return light;
}

/** Block light (0..15) from light-emitting blocks such as glowstone. */
export function computeBlockLight(region: Uint8Array): Uint8Array {
  const light = new Uint8Array(region.length);
  const queue = new Int32Array(region.length);
  let tail = 0;
  for (let i = 0; i < region.length; i++) {
    const e = lightEmission(region[i]!);
    if (e > 0) {
      light[i] = e;
      queue[tail++] = i;
    }
  }
  propagate(region, light, queue, tail);
  return light;
}
