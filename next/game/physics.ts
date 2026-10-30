import type { BoxAt } from './collision';

/** An axis-aligned body; (x, y, z) is the centre of its feet. Units are cells. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  halfWidth: number;
  height: number;
  onGround: boolean;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  /** How far the body rose (positive) or dropped (negative) by stepping this move. */
  stepped: number;
}

const SKIN = 1e-5;
const SIXTEENTH = 1 / 16;
/** How far a body stuck inside solid looks for free space, in cells. */
const UNSTICK_REACH = 3;

/**
 * Clips a move of `d` cells along `axis` (0 x, 1 y, 2 z) so the body does not enter any box. Boxes the body already
 * overlaps do not block it, so a body that starts inside solid can still move out.
 */
function clip(b: Body, axis: number, d: number, boxAt: BoxAt): number {
  if (d === 0) return 0;
  const min = [b.x - b.halfWidth, b.y, b.z - b.halfWidth];
  const max = [b.x + b.halfWidth, b.y + b.height, b.z + b.halfWidth];
  const lo = min.slice(), hi = max.slice();
  if (d < 0) lo[axis]! += d;
  else hi[axis]! += d;
  const x0 = Math.floor(lo[0]! + SKIN), x1 = Math.floor(hi[0]! - SKIN);
  const y0 = Math.floor(lo[1]! + SKIN), y1 = Math.floor(hi[1]! - SKIN);
  const z0 = Math.floor(lo[2]! + SKIN), z1 = Math.floor(hi[2]! - SKIN);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(x, y, z);
        if (box === 0) continue;
        const bmin = [x, y + (box & 31) * SIXTEENTH, z], bmax = [x + 1, y + (box >> 5) * SIXTEENTH, z + 1];
        let overlaps = true;
        for (let a = 0; a < 3; a++) {
          if (a !== axis && (bmax[a]! <= min[a]! + SKIN || bmin[a]! >= max[a]! - SKIN)) overlaps = false;
        }
        if (!overlaps) continue;
        if (d > 0 && bmin[axis]! >= max[axis]! - SKIN) d = Math.min(d, bmin[axis]! - max[axis]!);
        else if (d < 0 && bmax[axis]! <= min[axis]! + SKIN) d = Math.max(d, bmax[axis]! - min[axis]!);
      }
    }
  }
  return d;
}

function translate(b: Body, axis: number, d: number): void {
  if (axis === 0) b.x += d;
  else if (axis === 1) b.y += d;
  else b.z += d;
}

/** Whether the body overlaps any box. */
export function overlapsSolid(b: Body, boxAt: BoxAt): boolean {
  const x0 = Math.floor(b.x - b.halfWidth + SKIN), x1 = Math.floor(b.x + b.halfWidth - SKIN);
  const y0 = Math.floor(b.y + SKIN), y1 = Math.floor(b.y + b.height - SKIN);
  const z0 = Math.floor(b.z - b.halfWidth + SKIN), z1 = Math.floor(b.z + b.halfWidth - SKIN);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(x, y, z);
        if (box !== 0 && y + (box >> 5) * SIXTEENTH > b.y + SKIN && y + (box & 31) * SIXTEENTH < b.y + b.height - SKIN) return true;
      }
    }
  }
  return false;
}

/** Moves a body stuck inside solid to the nearest free position, trying up first. Returns false if none is near. */
export function unstick(b: Body, boxAt: BoxAt): boolean {
  if (!overlapsSolid(b, boxAt)) return true;
  const dirs = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];
  const { x, y, z } = b;
  for (let d = SIXTEENTH; d <= UNSTICK_REACH; d += SIXTEENTH) {
    for (const [dx, dy, dz] of dirs) {
      b.x = x + dx! * d;
      b.y = y + dy! * d;
      b.z = z + dz! * d;
      if (!overlapsSolid(b, boxAt)) return true;
    }
  }
  b.x = x;
  b.y = y;
  b.z = z;
  return false;
}

/**
 * Moves a body by its velocity over dt: Y, then X and Z, each clipped against the boxes it would enter.
 *
 * Stepping (stepHeight > 0, for bodies on the ground before or after the vertical move): when a horizontal move is
 * blocked, the same move is tried again from the start, raised by up to stepHeight and then lowered back onto
 * whatever is below; it is kept if it gets further. That is one step per move however many axes are blocked.
 * A body that was on the ground and is not rising also steps down by up to stepHeight, so it stays on stairs.
 */
export function moveBody(b: Body, dt: number, boxAt: BoxAt, stepHeight = 0): MoveResult {
  const wasOnGround = b.onGround;
  const result: MoveResult = { hitX: false, hitY: false, hitZ: false, stepped: 0 };
  if (overlapsSolid(b, boxAt)) unstick(b, boxAt);
  const sx = b.x, sy = b.y, sz = b.z;
  const want = [b.vx * dt, b.vy * dt, b.vz * dt];

  const dy = clip(b, 1, want[1]!, boxAt);
  translate(b, 1, dy);
  b.onGround = false;
  if (dy !== want[1]) {
    result.hitY = true;
    if (want[1]! < 0) b.onGround = true;
  }
  const dx = clip(b, 0, want[0]!, boxAt);
  translate(b, 0, dx);
  const dz = clip(b, 2, want[2]!, boxAt);
  translate(b, 2, dz);
  result.hitX = dx !== want[0];
  result.hitZ = dz !== want[2];

  const canStep = stepHeight > 0 && (wasOnGround || b.onGround) && want[1]! <= 0;
  if (canStep && (result.hitX || result.hitZ)) {
    const ax = b.x, ay = b.y, az = b.z, aGround = b.onGround;
    b.x = sx;
    b.y = sy;
    b.z = sz;
    const up = clip(b, 1, stepHeight, boxAt);
    translate(b, 1, up);
    const sdx = clip(b, 0, want[0]!, boxAt);
    translate(b, 0, sdx);
    const sdz = clip(b, 2, want[2]!, boxAt);
    translate(b, 2, sdz);
    const down = clip(b, 1, -up + Math.min(0, want[1]!), boxAt);
    translate(b, 1, down);
    const landed = down !== -up + Math.min(0, want[1]!);
    if (landed && sdx * sdx + sdz * sdz > (ax - sx) ** 2 + (az - sz) ** 2 + SKIN) {
      result.stepped = b.y - ay;
      result.hitX = sdx !== want[0];
      result.hitZ = sdz !== want[2];
      b.onGround = true;
    } else {
      b.x = ax;
      b.y = ay;
      b.z = az;
      b.onGround = aGround;
    }
  }
  if (stepHeight > 0 && wasOnGround && !b.onGround && want[1]! <= 0) {
    const down = clip(b, 1, -stepHeight, boxAt);
    if (down !== -stepHeight) {
      translate(b, 1, down);
      result.stepped += down;
      b.onGround = true;
    }
  }
  if (result.hitX) b.vx = 0;
  if (result.hitZ) b.vz = 0;
  if (result.hitY || (b.onGround && b.vy < 0)) b.vy = 0;
  return result;
}
