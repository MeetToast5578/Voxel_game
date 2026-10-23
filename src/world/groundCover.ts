import {
  BROWN_MUSHROOM_CHANCE, DANDELION_CHANCE, FERN_CHANCE, POPPY_CHANCE, RED_MUSHROOM_CHANCE, TALL_GRASS_CHANCE,
} from '../config';
import { hash2 } from '../core/random';
import { BlockId } from './blocks';

/** [poppy, dandelion] weights. Barren biomes have neither; meadow and plains favour flowers. */
export function flowerWeights(biome: string): readonly [number, number] {
  switch (biome) {
    case 'meadow': return [4, 5];
    case 'plains': return [2, 2];
    case 'birch': return [0.5, 2];
    case 'temperate_deciduous': return [1.5, 1];
    case 'tundra': case 'snowy_taiga': return [0, 0.2];
    case 'desert': case 'badlands': case 'scree': case 'volcanic': case 'glacier': return [0, 0];
    case 'tropical_rainforest': return [0.25, 0.5];
    default: return [1, 1];
  }
}

export function groundCoverAt(seed: number, x: number, z: number, biome: string): number {
  const [poppy, dandelion] = flowerWeights(biome);
  const r = hash2(seed + 11, x, z);
  let edge = DANDELION_CHANCE * dandelion;
  if (r < edge) return BlockId.DANDELION;
  edge += POPPY_CHANCE * poppy;
  if (r < edge) return BlockId.POPPY;
  edge += TALL_GRASS_CHANCE;
  if (r < edge) return BlockId.TALL_GRASS;
  edge += FERN_CHANCE;
  if (r < edge) return BlockId.FERN;
  edge += BROWN_MUSHROOM_CHANCE;
  if (r < edge) return BlockId.BROWN_MUSHROOM;
  edge += RED_MUSHROOM_CHANCE;
  return r < edge ? BlockId.RED_MUSHROOM : BlockId.AIR;
}
