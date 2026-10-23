import { clamp } from '../core/math';
import { DAY_LENGTH_S } from '../config';

/** The four seasons, in order through the year. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Axial tilt of the world, in degrees. Drives day length and solar declination. */
export const AXIAL_TILT_DEG = 23.5;

/** Which season a time-of-year falls into. 0..1 wraps; 0 = spring equinox. */
export function seasonName(timeOfYear: number): Season {
  const q = Math.floor(timeOfYear * 4) % 4;
  return SEASONS[q]!;
}

/** 1-based day within the current season. */
export function dayOfSeason(timeOfYear: number, daysPerSeason: number): number {
  const dayInYear = Math.floor(timeOfYear * 4 * daysPerSeason);
  return (dayInYear % daysPerSeason) + 1;
}

/** Solar declination in degrees: 0 at equinoxes, +23.5° at summer solstice, -23.5° at winter solstice. */
export function solarDeclination(timeOfYear: number): number {
  return AXIAL_TILT_DEG * Math.sin(2 * Math.PI * timeOfYear);
}

/** Day length in minutes for a latitude and solar declination. Handles polar day/night by clamping. */
export function dayLengthMinutes(latitudeDeg: number, declinationDeg: number): number {
  const lat = (latitudeDeg * Math.PI) / 180;
  const dec = (declinationDeg * Math.PI) / 180;
  const val = -Math.tan(lat) * Math.tan(dec);
  const clamped = clamp(val, -1, 1);
  const hourAngle = Math.acos(clamped);
  const hours = (2 * hourAngle) / (Math.PI / 12);
  return hours * 60;
}

/** A year clock: timeOfYear advances independently of timeOfDay. */
export class Calendar {
  timeOfYear = 0;
  readonly daysPerSeason: number;
  readonly latitudeDeg: number;

  constructor(daysPerSeason: number, latitudeDeg: number) {
    this.daysPerSeason = daysPerSeason;
    this.latitudeDeg = latitudeDeg;
  }

  get season(): Season { return seasonName(this.timeOfYear); }
  get day(): number { return dayOfSeason(this.timeOfYear, this.daysPerSeason); }
  get declination(): number { return solarDeclination(this.timeOfYear); }
  get dayLengthMin(): number { return dayLengthMinutes(this.latitudeDeg, this.declination); }

  advance(seconds: number): void {
    const daysPerYear = 4 * this.daysPerSeason;
    const secondsPerYear = DAY_LENGTH_S * daysPerYear;
    this.timeOfYear = ((this.timeOfYear + seconds / secondsPerYear) % 1 + 1) % 1;
  }
}
