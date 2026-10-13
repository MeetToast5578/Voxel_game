import { CHUNK_VOLUME } from '../../src/config';
import { localIndex } from '../../src/core/coords';
import { BlockId } from '../../src/world/blocks';
import { Chunk } from '../../src/world/chunk';
import { LEGACY_CHUNKS, type TerrainGenerator } from '../../src/world/generator';

/** Chunks cy 0..7 of one column stacked into a 16 x 128 x 16 array (chunk layout), plus a bounds-checked get. */
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
  const height = LEGACY_CHUNKS * 16;
  return {
    cx,
    cz,
    blocks,
    get: (lx, y, lz) =>
      lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= height ? BlockId.AIR : blocks[localIndex(lx, y, lz)]!,
  };
}
