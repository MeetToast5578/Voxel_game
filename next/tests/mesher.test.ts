import { describe, expect, it } from 'vitest';
import { CHUNK_AREA } from '../config';
import { BLOCKS } from '../engine/blocks';
import { buildMesh, decodeVertex, LAYERS, PAD_VOLUME, padIndex } from '../engine/mesher';
import { TILE_NAMES, hasPainter, tileIndex } from '../render/tilePixels';

const S = (key: string, v = 0) => BLOCKS.state(key, v);

function input(fill: (x: number, y: number, z: number) => number) {
  const states = new Uint16Array(PAD_VOLUME);
  for (let y = -1; y <= 16; y++) for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) states[padIndex(x, y, z)] = fill(x, y, z);
  return { states, light: new Uint8Array(PAD_VOLUME).fill(0xf0), climate: new Uint8Array(CHUNK_AREA) };
}

const quads = (words: Uint32Array) => words.length / 8;
const pass = (name: string) => LAYERS.indexOf(name as never);

describe('mesher', () => {
  it('draws the six faces of a lone cube with full light and no occlusion', () => {
    const out = buildMesh(input((x, y, z) => (x === 5 && y === 5 && z === 5 ? S('stone') : 0)));
    expect(quads(out[pass('opaque')]!)).toBe(6);
    const words = out[pass('opaque')]!;
    for (let i = 0; i < words.length; i += 2) {
      const v = decodeVertex(words[i]!, words[i + 1]!);
      expect(v.ao).toBe(3);
      expect(v.sky).toBe(15);
      expect(v.tile).toBe(tileIndex('stone'));
      expect([5, 6]).toContain(v.x);
    }
  });

  it('merges a flat floor into one quad per side', () => {
    const out = buildMesh(input((_x, y) => (y === 0 ? S('stone') : 0)));
    // The floor continues into the border, so only its top and bottom show: one merged quad each.
    expect(quads(out[pass('opaque')]!)).toBe(2);
  });

  it('hides faces against opaque neighbours, including across the chunk border', () => {
    const out = buildMesh(input((_x, y) => (y <= 0 ? S('stone') : 0)));
    // Only the top of the solid region shows: the bottom and sides face stone in the border.
    expect(quads(out[pass('opaque')]!)).toBe(1);
  });

  it('occludes corners next to walls', () => {
    const out = buildMesh(input((x, y) => (y === 0 || (x === 8 && y === 1) ? S('stone') : 0)));
    const words = out[pass('opaque')]!;
    const aos = new Set<number>();
    for (let i = 0; i < words.length; i += 2) aos.add(decodeVertex(words[i]!, words[i + 1]!).ao);
    expect(aos.has(1)).toBe(true);
  });

  it('lowers the water surface and hides faces between water cells', () => {
    const out = buildMesh(input((_x, y) => (y < 4 ? S('water') : 0)));
    const words = out[pass('water')]!;
    expect(quads(words)).toBe(1);
    expect(decodeVertex(words[0]!, words[1]!).y).toBeCloseTo(4 - 2 / 16);
  });

  it('draws flowing water lower than a source, and falling water full height', () => {
    const top = (state: number) => {
      const out = buildMesh(input((x, y, z) => (x === 1 && y === 1 && z === 1 ? state : y < 1 ? S('stone') : 0)));
      const words = out[pass('water')]!;
      let max = 0;
      for (let i = 0; i < words.length; i += 2) max = Math.max(max, decodeVertex(words[i]!, words[i + 1]!).y);
      return max - 1;
    };
    expect(top(S('water'))).toBeCloseTo(14 / 16);
    expect(top(S('flowing_water', 3))).toBeCloseTo(7 / 16);
    expect(top(S('flowing_water', 8))).toBeCloseTo(1);
  });

  it('draws plants as two swaying crossed quads in the cutout pass', () => {
    const out = buildMesh(input((x, y, z) => (x === 1 && y === 1 && z === 1 ? S('tall_grass') : 0)));
    const words = out[pass('cutout')]!;
    expect(quads(words)).toBe(2);
    const sway = [0, 1, 2, 3].map((c) => decodeVertex(words[c * 2]!, words[c * 2 + 1]!).sway);
    expect(sway).toEqual([0, 0, 1, 1]);
  });

  it('draws slabs and snow as partial boxes', () => {
    const out = buildMesh(input((x, y, z) => (x === 2 && y === 2 && z === 2 ? S('stone_slab') : x === 4 && y === 2 && z === 2 ? S('snow', 1) : 0)));
    const words = out[pass('opaque')]!;
    expect(quads(words)).toBe(12);
    const ys = new Set<number>();
    for (let i = 0; i < words.length; i += 2) ys.add(decodeVertex(words[i]!, words[i + 1]!).y);
    // Slab top at half a cell, two snow layers at a quarter.
    expect([...ys].sort()).toEqual([2, 2.25, 2.5]);
  });

  it('puts ice in its own pass', () => {
    const out = buildMesh(input((x, y, z) => (x === 3 && y === 3 && z === 3 ? S('ice') : 0)));
    expect(quads(out[pass('ice')]!)).toBe(6);
    expect(quads(out[pass('water')]!)).toBe(0);
  });

  it('has a painted tile for every tile name', () => {
    for (const name of TILE_NAMES) expect(hasPainter(name), name).toBe(true);
    expect(TILE_NAMES.length).toBeLessThan(1024);
  });
});
