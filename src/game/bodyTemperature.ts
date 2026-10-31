import {
  BODY_COLD_C, BODY_HOT_C, BODY_NORMAL_C, BODY_RATE_PER_S, COMFORT_MAX_C, COMFORT_MIN_C, NIGHT_COOLING_C, SHELTER_C, TEMPERATURE_DAMAGE_PER_S,
  WET_COOLING_C, WIND_CHILL_PER_M_S,
} from '../config';

/** What decides how warm the player feels. */
export interface Exposure {
  /** Air temperature where the player is (climate, season, altitude), in °C. */
  airC: number;
  night: boolean;
  /** Under a roof: no direct sky above the head. */
  sheltered: boolean;
  /** Wet from rain or swimming. */
  wet: boolean;
  windM_S: number;
  /** Warmth from fires, lava, furnaces and torches nearby, in °C. */
  heatC: number;
  /** Clothing: °C of cold kept off. */
  insulationC: number;
}

/** The temperature the player feels: air, minus night, wind and wetness out in the open, plus shelter, heat and clothes. */
export function feltTemperature(e: Exposure): number {
  let t = e.airC - (e.night ? NIGHT_COOLING_C : 0) + e.heatC;
  if (e.sheltered) t += SHELTER_C;
  else t -= e.windM_S * WIND_CHILL_PER_M_S;
  if (e.wet) t -= WET_COOLING_C;
  // Clothes keep cold off; in heat they only stop helping.
  return t < COMFORT_MIN_C ? Math.min(COMFORT_MIN_C, t + e.insulationC) : t;
}

/**
 * Core body temperature. Below the comfortable band the body cools, above it warms, inside it returns to normal, all
 * in proportion to how far out it is. Hypothermia (below BODY_COLD_C) and heatstroke (above BODY_HOT_C) hurt.
 */
export class BodyTemperature {
  coreC = BODY_NORMAL_C;

  /** Advances by dt seconds at the felt temperature; returns damage taken (0 when fine) and its cause. */
  update(dt: number, feltC: number): { damage: number; cause: string } {
    const push = feltC < COMFORT_MIN_C ? feltC - COMFORT_MIN_C : feltC > COMFORT_MAX_C ? feltC - COMFORT_MAX_C : 0;
    if (push !== 0) this.coreC += push * BODY_RATE_PER_S * dt;
    else this.coreC += (BODY_NORMAL_C - this.coreC) * Math.min(1, 0.05 * dt);
    this.coreC = Math.max(BODY_COLD_C - 3, Math.min(BODY_HOT_C + 2, this.coreC));
    if (this.coreC < BODY_COLD_C) return { damage: TEMPERATURE_DAMAGE_PER_S * dt, cause: 'froze to death' };
    if (this.coreC > BODY_HOT_C) return { damage: TEMPERATURE_DAMAGE_PER_S * dt, cause: 'died of heatstroke' };
    return { damage: 0, cause: '' };
  }

  reset(): void {
    this.coreC = BODY_NORMAL_C;
  }
}
