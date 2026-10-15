import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/random';

/** Large-scale terrain fields, each in [-1, 1]. Positions are in meters. */
export interface ClimateFields {
  continentalness: number;
  erosion: number;
  peaks: number;
  temperature: number;
  humidity: number;
  weirdness: number;
}

const FIELDS = ['continentalness', 'erosion', 'peaks', 'temperature', 'humidity', 'weirdness'] as const;
/** Feature size of each field, in meters. */
const WAVELENGTH_M: Record<keyof ClimateFields, number> = {
  continentalness: 6000,
  erosion: 1500,
  peaks: 700,
  temperature: 4000,
  humidity: 3000,
  weirdness: 2000,
};
/** Base height of the continentalness spline: [field value, height in meters]. */
const CONTINENTAL_SPLINE: ReadonlyArray<readonly [number, number]> = [
  [-1, -300],
  [-0.45, -120],
  [-0.2, -25],
  [-0.05, -2],
  [0.05, 4],
  [0.25, 40],
  [0.6, 110],
  [1, 150],
];
const MOUNTAIN_M = 2300;

/** Fractal noise: `octaves` layers, each at double the frequency and half the amplitude. Result in [-1, 1]. */
export function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The spline between knots eases in and out of each knot, so the terrain has no sharp creases. */
function spline(knots: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= knots[0]![0]) return knots[0]![1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    if (x <= x1) {
      const [x0, y0] = knots[i - 1]!;
      return y0 + (y1 - y0) * smoothstep(x0, x1, x);
    }
  }
  return knots[knots.length - 1]![1];
}

export class ClimateSampler {
  private readonly noise: Record<keyof ClimateFields, NoiseFunction2D>;

  constructor(seed: number) {
    this.noise = {} as Record<keyof ClimateFields, NoiseFunction2D>;
    FIELDS.forEach((name, i) => {
      this.noise[name] = createNoise2D(mulberry32(seed + 100 + i));
    });
  }

  /** The six fields at a position in meters. */
  fields(x: number, z: number): ClimateFields {
    const at = (name: keyof ClimateFields, octaves: number) =>
      fbm(this.noise[name], x / WAVELENGTH_M[name], z / WAVELENGTH_M[name], octaves);
    const peaks = 1 - 2 * Math.abs(at('peaks', 3));
    return {
      continentalness: at('continentalness', 4),
      erosion: at('erosion', 3),
      peaks,
      temperature: at('temperature', 2),
      humidity: at('humidity', 2),
      weirdness: at('weirdness', 2),
    };
  }
}

/** Surface height in meters: a spline of continentalness, plus mountains where the land is rugged and peaked. */
export function heightMeters(f: ClimateFields): number {
  const land = smoothstep(0.1, 0.5, f.continentalness);
  const rugged = smoothstep(0.3, -0.5, f.erosion);
  const ridge = smoothstep(0, 1, f.peaks);
  return spline(CONTINENTAL_SPLINE, f.continentalness) + MOUNTAIN_M * land * rugged * ridge;
}

/** Amplitude of the 3D detail noise, in meters: small bumps on plains, jagged rock where the land is rugged. */
const DETAIL_MIN_M = 3;
const DETAIL_MAX_M = 22;
export function detailAmpMeters(f: ClimateFields): number {
  const land = smoothstep(0.1, 0.5, f.continentalness);
  const rugged = smoothstep(0.3, -0.5, f.erosion);
  return DETAIL_MIN_M + (DETAIL_MAX_M - DETAIL_MIN_M) * land * rugged;
}
