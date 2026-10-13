import { describe, expect, it } from 'vitest';
import { FACES, FACE_UVS } from '../src/render/faces';
import { ATLAS_TILES, tileUV } from '../src/render/tiles';

describe('FACES', () => {
  it('has 6 faces with unit normals in the order +X, -X, +Y, -Y, +Z, -Z', () => {
    expect(FACES.map((f) => f.dir)).toEqual([
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ]);
  });
  it('corners wind counter-clockwise seen from outside (cross product = normal)', () => {
    for (const f of FACES) {
      const [a, b, c] = f.corners;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      expect(n.map((v) => v + 0)).toEqual([...f.dir]); // "+ 0" turns -0 into 0
    }
  });
  it('all 4 corners lie on the face plane', () => {
    for (const f of FACES) {
      const axis = f.dir.findIndex((v) => v !== 0);
      const plane = f.dir[axis]! > 0 ? 1 : 0;
      for (const corner of f.corners) expect(corner[axis]).toBe(plane);
    }
  });
  it('side faces: first two corners are at the bottom (y = 0), last two at the top (y = 1)', () => {
    for (const f of FACES.filter((f) => f.dir[1] === 0)) {
      expect(f.corners.map((c) => c[1])).toEqual([0, 0, 1, 1]);
    }
    expect(FACE_UVS).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });
});

describe('tileUV', () => {
  it('tile 0 is the top-left of the atlas (v near 1 because textures are flipped)', () => {
    const uv = tileUV(0);
    expect(uv.u0).toBeCloseTo(0, 2);
    expect(uv.u1).toBeCloseTo(1 / ATLAS_TILES, 2);
    expect(uv.v1).toBeCloseTo(1, 2);
    expect(uv.v0).toBeCloseTo(1 - 1 / ATLAS_TILES, 2);
  });
  it('tiles are inset so neighbors never bleed', () => {
    const a = tileUV(0);
    const b = tileUV(1);
    expect(a.u1).toBeLessThan(b.u0);
    const below = tileUV(ATLAS_TILES);
    expect(below.v1).toBeLessThan(a.v0);
  });
});
