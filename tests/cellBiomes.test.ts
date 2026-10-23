import { afterEach, describe, expect, it, vi } from 'vitest';
import { TerrainGenerator } from '../src/world/generator';
import { ClimateSampler } from '../src/world/shape';
import { TerrainDensity } from '../src/world/density';
import { RegionSampler } from '../src/world/region';
import { biomeAt, biomeName, blendSurfaceBlocks } from '../src/world/biome';
import { Chunk } from '../src/world/chunk';
import { BlockId } from '../src/world/blocks';

afterEach(() => vi.restoreAllMocks());
describe('cell biome resolution (T-E10)', () => {
  it('classifies every cell from its actual surface climate, even within one chunk', () => {
    vi.spyOn(ClimateSampler.prototype, 'fields').mockReturnValue({ continentalness: 0.2, erosion: 1, peaks: 0, temperature: 0.9, humidity: -1, weirdness: 0 });
    vi.spyOn(RegionSampler.prototype, 'sample').mockImplementation((x) => ({ offsetM: 30, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
      waterLevelM: 0, moisture: x < -9 ? 0 : 1, isRiver: false, isLake: false }));
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_, y) => y <= 100);
    vi.spyOn(TerrainGenerator.prototype, 'treeSpeciesAt').mockReturnValue(null);
    const g = new TerrainGenerator(1), biomes = new Set<string>();
    for (let z = -3; z < 3; z++) for (let x = -17; x < 1; x++) {
      const climate = g.climateAt(x, 100, z);
      const expected = biomeAt(climate.temperatureC, climate.precipitationMm, 30, 0, false, 0).key;
      expect(g.biomeKeyAt(x, z)).toBe(expected); expect(climate.biome).toBe(biomeName(expected));
      if (x >= -16 && x < 0) biomes.add(expected);
    }
    expect(biomes.size).toBeGreaterThan(1);
    // Generation order and negative chunk edges never affect classification or resulting terrain.
    const a = new Chunk(-1, 6, -1), b = new Chunk(0, 6, -1); g.generateChunk(b); g.generateChunk(a);
    const other = new TerrainGenerator(1), a2 = new Chunk(-1, 6, -1), b2 = new Chunk(0, 6, -1); other.generateChunk(a2); other.generateChunk(b2);
    expect(a.blocks).toEqual(a2.blocks); expect(b.blocks).toEqual(b2.blocks);
    // Boundary lies at x=-9 inside the chunk. Both biome substrates must appear there.
    const substrates = new Set<number>();
    for (let x = 0; x < 16; x++) substrates.add(a.get(x, 3, 8)); // y99, undithered soil
    expect(substrates).toContain(BlockId.SAND); expect(substrates).toContain(BlockId.DIRT);
    for (let x = -16; x < 0; x++) {
      const own = x < -9 ? BlockId.SAND : BlockId.GRASS;
      const dist = x < -9 ? -9 - x : x + 10;
      const expected = dist <= 3 ? blendSurfaceBlocks(own, own === BlockId.SAND ? BlockId.GRASS : BlockId.SAND,
        x, -8, (4 - dist) / 6) : own;
      expect(a.get(x + 16, 4, 8)).toBe(expected);
    }
  });
  it('matches independent real surface climate queries at positive and negative locations', () => {
    const g = new TerrainGenerator(1), fields = new ClimateSampler(1);
    for (const [x, z] of [[0, 0], [-17, 31], [15, 16], [-386, 14], [1200, -800]]) {
      const h = g.getHeight(x!, z!), climate = g.climateAt(x!, h, z!);
      // The real amplitude is deliberately obtained from the generator's cached cell; it includes river/coast adjustments.
      const amp = (g as unknown as { amplitudeAt(x: number, z: number): number }).amplitudeAt(x!, z!);
      expect(g.biomeKeyAt(x!, z!)).toBe(biomeAt(climate.temperatureC, climate.precipitationMm, h * 0.3, amp, false, fields.fields(x! * 0.3, z! * 0.3).weirdness).key);
    }
  });
});
