import {
  OROGRAPHIC_LIFT,
  PRECIPITATION_MAX_MM,
  PRECIPITATION_MIN_MM,
  REGION_MOISTURE_WEIGHT,
  TEMPERATURE_LAPSE_C_PER_KM,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from '../config';
import { type ClimateFields } from './shape';
import { clamp, lerp } from '../core/math';

/** Map a field value from [-1, 1] to [min, max]. */
function fieldRange(value: number, min: number, max: number): number {
  return min + (value + 1) / 2 * (max - min);
}

/** Temperature in °C at a block: base field temperature minus altitude lapse. */
export function blockTemperature(fields: ClimateFields, heightM: number): number {
  const baseC = fieldRange(fields.temperature, TEMPERATURE_MIN_C, TEMPERATURE_MAX_C);
  const lapseC = (heightM / 1000) * TEMPERATURE_LAPSE_C_PER_KM;
  return baseC - lapseC;
}

/**
 * Precipitation in mm/year at a block.
 *
 * `moisture` is the region's advected moisture (spec 41), in 0..1. When given, it replaces most of
 * the raw humidity field, because it already accounts for where the air has been: it dries on the
 * windward climb and does not come back over the range. `REGION_MOISTURE_WEIGHT` keeps some of the
 * broad-scale humidity so biomes still vary across a whole region rather than only at the scale of
 * one range. `detailAmpM` adds a little extra orographic lift on top.
 */
export function blockPrecipitation(fields: ClimateFields, detailAmpM: number, moisture?: number): number {
  const lift = 1 + OROGRAPHIC_LIFT * detailAmpM / 22; // amplitude / max amplitude (22 m)
  const fromField = fieldRange(fields.humidity, PRECIPITATION_MIN_MM, PRECIPITATION_MAX_MM) / PRECIPITATION_MAX_MM;
  const base = moisture === undefined ? fromField : lerp(fromField, clamp(moisture, 0, 1), REGION_MOISTURE_WEIGHT);
  return base * PRECIPITATION_MAX_MM * lift;
}
