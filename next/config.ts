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
