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

/** [r, g, b] of every pixel in a tile. */
function tileRgb(tile: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const ox = (tile % 16) * TILE_SIZE;
  const oy = Math.floor(tile / 16) * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
      out.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
    }
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
  it('the grass side is green all the way down, like the grass top', () => {
    const isGreen = ([r, g, b]: [number, number, number]) => g >= r + 20 && g >= b + 20;
    expect(tileRgb(Tile.GRASS_SIDE).every(isGreen)).toBe(true);
    expect(tileRgb(Tile.GRASS_TOP).every(isGreen)).toBe(true);
  });
  it('the crack stages add cracks from stage 0 to stage 9', () => {
    const opaque = (tile: number) => tileAlphas(tile).filter((a) => a === 255).length;
    const counts = Array.from({ length: 10 }, (_, i) => opaque(Tile.CRACK_0 + i));
    expect(counts[0]).toBeGreaterThan(0);
    for (let i = 1; i < 10; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts[9]).toBeGreaterThan(counts[0]!);
  });
  it('the dirt tile is still brown', () => {
    expect(tileRgb(Tile.DIRT).every(([r, g]) => r > g)).toBe(true);
  });
});
