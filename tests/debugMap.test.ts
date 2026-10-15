import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../src/config';
import { TerrainGenerator } from '../src/world/generator';
import { mapPixels } from '../src/world/debugMap';

describe('mapPixels', () => {
  const g = new TerrainGenerator(42);
  const size = 64;
  const pixels = mapPixels(g, -32, -32, size);
  const at = (px: number, pz: number) => {
    const i = (pz * size + px) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!];
  };

  it('returns size x size RGBA pixels, all opaque', () => {
    expect(pixels.length).toBe(size * size * 4);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it('colours sea columns blue and land columns not blue', () => {
    let sea = 0;
    let land = 0;
    for (let pz = 0; pz < size; pz++)
      for (let px = 0; px < size; px++) {
        const h = g.getHeight(-32 + px, -32 + pz);
        const [r, gr, b] = at(px, pz)!;
        if (h < SEA_LEVEL) {
          sea++;
          expect(b).toBeGreaterThan(r);
          expect(b).toBeGreaterThan(gr);
        } else {
          land++;
          expect(b).toBeLessThan(200);
        }
      }
    expect(sea).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and area', () => {
    expect(mapPixels(new TerrainGenerator(42), -32, -32, size)).toEqual(pixels);
  });
});
