import { CROP_GROW_CHANCE, CROP_HEAT_LIMIT_C, CROP_TEMPERATURES_C } from '../config';
import { clamp } from '../core/math';
import { BlockId, CROP_STAGES, blockVariant, getBlockDef } from './blocks';
import { type World } from './world';

/**
 * How fast a crop grows at an air temperature, 0..1 (T-G4). The weather's temperature follows the season, so crops
 * stall in winter and grow fastest in the warm part of the year; each crop has its own cold limit.
 */
export function cropGrowthFactor(state: number, temperatureC: number): number {
  const [cold, warm] = CROP_TEMPERATURES_C[getBlockDef(state).key as keyof typeof CROP_TEMPERATURES_C];
  const [hot, hottest] = CROP_HEAT_LIMIT_C;
  return clamp((temperatureC - cold) / (warm - cold), 0, 1) * (1 - clamp((temperatureC - hot) / (hottest - hot), 0, 1));
}

/**
 * A random tick on the crop at (x, y, z): it advances one stage with CROP_GROW_CHANCE scaled by the temperature. It
 * needs grass or dirt below, open sky above, and the game's weather (World.surfaceWeather). Ripe crops stay ripe.
 */
export function growCrop(world: World, x: number, y: number, z: number, roll: () => number): void {
  const state = world.getBlock(x, y, z);
  if (blockVariant(state) >= CROP_STAGES - 1 || !world.surfaceWeather) return;
  const ground = world.getBlock(x, y - 1, z);
  if ((ground !== BlockId.GRASS && ground !== BlockId.DIRT) || world.topAt(x, z) !== y - 1) return;
  const weather = world.surfaceWeather(x, y, z);
  if (roll() < CROP_GROW_CHANCE * cropGrowthFactor(state, weather.temperatureC)) world.setBlock(x, y, z, state + 1);
}
