import {
  OROGRAPHIC_LIFT,
  PRECIPITATION_MAX_MM,
  PRECIPITATION_MIN_MM,
  TEMPERATURE_LAPSE_C_PER_KM,
  TEMPERATURE_MAX_C,
  TEMPERATURE_MIN_C,
} from '../config';
import { type ClimateFields } from './shape';

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

/** Precipitation in mm/year at a block: humidity field modified by orographic lift.
 * Steeper columns (higher detail amplitude) get more precipitation. */
export function blockPrecipitation(fields: ClimateFields, detailAmpM: number): number {
  const baseMm = fieldRange(fields.humidity, PRECIPITATION_MIN_MM, PRECIPITATION_MAX_MM);
  const lift = 1 + OROGRAPHIC_LIFT * detailAmpM / 22; // amplitude / max amplitude (22 m)
  return baseMm * lift;
}
