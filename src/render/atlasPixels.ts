import { mulberry32 } from '../core/random';
import { Tile } from '../world/blocks';
import { ATLAS_SIZE, ATLAS_TILES, TILE_SIZE } from './tiles';

type RGB = readonly [number, number, number];
/** Returns [r, g, b, a] (0-255) for pixel (x, y) of a tile; y = 0 is the TOP row of the tile. */
type PixelFn = (x: number, y: number, rand: () => number) => readonly [number, number, number, number];

const shade = (c: RGB, f: number, a = 255) => [c[0] * f, c[1] * f, c[2] * f, a] as const;
const noisy = (c: RGB, amount: number): PixelFn => (_x, _y, r) => shade(c, 1 + (r() - 0.5) * amount);

const DIRT: RGB = [134, 96, 67];
const GRASS: RGB = [95, 159, 53];
const BARK: RGB = [102, 81, 51];

const PAINTERS: Record<number, PixelFn> = {
  [Tile.STONE]: noisy([125, 125, 125], 0.25),
  [Tile.DIRT]: noisy(DIRT, 0.3),
  [Tile.GRASS_TOP]: noisy(GRASS, 0.25),
  [Tile.GRASS_SIDE]: (x, y, r) => {
    const depth = 3 + ((x * 7) % 3); // jagged grass edge, 3-5 px
    return y < depth ? shade(GRASS, 1 + (r() - 0.5) * 0.25) : shade(DIRT, 1 + (r() - 0.5) * 0.3);
  },
  [Tile.SAND]: noisy([219, 207, 163], 0.12),
  [Tile.WATER]: noisy([48, 96, 200], 0.1),
  [Tile.LOG_SIDE]: (x, _y, r) => shade(BARK, (x % 4 === 0 ? 0.75 : 1) + (r() - 0.5) * 0.15),
  [Tile.LOG_TOP]: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return shade(BARK, 1);
    const d = Math.floor(Math.hypot(x - 7.5, y - 7.5));
    return shade([157, 128, 79], (d % 2 === 0 ? 0.85 : 1) + (r() - 0.5) * 0.1);
  },
  [Tile.LEAVES]: (_x, _y, r) => (r() < 0.18 ? [0, 0, 0, 0] : shade([58, 128, 38], 1 + (r() - 0.5) * 0.35)),
  [Tile.PLANKS]: (x, y, r) => {
    const seam = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0;
    return shade([162, 130, 78], (seam ? 0.7 : 1) + (r() - 0.5) * 0.1);
  },
  [Tile.GLASS]: (x, y) =>
    x === 0 || y === 0 || x === 15 || y === 15 || (x === y + 3 && x < 9) ? [220, 240, 255, 255] : [0, 0, 0, 0],
  [Tile.BEDROCK]: noisy([60, 60, 60], 0.6),
  [Tile.COBBLESTONE]: (x, y, r) => {
    const mortar = (x + Math.floor(y / 4) * 3) % 5 === 0 || y % 4 === 0;
    return shade([115, 115, 115], (mortar ? 0.6 : 1) + (r() - 0.5) * 0.3);
  },
  [Tile.GLOWSTONE]: (x, y, r) => {
    const bright = (x * 3 + y * 5) % 7 < 3;
    return shade(bright ? [255, 236, 150] : [214, 160, 70], 1 + (r() - 0.5) * 0.2);
  },
  [Tile.GRANITE]: noisy([150, 100, 90], 0.35),
  [Tile.DIORITE]: noisy([190, 190, 190], 0.3),
  [Tile.ANDESITE]: noisy([130, 135, 128], 0.3),
  [Tile.SANDSTONE]: (_x, y, r) => {
    const band = Math.floor(y / 4) % 2 === 0; // horizontal bands, 4 px each
    return shade(band ? [205, 186, 130] : [190, 168, 112], 1 + (r() - 0.5) * 0.12);
  },
  [Tile.LIMESTONE]: (_x, y, r) => {
    const bedding = y % 6 === 5; // faint horizontal lines between beds
    return shade([205, 200, 185], (bedding ? 0.9 : 1) + (r() - 0.5) * 0.15);
  },
  [Tile.SLATE]: (_x, y, r) => {
    const cleavage = y % 5 === 0; // flat planes split the slate into sheets
    return shade([70, 80, 95], (cleavage ? 0.8 : 1) + (r() - 0.5) * 0.2);
  },
  [Tile.BASALT]: noisy([50, 48, 52], 0.4),
  [Tile.DEEPSLATE]: (x, y, r) => {
    const grain = (x + y) % 7 === 0; // diagonal grain
    return shade([80, 80, 86], (grain ? 0.75 : 1) + (r() - 0.5) * 0.2);
  },
  [Tile.TALL_GRASS]: (x, y, r) => {
    // Blades rising from the bottom, staggered; the rest is transparent.
    const blade = y > 3 && (x % 4 === 1 || (x % 4 === 2 && y > 9) || (x % 4 === 3 && y > 6));
    return blade ? shade(GRASS, 0.9 + (r() - 0.5) * 0.25) : [0, 0, 0, 0];
  },
  [Tile.FERN]: (x, y, r) => {
    // Fronds fanning out from the base: a striped leaf shape; the rest is transparent.
    const half = (y - 2) * 0.55;
    const inLeaf = y > 2 && Math.abs(x - 7.5) <= half;
    return inLeaf && (x + y) % 3 !== 0 ? shade([60, 120, 45], 0.9 + (r() - 0.5) * 0.2) : [0, 0, 0, 0];
  },
  [Tile.DANDELION]: (x, y, r) => {
    // A yellow head on a green stem; the rest is transparent.
    if (Math.hypot(x - 7.5, y - 5) <= 2.5) return shade([250, 225, 50], 1 + (r() - 0.5) * 0.15);
    if ((x === 7 || x === 8) && y >= 8) return shade([60, 130, 40], 1 + (r() - 0.5) * 0.2);
    return [0, 0, 0, 0];
  },
  [Tile.POPPY]: (x, y, r) => {
    // A red head on a green stem; the rest is transparent.
    if (Math.hypot(x - 7.5, y - 6) <= 3) return shade([200, 30, 30], (x === 7 || x === 8) && y === 6 ? 0.4 : 1 + (r() - 0.5) * 0.2);
    if ((x === 7 || x === 8) && y >= 9) return shade([60, 130, 40], 1 + (r() - 0.5) * 0.2);
    return [0, 0, 0, 0];
  },
  [Tile.BRICK]: (x, y, r) => {
    const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
    return mortar ? shade([200, 200, 190], 1) : shade([150, 60, 50], 1 + (r() - 0.5) * 0.2);
  },
};

/** RGBA pixels for the whole atlas, row-major, row 0 = top of the image. */
export function generateAtlasPixels(): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (const [tileStr, paint] of Object.entries(PAINTERS)) {
    const tile = Number(tileStr);
    const rand = mulberry32(1000 + tile);
    const ox = (tile % ATLAS_TILES) * TILE_SIZE;
    const oy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const [r, g, b, a] = paint(x, y, rand);
        const i = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  }
  return data;
}
