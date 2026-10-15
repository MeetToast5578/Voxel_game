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

/** Any rock of the strata or the deep stone. */
const ROCK_IDS = new Set<number>([
  BlockId.STONE,
  BlockId.GRANITE,
  BlockId.DIORITE,
  BlockId.ANDESITE,
  BlockId.SANDSTONE,
]);

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
        if (ROCK_IDS.has(c.get(lx, h - 3 * SOIL_DEPTH, lz))) stoneBelowSoil++; // deep enough to be past most caves
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
  it('overhangs on the mountains: air under solid rock', { timeout: 60000 }, () => {
    // Seed 1 has a 2,380 m peak near (1480, -3040). Scan each sampled column down from its top solid block.
    const g = new TerrainGenerator(1);
    let overhangs = 0;
    for (let z = -3040; z < -3040 + 48; z += 6)
      for (let x = 1480; x < 1480 + 48; x += 6) {
        const top = g.getHeight(x, z);
        const cy = Math.floor(top / 16);
        const c = new Chunk(Math.floor(x / 16), cy, Math.floor(z / 16));
        g.generateChunk(c);
        const lx = ((x % 16) + 16) % 16;
        const lz = ((z % 16) + 16) % 16;
        let airSeen = false;
        for (let ly = top - cy * 16; ly >= 0; ly--) {
          const id = c.get(lx, ly, lz);
          if (id === BlockId.AIR) airSeen = true;
          else if (airSeen && id !== BlockId.WATER) {
            overhangs++;
            break;
          }
        }
      }
    expect(overhangs).toBeGreaterThan(0);
  });
  it('lays rock strata: several rock types in one mountain column', { timeout: 60000 }, () => {
    // Seed 1, the mountain near (1480, -3040): the column's rock changes with depth.
    const g = new TerrainGenerator(1);
    const x = 1480;
    const z = -3040;
    const top = g.getHeight(x, z);
    const rocks = new Set<number>();
    for (let cy = Math.floor((top - 100) / 16); cy <= Math.floor(top / 16); cy++) {
      const c = new Chunk(Math.floor(x / 16), cy, Math.floor(z / 16));
      g.generateChunk(c);
      for (let ly = 0; ly < 16; ly++) {
        const id = c.get(((x % 16) + 16) % 16, ly, ((z % 16) + 16) % 16);
        if (cy * 16 + ly <= top - SOIL_DEPTH && cy * 16 + ly >= top - 100 && ROCK_IDS.has(id)) rocks.add(id);
      }
    }
    expect(rocks.size).toBeGreaterThanOrEqual(3);
  });
  it('has bare rock on the mountains and grass on the plains, and no trees on bare rock', { timeout: 60000 }, () => {
    const g = new TerrainGenerator(1);
    const surface = (x: number, z: number) => {
      const top = g.getHeight(x, z);
      const cy = Math.floor(top / 16);
      const c = new Chunk(Math.floor(x / 16), cy, Math.floor(z / 16));
      g.generateChunk(c);
      const lx = ((x % 16) + 16) % 16;
      const lz = ((z % 16) + 16) % 16;
      return { id: c.get(lx, top - cy * 16, lz), above: top + 1 < (cy + 1) * 16 ? c.get(lx, top + 1 - cy * 16, lz) : null };
    };
    let plains = 0;
    for (let z = -40; z < 40; z += 5) for (let x = -40; x < 40; x += 5) if (surface(x, z).id === BlockId.GRASS) plains++;
    let bare = 0;
    for (let z = -3040; z < -3040 + 48; z += 6)
      for (let x = 1480; x < 1480 + 48; x += 6) {
        const s = surface(x, z);
        if (s.id === BlockId.GRASS || s.id === BlockId.SAND) continue;
        bare++;
        expect(s.above).not.toBe(BlockId.LOG);
      }
    expect(plains).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
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
