import { BlockId } from './blocks';

/** A leaf block joined to a log through other leaves: its world position and its distance from the removed log. */
export interface LeafRef {
  x: number;
  y: number;
  z: number;
  /** BFS depth from the broken log, so a canopy can fade outward instead of vanishing at once. */
  depth: number;
}

/** The six face neighbours. */
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * The leaves held up only by the log whose cell (x, y, z) was just emptied.
 *
 * A breadth-first walk from the six neighbours, through leaves and logs. If it reaches any
 * log the canopy is still supported and the result is empty. Otherwise every leaf it reached
 * is orphaned, tagged with its distance from the removed log. The walk is capped at `limit`
 * leaves so a pathological canopy cannot stall a frame.
 */
export function orphanedLeaves(
  getBlock: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  limit = 4096,
): LeafRef[] {
  const seen = new Set<string>();
  const leaves: LeafRef[] = [];
  const queue: LeafRef[] = [];

  const visit = (nx: number, ny: number, nz: number, depth: number): 'log' | 'leaf' | 'none' => {
    const key = `${nx},${ny},${nz}`;
    if (seen.has(key)) return 'none';
    seen.add(key);
    const id = getBlock(nx, ny, nz);
    if (id === BlockId.LOG) return 'log';
    if (id === BlockId.LEAVES) {
      queue.push({ x: nx, y: ny, z: nz, depth });
      return 'leaf';
    }
    return 'none';
  };

  for (const [dx, dy, dz] of NEIGHBORS) {
    if (visit(x + dx, y + dy, z + dz, 1) === 'log') return [];
  }

  for (let i = 0; i < queue.length && leaves.length < limit; i++) {
    const leaf = queue[i]!;
    leaves.push(leaf);
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (visit(leaf.x + dx, leaf.y + dy, leaf.z + dz, leaf.depth + 1) === 'log') return [];
    }
  }
  return leaves;
}
