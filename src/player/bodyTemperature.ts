import { BODY_TEMP_COMFORT_C, BODY_TEMP_NORMAL_C, BODY_TEMP_RATE_PER_S, BODY_TEMP_SLOPE, FELT_HEAT_SOURCE_C, FELT_SHELTER_C, FELT_WET_C, FELT_WIND_C_PER_M_S } from '../config';

/** What the player's surroundings are like, sampled about once a second (T-I4). */
export interface Exposure {
  /** Air temperature at the player, °C: climate, season and altitude (WeatherModel). */
  airC: number;
  windSpeed: number;
  /** In water, or in rain without a roof. */
  wet: boolean;
  /** Something blocks the sky above the head. */
  sheltered: boolean;
  /** Lava or a light-giving block close by: a fire to warm up at. */
  nearHeat: boolean;
}

/** The temperature the body feels: the air, made colder by wind and wetness and warmer by shelter and fire. */
export function feltTemperature(e: Exposure): number {
  return e.airC - (e.sheltered ? 0 : e.windSpeed * FELT_WIND_C_PER_M_S) - (e.wet ? FELT_WET_C : 0)
    + (e.sheltered ? FELT_SHELTER_C : 0) + (e.nearHeat ? FELT_HEAT_SOURCE_C : 0);
}

/**
 * The core temperature the body settles at for a felt temperature: normal inside the comfort band, lower below it and
 * higher above it, BODY_TEMP_SLOPE °C per felt degree.
 */
export function settledBodyTemperature(feltC: number): number {
  const [cold, hot] = BODY_TEMP_COMFORT_C;
  if (feltC < cold) return BODY_TEMP_NORMAL_C - (cold - feltC) * BODY_TEMP_SLOPE;
  if (feltC > hot) return BODY_TEMP_NORMAL_C + (feltC - hot) * BODY_TEMP_SLOPE;
  return BODY_TEMP_NORMAL_C;
}

/** One step of the body moving toward its settled temperature; it takes minutes, so a short trip out is safe. */
export function stepBodyTemperature(bodyC: number, feltC: number, dt: number): number {
  const target = settledBodyTemperature(feltC);
  return bodyC + (target - bodyC) * (1 - Math.exp(-BODY_TEMP_RATE_PER_S * dt));
}
