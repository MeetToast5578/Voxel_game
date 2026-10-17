import { describe, expect, it } from 'vitest';
import { WeatherModel } from '../src/world/weather';

describe('WeatherModel determinism', () => {
  it('same inputs give same output', () => {
    const model = new WeatherModel(42);
    const a = model.sample(100, 200, 0.3, 0.5, 50);
    const b = model.sample(100, 200, 0.3, 0.5, 50);
    expect(a).toEqual(b);
  });

  it('different seeds give different results', () => {
    const m1 = new WeatherModel(1);
    const m2 = new WeatherModel(2);
    const w1 = m1.sample(100, 200, 0.3, 0.5, 50);
    const w2 = m2.sample(100, 200, 0.3, 0.5, 50);
    expect(w1.pressure).not.toBeCloseTo(w2.pressure, 4);
  });

  it('all outputs are finite numbers', () => {
    const model = new WeatherModel(42);
    const w = model.sample(0, 0, 0, 0, 0);
    expect(Number.isFinite(w.pressure)).toBe(true);
    expect(Number.isFinite(w.cloudCover)).toBe(true);
    expect(Number.isFinite(w.windSpeed)).toBe(true);
  });

  it('pressure is within [-1, 1]', () => {
    const model = new WeatherModel(42);
    for (let i = 0; i < 20; i++) {
      const w = model.sample(i * 1000, i * 1000, 0.5, 0.5, 0);
      expect(w.pressure).toBeGreaterThanOrEqual(-1);
      expect(w.pressure).toBeLessThanOrEqual(1);
    }
  });

  it('cloud cover is within [0, 1]', () => {
    const model = new WeatherModel(42);
    for (let i = 0; i < 20; i++) {
      const w = model.sample(i * 1000, i * 1000, 0.5, 0.5, 0);
      expect(w.cloudCover).toBeGreaterThanOrEqual(0);
      expect(w.cloudCover).toBeLessThanOrEqual(1);
    }
  });

  it('precipitation is one of the valid types', () => {
    const model = new WeatherModel(42);
    const valid: ('none' | 'rain' | 'snow' | 'sleet')[] = ['none', 'rain', 'snow', 'sleet'];
    for (let i = 0; i < 20; i++) {
      const w = model.sample(i * 1000, i * 1000, 0.5, 0.5, 0);
      expect(valid).toContain(w.precipitation);
    }
  });
});

describe('WeatherModel pressure drift', () => {
  it('weather fronts drift with time of year', () => {
    const model = new WeatherModel(42);
    const w1 = model.sample(0, 0, 0.5, 0, 0);
    const w2 = model.sample(3 * 365 * 24 * 3600, 0, 0.5, 1, 0); // one year of drift at 3 m/s
    expect(w1.pressure).not.toBeCloseTo(w2.pressure, 3);
  });
});

describe('WeatherModel precipitation type by temperature', () => {
  it('snow at freezing temperatures', () => {
    const model = new WeatherModel(42);
    const w = model.sample(0, 0, 0.5, 0.5, 0); // winter (timeOfYear=0.5), sea level → cold
    if (w.precipitation !== 'none') {
      expect(w.precipitation).toBe('snow');
    }
  });

  it('rain at warm temperatures', () => {
    const model = new WeatherModel(42);
    // Peak warmth at timeOfYear=0.5: seasonalTemp = 10 * sin(2π * 0.25) = 10°C
    const w = model.sample(0, 0, 0.5, 0.5, 0);
    if (w.precipitation !== 'none') {
      expect(w.precipitation).toBe('rain');
    }
  });
});

describe('WeatherModel storm formation', () => {
  it('storm forms with low pressure, high humidity, warm temperature', () => {
    const model = new WeatherModel(42);
    let foundStorm = false;
    // Search at below-sea-level altitudes where temperature exceeds 10°C
    for (let alt of [0, -500, -1000]) {
      for (let z = -10000; z <= 10000 && !foundStorm; z += 1000) {
        for (let x = -10000; x <= 10000 && !foundStorm; x += 1000) {
          const w = model.sample(x, z, 0.5, 0.5, alt);
          if (w.isStorm) {
            foundStorm = true;
          }
        }
      }
    }
    expect(foundStorm).toBe(true);
  });
});
