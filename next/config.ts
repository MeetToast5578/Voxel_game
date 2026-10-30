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
