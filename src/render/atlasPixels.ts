import { mulberry32 } from '../core/random';
import { CROP_STAGES, Tile } from '../world/blocks';
import { ATLAS_SIZE, ATLAS_TILES, TILE_SIZE } from './tiles';

type RGB = readonly [number, number, number];
/** Returns [r, g, b, a] (0-255) for pixel (x, y) of a tile; y = 0 is the TOP row of the tile. */
type PixelFn = (x: number, y: number, rand: () => number) => readonly [number, number, number, number];

/** Stone with flecks of the ore colour. */
function orePainter(colour: RGB): PixelFn {
  return (_x, _y, r) => {
    const base = shade([125, 125, 125], 1 + (r() - 0.5) * 0.25);
    return r() < 0.12 ? shade(colour, 1) : base;
  };
}

const shade = (c: RGB, f: number, a = 255) => [c[0] * f, c[1] * f, c[2] * f, a] as const;
const noisy = (c: RGB, amount: number): PixelFn => (_x, _y, r) => shade(c, 1 + (r() - 0.5) * amount);

const DIRT: RGB = [134, 96, 67];
const GRASS: RGB = [95, 159, 53];
const BARK: RGB = [102, 81, 51];

/** A fixed random rank for each pixel of a tile, so each crack stage keeps the one before it (spec 24). */
const crackRandom = mulberry32(77);
const CRACK_RANK = Array.from({ length: TILE_SIZE * TILE_SIZE }, () => crackRandom());
const CRACK_SHADE: RGB = [25, 22, 20];

/** Stage 0 has a few cracks; each later stage adds more, up to about a third of the pixels at stage 9. */
function crackPainter(stage: number): PixelFn {
  const limit = ((stage + 1) / 10) * 0.35;
  return (x, y) => (CRACK_RANK[y * TILE_SIZE + x]! < limit ? shade(CRACK_SHADE, 1, 255) : [0, 0, 0, 0]);
}

const LITTER_COLOURS: readonly (readonly [number, number, number])[] = [[176, 92, 32], [196, 140, 46], [140, 52, 30], [112, 78, 40]];

