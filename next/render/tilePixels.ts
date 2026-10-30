import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';

/** Pixels per tile side. Tiles are layers of a texture array, so merged faces can repeat them. */
export const TILE_SIZE = 16;

type RGB = readonly [number, number, number];
/** Returns [r, g, b, a] (0-255) for pixel (x, y) of a tile; y = 0 is the top row. */
type PixelFn = (x: number, y: number, rand: () => number) => readonly [number, number, number, number];

const shade = (c: RGB, f: number, a = 255) => [c[0] * f, c[1] * f, c[2] * f, a] as const;
const noisy = (c: RGB, amount: number): PixelFn => (_x, _y, r) => shade(c, 1 + (r() - 0.5) * amount);
/** Stone with flecks of the ore colour. */
const orePainter = (colour: RGB): PixelFn => (_x, _y, r) => {
  const base = shade([125, 125, 125], 1 + (r() - 0.5) * 0.25);
  return r() < 0.12 ? shade(colour, 1) : base;
};

const DIRT: RGB = [134, 96, 67];
const GRASS: RGB = [95, 159, 53];
const BARK: RGB = [102, 81, 51];
const LITTER_COLOURS: readonly RGB[] = [[176, 92, 32], [196, 140, 46], [140, 52, 30], [112, 78, 40]];

