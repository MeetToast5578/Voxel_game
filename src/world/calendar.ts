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

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** How far the year has turned foliage, each 0..1 (T-F7). Spring starts at 0; see seasonName. */
export interface FoliageSeason {
  /** Deciduous leaves turn orange and red: from early autumn until they have fallen. */
  autumn: number;
  /** Deciduous leaves have fallen: from mid autumn, through winter, until they bud again at the end of winter. */
  bare: number;
  /** High summer: dry grass browns. */
  summer: number;
}

export function foliageSeason(timeOfYear: number): FoliageSeason {
  const t = ((timeOfYear % 1) + 1) % 1;
  return {
    autumn: smoothstep(0.5, 0.6, t) * (1 - smoothstep(0.9, 0.95, t)),
    bare: smoothstep(0.62, 0.75, t) * (1 - smoothstep(0.95, 1, t)),
    summer: smoothstep(0.25, 0.33, t) * (1 - smoothstep(0.45, 0.55, t)),
  };
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
