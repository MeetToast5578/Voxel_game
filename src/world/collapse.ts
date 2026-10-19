import { LOOSE_BODY_MIN_GROUP, SUPPORT_NODE_LIMIT, SUPPORT_RADIUS_BLOCKS } from '../config';
import { BlockId, getBlockDef } from './blocks';
import { scheduleFallChecks } from './falling';
import type { Tick, TickResult } from './tick';
import type { World } from './world';

/** The tick reason for a structural support check (spec 25, slice 5). */
export const SUPPORT_REASON = 'support';

/** Six face neighbours. */
const FACES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * A block that can collapse: solid and breakable, and not a leaf (ecology owns leaf decay). Plants, water and air never
 * collapse, and nothing holds them up.
 */
export function collapsible(id: number): boolean {
  if (id === BlockId.AIR || id === BlockId.LEAVES) return false;
  const d = getBlockDef(id);
  return d.solid && d.breakable;
}

/**
 * A block that holds others up without collapsing itself: solid, supporting, and not breakable (bedrock). Leaves are not
 * supports, so a canopy never holds a block up.
 */
function anchor(id: number): boolean {
  return id !== BlockId.AIR && getBlockDef(id).supports && !collapsible(id);
}

/**
 * The group of collapsible blocks that a removal may have left unsupported, around the cell (sx, sy, sz). Returns the
 * group, or null when it is held up. A group is held up when it touches an anchor, when it reaches the edge of the
 * check radius (a long roof or a mountain is not cut off by a local check), when it is too big to check, or when it
 * touches cells that are not loaded. A closed group inside the radius that touches nothing holds nothing up: it falls.
 */
export function unsupportedGroup(world: World, sx: number, sy: number, sz: number): { x: number; y: number; z: number }[] | null {
  const r = SUPPORT_RADIUS_BLOCKS;
  const inside = (x: number, y: number, z: number) => Math.abs(x - sx) <= r && Math.abs(y - sy) <= r && Math.abs(z - sz) <= r;
  const seen = new Set<string>([`${sx},${sy},${sz}`]);
  const group = [{ x: sx, y: sy, z: sz }];
  for (let i = 0; i < group.length; i++) {
    const c = group[i]!;
    for (const [dx, dy, dz] of FACES) {
      const x = c.x + dx;
      const y = c.y + dy;
      const z = c.z + dz;
      if (!world.isLoadedAt(x, y, z)) return null;
      const id = world.getBlock(x, y, z);
      if (anchor(id)) return null;
      if (!collapsible(id)) continue;
      if (!inside(x, y, z)) return null; // the group reaches the radius: held up by terrain beyond it
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      group.push({ x, y, z });
      if (group.length > SUPPORT_NODE_LIMIT) return null;
    }
  }
  return group;
}

/** Schedules a support check for every collapsible neighbour of a cell that was just emptied. */
export function scheduleSupportChecks(world: World, x: number, y: number, z: number): void {
  const due = world.currentTick + 1;
  for (const [dx, dy, dz] of FACES) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (collapsible(world.getBlock(nx, ny, nz))) world.scheduleTick(nx, ny, nz, due, SUPPORT_REASON);
  }
}

/**
 * Runs one support check. If the group of blocks around the cell is unsupported, a block that falls keeps falling
 * (slice 3), and any other block breaks and is queued to drop as an item. Breaking a block checks its neighbours next
 * tick, so a collapse can spread, one step at a time, until it reaches a support.
 */
export function handleSupport(world: World, tick: Tick): TickResult {
  if (!collapsible(world.getBlock(tick.x, tick.y, tick.z))) return 'handled';
  const group = unsupportedGroup(world, tick.x, tick.y, tick.z);
  if (!group) return 'handled';
  for (const c of group) {
    const id = world.getBlock(c.x, c.y, c.z);
    if (getBlockDef(id).falls) {
      scheduleFallChecks(world, c.x, c.y, c.z);
      continue;
    }
    if (world.setBlock(c.x, c.y, c.z, BlockId.AIR)) {
      world.queueDrop(id, c.x, c.y, c.z, group.length >= LOOSE_BODY_MIN_GROUP);
      scheduleSupportChecks(world, c.x, c.y, c.z);
    }
  }
  return 'handled';
}
