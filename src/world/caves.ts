import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import {
  BLOCK_SIZE_M,
  CAVE_CHEESE_FADE,
  CAVE_CHEESE_OPENING,
  CAVE_CHEESE_SCALE_H_M,
  CAVE_CHEESE_SCALE_V_M,
  CAVE_CHEESE_THRESHOLD,
  CAVE_NOODLE_ROOF,
  CAVE_NOODLE_SCALE_H_M,
  CAVE_NOODLE_SCALE_V_M,
  CAVE_NOODLE_STRETCH,
  CAVE_NOODLE_THRESHOLD,
  CAVE_SCALE_H_M,
  CAVE_SCALE_V_M,
  CAVE_THRESHOLD,
  RAVINE_BAND,
  RAVINE_DEPTH_M,
  RAVINE_ROOF,
  RAVINE_SCALE_M,
} from '../config';
import { mulberry32 } from '../core/random';

/** The four cave systems. Reported by `caveKind`, so tests and tools can tell them apart. */
export type CaveKind = 'cheese' | 'noodle' | 'spaghetti' | 'ravine';

/**
 * The noise fields behind the cave systems. Created once per generator: every field is seeded from the world seed,
 * so the caves are deterministic and a chunk is a pure function of its position.
 */
export interface CaveNoises {
  readonly cheese: NoiseFunction3D;
  readonly noodleA: NoiseFunction3D;
  readonly noodleB: NoiseFunction3D;
  readonly spaghettiA: NoiseFunction3D;
  readonly spaghettiB: NoiseFunction3D;
  /** A 2D field: its zero set is the winding line a ravine follows. */
  readonly ravine: NoiseFunction2D;
}

/** Seed offsets, so the cave fields do not correlate with each other or with the terrain fields. */
const CHEESE_SEED = 500;
const NOODLE_SEED_A = 501;
const NOODLE_SEED_B = 502;
const SPAGHETTI_SEED_A = 3;
const SPAGHETTI_SEED_B = 4;
const RAVINE_SEED = 503;

export function createCaveNoises(seed: number): CaveNoises {
  const noise = (offset: number): NoiseFunction3D => createNoise3D(mulberry32(seed + offset));
  return {
    cheese: noise(CHEESE_SEED),
    noodleA: noise(NOODLE_SEED_A),
    noodleB: noise(NOODLE_SEED_B),
    spaghettiA: noise(SPAGHETTI_SEED_A),
    spaghettiB: noise(SPAGHETTI_SEED_B),
    ravine: createNoise2D(mulberry32(seed + RAVINE_SEED)),
  };
}

const RAVINE_DEPTH_BLOCKS = Math.round(RAVINE_DEPTH_M / BLOCK_SIZE_M);
/** How much harder a cavern has to work to reach the surface: a cave mouth is rare, not the rule. */
const CHEESE_SURFACE_PUSH = CAVE_CHEESE_OPENING - CAVE_CHEESE_THRESHOLD;

/**
 * Which cave system carves the cell at (wx, y, wz), or null when the cell stays solid.
 *
 * `surfaceBlocks` is the y of the highest solid block in the column. Cave systems keep a roof of solid rock below it,
 * and the cheese caverns fade out as they approach that roof, so a surface never turns into a sieve. Callers still
 * decide how far down carving is allowed at all (shore roofs, river and lake beds, the bottom of the world).
 *
 * Order matters for speed: the cheap depth tests come first, then one sample per system with an early exit between the
 * two halves of each noise pair. In a typical underground block the function evaluates four noise samples.
 */
export function caveKind(noises: CaveNoises, wx: number, y: number, wz: number, surfaceBlocks: number): CaveKind | null {
  const cover = surfaceBlocks - y; // blocks of rock between this cell and the surface
  if (cover < 0) return null; // never above the surface
  const xM = wx * BLOCK_SIZE_M;
  const yM = y * BLOCK_SIZE_M;
  const zM = wz * BLOCK_SIZE_M;

  // Large caverns. The threshold rises near the surface, so a cavern shrinks instead of opening the sky; only the
  // strongest field breaks through, and that is what makes a cave mouth.
  const cheese = noises.cheese(xM / CAVE_CHEESE_SCALE_H_M, yM / CAVE_CHEESE_SCALE_V_M, zM / CAVE_CHEESE_SCALE_H_M);
  const fade = cover >= CAVE_CHEESE_FADE ? 0 : CHEESE_SURFACE_PUSH * (1 - cover / CAVE_CHEESE_FADE);
  if (cheese > CAVE_CHEESE_THRESHOLD + fade) return 'cheese';
  if (cover < CAVE_NOODLE_ROOF) return null; // only the cheese field may come this close to the surface

  // Thin tunnels that run mostly horizontally: the vertical scale is stretched, so a tube is wider than it is tall.
  const noodleA = noises.noodleA(xM / CAVE_NOODLE_SCALE_H_M, yM / (CAVE_NOODLE_SCALE_V_M * CAVE_NOODLE_STRETCH), zM / CAVE_NOODLE_SCALE_H_M);
  if (noodleA * noodleA < CAVE_NOODLE_THRESHOLD) {
    const noodleB = noises.noodleB(
      xM / CAVE_NOODLE_SCALE_H_M + 7.3,
      yM / (CAVE_NOODLE_SCALE_V_M * CAVE_NOODLE_STRETCH) + 3.1,
      zM / CAVE_NOODLE_SCALE_H_M + 11.7,
    );
    if (noodleA * noodleA + noodleB * noodleB < CAVE_NOODLE_THRESHOLD) return 'noodle';
  }

  // Spaghetti: medium winding tubes where two independent fields are both near zero (unchanged from spec 5).
  const x = xM / CAVE_SCALE_H_M;
  const yy = yM / CAVE_SCALE_V_M;
  const z = zM / CAVE_SCALE_H_M;
  const a = noises.spaghettiA(x, yy, z);
  if (a * a < CAVE_THRESHOLD) {
    const b = noises.spaghettiB(x, yy, z);
    if (a * a + b * b < CAVE_THRESHOLD) return 'spaghetti';
  }

  // Ravines: wide, deep canyons along the zero set of a 2D field, tapering with depth and widest under the roof.
  const belowRoof = cover - RAVINE_ROOF;
  if (belowRoof >= 0 && belowRoof < RAVINE_DEPTH_BLOCKS) {
    const width = RAVINE_BAND * (1 - belowRoof / RAVINE_DEPTH_BLOCKS);
    if (Math.abs(noises.ravine(xM / RAVINE_SCALE_M, zM / RAVINE_SCALE_M)) < width) return 'ravine';
  }
  return null;
}

/** True when any cave system carves the cell. Hot path for the generator. */
export function isCaveBlock(noises: CaveNoises, wx: number, y: number, wz: number, surfaceBlocks: number): boolean {
  return caveKind(noises, wx, y, wz, surfaceBlocks) !== null;
}
