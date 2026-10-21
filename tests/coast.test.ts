import { afterEach, describe, expect, it, vi } from 'vitest';
import { coastProfile, waveExposure } from '../src/world/coast';
import { ClimateSampler, heightMeters, type ClimateFields } from '../src/world/shape';
import { RegionSampler } from '../src/world/region';
import { TerrainDensity } from '../src/world/density';
import { TerrainGenerator } from '../src/world/generator';
import { Chunk } from '../src/world/chunk';
import { BlockId } from '../src/world/blocks';

const fields: ClimateFields = { continentalness: 0, erosion: 0, peaks: 0, temperature: 0, humidity: 0, weirdness: 0 };
afterEach(() => vi.restoreAllMocks());
describe('coasts and oceans (T-D6)', () => {
  it('exposes windward shores and shelters leeward shores from westerly waves', () => {
    expect(waveExposure(1, 0)).toBe(1); expect(waveExposure(-1, 0)).toBe(0);
    expect(waveExposure(0, 1)).toBe(0.5); expect(waveExposure(0, 0)).toBe(0.25);
  });
  it('chooses beaches, stony shores, cliffs, sandbars and shelf/deep ocean by exposure/slope/depth', () => {
    expect(coastProfile(0.5, 0.1, 0.2)).toEqual({ kind: 'beach', material: BlockId.SAND });
    expect(coastProfile(0.5, 0.1, 0.9)).toEqual({ kind: 'stony_shore', material: BlockId.GRAVEL });
    expect(coastProfile(4, 0.8, 0.9)).toEqual({ kind: 'cliff', material: BlockId.STONE });
    expect(coastProfile(-1, 0.1, 0.1).kind).toBe('sandbar');
    expect(coastProfile(-20, 0.1, 0.2).kind).toBe('shelf');
    expect(coastProfile(-200, 0.1, 0.2).kind).toBe('deep_ocean');
    expect(coastProfile(40, 0.1, 0.2).kind).toBe('inland');
  });
  it('drops from a shallow continental shelf to deep ocean without crossing the lower band', () => {
    const shelf = heightMeters({ ...fields, continentalness: -0.2 });
    const deep = heightMeters({ ...fields, continentalness: -0.55 });
    expect(shelf).toBe(-30); expect(deep).toBe(-260);
    expect(heightMeters({ ...fields, continentalness: -1 })).toBe(-300);
    expect(deep).toBeLessThan(shelf - 100);
  });
  it('does not grow biome trees on newly exposed coastal rock', () => {
    vi.spyOn(ClimateSampler.prototype, 'fields').mockImplementation((x) => ({ ...fields, continentalness: x * 0.00001, erosion: -1 }));
    vi.spyOn(RegionSampler.prototype, 'sample').mockReturnValue({ offsetM: 6, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
      waterLevelM: 0, moisture: 0.5, isRiver: false, isLake: false });
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_x, y) => y <= 20);
    const g = new TerrainGenerator(1), c = new Chunk(0, 1, 0); g.generateChunk(c);
    expect(c.get(0, 4, 0)).toBe(BlockId.STONE);
    expect(g.treeSpeciesAt(0, 0)).toBeNull();
  });
  it('actual generation applies exposed cliff rock while keeping deterministic negative coordinates', () => {
    vi.spyOn(ClimateSampler.prototype, 'fields').mockImplementation((x) => ({ ...fields, continentalness: x * 0.00001, erosion: -1 }));
    vi.spyOn(RegionSampler.prototype, 'sample').mockReturnValue({ offsetM: 0.6, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
      waterLevelM: 0, moisture: 0, isRiver: false, isLake: false });
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_x, y) => y <= 2);
    const a = new Chunk(-1, 0, -1), b = new Chunk(-1, 0, -1);
    new TerrainGenerator(1).generateChunk(a); new TerrainGenerator(1).generateChunk(b);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.get(0, 2, 0)).toBe(BlockId.STONE);
  });
});
