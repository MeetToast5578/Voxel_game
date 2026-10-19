export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyShape {
  /** Half of the body's width on X and Z. */
  halfWidth: number;
  height: number;
}

export interface CollisionResult {
  onGround: boolean;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  /** How far the body rose this move by stepping up onto a ledge, or 0. */
  stepped: number;
}

export type SolidFn = (x: number, y: number, z: number) => boolean;

type Axis = 'x' | 'y' | 'z';

const SKIN = 1e-4;
const HORIZONTAL_AXES = ['x', 'z'] as const;
/** How far depenetration looks for free space, in blocks, and the size of each probe. */
const DEPENETRATE_REACH = 64;
const DEPENETRATE_STEP = 0.5;

/**
 * Moves an axis-aligned box (pos = center of the feet) by vel * dt, one axis at a time (Y, X, Z).
 * Mutates pos, and zeroes the velocity component on each axis that collides.
 * Precondition: the box does not overlap a solid block before the move, and per call each axis moves less than
 * the body's width (X, Z) or height (Y).
 *
 * With stepHeight > 0, a horizontal move that is blocked right after landing in this move's Y phase is retried
 * up to stepHeight higher: if the body fits there, it moves on and settles onto the ledge (result.stepped > 0).
 * With stepHeight 0 (the default) nothing ever steps.
 *
 * If the body somehow ends a move still inside solid, it is pushed out to the nearest free space.
 * Callers are supposed to prevent that (nothing may be placed in the player's body), but a solver
 * that silently drops the player out of the world when they are wrong is not worth trusting.
 */
export function moveAndCollide(
  pos: Vec3, vel: Vec3, dt: number, shape: BodyShape, isSolid: SolidFn, stepHeight = 0,
): CollisionResult {
  const result: CollisionResult = { onGround: false, hitX: false, hitY: false, hitZ: false, stepped: 0 };

  const dy = vel.y * dt;
  if (dy !== 0 && sweepAxis(pos, 'y', dy, shape, isSolid)) {
    if (dy < 0) result.onGround = true;
    vel.y = 0;
    result.hitY = true;
  }

  const canStep = stepHeight > 0 && result.onGround;
  for (const axis of HORIZONTAL_AXES) {
    const d = vel[axis] * dt;
    if (d === 0) continue;
    const start = pos[axis];
    if (!sweepAxis(pos, axis, d, shape, isSolid)) continue;
    const rise = canStep ? tryStep(pos, axis, start, d, stepHeight, shape, isSolid) : 0;
    if (rise > 0) {
      result.stepped += rise;
      continue;
    }
    vel[axis] = 0;
    if (axis === 'x') result.hitX = true;
    else result.hitZ = true;
  }

  // Resolution pushes a body back against whatever it hit, which is the wrong direction entirely
  // when it starts *inside* solid: rising pushes it further down and it ratchets through the floor.
  // Callers keep this out of reach in normal play, so this only runs after a real collision.
  if (result.hitX || result.hitY || result.hitZ) depenetrate(pos, shape, isSolid);

  return result;
}

/**
 * Pushes a body that is inside solid out to the nearest free space, along whichever of the six
 * axis directions frees it soonest. Mutates pos only if the body is actually stuck.
 */
function depenetrate(pos: Vec3, shape: BodyShape, isSolid: SolidFn): void {
  if (!overlapsSolid(pos, shape, isSolid)) return;
  const dirs: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  ];
  let bestX = 0;
  let bestY = 0;
  let bestZ = 0;
  let bestDist = Infinity;
  for (const [dx, dy, dz] of dirs) {
    for (let step = DEPENETRATE_STEP; step <= DEPENETRATE_REACH; step += DEPENETRATE_STEP) {
      if (step >= bestDist) break; // this direction cannot beat the best escape found so far
      if (!overlapsSolid({ x: pos.x + dx * step, y: pos.y + dy * step, z: pos.z + dz * step }, shape, isSolid)) {
        bestX = dx * step;
        bestY = dy * step;
        bestZ = dz * step;
        bestDist = step;
        break;
      }
    }
  }
  // Nothing within the reach (a body walled in on every side): leave it alone rather than teleport
  // it somewhere arbitrary.
  if (bestDist === Infinity) return;
  pos.x += bestX;
  pos.y += bestY;
  pos.z += bestZ;
}

/**
 * Retries a blocked horizontal move stepHeight higher. pos is the blocked result; start is the axis coordinate
 * before the move. On success pos is moved onto the ledge and the rise is returned; on failure pos is untouched
 * and 0 is returned.
 */
function tryStep(
  pos: Vec3, axis: 'x' | 'z', start: number, d: number, stepHeight: number, shape: BodyShape, isSolid: SolidFn,
): number {
  const raised: Vec3 = { x: pos.x, y: pos.y + stepHeight, z: pos.z };
  raised[axis] = start;
  if (overlapsSolid(raised, shape, isSolid)) return 0; // a ceiling is in the way
  if (sweepAxis(raised, axis, d, shape, isSolid)) return 0; // still blocked up there
  if (!sweepAxis(raised, 'y', -stepHeight, shape, isSolid)) return 0; // nothing to stand on
  const rise = raised.y - pos.y;
  if (rise < SKIN) return 0; // settled back at the old height: there was no ledge
  pos.x = raised.x;
  pos.y = raised.y;
  pos.z = raised.z;
  return rise;
}

/**
 * Moves pos along one axis by d. If the box then overlaps solid cells, it is pushed back against the nearest one
 * it entered and true is returned.
 */
function sweepAxis(pos: Vec3, axis: Axis, d: number, shape: BodyShape, isSolid: SolidFn): boolean {
  pos[axis] += d;
  const hw = shape.halfWidth;
  const minX = Math.floor(pos.x - hw), maxX = Math.ceil(pos.x + hw) - 1;
  const minZ = Math.floor(pos.z - hw), maxZ = Math.ceil(pos.z + hw) - 1;
  const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + shape.height) - 1;
  let hitCell: number | null = null;
  for (let y = minY; y <= maxY; y++)
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++)
        if (isSolid(x, y, z)) {
          const cell = axis === 'x' ? x : axis === 'y' ? y : z;
          if (hitCell === null || (d > 0 ? cell < hitCell : cell > hitCell)) hitCell = cell;
        }
  if (hitCell === null) return false;
  const low = axis === 'y' ? 0 : -hw; // box extent below/behind pos on this axis
  const high = axis === 'y' ? shape.height : hw;
  pos[axis] = d > 0 ? hitCell - high - SKIN : hitCell + 1 - low + SKIN;
  return true;
}

/** True if the box at pos overlaps any solid cell. */
function overlapsSolid(pos: Vec3, shape: BodyShape, isSolid: SolidFn): boolean {
  const hw = shape.halfWidth;
  const minX = Math.floor(pos.x - hw), maxX = Math.ceil(pos.x + hw) - 1;
  const minZ = Math.floor(pos.z - hw), maxZ = Math.ceil(pos.z + hw) - 1;
  const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + shape.height) - 1;
  for (let y = minY; y <= maxY; y++)
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}
