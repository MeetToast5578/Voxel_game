import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainDensity } from '../src/world/density';
import { TerrainGenerator } from '../src/world/generator';
import { RegionSampler } from '../src/world/region';
import { ClimateSampler } from '../src/world/shape';
import { hash2 } from '../src/core/random';
import { TREE_CHANCE } from '../src/config';

/** Controlled terrain/climate exercises the real anchor selection and feature placement, without a seed search. */
function habitat(temperature: number, humidity: number, fresh: boolean, depth: number) {
  vi.spyOn(ClimateSampler.prototype, 'fields').mockReturnValue({
    continentalness: 0.2, erosion: 1, peaks: 0, temperature, humidity, weirdness: 0,
  });
  vi.spyOn(RegionSampler.prototype, 'sample').mockReturnValue({
    offsetM: 9.6, riverDepthM: fresh ? 1 : 0, riverWidthM: fresh ? 4 : 0,
    flowX: fresh ? 1 : 0, flowZ: 0, waterLevelM: (32 + depth) * 0.3,
    moisture: humidity > 0 ? 1 : 0, isLake: false, isRiver: fresh,
  });
  vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_x, y) => y <= 32);
  return new TerrainGenerator(42);
}

afterEach(() => vi.restoreAllMocks());
describe('generated tree habitats (T-E11)', () => {
  it.each([
    [0.85, 1, true, 2, 'mangrove', BlockId.LOG],
    [0.45, 1, true, 1, 'willow', BlockId.LOG],
    [1, -1, false, -1, 'saguaro', BlockId.CACTUS],
  ] as const)('generates the selected species in its habitat (%s, %s, %s, %s)', (temperature, humidity, fresh, depth, species, tissue) => {
    const g = habitat(temperature, humidity, fresh, depth);
    const anchors: Array<[number, number]> = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      if (hash2(42, x, z) < TREE_CHANCE && g.treeSpeciesAt(x, z) === species) anchors.push([x, z]);
    }
    expect(anchors.length).toBeGreaterThan(0);
    const base = new Chunk(0, 2, 0);
    g.generateChunk(base);
    for (const [x,z] of anchors) expect(base.get(x, 1, z)).toBe(tissue);
  });
  it('does not plant wetland trees in deep water or ocean water', () => {
    const g = habitat(0.5, 1, true, 10);
    expect(g.treeSpeciesAt(0, 0)).toBeNull();
    vi.restoreAllMocks();
    const ocean = habitat(0.5, 1, false, 2);
    expect(ocean.treeSpeciesAt(0, 0)).toBeNull();
  });
});
