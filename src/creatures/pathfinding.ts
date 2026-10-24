export interface PathCell { x: number; y: number; z: number; }

export interface PathLimits {
  /** Cells of clear space a walker needs above its feet. */
  height: number;
  /** Highest rise and deepest drop between neighbouring cells, in cells. */
  step: number;
  fall: number;
  /** Nodes expanded before giving up. */
  maxNodes: number;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * A* on the voxel grid (T-H6): from feet cell `from` to `to`, walking on solid ground, rising at most `step` and
 * dropping at most `fall` between columns, with `height` cells of room. Returns the cells after `from`, ending at
 * the goal or, when it cannot be reached within the node budget, at the cell found nearest to it. Empty if stuck.
 */
export function findPath(isSolid: (x: number, y: number, z: number) => boolean, from: PathCell, to: PathCell, limits: PathLimits): PathCell[] {
  const clear = (x: number, y: number, z: number) => {
    for (let h = 0; h < limits.height; h++) if (isSolid(x, y + h, z)) return false;
    return true;
  };
  const standable = (x: number, y: number, z: number) => isSolid(x, y - 1, z) && clear(x, y, z);
  const key = (c: PathCell) => `${c.x},${c.y},${c.z}`;
  const h = (c: PathCell) => Math.abs(c.x - to.x) + Math.abs(c.y - to.y) + Math.abs(c.z - to.z);
  const open: { cell: PathCell; f: number; g: number }[] = [{ cell: from, f: h(from), g: 0 }];
  const came = new Map<string, PathCell | null>([[key(from), null]]);
  const cost = new Map<string, number>([[key(from), 0]]);
  let best = from, bestH = h(from), expanded = 0;
  while (open.length && expanded < limits.maxNodes) {
    let i = 0;
    for (let k = 1; k < open.length; k++) if (open[k]!.f < open[i]!.f) i = k;
    const { cell, g } = open.splice(i, 1)[0]!;
    expanded++;
    if (cell.x === to.x && cell.y === to.y && cell.z === to.z) { best = cell; break; }
    if (h(cell) < bestH) { best = cell; bestH = h(cell); }
    for (const [dx, dz] of DIRS) {
      const x = cell.x + dx, z = cell.z + dz;
      // The highest landing within reach: up a ledge first, else straight on, else down.
      let next: PathCell | null = null;
      for (let dy = limits.step; dy >= -limits.fall; dy--) {
        const y = cell.y + dy;
        if (dy > 0 && !clear(cell.x, cell.y + limits.height, cell.z)) continue; // no headroom to climb
        if (standable(x, y, z)) { next = { x, y, z }; break; }
        if (dy <= 0 && isSolid(x, y, z)) break; // a wall in the way below this height
      }
      if (!next) continue;
      const k = key(next), ng = g + 1 + Math.max(0, next.y - cell.y);
      if (ng >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, ng);
      came.set(k, cell);
      open.push({ cell: next, g: ng, f: ng + h(next) });
    }
  }
  const path: PathCell[] = [];
  for (let c: PathCell | null | undefined = best; c && key(c) !== key(from); c = came.get(key(c))) path.push(c);
  return path.reverse();
}
