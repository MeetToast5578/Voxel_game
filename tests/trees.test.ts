import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';

describe('trees', () => {
  const g = new TerrainGenerator(42);
  const chunks: Chunk[] = [];
  for (let i = 0; i < 40; i++) {
    const c = new Chunk(i, 7);
    g.generateChunk(c);
    chunks.push(c);
  }
  it('some chunks have trees, not all', () => {
    const withTrees = chunks.filter((c) => c.blocks.includes(BlockId.LOG)).length;
    expect(withTrees).toBeGreaterThan(5);
    expect(withTrees).toBeLessThan(40);
  });
  it('every log stands on dirt or another log, and trunks stay 2+ blocks from chunk edges', () => {
    for (const c of chunks)
      for (let y = 1; y < 128; y++)
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) {
            if (c.blocks[localIndex(lx, y, lz)] !== BlockId.LOG) continue;
            expect([BlockId.LOG, BlockId.DIRT]).toContain(c.get(lx, y - 1, lz));
            expect(lx).toBeGreaterThanOrEqual(2);
            expect(lx).toBeLessThanOrEqual(13);
            expect(lz).toBeGreaterThanOrEqual(2);
            expect(lz).toBeLessThanOrEqual(13);
          }
  });
  it('every tree has leaves directly above its trunk', () => {
    for (const c of chunks)
      for (let lz = 2; lz <= 13; lz++)
        for (let lx = 2; lx <= 13; lx++) {
          let top = -1;
          for (let y = 0; y < 128; y++) if (c.get(lx, y, lz) === BlockId.LOG) top = y;
          if (top >= 0) expect(c.get(lx, top + 1, lz)).toBe(BlockId.LEAVES);
        }
  });
});
