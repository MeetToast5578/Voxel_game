import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { floorDiv, mod } from './math';

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunk(w: number): number {
  return floorDiv(w, CHUNK_SIZE);
}

export function worldToLocal(w: number): number {
  return mod(w, CHUNK_SIZE);
}

/** Index into a chunk's block array. Layout: x fastest, then z, then y. */
export function localIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

export function inChunkBounds(lx: number, y: number, lz: number): boolean {
  return lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && y >= 0 && y < WORLD_HEIGHT;
}
