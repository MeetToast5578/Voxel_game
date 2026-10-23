import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import {
  AQUIFER_AMPLITUDE_M, AQUIFER_LEVEL_M, AQUIFER_SCALE_M, BLOCK_SIZE_M, metersToBlocks, SHORE_ROOF,
} from '../config';
import { mulberry32 } from '../core/random';

/** Seed offset independent of cave, climate, geology and region fields. */
const AQUIFER_SEED = 600;

/** Local groundwater. World coordinates make neighbouring chunks agree without shared mutable state. */
export class AquiferSampler {
  private readonly noise: NoiseFunction2D;

  constructor(seed: number) {
    this.noise = createNoise2D(mulberry32(seed + AQUIFER_SEED));
  }

  /** Highest water-filled underground row, inclusive. Sample once per column cell, in metres. */
  waterTableAt(wx: number, wz: number, surfaceBlocks: number): number {
    const levelM = AQUIFER_LEVEL_M + AQUIFER_AMPLITUDE_M * this.noise(
      wx * BLOCK_SIZE_M / AQUIFER_SCALE_M, wz * BLOCK_SIZE_M / AQUIFER_SCALE_M,
    );
    return Math.min(Math.floor(metersToBlocks(levelM)), surfaceBlocks - SHORE_ROOF);
  }
}
