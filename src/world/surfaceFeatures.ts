import { BOULDER_CHANCE, BOULDER_RADIUS, FALLEN_LOG_CHANCE, FALLEN_LOG_MIN_LENGTH,
  FALLEN_LOG_MAX_LENGTH, LILY_PAD_CHANCE, LILY_PAD_MAX_DEPTH, MOSS_CHANCE, MOSS_MIN_PRECIPITATION_MM } from '../config';
import { hash2 } from '../core/random';
import { BlockId } from './blocks';
import type { FeatureBlock } from './feature';

export interface SurfaceSite {
  height: number;
  waterY: number;
  biome: string;
  rock: number;
  dry: boolean;
  damp: boolean;
}
export type SiteAt = (x: number, z: number) => SurfaceSite;
const FORESTS = new Set(['temperate_deciduous', 'birch', 'old_growth_dark_forest', 'taiga', 'snowy_taiga', 'tropical_rainforest']);

export function dampClimate(temperatureC: number, precipitationMm: number): boolean {
  return temperatureC > 0 && precipitationMm >= MOSS_MIN_PRECIPITATION_MM;
}
export function lilyPadAt(seed: number, x: number, z: number, depth: number, lake: boolean, temperatureC: number): boolean {
  return lake && temperatureC > 0 && depth >= 1 && depth <= LILY_PAD_MAX_DEPTH && hash2(seed + 1300, x, z) < LILY_PAD_CHANCE;
}
export function mossAt(seed: number, x: number, z: number, damp: boolean): boolean {
  return damp && hash2(seed + 1301, x, z) < MOSS_CHANCE;
}

/** Rounded rock, embedded into every supported footprint cell; reject the entire feature on a cliff or cave. */
export function boulderBlocks(seed: number, x: number, z: number, siteAt: SiteAt): FeatureBlock[] {
  if (hash2(seed + 1302, x, z) >= BOULDER_CHANCE) return [];
  const site = siteAt(x, z), radius = 1 + Math.floor(hash2(seed + 1303, x, z) * BOULDER_RADIUS);
  if (!site.dry || site.biome === 'desert' || site.biome === 'badlands') return [];
  const footprint: { x: number; z: number; site: SurfaceSite; rise: number }[] = [];
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const dist = dx * dx + dz * dz;
    if (dist > radius * radius) continue;
    const cell = siteAt(x + dx, z + dz);
    if (!cell.dry || Math.abs(cell.height - site.height) > 1) return [];
    footprint.push({ x: x + dx, z: z + dz, site: cell, rise: Math.max(1, Math.ceil(Math.sqrt(radius * radius - dist))) });
  }
  const blocks: FeatureBlock[] = [];
  for (const cell of footprint) {
    const top = Math.max(cell.site.height + 1, site.height + cell.rise);
    for (let y = cell.site.height + 1; y <= top; y++) blocks.push({ x: cell.x, y, z: cell.z, state: site.rock });
    if (mossAt(seed, cell.x, cell.z, cell.site.damp)) blocks.push({ x: cell.x, y: top + 1, z: cell.z, state: BlockId.MOSS });
  }
  return blocks;
}

/** A downed trunk lies on dry flat forest floor along its entire length. */
export function fallenLogBlocks(seed: number, x: number, z: number, siteAt: SiteAt): FeatureBlock[] {
  if (hash2(seed + 1304, x, z) >= FALLEN_LOG_CHANCE) return [];
  const site = siteAt(x, z);
  if (!site.dry || !FORESTS.has(site.biome)) return [];
  const alongX = hash2(seed + 1305, x, z) < 0.5;
  const length = FALLEN_LOG_MIN_LENGTH + Math.floor(hash2(seed + 1306, x, z) * (FALLEN_LOG_MAX_LENGTH - FALLEN_LOG_MIN_LENGTH + 1));
  const blocks: FeatureBlock[] = [];
  for (let n = 0; n < length; n++) {
    const wx = x + (alongX ? n : 0), wz = z + (alongX ? 0 : n), cell = siteAt(wx, wz);
    if (!cell.dry || cell.height !== site.height || !FORESTS.has(cell.biome)) return [];
    blocks.push({ x: wx, y: site.height + 1, z: wz, state: alongX ? BlockId.FALLEN_LOG_X : BlockId.FALLEN_LOG_Z });
    if (mossAt(seed, wx, wz, cell.damp)) blocks.push({ x: wx, y: site.height + 2, z: wz, state: BlockId.MOSS });
  }
  return blocks;
}
