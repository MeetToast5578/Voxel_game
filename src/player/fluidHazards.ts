import {
  BLOCK_SIZE_M, FALL_DAMAGE_MULTIPLIER, FALL_DAMAGE_THRESHOLD_M_S, FIRE_DAMAGE_PER_S, FIRE_DURATION_S,
  LAVA_CONTACT_DAMAGE_PER_S, WATER_CUSHION_DEPTH_M, WATER_CUSHION_MAX_M, metersToBlocks,
} from '../config';
import { blockTopHeight, isLavaState, isWaterState } from '../world/blocks';
import type { BodyShape, Vec3 } from './physics';

export type BlockAt = (x: number, y: number, z: number) => number;

/** Actual AABB overlap, including partial-height flowing surfaces, rather than a waist-only sample. */
export function fluidContact(p: Vec3, shape: BodyShape, blockAt: BlockAt): { water: boolean; lava: boolean } {
  let water = false, lava = false;
  for (let y = Math.floor(p.y); y < p.y + shape.height; y++)
    for (let z = Math.floor(p.z - shape.halfWidth); z < p.z + shape.halfWidth; z++)
      for (let x = Math.floor(p.x - shape.halfWidth); x < p.x + shape.halfWidth; x++) {
        const id = blockAt(x, y, z);
        if ((isWaterState(id) || isLavaState(id)) && y + blockTopHeight(id) > p.y) {
          water ||= isWaterState(id);
          lava ||= isLavaState(id);
        }
      }
  return { water, lava };
}

/** Contiguous water above the feet at landing, in metres. A gap ends the cushion. */
export function landingWaterDepth(p: Vec3, blockAt: BlockAt): number {
  const x = Math.floor(p.x), z = Math.floor(p.z);
  let top = p.y;
  const max = p.y + metersToBlocks(WATER_CUSHION_MAX_M);
  for (let y = Math.floor(p.y); y < max; y++) {
    const id = blockAt(x, y, z);
    if (!isWaterState(id) || y + blockTopHeight(id) <= p.y) break;
    top = y + blockTopHeight(id);
    if (blockTopHeight(id) < 1) break;
  }
  return Math.min(WATER_CUSHION_MAX_M, Math.max(0, top - p.y) * BLOCK_SIZE_M);
}

export function landingDamage(impactSpeedM_S: number, waterDepthM: number): number {
  const speed = Math.max(0, impactSpeedM_S) * Math.exp(-Math.max(0, waterDepthM) / WATER_CUSHION_DEPTH_M);
  return Math.max(0, speed - FALL_DAMAGE_THRESHOLD_M_S) * FALL_DAMAGE_MULTIPLIER;
}

/** Transient survival fire. Water ends residual burning; direct lava contact still hurts. */
export class FireExposure {
  remaining = 0;
  reset(): void { this.remaining = 0; }
  step(dt: number, contact: { water: boolean; lava: boolean }): number {
    if (contact.water) this.remaining = 0;
    else if (contact.lava) this.remaining = FIRE_DURATION_S;
    const burningTime = Math.min(dt, this.remaining);
    if (!contact.lava) this.remaining = Math.max(0, this.remaining - dt);
    return contact.lava ? LAVA_CONTACT_DAMAGE_PER_S * dt : FIRE_DAMAGE_PER_S * burningTime;
  }
}
