import { MIN_DAYLIGHT, NIGHT_SKY_COLOR, SKY_COLOR } from '../config';
import { clamp } from '../core/math';

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Brightness of sky light at time of day t (0..1, wraps).
 * 0 = sunrise, 0.25 = noon (1.0), 0.5 = sunset, 0.75 = midnight (MIN_DAYLIGHT).
 */
export function daylightAt(t: number): number {
  const sun = Math.sin(2 * Math.PI * t);
  return MIN_DAYLIGHT + (1 - MIN_DAYLIGHT) * smoothstep(-0.15, 0.25, sun);
}

/** Linear blend of two 0xRRGGBB colors. */
export function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, shift: number) => (c >> shift) & 0xff;
  const mix = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function skyColorAt(t: number): number {
  return lerpColor(NIGHT_SKY_COLOR, SKY_COLOR, (daylightAt(t) - MIN_DAYLIGHT) / (1 - MIN_DAYLIGHT));
}
