import {
  TREE_BRANCH_MAX_M,
  TREE_DROOP_FRACTION,
  WILLOW_CURTAIN_DENSITY,
  PALM_FROND_REACH_BLOCKS,
  MANGROVE_ROOT_REACH_BLOCKS,
  SAGUARO_ARM_REACH_BLOCKS,
  TREE_BRANCH_MIN_M,
  TREE_REACH,
  TREE_SPECIES,
  roundBlocks,
  type TreeSpecies,
  treeSpeciesDef,
} from '../config';
import { hash2, mulberry32 } from '../core/random';
import { BlockId } from './blocks';

/** The highest a tree's blocks reach above its ground block, in blocks. Chunk slices use it to skip trees. */
export const MAX_TREE_RISE = Math.max(...TREE_SPECIES.map((s) => s.heightMaxBlocks)) + 2;

/** One block of a tree, in world coordinates. */
export interface TreeBlock {
  x: number;
  y: number;
  z: number;
  id: number;
}

/** Keeps tree shapes from repeating the anchor test, which uses the seed on its own. */
const TREE_SALT = 7;

/**
 * The blocks of a tree rooted at ground block (ax, ground, az), of the given species.
 * A pure function of its arguments, so any chunk asking gets the same list. The caller keeps only
 * the blocks that fall in its own range. Leaves never replace logs, and every log touches the trunk through logs.
 */
