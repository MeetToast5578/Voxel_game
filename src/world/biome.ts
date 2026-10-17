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
}

export interface BiomeLookup {
  key: BiomeKey;
  def: BiomeDef;
}

const BIOMES: BiomeDef[] = [
  { key: 'warm_ocean', name: 'Warm Ocean', tempMin: 15, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'temperate_ocean', name: 'Temperate Ocean', tempMin: 5, tempMax: 15, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'cold_ocean', name: 'Cold Ocean', tempMin: 0, tempMax: 5, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'frozen_ocean', name: 'Frozen Ocean', tempMin: -45, tempMax: 0, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'beach', name: 'Beach', tempMin: 10, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'stony_shore', name: 'Stony Shore', tempMin: -45, tempMax: 10, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'river', name: 'River', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'lake', name: 'Lake', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true },
  { key: 'swamp', name: 'Swamp', tempMin: 5, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true },
  { key: 'mangrove', name: 'Mangrove', tempMin: 20, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true },
  { key: 'glacier', name: 'Glacier', tempMin: -45, tempMax: -5, precipMin: 0, precipMax: 2000 },
  { key: 'snowcapped_peaks', name: 'Snowcapped Peaks', tempMin: -5, tempMax: 10, precipMin: 0, precipMax: 2000 },
  { key: 'alpine_meadow', name: 'Alpine Meadow', tempMin: 2, tempMax: 15, precipMin: 0, precipMax: 2000 },
  { key: 'tundra', name: 'Tundra', tempMin: -10, tempMax: 5, precipMin: 0, precipMax: 500, heightMin: 0, landOnly: true },
  { key: 'scree', name: 'Scree and Bare Rock', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, detailAmpMin: 18, landOnly: true },
  { key: 'volcanic', name: 'Volcanic', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000 },
  { key: 'desert', name: 'Desert', tempMin: 20, tempMax: 45, precipMin: 0, precipMax: 250, landOnly: true },
  { key: 'badlands', name: 'Badlands', tempMin: 20, tempMax: 45, precipMin: 250, precipMax: 500, landOnly: true },
  { key: 'shrubland', name: 'Shrubland', tempMin: 15, tempMax: 30, precipMin: 250, precipMax: 500, landOnly: true },
  { key: 'savanna', name: 'Savanna', tempMin: 20, tempMax: 45, precipMin: 500, precipMax: 1000, landOnly: true },
  { key: 'steppe', name: 'Steppe', tempMin: 0, tempMax: 20, precipMin: 250, precipMax: 750, landOnly: true },
  { key: 'plains', name: 'Plains', tempMin: 10, tempMax: 25, precipMin: 500, precipMax: 1000, landOnly: true },
  { key: 'meadow', name: 'Meadow', tempMin: 5, tempMax: 15, precipMin: 1000, precipMax: 2000, landOnly: true },
  { key: 'tropical_rainforest', name: 'Tropical Rainforest', tempMin: 25, tempMax: 45, precipMin: 1500, precipMax: 2000, landOnly: true },
  { key: 'temperate_deciduous', name: 'Temperate Deciduous Forest', tempMin: 10, tempMax: 25, precipMin: 750, precipMax: 1500, landOnly: true },
  { key: 'birch', name: 'Birch Forest', tempMin: 0, tempMax: 15, precipMin: 750, precipMax: 1500, landOnly: true },
  { key: 'old_growth_dark_forest', name: 'Old-Growth Dark Forest', tempMin: 5, tempMax: 15, precipMin: 1500, precipMax: 2000, landOnly: true },
  { key: 'taiga', name: 'Taiga', tempMin: -10, tempMax: 5, precipMin: 500, precipMax: 1000, landOnly: true },
  { key: 'snowy_taiga', name: 'Snowy Taiga', tempMin: -25, tempMax: -10, precipMin: 500, precipMax: 1000, landOnly: true },
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
