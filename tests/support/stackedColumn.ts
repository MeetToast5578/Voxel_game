import { BEACH_BAND, CHUNK_VOLUME, LEGACY_CHUNKS, SEA_LEVEL } from '../../src/config';
import { localIndex } from '../../src/core/coords';
import { BlockId } from '../../src/world/blocks';
import { Chunk } from '../../src/world/chunk';
import type { TerrainGenerator } from '../../src/world/generator';

/**
 * The chunks of one column from y = 0 up to just above its highest sky-blocking block, stacked into one array (chunk
 * layout), plus a bounds-checked get. Above the stacked part everything is air.
 */
export interface StackedColumn {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  get(lx: number, y: number, lz: number): number;
}

export function stackedColumn(g: TerrainGenerator, cx: number, cz: number): StackedColumn {
  const top = Math.max(...g.columnTops(cx, cz));
  const chunks = Math.min(LEGACY_CHUNKS, Math.floor(top / 16) + 1);
  const blocks = new Uint16Array(CHUNK_VOLUME * chunks);
  for (let cy = 0; cy < chunks; cy++) {
    const c = new Chunk(cx, cy, cz);
    g.generateChunk(c);
    blocks.set(c.blocks, cy * CHUNK_VOLUME);
  }
  const height = chunks * 16;
  return {
    cx,
    cz,
    blocks,
    get: (lx, y, lz) =>
      lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= height ? BlockId.AIR : blocks[localIndex(lx, y, lz)]!,
  };
}

/**
 * The first n columns (scanning outward from the origin) whose surface is at least `minHeight` blocks up, so tests see
 * trees and caves (the default is any dry land).
 */
export function landColumns(g: TerrainGenerator, n: number, minHeight = SEA_LEVEL + BEACH_BAND): Array<{ cx: number; cz: number }> {
  const out: Array<{ cx: number; cz: number }> = [];
  for (let r = 0; out.length < n; r++)
    for (let cz = -r; cz <= r && out.length < n; cz++)
      for (let cx = -r; cx <= r && out.length < n; cx++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
        if (g.getHeight(cx * 16 + 8, cz * 16 + 8) > minHeight) out.push({ cx, cz });
      }
  return out;
}
