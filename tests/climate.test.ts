import { describe, expect, it } from 'vitest';
import {
  blockPrecipitation,
  blockTemperature,
} from '../src/world/climate';

const fields = {
  continentalness: 0,
  erosion: 0,
  peaks: 0,
  temperature: 0,
  humidity: 0,
  weirdness: 0,
};

describe('blockTemperature', () => {
  it('maps temperature field to Celsius range', () => {
    expect(blockTemperature({ ...fields, temperature: -1 }, 0)).toBe(-30);
    expect(blockTemperature({ ...fields, temperature: 1 }, 0)).toBe(30);
    expect(blockTemperature({ ...fields, temperature: 0 }, 0)).toBeCloseTo(0, 1e-9);
  });

  it('decreases with altitude at constant field', () => {
    const warm = blockTemperature({ ...fields, temperature: 1 }, 0);
    const cold = blockTemperature({ ...fields, temperature: 1 }, 1000); // 1 km up
    expect(cold).toBeLessThan(warm);
    expect(cold).toBeCloseTo(warm - 6.5, 1e-9);
  });

  it('never returns NaN or Infinity', () => {
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      for (const h of [0, 100, 1000, 2500]) {
        const temp = blockTemperature({ ...fields, temperature: t }, h);
        expect(Number.isFinite(temp)).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    const f = { ...fields, temperature: 0.3, humidity: -0.2 };
    expect(blockTemperature(f, 500)).toBe(blockTemperature(f, 500));
  });
});

describe('blockPrecipitation', () => {
  it('maps humidity field to mm/year range', () => {
    expect(blockPrecipitation({ ...fields, humidity: -1 }, 0)).toBe(0);
    expect(blockPrecipitation({ ...fields, humidity: 1 }, 0)).toBe(2000);
    expect(blockPrecipitation({ ...fields, humidity: 0 }, 0)).toBeCloseTo(1000, 1e-9);
  });

  it('increases with detail amplitude (orographic lift)', () => {
    const flat = blockPrecipitation({ ...fields, humidity: 0.5 }, 0);
    const steep = blockPrecipitation({ ...fields, humidity: 0.5 }, 22);
    expect(steep).toBeGreaterThan(flat);
  });

  it('never returns NaN or Infinity', () => {
    for (const h of [-1, -0.5, 0, 0.5, 1]) {
      for (const a of [0, 3, 12, 22]) {
        const precip = blockPrecipitation({ ...fields, humidity: h }, a);
        expect(Number.isFinite(precip)).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    const f = { ...fields, temperature: 0.3, humidity: -0.2 };
    expect(blockPrecipitation(f, 500)).toBe(blockPrecipitation(f, 500));
  });
});
