import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';

const STONE = BLOCKS.state('stone');

describe('Chunk', () => {
  it('stays uniform until a different state is set', () => {
    const c = new Chunk(0, 0, 0, STONE);
    expect(c.uniform).toBe(true);
    expect(c.get(123)).toBe(STONE);
    expect(c.set(5, STONE)).toBe(false);
    expect(c.set(5, 0)).toBe(true);
    expect(c.uniform).toBe(false);
    expect(c.get(5)).toBe(0);
    expect(c.get(6)).toBe(STONE);
  });

  it('grows past 256 states into a 16-bit index and round-trips', () => {
    const c = new Chunk(0, 0, 0);
    const expected = new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < 400; i++) {
      // Raw state numbers: the chunk does not interpret them.
      c.set(i * 7, 1000 + i);
      expected[i * 7] = 1000 + i;
    }
    expect(c.paletteSize).toBe(401);
    const out = new Uint16Array(CHUNK_VOLUME);
    c.copyTo(out);
    expect(out).toEqual(expected);
  });

  it('compacts unused palette entries back to a uniform chunk', () => {
    const c = new Chunk(0, 0, 0);
    c.set(1, STONE);
    c.set(1, 0);
    expect(c.paletteSize).toBe(2);
    c.compact();
    expect(c.paletteSize).toBe(1);
    expect(c.uniform).toBe(true);
  });

  it('reuses freed palette slots instead of overflowing 8 bits', () => {
    const c = new Chunk(0, 0, 0);
    for (let i = 1; i <= 600; i++) c.set(0, i);
    expect(c.get(0)).toBe(600);
    expect(c.byteSize).toBeLessThan(CHUNK_VOLUME * 2);
  });

  it('stores light as nibbles and only allocates when it varies', () => {
    const c = new Chunk(0, 0, 0, 0, 15);
    expect(c.skyLight(10)).toBe(15);
    expect(c.byteSize).toBeLessThan(64);
    c.setLight(10, 3, 12);
    expect(c.skyLight(10)).toBe(3);
    expect(c.blockLight(10)).toBe(12);
    expect(c.skyLight(11)).toBe(15);
    const bytes = new Uint8Array(CHUNK_VOLUME).fill(0x20);
    c.loadLight(bytes);
    expect(c.lightByte(0)).toBe(0x20);
    expect(c.byteSize).toBeLessThan(64);
  });

  it('bumps its version on every real change', () => {
    const c = new Chunk(0, 0, 0);
    const v = c.version;
    c.set(0, 0);
    expect(c.version).toBe(v);
    c.set(0, STONE);
    c.setLight(0, 1, 1);
    expect(c.version).toBe(v + 2);
  });
});

describe('World', () => {
  it('reads and writes across negative chunk borders', () => {
    const w = new World();
    for (const [x, y, z] of [[-1, -1, -1], [0, -1, -1], [-1, 0, 0]]) w.add(new Chunk(x!, y!, z!));
    expect(w.set(-1, -1, -1, STONE)).toBe(true);
    expect(w.get(-1, -1, -1)).toBe(STONE);
    expect(w.chunk(-1, -1, -1)!.get(15 * 256 + 15 * 16 + 15)).toBe(STONE);
    expect(w.set(0, -16, -1, STONE)).toBe(true);
    expect(w.chunk(0, -1, -1)!.modified).toBe(true);
    expect(w.set(100, 100, 100, STONE)).toBe(false);
    expect(w.get(100, 100, 100)).toBe(0);
  });

  it('reports changes with the previous state', () => {
    const w = new World();
    w.add(new Chunk(0, 0, 0));
    const seen: number[][] = [];
    w.onChange = (x, y, z, prev) => seen.push([x, y, z, prev]);
    w.set(1, 2, 3, STONE);
    w.set(1, 2, 3, STONE);
    w.set(1, 2, 3, 0);
    expect(seen).toEqual([[1, 2, 3, 0], [1, 2, 3, STONE]]);
  });

  it('keeps a column record while any chunk of it is loaded', () => {
    const w = new World();
    w.add(new Chunk(2, 0, 3));
    w.add(new Chunk(2, 1, 3));
    w.add(new Chunk(2, 1, 3));
    expect(w.column(2, 3)!.chunkCount).toBe(2);
    w.remove(2, 0, 3);
    expect(w.column(2, 3)).toBeDefined();
    w.remove(2, 1, 3);
    expect(w.column(2, 3)).toBeUndefined();
    expect(w.remove(2, 1, 3)).toBeUndefined();
  });
});
