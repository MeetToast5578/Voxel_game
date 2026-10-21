import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { BlockId, Tile, flowingLavaState } from '../src/world/blocks';
import { buildChunkMesh } from '../src/render/mesher';
import { uniformTops } from './support/testWorld';
import { generateAtlasPixels } from '../src/render/atlasPixels';
import { ATLAS_SIZE, ATLAS_TILES, TILE_SIZE } from '../src/render/tiles';

describe('lava rendering', () => {
  it('draws a partial-height, luminous opaque-looking fluid in a dark cave', () => {
    const neighbours = Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME));
    neighbours[13]![localIndex(5, 4, 5)] = flowingLavaState(4, false);
    const m = buildChunkMesh(neighbours, uniformTops(1000), 0);
    expect(m.solid.indices.length).toBe(36);
    expect(m.translucent.indices.length).toBe(0);
    const heights = Array.from(m.solid.positions).filter((_v, i) => i % 3 === 1);
    expect(Math.max(...heights)).toBe(4.5); expect(Math.min(...heights)).toBe(4);
    for (let i = 1; i < m.solid.light.length; i += 2) expect(m.solid.light[i]).toBe(1);
  });
  it('uses distinct procedural lava and obsidian textures', () => {
    const pixels = generateAtlasPixels();
    const at = (tile: number) => {
      const x = tile % ATLAS_TILES * TILE_SIZE + 8, y = Math.floor(tile / ATLAS_TILES) * TILE_SIZE + 8;
      return Array.from(pixels.slice((y * ATLAS_SIZE + x) * 4, (y * ATLAS_SIZE + x) * 4 + 4));
    };
    const lava = at(Tile.LAVA), obsidian = at(Tile.OBSIDIAN);
    expect(lava[0]).toBeGreaterThan(180); expect(lava[0]).toBeGreaterThan(lava[2]! * 2);
    expect(obsidian[0]).toBeLessThan(80); expect(obsidian[3]).toBe(255);
    expect(BlockId.CLAY).toBe(53); expect(BlockId.LAVA).toBeGreaterThan(BlockId.CLAY);
  });
});
