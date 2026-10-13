import { describe, expect, it } from 'vitest';
import { MIN_DAYLIGHT, NIGHT_SKY_COLOR, SKY_COLOR } from '../src/config';
import { daylightAt, lerpColor, skyColorAt } from '../src/world/time';

describe('time of day', () => {
  it('is brightest at noon and darkest at midnight', () => {
    expect(daylightAt(0.25)).toBeCloseTo(1);
    expect(daylightAt(0.75)).toBeCloseTo(MIN_DAYLIGHT);
    expect(daylightAt(0)).toBeGreaterThan(MIN_DAYLIGHT);
    expect(daylightAt(0)).toBeLessThan(1);
    expect(daylightAt(1.25)).toBeCloseTo(daylightAt(0.25)); // wraps
  });
  it('lerpColor blends per channel', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
  it('sky color is day blue at noon and night blue at midnight', () => {
    expect(skyColorAt(0.25)).toBe(SKY_COLOR);
    expect(skyColorAt(0.75)).toBe(NIGHT_SKY_COLOR);
  });
});
