import { describe, expect, it } from 'vitest';
import { generateAtlasPixels } from '../src/render/atlasPixels';
import { ATLAS_SIZE, TILE_SIZE } from '../src/render/tiles';
import { BLOCKS, Tile } from '../src/world/blocks';

const pixels = generateAtlasPixels();
function tileAlphas(tile: number): number[] {
  const out: number[] = [];
  const ox = (tile % 16) * TILE_SIZE;
  const oy = Math.floor(tile / 16) * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) out.push(pixels[((oy + y) * ATLAS_SIZE + ox + x) * 4 + 3]!);
  return out;
}

describe('generateAtlasPixels', () => {
  it('has the right size and is deterministic', () => {
    expect(pixels.length).toBe(ATLAS_SIZE * ATLAS_SIZE * 4);
    expect(generateAtlasPixels()).toEqual(pixels);
  });
  it('every tile used by a block is painted', () => {
    for (const b of BLOCKS.slice(1))
      for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom]) expect(tileAlphas(t).some((a) => a > 0)).toBe(true);
  });
  it('opaque tiles are fully opaque; leaves and glass have transparent pixels', () => {
    for (const t of [Tile.STONE, Tile.DIRT, Tile.GRASS_TOP, Tile.GRASS_SIDE, Tile.PLANKS, Tile.WATER])
      expect(tileAlphas(t).every((a) => a === 255)).toBe(true);
    expect(tileAlphas(Tile.LEAVES).some((a) => a === 0)).toBe(true);
    expect(tileAlphas(Tile.GLASS).some((a) => a === 0)).toBe(true);
  });
});
