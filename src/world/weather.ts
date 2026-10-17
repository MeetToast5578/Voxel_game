import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/random';
import { DAY_LENGTH_S } from '../config';

export type PrecipitationType = 'none' | 'rain' | 'snow' | 'sleet';

export interface WeatherSample {
  temperature: number;   // °C at this position
  humidity: number;      // 0..1
  pressure: number;      // hPa, roughly 950..1050
  precipitation: PrecipitationType;
  cloudCover: number;    // 0..1
  windSpeed: number;     // m/s
  windDirection: number; // radians
  isStorm: boolean;
}

/** Pressure systems drift across the world: noise sampled at positions offset by wind × time. */
const PRESSURE_SYSTEM_SCALE = 4000; // meters
const PRESSURE_WIND_SPEED_M_S = 3; // how fast pressure systems drift

/** Temperature variation from pressure systems. */
const PRESSURE_TEMP_VARIATION_C = 5;

/** Precipitation thresholds. */
const RAIN_THRESHOLD = 0.6; // cloud cover above this = precipitation
const SNOW_TEMP_C = 0; // below this temp, precipitation is snow
const SLEET_TEMP_C = 2; // between snow and rain temps = sleet

/** Storm formation: high moisture + high temperature. */
const STORM_MOISTURE_THRESHOLD = 0.7;
const STORM_TEMP_THRESHOLD_C = 15;

/** Wind: prevailing direction + pressure gradient. */
const PREVAILING_WIND_DIR = 0; // radians, 0 = toward +X
const PREVAILING_WIND_SPEED_M_S = 2;

/** Map a noise value from [-1, 1] to [min, max]. */
function noiseRange(n: number, min: number, max: number): number {
  return min + (n + 1) / 2 * (max - min);
}

/**
 * Deterministic weather model. All outputs are pure functions of (seed, position, timeOfDay, season).
 * Nothing is saved — weather is regenerated on load from seed + time.
 */
export class WeatherModel {
  private readonly pressureNoise: NoiseFunction2D;
  private readonly tempNoise: NoiseFunction2D;
  private readonly humidityNoise: NoiseFunction2D;
  private readonly windNoise: NoiseFunction2D;

  constructor(readonly seed: number) {
    this.pressureNoise = createNoise2D(mulberry32(seed + 500));
    this.tempNoise = createNoise2D(mulberry32(seed + 501));
    this.humidityNoise = createNoise2D(mulberry32(seed + 502));
    this.windNoise = createNoise2D(mulberry32(seed + 503));
  }

  /**
   * Sample the weather at world position (wx, wz) at the given time.
   * `heightM` is the altitude above sea level (for orographic lift and temperature lapse).
   */
  sample(wx: number, wz: number, timeOfDay: number, season: number, heightM: number): WeatherSample {
    // Drift pressure systems: sample noise at positions offset by wind × time.
    const driftX = PRESSURE_WIND_SPEED_M_S * timeOfDay * DAY_LENGTH_S / 1000; // km drifted
    const driftZ = 0; // prevailing wind toward +X for simplicity
    const px = (wx + driftX * 1000) / PRESSURE_SYSTEM_SCALE;
    const pz = (wz + driftZ * 1000) / PRESSURE_SYSTEM_SCALE;

    const pressure = noiseRange(this.pressureNoise(px, pz), 950, 1050);
    const tempNoise = this.tempNoise(px, pz);
    const humidity = noiseRange(this.humidityNoise(px, pz), 0, 1);
    const windNoise = this.windNoise(px, pz);

    // Temperature: base from noise, modified by season, altitude lapse, and pressure system.
    const baseTemp = noiseRange(tempNoise, -10, 30);
    const seasonalTemp = 10 * Math.cos(2 * Math.PI * (season - 0.25)); // warmest at season 0.25 (summer)
    const altitudeLapse = -6.5 * (heightM / 1000); // 6.5 °C per km
    const pressureTemp = PRESSURE_TEMP_VARIATION_C * tempNoise;
    const temperature = baseTemp + seasonalTemp + altitudeLapse + pressureTemp;

    // Humidity: from noise, modified by orographic lift (higher = wetter on windward side).
    const orographicLift = Math.max(0, windNoise) * 0.2; // windward side gets wetter
    const humidityWithLift = Math.min(1, humidity + orographicLift);

    // Cloud cover: from pressure system (low pressure = more clouds).
    const cloudCover = Math.max(0, Math.min(1, (1000 - pressure) / 100));

    // Wind: prevailing direction + pressure gradient noise.
    const windDirection = PREVAILING_WIND_DIR + windNoise * 0.5;
    const windSpeed = PREVAILING_WIND_SPEED_M_S + Math.abs(windNoise) * 3;

    // Precipitation type: rain/snow/sleet by temperature.
    let precipitation: PrecipitationType = 'none';
    if (cloudCover > RAIN_THRESHOLD) {
      if (temperature <= SNOW_TEMP_C) {
        precipitation = 'snow';
      } else if (temperature <= SLEET_TEMP_C) {
        precipitation = 'sleet';
      } else {
        precipitation = 'rain';
      }
    }

    // Storms: high moisture + high temperature.
    const isStorm = humidityWithLift > STORM_MOISTURE_THRESHOLD && temperature > STORM_TEMP_THRESHOLD_C && cloudCover > 0.8;

    return {
      temperature,
      humidity: humidityWithLift,
      pressure,
      precipitation,
      cloudCover,
      windSpeed,
      windDirection,
      isStorm,
    };
  }
}
