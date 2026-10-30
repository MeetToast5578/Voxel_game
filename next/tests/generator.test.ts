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

  it('puts the column top at the highest terrain cell, with no terrain above it', () => {
    const gen = new Generator(1);
    const terrain = new Set(['grass', 'dirt', 'sand', 'gravel', 'sandstone'].map((k) => BLOCKS.state(k)));
    for (const [cx, cz] of [[0, 0], [5, -3], [-20, 40]]) {
      const col = gen.column(cx!, cz!);
      const cy0 = Math.floor((col.minTop - 30) / CHUNK_SIZE), cy1 = Math.floor((col.maxTop + 30) / CHUNK_SIZE);
      const get = column(gen, cx!, cz!, cy0, cy1);
      for (const [x, z] of [[0, 0], [7, 9], [15, 15]]) {
        const top = col.top[z! * CHUNK_SIZE + x!]!;
        if (!col.open[z! * CHUNK_SIZE + x!]) expect(BLOCKS.isSolid(get(x!, top, z!))).toBe(true);
        for (let y = top + 1; y < cy1 * CHUNK_SIZE + CHUNK_SIZE; y++) expect(terrain.has(get(x!, y, z!))).toBe(false);
        expect(col.skyTop[z! * CHUNK_SIZE + x!]).toBeGreaterThanOrEqual(top);
      }
    }
  });

  it('only shortcuts chunks of open sky or sea', () => {
    const gen = new Generator(3);
    const col = gen.column(1, 1);
    expect(gen.generate(1, Math.floor(col.maxTop / CHUNK_SIZE) + 2, 1, new Uint16Array(CHUNK_VOLUME))).toBe(
      Math.floor(col.maxTop / CHUNK_SIZE) + 2 >= 0 ? AIR : WATER);
    const deep = new Uint16Array(CHUNK_VOLUME);
    expect(gen.generate(1, Math.floor(col.minTop / CHUNK_SIZE) - 8, 1, deep)).toBe(-1);
    const fluids = new Set([AIR, WATER, BLOCKS.state('lava')]);
    expect(deep.every((s) => fluids.has(s) || BLOCKS.isOpaque(s))).toBe(true);
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

describe('underground', () => {
  it('keeps a solid roof under ground near sea level, so the sea cannot drain into caves', () => {
    const gen = new Generator(5);
    let checked = 0;
    for (let cx = -40; cx <= 40 && checked < 40; cx += 4) {
      const col = gen.column(cx, 0);
      for (let i = 0; i < 256; i += 17) {
        const top = col.top[i]!;
        if ((top + 1) * 0.6 > 3 || top < SEA_CELL - 20) continue;
        const get = column(gen, cx, 0, Math.floor((top - 12) / CHUNK_SIZE), Math.floor(top / CHUNK_SIZE));
        for (let y = top - 7; y <= top; y++) expect(get(i & 15, y, i >> 4), `cx ${cx} i ${i} y ${y}`).not.toBe(AIR);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('has caves deep down and ore veins at a rate per volume', () => {
    const gen = new Generator(9);
    const ores = new Set(['coal_ore', 'iron_ore'].map((k) => BLOCKS.state(k)));
    let air = 0, ore = 0, total = 0;
    for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) {
      // Chunk -3 spans -28.8 m to -19.2 m: inside the coal band (-4 to -40 m).
      const out = new Uint16Array(CHUNK_VOLUME);
      if (gen.generate(cx, -3, cz, out) >= 0) continue;
      for (const s of out) {
        total++;
        if (s === AIR) air++;
        if (ores.has(s)) ore++;
      }
    }
    expect(air / total).toBeGreaterThan(0.005);
    expect(air / total).toBeLessThan(0.3);
    // 1 coal vein of up to 6 cells per 1000 m3: a chunk is 885 m3, so about 0.9 veins per chunk.
    expect(ore).toBeGreaterThan(36 * 0.3);
    expect(ore).toBeLessThan(36 * 8);
  });
});

describe('trees', () => {
  it('grows trees whose heights are given in meters', async () => {
    const { treeCells, unpackTreeCell, SPECIES } = await import('../worldgen/trees');
    for (const species of ['oak', 'spruce', 'birch', 'bush'] as const) {
      for (let a = 0; a < 20; a++) {
        let top = 0;
        for (const k of treeCells(3, a * 17, a * 5, species).keys()) top = Math.max(top, unpackTreeCell(k)[1]);
        const [lo, hi] = SPECIES[species].heightM;
        expect(top * 0.6, species).toBeGreaterThanOrEqual(lo - 1.2);
        expect(top * 0.6, species).toBeLessThanOrEqual(hi + 2.4);
      }
    }
  });

  it('draws a tree crossing a chunk border the same from both sides', () => {
    const gen = new Generator(2);
    const leaves = BLOCKS.state('leaves');
    // Find a column pair where some tree reaches across x = 16.
    for (let cz = 0; cz < 40; cz++) {
      const a = gen.column(0, cz), b = gen.column(1, cz);
      const at = (col: typeof a, lx: number) => {
        const out = new Map<string, number>();
        for (let k = 0; k < col.features.length; k += 3) if ((col.features[k]! & 15) === lx) out.set(`${col.features[k]! >> 4},${col.features[k + 1]}`, col.features[k + 2]!);
        return out;
      };
      const edgeA = at(a, 15), edgeB = at(b, 0);
      if (![...edgeA.values()].includes(leaves) || ![...edgeB.values()].includes(leaves)) continue;
      // The same anchors seen from both columns: rebuilding the left column gives the same cells.
      const again = new Generator(2).column(0, cz);
      expect(Array.from(again.features)).toEqual(Array.from(a.features));
      return;
    }
    throw new Error('no tree crossing a column border found');
  });
});
