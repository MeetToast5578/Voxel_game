import { mulberry32 } from '../core/random';
import { ARMOUR_PIECES, BLOCKS } from '../engine/blocks';

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


/** A fixed random rank for each pixel of a tile, so each crack stage keeps the one before it. */
const crackRandom = mulberry32(77);
const CRACK_RANK = Array.from({ length: TILE_SIZE * TILE_SIZE }, () => crackRandom());
const CRACK_SHADE: RGB = [25, 22, 20];
/** Stage 0 has a few cracks; each later stage adds more, up to about a third of the pixels at stage 9. */
function crackPainter(stage: number): PixelFn {
  const limit = ((stage + 1) / 10) * 0.35;
  return (x, y) => (CRACK_RANK[y * TILE_SIZE + x]! < limit ? shade(CRACK_SHADE, 1, 255) : [0, 0, 0, 0]);
}
const HANDLE: RGB = [120, 86, 50];
const onHandle = (x: number, y: number) => x + y === 15 && x >= 1 && x <= 12;
/** A tool sprite: a handle on the diagonal and a head by kind (pickaxe bar, axe blade, shovel blade). */
function toolPainter(kind: string, head: RGB): PixelFn {
  const inHead = (x: number, y: number) => {
    const along = x + y, across = x - y;
    if (kind === 'pickaxe') return Math.abs(across - 7) <= 1 && Math.abs(along - 15) <= 6;
    if (kind === 'axe') return along >= 14 && along <= 19 && across >= 5 && across <= 10;
    // A sword: a long blade up the diagonal and a crossguard across it.
    if (kind === 'sword') return (Math.abs(along - 15) <= 1 && x >= 6) || (across === -6 && Math.abs(along - 15) <= 3);
    return Math.hypot(x - 12.5, y - 2.5) <= 2.6;
  };
  const handle = kind === 'sword' ? (x: number, y: number) => onHandle(x, y) && x <= 4 : onHandle;
  return (x, y, r) => inHead(x, y) ? shade(head, 0.85 + r() * 0.3) : handle(x, y) ? shade(HANDLE, 0.9 + r() * 0.2) : [0, 0, 0, 0];
}
const TOOL_HEADS: Record<string, RGB> = { wooden: [162, 130, 78], stone: [125, 125, 125], iron: [216, 216, 216], diamond: [110, 220, 230] };
const ARMOUR_COLOURS: Record<string, RGB> = { leather: [140, 86, 46], iron: [210, 210, 214], diamond: [110, 215, 228] };
/** An ingot bar in a colour. */
function ingotPainter(c: RGB): PixelFn {
  return (x, y, r) => (y >= 6 && y <= 10 && x >= 2 + (10 - y) && x <= 13 - (10 - y) / 2 ? shade(c, (y === 6 ? 1.15 : 0.9) + r() * 0.1) : [0, 0, 0, 0]);
}
/** A cut gem: a diamond shape, lighter at the top. */
function gemPainter(c: RGB): PixelFn {
  return (x, y, r) => (Math.abs(x - 7.5) + Math.abs(y - 8) * 0.8 <= 6 ? shade(c, (y < 7 ? 1.15 : 0.85) + r() * 0.1) : [0, 0, 0, 0]);
}
/** Armour pieces: a helmet, a chest piece, leggings and boots, in their material's colour. */
function armourPainter(slot: number, c: RGB): PixelFn {
  const inside = [
    (x: number, y: number) => y >= 4 && y <= 10 && x >= 3 && x <= 12 && !(y >= 8 && x >= 5 && x <= 10),
    (x: number, y: number) => y >= 2 && y <= 13 && x >= 2 && x <= 13 && !(y <= 4 && x >= 6 && x <= 9) && !(y >= 7 && (x <= 3 || x >= 12)),
    (x: number, y: number) => y >= 2 && y <= 14 && x >= 3 && x <= 12 && !(y >= 6 && x >= 7 && x <= 8),
    (x: number, y: number) => y >= 8 && y <= 13 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13)) && !(y <= 10 && (x === 2 || x === 13)),
  ][slot]!;
  return (x, y, r) => (inside(x, y) ? shade(c, 0.85 + r() * 0.25) : [0, 0, 0, 0]);
}
const COBBLE: RGB = [118, 118, 118];
/** A bucket: a pail narrowing to the bottom, filled at the top with `fill` if given. */
function bucketPainter(fill: RGB | null): PixelFn {
  return (x, y, r) => {
    const half = 6 - (y - 4) * 0.25;
    if (y < 4 || y > 13 || Math.abs(x - 7.5) > half) return [0, 0, 0, 0];
    if (fill && y <= 5 && Math.abs(x - 7.5) < half - 1) return shade(fill, 0.85 + r() * 0.3);
    return shade([170, 170, 175], (Math.abs(x - 7.5) > half - 1 || y === 13 ? 0.7 : 1) + (r() - 0.5) * 0.1);
  };
}
/** A furnace front: cobble with a dark mouth in the lower half, glowing when lit. */
function furnaceFront(lit: boolean): PixelFn {
  return (x, y, r) => {
    if (x >= 4 && x <= 11 && y >= 8 && y <= 13) return lit ? shade(y >= 11 ? [255, 150, 40] : [230, 90, 20], 0.8 + r() * 0.4) : shade([30, 28, 26], 1);
    return shade(COBBLE, (y === 7 && x >= 3 && x <= 12 ? 0.6 : 1) + (r() - 0.5) * 0.3);
  };
}
/** One tile per crop growth stage: shoots grow taller; the ripe stage shows the crop's colour. */
function cropPainters(key: string, ripe: RGB): Record<string, PixelFn> {
  const out: Record<string, PixelFn> = {};
  for (let stage = 0; stage < 4; stage++) {
    const top = 15 - Math.round(((stage + 1) * 12) / 4);
    out[key + '_' + stage] = (x, y, r) => {
      const shoot = (x % 5 === 1 || x % 5 === 3) && y >= top && x > 0 && x < 15;
      if (!shoot) return [0, 0, 0, 0];
      const head = stage === 3 && (key === 'wheat' ? y < top + 4 : y > 12);
      return head ? shade(ripe, 0.85 + r() * 0.3) : shade([80, 150, 50], 0.8 + r() * 0.3);
    };
  }
  return out;
}

