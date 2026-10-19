import { MOON_CYCLES_PER_YEAR } from '../config';

/** Four lunar cycles per game year: phase 0 is new, 0.5 is full. Derived from the saved year clock. */
export function moonPhaseAt(timeOfYear: number): number {
  return ((timeOfYear * MOON_CYCLES_PER_YEAR) % 1 + 1) % 1;
}

/** Fraction of the disc illuminated, independent of waxing/waning direction. */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}
