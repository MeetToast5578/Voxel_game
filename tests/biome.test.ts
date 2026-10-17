import { describe, expect, it } from 'vitest';
import { biomeAt, BIOME_COUNT, BIOME_KEYS, blendSurfaceBlocks } from '../src/world/biome';

function expectBiome(
  temperatureC: number,
  precipitationMm: number,
  heightM: number,
  detailAmpM: number,
  isWater: boolean,
  weirdness: number,
  expectedKey: string,
): void {
  const result = biomeAt(temperatureC, precipitationMm, heightM, detailAmpM, isWater, weirdness);
  expect(result.key).toBe(expectedKey);
}

describe('biomeAt', () => {
  it('returns warm ocean for hot water', () => {
    expectBiome(20, 500, 0, 5, true, 0.1, 'warm_ocean');
  });

  it('returns temperate ocean for mild water', () => {
    expectBiome(10, 500, 0, 5, true, 0.1, 'temperate_ocean');
  });

  it('returns cold ocean for cool water', () => {
    expectBiome(2, 500, 0, 5, true, 0.1, 'cold_ocean');
  });

  it('returns frozen ocean for cold water', () => {
    expectBiome(-5, 500, 0, 5, true, 0.1, 'frozen_ocean');
  });

  it('returns beach for warm shallow water', () => {
    expectBiome(20, 500, 0, 5, true, 0.1, 'warm_ocean');
  });

  it('returns desert for hot dry land', () => {
    expectBiome(30, 100, 100, 5, false, 0.1, 'desert');
  });

  it('returns tropical rainforest for hot wet land', () => {
    expectBiome(30, 1800, 100, 5, false, 0.1, 'tropical_rainforest');
  });

  it('returns temperate deciduous forest for moderate temp and precip', () => {
    expectBiome(15, 1000, 100, 5, false, 0.1, 'temperate_deciduous');
  });

  it('returns taiga for cold moderate land', () => {
    expectBiome(-5, 750, 100, 5, false, 0.1, 'taiga');
  });

  it('returns tundra for cold dry land', () => {
    expectBiome(0, 250, 100, 5, false, 0.1, 'tundra');
  });

  it('returns glacier for very cold high land', () => {
    expectBiome(-10, 500, 4500, 5, false, 0.1, 'glacier');
  });

  it('returns snowcapped peaks for cool very high land', () => {
    expectBiome(5, 500, 3500, 5, false, 0.1, 'snowcapped_peaks');
  });

  it('returns alpine meadow for moderate high land', () => {
    expectBiome(10, 500, 2500, 5, false, 0.1, 'alpine_meadow');
  });

  it('returns scree for steep land', () => {
    expectBiome(15, 500, 100, 20, false, 0.1, 'scree');
  });

  it('returns volcanic for weird land', () => {
    expectBiome(15, 500, 100, 5, false, 0.8, 'volcanic');
  });

  it('falls back to plains for unmatched land', () => {
    expectBiome(15, 900, 100, 5, false, 0.1, 'plains');
  });

  it('water overrides height', () => {
    expectBiome(10, 500, 5000, 5, true, 0.1, 'temperate_ocean');
  });

  it('is deterministic', () => {
    const a = biomeAt(15, 1000, 100, 5, false, 0.1);
    const b = biomeAt(15, 1000, 100, 5, false, 0.1);
    expect(a.key).toBe(b.key);
  });
});

describe('BIOME_COUNT and BIOME_KEYS', () => {
  it('reports the number of biomes', () => {
    expect(BIOME_COUNT).toBeGreaterThanOrEqual(25);
  });

  it('lists all biome keys', () => {
    expect(BIOME_KEYS.length).toBe(BIOME_COUNT);
    for (const key of BIOME_KEYS) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe('biome border blending (spec 35)', () => {
  it('picks the second block for the weight given, by a hash of the cell', () => {
    const a = 1;
    const b = 2;
    let picked = 0;
    for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) if (blendSurfaceBlocks(a, b, x, z, 0.25) === b) picked++;
    expect(picked / 10000).toBeGreaterThan(0.2);
    expect(picked / 10000).toBeLessThan(0.3);
    expect(blendSurfaceBlocks(a, b, 3, 4, 0)).toBe(a);
    expect(blendSurfaceBlocks(a, b, 3, 4, 1)).toBe(b);
    expect(blendSurfaceBlocks(a, b, 3, 4, 0.25)).toBe(blendSurfaceBlocks(a, b, 3, 4, 0.25)); // deterministic
  });
});
