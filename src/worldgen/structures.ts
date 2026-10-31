import { BLOCK_SIZE_M, TREE_REACH_CELLS } from '../config';
import { hash2 } from '../core/random';
import { BLOCKS } from '../engine/blocks';

export type StructureKind = 'cabin' | 'tower' | 'camp' | 'mine' | 'vault' | 'shrine';

/** A structure cell relative to the site: x and z from its anchor, y absolute; then the state. */
export type StructureCell = readonly [dx: number, y: number, dz: number, state: number];

/**
 * Where each kind may stand: grid size (m), chance a grid cell has one, and for underground kinds the depth band (m).
 * One site per grid cell at a jittered spot, so sites are spread out and every decision is local.
 */
const KINDS: Record<StructureKind, { gridM: number; chance: number; salt: number; depth?: readonly [number, number] }> = {
  cabin: { gridM: 160, chance: 0.5, salt: 71 },
  tower: { gridM: 260, chance: 0.5, salt: 72 },
  camp: { gridM: 190, chance: 0.5, salt: 73 },
  mine: { gridM: 110, chance: 0.6, salt: 74, depth: [-55, -20] },
  vault: { gridM: 260, chance: 0.7, salt: 75, depth: [-95, -70] },
  // The goal structure: in every 600 m grid cell, deep down.
  shrine: { gridM: 600, chance: 1, salt: 76, depth: [-130, -110] },
};
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
  return [gx * size + REACH + Math.floor(hash2(seed + k.salt + 100, gx, gz) * span), gz * size + REACH + Math.floor(hash2(seed + k.salt + 200, gx, gz) * span)];
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
  } else if (kind === 'camp') {
    // A campfire ring with log seats and a chest.
    put(0, base, 0, S('campfire'));
    for (const [dx, dz] of [[2, 0], [-2, 0]] as const) for (let k = -1; k <= 1; k++) put(dx, base, dz + k, LOG);
    put(0, base, 2, S('chest', 3));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) put(dx, base, dz, AIR);
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
