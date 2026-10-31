import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import {
  DAY_LENGTH_S, DAYS_PER_SEASON, WEATHER_HUMIDITY_WAVELENGTH_M, WEATHER_PRECIP_THRESHOLD, WEATHER_PRESSURE_WAVELENGTH_M,
  WEATHER_SEASONAL_AMPLITUDE_C, WEATHER_STORM_HUMIDITY, WEATHER_STORM_PRESSURE, WEATHER_STORM_TEMP_C, WEATHER_TEMP_RAIN_C,
  WEATHER_TEMP_SNOW_C, WEATHER_WIND_SPEED_M_S,
} from '../config';
import { mulberry32 } from '../core/random';
import { fbm } from '../worldgen/climate';

export type Precipitation = 'none' | 'rain' | 'snow' | 'sleet';

export interface WeatherSample {
  precipitation: Precipitation;
  /** 0..1. */
  cloudCover: number;
  humidity: number;
  storm: boolean;
  windSpeed: number;
  /** Seasonal offset of the air temperature, °C, added to the climate's own. */
  seasonC: number;
}

const SECONDS_PER_YEAR = 4 * DAYS_PER_SEASON * DAY_LENGTH_S;

/**
 * Weather as a pure function of seed, place (meters), time of year and the local climate temperature: a pressure
 * field drifting east, humidity, cloud cover from both, and rain or snow by temperature. Nothing to save.
 * Ported from the old `src/world/weather.ts`.
 */
export class WeatherModel {
  private readonly pressure: NoiseFunction2D;
  private readonly humidity: NoiseFunction2D;

  constructor(seed: number) {
    this.pressure = createNoise2D(mulberry32(seed + 500));
    this.humidity = createNoise2D(mulberry32(seed + 600));
  }

  sample(xM: number, zM: number, yearTime: number, climateC: number, altitudeM: number): WeatherSample {
    const drift = WEATHER_WIND_SPEED_M_S * yearTime * SECONDS_PER_YEAR;
    const pressure = fbm(this.pressure, (xM + drift) / WEATHER_PRESSURE_WAVELENGTH_M, zM / WEATHER_PRESSURE_WAVELENGTH_M, 4);
    const humidity = Math.max(0, Math.min(1, 0.5 + 0.3 * fbm(this.humidity, xM / WEATHER_HUMIDITY_WAVELENGTH_M, zM / WEATHER_HUMIDITY_WAVELENGTH_M, 3)));
    const seasonC = WEATHER_SEASONAL_AMPLITUDE_C * Math.sin(2 * Math.PI * yearTime);
    const temperature = climateC + seasonC;
    const moisture = Math.max(0, Math.sin(2 * Math.PI * yearTime));
    const cloudCover = Math.max(0, Math.min(1, -pressure * 0.5 + humidity * 0.4 + moisture * 0.2));
    const lift = Math.max(0, -pressure) * 0.6 + Math.max(0, altitudeM / 3000) * 0.3;
    const amount = Math.max(0, Math.min(1, cloudCover * lift + humidity * 0.2));
    let precipitation: Precipitation = 'none';
    if (amount > WEATHER_PRECIP_THRESHOLD) {
      precipitation = temperature <= WEATHER_TEMP_SNOW_C ? 'snow' : temperature >= WEATHER_TEMP_RAIN_C ? 'rain' : 'sleet';
    }
    const storm = pressure < WEATHER_STORM_PRESSURE && humidity > WEATHER_STORM_HUMIDITY && temperature > WEATHER_STORM_TEMP_C;
    return { precipitation, cloudCover, humidity, storm, windSpeed: 3 + Math.max(0, -pressure) * 8, seasonC };
  }
}

/** Air temperature in °C encoded in a column's climate byte (see the generator's `climate`). */
export function climateTemperature(climateByte: number): number {
  return ((climateByte >> 4) / 7.5 - 1) * 25 + 5;
}
