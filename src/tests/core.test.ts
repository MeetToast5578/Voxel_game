import { describe, expect, it } from 'vitest';
import * as config from '../config';
import { chunkKey, columnKey, columnOfChunk, localIndex, toChunk, toLocal, unpackChunkKey, CHUNK_Y_MAX, CHUNK_Y_MIN } from '../core/coords';
import { IntQueue } from '../core/queue';

describe('config', () => {
  it('uses 0.6 m cells in 16-cell chunks', () => {
    expect(config.BLOCK_SIZE_M).toBe(0.6);
    expect(config.CHUNK_SIZE).toBe(16);
    expect(config.CHUNK_M).toBeCloseTo(9.6);
    expect(config.cells(1.75)).toBe(3);
    expect(config.cells(0.1)).toBe(1);
  });

  it('derives every _CELLS value from its _M value', () => {
    const values = config as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(values)) {
      if (!name.endsWith('_CELLS')) continue;
      const meters = values[name.replace(/_CELLS$/, '_M')];
      expect(typeof meters, `${name} needs a matching _M value`).toBe('number');
      expect(value, name).toBe(config.cells(meters as number));
    }
  });
});

describe('coords', () => {
  it('packs and unpacks chunk keys across the whole range', () => {
    const cases = [[0, 0, 0], [-1, -1, -1], [5, -3, 7], [(1 << 20) - 1, CHUNK_Y_MAX, -(1 << 20)], [-(1 << 20), CHUNK_Y_MIN, (1 << 20) - 1]];
    const keys = new Set<number>();
    for (const [x, y, z] of cases) {
      const key = chunkKey(x!, y!, z!);
      expect(Number.isSafeInteger(key)).toBe(true);
      expect(unpackChunkKey(key)).toEqual([x, y, z]);
      expect(columnOfChunk(key)).toBe(columnKey(x!, z!));
      keys.add(key);
    }
    expect(keys.size).toBe(cases.length);
  });

  it('gives neighbours distinct keys', () => {
    const keys = new Set<number>();
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) keys.add(chunkKey(x, y, z));
    expect(keys.size).toBe(125);
  });

  it('splits negative cells into chunk and local parts', () => {
    expect(toChunk(-1)).toBe(-1);
    expect(toLocal(-1)).toBe(15);
    expect(toChunk(16)).toBe(1);
    expect(toLocal(16)).toBe(0);
    expect(localIndex(1, 2, 3)).toBe((2 * 16 + 3) * 16 + 1);
  });
});

describe('IntQueue', () => {
  it('keeps FIFO order while growing past its capacity', () => {
    const q = new IntQueue(4);
    q.push(1);
    q.push(2);
    expect(q.shift()).toBe(1);
    for (let i = 3; i < 100; i++) q.push(i);
    const out: number[] = [];
    while (q.length > 0) out.push(q.shift());
    expect(out).toEqual(Array.from({ length: 98 }, (_, i) => i + 2));
    expect(() => q.shift()).toThrow();
  });
});
