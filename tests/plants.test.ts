import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { buildChunkMesh } from '../src/render/mesher';
import { BlockId, blockStateName, blocksSky, getBlockDef, isOpaque, isSolid } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn } from './support/stackedColumn';
import { uniformTops } from './support/testWorld';

const PLANTS: number[] = [BlockId.TALL_GRASS, BlockId.POPPY];

describe('ground cover (spec 18)', () => {
  it('registers tall grass and poppies as cross-shaped plants, and round-trips their names', () => {
    for (const id of PLANTS) {
      expect(getBlockDef(id).shape).toBe('cross');
      expect(blockStateName(id)).toBe(id === BlockId.TALL_GRASS ? 'tall_grass' : 'poppy');
    }
  });

  it('lets plants be walked through and lets sun through, while cubes still block it', () => {
    for (const id of PLANTS) {
      expect(isSolid(id)).toBe(false);
      expect(isOpaque(id)).toBe(false);
      expect(blocksSky(id)).toBe(false);
    }
    expect(blocksSky(BlockId.STONE)).toBe(true);
  });

  it('puts a plant only on a grass surface, never on sand, stone or water', () => {
    const g = new TerrainGenerator(1);
    let plants = 0;
    let bareGrass = 0;
    for (const { cx, cz } of landColumns(g, 40, 60)) {
      const c = stackedColumn(g, cx, cz);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(cx * 16 + lx, cz * 16 + lz);
          const above = c.get(lx, h + 1, lz);
          if (PLANTS.includes(above)) {
            plants++;
            expect(c.get(lx, h, lz)).toBe(BlockId.GRASS);
          } else if (c.get(lx, h, lz) === BlockId.GRASS) bareGrass++;
        }
    }
    expect(plants).toBeGreaterThan(0);
    expect(bareGrass).toBeGreaterThan(0); // not every grass cell grows a plant
  });

  it('meshes one plant as two quads seen from both sides, with no cube faces', () => {
    const neighbors = Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME));
    neighbors[13]![localIndex(5, 5, 5)] = BlockId.TALL_GRASS;
    const m = buildChunkMesh(neighbors, uniformTops(-1000), 0);
    expect(m.solid.indices.length).toBe(24); // two quads, each as two windings of two triangles
    expect(m.solid.positions.length).toBe(8 * 3); // eight vertices in total
    expect(m.translucent.indices.length).toBe(0);
  });
});
