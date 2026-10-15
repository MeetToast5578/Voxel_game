import { describe, expect, it } from 'vitest';
import { LEGACY_CHUNKS, LEGACY_HEIGHT, SEA_LEVEL, SOIL_DEPTH, TERRAIN_MAX_BLOCKS } from '../src/config';
import { columnIndex } from '../src/core/coords';
import { BlockId, blocksSky } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { stackedColumn } from './support/stackedColumn';

function generate(seed: number, cx: number, cy: number, cz: number): Chunk {
  const c = new Chunk(cx, cy, cz);
  new TerrainGenerator(seed).generateChunk(c);
  return c;
}

describe('TerrainGenerator', () => {
  it('is deterministic', () => {
    expect(generate(1234, 3, 2, -2).blocks).toEqual(generate(1234, 3, 2, -2).blocks);
    expect(generate(1234, 3, 2, -2).blocks).not.toEqual(generate(999, 3, 2, -2).blocks);
  });
  it('heights stay inside the legacy terrain range', () => {
    const g = new TerrainGenerator(5);
    for (let x = -500; x < 500; x += 37)
      for (let z = -500; z < 500; z += 41) {
        const h = g.getHeight(x, z);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(TERRAIN_MAX_BLOCKS);
      }
  });
  it('builds layers: stone floor, stone, surface, water', () => {
    const g = new TerrainGenerator(1234);
    const c = stackedColumn(g, 3, -2);
    let stoneBelowSurface = 0;
    for (let lx = 0; lx < 16; lx++)
      for (let lz = 0; lz < 16; lz++) {
        expect(c.get(lx, 0, lz)).toBe(BlockId.STONE); // y = 0 is stone, not bedrock
        expect(c.get(lx, LEGACY_HEIGHT - 1, lz)).toBe(BlockId.AIR);
        const h = g.getHeight(3 * 16 + lx, -2 * 16 + lz);
        if (c.get(lx, h - SOIL_DEPTH - 1, lz) === BlockId.STONE) stoneBelowSurface++; // below the soil
        if (h < SEA_LEVEL) expect(c.get(lx, SEA_LEVEL, lz)).toBe(BlockId.WATER);
        expect(c.get(lx, h + 1, lz)).not.toBe(BlockId.STONE);
      }
    // Nearly every column has stone 5 blocks below the surface (caves may remove a few).
    expect(stoneBelowSurface).toBeGreaterThan(256 * 0.9);
  });
  it('never generates bedrock', () => {
    const c = stackedColumn(new TerrainGenerator(1234), 3, -2);
    expect(c.blocks.includes(BlockId.BEDROCK)).toBe(false);
  });
  it('stacked chunks cy 0..LEGACY_CHUNKS-1 equal the legacy column byte for byte', () => {
    const g = new TerrainGenerator(42);
    for (const [cx, cz] of [[0, 0], [5, -3], [-7, 2], [12, 9]] as const) {
      expect(stackedColumn(g, cx, cz).blocks).toEqual(g.legacyColumn(cx, cz));
    }
  });
  it('is solid stone below y = 0 and air above the legacy column', () => {
    expect(generate(42, 1, -3, 1).blocks.every((b) => b === BlockId.STONE)).toBe(true);
    expect(generate(42, 1, LEGACY_CHUNKS, 1).blocks.every((b) => b === BlockId.AIR)).toBe(true);
  });
  it('computes exact column tops (water blocks the sky, glass and air do not)', () => {
    const g = new TerrainGenerator(42);
    const seen = new Set<number>();
    for (let cz = -4; cz < 0; cz++) // this 4 x 4 area of seed 42 has trees, open water and a beach
      for (let cx = 3; cx < 7; cx++) {
        const c = stackedColumn(g, cx, cz);
        const tops = g.columnTops(cx, cz);
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) {
            let y = LEGACY_HEIGHT - 1;
            while (y >= 0 && !blocksSky(c.get(lx, y, lz))) y--;
            expect(tops[columnIndex(lx, lz)]).toBe(y);
            seen.add(c.get(lx, y, lz));
          }
      }
    // The area includes trees, open water and a beach.
    expect(seen.has(BlockId.LEAVES)).toBe(true);
    expect(seen.has(BlockId.WATER)).toBe(true);
    expect(seen.has(BlockId.SAND)).toBe(true);
    expect(blocksSky(BlockId.WATER)).toBe(true);
    expect(blocksSky(BlockId.GLASS)).toBe(false);
    expect(blocksSky(BlockId.AIR)).toBe(false);
  });
  it('generates a chunk in a few milliseconds', () => {
    const g = new TerrainGenerator(99);
    g.generateChunk(new Chunk(-1, 2, -1)); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) g.generateChunk(new Chunk(i, 2, 0));
    const ms = (performance.now() - t0) / 20;
    console.log(`generateChunk: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(30);
  });
});

