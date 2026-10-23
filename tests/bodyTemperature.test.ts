import { describe, expect, it } from 'vitest';
import { BODY_TEMP_NORMAL_C, HYPOTHERMIA_BELOW_C } from '../src/config';
import { feltTemperature, settledBodyTemperature, stepBodyTemperature, type Exposure } from '../src/player/bodyTemperature';

const winter: Exposure = { airC: -15, windSpeed: 8, wet: false, sheltered: false, nearHeat: false };

describe('body temperature (T-I4)', () => {
  it('wind and wet make it feel colder; a roof and a fire make it warmer', () => {
    const open = feltTemperature(winter);
    expect(open).toBeLessThan(-15);
    expect(feltTemperature({ ...winter, wet: true })).toBeLessThan(open);
    expect(feltTemperature({ ...winter, sheltered: true })).toBeGreaterThan(open);
    expect(feltTemperature({ ...winter, sheltered: true, nearHeat: true })).toBeGreaterThan(5);
  });

  it('a mild day keeps the body normal; winter outside drives it into hypothermia within minutes', () => {
    expect(settledBodyTemperature(15)).toBe(BODY_TEMP_NORMAL_C);
    expect(settledBodyTemperature(feltTemperature(winter))).toBeLessThan(HYPOTHERMIA_BELOW_C);
    let body = BODY_TEMP_NORMAL_C;
    for (let s = 0; s < 30; s++) body = stepBodyTemperature(body, feltTemperature(winter), 1);
    expect(body).toBeGreaterThan(HYPOTHERMIA_BELOW_C); // a short trip out is safe
    for (let s = 0; s < 300; s++) body = stepBodyTemperature(body, feltTemperature(winter), 1);
    expect(body).toBeLessThan(HYPOTHERMIA_BELOW_C);
    for (let s = 0; s < 600; s++) body = stepBodyTemperature(body, feltTemperature({ ...winter, sheltered: true, nearHeat: true }), 1);
    expect(body).toBeCloseTo(BODY_TEMP_NORMAL_C, 1); // warming up by a fire under a roof
    expect(settledBodyTemperature(45)).toBeGreaterThan(BODY_TEMP_NORMAL_C);
  });
});
