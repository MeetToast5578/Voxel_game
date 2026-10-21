import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AQUIFER_AMPLITUDE_M, AQUIFER_LEVEL_M, CAVE_BOTTOM_ROWS, metersToBlocks,
  SHORE_ROOF, TERRAIN_CHUNK_BOTTOM,
} from '../src/config';
import { AquiferSampler } from '../src/world/aquifer';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainDensity } from '../src/world/density';
import { TerrainGenerator } from '../src/world/generator';
import { RegionSampler } from '../src/world/region';
import { ClimateSampler } from '../src/world/shape';

afterEach(() => vi.restoreAllMocks());

/** Flat terrain with controlled cave and table fields: tests assert filling, not accidental noise hits. */
function fixture(surface = 100, open = true, waterLevelM = 0, river = false) {
  vi.spyOn(ClimateSampler.prototype, 'fields').mockReturnValue({
    continentalness: 0.2, erosion: 1, peaks: 0, temperature: 0, humidity: 0, weirdness: 0,
  });
  vi.spyOn(RegionSampler.prototype, 'sample').mockReturnValue({
    offsetM: surface * 0.3, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
    waterLevelM, moisture: 0, isRiver: river, isLake: false,
  });
  vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_x, y) => y <= surface);
  vi.spyOn(AquiferSampler.prototype, 'waterTableAt').mockReturnValue(-128);
  const g = new TerrainGenerator(42);
  Object.assign(g, { caves: {
    cheese: () => open ? 1 : -1, noodleA: () => 1, noodleB: () => 1,
    spaghettiA: () => 1, spaghettiB: () => 1, ravine: () => 1,
  } });
  return g;
}

function chunk(g: TerrainGenerator, cx: number, cy: number, cz: number): Chunk {
  const c = new Chunk(cx, cy, cz);
  g.generateChunk(c);
  return c;
}

describe('local groundwater tables', () => {
  it('is seed deterministic, varies by position and seed, and stays in the configured metre band', () => {
    const a = new AquiferSampler(1), again = new AquiferSampler(1), b = new AquiferSampler(2);
    const levels = new Set<number>();
    let changed = 0;
    for (let z = -1500; z <= 1500; z += 137) for (let x = -1500; x <= 1500; x += 131) {
      const level = a.waterTableAt(x, z, 1000);
      expect(again.waterTableAt(x, z, 1000)).toBe(level);
      expect(level).toBeGreaterThanOrEqual(Math.floor(metersToBlocks(AQUIFER_LEVEL_M - AQUIFER_AMPLITUDE_M)));
      expect(level).toBeLessThanOrEqual(Math.floor(metersToBlocks(AQUIFER_LEVEL_M + AQUIFER_AMPLITUDE_M)));
      expect(level).toBeLessThan(0);
      levels.add(level);
      if (b.waterTableAt(x, z, 1000) !== level) changed++;
    }
    expect(levels.size).toBeGreaterThan(20);
    expect(changed).toBeGreaterThan(0);
  });

  it('keeps groundwater below the terrain by the full shore roof', () => {
    const a = new AquiferSampler(1);
    for (const surface of [-1000, -500, -100, 0, 100]) {
      expect(a.waterTableAt(-16, -1, surface)).toBeLessThanOrEqual(surface - SHORE_ROOF);
    }
    expect(a.waterTableAt(-16, -1, -1000)).toBe(-1000 - SHORE_ROOF);
  });
});

