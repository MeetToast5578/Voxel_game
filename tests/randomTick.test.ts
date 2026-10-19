import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, RANDOM_TICKS_PER_CHUNK } from '../src/config';
import { forEachRandomCell, mixSeed } from '../src/world/randomTick';

/** Collect the world cells a chunk draws at a tick. */
function cells(seed: number, tick: number, cx: number, cy: number, cz: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  forEachRandomCell(seed, tick, cx, cy, cz, RANDOM_TICKS_PER_CHUNK, (wx, wy, wz) => out.push([wx, wy, wz]));
  return out;
}

describe('random ticks', () => {
  it('draws RANDOM_TICKS_PER_CHUNK cells inside the chunk', () => {
    const out = cells(7, 1, 2, -1, 3);
    expect(out).toHaveLength(RANDOM_TICKS_PER_CHUNK);
    for (const [wx, wy, wz] of out) {
      expect(wx).toBeGreaterThanOrEqual(2 * CHUNK_SIZE);
      expect(wx).toBeLessThan((2 + 1) * CHUNK_SIZE);
      expect(wy).toBeGreaterThanOrEqual(-1 * CHUNK_SIZE);
      expect(wy).toBeLessThan(0);
      expect(wz).toBeGreaterThanOrEqual(3 * CHUNK_SIZE);
      expect(wz).toBeLessThan(4 * CHUNK_SIZE);
    }
  });

  it('is deterministic for a given seed, tick and chunk', () => {
    expect(cells(42, 5, 0, 0, 0)).toEqual(cells(42, 5, 0, 0, 0));
  });

  it('changes with the tick, the seed and the chunk', () => {
    const base = cells(42, 5, 0, 0, 0);
    expect(cells(42, 6, 0, 0, 0)).not.toEqual(base);
    expect(cells(43, 5, 0, 0, 0)).not.toEqual(base);
    expect(cells(42, 5, 1, 0, 0)).not.toEqual(base);
    expect(cells(42, 5, 0, 1, 0)).not.toEqual(base);
    expect(cells(42, 5, 0, 0, 1)).not.toEqual(base);
  });

  it('mixSeed is stable and order-sensitive', () => {
    expect(mixSeed(1, 2, 3, 4, 5)).toBe(mixSeed(1, 2, 3, 4, 5));
    expect(mixSeed(1, 2, 3, 4, 5)).not.toBe(mixSeed(5, 4, 3, 2, 1));
    expect(mixSeed(1, 2, 3, 4, 5)).toBeGreaterThanOrEqual(0);
    expect(mixSeed(1, 2, 3, 4, 5)).toBeLessThan(2 ** 32);
  });

  it('handles negative chunk coordinates (no cell escapes the chunk)', () => {
    for (const cz of [-3, -1, 0, 4]) {
      for (const [wx, , wz] of cells(99, 8, -2, 0, cz)) {
        expect(wx).toBeGreaterThanOrEqual(-2 * CHUNK_SIZE);
        expect(wx).toBeLessThan(-1 * CHUNK_SIZE);
        expect(wz).toBeGreaterThanOrEqual(cz * CHUNK_SIZE);
        expect(wz).toBeLessThan((cz + 1) * CHUNK_SIZE);
      }
    }
  });
});
