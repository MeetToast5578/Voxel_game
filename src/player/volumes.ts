import { VOLUME_MAX_SIZE } from '../config';
import type { Vec3 } from './physics';

/** An integer block position. */
export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** Inclusive bounds of an axis-aligned block region. */
export interface Box {
  min: Cell;
  max: Cell;
}

/** 0 = x, 1 = y, 2 = z. */
export type Axis = 0 | 1 | 2;

export function coordOf(p: Vec3, axis: Axis): number {
  return axis === 0 ? p.x : axis === 1 ? p.y : p.z;
}

/** A copy of c with one coordinate replaced. */
export function withCoord(c: Cell, axis: Axis, value: number): Cell {
  return { x: axis === 0 ? value : c.x, y: axis === 1 ? value : c.y, z: axis === 2 ? value : c.z };
}

/** The two axes other than `normal`, in order. */
export function inPlaneAxes(normal: Axis): [Axis, Axis] {
  return normal === 0 ? [1, 2] : normal === 1 ? [0, 2] : [0, 1];
}

/** Clamps a requested size to 1..VOLUME_MAX_SIZE blocks. */
export function clampSize(size: number): number {
  return Math.min(VOLUME_MAX_SIZE, Math.max(1, Math.round(size)));
}

/**
 * The wall thickness a box or sphere of this size really uses. 0 is solid. Otherwise the wall is at most half the size
 * minus one block, so the cavity inside keeps at least one block.
 */
export function effectiveThickness(size: number, thickness: number): number {
  return Math.max(0, Math.min(Math.round(thickness), Math.floor((size - 1) / 2)));
}

/**
 * The box of a volume of this size centred on a cell. Even sizes reach one block further toward the negative side, so
 * the same cell always gives the same box.
 */
export function volumeBox(centre: Cell, size: number): Box {
  const below = Math.floor(size / 2);
  const above = size - 1 - below;
  return {
    min: { x: centre.x - below, y: centre.y - below, z: centre.z - below },
    max: { x: centre.x + above, y: centre.y + above, z: centre.z + above },
  };
}

/** Cells of a box, inclusive. With thickness > 0, only the shell (the outer layers of that thickness) is kept. */
export function boxCells(box: Box, thickness = 0): Cell[] {
  const out: Cell[] = [];
  for (let y = box.min.y; y <= box.max.y; y++)
    for (let z = box.min.z; z <= box.max.z; z++)
      for (let x = box.min.x; x <= box.max.x; x++) {
        const inside =
          thickness > 0 &&
          x - box.min.x >= thickness &&
          box.max.x - x >= thickness &&
          y - box.min.y >= thickness &&
          box.max.y - y >= thickness &&
          z - box.min.z >= thickness &&
          box.max.z - z >= thickness;
        if (!inside) out.push({ x, y, z });
      }
  return out;
}

/**
 * Cells of a sphere that fills a cube box (a volume from volumeBox). With thickness > 0 only the shell is kept: cells
 * farther from the centre than the radius minus the thickness.
 */
export function sphereCells(box: Box, thickness = 0): Cell[] {
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const radius = (box.max.x - box.min.x + 1) / 2;
  const inner = radius - thickness;
  const out: Cell[] = [];
  for (let y = box.min.y; y <= box.max.y; y++)
    for (let z = box.min.z; z <= box.max.z; z++)
      for (let x = box.min.x; x <= box.max.x; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
        if (d2 > radius * radius) continue;
        if (thickness > 0 && inner > 0 && d2 <= inner * inner) continue;
        out.push({ x, y, z });
      }
  return out;
}

/**
 * A flat layer, size × size cells in the two axes other than `normal`, centred on `base`. It is `thickness` cells deep
 * from base in direction dir. A disc keeps only the cells within size / 2 of the centre.
 */
export function planeCells(base: Cell, normal: Axis, dir: 1 | -1, size: number, thickness: number, disc: boolean): Cell[] {
  const [a, b] = inPlaneAxes(normal);
  const below = Math.floor(size / 2);
  const above = size - 1 - below;
  const mid = (above - below) / 2;
  const r2 = (size / 2) ** 2;
  const out: Cell[] = [];
  for (let k = 0; k < Math.max(1, thickness); k++) {
    const layer = (normal === 0 ? base.x : normal === 1 ? base.y : base.z) + dir * k;
    for (let u = -below; u <= above; u++)
      for (let v = -below; v <= above; v++) {
        if (disc && (u - mid) ** 2 + (v - mid) ** 2 > r2) continue;
        const cell = withCoord(withCoord(withCoord(base, normal, layer), a, coordOf(base, a) + u), b, coordOf(base, b) + v);
        out.push(cell);
      }
  }
  return out;
}

/**
 * The box spanned by `base` and `corner` in the plane across `normal`, `thickness` cells deep from base in direction
 * dir. The corner's coordinate along the normal is ignored.
 */
export function rectBox(base: Cell, corner: Cell, normal: Axis, dir: 1 | -1, thickness: number): Box {
  const lo: number[] = [0, 0, 0];
  const hi: number[] = [0, 0, 0];
  for (const axis of [0, 1, 2] as Axis[]) {
    const b = coordOf(base, axis);
    if (axis === normal) {
      const far = b + dir * (Math.max(1, thickness) - 1);
      lo[axis] = Math.min(b, far);
      hi[axis] = Math.max(b, far);
    } else {
      const c = coordOf(corner, axis);
      lo[axis] = Math.min(b, c);
      hi[axis] = Math.max(b, c);
    }
  }
  return { min: { x: lo[0]!, y: lo[1]!, z: lo[2]! }, max: { x: hi[0]!, y: hi[1]!, z: hi[2]! } };
}

/** The smallest box around some cells, or null when there are none. */
export function boundsOf(cells: readonly Cell[]): Box | null {
  if (cells.length === 0) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of cells) {
    min.x = Math.min(min.x, c.x);
    min.y = Math.min(min.y, c.y);
    min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x);
    max.y = Math.max(max.y, c.y);
    max.z = Math.max(max.z, c.z);
  }
  return { min, max };
}

/**
 * Where the ray origin + t·dir (t > 0) crosses the plane `axis = value`. Null when the ray is parallel to the plane
 * or the crossing lies behind the origin.
 */
export function rayPlaneHit(origin: Vec3, dir: Vec3, axis: Axis, value: number): Vec3 | null {
  const d = coordOf(dir, axis);
  if (Math.abs(d) < 1e-9) return null;
  const t = (value - coordOf(origin, axis)) / d;
  if (t <= 0) return null;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
}

