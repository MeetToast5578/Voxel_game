/**
 * Every tunable number of the new engine. Lengths are meters, times seconds, speeds m/s.
 * A count of cells is never written by hand: it is an `_CELLS` value derived from its `_M` value with `cells()`.
 * Shape fractions (a slab is half a cell) are fractions of a cell, not lengths, and live with the shapes.
 */

export const BLOCK_SIZE_M = 0.6;

/** A length in meters as a (fractional) number of cells. Speeds and accelerations convert the same way. */
export function toCells(meters: number): number {
  return meters / BLOCK_SIZE_M;
}

/** A length in meters as a whole number of cells, at least 1. */
export function cells(meters: number): number {
  return Math.max(1, Math.round(meters / BLOCK_SIZE_M));
}

// ---- Chunks ----
/** Cells along each axis of a cubic chunk. A power of two: coordinate math uses shifts. */
export const CHUNK_SHIFT = 4;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_SIZE;
export const CHUNK_M = CHUNK_SIZE * BLOCK_SIZE_M;

// ---- Light ----
/** Light levels 0..MAX_LIGHT, falling by one per cell. A torch at 15 reaches 9 m. */
export const MAX_LIGHT = 15;

// ---- Terrain ----
/** Water fills open cells below this height. */
export const SEA_LEVEL_M = 0;
/** Dirt (or sand on beaches) between the surface and the stone. */
export const SOIL_DEPTH_M = 1.8;
/** Land this close above sea level is beach sand. */
export const BEACH_BAND_M = 1;
/** Sea floor deeper than this below sea level is gravel instead of sand. */
export const DEEP_SEA_FLOOR_M = 4;
/** Feature size of the 3D terrain detail noise. */
export const DETAIL_H_M = 16;
export const DETAIL_V_M = 10;

// ---- Streaming ----
/** Default horizontal view radius, in chunks (12 chunks is 115 m). */
export const DEFAULT_VIEW_CHUNKS = 12;
export const MIN_VIEW_CHUNKS = 4;
export const MAX_VIEW_CHUNKS = 32;
/** Around the player, every chunk this many chunks across and up/down is loaded, surface or not. */
export const NEAR_RADIUS_CHUNKS = 3;
export const NEAR_HEIGHT_CHUNKS = 2;
/** Generated columns kept in each worker's cache. */
export const COLUMN_CACHE = 4096;
/** Jobs each worker may have in flight. */
export const JOBS_PER_WORKER = 4;

// ---- Camera ----
export const FLY_SPEED_M_S = 12;
export const FLY_FAST_FACTOR = 4;
export const EYE_HEIGHT_M = 1.62;

// ---- Time ----
/** Seconds in one full day and night. */
export const DAY_LENGTH_S = 1200;
/** Sky light multiplier at midnight (moonlight). */
export const NIGHT_DAYLIGHT = 0.22;

// ---- Player ----
/** Half the body's width: a little under half a cell, so the player fits one-cell gaps. */
export const PLAYER_HALF_WIDTH_M = 0.28;
export const PLAYER_HEIGHT_M = 1.75;
export const WALK_SPEED_M_S = 4.3;
export const SPRINT_SPEED_M_S = 6;
export const GRAVITY_M_S2 = 28;
/** Jump height is about 1.35 m. */
export const JUMP_SPEED_M_S = 8.7;
export const TERMINAL_SPEED_M_S = 50;
/** How quickly velocity reaches the target speed, per second, on the ground and in the air. */
export const GROUND_ACCEL = 20;
export const AIR_ACCEL = 5;
/** Highest ledge the player walks up onto (and down from) without jumping. */
export const STEP_HEIGHT_M = 0.6;
/** Seconds the camera takes to catch up after a step. */
export const STEP_SMOOTH_S = 0.12;
export const REACH_M = 6;
/** Holding a mouse button repeats breaking or placing this often. */
export const REPEAT_S = 0.25;
export const MOUSE_SENSITIVITY = 0.0025;

// ---- Swimming: buoyancy and quadratic drag ----
export const WATER_DENSITY = 1000;
/** The body floats with about 80% under water. */
export const PLAYER_DENSITY = 800;
/** Quadratic drag in water, a = -k |v| v, in 1/m. */
export const WATER_DRAG_PER_M = 0.9;
export const SWIM_THRUST_M_S2 = 6;
export const SWIM_UP_M_S2 = 6;

// ---- Saving ----
export const AUTOSAVE_S = 30;

// ---- Simulation ----
/** Block updates (fluids, falling blocks, plants) run at this rate. */
export const SIM_HZ = 20;
/** How fast fluids spread, one cell per (cell size / speed) seconds. */
export const WATER_FLOW_M_S = 3;
export const LAVA_FLOW_M_S = 0.5;
/** Seconds a sand or gravel cell waits before dropping one cell. */
export const FALL_DELAY_S = 0.05;
/** Random updates per loaded chunk per simulation tick (grass, leaves), within the simulation distance. */
export const RANDOM_TICKS_PER_CHUNK = 3;
/** Chunks this far from the player (horizontally) are simulated. Independent of the view distance. */
export const SIM_RADIUS_CHUNKS = 6;
/** Most scheduled updates handled per simulation tick; the rest wait for the next. */
export const MAX_TICKS_PER_STEP = 4000;
/** Leaves farther than this from a log decay. */
export const LEAF_REACH_M = 2.4;
/** Grass spreads onto dirt whose cell above has at least this much light. */
export const GRASS_MIN_LIGHT = 9;
