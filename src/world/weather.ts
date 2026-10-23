import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/random';
import {
  DAYS_PER_SEASON,
  WEATHER_SEASONAL_AMPLITUDE_C,
  DAY_LENGTH_S,
  WEATHER_PRESSURE_WAVELENGTH_M,
  WEATHER_WIND_SPEED_M_S,
  WEATHER_HUMIDITY_WAVELENGTH_M,
  WEATHER_STORM_PRESSURE,
  WEATHER_STORM_HUMIDITY,
  WEATHER_STORM_TEMP_C,
  WEATHER_PRECIP_THRESHOLD,
  WEATHER_TEMP_SNOW_C,
  WEATHER_TEMP_RAIN_C,
} from '../config';

/** Length of one in-game year in seconds. The weather front drift is measured in these, not real-world seconds. */
export const SECONDS_PER_YEAR = DAYS_PER_SEASON * 4 * DAY_LENGTH_S;

export type PrecipType = 'none' | 'rain' | 'snow' | 'sleet';

export interface WeatherSample {
  /** Precipitation type: 'none', 'rain', 'snow', 'sleet'. */
  precipitation: PrecipType;
  /** Cloud cover, 0..1. */
  cloudCover: number;
  /** Local relative humidity, 0..1, for haze and morning fog. */
  humidity: number;
  /** True when storm conditions are met. */
  isStorm: boolean;
  /** Pressure field value, -1..1. Lower = stormier. */
  pressure: number;
  /** Wind speed in m/s. */
  windSpeed: number;
  /** Air temperature in °C, from the season and altitude. Snow melts and ice thaws above 0 (T-G2). */
  temperatureC: number;
}

const PRESSURE_OCTAVES = 4;
const HUMIDITY_OCTAVES = 3;
const LAPSE_RATE_C_PER_M = 0.0065; // 6.5 °C per km

/** Fractal Brownian Motion: sum of noise layers at doubling frequency, halving amplitude. Result in [-1, 1]. */
function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Deterministic weather model. Given seed, position, time of day, time of year,
 * and altitude, returns pressure, cloud cover, precipitation type, and storm
 * state. Output is a pure function of inputs: same inputs always give same output.
 * No state is kept, so nothing needs to be saved or reloaded.
 *
 * Temperature is derived from season and altitude (6.5 °C/km lapse rate).
 * Humidity is derived from a noise field. These feed precipitation type and
 * cloud cover.
 */
export class WeatherModel {
  private readonly pressureNoise: NoiseFunction2D;
  private readonly humidityNoise: NoiseFunction2D;

  constructor(seed: number) {
    this.pressureNoise = createNoise2D(mulberry32(seed + 500));
    this.humidityNoise = createNoise2D(mulberry32(seed + 600));
  }

  /** Sample the weather at a world position. Pure; no state changes. */
  sample(
    x: number,
    z: number,
    _timeOfDay: number,
    timeOfYear: number,
    altitudeM: number,
  ): WeatherSample {
    // Weather fronts drift eastward with wind over the course of the year (in game seconds).
    const driftM = WEATHER_WIND_SPEED_M_S * timeOfYear * SECONDS_PER_YEAR;
    const px = (x + driftM) / WEATHER_PRESSURE_WAVELENGTH_M;
    const pz = z / WEATHER_PRESSURE_WAVELENGTH_M;

    // Large-scale pressure field: low pressure = stormy, high pressure = clear.
    const pressure = fbm(this.pressureNoise, px, pz, PRESSURE_OCTAVES);

    // Humidity field adds local variation.
    const humidityField = fbm(
      this.humidityNoise,
      x / WEATHER_HUMIDITY_WAVELENGTH_M,
      z / WEATHER_HUMIDITY_WAVELENGTH_M,
      HUMIDITY_OCTAVES,
    );
    const humidity = Math.max(0, Math.min(1, 0.5 + humidityField * 0.3));

    // Temperature from season (sinusoidal, warmest at summer solstice = 0.25)
    // and altitude lapse rate.
    const seasonalTempC = WEATHER_SEASONAL_AMPLITUDE_C * Math.sin(2 * Math.PI * timeOfYear);
    const temperatureC = seasonalTempC - altitudeM * LAPSE_RATE_C_PER_M;

    // Cloud cover increases with low pressure, humidity, and seasonal moisture.
    const seasonalMoisture = Math.max(0, Math.sin(2 * Math.PI * timeOfYear));
    const cloudCover = Math.max(0, Math.min(1, -pressure * 0.5 + humidity * 0.4 + seasonalMoisture * 0.2));

    // Precipitation needs cloud cover plus lifting: low pressure (rising air)
    // or orographic lift (wind pushing moist air up terrain).
    const pressureUplift = Math.max(0, -pressure);
    const orographicLift = Math.max(0, altitudeM / 3000);
    const precipitation = Math.max(0, Math.min(1, cloudCover * (pressureUplift * 0.6 + orographicLift * 0.3) + humidity * 0.2));

    // Precipitation type chosen by air temperature.
    let precipType: PrecipType = 'none';
    if (precipitation > WEATHER_PRECIP_THRESHOLD) {
      if (temperatureC <= WEATHER_TEMP_SNOW_C) precipType = 'snow';
      else if (temperatureC >= WEATHER_TEMP_RAIN_C) precipType = 'rain';
      else precipType = 'sleet';
    }

    // Storms form with deep low pressure, high moisture, and warm temperatures.
    const isStorm = pressure < WEATHER_STORM_PRESSURE && humidity > WEATHER_STORM_HUMIDITY && temperatureC > WEATHER_STORM_TEMP_C;

    // Wind speed increases as pressure drops (pressure gradient drives wind).
    const windSpeed = 3 + Math.max(0, -pressure) * 8;

    return {
      precipitation: precipType,
      cloudCover,
      humidity,
      isStorm,
      pressure,
      windSpeed,
      temperatureC,
    };
  }
}
