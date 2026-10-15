import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { BLOCK_SIZE_M } from '../config';
import { mulberry32 } from '../core/random';

/** Feature size of the detail noise, in meters (horizontal and vertical). */
const DETAIL_H_M = 16;
const DETAIL_V_M = 10;

/**
 * Terrain density, as in Minecraft's overworld. A block is solid where `offset - y + amp * noise` is positive, with y the
 * block's height in meters, offset the surface height from the shape fields and amp the detail amplitude. The 3D noise
 * makes the surface lumpy and lets it overhang, so it has no one-block stairs.
 */
export class TerrainDensity {
  private readonly noise: NoiseFunction3D;

  constructor(seed: number) {
    this.noise = createNoise3D(mulberry32(seed + 200));
  }

  /** Whether block row y at (wx, wz) is solid. Column offset and amplitude are in meters. */
  isSolid(wx: number, y: number, wz: number, offsetM: number, ampM: number): boolean {
    const d = offsetM - y * BLOCK_SIZE_M;
    if (d > ampM) return true; // the noise is in [-1, 1], so the sum is positive
    if (d < -ampM) return false;
    return d + ampM * this.detail(wx * BLOCK_SIZE_M, y * BLOCK_SIZE_M, wz * BLOCK_SIZE_M) > 0;
  }

  /** Two octaves of 3D simplex noise in [-1, 1]. Positions in meters. */
  private detail(xM: number, yM: number, zM: number): number {
    const a = this.noise(xM / DETAIL_H_M, yM / DETAIL_V_M, zM / DETAIL_H_M);
    const b = this.noise((2 * xM) / DETAIL_H_M, (2 * yM) / DETAIL_V_M, (2 * zM) / DETAIL_H_M);
    return (a + 0.5 * b) / 1.5;
  }
}
