import { BlockId } from './blocks';
import { hash2 } from '../core/random';
import { SECONDARY_TREE_CHANCE, type TreeSpecies } from '../config';

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
  /** Tree species that grow in this biome, or null if no trees grow here. Typed as the species union (task T-E13),
   * so a biome naming a species that does not exist fails at compile time, not silently at runtime. */
  treeSpecies: TreeSpecies | null;
  /** A second species mixed in on a share of the biome's anchors (task T-E11), or none. */
  secondarySpecies?: TreeSpecies | null;
}

export interface BiomeLookup {
  key: BiomeKey;
  def: BiomeDef;
}

const BIOMES: BiomeDef[] = [
  // ---- Oceans (water only) ----
  { key: 'warm_ocean', name: 'Warm Ocean', tempMin: 15, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'temperate_ocean', name: 'Temperate Ocean', tempMin: 5, tempMax: 15, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'cold_ocean', name: 'Cold Ocean', tempMin: 0, tempMax: 5, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'frozen_ocean', name: 'Frozen Ocean', tempMin: -45, tempMax: 0, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'beach', name: 'Beach', tempMin: 10, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'stony_shore', name: 'Stony Shore', tempMin: -45, tempMax: 10, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'river', name: 'River', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'lake', name: 'Lake', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'swamp', name: 'Swamp', tempMin: 5, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.DIRT, treeSpecies: null },
  { key: 'mangrove', name: 'Mangrove', tempMin: 20, tempMax: 45, precipMin: 1000, precipMax: 2000, waterOnly: true, surfaceBlock: BlockId.WATER, soilBlock: BlockId.SAND, treeSpecies: null },

  // ---- Height overrides (land only) ----
  { key: 'glacier', name: 'Glacier', tempMin: -45, tempMax: -5, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'snowcapped_peaks', name: 'Snowcapped Peaks', tempMin: -5, tempMax: 10, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'alpine_meadow', name: 'Alpine Meadow', tempMin: 2, tempMax: 15, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.DIRT, soilBlock: BlockId.DIRT, treeSpecies: null },
  { key: 'tundra', name: 'Tundra', tempMin: -10, tempMax: 5, precipMin: 0, precipMax: 500, heightMin: 0, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'dead_snag' },
  { key: 'scree', name: 'Scree and Bare Rock', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, detailAmpMin: 18, landOnly: true, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'volcanic', name: 'Volcanic', tempMin: -45, tempMax: 45, precipMin: 0, precipMax: 2000, surfaceBlock: BlockId.STONE, soilBlock: BlockId.STONE, treeSpecies: null },

  // ---- Whittaker diagram: open land ----
  { key: 'desert', name: 'Desert', tempMin: 20, tempMax: 45, precipMin: 0, precipMax: 250, landOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.SAND, treeSpecies: null },
  { key: 'badlands', name: 'Badlands', tempMin: 20, tempMax: 45, precipMin: 250, precipMax: 500, landOnly: true, surfaceBlock: BlockId.SAND, soilBlock: BlockId.STONE, treeSpecies: null },
  { key: 'shrubland', name: 'Shrubland', tempMin: 15, tempMax: 30, precipMin: 250, precipMax: 500, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'bush' },
  { key: 'savanna', name: 'Savanna', tempMin: 20, tempMax: 45, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'acacia', secondarySpecies: 'baobab' },
  { key: 'steppe', name: 'Steppe', tempMin: 0, tempMax: 20, precipMin: 250, precipMax: 750, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'bush' },
  { key: 'plains', name: 'Plains', tempMin: 10, tempMax: 25, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'oak' },
  { key: 'meadow', name: 'Meadow', tempMin: 5, tempMax: 15, precipMin: 1000, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'bush' },

  // ---- Whittaker diagram: forests ----
  { key: 'tropical_rainforest', name: 'Tropical Rainforest', tempMin: 25, tempMax: 45, precipMin: 1500, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'jungle_giant', secondarySpecies: 'palm' },
  { key: 'temperate_deciduous', name: 'Temperate Deciduous Forest', tempMin: 10, tempMax: 25, precipMin: 750, precipMax: 1500, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'oak', secondarySpecies: 'maple' },
  { key: 'birch', name: 'Birch Forest', tempMin: 0, tempMax: 15, precipMin: 750, precipMax: 1500, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'birch' },
  { key: 'old_growth_dark_forest', name: 'Old-Growth Dark Forest', tempMin: 5, tempMax: 15, precipMin: 1500, precipMax: 2000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'oak' },
  // Conifer forests keep a grass surface, so their trees actually grow: treeSpeciesAt rejects any biome whose
  // surface is not grass, which made the spruce (and every dirt-surface species) unreachable (task T-E12).
  { key: 'taiga', name: 'Taiga', tempMin: -10, tempMax: 5, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'spruce', secondarySpecies: 'larch' },
  { key: 'snowy_taiga', name: 'Snowy Taiga', tempMin: -25, tempMax: -10, precipMin: 500, precipMax: 1000, landOnly: true, surfaceBlock: BlockId.GRASS, soilBlock: BlockId.DIRT, treeSpecies: 'pine', secondarySpecies: 'fir' },
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

/** The display name of a biome key, for the F3 overlay. */
export function biomeName(key: string): string {
  return BIOMES.find((b) => b.key === key)?.name ?? key;
}
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
 * Picks `b` for a fraction `weightB` of the cells, and `a` for the rest, by a hash of the cell. The same cell always
 * gets the same block. Used for biome borders: the weight falls off with the distance from the border.
 */
export function blendSurfaceBlocks(a: number, b: number, wx: number, wz: number, weightB: number): number {
  return hash2(1000, wx, wz) < weightB ? b : a;
}

/** The tree species that grows in a biome, or null if no trees grow there. */
export function treeSpecies(biomeKey: BiomeKey): TreeSpecies | null {
  const def = BIOMES.find((b) => b.key === biomeKey);
  return def?.treeSpecies ?? null;
}

/** The biome's mixed-in second species, or null if it has none (task T-E11). */
export function secondarySpecies(biomeKey: BiomeKey): TreeSpecies | null {
  const def = BIOMES.find((b) => b.key === biomeKey);
  return def?.secondarySpecies ?? null;
}

/** A salt for the species-mix hash, so the mix never correlates with the anchor hash or the tree shape hash. */
const MIX_SALT = 23;

/**
 * The species that grows at one tree anchor: the biome's secondary species on a `SECONDARY_TREE_CHANCE` share of
 * anchors, the primary on the rest. Pure and deterministic in `(seed, x, z)`, so every chunk asking about the same
 * anchor grows the same tree (task T-E11).
 */
export function anchorSpecies(
  primary: TreeSpecies,
  secondary: TreeSpecies | null,
  seed: number,
  x: number,
  z: number,
): TreeSpecies {
  if (secondary !== null && hash2(seed + MIX_SALT, x, z) < SECONDARY_TREE_CHANCE) return secondary;
  return primary;
}
