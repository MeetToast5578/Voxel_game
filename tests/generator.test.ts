import { describe, expect, it } from 'vitest';
import {
  DEEPSLATE_DEPTH_M,
  LEGACY_CHUNKS,
  metersToBlocks,
  ORE_GEN,
  SEA_LEVEL,
  SOIL_DEPTH,
  TERRAIN_CHUNK_BOTTOM,
  TERRAIN_MAX_BLOCKS,
} from '../src/config';
import { columnIndex } from '../src/core/coords';
import { BlockId, blocksSky, parseBlockStateName } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn } from './support/stackedColumn';

/** The highest rugged land found for seed 1 by a field scan, in blocks (spec 22). */
const PEAK = { x: -10667, z: 26000 };

/** Any rock of the strata or the deep stone. */
const ROCK_IDS = new Set<number>([
  BlockId.STONE,
  BlockId.GRANITE,
  BlockId.DIORITE,
  BlockId.ANDESITE,
  BlockId.SANDSTONE,
  BlockId.LIMESTONE,
  BlockId.SLATE,
  BlockId.BASALT,
  BlockId.DEEPSLATE,
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
    // The seed-1 rugged peak (spec 22). Scan each sampled column down from its top solid block.
    const g = new TerrainGenerator(1);
    let overhangs = 0;
    for (let z = PEAK.z; z < PEAK.z + 48; z += 6)
      for (let x = PEAK.x; x < PEAK.x + 48; x += 6) {
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
    // Seed 1, the rugged peak (spec 22): the column's rock changes with depth.
    const g = new TerrainGenerator(1);
    const x = PEAK.x;
    const z = PEAK.z;
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
  it('uses all seven strata rocks above the deepslate, and deepslate only below it', { timeout: 60000 }, () => {
    // Seed 1, the rugged peak (spec 22): the column runs from -100 m (the deepslate line) up to the surface.
    const g = new TerrainGenerator(1);
    const x = PEAK.x;
    const z = PEAK.z;
    const top = g.getHeight(x, z);
    const deepslateTop = Math.ceil(metersToBlocks(DEEPSLATE_DEPTH_M)); // the first block at or above -100 m
    const strata = new Set<number>();
    for (let cy = Math.floor(deepslateTop / 16); cy <= Math.floor(top / 16); cy++) {
      const c = new Chunk(Math.floor(x / 16), cy, Math.floor(z / 16));
      g.generateChunk(c);
      for (let ly = 0; ly < 16; ly++) {
        const y = cy * 16 + ly;
        const id = c.get(((x % 16) + 16) % 16, ly, ((z % 16) + 16) % 16);
        if (y > top - SOIL_DEPTH || !ROCK_IDS.has(id)) continue;
        if (y < deepslateTop) expect(id).toBe(BlockId.DEEPSLATE);
        else {
          expect(id).not.toBe(BlockId.DEEPSLATE);
          strata.add(id);
        }
      }
    }
    const strataRocks = [
      BlockId.GRANITE, BlockId.DIORITE, BlockId.ANDESITE, BlockId.SANDSTONE, BlockId.LIMESTONE, BlockId.SLATE, BlockId.BASALT,
    ];
    for (const rock of strataRocks) expect(strata.has(rock)).toBe(true);
  });
  it('is deepslate for a whole chunk below -100 m, away from the soil', { timeout: 60000 }, () => {
    const g = new TerrainGenerator(1);
    const c = new Chunk(Math.floor(PEAK.x / 16), Math.floor(metersToBlocks(-200) / 16), Math.floor(PEAK.z / 16));
    g.generateChunk(c);
    const rocks = new Set<number>(c.blocks.filter((id) => ROCK_IDS.has(id)));
    expect([...rocks]).toEqual([BlockId.DEEPSLATE]);
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
    for (let z = PEAK.z; z < PEAK.z + 48; z += 6)
      for (let x = PEAK.x; x < PEAK.x + 48; x += 6) {
        const s = surface(x, z);
        if (s.id === BlockId.GRASS || s.id === BlockId.SAND) continue;
        bare++;
        expect(s.above).not.toBe(BlockId.LOG);
      }
    expect(plains).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
  });
  describe('Ores (spec 26)', () => {
    /** Each ore's block id and its depth band in whole blocks, built from the config. */
    function oreBands(): Map<number, [number, number]> {
      const bands = new Map<number, [number, number]>();
      for (const d of ORE_GEN) {
        const id = parseBlockStateName(d.key);
        expect(id).not.toBeNull();
        bands.set(id!, [Math.ceil(metersToBlocks(d.bottomM)), Math.floor(metersToBlocks(d.topM))]);
      }
      return bands;
    }

    it('places ores only inside their depth band, below the surface, and deterministically', {
      timeout: 60000,
    }, () => {
      const g = new TerrainGenerator(1);
      const cz = Math.floor(PEAK.z / 16);
      const bands = oreBands();
      // All ore bands lie below sea level, so scan the deep chunks of a few columns around the peak.
      let ores = 0;
      for (let cx = Math.floor(PEAK.x / 16) - 1; cx <= Math.floor(PEAK.x / 16) + 1; cx++)
        for (let cy = TERRAIN_CHUNK_BOTTOM; cy <= -1; cy++) {
          const c = new Chunk(cx, cy, cz);
          g.generateChunk(c);
          for (let ly = 0; ly < 16; ly++) {
            const y = cy * 16 + ly;
            for (let lx = 0; lx < 16; lx++)
              for (let lz = 0; lz < 16; lz++) {
                const id = c.get(lx, ly, lz);
                const band = bands.get(id);
                if (!band) continue;
                ores++;
                const [minY, maxY] = band;
                expect(y).toBeGreaterThanOrEqual(minY);
                expect(y).toBeLessThanOrEqual(maxY);
                // Ores never replace the surface block.
                expect(y).toBeLessThan(g.getHeight(cx * 16 + lx, cz * 16 + lz));
              }
          }
        }
      expect(ores).toBeGreaterThan(0);
    });
    it('is deterministic across generators: the same seed gives the same veins', { timeout: 60000 }, () => {
      const cx = Math.floor(PEAK.x / 16);
      const cz = Math.floor(PEAK.z / 16);
      expect(stackedColumn(new TerrainGenerator(1), cx, cz).blocks)
        .toEqual(stackedColumn(new TerrainGenerator(1), cx, cz).blocks);
    });
    it('never puts ore below the terrain band', { timeout: 60000 }, () => {
      const g = new TerrainGenerator(1);
      const c = new Chunk(Math.floor(PEAK.x / 16), TERRAIN_CHUNK_BOTTOM - 1, Math.floor(PEAK.z / 16));
      g.generateChunk(c);
      const bands = oreBands();
      expect(c.blocks.some((id) => bands.has(id))).toBe(false);
    });
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
