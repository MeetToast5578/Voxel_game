import { CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE } from '../config';

// Chunk keys pack (cx, cy, cz) into one safe integer: 21 bits each for x and z, 11 for y.
// That covers ±1,048,576 chunks across (±10,000 km) and ±1,024 chunks up and down (±9.8 km).
const XZ_BIAS = 1 << 20;
const Y_BIAS = 1 << 10;
const XZ_SPAN = 1 << 21;
const Y_SPAN = 1 << 11;
export const CHUNK_Y_MIN = -Y_BIAS;
export const CHUNK_Y_MAX = Y_BIAS - 1;

/** Key of the chunk (cx, cy, cz). Integer arithmetic, no strings. */
export function chunkKey(cx: number, cy: number, cz: number): number {
  return ((cx + XZ_BIAS) * XZ_SPAN + (cz + XZ_BIAS)) * Y_SPAN + (cy + Y_BIAS);
}

/** Key of the column of chunks sharing (cx, cz). */
export function columnKey(cx: number, cz: number): number {
  return (cx + XZ_BIAS) * XZ_SPAN + (cz + XZ_BIAS);
}

/** The column key of a chunk key. */
export function columnOfChunk(key: number): number {
  return Math.floor(key / Y_SPAN);
}

/** Inverse of chunkKey, written into `out` as [cx, cy, cz]. */
export function unpackChunkKey(key: number, out: number[] = [0, 0, 0]): number[] {
  const column = Math.floor(key / Y_SPAN);
  out[1] = key - column * Y_SPAN - Y_BIAS;
  const x = Math.floor(column / XZ_SPAN);
  out[0] = x - XZ_BIAS;
  out[2] = column - x * XZ_SPAN - XZ_BIAS;
  return out;
}

/** The chunk coordinate holding cell coordinate w. Cells are integers, so a shift floors correctly. */
export function toChunk(w: number): number {
  return w >> CHUNK_SHIFT;
}

/** The cell's coordinate inside its chunk, 0..CHUNK_SIZE-1. */
export function toLocal(w: number): number {
  return w & CHUNK_MASK;
}

/** Index into a chunk's cell arrays. Layout: x fastest, then z, then y. */
export function localIndex(lx: number, ly: number, lz: number): number {
  return (((ly << CHUNK_SHIFT) | lz) << CHUNK_SHIFT) | lx;
}

/** Index into a column's per-cell arrays: lz * CHUNK_SIZE + lx. */
export function columnIndex(lx: number, lz: number): number {
  return (lz << CHUNK_SHIFT) | lx;
}

export function inChunk(lx: number, ly: number, lz: number): boolean {
  return lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE;
}
