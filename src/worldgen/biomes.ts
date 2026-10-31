import {
  OROGRAPHIC_LIFT, PRECIPITATION_MAX_MM, TEMPERATURE_LAPSE_C_PER_KM, TEMPERATURE_MAX_C, TEMPERATURE_MIN_C,
} from '../config';
import type { ClimateFields } from './climate';
import type { TreeSpecies } from './trees';

/** A biome: where it occurs (°C, mm of rain a year) and what grows there. Ported from the old `src/world/biome.ts`. */
export interface Biome {
  key: string;
  name: string;
  tempMin: number;
  tempMax: number;
  precipMin: number;
  precipMax: number;
  /** Surface and soil block keys. */
  surface: string;
  soil: string;
  trees: TreeSpecies | null;
  secondTrees?: TreeSpecies;
  /** [poppy, dandelion] weights of the flowers. */
  flowers: readonly [number, number];
}

const b = (key: string, name: string, t: [number, number], p: [number, number], surface: string, soil: string,
  trees: TreeSpecies | null, flowers: readonly [number, number] = [1, 1], secondTrees?: TreeSpecies): Biome =>
  ({ key, name, tempMin: t[0], tempMax: t[1], precipMin: p[0], precipMax: p[1], surface, soil, trees, flowers, secondTrees });

const NONE = [0, 0] as const;
export const BIOMES: readonly Biome[] = [
  b('glacier', 'Glacier', [-45, -5], [0, 2000], 'stone', 'stone', null, NONE),
  b('snowcapped_peaks', 'Snowcapped Peaks', [-5, 10], [0, 2000], 'stone', 'stone', null, NONE),
  b('alpine_meadow', 'Alpine Meadow', [2, 15], [0, 2000], 'grass', 'dirt', null, [2, 2]),
  b('tundra', 'Tundra', [-10, 5], [0, 500], 'grass', 'dirt', 'dead_snag', [0, 0.2]),
  b('scree', 'Scree and Bare Rock', [-45, 45], [0, 2000], 'gravel', 'stone', null, NONE),
  b('volcanic', 'Volcanic', [-45, 45], [0, 2000], 'basalt', 'basalt', null, NONE),
  b('desert', 'Desert', [20, 45], [0, 250], 'sand', 'sand', 'saguaro', NONE),
  b('badlands', 'Badlands', [20, 45], [250, 500], 'sand', 'sandstone', null, NONE),
  b('shrubland', 'Shrubland', [15, 30], [250, 500], 'grass', 'dirt', 'bush'),
  b('savanna', 'Savanna', [20, 45], [500, 1000], 'grass', 'dirt', 'acacia', [1, 1], 'baobab'),
  b('steppe', 'Steppe', [0, 20], [250, 750], 'grass', 'dirt', 'bush'),
  b('plains', 'Plains', [10, 25], [500, 1000], 'grass', 'dirt', 'oak', [2, 2]),
  b('meadow', 'Meadow', [5, 15], [1000, 2000], 'grass', 'dirt', 'bush', [4, 5]),
  b('tropical_rainforest', 'Tropical Rainforest', [25, 45], [1500, 2000], 'grass', 'dirt', 'jungle_giant', [0.25, 0.5], 'palm'),
  b('temperate_deciduous', 'Temperate Deciduous Forest', [10, 25], [750, 1500], 'grass', 'dirt', 'oak', [1.5, 1], 'maple'),
  b('birch', 'Birch Forest', [0, 15], [750, 1500], 'grass', 'dirt', 'birch', [0.5, 2]),
  b('old_growth_dark_forest', 'Old-Growth Dark Forest', [5, 15], [1500, 2000], 'grass', 'dirt', 'oak'),
  b('taiga', 'Taiga', [-10, 5], [500, 1000], 'grass', 'dirt', 'spruce', [1, 1], 'larch'),
  b('snowy_taiga', 'Snowy Taiga', [-25, -10], [500, 1000], 'grass', 'dirt', 'pine', [0, 0.2], 'fir'),
];
const BY_KEY = new Map(BIOMES.map((x) => [x.key, x]));
const LAND = ['desert', 'badlands', 'shrubland', 'savanna', 'steppe', 'plains', 'meadow', 'tropical_rainforest',
  'temperate_deciduous', 'birch', 'old_growth_dark_forest', 'taiga', 'snowy_taiga'].map((k) => BY_KEY.get(k)!);

export const biomeByIndex = (i: number): Biome => BIOMES[i]!;
export const biomeIndex = (key: string): number => BIOMES.findIndex((x) => x.key === key);

const range = (v: number, min: number, max: number) => min + ((v + 1) / 2) * (max - min);

/** Temperature in °C at a height: the field's base temperature minus the altitude lapse. */
export function temperatureAt(f: ClimateFields, heightM: number): number {
  return range(f.temperature, TEMPERATURE_MIN_C, TEMPERATURE_MAX_C) - (heightM / 1000) * TEMPERATURE_LAPSE_C_PER_KM;
}

/** Precipitation in mm a year, raised on rugged ground. */
export function precipitationAt(f: ClimateFields, detailAmpM: number): number {
  return range(f.humidity, 0, PRECIPITATION_MAX_MM) * (1 + (OROGRAPHIC_LIFT * detailAmpM) / 22);
}

/** The land biome at a surface cell (water bodies keep their land biome; their beds are chosen separately). */
export function biomeAt(temperatureC: number, precipitationMm: number, heightM: number, detailAmpM: number, weirdness: number): Biome {
  if (weirdness > 0.7) return BY_KEY.get('volcanic')!;
  if (heightM >= 4000 && temperatureC < -5) return BY_KEY.get('glacier')!;
  if (heightM >= 3000 && temperatureC >= -5 && temperatureC < 10) return BY_KEY.get('snowcapped_peaks')!;
  if (heightM >= 2000 && temperatureC >= 2 && temperatureC < 15) return BY_KEY.get('alpine_meadow')!;
  if (detailAmpM >= 18) return BY_KEY.get('scree')!;
  if (temperatureC < 5 && temperatureC >= -10 && precipitationMm < 500) return BY_KEY.get('tundra')!;
  return LAND.find((x) => temperatureC >= x.tempMin && temperatureC < x.tempMax && precipitationMm >= x.precipMin &&
    precipitationMm < x.precipMax) ?? BY_KEY.get('plains')!;
}
