import { CHUNK_VOLUME, LEGACY_CHUNKS, LEGACY_HEIGHT } from '../../src/config';
import { localIndex } from '../../src/core/coords';
import { BlockId } from '../../src/world/blocks';
import { Chunk } from '../../src/world/chunk';
import type { TerrainGenerator } from '../../src/world/generator';

/** The legacy chunks cy 0..LEGACY_CHUNKS-1 of one column stacked into a 16 x LEGACY_HEIGHT x 16 array, plus a bounds-checked get. */
export interface StackedColumn {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  get(lx: number, y: number, lz: number): number;
}

export function stackedColumn(g: TerrainGenerator, cx: number, cz: number): StackedColumn {
  const blocks = new Uint16Array(CHUNK_VOLUME * LEGACY_CHUNKS);
  for (let cy = 0; cy < LEGACY_CHUNKS; cy++) {
    const c = new Chunk(cx, cy, cz);
    g.generateChunk(c);
    blocks.set(c.blocks, cy * CHUNK_VOLUME);
  }
  const height = LEGACY_HEIGHT;
  return {
    cx,
    cz,
    blocks,
    get: (lx, y, lz) =>
      lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= height ? BlockId.AIR : blocks[localIndex(lx, y, lz)]!,
  };
}
