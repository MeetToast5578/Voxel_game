import { BLOCK_SIZE_M, TREE_REACH_CELLS } from '../config';
import { hash2 } from '../core/random';
import { BLOCKS } from '../engine/blocks';

export type StructureKind = 'cabin' | 'tower' | 'camp' | 'mine' | 'vault' | 'shrine' | 'house' | 'sky_island' | 'pyramid' | 'temple' | 'altar' | 'ice_cave' | 'shipwreck';

/** A structure cell relative to the site: x and z from its anchor, y absolute; then the state. */
export type StructureCell = readonly [dx: number, y: number, dz: number, state: number];

/**
 * Where each kind may stand: grid size (m), chance a grid cell has one, and for underground kinds the depth band (m).
 * One site per grid cell at a jittered spot, so sites are spread out and every decision is local.
 */
const KINDS: Record<StructureKind, { gridM: number; chance: number; salt: number; depth?: readonly [number, number]; biomes?: readonly string[] }> = {
  cabin: { gridM: 160, chance: 0.5, salt: 71 },
  tower: { gridM: 260, chance: 0.5, salt: 72 },
  camp: { gridM: 190, chance: 0.5, salt: 73 },
  mine: { gridM: 110, chance: 0.6, salt: 74, depth: [-55, -20] },
  vault: { gridM: 260, chance: 0.7, salt: 75, depth: [-95, -70] },
  // The goal structure: in every 600 m grid cell, deep down.
  shrine: { gridM: 600, chance: 1, salt: 76, depth: [-130, -110] },
  // Village houses: on a fine grid, but only inside village regions, so they stand together.
  house: { gridM: 20, chance: 0.8, salt: 77 },
  // Floating islands high over the land, a desert pyramid, a jungle temple, and a boss altar out in the open.
  sky_island: { gridM: 450, chance: 0.4, salt: 78 },
  pyramid: { gridM: 300, chance: 0.6, salt: 79, biomes: ['desert', 'badlands'] },
  temple: { gridM: 300, chance: 0.6, salt: 80, biomes: ['tropical_rainforest', 'swamp', 'old_growth_dark_forest', 'temperate_deciduous'] },
  altar: { gridM: 360, chance: 0.6, salt: 81 },
  // An ice cave in the cold lands, and a ship sunk on the sea floor.
  ice_cave: { gridM: 300, chance: 0.6, salt: 82, biomes: ['tundra', 'snowy_taiga', 'glacier', 'snowcapped_peaks', 'taiga'] },
  shipwreck: { gridM: 240, chance: 0.7, salt: 83 },
};

/** The biomes a kind's anchor must stand in, if it is particular. */
export const structureBiomes = (kind: StructureKind): readonly string[] | undefined => KINDS[kind].biomes;
/** Sky islands float with their ground at this height (m), over land no higher than SKY_ISLAND_MAX_GROUND_M. */
export const SKY_ISLAND_M = 130, SKY_ISLAND_MAX_GROUND_M = 100;

/** Village regions: one per 320 m grid cell at most, houses within 34 m of its centre. */
const VILLAGE_GRID_M = 320, VILLAGE_CHANCE = 0.45, VILLAGE_RADIUS_M = 34;

/** The centre of the village whose region holds cell (x, z), or null when there is none. */
export function villageAt(seed: number, x: number, z: number): [number, number] | null {
  const size = Math.round(VILLAGE_GRID_M / BLOCK_SIZE_M), gx = Math.floor(x / size), gz = Math.floor(z / size);
  if (hash2(seed + 90, gx, gz) >= VILLAGE_CHANCE) return null;
  const cx = gx * size + size * (0.3 + 0.4 * hash2(seed + 91, gx, gz)), cz = gz * size + size * (0.3 + 0.4 * hash2(seed + 92, gx, gz));
  return Math.hypot(x - cx, z - cz) < VILLAGE_RADIUS_M / BLOCK_SIZE_M ? [cx, cz] : null;
}

