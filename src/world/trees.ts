import { roundBlocks, TREE_HEIGHT_MAX_M, TREE_HEIGHT_MIN_M } from '../config';
import { hash2, mulberry32 } from '../core/random';
import { BlockId } from './blocks';

/** The highest a tree's blocks reach above its ground block, in blocks. Chunk slices use it to skip trees. */
export const MAX_TREE_RISE = roundBlocks(TREE_HEIGHT_MAX_M) + 2;

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
 * The blocks of the tree rooted at ground block (ax, ground, az): a 1-block trunk, 4–6 branches and a leaf crown,
 * with a rough edge. A pure function of its arguments, so any chunk asking gets the same list. The caller keeps only
 * the blocks that fall in its own range. Leaves never replace logs, and every log touches the trunk through logs.
 */
export function treeBlocks(seed: number, ax: number, ground: number, az: number): TreeBlock[] {
  const rng = mulberry32(Math.floor(hash2(seed + TREE_SALT, ax, az) * 4294967296)); // hash2 is a fraction, not a seed
  const height = roundBlocks(TREE_HEIGHT_MIN_M + (TREE_HEIGHT_MAX_M - TREE_HEIGHT_MIN_M) * rng());
  const crownBase = Math.round(height * (0.45 + 0.15 * rng())); // top of the bare trunk, above ground
  const crownRadius = roundBlocks(3 + 0.6 * rng()); // 5–6 blocks, about 3–3.6 m
  // The crown runs from the top of the bare trunk to the top of the tree, so the trunk top is always under leaves.
  const crownRy = Math.max(2, Math.ceil((height - crownBase) / 2));

  // Keys are relative to the ground block. A log overwrites a leaf in the same cell; a leaf never overwrites one.
  const cells = new Map<string, TreeBlock>();
  const put = (dx: number, dy: number, dz: number, id: number) => {
    const key = `${dx},${dy},${dz}`;
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

  put(0, 0, 0, BlockId.DIRT);
  for (let dy = 1; dy <= crownBase; dy++) put(0, dy, 0, BlockId.LOG);

  const branches = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < branches; i++) {
    const angle = rng() * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const shareX = Math.abs(cosA) / (Math.abs(cosA) + Math.abs(sinA)); // chance a step moves along X
    const signX = Math.sign(cosA) || 1;
    const signZ = Math.sign(sinA) || 1;
    const steps = 2 + Math.floor(rng() * 3); // 2–4 horizontal blocks out
    const rise = 0.2 + 0.4 * rng(); // blocks gained per horizontal block
    let x = 0;
    let z = 0;
    let y = Math.max(2, Math.round(crownBase * (0.5 + 0.4 * rng())));
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
    crown(x, y, z, 2, 2, 2);
  }

  crown(0, height - crownRy, 0, crownRadius, crownRy, crownRadius);
  return Array.from(cells.values());
}
