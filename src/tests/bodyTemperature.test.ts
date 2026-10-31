import { describe, expect, it } from 'vitest';
import { BODY_COLD_C, BODY_NORMAL_C, MAX_HEALTH } from '../config';
import { BodyTemperature, feltTemperature, type Exposure } from '../game/bodyTemperature';
import { Survival } from '../game/survival';

const outside: Exposure = { airC: -5, night: true, sheltered: false, wet: true, windM_S: 8, heatC: 0, insulationC: 0 };
const cabin: Exposure = { ...outside, sheltered: true, wet: false, heatC: 4 + 4 };

describe('body temperature', () => {
  it('feels much colder outside in a night snowstorm than in a roofed room with torches', () => {
    expect(feltTemperature(outside)).toBeLessThan(-20);
    expect(feltTemperature(cabin)).toBeGreaterThan(feltTemperature(outside) + 25);
    // Clothes keep the cold off, but never make it warmer than comfortable.
    expect(feltTemperature({ ...outside, insulationC: 100 })).toBe(8);
  });

  it('hurts standing out in the storm, and not in the cabin', () => {
    const out = new Survival(), inside = new Survival();
    for (let t = 0; t < 120; t += 0.5) {
      out.update(0.5, { sprinting: false, headInWater: false, inLava: false, feltC: feltTemperature(outside) });
      inside.update(0.5, { sprinting: false, headInWater: false, inLava: false, feltC: feltTemperature({ ...cabin, airC: 15 }) });
    }
    expect(out.temperature.coreC).toBeLessThan(BODY_COLD_C);
    expect(out.health).toBeLessThan(MAX_HEALTH);
    expect(out.cause).toBe('froze to death');
    expect(inside.health).toBe(MAX_HEALTH);
    expect(inside.temperature.coreC).toBeCloseTo(BODY_NORMAL_C);
  });

  it('recovers toward normal when comfortable', () => {
    const b = new BodyTemperature();
    b.coreC = 35.5;
    for (let t = 0; t < 120; t++) b.update(1, 20);
    expect(b.coreC).toBeGreaterThan(36.8);
  });
});
