import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { ClimateTintSampler, MeshTints, climateTint, seasonalWeights, type TintKind } from '../src/world/climateTint';
import { BlockId } from '../src/world/blocks';
import { buildChunkMesh } from '../src/render/mesher';
import { localIndex } from '../src/core/coords';
import { uniformTops } from './support/testWorld';

describe('seasonal weights from climate (T-F7)', () => {
  it('makes temperate leaves deciduous and keeps boreal and tropical ones evergreen', () => {
    expect(seasonalWeights(-15, 0.5)[0]).toBe(0);
    expect(seasonalWeights(10, 0.5)[0]).toBe(1);
    expect(seasonalWeights(30, 0.5)[0]).toBe(0);
  });
  it('browns grass only where it is both warm and dry', () => {
    expect(seasonalWeights(25, 0.1)[1]).toBe(1);
    expect(seasonalWeights(25, 0.9)[1]).toBe(0);
    expect(seasonalWeights(-5, 0.1)[1]).toBe(0);
  });
  it('writes the weights into the mesh: deciduousness on leaves, dryness on grass, nothing on stone', () => {
    for (const id of [BlockId.GRASS, BlockId.LEAVES, BlockId.STONE]) {
      const n = Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME)); n[13]![localIndex(5, 4, 5)] = id;
      const m = buildChunkMesh(n, uniformTops(-1000), 0, { seed: 1, cx: -1, cz: 0 }).solid;
      expect(m.season.length).toBe(m.positions.length / 3 * 2);
      const tints = new MeshTints(1, -1, 0, 0);
      tints.sample(5, 5, 5, id === BlockId.LEAVES ? 2 : 1);
      const leaf = Array.from(m.season.filter((_, i) => i % 2 === 0)), dry = Array.from(m.season.filter((_, i) => i % 2 === 1));
      if (id === BlockId.STONE) expect(m.season.every((v) => v === 0)).toBe(true);
      if (id === BlockId.LEAVES) { expect(dry.every((v) => v === 0)).toBe(true); expect(leaf).toContain(Math.fround(tints.deciduous)); }
      if (id === BlockId.GRASS) { expect(leaf.every((v) => v === 0)).toBe(true); expect(dry).toContain(Math.fround(tints.dryness)); }
    }
  });
});

describe('climate vertex colours (T-E2)', () => {
  it('varies continuously with temperature, moisture, altitude and seed', () => {
    expect(climateTint(30, 0, 1)).not.toEqual(climateTint(0, 1, 1));
    const a = new ClimateTintSampler(1), b = new ClimateTintSampler(2);
    expect(a.fields(-100, 100)).not.toEqual(b.fields(-100, 100));
    expect(a.fields(-100, 100)).toEqual(new ClimateTintSampler(1).fields(-100, 100));
    const left = a.fields(-0.000001, 20), right = a.fields(0.000001, 20);
    expect(Math.abs(left[0] - right[0])).toBeLessThan(0.00001);
    const low = new MeshTints(1, 0, 0, 0), high = new MeshTints(1, 0, 200, 0);
    low.sample(0, 0, 0, 1); high.sample(0, 0, 0, 1); expect(high.b).not.toBe(low.b);
  });
  it('agrees exactly at shared horizontal and vertical chunk vertices, including negative coordinates', () => {
    for (const kind of [1, 2, 3] as TintKind[]) {
      const a = new MeshTints(42, -1, -1, -1), b = new MeshTints(42, 0, -1, -1), c = new MeshTints(42, -1, 0, -1);
      a.sample(16, 8, 4, kind); b.sample(0, 8, 4, kind);
      expect([a.r, a.g, a.b, a.deciduous, a.dryness]).toEqual([b.r, b.g, b.b, b.deciduous, b.dryness]);
      a.sample(4, 16, 8, kind); c.sample(4, 0, 8, kind);
      expect([a.r, a.g, a.b, a.deciduous, a.dryness]).toEqual([c.r, c.g, c.b, c.deciduous, c.dryness]);
    }
  });
  it('changes actual grass/foliage/water mesh colours while preserving geometry/light and neutral rock', () => {
    for (const id of [BlockId.GRASS, BlockId.LEAVES, BlockId.WATER, BlockId.STONE]) {
      const n = Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME)); n[13]![localIndex(5, 4, 5)] = id;
      const base = buildChunkMesh(n, uniformTops(-1000), 0), tint = buildChunkMesh(n, uniformTops(-1000), 0, { seed: 1, cx: -1, cz: 0 });
      const layer = id === BlockId.WATER ? 'translucent' : 'solid';
      expect(tint[layer].positions).toEqual(base[layer].positions); expect(tint[layer].light).toEqual(base[layer].light);
      if (id === BlockId.STONE) expect(tint[layer].colors).toEqual(base[layer].colors);
      else expect(tint[layer].colors).not.toEqual(base[layer].colors);
    }
  });
});
