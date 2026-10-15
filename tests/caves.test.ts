import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, SHORE_CAVE_BAND, SHORE_ROOF, SOIL_DEPTH } from '../src/config';
import { BlockId } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn, type StackedColumn } from './support/stackedColumn';

describe('caves', () => {
  const g = new TerrainGenerator(1);
  const columns: StackedColumn[] = landColumns(g, 12, 60).map(({ cx, cz }) => stackedColumn(g, cx, cz));

  it('carve a small fraction of the underground', () => {
    let underground = 0;
    let air = 0;
    for (const c of columns)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(c.cx * 16 + lx, c.cz * 16 + lz);
          for (let y = 1; y < h - SOIL_DEPTH; y++) {
            underground++;
            if (c.get(lx, y, lz) === BlockId.AIR) air++;
          }
        }
    const fraction = air / underground;
    console.log(`cave fraction: ${(fraction * 100).toFixed(2)}%`);
    expect(fraction).toBeGreaterThan(0.005);
    expect(fraction).toBeLessThan(0.08);
  });
  it('never carve y = 0 or y = 1 under the surface', () => {
    for (const c of columns)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(c.cx * 16 + lx, c.cz * 16 + lz);
          for (let y = 0; y <= 1 && y < h; y++) expect(c.get(lx, y, lz)).not.toBe(BlockId.AIR);
        }
  });
  it('never open a hole under the shore', () => {
    for (const c of columns)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(c.cx * 16 + lx, c.cz * 16 + lz);
          if (h > SEA_LEVEL + SHORE_CAVE_BAND) continue;
          for (let y = Math.max(1, h - SHORE_ROOF + 1); y <= h; y++) expect(c.get(lx, y, lz)).not.toBe(BlockId.AIR);
        }
  });
});
