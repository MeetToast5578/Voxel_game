import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Generator, SEA_CELL } from '../worldgen/generator';

const AIR = BLOCKS.state('air'), WATER = BLOCKS.state('water');
const at = (out: Uint16Array, x: number, y: number, z: number) => out[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x]!;

/** The whole column (cx, cz) between two chunk heights, as states by world y. */
function column(gen: Generator, cx: number, cz: number, cy0: number, cy1: number) {
  const chunks = new Map<number, Uint16Array>();
  for (let cy = cy0; cy <= cy1; cy++) {
    const out = new Uint16Array(CHUNK_VOLUME);
    const u = gen.generate(cx, cy, cz, out);
    if (u >= 0) out.fill(u);
    chunks.set(cy, out);
  }
  return (x: number, y: number, z: number) => at(chunks.get(Math.floor(y / CHUNK_SIZE))!, x, ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, z);
}

describe('generator', () => {
  it('is deterministic per seed', () => {
    const a = new Uint16Array(CHUNK_VOLUME), b = new Uint16Array(CHUNK_VOLUME);
    new Generator(7).generate(3, 0, -2, a);
    new Generator(7).generate(3, 0, -2, b);
    expect(a).toEqual(b);
  });

  it('puts the column top at the highest solid cell, with open sky or water above it', () => {
    const gen = new Generator(1);
    for (const [cx, cz] of [[0, 0], [5, -3], [-20, 40]]) {
      const col = gen.column(cx!, cz!);
      const cy0 = Math.floor((col.minTop - 30) / CHUNK_SIZE), cy1 = Math.floor((col.maxTop + 30) / CHUNK_SIZE);
      const get = column(gen, cx!, cz!, cy0, cy1);
      for (const [x, z] of [[0, 0], [7, 9], [15, 15]]) {
        const top = col.top[z! * CHUNK_SIZE + x!]!;
        expect(BLOCKS.isSolid(get(x!, top, z!))).toBe(true);
        for (let y = top + 1; y < cy1 * CHUNK_SIZE + CHUNK_SIZE; y++) expect([AIR, WATER]).toContain(get(x!, y, z!));
      }
    }
  });

  it('agrees between its uniform shortcuts and the full fill', () => {
    const gen = new Generator(3);
    const col = gen.column(1, 1);
    const above = new Uint16Array(CHUNK_VOLUME);
    expect(gen.generate(1, Math.floor(col.maxTop / CHUNK_SIZE) + 2, 1, above)).toBe(SEA_CELL > col.maxTop + 40 ? WATER : AIR);
    const deep = new Uint16Array(CHUNK_VOLUME);
    expect(gen.generate(1, Math.floor(col.minTop / CHUNK_SIZE) - 8, 1, deep)).toBe(BLOCKS.state('stone'));
  });

  it('fills open cells below sea level with water', () => {
    const gen = new Generator(1);
    // Find an ocean column nearby: the continental field is large, so search in steps.
    for (let cx = -400; cx <= 400; cx += 40) {
      const col = gen.column(cx, 0);
      if (col.maxTop >= SEA_CELL - 2) continue;
      const out = new Uint16Array(CHUNK_VOLUME);
      const cy = Math.floor((SEA_CELL - 1) / CHUNK_SIZE);
      const u = gen.generate(cx, cy, 0, out);
      if (u >= 0) out.fill(u);
      expect(at(out, 0, SEA_CELL - 1 - cy * CHUNK_SIZE, 0)).toBe(WATER);
      return;
    }
    throw new Error('no ocean column found');
  });
});
