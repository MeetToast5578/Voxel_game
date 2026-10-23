import { describe, expect, it } from 'vitest';
import {
  Calendar,
  seasonName,
  dayOfSeason,
  solarDeclination,
  dayLengthMinutes,
  foliageSeason,
} from '../src/world/calendar';

describe('foliageSeason (T-F7)', () => {
  it('is green in spring, dry in high summer, coloured in early autumn and bare in winter', () => {
    expect(foliageSeason(0.1)).toEqual({ autumn: 0, bare: 0, summer: 0 });
    expect(foliageSeason(0.38)).toEqual({ autumn: 0, bare: 0, summer: 1 });
    expect(foliageSeason(0.6)).toMatchObject({ autumn: 1, bare: 0, summer: 0 });
    expect(foliageSeason(0.85)).toMatchObject({ bare: 1, summer: 0 });
  });
  it('wraps smoothly from the end of winter into spring, when the leaves come back green', () => {
    expect(foliageSeason(1)).toEqual(foliageSeason(0));
    expect(foliageSeason(0.96).autumn).toBe(0); // already bare while the colour fades, so new leaves are green
    expect(foliageSeason(0.93).bare).toBe(1);
    expect(foliageSeason(0.995).bare).toBeLessThan(0.05);
    expect(foliageSeason(-0.15)).toEqual(foliageSeason(0.85));
  });
});

describe('seasonName', () => {
  it('maps quarters of the year to seasons', () => {
    expect(seasonName(0)).toBe('spring');
    expect(seasonName(0.1)).toBe('spring');
    expect(seasonName(0.249)).toBe('spring');
    expect(seasonName(0.25)).toBe('summer');
    expect(seasonName(0.49)).toBe('summer');
    expect(seasonName(0.5)).toBe('autumn');
    expect(seasonName(0.74)).toBe('autumn');
    expect(seasonName(0.75)).toBe('winter');
    expect(seasonName(0.99)).toBe('winter');
    expect(seasonName(1)).toBe('spring');
  });
});

describe('dayOfSeason', () => {
  it('counts days within a season (7 days per season)', () => {
    expect(dayOfSeason(0, 7)).toBe(1);
    expect(dayOfSeason(0.25, 7)).toBe(1);
    expect(dayOfSeason(0.5, 7)).toBe(1);
    expect(dayOfSeason(0.75, 7)).toBe(1);
    expect(dayOfSeason(0.99, 7)).toBe(7);
  });
});

describe('solarDeclination', () => {
  it('is 0 at equinoxes', () => {
    expect(solarDeclination(0)).toBeCloseTo(0, 1e-9);
    expect(solarDeclination(0.5)).toBeCloseTo(0, 1e-9);
  });
  it('is +23.5 at summer solstice', () => {
    expect(solarDeclination(0.25)).toBeCloseTo(23.5, 1e-9);
  });
  it('is -23.5 at winter solstice', () => {
    expect(solarDeclination(0.75)).toBeCloseTo(-23.5, 1e-9);
  });
});

describe('dayLengthMinutes', () => {
  it('is 12h at equator on equinox', () => {
    expect(dayLengthMinutes(0, 0)).toBeCloseTo(720, 1e-6);
  });
  it('is longest at summer solstice (45 deg lat)', () => {
    const winter = dayLengthMinutes(45, -23.5);
    const summer = dayLengthMinutes(45, 23.5);
    expect(summer).toBeGreaterThan(winter);
    expect(summer).toBeGreaterThan(720);
    expect(winter).toBeLessThan(720);
  });
  it('handles polar day', () => {
    expect(dayLengthMinutes(80, 23.5)).toBeCloseTo(1440, 0.1);
  });
  it('handles polar night', () => {
    expect(dayLengthMinutes(80, -23.5)).toBeCloseTo(0, 0.1);
  });
});

describe('Calendar', () => {
  it('advances timeOfYear and wraps at 1', () => {
    const cal = new Calendar(7, 45);
    expect(cal.timeOfYear).toBe(0);
    cal.advance(600 * 28);
    expect(cal.timeOfYear).toBeCloseTo(0, 1e-9);
    cal.advance(600 * 7);
    expect(cal.season).toBe('summer');
  });

  it('reports season, day, declination, and day length', () => {
    const cal = new Calendar(7, 45);
    expect(cal.season).toBe('spring');
    expect(cal.day).toBe(1);
    expect(cal.declination).toBeCloseTo(0, 1e-9);
    expect(cal.dayLengthMin).toBeCloseTo(720, 1e-6);
  });
});
