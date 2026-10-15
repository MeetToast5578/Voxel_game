import { describe, expect, it } from 'vitest';
import {
  LEGACY_CHUNKS,
  metersToBlocks,
  SEA_LEVEL,
  SOIL_DEPTH,
  TERRAIN_CHUNK_BOTTOM,
  TERRAIN_MAX_BLOCKS,
} from '../src/config';
import { columnIndex } from '../src/core/coords';
import { BlockId, blocksSky } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn } from './support/stackedColumn';

function generate(seed: number, cx: number, cy: number, cz: number): Chunk {
  const c = new Chunk(cx, cy, cz);
  new TerrainGenerator(seed).generateChunk(c);
  return c;
}

describe('TerrainGenerator', () => {
  it('is deterministic', () => {
    const g = new TerrainGenerator(1234);
    const cy = Math.floor(g.getHeight(3 * 16 + 8, -2 * 16 + 8) / 16); // a chunk that holds the surface
    expect(generate(1234, 3, cy, -2).blocks).toEqual(generate(1234, 3, cy, -2).blocks);
    expect(generate(1234, 3, cy, -2).blocks).not.toEqual(generate(999, 3, cy, -2).blocks);
  });
  it('heights stay inside the terrain band', () => {
    const g = new TerrainGenerator(5);
    for (let x = -500; x < 500; x += 37)
      for (let z = -500; z < 500; z += 41) {
        const h = g.getHeight(x, z);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(Math.floor(metersToBlocks(-300)));
        expect(h).toBeLessThanOrEqual(TERRAIN_MAX_BLOCKS);
      }
  });
  it('builds layers: stone below the soil, surface, water up to sea level', () => {
    const g = new TerrainGenerator(1234);
    const [{ cx, cz }] = landColumns(g, 1, 60);
    const c = stackedColumn(g, cx!, cz!);
    let stoneBelowSoil = 0;
    for (let lx = 0; lx < 16; lx++)
      for (let lz = 0; lz < 16; lz++) {
        const h = g.getHeight(cx! * 16 + lx, cz! * 16 + lz);
        if (c.get(lx, h - 3 * SOIL_DEPTH, lz) === BlockId.STONE) stoneBelowSoil++; // deep enough to be past most caves
        if (h < SEA_LEVEL) expect(c.get(lx, SEA_LEVEL, lz)).toBe(BlockId.WATER);
        expect(c.get(lx, h + 1, lz)).not.toBe(BlockId.STONE);
      }
    // Nearly every column has stone well below the soil (caves may open a few).
    expect(stoneBelowSoil).toBeGreaterThan(256 * 0.9);
  });
  it('never generates bedrock', () => {
    const g = new TerrainGenerator(1234);
    const [{ cx, cz }] = landColumns(g, 1);
    expect(stackedColumn(g, cx!, cz!).blocks.includes(BlockId.BEDROCK)).toBe(false);
  });
  it('stacked chunks equal the legacy column byte for byte, up to the top of the column', () => {
    const g = new TerrainGenerator(42);
    for (const { cx, cz } of landColumns(g, 3)) {
      const stacked = stackedColumn(g, cx, cz).blocks;
      expect(stacked).toEqual(g.legacyColumn(cx, cz).subarray(0, stacked.length));
    }
  });
  it('is stone below the terrain band and air above it', () => {
    expect(generate(42, 1, TERRAIN_CHUNK_BOTTOM - 1, 1).blocks.every((b) => b === BlockId.STONE)).toBe(true);
    expect(generate(42, 1, LEGACY_CHUNKS, 1).blocks.every((b) => b === BlockId.AIR)).toBe(true);
  });
  it('computes exact column tops (water blocks the sky, glass and air do not)', { timeout: 60000 }, () => {
    const g = new TerrainGenerator(42);
    const seen = new Set<number>();
    for (const { cx, cz } of landColumns(g, 16)) {
      const c = stackedColumn(g, cx, cz);
      const tops = g.columnTops(cx, cz);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          let y = c.blocks.length / 256 - 1;
          while (y >= 0 && !blocksSky(c.get(lx, y, lz))) y--;
          expect(tops[columnIndex(lx, lz)]).toBe(y);
          seen.add(c.get(lx, y, lz));
        }
    }
    // The area includes trees, water (on the coast) and a beach.
    expect(seen.has(BlockId.LEAVES)).toBe(true);
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
