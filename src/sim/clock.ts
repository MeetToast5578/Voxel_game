import { DAY_LENGTH_S, DAYS_PER_SEASON, MOON_CYCLES_PER_YEAR, SUN_NOON_SUMMER_RAD, SUN_NOON_WINTER_RAD } from '../config';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Time of day (0 is midnight, 0.5 noon) and of year (0 is the spring equinox), both in [0, 1). */
export class Clock {
  constructor(public dayTime = 0.35, public yearTime = 0) {}

  advance(seconds: number): void {
    this.dayTime += seconds / DAY_LENGTH_S;
    const days = Math.floor(this.dayTime);
    this.dayTime -= days;
    this.yearTime = (this.yearTime + days / (4 * DAYS_PER_SEASON) + 1) % 1;
  }

  get season(): Season {
    return SEASONS[Math.floor(this.yearTime * 4) % 4]!;
  }

  /** Day of the season, from 1. */
  get day(): number {
    return (Math.floor(this.yearTime * 4 * DAYS_PER_SEASON) % DAYS_PER_SEASON) + 1;
  }

  /** 0 is a new moon, 0.5 full. */
  get moonPhase(): number {
    return (this.yearTime * MOON_CYCLES_PER_YEAR + this.dayTime / (4 * DAYS_PER_SEASON / MOON_CYCLES_PER_YEAR)) % 1;
  }

  /**
   * Unit vector towards the sun: it rises in the east (+x), sets in the west, and stands higher at noon in summer.
   * The moon is opposite.
   */
  sunDirection(out: [number, number, number] = [0, 0, 0]): [number, number, number] {
    const angle = (this.dayTime - 0.25) * Math.PI * 2; // 0 at sunrise, pi/2 at noon
    const summer = (Math.sin(this.yearTime * Math.PI * 2) + 1) / 2;
    const tilt = Math.PI / 2 - (SUN_NOON_WINTER_RAD + (SUN_NOON_SUMMER_RAD - SUN_NOON_WINTER_RAD) * summer);
    const x = Math.cos(angle), up = Math.sin(angle);
    out[0] = x;
    out[1] = up * Math.cos(tilt);
    out[2] = up * Math.sin(tilt);
    return out;
  }

  /** How far the year has turned the leaves (each 0..1): autumn colour, and summer's dry grass. */
  foliage(): { autumn: number; summer: number } {
    const t = this.yearTime;
    return {
      autumn: smooth(0.5, 0.6, t) * (1 - smooth(0.9, 0.97, t)),
      summer: smooth(0.25, 0.33, t) * (1 - smooth(0.45, 0.55, t)),
    };
  }
}
