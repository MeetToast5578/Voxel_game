import { TREE_BRANCH_MAX_M, TREE_BRANCH_MIN_M, TREE_REACH_CELLS, cells } from '../config';
import { hash2, mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';

export type TreeSpecies = 'oak' | 'maple' | 'spruce' | 'fir' | 'larch' | 'birch' | 'pine' | 'jungle_giant' | 'palm' |
  'baobab' | 'acacia' | 'willow' | 'mangrove' | 'saguaro' | 'dead_snag' | 'bush';

interface SpeciesDef {
  heightM: [number, number];
  /** Branches with a leaf cluster at each end. */
  branches: [number, number];
  /** Leaf cluster radius at branch ends; 0 for a tree without foliage. */
  blobM: number;
  /** Fraction of the height where the bare trunk ends, and the crown radius as a fraction of the height. */
  crownBase: number;
  crownRadius: number;
  shape: 'round' | 'flat' | 'cone' | 'palm' | 'cactus' | 'snag';
}

/** Species in meters (the old table was in 0.3 m blocks: heights 27-40 blocks are 8.1-12 m). */
export const SPECIES: Record<TreeSpecies, SpeciesDef> = {
  oak: { heightM: [8.1, 12], branches: [2, 4], blobM: 1.2, crownBase: 0.45, crownRadius: 0.5, shape: 'round' },
  maple: { heightM: [8.1, 10.5], branches: [2, 4], blobM: 1.2, crownBase: 0.4, crownRadius: 0.55, shape: 'round' },
  spruce: { heightM: [9, 12], branches: [0, 0], blobM: 0.9, crownBase: 0.55, crownRadius: 0.3, shape: 'cone' },
  fir: { heightM: [9.9, 12], branches: [0, 0], blobM: 0.6, crownBase: 0.5, crownRadius: 0.18, shape: 'cone' },
  larch: { heightM: [8.1, 10.5], branches: [0, 0], blobM: 0.9, crownBase: 0.45, crownRadius: 0.35, shape: 'cone' },
  birch: { heightM: [8.1, 10.5], branches: [2, 3], blobM: 0.9, crownBase: 0.5, crownRadius: 0.4, shape: 'round' },
  pine: { heightM: [9, 12], branches: [1, 2], blobM: 0.6, crownBase: 0.6, crownRadius: 0.25, shape: 'round' },
  jungle_giant: { heightM: [10.8, 12], branches: [3, 6], blobM: 1.5, crownBase: 0.4, crownRadius: 0.6, shape: 'round' },
  palm: { heightM: [8.1, 9.6], branches: [0, 0], blobM: 1.2, crownBase: 0.5, crownRadius: 0.45, shape: 'palm' },
  baobab: { heightM: [8.1, 10.5], branches: [3, 5], blobM: 0.9, crownBase: 0.5, crownRadius: 0.4, shape: 'flat' },
  acacia: { heightM: [6, 9], branches: [3, 5], blobM: 0.9, crownBase: 0.6, crownRadius: 0.5, shape: 'flat' },
  willow: { heightM: [8.1, 10.5], branches: [3, 5], blobM: 1.2, crownBase: 0.4, crownRadius: 0.5, shape: 'round' },
  mangrove: { heightM: [8.1, 9.9], branches: [3, 5], blobM: 0.9, crownBase: 0.55, crownRadius: 0.35, shape: 'round' },
  saguaro: { heightM: [8.1, 9.9], branches: [2, 4], blobM: 0, crownBase: 1, crownRadius: 0, shape: 'cactus' },
  dead_snag: { heightM: [8.1, 9.9], branches: [0, 2], blobM: 0, crownBase: 1, crownRadius: 0, shape: 'snag' },
  bush: { heightM: [0.9, 1.8], branches: [0, 0], blobM: 0.6, crownBase: 0.3, crownRadius: 0.8, shape: 'round' },
};

const LOG = BLOCKS.state('log'), LEAVES = BLOCKS.state('leaves'), CACTUS = BLOCKS.state('cactus');
const SALT = 7;

/**
 * The cells of the tree at anchor (ax, az) standing on `ground` (the cell below its trunk), as packed offsets
 * (dx, dy, dz) → state. Deterministic in the seed and anchor, so every chunk that asks builds the same tree.
 * Nothing reaches further than TREE_REACH_CELLS from the anchor horizontally.
 */
export function treeCells(seed: number, ax: number, az: number, species: TreeSpecies): Map<number, number> {
  const def = SPECIES[species];
  const rng = mulberry32(Math.floor(hash2(seed + SALT, ax, az) * 4294967296));
  const between = ([a, b]: [number, number]) => a + rng() * (b - a);
  const height = Math.max(1, Math.round(cells(between(def.heightM))));
  const out = new Map<number, number>();
  const R = TREE_REACH_CELLS;
  const put = (dx: number, dy: number, dz: number, s: number) => {
    if (Math.abs(dx) > R || Math.abs(dz) > R || dy < 1) return;
    const key = ((dy * 64) + (dz + 32)) * 64 + (dx + 32);
    if (s === LEAVES && out.has(key)) return;
    out.set(key, s);
  };
  const crown = (cx: number, cy: number, cz: number, rx: number, ry: number) => {
    for (let dy = -ry; dy <= ry; dy++) for (let dz = -rx; dz <= rx; dz++) for (let dx = -rx; dx <= rx; dx++) {
      if ((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rx) ** 2 <= 1 + (rng() - 0.5) * 0.3) put(cx + dx, cy + dy, cz + dz, LEAVES);
    }
  };
  const crownBase = Math.max(1, Math.round(height * (def.crownBase + 0.1 * rng())));
  const crownR = Math.max(1, Math.min(R, Math.round(height * def.crownRadius * (0.7 + 0.6 * rng()))));

  if (def.shape === 'cactus') {
    for (let y = 1; y <= height; y++) put(0, y, 0, CACTUS);
    const arms = Math.round(between(def.branches)), first = Math.floor(rng() * 4);
    for (let i = 0; i < arms; i++) {
      const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][(first + i) % 4]!;
      const base = Math.floor(height * (0.4 + rng() * 0.25));
      put(dx!, base, dz!, CACTUS);
      for (let y = base; y <= Math.min(height - 1, base + Math.floor(height * 0.25)); y++) put(dx!, y, dz!, CACTUS);
    }
    return out;
  }
  if (def.shape === 'cone') {
    for (let y = 1; y < height; y++) put(0, y, 0, LOG);
    for (let y = crownBase; y <= height; y++) {
      const tier = species === 'larch' && y % 2 === 0 ? 0.5 : 1;
      const r = Math.round((crownR * (height - y) / Math.max(1, height - crownBase)) * tier);
      for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) if (x * x + z * z <= r * r + 0.5) put(x, y, z, LEAVES);
    }
    put(0, height, 0, LEAVES);
    return out;
  }
  if (def.shape === 'palm') {
    for (let y = 1; y < height; y++) put(0, y, 0, LOG);
    put(0, height, 0, LEAVES);
    const reach = Math.max(2, cells(def.blobM * 2));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      for (let k = 1; k <= reach; k++) put(dx * k, height - Math.floor((k * k) / (reach * 2)), dz * k, LEAVES);
    }
    return out;
  }
  // Round crowns and snags: a trunk, branches with leaf clusters at their ends, and a crown on top.
  const trunkTop = def.shape === 'snag' ? height : crownBase;
  for (let y = 1; y <= trunkTop; y++) put(0, y, 0, LOG);
  const blob = def.blobM > 0 ? Math.max(1, cells(def.blobM)) : 0;
  const branches = Math.round(between(def.branches));
  for (let i = 0; i < branches; i++) {
    const angle = rng() * Math.PI * 2;
    const steps = cells(TREE_BRANCH_MIN_M + (TREE_BRANCH_MAX_M - TREE_BRANCH_MIN_M) * rng());
    let x = 0, z = 0, y = Math.max(2, Math.round(trunkTop * (0.5 + 0.4 * rng())));
    for (let k = 1; k <= steps; k++) {
      const nx = Math.round(Math.cos(angle) * k), nz = Math.round(Math.sin(angle) * k);
      if (rng() < 0.4) y++;
      x = nx;
      z = nz;
      put(x, y, z, LOG);
    }
    if (blob) crown(x, y, z, blob, blob);
  }
  if ((def.shape === 'round' || def.shape === 'flat') && blob) {
    // Acacias and baobabs have a flat crown; the others one as tall as half the space above the bare trunk.
    const ry = def.shape === 'flat' ? 1 : Math.max(1, Math.min(Math.ceil((height - crownBase) / 2), Math.floor(height / 2)));
    crown(0, height - ry, 0, crownR, ry);
  }
  return out;
}

/** Unpacks a key of `treeCells` into [dx, dy, dz]. */
export function unpackTreeCell(key: number): [number, number, number] {
  return [(key & 63) - 32, Math.floor(key / 4096), ((key >> 6) & 63) - 32];
}

/** The tallest any tree rises above its ground, in cells. */
export const MAX_TREE_CELLS = Math.max(...Object.values(SPECIES).map((s) => cells(s.heightM[1]))) + 3;