export function treeBlocks(seed: number, ax: number, ground: number, az: number, species: TreeSpecies = 'oak'): TreeBlock[] {
  const def = treeSpeciesDef(species)!;
  const rng = mulberry32(Math.floor(hash2(seed + TREE_SALT, ax, az) * 4294967296)); // hash2 is a fraction, not a seed
  // Species heights are already in blocks; the crown radius is a fraction of that height, also in blocks.
  const height = def.heightMinBlocks + Math.floor(rng() * (def.heightMaxBlocks - def.heightMinBlocks + 1));
  const trunkWidth = def.trunkWidth;
  const crownBase = Math.round(height * (def.crownBaseFraction + 0.1 * rng())); // top of the bare trunk, above ground
  // Clamped to TREE_REACH so the crown never reaches past the extent the generator reserves for a tree.
  const crownRadius = Math.max(2, Math.min(TREE_REACH, Math.round(height * def.crownRadiusFactor * (0.7 + 0.6 * rng()))));
  // crownRy is bounded so the crown never reaches below the ground block, even for a short species.
  const crownRy = species === 'acacia' || species === 'baobab' ? 2 :
    Math.max(1, Math.min(Math.ceil((height - crownBase) / 2), Math.floor(height / 2)));

  // Keys are relative to the ground block. A log overwrites a leaf in the same cell; a leaf never overwrites one.
  // Cells are keyed by a number, not a string: this runs for every block of every tree, and a string key is slow.
  const cells = new Map<number, TreeBlock>();
  const put = (dx: number, dy: number, dz: number, id: number) => {
    const key = ((dy + 128) * 256 + (dz + 128)) * 256 + (dx + 128);
    if (id === BlockId.LEAVES && cells.has(key)) return;
    cells.set(key, { x: ax + dx, y: ground + dy, z: az + dz, id });
  };
  /** Leaves in an ellipsoid. The random jitter is drawn for every cell, so the shape never depends on clipping. */
  const crown = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
    for (let dy = -ry; dy <= ry; dy++)
      for (let dz = -rz; dz <= rz; dz++)
        for (let dx = -rx; dx <= rx; dx++) {
          const d = (dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2;
          if (d <= 1 + (rng() - 0.5) * 0.3) put(cx + dx, cy + dy, cz + dz, BlockId.LEAVES);
        }
  };

  // Cacti retain their sandy footing; wetland trunks are rooted in soil.
  put(0, 0, 0, species === 'saguaro' ? BlockId.SAND : BlockId.DIRT);

  if (species === 'saguaro') {
    // A columnar cactus with connected, upward-turning arms; never wood or leaves.
    for (let y = 1; y <= height; y++) put(0, y, 0, BlockId.CACTUS);
    const arms = def.branchMinBlocks + Math.floor(rng() * (def.branchMaxBlocks - def.branchMinBlocks + 1));
    const firstDirection = Math.floor(rng() * 4);
    for (let i = 0; i < arms; i++) {
      const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][(firstDirection + i) % 4]!;
      const base = Math.floor(height * (0.4 + rng() * 0.25));
      const reach = Math.min(TREE_REACH, SAGUARO_ARM_REACH_BLOCKS);
      for (let k = 1; k <= reach; k++) put(dx! * k, base, dz! * k, BlockId.CACTUS);
      const top = Math.min(height - 2, base + Math.floor(height * (0.15 + rng() * 0.15)));
      for (let y = base; y <= top; y++) put(dx! * reach, y, dz! * reach, BlockId.CACTUS);
    }
    return Array.from(cells.values());
  }

  if (species === 'spruce' || species === 'fir' || species === 'larch') {
    // Tapered conifer crowns: fir is narrow; larch exposes tier gaps rather than a round broadleaf blob.
    for (let y = 1; y < height; y++) put(0, y, 0, BlockId.LOG);
    for (let y = crownBase; y <= height; y++) {
      const tier = species === 'larch' && y % 4 === 0 ? 0.45 : 1;
      const radius = Math.max(0, Math.round(crownRadius * (height - y) / (height - crownBase) * tier));
      for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++)
        if (x * x + z * z <= radius * radius) put(x, y, z, BlockId.LEAVES);
    }
    return Array.from(cells.values());
  }
  if (species === 'palm') {
    // A clean trunk carries eight long, drooping fronds, rather than low woody branches.
    for (let y = 1; y < height; y++) put(0, y, 0, BlockId.LOG);
    put(0, height, 0, BlockId.LEAVES);
    const reach = Math.min(TREE_REACH, PALM_FROND_REACH_BLOCKS);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const) {
      for (let k = 1; k <= reach; k++) {
        const y = height - Math.floor(k * k / (reach * 2));
        put(dx * k, y, dz * k, BlockId.LEAVES);
        put(dx * (k - 1), y, dz * k, BlockId.LEAVES);
        if (k < reach) put(dx * k, y - 1, dz * k, BlockId.LEAVES);
      }
    }
    return Array.from(cells.values());
  }

  if (species === 'mangrove') {
    // Prop roots rise inward one axis at a time, remaining face-connected to the trunk.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let k = MANGROVE_ROOT_REACH_BLOCKS; k >= 1; k--) {
        const y = MANGROVE_ROOT_REACH_BLOCKS - k + 1;
        put(dx * k, y, dz * k, BlockId.LOG);
        put(dx * (k - 1), y, dz * (k - 1), BlockId.LOG);
        put(dx * (k - 1), y + 1, dz * (k - 1), BlockId.LOG);
      }
    }
  }

  // Trunk: width x width column from ground up to crown base
  const trunkOffset = Math.floor((trunkWidth - 1) / 2);
  for (let dy = 1; dy <= crownBase; dy++)
    for (let dz = 0; dz < trunkWidth; dz++) for (let dx = 0; dx < trunkWidth; dx++)
      put(dx - trunkOffset, dy, dz - trunkOffset, BlockId.LOG);

  // Branches
  const branchCount = def.branchMinBlocks + Math.floor(rng() * (def.branchMaxBlocks - def.branchMinBlocks + 1));
  // Zero is deliberate: dead snags keep their logs but grow neither branch blobs nor a canopy.
  const hasFoliage = def.blobRadiusBlocks > 0;
  const blob = Math.max(1, def.blobRadiusBlocks);
  for (let i = 0; i < branchCount; i++) {
    const angle = rng() * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const shareX = Math.abs(cosA) / (Math.abs(cosA) + Math.abs(sinA)); // chance a step moves along X
    const signX = Math.sign(cosA) || 1;
    const signZ = Math.sign(sinA) || 1;
    const steps = roundBlocks(TREE_BRANCH_MIN_M + (TREE_BRANCH_MAX_M - TREE_BRANCH_MIN_M) * rng()); // out
    const rise = 0.2 + 0.4 * rng(); // blocks gained per horizontal block
    let x = 0;
    let z = 0;
    let y = species === 'acacia' || species === 'baobab' ? crownBase :
      Math.max(2, Math.round(crownBase * (0.5 + 0.4 * rng())));
    let climb = 0;
    // Each step moves along one axis, so every log touches the one before it.
    for (let k = 0; k < steps; k++) {
      climb += rise;
      if (climb >= 1) {
        climb -= 1;
        y++;
        put(x, y, z, BlockId.LOG);
      }
      if (rng() < shareX) x += signX;
      else z += signZ;
      put(x, y, z, BlockId.LOG);
    }
    if (hasFoliage) crown(x, y, z, blob, blob, blob);
  }

  if (hasFoliage) crown(0, height - crownRy, 0, crownRadius, crownRy, crownRadius);
  if (species === 'willow') {
    // Hanging curtains start at existing crown leaves, so they cannot float above the canopy.
    const starts = Array.from(cells.values()).filter((b) => b.id === BlockId.LEAVES &&
      Math.hypot(b.x - ax, b.z - az) >= crownRadius * 0.75);
    const bottoms = new Map<string, TreeBlock>();
    for (const b of starts) {
      const key = `${b.x},${b.z}`;
      if (!bottoms.has(key) || bottoms.get(key)!.y > b.y) bottoms.set(key, b);
    }
    for (const b of bottoms.values()) {
      if (rng() > WILLOW_CURTAIN_DENSITY) continue;
      const length = Math.floor(height * TREE_DROOP_FRACTION * (0.5 + 0.5 * rng()));
      for (let k = 1; k <= length && b.y - ground - k > 1; k++)
        put(b.x - ax, b.y - ground - k, b.z - az, BlockId.LEAVES);
    }
  }
  return Array.from(cells.values());
}
