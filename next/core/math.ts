/** Floor division that works for negative numbers: floorDiv(-1, 16) === -1. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Always-positive modulo: mod(-1, 16) === 15. */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