const PAINTERS: Record<number, PixelFn> = {
  [Tile.LILY_PAD]: (x, y, r) => {
    const dx = x - 7.5, dz = y - 7.5;
    if (Math.hypot(dx, dz) > 7 || dz > 0 && Math.abs(dx) < dz * 0.45) return [0, 0, 0, 0];
    return shade([58, 132, 47], (x === 7 || y === 7 ? 0.75 : 1) + (r() - 0.5) * 0.25);
  },
  [Tile.MOSS]: (x, y, r) => {
    if ((x < 2 || y < 2 || x > 13 || y > 13) && r() < 0.5) return [0, 0, 0, 0];
    return shade([72, 110, 42], 0.8 + r() * 0.4);
  },
  // Scattered leaves in autumn colours over bare ground showing through (T-G6).
  [Tile.LEAF_LITTER]: (_x, _y, r) => {
    if (r() < 0.3) return [0, 0, 0, 0];
    return shade(LITTER_COLOURS[(r() * LITTER_COLOURS.length) | 0]!, 0.75 + r() * 0.35);
  },
  [Tile.CACTUS_SIDE]: (x, y, r) => {
    if (x % 4 === 0 && y % 5 === 0) return shade([222, 209, 146], 1);
    return shade([55, 122, 52], (x % 4 === 0 ? 0.65 : 1) + (r() - 0.5) * 0.15);
  },
  [Tile.CACTUS_TOP]: (x, y, r) => shade([88, 143, 65], Math.hypot(x - 7.5, y - 7.5) > 6 ? 0.65 : 1 + (r() - 0.5) * 0.15),
  [Tile.STONE]: noisy([125, 125, 125], 0.25),
  [Tile.DIRT]: noisy(DIRT, 0.3),
  [Tile.GRASS_TOP]: noisy(GRASS, 0.25),
  [Tile.GRASS_SIDE]: noisy(GRASS, 0.25), // grass all the way down, not a dirt side with a green edge
  [Tile.SAND]: noisy([219, 207, 163], 0.12),
  [Tile.SNOW]: noisy([240, 246, 250], 0.06),
  [Tile.ICE]: (_x, _y, r) => shade([150, 190, 235], 0.9 + r() * 0.2, 200),
  [Tile.CLAY]: noisy([151, 162, 170], 0.12),
  [Tile.GRAVEL]: noisy([128, 122, 116], 0.5),
  [Tile.WATER]: noisy([48, 96, 200], 0.1),
  [Tile.LAVA]: (x, y, r) => shade((x * 3 + y * 5) % 11 < 3 ? [255, 211, 55] : [239, 76, 12], 0.85 + r() * 0.15),
  [Tile.OBSIDIAN]: noisy([36, 25, 49], 0.5),
  [Tile.SAPLING]: (x, y, r) => {
    // A thin stem with a few leaves near the top; image row 0 is the top of the tile.
    const stem = x === 7 && y >= 6;
    const leaf = y >= 2 && y <= 7 && Math.abs(x - 7.5) + Math.abs(y - 4.5) <= 3.2 && r() < 0.8;
    return stem ? shade(BARK, 0.9 + r() * 0.2) : leaf ? shade([70, 140, 45], 0.85 + r() * 0.3) : [0, 0, 0, 0];
  },
  [Tile.REED]: (x, y, r) => {
    const stem = x === 5 || x === 10 || (y % 6 === 0 && x >= 4 && x <= 11);
    return stem ? shade([132, 163, 65], 0.85 + r() * 0.15) : [0, 0, 0, 0];
  },
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
  [Tile.BROWN_MUSHROOM]: (x, y, r) => {
    // A brown dome cap over a pale stem; the rest is transparent.
    if (y <= 7 && Math.hypot(x - 7.5, (y - 7) * 1.6) <= 4.5) return shade([128, 90, 55], 1 + (r() - 0.5) * 0.15);
    if ((x === 7 || x === 8) && y >= 7 && y <= 13) return shade([225, 215, 185], 1 + (r() - 0.5) * 0.1);
    return [0, 0, 0, 0];
  },
  [Tile.RED_MUSHROOM]: (x, y, r) => {
    // A red cap with white spots over a pale stem; the rest is transparent.
    if (y <= 7 && Math.hypot(x - 7.5, (y - 7) * 1.6) <= 4.5) {
      const spot = (x === 5 || x === 10) && (y === 4 || y === 5);
      return spot ? shade([245, 245, 240], 1) : shade([200, 35, 35], 1 + (r() - 0.5) * 0.15);
    }
    if ((x === 7 || x === 8) && y >= 7 && y <= 13) return shade([225, 215, 185], 1 + (r() - 0.5) * 0.1);
    return [0, 0, 0, 0];
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
  [Tile.CRACK_0]: crackPainter(0),
  [Tile.CRACK_1]: crackPainter(1),
  [Tile.CRACK_2]: crackPainter(2),
  [Tile.CRACK_3]: crackPainter(3),
  [Tile.CRACK_4]: crackPainter(4),
  [Tile.CRACK_5]: crackPainter(5),
  [Tile.CRACK_6]: crackPainter(6),
  [Tile.CRACK_7]: crackPainter(7),
  [Tile.CRACK_8]: crackPainter(8),
  [Tile.CRACK_9]: crackPainter(9),
  [Tile.BRICK]: (x, y, r) => {
    const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0;
    return mortar ? shade([200, 200, 190], 1) : shade([150, 60, 50], 1 + (r() - 0.5) * 0.2);
  },
  /** Stone with flecks of the ore colour. */
  [Tile.COAL_ORE]: orePainter([30, 30, 30]),
  [Tile.IRON_ORE]: orePainter([190, 170, 140]),
  [Tile.GOLD_ORE]: orePainter([230, 210, 70]),
  [Tile.REDSTONE_ORE]: orePainter([210, 50, 50]),
  [Tile.DIAMOND_ORE]: orePainter([110, 180, 230]),
  [Tile.EMERALD_ORE]: orePainter([70, 190, 130]),
  [Tile.LAPIS_ORE]: orePainter([50, 90, 180]),
  ...cropPainters(Tile.WHEAT, [205, 175, 70]),
  ...cropPainters(Tile.CARROTS, [235, 125, 35]),
  ...cropPainters(Tile.POTATOES, [225, 215, 160]),
};

/**
 * One tile per crop growth stage (T-G4): green shoots that grow taller each stage, and at the ripe stage the crop's
 * colour shows (wheat ears; carrot and potato tops near the soil).
 */
function cropPainters(first: number, ripe: RGB): Record<number, PixelFn> {
  const painters: Record<number, PixelFn> = {};
  for (let stage = 0; stage < CROP_STAGES; stage++) {
    const top = 15 - Math.round((stage + 1) * 12 / CROP_STAGES); // image row where the shoots end
    const ripeStage = stage === CROP_STAGES - 1;
    painters[first + stage] = (x, y, r) => {
      const shoot = (x % 5 === 1 || x % 5 === 3) && y >= top && x > 0 && x < 15;
      if (!shoot) return [0, 0, 0, 0];
      const head = ripeStage && (first === Tile.WHEAT ? y < top + 4 : y > 12);
      return head ? shade(ripe, 0.85 + r() * 0.3) : shade([80, 150, 50], 0.8 + r() * 0.3);
    };
  }
  return painters;
}

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