/** Painters by tile name, ported from the old atlas. */
const PAINTERS: Record<string, PixelFn> = {
  furnace_side: (_x, _y, r) => shade(COBBLE, 1 + (r() - 0.5) * 0.3),
  furnace_top: (x, y, r) => shade(COBBLE, (x === 0 || y === 0 || x === 15 || y === 15 ? 0.7 : 1.1) + (r() - 0.5) * 0.2),
  furnace_front: furnaceFront(false),
  furnace_front_lit: furnaceFront(true),
  iron_ingot: ingotPainter([216, 216, 216]),
  coal: (x, y, r) => (Math.hypot(x - 7.5, (y - 8) * 1.2) <= 5.5 ? shade([40, 40, 44], 0.7 + r() * 0.6) : [0, 0, 0, 0]),
  baked_potato: (x, y, r) => (Math.hypot((x - 7.5) * 0.8, y - 8) <= 4.5 ? shade([196, 140, 60], 0.8 + r() * 0.35) : [0, 0, 0, 0]),
  door: (x, _y, r) => shade([150, 112, 66], (x % 5 === 0 ? 0.6 : 1) + (r() - 0.5) * 0.12),
  raw_meat: (x, y, r) => (Math.hypot((x - 7.5) * 0.75, y - 8) <= 5 ? shade(Math.hypot(x - 9, y - 7) < 1.5 ? [235, 225, 215] : [200, 70, 70], 0.85 + r() * 0.3) : [0, 0, 0, 0]),
  cooked_meat: (x, y, r) => (Math.hypot((x - 7.5) * 0.75, y - 8) <= 5 ? shade(Math.hypot(x - 9, y - 7) < 1.5 ? [235, 225, 215] : [130, 76, 44], 0.85 + r() * 0.3) : [0, 0, 0, 0]),
  stick: (x, y, r) => (x + y === 15 && x >= 2 && x <= 13 ? shade(HANDLE, 0.9 + r() * 0.2) : [0, 0, 0, 0]),
  crafting_table_top: (x, y, r) => shade([162, 130, 78], (x % 5 === 0 || y % 5 === 0 ? 0.55 : 1) + (r() - 0.5) * 0.1),
  crafting_table_side: (x, y, r) => {
    const tool = (x === 4 || x === 11) && y >= 3 && y <= 9;
    return shade(tool ? [110, 110, 110] : [150, 116, 70], (y === 0 || y === 15 ? 0.65 : 1) + (r() - 0.5) * 0.1);
  },
  bed_top: (x, y, r) => shade(y < 4 ? [232, 228, 220] : [168, 38, 42], (x === 0 || x === 15 ? 0.8 : 1) + (r() - 0.5) * 0.1),
  bed_side: (_x, y, r) => shade(y < 6 ? [150, 32, 36] : [150, 112, 66], 0.9 + r() * 0.15),
  sapling: (x, y, r) => {
    // A thin stem with a few leaves near the top; image row 0 is the top of the tile.
    const stem = x === 7 && y >= 6;
    const leaf = y >= 2 && y <= 7 && Math.abs(x - 7.5) + Math.abs(y - 4.5) <= 3.2 && r() < 0.8;
    return stem ? shade(BARK, 0.9 + r() * 0.2) : leaf ? shade([70, 140, 45], 0.85 + r() * 0.3) : [0, 0, 0, 0];
  },
  crack_0: crackPainter(0),
  crack_1: crackPainter(1),
  crack_2: crackPainter(2),
  crack_3: crackPainter(3),
  crack_4: crackPainter(4),
  crack_5: crackPainter(5),
  crack_6: crackPainter(6),
  crack_7: crackPainter(7),
  crack_8: crackPainter(8),
  crack_9: crackPainter(9),
  ...cropPainters('wheat', [205, 175, 70]),
  ...cropPainters('carrots', [235, 125, 35]),
  ...cropPainters('potatoes', [225, 215, 160]),
  ...Object.fromEntries(Object.entries(TOOL_HEADS).flatMap(([tier, head]) => ['pickaxe', 'axe', 'shovel', 'sword'].map((k) => [tier + '_' + k, toolPainter(k, head)]))),
  // Buckets: a grey pail, empty or with water or lava showing at the top.
  bucket: bucketPainter(null),
  water_bucket: bucketPainter([50, 90, 210]),
  lava_bucket: bucketPainter([235, 110, 25]),
  // A campfire: two crossed logs over glowing embers.
  campfire_top: (x, y, r) => {
    const log = (y >= 3 && y <= 5) || (y >= 10 && y <= 12) || (x >= 3 && x <= 5) || (x >= 10 && x <= 12);
    return log ? shade(BARK, 0.8 + r() * 0.3) : r() < 0.6 ? shade([255, 120 + r() * 80, 30], 1) : shade([60, 30, 20], 1);
  },
  campfire_side: (_x, y, r) => (y < 10 ? [0, 0, 0, 0] : y >= 13 ? shade([255, 140, 40], 0.7 + r() * 0.4) : shade(BARK, 0.8 + r() * 0.3)),
  // A ladder: two rails and rungs, clear between.
  ladder: (x, y, r) => ((x >= 2 && x <= 3) || (x >= 12 && x <= 13) || (y % 4 === 1 && x > 3 && x < 12) ? shade([150, 112, 66], 0.85 + r() * 0.25) : [0, 0, 0, 0]),
  // A chest: planks with a dark rim, and a latch on the front.
  chest_side: (x, y, r) => shade([150, 110, 60], (x === 0 || x === 15 || y === 0 || y === 15 || y === 5 ? 0.6 : 1) + (r() - 0.5) * 0.12),
  chest_top: (x, y, r) => shade([160, 120, 66], (x === 0 || x === 15 || y === 0 || y === 15 ? 0.6 : 1) + (r() - 0.5) * 0.12),
  chest_front: (x, y, r) => (x >= 7 && x <= 8 && y >= 4 && y <= 7 ? shade([200, 200, 200], 1)
    : shade([150, 110, 60], (x === 0 || x === 15 || y === 0 || y === 15 || y === 5 ? 0.6 : 1) + (r() - 0.5) * 0.12)),
  // A torch: a stick with a glowing tip, drawn on the stick's 2-pixel width.
  torch: (x, y, r) => (x >= 7 && x <= 8 ? (y <= 5 ? shade(y <= 2 ? [255, 236, 140] : [240, 150, 40], 0.9 + r() * 0.2) : shade(HANDLE, 0.9 + r() * 0.2)) : [0, 0, 0, 0]),
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
  lapis_ore: orePainter([50, 90, 180]),
  ember_ore: (_x, _y, r) => (r() < 0.16 ? shade([255, 110 + r() * 70, 30], 1) : shade([62, 60, 66], 1 + (r() - 0.5) * 0.25)),
  gold_ingot: ingotPainter([235, 200, 60]),
  diamond: gemPainter([120, 220, 235]),
  ember_crystal: gemPainter([255, 120, 40]),
  lapis: (x, y, r) => (Math.hypot(x - 7.5, y - 8) <= 4.5 ? shade([45, 80, 190], 0.8 + r() * 0.4) : [0, 0, 0, 0]),
  leather: (x, y, r) => (x >= 3 && x <= 12 && y >= 4 && y <= 12 && !((x === 3 || x === 12) && (y === 4 || y === 12)) ? shade([140, 86, 46], 0.85 + r() * 0.25) : [0, 0, 0, 0]),
  paper: (x, y, r) => (x >= 3 && x <= 12 && y >= 2 && y <= 13 ? shade([236, 232, 214], (y % 3 === 0 && x > 4 && x < 11 ? 0.8 : 1) + (r() - 0.5) * 0.05) : [0, 0, 0, 0]),
  compass: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 6.5) return [0, 0, 0, 0];
    if (d > 5.3) return shade([230, 200, 70], 0.9 + r() * 0.2);
    // The needle: red to the north (the top), white to the south.
    if (Math.abs(x - 7.5) < 1 && d < 4.5) return y < 8 ? shade([210, 40, 40], 1) : shade([235, 235, 235], 1);
    return shade([200, 196, 180], 1);
  },
  map: (x, y, r) => (x >= 2 && x <= 13 && y >= 2 && y <= 13 ? shade((x * 3 + y * 5) % 11 < 4 ? [110, 160, 90] : [214, 200, 150], 0.9 + r() * 0.15) : [0, 0, 0, 0]),
  lantern: (x, y, r) => {
    if (x < 4 || x > 11 || y < 4 || y > 15) return [0, 0, 0, 0];
    const frame = x === 4 || x === 11 || y === 4 || y === 15 || y === 9;
    return frame ? shade([70, 70, 76], 0.9 + r() * 0.2) : shade([255, 205, 110], 0.9 + r() * 0.2);
  },
  ...Object.fromEntries(Object.entries(ARMOUR_COLOURS).flatMap(([m, c]) => ARMOUR_PIECES.map((piece, slot) => [`${m}_${piece}`, armourPainter(slot, c)]))),
};

/** Every tile name the block table uses, in a fixed order: the layer index of each tile. */
export const TILE_NAMES: readonly string[] = [...new Set([
  ...BLOCKS.types.filter((t) => t.layer !== 'none')
    .flatMap((t) => t.variantTiles ?? [t.tiles.top, t.tiles.side, t.tiles.bottom, ...(t.front ? [t.front] : [])]),
  ...Array.from({ length: 10 }, (_, i) => 'crack_' + i),
])];

export function tileIndex(name: string): number {
  const i = TILE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown tile '${name}'`);
  return i;
}

/** The tile that shows a state as an item (slot icons, dropped items): its front, side or own tile. */
export function itemTile(state: number): string {
  const t = BLOCKS.type(state);
  return t.variantTiles ? t.variantTiles[state - t.id]! : t.front ?? (t.shape === 'cube' ? t.tiles.side : t.tiles.top);
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
