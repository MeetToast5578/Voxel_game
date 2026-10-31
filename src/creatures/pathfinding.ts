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
/** Offsets from the start cell are packed into one number; searches never go further than this. */
const R = 512;
const pack = (dx: number, dy: number, dz: number) => ((dx + R) * 2 * R + (dy + R)) * 2 * R + (dz + R);

/**
 * A* on the cell grid (ported from the old game): from feet cell (x, y, z) towards (tx, ty, tz), walking on solid
 * ground, rising at most `step` and dropping at most `fall` between columns, with `height` cells of room. Returns the
 * cells after the start as flat x, y, z triples, ending at the goal or, when it is not reached within the node budget,
 * at the cell found nearest to it. Empty when stuck.
 */
export function findPath(isSolid: (x: number, y: number, z: number) => boolean, x0: number, y0: number, z0: number,
  tx: number, ty: number, tz: number, limits: PathLimits): number[] {
  const clear = (x: number, y: number, z: number) => {
    for (let h = 0; h < limits.height; h++) if (isSolid(x, y + h, z)) return false;
    return true;
  };
  const standable = (x: number, y: number, z: number) => isSolid(x, y - 1, z) && clear(x, y, z);
  const h = (x: number, y: number, z: number) => Math.abs(x - tx) + Math.abs(y - ty) + Math.abs(z - tz);
  const start = pack(0, 0, 0);
  // Open list as parallel arrays: cell key, g, f.
  const open: number[] = [start], openG: number[] = [0], openF: number[] = [h(x0, y0, z0)];
  const came = new Map<number, number>([[start, -1]]);
  const cost = new Map<number, number>([[start, 0]]);
  let best = start, bestH = h(x0, y0, z0), expanded = 0;
  const unpack = (k: number): [number, number, number] =>
    [Math.floor(k / (4 * R * R)) - R + x0, (Math.floor(k / (2 * R)) % (2 * R)) - R + y0, (k % (2 * R)) - R + z0];
  while (open.length > 0 && expanded < limits.maxNodes) {
    let i = 0;
    for (let k = 1; k < open.length; k++) if (openF[k]! < openF[i]!) i = k;
    const key = open[i]!, g = openG[i]!;
    open[i] = open[open.length - 1]!;
    openG[i] = openG[openG.length - 1]!;
    openF[i] = openF[openF.length - 1]!;
    open.pop();
    openG.pop();
    openF.pop();
    expanded++;
    const [cx, cy, cz] = unpack(key), d = h(cx, cy, cz);
    if (d < bestH) {
      best = key;
      bestH = d;
    }
    if (d === 0) break;
    for (const [dx, dz] of DIRS) {
      const x = cx + dx, z = cz + dz;
      if (Math.abs(x - x0) >= R || Math.abs(z - z0) >= R) continue;
      // The highest landing within reach: up a ledge first, else straight on, else down.
      let ny = NaN;
      for (let dy = limits.step; dy >= -limits.fall; dy--) {
        const y = cy + dy;
        if (dy > 0 && !clear(cx, cy + limits.height, cz)) continue; // no headroom to climb
        if (standable(x, y, z)) {
          ny = y;
          break;
        }
        if (dy <= 0 && isSolid(x, y, z)) break; // a wall in the way below this height
      }
      if (Number.isNaN(ny) || Math.abs(ny - y0) >= R) continue;
      const k = pack(x - x0, ny - y0, z - z0), ng = g + 1 + Math.max(0, ny - cy);
      if (ng >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, ng);
      came.set(k, key);
      open.push(k);
      openG.push(ng);
      openF.push(ng + h(x, ny, z));
    }
  }
  const path: number[] = [];
  for (let k = best; k !== start && k !== -1; k = came.get(k)!) path.unshift(...unpack(k));
  return path;
}
