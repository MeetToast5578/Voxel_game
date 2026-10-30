import { BLOCKS } from '../engine/blocks';

/**
 * Collision box of every state, as bottom and top in sixteenths of a cell (full width in x and z). 0, 0 is no box.
 * Packed as y0 | y1 << 5.
 */
export const COLLISION = new Uint16Array(BLOCKS.stateCount);
for (const t of BLOCKS.types) {
  if (!t.solid) continue;
  for (let v = 0; v < t.variants; v++) {
    const [y0, y1] = t.shape === 'slab' ? (v === 0 ? [0, 8] : [8, 16]) : t.key === 'snow' ? [0, (v + 1) * 2] : t.shape === 'cube' ? [0, 16] : [0, 0];
    if (y1 > y0) COLLISION[t.id + v] = y0 | (y1 << 5);
  }
}

/** Packed collision box of the cell (x, y, z); 0 for none. */
export type BoxAt = (x: number, y: number, z: number) => number;
