import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, WORLD_HEIGHT } from '../src/config';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';

function generate(seed: number, cx: number, cz: number): Chunk {
  const c = new Chunk(cx, cz);
  new TerrainGenerator(seed).generateChunk(c);
  return c;
}

describe('TerrainGenerator', () => {
  it('is deterministic', () => {
    expect(generate(1234, 3, -2).blocks).toEqual(generate(1234, 3, -2).blocks);
    expect(generate(1234, 3, -2).blocks).not.toEqual(generate(999, 3, -2).blocks);
  });
  it('heights stay inside the world', () => {
    const g = new TerrainGenerator(5);
    for (let x = -500; x < 500; x += 37)
      for (let z = -500; z < 500; z += 41) {
        const h = g.getHeight(x, z);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(WORLD_HEIGHT - 12);
      }
  });
  it('builds layers: bedrock, stone, surface, water', () => {
    const g = new TerrainGenerator(1234);
    const c = new Chunk(3, -2);
    g.generateChunk(c);
    let stoneBelowSurface = 0;
    for (let lx = 0; lx < 16; lx++)
      for (let lz = 0; lz < 16; lz++) {
        expect(c.get(lx, 0, lz)).toBe(BlockId.BEDROCK);
        expect(c.get(lx, WORLD_HEIGHT - 1, lz)).toBe(BlockId.AIR);
        const h = g.getHeight(3 * 16 + lx, -2 * 16 + lz);
        if (c.get(lx, h - 5, lz) === BlockId.STONE) stoneBelowSurface++;
        if (h < SEA_LEVEL) expect(c.get(lx, SEA_LEVEL, lz)).toBe(BlockId.WATER);
        expect(c.get(lx, h + 1, lz)).not.toBe(BlockId.STONE);
      }
    // Nearly every column has stone 5 blocks below the surface (caves may remove a few).
    expect(stoneBelowSurface).toBeGreaterThan(256 * 0.9);
  });
  it('generates a chunk in a few milliseconds', () => {
    const g = new TerrainGenerator(99);
    g.generateChunk(new Chunk(-1, -1)); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) g.generateChunk(new Chunk(i, 0));
    const ms = (performance.now() - t0) / 20;
    console.log(`generateChunk: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(30);
  });
});
