import { describe, expect, it } from 'vitest';
import { TERRAIN_MAX_M } from '../src/config';
import { ClimateSampler, heightMeters, type ClimateFields } from '../src/world/shape';

const STEP_M = 300;
const SIDE = 60; // 60 x 300 m = 18 km square
const sampler = new ClimateSampler(42);
const samples: Array<{ f: ClimateFields; h: number }> = [];
for (let z = 0; z < SIDE; z++)
  for (let x = 0; x < SIDE; x++) {
    const f = sampler.fields(x * STEP_M, z * STEP_M);
    samples.push({ f, h: heightMeters(f) });
  }

describe('climate and shape fields', () => {
  it('keeps every field in [-1, 1] and is deterministic for a seed', () => {
    for (const { f } of samples) for (const v of Object.values(f)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    expect(new ClimateSampler(42).fields(1234, -5678)).toEqual(sampler.fields(1234, -5678));
    expect(new ClimateSampler(43).fields(1234, -5678)).not.toEqual(sampler.fields(1234, -5678));
  });

  it('has both ocean and land across the square', () => {
    const ocean = samples.filter((s) => s.h < 0).length / samples.length;
    expect(ocean).toBeGreaterThan(0.25);
    expect(ocean).toBeLessThan(0.75);
  });

  it('is below sea level where continentalness is low', () => {
    const deep = samples.filter((s) => s.f.continentalness < -0.45);
    expect(deep.length).toBeGreaterThan(0);
    for (const s of deep) expect(s.h).toBeLessThan(0);
  });

  it('has hills and mountains, and every height is inside the terrain band (spec 22)', () => {
    expect(Math.max(...samples.map((s) => s.h))).toBeGreaterThanOrEqual(100);
    for (const s of samples) {
      expect(s.h).toBeGreaterThanOrEqual(-300);
      expect(s.h).toBeLessThanOrEqual(TERRAIN_MAX_M);
    }
  });

  it('has a coast, where some columns are within 5 m of sea level', () => {
    expect(samples.some((s) => Math.abs(s.h) <= 5)).toBe(true);
  });
});