describe('aquifer generation (spec 46)', () => {
  it('fills at and below the table, leaving dry caves above it across a negative vertical chunk seam', () => {
    const g = fixture();
    expect(chunk(g, -1, -9, -1).blocks.every(id => id === BlockId.WATER)).toBe(true);
    const crossing = chunk(g, -1, -8, -1);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      expect(crossing.get(x, 0, z)).toBe(BlockId.WATER); // y=-128: table is inclusive
      expect(crossing.get(x, 1, z)).toBe(BlockId.AIR);
      expect(crossing.get(x, 15, z)).toBe(BlockId.AIR);
    }
  });

  it('carves continuously across sea level instead of leaving a solid y=0/1 plane', () => {
    const g = fixture();
    expect(chunk(g, 0, -1, 0).blocks.every(id => id === BlockId.AIR)).toBe(true);
    const above = chunk(g, 0, 0, 0);
    expect(above.get(0, 0, 0)).toBe(BlockId.AIR);
    expect(above.get(0, 1, 0)).toBe(BlockId.AIR);
  });

  it('protects the actual terrain-band bottom and leaves lower chunks solid stone', () => {
    const g = fixture();
    const bottom = chunk(g, 0, TERRAIN_CHUNK_BOTTOM, 0);
    for (let y = 0; y < CAVE_BOTTOM_ROWS; y++) {
      expect(bottom.get(0, y, 0)).not.toBe(BlockId.AIR);
      expect(bottom.get(0, y, 0)).not.toBe(BlockId.WATER);
    }
    expect(bottom.get(0, CAVE_BOTTOM_ROWS, 0)).toBe(BlockId.WATER);
    expect(chunk(g, 0, TERRAIN_CHUNK_BOTTOM - 1, 0).blocks.every(id => id === BlockId.STONE)).toBe(true);
  });

  it('uses the same water table for deep density voids with cave carving disabled', () => {
    const g = fixture(100, false);
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_x, y) => y <= 100 && !(y >= -130 && y <= -120));
    const low = chunk(g, 0, -9, 0), high = chunk(g, 0, -8, 0);
    expect(low.get(0, 14, 0)).toBe(BlockId.WATER); // -130
    expect(high.get(0, 0, 0)).toBe(BlockId.WATER); // -128
    expect(high.get(0, 1, 0)).toBe(BlockId.AIR); // -127, below sea but above groundwater
    expect(high.get(0, 8, 0)).toBe(BlockId.AIR); // -120
    expect(high.get(0, 9, 0)).not.toBe(BlockId.AIR); // -119 remains rock
    expect(high.get(0, 9, 0)).not.toBe(BlockId.WATER);
  });

  it('retains ocean water and its uncarved roof above deep aquifers', () => {
    const g = fixture(-100);
    const water = chunk(g, 0, -6, 0); // -96..-81, above the seabed
    expect(water.blocks.every(id => id === BlockId.WATER)).toBe(true);
    expect(chunk(g, 0, 0, 0).get(0, 0, 0)).toBe(BlockId.WATER);
    const roof = chunk(g, 0, -7, 0); // -112..-97
    for (let y = 0; y <= 12; y++) {
      expect(roof.get(0, y, 0)).not.toBe(BlockId.AIR);
      expect(roof.get(0, y, 0)).not.toBe(BlockId.WATER);
    }
  });

  it('retains elevated river water and the freshwater cave roof', () => {
    const g = fixture(32, true, 12, true);
    const c = chunk(g, 0, 2, 0);
    expect(c.get(0, 0, 0)).not.toBe(BlockId.AIR);
    for (let y = 1; y <= 8; y++) expect(c.get(0, y, 0)).toBe(BlockId.WATER);
    const roof = chunk(g, 0, 1, 0);
    for (let y = 32 - SHORE_ROOF + 1; y < 32; y++) expect(roof.get(0, y - 16, 0)).not.toBe(BlockId.AIR);
  });

  it('retains the real seed-1 wet/dry fixtures used by browser worker smoke', () => {
    const g = new TerrainGenerator(1);
    expect(chunk(g, -1, -5, -1).get(0, 0, 0)).toBe(BlockId.AIR); // -16,-80,-16
    expect(chunk(g, 0, -9, 0).get(8, 0, 15)).toBe(BlockId.WATER); // 8,-144,15
  });

  it('produces both wet and dry seeded underground caves and reproduces chunks after cache clearing and reverse generation order', () => {
    const g = new TerrainGenerator(1), a = new AquiferSampler(1);
    const jobs: [number, number, number][] = [];
    for (const cx of [-1, 0]) for (const cz of [-1, 0]) for (let cy = -15; cy <= -2; cy++) jobs.push([cx, cy, cz]);
    const chunks = jobs.map(([cx, cy, cz]) => chunk(g, cx, cy, cz));
    let wet = 0, dry = 0;
    for (const c of chunks) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = c.get(x, y, z), wx = c.cx * 16 + x, wz = c.cz * 16 + z;
      const table = a.waterTableAt(wx, wz, g.getHeight(wx, wz));
      if (id === BlockId.WATER) { wet++; expect(c.cy * 16 + y).toBeLessThanOrEqual(table); }
      if (id === BlockId.AIR) { dry++; expect(c.cy * 16 + y).toBeGreaterThan(table); }
    }
    expect(wet).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(0);
    Object.assign(g, { columnCache: new Map() });
    for (const c of [...chunks].reverse()) expect(chunk(g, c.cx, c.cy, c.cz).blocks).toEqual(c.blocks);
  });
});
