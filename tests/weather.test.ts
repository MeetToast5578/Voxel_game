import { describe, expect, it } from 'vitest';
import { WEATHER_WIND_SPEED_M_S } from '../src/config';
import { WeatherModel, SECONDS_PER_YEAR } from '../src/world/weather';

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
    const w2 = model.sample(0, 0, 0.5, 1, 0); // one game year of drift later
    expect(w1.pressure).not.toBeCloseTo(w2.pressure, 3);
  });

  it('drifts at wind speed over the game year, not real-world seconds', () => {
    // One game year of drift is wind_speed * SECONDS_PER_YEAR metres east.
    const model = new WeatherModel(42);
    const driftM = WEATHER_WIND_SPEED_M_S * SECONDS_PER_YEAR;
    // Sampling at x = driftM with timeOfYear 0 equals sampling at x = 0 with timeOfYear 1.
    expect(model.sample(driftM, 0, 0.5, 0, 0).pressure).toBeCloseTo(model.sample(0, 0, 0.5, 1, 0).pressure, 6);
  });
});

describe('WeatherModel precipitation type by temperature', () => {
  it.each([[0.25, 'rain'], [0.75, 'snow']] as const)('actually precipitates as %s in season %s', (year, expected) => {
    const model = new WeatherModel(42);
    let precipitation = 0;
    for (let z = -8000; z <= 8000; z += 1000) for (let x = -8000; x <= 8000; x += 1000) {
      const w = model.sample(x,z,0.25,year,0);
      if (w.precipitation === 'none') continue;
      precipitation++;
      expect(w.precipitation).toBe(expected);
    }
    expect(precipitation).toBeGreaterThan(0); // A dry sample must not make a temperature test pass vacuously.
  });
});

describe('WeatherModel storm formation', () => {
  it('storm forms with low pressure, high humidity, warm temperature', () => {
    const model = new WeatherModel(42);
    let foundStorm = false;
    // Search at below-sea-level altitudes where temperature exceeds 10°C.
    for (let alt of [0, -1000, -2000]) {
      for (let z = -30000; z <= 30000 && !foundStorm; z += 750) {
        for (let x = -30000; x <= 30000 && !foundStorm; x += 750) {
          const w = model.sample(x, z, 0.5, 0.5, alt);
          if (w.isStorm) foundStorm = true;
        }
      }
    }
    expect(foundStorm).toBe(true);
  });
});
