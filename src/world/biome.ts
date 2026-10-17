import { BlockId } from './blocks';
import { hash2 } from '../core/random';

export type BiomeKey = string;

export interface BiomeDef {
  key: BiomeKey;
  name: string;
  tempMin: number;
  tempMax: number;
  precipMin: number;
  precipMax: number;
  heightMin?: number;
  detailAmpMin?: number;
  waterOnly?: boolean;
  landOnly?: boolean;
  /** Default surface block state for this biome (used by the generator). */
  surfaceBlock: number;
  /** Soil block below the surface (used by the generator). */
  soilBlock: number;
}

export interface BiomeLookup {
  key: BiomeKey;
  def: BiomeDef;
}

const BIOMES: BiomeDef[] = [
  // ---- Oceans (water only) ----
  { key: 'warm_ocean', name: 'Warm Ocean', tempMin: 15, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },
  { key: 'temperate_ocean', name: 'Temperate Ocean', tempMin: 5, tempMax: 15, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },
  { key: 'cold_ocean', name: 'Cold Ocean', tempMin: 0, tempMax: 5, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },
  { key: 'frozen_ocean', name: 'Frozen Ocean', tempMin: -45, tempMax: 0, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.STONE },
  { key: 'beach', name: 'Beach', tempMin: 10, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.SAND },
  { key: 'stony_shore', name: 'Stony Shore', tempMin: -45, tempMax: 10, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE },
  { key: 'river', name: 'River', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },
  { key: 'lake', name: 'Lake', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },
  { key: 'swamp', name: 'Swamp', tempMin: 5, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.DIRT },
  { key: 'mangrove', name: 'Mangrove', tempMin: 20, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND },

  // ---- Height overrides (land only) ----
  { key: 'glacier', name: 'Glacier', tempMin: -45, tempMax: -5, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE },
  { key: 'snowcapped_peaks', name: 'Snowcapped Peaks', tempMin: -5, tempMax: 10, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE },
  { key: 'alpine_meadow', name: 'Alpine Meadow', tempMin: 2, tempMax: 15, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
  { key: 'tundra', name: 'Tundra', tempMin: -10, tempMax: 5, precipMin: 0, precipMax: 500, heightMin: 0, landOnly: true, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
  { key: 'scree', name: 'Scree and Bare Rock', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, detailAmpMin: 18, landOnly: true, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE },
  { key: 'volcanic', name: 'Volcanic', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE },

  // ---- Whittaker diagram: open land ----
  { key: 'desert', name: 'Desert', tempMin: 20, tempMax: 45, precipMin: 0, precipMax: 250, landOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.SAND },
  { key: 'badlands', name: 'Badlands', tempMin: 20, tempMax: 45, precipMin: 250, precipMax: 500, landOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.STONE },
  { key: 'shrubland', name: 'Shrubland', tempMin: 15, tempMax: 30, precipMin: 250, precipMax: 500, landOnly: true, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
  { key: 'savanna', name: 'Savanna', tempMin: 20, tempMax: 45, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'steppe', name: 'Steppe', tempMin: 0, tempMax: 20, precipMin: 250, precipMax: 750, landOnly: true, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
  { key: 'plains', name: 'Plains', tempMin: 10, tempMax: 25, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'meadow', name: 'Meadow', tempMin: 5, tempMax: 15, precipMin: 1000, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },

  // ---- Whittaker diagram: forests ----
  { key: 'tropical_rainforest', name: 'Tropical Rainforest', tempMin: 25, tempMax: 45, precipMin: 1500, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'temperate_deciduous', name: 'Temperate Deciduous Forest', tempMin: 10, tempMax: 25, precipMin: 750, precipMax: 1500, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'birch', name: 'Birch Forest', tempMin: 0, tempMax: 15, precipMin: 750, precipMax: 1500, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'old_growth_dark_forest', name: 'Old-Growth Dark Forest', tempMin: 5, tempMax: 15, precipMin: 1500, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT },
  { key: 'taiga', name: 'Taiga', tempMin: -10, tempMax: 5, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
  { key: 'snowy_taiga', name: 'Snowy Taiga', tempMin: -25, tempMax: -10, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT },
];

export function biomeAt(
  temperatureC: number,
  precipitationMm: number,
  heightM: number,
  detailAmpM: number,
  isWater: boolean,
  weirdness: number,
): BiomeLookup {
  if (!isWater && weirdness > 0.7) {
    return { key: 'volcanic', def: BIOMES.find((b) => b.key === 'volcanic')! };
  }

  if (isWater) {
    const waterBiomes = BIOMES.filter((b) => b.waterOnly);
    const match = waterBiomes.find((b) => temperatureC >= b.tempMin && temperatureC < b.tempMax);
    if (match) return { key: match.key, def: match };
    return { key: 'frozen_ocean', def: waterBiomes.find((b) => b.key === 'frozen_ocean')! };
  }

  if (heightM >= 4000 && temperatureC < -5) {
    return { key: 'glacier', def: BIOMES.find((b) => b.key === 'glacier')! };
  }
  if (heightM >= 3000 && temperatureC >= -5 && temperatureC < 10) {
    return { key: 'snowcapped_peaks', def: BIOMES.find((b) => b.key === 'snowcapped_peaks')! };
  }
  if (heightM >= 2000 && temperatureC >= 2 && temperatureC < 15) {
    return { key: 'alpine_meadow', def: BIOMES.find((b) => b.key === 'alpine_meadow')! };
  }
  if (detailAmpM >= 18) {
    return { key: 'scree', def: BIOMES.find((b) => b.key === 'scree')! };
  }
  if (temperatureC < 5 && temperatureC >= -10 && precipitationMm < 500) {
    return { key: 'tundra', def: BIOMES.find((b) => b.key === 'tundra')! };
  }

  const landBiomes = BIOMES.filter((b) => b.landOnly);
  const match = landBiomes.find(
    (b) =>
      temperatureC >= b.tempMin &&
      temperatureC < b.tempMax &&
      precipitationMm >= b.precipMin &&
      precipitationMm < b.precipMax &&
      (b.detailAmpMin === undefined || detailAmpM >= b.detailAmpMin),
  );
  if (match) return { key: match.key, def: match };

  return { key: 'plains', def: landBiomes.find((b) => b.key === 'plains')! };
}

export const BIOME_KEYS: BiomeKey[] = BIOMES.map((b) => b.key);
export const BIOME_COUNT = BIOMES.length;

/** The surface block for a biome. Beach columns always use SAND regardless of biome. */
export function surfaceBlock(biomeKey: BiomeKey, isBeach: boolean): number {
  if (isBeach) return BlockId.SAND;
  const def = BIOMES.find((b) => b.key === biomeKey);
  return def?.surfaceBlock ?? BlockId.GRASS;
}

/** The soil block below the surface for a biome. */
export function soilBlock(biomeKey: BiomeKey): number {
  const def = BIOMES.find((b) => b.key === biomeKey);
  return def?.soilBlock ?? BlockId.DIRT;
}

/**
 * Blend two surface blocks based on a hash. Used for biome blending at borders:
 * when two adjacent columns have different biomes, the surface block dithers
 * between them based on a hash of the position.
 */
export function blendSurfaceBlocks(a: number, b: number, wx: number, wz: number): number {
  const r = hash2(1000, wx, wz);
  return r < 0.5 ? a : b;
}
