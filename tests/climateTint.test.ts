import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { ClimateTintSampler, MeshTints, climateTint, type TintKind } from '../src/world/climateTint';
import { BlockId } from '../src/world/blocks';
import { buildChunkMesh } from '../src/render/mesher';
import { localIndex } from '../src/core/coords';
import { uniformTops } from './support/testWorld';

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
      expect([a.r, a.g, a.b]).toEqual([b.r, b.g, b.b]);
      a.sample(4, 16, 8, kind); c.sample(4, 0, 8, kind);
      expect([a.r, a.g, a.b]).toEqual([c.r, c.g, c.b]);
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
