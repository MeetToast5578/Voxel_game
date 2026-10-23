import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { buildChunkMesh } from '../src/render/mesher';
import { BlockId, blockStateName, blocksSky, getBlockDef, isOpaque, isSolid } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn } from './support/stackedColumn';
import { uniformTops } from './support/testWorld';

const PLANTS: number[] = [
  BlockId.TALL_GRASS, BlockId.POPPY, BlockId.FERN, BlockId.DANDELION, BlockId.BROWN_MUSHROOM, BlockId.RED_MUSHROOM,
];

describe('ground cover (spec 18)', () => {
  it('registers the plants as cross-shaped blocks, and round-trips their names', () => {
    const names = ['tall_grass', 'poppy', 'fern', 'dandelion', 'brown_mushroom', 'red_mushroom'];
    PLANTS.forEach((id, i) => {
      expect(getBlockDef(id).shape).toBe('cross');
      expect(blockStateName(id)).toBe(names[i]);
    });
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
    const seen = new Set<number>();
    for (const { cx, cz } of landColumns(g, 40, 60)) {
      const c = stackedColumn(g, cx, cz);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(cx * 16 + lx, cz * 16 + lz);
          const above = c.get(lx, h + 1, lz);
          const surface = c.get(lx, h, lz);
          const plantSurface = surface === BlockId.GRASS || surface === BlockId.DIRT;
          if (PLANTS.includes(above)) {
            plants++;
            seen.add(above);
            expect(plantSurface).toBe(true);
          } else if (surface === BlockId.GRASS || surface === BlockId.DIRT) bareGrass++;
        }
    }
    expect(plants).toBeGreaterThan(0);
    expect(bareGrass).toBeGreaterThan(0); // not every grass cell grows a plant
    expect(seen.has(BlockId.FERN)).toBe(true);
  });

  it('grows at least one mushroom among the sampled plants (spec 21)', () => {
    const g = new TerrainGenerator(1);
    const seen = new Set<number>();
    for (const { cx, cz } of landColumns(g, 40, 60)) {
      const c = stackedColumn(g, cx, cz);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) seen.add(c.get(lx, g.getHeight(cx * 16 + lx, cz * 16 + lz) + 1, lz));
    }
    expect(seen.has(BlockId.BROWN_MUSHROOM) || seen.has(BlockId.RED_MUSHROOM)).toBe(true);
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
