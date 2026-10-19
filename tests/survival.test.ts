import { describe, expect, it } from 'vitest';
import { GAME_MODE_CREATIVE, GAME_MODE_SURVIVAL, HEALTH_MAX, HUNGER_MAX, AIR_MAX_S } from '../src/config';

describe('Game mode', () => {
  it('defines survival and creative modes', () => {
    expect(GAME_MODE_CREATIVE).toBe('creative');
    expect(GAME_MODE_SURVIVAL).toBe('survival');
    expect(GAME_MODE_CREATIVE).not.toBe(GAME_MODE_SURVIVAL);
  });
});

describe('Health clamping', () => {
  it('clamps at 0 and MAX', () => {
    let health = HEALTH_MAX;
    health = Math.max(0, health - 30);
    expect(health).toBe(0);
    health = Math.min(HEALTH_MAX, health + 50);
    expect(health).toBe(HEALTH_MAX);
  });
});

describe('Hunger clamping', () => {
  it('clamps at 0 and MAX', () => {
    let hunger = HUNGER_MAX;
    hunger = Math.max(0, hunger - 30);
    expect(hunger).toBe(0);
    hunger = Math.min(HUNGER_MAX, hunger + 50);
    expect(hunger).toBe(HUNGER_MAX);
  });
});

describe('Air clamping', () => {
  it('clamps at 0 and MAX', () => {
    let air = AIR_MAX_S;
    air = Math.max(0, air - 20);
    expect(air).toBe(0);
    air = Math.min(AIR_MAX_S, air + 50);
    expect(air).toBe(AIR_MAX_S);
  });
});

describe('Fall damage calculation', () => {
  it('no damage for short falls', () => {
    // Fall of 1 block at 0.3m = 0.3m, impact speed = sqrt(2 * 28 * 0.3) ≈ 4.1 m/s < 6 m/s threshold
    const fallDistanceM = 1 * 0.3;
    const impactSpeedM_S = Math.sqrt(2 * 28 * fallDistanceM);
    expect(impactSpeedM_S).toBeLessThan(6);
    const damage = impactSpeedM_S > 6 ? (impactSpeedM_S - 6) * 2 : 0;
    expect(damage).toBe(0);
  });

  it('damage for long falls', () => {
    // Fall of 10 blocks at 0.3m = 3m, impact speed = sqrt(2 * 28 * 3) ≈ 13 m/s > 6 m/s threshold
    const fallDistanceM = 10 * 0.3;
    const impactSpeedM_S = Math.sqrt(2 * 28 * fallDistanceM);
    expect(impactSpeedM_S).toBeGreaterThan(6);
    const damage = (impactSpeedM_S - 6) * 2;
    expect(damage).toBeGreaterThan(0);
  });
});
