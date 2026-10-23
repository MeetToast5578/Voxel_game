import { CHUNK_SIZE } from '../config';
import { mulberry32 } from '../core/random';

/**
 * A stable, order-free mix of several integers into a 32-bit seed. Used so a chunk's
 * random ticks depend only on the world seed, the tick number and the chunk position.
 */
export function mixSeed(a: number, b: number, c: number, d: number, e: number): number {
  let h = 0x9e3779b9 >>> 0;
  for (const v of [a, b, c, d, e]) {
    h = (h ^ Math.imul(v | 0, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  }
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Draw `count` random cells of chunk (cx, cy, cz) for the world tick `tick`, and call
 * `visit(worldX, worldY, worldZ, rng)` for each. Deterministic: the same seed, tick and
 * chunk always draw the same cells in the same order. `rng` is the shared per-chunk stream,
 * so a rule that rolls more than once still sees a stable sequence.
 */
export function forEachRandomCell(
  seed: number,
  tick: number,
  cx: number,
  cy: number,
  cz: number,
  count: number,
  visit: (wx: number, wy: number, wz: number, rng: () => number) => void,
): void {
  const rng = mulberry32(mixSeed(seed, tick, cx, cy, cz));
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  for (let i = 0; i < count; i++) {
    const lx = (rng() * CHUNK_SIZE) | 0;
    const ly = (rng() * CHUNK_SIZE) | 0;
    const lz = (rng() * CHUNK_SIZE) | 0;
    visit(x0 + lx, y0 + ly, z0 + lz, rng);
  }
}
