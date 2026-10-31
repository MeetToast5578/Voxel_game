import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, DAYS_PER_SEASON } from '../config';
import { Clock } from '../sim/clock';
import { climateTemperature, WeatherModel } from '../sim/weather';

describe('clock', () => {
  it('puts the sun up at noon, down at midnight, and higher in summer', () => {
    const noon = new Clock(0.5, 0).sunDirection();
    expect(noon[1]).toBeGreaterThan(0.5);
    expect(new Clock(0, 0).sunDirection()[1]).toBeLessThan(-0.5);
    expect(Math.abs(new Clock(0.25, 0).sunDirection()[1])).toBeLessThan(1e-9);
    expect(new Clock(0.5, 0.25).sunDirection()[1]).toBeGreaterThan(new Clock(0.5, 0.75).sunDirection()[1]);
  });

  it('turns days into seasons and wraps the year', () => {
    const c = new Clock(0.9, 0);
    c.advance(DAY_LENGTH_S * 0.2);
    expect(c.day).toBe(2);
    c.advance(DAY_LENGTH_S * DAYS_PER_SEASON);
    expect(c.season).toBe('summer');
    c.advance(DAY_LENGTH_S * DAYS_PER_SEASON * 3);
    expect(c.season).toBe('spring');
    expect(c.yearTime).toBeLessThan(1);
  });

  it('colours leaves in autumn only', () => {
    expect(new Clock(0.5, 0.1).foliage().autumn).toBe(0);
    expect(new Clock(0.5, 0.75).foliage().autumn).toBe(1);
  });
});

describe('weather', () => {
  it('is a pure function of place and time', () => {
    const a = new WeatherModel(3).sample(100, 200, 0.3, 10, 50);
    expect(new WeatherModel(3).sample(100, 200, 0.3, 10, 50)).toEqual(a);
  });

  it('snows when cold and rains when warm, and has stormy and clear places', () => {
    const w = new WeatherModel(1);
    const kinds = new Set<string>();
    let storms = 0, clear = 0;
    for (let i = 0; i < 400; i++) {
      for (const c of [-15, 20]) {
        const s = w.sample(i * 1500, i * 700, 0.25, c, 0);
        kinds.add(`${c}:${s.precipitation}`);
        if (s.storm) storms++;
        if (s.cloudCover < 0.2) clear++;
      }
    }
    expect(kinds.has('-15:snow')).toBe(true);
    expect(kinds.has('20:rain')).toBe(true);
    expect(kinds.has('-15:rain')).toBe(false);
    expect(storms).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
  });

  it('decodes the climate byte back to about the right temperature', () => {
    expect(climateTemperature(15 << 4)).toBeCloseTo(30);
    expect(climateTemperature(0)).toBeCloseTo(-20);
  });
});
