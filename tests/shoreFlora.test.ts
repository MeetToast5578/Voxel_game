import { afterEach, describe, expect, it, vi } from 'vitest';
import { groundCoverAt } from '../src/world/groundCover';
import { BlockId } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { TerrainDensity } from '../src/world/density';
import { ClimateSampler } from '../src/world/shape';
import { RegionSampler } from '../src/world/region';
import { Chunk } from '../src/world/chunk';
afterEach(() => vi.restoreAllMocks());
describe('biome flowers and reeds (T-E3/T-E4)', () => {
  it('has more flowers in meadows, distinct biome mixtures and none in barren biomes', () => {
    const count = (biome: string) => {
      let poppy = 0, dandelion = 0;
      for (let x = -100; x < 100; x++) for (let z = -100; z < 100; z++) {
        const b = groundCoverAt(1, x, z, biome); poppy += Number(b === BlockId.POPPY); dandelion += Number(b === BlockId.DANDELION);
      }
      return [poppy, dandelion];
    };
    const meadow = count('meadow'), plains = count('plains'), birch = count('birch');
    expect(meadow[0]! + meadow[1]!).toBeGreaterThan(plains[0]! + plains[1]!);
    expect(birch[1]).toBeGreaterThan(birch[0]! * 2);
    expect(count('desert')).toEqual([0, 0]); expect(count('tundra')[0]).toBe(0);
    expect(groundCoverAt(1, -1, -2, 'meadow')).toBe(groundCoverAt(1, -1, -2, 'meadow'));
  });
  it('retains the actual seed-1 shoreline fixture used by browser worker smoke', () => {
    const g = new TerrainGenerator(1), c = new Chunk(-25, 0, 0); g.generateChunk(c);
    expect(c.get(14, 1, 14)).toBe(BlockId.REED); // -386,1,14
    expect(g.getHeight(-386, 14)).toBe(0);
    expect([[-385, 14], [-387, 14], [-386, 13], [-386, 15]].some(([x, z]) => g.getHeight(x!, z!) < 0)).toBe(true);
  });
  it('generates dry-bank reeds beside water and reproduces tall plants across vertical chunks', () => {
    vi.spyOn(ClimateSampler.prototype, 'fields').mockReturnValue({ continentalness: 0.2, erosion: 1, peaks: 0, temperature: 0, humidity: 0, weirdness: 0 });
    vi.spyOn(RegionSampler.prototype, 'sample').mockImplementation((x) => ({ offsetM: x < 0 ? 3.9 : 4.2, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
      waterLevelM: 4.2, moisture: 0, isRiver: false, isLake: false }));
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((x, y) => y <= (x < 0 ? 13 : 14));
    vi.spyOn(TerrainGenerator.prototype, 'treeSpeciesAt').mockReturnValue(null);
    let reeds = 0;
    for (let cz = -4; cz < 4; cz++) {
      const g = new TerrainGenerator(1);
      Object.assign(g, { caves: { cheese: () => -1, noodleA: () => 1, noodleB: () => 1, spaghettiA: () => 1, spaghettiB: () => 1, ravine: () => 1 } });
      const low = new Chunk(0, 0, cz), high = new Chunk(0, 1, cz); g.generateChunk(high); g.generateChunk(low);
      for (let z = 0; z < 16; z++) if (low.get(0, 15, z) === BlockId.REED) {
        reeds++; expect(high.get(0, 0, z)).toBe(BlockId.REED);
        expect(low.get(0, 14, z)).toBe(BlockId.GRASS);
      }
      // The submerged side cannot grow reeds.
      const water = new Chunk(-1, 0, cz); g.generateChunk(water);
      expect(water.blocks.includes(BlockId.REED)).toBe(false);
    }
    expect(reeds).toBeGreaterThan(0);
  });
});