/** Painters by tile name, ported from the old atlas. */
const PAINTERS: Record<string, PixelFn> = {
  // Items: an ingot bar, a lump of coal and a browned potato, each on a clear background.
  // A door (T-K5): upright boards; every cell of the door shows the same tile, so it has no frame or handle.
  // Creatures (T-H4): a light fur tile, coloured per species and part by vertex colour.
  // Crafting table (T-I6): a planked top ruled into a 3×3 grid, and sides with hanging tools.
  lily_pad: (x, y, r) => {
    const dx = x - 7.5, dz = y - 7.5;
    if (Math.hypot(dx, dz) > 7 || dz > 0 && Math.abs(dx) < dz * 0.45) return [0, 0, 0, 0];
    return shade([58, 132, 47], (x === 7 || y === 7 ? 0.75 : 1) + (r() - 0.5) * 0.25);
  },
  moss: (x, y, r) => {
    if ((x < 2 || y < 2 || x > 13 || y > 13) && r() < 0.5) return [0, 0, 0, 0];
    return shade([72, 110, 42], 0.8 + r() * 0.4);
  },
  // Scattered leaves in autumn colours over bare ground showing through (T-G6).
  leaf_litter: (_x, _y, r) => {
    if (r() < 0.3) return [0, 0, 0, 0];
    return shade(LITTER_COLOURS[(r() * LITTER_COLOURS.length) | 0]!, 0.75 + r() * 0.35);
  },
  // Bed (T-I9): a red blanket with a white pillow at one end; the sides are a blanket edge over a wooden frame.
  cactus_side: (x, y, r) => {
    if (x % 4 === 0 && y % 5 === 0) return shade([222, 209, 146], 1);
    return shade([55, 122, 52], (x % 4 === 0 ? 0.65 : 1) + (r() - 0.5) * 0.15);
  },
  cactus_top: (x, y, r) => shade([88, 143, 65], Math.hypot(x - 7.5, y - 7.5) > 6 ? 0.65 : 1 + (r() - 0.5) * 0.15),
  stone: noisy([125, 125, 125], 0.25),
  dirt: noisy(DIRT, 0.3),
  grass_top: noisy(GRASS, 0.25),
  grass_side: noisy(GRASS, 0.25), // grass all the way down, not a dirt side with a green edge
  sand: noisy([219, 207, 163], 0.12),
  snow: noisy([240, 246, 250], 0.06),
  ice: (_x, _y, r) => shade([150, 190, 235], 0.9 + r() * 0.2, 200),
  clay: noisy([151, 162, 170], 0.12),
  gravel: noisy([128, 122, 116], 0.5),
  water: noisy([48, 96, 200], 0.1),
  lava: (x, y, r) => shade((x * 3 + y * 5) % 11 < 3 ? [255, 211, 55] : [239, 76, 12], 0.85 + r() * 0.15),
  obsidian: noisy([36, 25, 49], 0.5),
  reed: (x, y, r) => {
    const stem = x === 5 || x === 10 || (y % 6 === 0 && x >= 4 && x <= 11);
    return stem ? shade([132, 163, 65], 0.85 + r() * 0.15) : [0, 0, 0, 0];
  },
  log_side: (x, _y, r) => shade(BARK, (x % 4 === 0 ? 0.75 : 1) + (r() - 0.5) * 0.15),
  log_top: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return shade(BARK, 1);
    const d = Math.floor(Math.hypot(x - 7.5, y - 7.5));
    return shade([157, 128, 79], (d % 2 === 0 ? 0.85 : 1) + (r() - 0.5) * 0.1);
  },
  leaves: (_x, _y, r) => (r() < 0.18 ? [0, 0, 0, 0] : shade([58, 128, 38], 1 + (r() - 0.5) * 0.35)),
  planks: (x, y, r) => {
    const seam = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0;
    return shade([162, 130, 78], (seam ? 0.7 : 1) + (r() - 0.5) * 0.1);
  },
  glass: (x, y) =>
    x === 0 || y === 0 || x === 15 || y === 15 || (x === y + 3 && x < 9) ? [220, 240, 255, 255] : [0, 0, 0, 0],
  bedrock: noisy([60, 60, 60], 0.6),
  cobblestone: (x, y, r) => {
    const mortar = (x + Math.floor(y / 4) * 3) % 5 === 0 || y % 4 === 0;
    return shade([115, 115, 115], (mortar ? 0.6 : 1) + (r() - 0.5) * 0.3);
  },
  glowstone: (x, y, r) => {
    const bright = (x * 3 + y * 5) % 7 < 3;
    return shade(bright ? [255, 236, 150] : [214, 160, 70], 1 + (r() - 0.5) * 0.2);
  },
  granite: noisy([150, 100, 90], 0.35),
  diorite: noisy([190, 190, 190], 0.3),
  andesite: noisy([130, 135, 128], 0.3),
  sandstone: (_x, y, r) => {
    const band = Math.floor(y / 4) % 2 === 0; // horizontal bands, 4 px each
    return shade(band ? [205, 186, 130] : [190, 168, 112], 1 + (r() - 0.5) * 0.12);
  },
  limestone: (_x, y, r) => {
    const bedding = y % 6 === 5; // faint horizontal lines between beds
    return shade([205, 200, 185], (bedding ? 0.9 : 1) + (r() - 0.5) * 0.15);
  },
  slate: (_x, y, r) => {
    const cleavage = y % 5 === 0; // flat planes split the slate into sheets
    return shade([70, 80, 95], (cleavage ? 0.8 : 1) + (r() - 0.5) * 0.2);
  },
  basalt: noisy([50, 48, 52], 0.4),
  deepslate: (x, y, r) => {
    const grain = (x + y) % 7 === 0; // diagonal grain
    return shade([80, 80, 86], (grain ? 0.75 : 1) + (r() - 0.5) * 0.2);
  },
  brown_mushroom: (x, y, r) => {
    // A brown dome cap over a pale stem; the rest is transparent.
    if (y <= 7 && Math.hypot(x - 7.5, (y - 7) * 1.6) <= 4.5) return shade([128, 90, 55], 1 + (r() - 0.5) * 0.15);
    if ((x === 7 || x === 8) && y >= 7 && y <= 13) return shade([225, 215, 185], 1 + (r() - 0.5) * 0.1);
    return [0, 0, 0, 0];
  },
  red_mushroom: (x, y, r) => {
    // A red cap with white spots over a pale stem; the rest is transparent.
    if (y <= 7 && Math.hypot(x - 7.5, (y - 7) * 1.6) <= 4.5) {
      const spot = (x === 5 || x === 10) && (y === 4 || y === 5);
      return spot ? shade([245, 245, 240], 1) : shade([200, 35, 35], 1 + (r() - 0.5) * 0.15);
    }
    if ((x === 7 || x === 8) && y >= 7 && y <= 13) return shade([225, 215, 185], 1 + (r() - 0.5) * 0.1);
    return [0, 0, 0, 0];
  },
  tall_grass: (x, y, r) => {
    // Blades rising from the bottom, staggered; the rest is transparent.
    const blade = y > 3 && (x % 4 === 1 || (x % 4 === 2 && y > 9) || (x % 4 === 3 && y > 6));
    return blade ? shade(GRASS, 0.9 + (r() - 0.5) * 0.25) : [0, 0, 0, 0];
  },
  fern: (x, y, r) => {
    // Fronds fanning out from the base: a striped leaf shape; the rest is transparent.
    const half = (y - 2) * 0.55;
    const inLeaf = y > 2 && Math.abs(x - 7.5) <= half;
    return inLeaf && (x + y) % 3 !== 0 ? shade([60, 120, 45], 0.9 + (r() - 0.5) * 0.2) : [0, 0, 0, 0];
  },
  dandelion: (x, y, r) => {
    // A yellow head on a green stem; the rest is transparent.
    if (Math.hypot(x - 7.5, y - 5) <= 2.5) return shade([250, 225, 50], 1 + (r() - 0.5) * 0.15);
    if ((x === 7 || x === 8) && y >= 8) return shade([60, 130, 40], 1 + (r() - 0.5) * 0.2);
    return [0, 0, 0, 0];
  },
  poppy: (x, y, r) => {
    // A red head on a green stem; the rest is transparent.
    if (Math.hypot(x - 7.5, y - 6) <= 3) return shade([200, 30, 30], (x === 7 || x === 8) && y === 6 ? 0.4 : 1 + (r() - 0.5) * 0.2);
    if ((x === 7 || x === 8) && y >= 9) return shade([60, 130, 40], 1 + (r() - 0.5) * 0.2);
    return [0, 0, 0, 0];
  },
  brick: (x, y, r) => {
    const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
    return mortar ? shade([200, 200, 190], 1) : shade([150, 60, 50], 1 + (r() - 0.5) * 0.2);
  },
  /** Stone with flecks of the ore colour. */
  coal_ore: orePainter([30, 30, 30]),
  iron_ore: orePainter([190, 170, 140]),
  gold_ore: orePainter([230, 210, 70]),
  redstone_ore: orePainter([210, 50, 50]),
  diamond_ore: orePainter([110, 180, 230]),
  emerald_ore: orePainter([70, 190, 130]),
  lapis_ore: orePainter([50, 90, 180]),};

/** Every tile name the block table uses, in a fixed order: the layer index of each tile. */
export const TILE_NAMES: readonly string[] = [...new Set(BLOCKS.types.filter((t) => t.layer !== 'none')
  .flatMap((t) => [t.tiles.top, t.tiles.side, t.tiles.bottom]))];

export function tileIndex(name: string): number {
  const i = TILE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown tile '${name}'`);
  return i;
}

export function hasPainter(name: string): boolean {
  return name in PAINTERS;
}

/**
 * RGBA pixels of every tile, one TILE_SIZE² layer after another. Each layer is stored bottom row first, so texture
 * v = 0 is the bottom of the tile and a face's v grows upwards with the world.
 */
export function tilePixels(): Uint8ClampedArray {
  const layer = TILE_SIZE * TILE_SIZE * 4;
  const data = new Uint8ClampedArray(layer * TILE_NAMES.length);
  TILE_NAMES.forEach((name, t) => {
    const paint = PAINTERS[name] ?? (() => [255, 0, 255, 255] as const);
    const rand = mulberry32(1000 + t);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const [r, g, b, a] = paint(x, y, rand);
        const i = t * layer + ((TILE_SIZE - 1 - y) * TILE_SIZE + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
  });
  return data;
}
