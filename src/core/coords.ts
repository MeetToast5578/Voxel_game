import { CHUNK_SIZE } from '../config';
import { floorDiv, mod } from './math';

/** Key of the chunk (cx, cy, cz). */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Key of the column of chunks sharing (cx, cz). */
export function columnKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(w: number): number {
  return floorDiv(w, CHUNK_SIZE);
}

export function worldToLocal(w: number): number {
  return mod(w, CHUNK_SIZE);
}

/** Index into a chunk's block array. Layout: x fastest, then z, then y. */
export function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

/** Index into a column's per-cell arrays (such as column tops): lz * 16 + lx. */
export function columnIndex(lx: number, lz: number): number {
  return lz * CHUNK_SIZE + lx;
}

export function inChunkBounds(lx: number, ly: number, lz: number): boolean {
  return lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE;
}