/** Who lives in the house anchored at (x, z). */
export const PROFESSIONS = ['farmer', 'smith', 'herbalist'] as const;
export function professionAt(seed: number, x: number, z: number): (typeof PROFESSIONS)[number] {
  return PROFESSIONS[Math.floor(hash2(seed + 93, x, z) * PROFESSIONS.length)]!;
}

/** Where a house's bed is, from its anchor: the foot, with the head one cell further along +x. */
export const HOUSE_BED: readonly [dx: number, dz: number] = [1, 2];
export const STRUCTURE_KINDS = Object.keys(KINDS) as StructureKind[];
/** Every structure stays within this many cells of its anchor, so the feature pass of each column finds it. */
const REACH = TREE_REACH_CELLS;

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const AIR = 0;

/** Anchor of `kind`'s site in grid cell (gx, gz), as cell coordinates, or null when that cell has none. */
export function siteIn(seed: number, kind: StructureKind, gx: number, gz: number): [number, number] | null {
  const k = KINDS[kind], size = Math.round(k.gridM / BLOCK_SIZE_M);
  if (hash2(seed + k.salt, gx, gz) >= k.chance) return null;
  const span = size - 2 * REACH;
  const at: [number, number] = [gx * size + REACH + Math.floor(hash2(seed + k.salt + 100, gx, gz) * span), gz * size + REACH + Math.floor(hash2(seed + k.salt + 200, gx, gz) * span)];
  return kind === 'house' && !villageAt(seed, at[0], at[1]) ? null : at;
}

/** Sites of every kind whose cells can reach into the square [x0, x1] × [z0, z1] (cells). */
export function sitesNear(seed: number, x0: number, z0: number, x1: number, z1: number): { kind: StructureKind; x: number; z: number }[] {
  const out: { kind: StructureKind; x: number; z: number }[] = [];
  for (const kind of STRUCTURE_KINDS) {
    const size = Math.round(KINDS[kind].gridM / BLOCK_SIZE_M);
    for (let gz = Math.floor((z0 - REACH) / size); gz <= Math.floor((z1 + REACH) / size); gz++) {
      for (let gx = Math.floor((x0 - REACH) / size); gx <= Math.floor((x1 + REACH) / size); gx++) {
        const at = siteIn(seed, kind, gx, gz);
        if (at && at[0] >= x0 - REACH && at[0] <= x1 + REACH && at[1] >= z0 - REACH && at[1] <= z1 + REACH) out.push({ kind, x: at[0], z: at[1] });
      }
    }
  }
  return out;
}

/** The floor cell (y) of an underground site: in its depth band, and at least 10 cells under the ground there. */
export function undergroundFloor(seed: number, kind: StructureKind, x: number, z: number, ground: number): number {
  const [lo, hi] = KINDS[kind].depth!;
  return Math.min(Math.round((lo + hash2(seed + 300, x, z) * (hi - lo)) / BLOCK_SIZE_M), ground - 10);
}

export const isUnderground = (kind: StructureKind) => KINDS[kind].depth !== undefined;

/**
 * The cells of a site with its anchor's ground (or floor) at y = `base`. Surface kinds stand on a cobblestone footing;
 * their interiors are air. Chests face +x unless stated; `ruin` decides which wall blocks have fallen.
 */
