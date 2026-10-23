import { BLOCK_SIZE_M, CHUNK_SIZE, TEMPERATURE_LAPSE_C_PER_KM, TEMPERATURE_MIN_C, TEMPERATURE_MAX_C, TINT_GRID_M, TINT_CACHE_LIMIT } from '../config';
import { clamp } from '../core/math';
import { ClimateSampler } from './shape';

export type TintKind = 1 | 2 | 3; // grass, foliage, water

/** Continuous climate map; output multipliers preserve the procedural texture's detail. */
export function climateTint(temperatureC: number, humidity: number, kind: TintKind): readonly [number, number, number] {
  const t = clamp((temperatureC + 20) / 55, 0, 1), h = clamp(humidity, 0, 1);
  if (kind === 3) return [0.7 + 0.2 * t, 0.85 + 0.1 * h, 1 - 0.2 * t];
  const r = (1 - 0.35 * h) * (0.8 + 0.2 * t);
  const g = 0.85 + 0.15 * h;
  const b = 0.55 + 0.2 * h + 0.2 * (1 - t);
  return kind === 2 ? [r * 0.9, g * 0.95, b] : [r, g, b];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * How strongly a place shows the seasons (T-F7), from its climate: [deciduous, dryness], each 0..1. All trees share one
 * leaves block, so the climate decides: cold boreal and hot tropical places stay evergreen, temperate ones go bare in
 * winter. Grass browns in summer where it is warm and dry.
 */
export function seasonalWeights(temperatureC: number, humidity: number): readonly [number, number] {
  const deciduous = smoothstep(-4, 2, temperatureC) * (1 - smoothstep(18, 24, temperatureC));
  const dryness = (1 - smoothstep(0.3, 0.6, humidity)) * smoothstep(5, 20, temperatureC);
  return [deciduous, dryness];
}

/** Sparse world grid, never chunk IDs. Cached and fresh sampling are interchangeable. */
export class ClimateTintSampler {
  private readonly climate: ClimateSampler;
  private readonly grid = new Map<string, readonly [number, number]>();
  constructor(seed: number) { this.climate = new ClimateSampler(seed); }
  private at(gx: number, gz: number): readonly [number, number] {
    const key = `${gx},${gz}`;
    const cached = this.grid.get(key);
    if (cached) return cached;
    const f = this.climate.fields(gx * TINT_GRID_M, gz * TINT_GRID_M);
    const value = [TEMPERATURE_MIN_C + (f.temperature + 1) / 2 * (TEMPERATURE_MAX_C - TEMPERATURE_MIN_C), (f.humidity + 1) / 2] as const;
    if (this.grid.size >= TINT_CACHE_LIMIT) this.grid.clear();
    this.grid.set(key, value); return value;
  }
  fields(x: number, z: number): readonly [number, number] {
    const gx = x * BLOCK_SIZE_M / TINT_GRID_M, gz = z * BLOCK_SIZE_M / TINT_GRID_M;
    const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    const a = this.at(ix, iz), b = this.at(ix + 1, iz), c = this.at(ix, iz + 1), d = this.at(ix + 1, iz + 1);
    const interpolate = (i: 0 | 1) => (a[i] * (1 - tx) + b[i] * tx) * (1 - tz) + (c[i] * (1 - tx) + d[i] * tx) * tz;
    return [interpolate(0), interpolate(1)];
  }
}
const samplers = new Map<number, ClimateTintSampler>();
function samplerFor(seed: number): ClimateTintSampler {
  let sampler = samplers.get(seed);
  if (!sampler) {
    if (samplers.size >= 4) samplers.clear();
    sampler = new ClimateTintSampler(seed); samplers.set(seed, sampler);
  }
  return sampler;
}

/** Precompute climate for the chunk's vertex columns; only altitude/palette arithmetic remains per vertex. */
export class MeshTints {
  private readonly temperatures = new Float64Array((CHUNK_SIZE + 1) ** 2);
  private readonly humidity = new Float64Array((CHUNK_SIZE + 1) ** 2);
  r = 1; g = 1; b = 1;
  /** Seasonal weights of the last sample (see seasonalWeights); 0 for water. */
  deciduous = 0; dryness = 0;
  constructor(seed: number, cx: number, private readonly cy: number, cz: number) {
    const sampler = samplerFor(seed);
    for (let z = 0; z <= CHUNK_SIZE; z++) for (let x = 0; x <= CHUNK_SIZE; x++) {
      const f = sampler.fields(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z), i = z * (CHUNK_SIZE + 1) + x;
      this.temperatures[i] = f[0]; this.humidity[i] = f[1];
    }
  }
  sample(x: number, y: number, z: number, kind: TintKind): void {
    const i = z * (CHUNK_SIZE + 1) + x;
    const temperatureC = this.temperatures[i]! - (this.cy * CHUNK_SIZE + y) * BLOCK_SIZE_M / 1000 * TEMPERATURE_LAPSE_C_PER_KM;
    const t = clamp((temperatureC + 20) / 55, 0, 1);
    const h = this.humidity[i]!;
    const [deciduous, dryness] = kind === 3 ? [0, 0] : seasonalWeights(temperatureC, h);
    this.deciduous = kind === 2 ? deciduous : 0;
    this.dryness = kind === 1 ? dryness : 0;
    if (kind === 3) { this.r = 0.7 + 0.2 * t; this.g = 0.85 + 0.1 * h; this.b = 1 - 0.2 * t; }
    else {
      this.r = (1 - 0.35 * h) * (0.8 + 0.2 * t) * (kind === 2 ? 0.9 : 1);
      this.g = (0.85 + 0.15 * h) * (kind === 2 ? 0.95 : 1);
      this.b = 0.55 + 0.2 * h + 0.2 * (1 - t);
    }
  }
}
