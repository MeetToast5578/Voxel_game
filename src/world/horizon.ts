import {
  BLOCK_SIZE_M, CHUNK_SIZE, HORIZON_STEPS_BLOCKS, HORIZON_RING_CELLS, HORIZON_OVERLAP_BLOCKS,
  HORIZON_RECENTER_BLOCKS, HORIZON_BIAS_BLOCKS, SEA_LEVEL_M,
} from '../config';
import { clamp } from '../core/math';
import { TerrainGenerator } from './generator';
import { ClimateSampler } from './shape';
import { blockTemperature, blockPrecipitation } from './climate';
import { climateTint } from './climateTint';

export interface HorizonData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  centerX: number;
  centerZ: number;
  inner: number;
  overlap: number;
  radius: number;
}
export type HorizonSample = readonly [number, number, number, number]; // height in blocks, linear RGB
export type HorizonSampleAt = (x: number, z: number) => HorizonSample;
const linear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** Reused only in the dedicated worker. Exact shared density surface at every ring; no second, mismatching terrain model. */
export class HorizonSampler {
  private readonly generator: TerrainGenerator;
  private readonly climate: ClimateSampler;
  constructor(seed: number) { this.generator = new TerrainGenerator(seed); this.climate = new ClimateSampler(seed); }
  at(x: number, z: number, _centerX: number, _centerZ: number, _near: number): HorizonSample {
    const f = this.climate.fields(x * BLOCK_SIZE_M, z * BLOCK_SIZE_M);
    const surface = this.generator.sampleSurface(x, z);
    const h = surface.height * BLOCK_SIZE_M;
    const water = Math.floor(Math.max(SEA_LEVEL_M, surface.waterLevelM) / BLOCK_SIZE_M) * BLOCK_SIZE_M;
    const wet = h < water;
    const temperature = blockTemperature(f, h), precipitation = blockPrecipitation(f, surface.ampM, surface.moisture);
    const tint = climateTint(temperature, clamp(precipitation / 2000, 0, 1), wet ? 3 : 1);
    const base = wet ? [48, 96, 200] : Math.abs(h) < 3 || (temperature > 20 && precipitation < 250) ? [219, 207, 163] : [95, 159, 53];
    return [(Math.max(h, water) / BLOCK_SIZE_M) + 1 - HORIZON_BIAS_BLOCKS,
      linear(base[0]! / 255) * tint[0], linear(base[1]! / 255) * tint[1], linear(base[2]! / 255) * tint[2]];
  }
}

/** Concentric square rings. Fine outer edges interpolate their coarser neighbour to remove T-junction gaps. */
export function buildHorizon(centerX: number, centerZ: number, viewBlocks: number, sampleAt: HorizonSampleAt): HorizonData {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const recenter = Math.min(HORIZON_RECENTER_BLOCKS, Math.max(CHUNK_SIZE, viewBlocks / 2));
  const overlap = Math.min(HORIZON_OVERLAP_BLOCKS, Math.max(CHUNK_SIZE, viewBlocks / 2));
  const inner = Math.max(CHUNK_SIZE, Math.floor((viewBlocks - recenter - overlap) / CHUNK_SIZE) * CHUNK_SIZE);
  const cache = new Map<string, HorizonSample>();
  const sample = (x: number, z: number) => {
    const key = `${x},${z}`; let s = cache.get(key);
    if (!s) { s = sampleAt(centerX + x, centerZ + z); cache.set(key, s); }
    return s;
  };
  const blend = (a: HorizonSample, b: HorizonSample, t: number): HorizonSample => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t,
  ];
  for (let level = 0; level < HORIZON_STEPS_BLOCKS.length; level++) {
    const step = HORIZON_STEPS_BLOCKS[level]!, extent = step * HORIZON_RING_CELLS;
    // The shader cuts a camera-centred circular hole. A snapped square geometry hole
    // shifts with worker recentering and can expose sky inside the loaded radius.
    const previous = level === 0 ? 0 : HORIZON_STEPS_BLOCKS[level - 1]! * HORIZON_RING_CELLS;
    const nextStep = HORIZON_STEPS_BLOCKS[level + 1];
    const side = HORIZON_RING_CELLS * 2 + 1, base = positions.length / 3;
    for (let z = -extent; z <= extent; z += step) for (let x = -extent; x <= extent; x += step) {
      let s = sample(x, z);
      if (nextStep && Math.max(Math.abs(x), Math.abs(z)) === extent) {
        if (Math.abs(x) === extent) {
          const z0 = Math.floor(z / nextStep) * nextStep;
          s = blend(sample(x, z0), sample(x, z0 + nextStep), (z - z0) / nextStep);
        } else {
          const x0 = Math.floor(x / nextStep) * nextStep;
          s = blend(sample(x0, z), sample(x0 + nextStep, z), (x - x0) / nextStep);
        }
      }
      positions.push(x, s[0], z); colors.push(s[1], s[2], s[3]);
    }
    for (let z = 0; z < side - 1; z++) for (let x = 0; x < side - 1; x++) {
      const x0 = -extent + x * step, z0 = -extent + z * step;
      if (Math.max(Math.abs(x0), Math.abs(x0 + step), Math.abs(z0), Math.abs(z0 + step)) <= previous) continue;
      const a = base + z * side + x, b = a + 1, c = a + side, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices),
    centerX, centerZ, inner, overlap, radius: HORIZON_STEPS_BLOCKS.at(-1)! * HORIZON_RING_CELLS };
}