export function structureCells(seed: number, kind: StructureKind, x: number, z: number, base: number): StructureCell[] {
  const out: StructureCell[] = [];
  const put = (dx: number, y: number, dz: number, state: number) => out.push([dx, y, dz, state]);
  const ruin = (dx: number, y: number, dz: number) => hash2(seed + 400 + y, x + dx, z + dz) < 0.25;
  const box = (r: number, y0: number, y1: number, state: (dx: number, y: number, dz: number) => number | null) => {
    for (let y = y0; y <= y1; y++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const s = state(dx, y, dz);
      if (s !== null) put(dx, y, dz, s);
    }
  };
  const PLANKS = S('planks'), LOG = S('log'), COBBLE = S('cobblestone'), TORCH = S('torch');
  if (kind === 'cabin') {
    // 7×7 log-framed plank hut, partly fallen in, with a table and a chest.
    box(3, base - 2, base - 1, () => COBBLE);
    box(3, base, base + 5, (dx, y, dz) => {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3, corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
      if (y === base) return PLANKS;
      if (y === base + 5) return ruin(dx, y, dz) || hash2(seed + 9, x, z) < 0.4 ? AIR : PLANKS;
      if (corner) return LOG;
      if (edge) return (dx === 0 && dz === -3 && y <= base + 3) || (Math.abs(dz) === 3 && dx === 0 && y === base + 2) || ruin(dx, y, dz) ? AIR : PLANKS;
      return AIR;
    });
    put(2, base + 1, 2, S('chest', 1));
    put(-2, base + 1, 2, S('crafting_table'));
    // A waystone by the door.
    put(2, base + 1, -5, S('waystone'));
    put(2, base, -5, COBBLE);
  } else if (kind === 'tower') {
    // A 5×5 cobblestone watchtower 12 cells high, a ladder up the inside and a chest on the platform.
    box(2, base - 2, base - 1, () => COBBLE);
    box(2, base, base + 13, (dx, y, dz) => {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (y === base || y === base + 11) return dx === -1 && dz === 0 && y === base + 11 ? AIR : COBBLE;
      if (y === base + 12) return edge && (dx + dz) % 2 === 0 ? COBBLE : AIR;
      if (y === base + 13) return AIR;
      if (edge) return dz === -2 && dx === 0 && y <= base + 3 ? AIR : (y === base + 7 && dx === 0) ? S('glass') : COBBLE;
      return dx === -1 && dz === 0 ? S('ladder', 1) : AIR;
    });
    put(1, base + 12, 1, S('chest', 1));
    put(1, base + 12, -1, TORCH);
    put(0, base, -4, S('waystone'));
    put(0, base - 1, -4, COBBLE);
  } else if (kind === 'camp') {
    // A campfire ring with log seats and a chest.
    put(0, base, 0, S('campfire'));
    for (const [dx, dz] of [[2, 0], [-2, 0]] as const) for (let k = -1; k <= 1; k++) put(dx, base, dz + k, LOG);
    put(0, base, 2, S('chest', 3));
    put(2,base,2,S('trading_post'));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) put(dx, base, dz, AIR);
  } else if (kind === 'house') {
    // A 7×7 home with log corners, glass windows, a doorway on the -z side, a bed, a torch and a workbench. Who lives
    // here decides the rest: a farmer has a wheat field, a smith a furnace and an anvil-stone, a herbalist flowers.
    const job = professionAt(seed, x, z);
    box(3, base - 2, base - 1, () => COBBLE);
    box(3, base, base + 8, (dx, y, dz) => {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3, corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
      if (y === base) return PLANKS;
      // Gable ends fill the triangle under the roof; inside, the roof space is open.
      if (y >= base + 5) return Math.abs(dx) === 3 && y - base - 5 < 3 - Math.abs(dz) ? PLANKS : AIR;
      if (corner) return LOG;
      if (edge) {
        if (dx === 0 && dz === -3 && y <= base + 2) return AIR;
        if (y === base + 2 && ((Math.abs(dx) === 3 && dz === 0) || (dz === 3 && dx === 0))) return S('glass');
        return PLANKS;
      }
      return AIR;
    });
    // A pitched roof of plank stairs from eaves overhanging the walls to a ridge along x, and log beams on the walls.
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) put(dx, base + 5 + (4 - Math.abs(dz)), dz, dz === 0 ? PLANKS : S('planks_stairs', dz < 0 ? 2 : 3));
    }
    for (let k = -3; k <= 3; k++) for (const e of [-3, 3]) { put(k, base + 4, e, LOG); put(e, base + 4, k, LOG); }
    put(HOUSE_BED[0], base + 1, HOUSE_BED[1], S('bed', 0));
    put(HOUSE_BED[0] + 1, base + 1, HOUSE_BED[1], S('bed', 4));
    put(-2, base + 1, 2, S('crafting_table'));
    put(-2, base + 1, -2, TORCH);
    put(2, base + 1, -2, TORCH);
    if (job === 'farmer') {
      for (let dx = -3; dx <= 3; dx++) for (const dz of [5, 6]) {
        put(dx, base, dz, dx === 0 ? S('water') : S('farmland'));
        put(dx, base + 1, dz, dx === 0 ? AIR : S('wheat', 1 + ((dx + dz) & 1) * 2));
      }
    } else if (job === 'smith') {
      put(-2, base + 1, 0, S('furnace', 0));
      put(-2, base + 1, -1, S('cobblestone'));
    } else {
      for (let dx = -3; dx <= 3; dx += 2) put(dx, base + 1, -5, S('poppy'));
    }
  } else if (kind === 'sky_island') {
    // A floating island: a grassy disc on a rocky underside that narrows to a point, with a cloud-white hut and a chest.
    for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
      const r = Math.hypot(dx, dz) + hash2(seed + 500, x + dx, z + dz) * 1.2;
      if (r > 7) continue;
      const depth = Math.round((7 - r) * 1.1) + 1;
      for (let k = 0; k < depth; k++) put(dx, base - k, dz, k === 0 ? S('grass') : k < 3 ? S('dirt') : S('stone'));
      if (r < 6.5 && hash2(seed + 501, x + dx, z + dz) < 0.12) put(dx, base + 1, dz, S(hash2(seed + 502, x + dx, z + dz) < 0.5 ? 'dandelion' : 'poppy'));
    }
    box(2, base + 1, base + 4, (dx, y, dz) => {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (y === base + 4) return S('glass');
      if (edge) return dx === 0 && dz === -2 && y <= base + 2 ? AIR : Math.abs(dx) === 2 && Math.abs(dz) === 2 ? LOG : S('glass');
      return AIR;
    });
    put(1, base + 1, 1, S('chest', 1));
    put(-1, base + 1, 1, S('lantern'));
  } else if (kind === 'pyramid') {
    // A sandstone pyramid, eight steps high, with a doorway, a dark hall and a chest at its heart.
    for (let step = 0; step <= 7; step++) box(7 - step, base + step, base + step, () => S('sandstone'));
    box(4, base + 1, base + 3, (dx, _y, dz) => (Math.abs(dx) < 4 && Math.abs(dz) < 4 ? AIR : null));
    for (let dz = -7; dz <= -4; dz++) for (let y = base + 1; y <= base + 2; y++) put(0, y, dz, AIR);
    put(0, base + 1, 2, S('chest', 3));
    put(-3, base + 1, 3, TORCH);
  } else if (kind === 'temple') {
    // An overgrown temple: a cobblestone hall half taken by leaves, with a chest behind the altar stone.
    box(5, base - 1, base + 6, (dx, y, dz) => {
      const shell = Math.abs(dx) === 5 || Math.abs(dz) === 5 || y === base - 1 || y === base + 6;
      if (!shell) return AIR;
      if (dz === -5 && Math.abs(dx) <= 1 && y >= base && y <= base + 2) return AIR;
      return hash2(seed + 510 + y, x + dx, z + dz) < 0.3 ? S('leaves', 1) : y === base + 6 ? S('slate') : S('cobblestone');
    });
    put(0, base, 2, S('slate'));
    put(0, base, 3, S('chest', 3));
    put(-4, base, -4, TORCH);
    put(4, base, -4, TORCH);
  } else if (kind === 'ice_cave') {
    // A dome of ice half sunk in the ground, a doorway on the north side, a frozen chest inside.
    box(5, base - 1, base + 5, (dx, y, dz) => {
      const r = Math.hypot(dx, (y - base) * 1.2, dz);
      if (r > 5.3) return null;
      if (dz <= -3 && Math.abs(dx) <= 1 && y >= base + 1 && y <= base + 2) return AIR;
      return r > 4.2 || y === base - 1 ? S('ice') : y === base ? S('snow') : AIR;
    });
    put(0, base + 1, 2, S('chest', 3));
    put(-2, base + 1, 1, S('lantern'));
  } else if (kind === 'shipwreck') {
    // A sunken ship on the sea floor, listing a little: a planked hull, a broken mast and a chest in the hold.
    box(6, base, base + 4, (dx, y, dz) => {
      const half = Math.max(0, 2.6 - Math.abs(dx) * 0.35) + (y - base) * 0.4;
      if (Math.abs(dx) > 5 || Math.abs(dz) > half + 0.5) return null;
      const hull = Math.abs(dz) > half - 0.5 || y === base;
      if (y === base + 4) return hash2(seed + 520, x + dx, z + dz) < 0.6 ? S('planks') : null;
      return hull ? (hash2(seed + 521 + y, x + dx, z + dz) < 0.15 ? null : S('planks')) : AIR;
    });
    for (let y = base + 1; y <= base + 7; y++) put(1, y, 0, LOG);
    put(-3, base + 1, 0, S('chest', 3));
  } else if (kind === 'altar') {
    // A boss altar: a round floor of slate with a ring of pillars and a glowing stone in the middle.
    for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
      const r = Math.hypot(dx, dz);
      if (r > 7.4) continue;
      put(dx, base, dz, r < 1.5 ? S('glowstone') : S('slate'));
      for (let y = base + 1; y <= base + 5; y++) put(dx, y, dz, AIR);
    }
    for (let a = 0; a < 8; a++) {
      const px = Math.round(Math.cos((a * Math.PI) / 4) * 6), pz = Math.round(Math.sin((a * Math.PI) / 4) * 6);
      for (let y = base + 1; y <= base + 3 + (a % 2); y++) put(px, y, pz, S('cobblestone'));
      put(px, base + 4 + (a % 2), pz, TORCH);
    }
  } else if (kind === 'mine') {
    // Two crossing tunnels, 3 wide and 3 high, with timber frames every 4 cells, torches, and sometimes a chest.
    for (let k = -REACH; k <= REACH; k++) for (let w = -1; w <= 1; w++) for (let h = 0; h < 3; h++) {
      put(k, base + h, w, AIR);
      put(w, base + h, k, AIR);
    }
    for (let k = -REACH + 1; k <= REACH - 1; k += 4) {
      for (const [ax, az] of [[k, 0], [0, k]] as const) {
        const across = ax === 0;
        for (const side of [-2, 2]) for (let h = 0; h < 3; h++) put(across ? side : ax, base + h, across ? az : side, LOG);
        for (let w = -1; w <= 1; w++) put(across ? w : ax, base + 3, across ? az : w, PLANKS);
      }
    }
    put(1, base + 2, 1, TORCH);
    if (hash2(seed + 11, x, z) < 0.5) put(-1, base, 1, S('chest', 2));
  } else if (kind === 'vault') {
    // A dark 9×9 brick room, 5 high, with two chests: monsters come to its darkness.
    box(4, base - 1, base + 5, (dx, y, dz) => {
      const shell = Math.abs(dx) === 4 || Math.abs(dz) === 4 || y === base - 1 || y === base + 5;
      if (shell) return (dz === -4 && Math.abs(dx) <= 1 && y >= base && y <= base + 2) ? AIR : S('brick');
      return AIR;
    });
    put(-3, base, 3, S('chest', 0));
    put(3, base, 3, S('chest', 1));
  } else {
    // The ember shrine: an obsidian chamber with lava channels, and the ancient chest on a pedestal.
    box(4, base - 1, base + 6, (dx, y, dz) => {
      const shell = Math.abs(dx) === 4 || Math.abs(dz) === 4 || y === base - 1 || y === base + 6;
      if (shell) return (dz === -4 && dx === 0 && y >= base && y <= base + 2) ? AIR : S('obsidian');
      if (y === base && Math.abs(dx) === 3 && Math.abs(dz) <= 2) return S('lava');
      return AIR;
    });
    put(0, base, 0, S('obsidian'));
    put(0, base + 1, 0, S('ancient_chest', 3));
    put(-2, base, 2, S('ember_ore'));
    put(2, base, 2, S('ember_ore'));
  }
  return out;
}
