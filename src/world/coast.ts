import { COAST_CLIFF_MAX_M, COAST_CLIFF_SLOPE, COAST_EXPOSED, COAST_SHORE_HEIGHT_M, COAST_SHELF_DEPTH_M } from '../config';
import { clamp } from '../core/math';
import { BlockId } from './blocks';

export type CoastKind = 'inland' | 'beach' | 'stony_shore' | 'cliff' | 'sandbar' | 'shelf' | 'deep_ocean';

/** Westerly waves hit shores whose landward continentalness gradient points east. */
export function waveExposure(gradientX: number, gradientZ: number): number {
  const length = Math.hypot(gradientX, gradientZ);
  return length === 0 ? 0.25 : clamp(0.5 + gradientX / (2 * length), 0, 1);
}

export function coastProfile(heightM: number, slope: number, exposure: number): { kind: CoastKind; material: number } {
  if (heightM < -COAST_SHELF_DEPTH_M) return { kind: 'deep_ocean', material: BlockId.SAND };
  if (heightM < -COAST_SHORE_HEIGHT_M) return { kind: 'shelf', material: BlockId.SAND };
  if (heightM <= COAST_CLIFF_MAX_M && slope >= COAST_CLIFF_SLOPE && exposure >= COAST_EXPOSED)
    return { kind: 'cliff', material: BlockId.STONE };
  if (Math.abs(heightM) <= COAST_SHORE_HEIGHT_M) {
    if (exposure >= COAST_EXPOSED) return { kind: 'stony_shore', material: BlockId.GRAVEL };
    return { kind: heightM < 0 && exposure < 0.35 ? 'sandbar' : 'beach', material: BlockId.SAND };
  }
  return { kind: 'inland', material: BlockId.AIR };
}
