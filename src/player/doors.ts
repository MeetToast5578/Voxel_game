import { DOOR_HEIGHT, DOOR_WIDTH } from '../config';
import { BlockId, FACINGS, blockVariant, isDoor } from '../world/blocks';

export interface Cell { x: number; y: number; z: number; }

/**
 * The cells of a new door (T-K5) whose bottom corner is at (x, y, z) and whose panel faces `facing` (toward the
 * player): DOOR_HEIGHT up, and DOOR_WIDTH to the right as the player sees it.
 */
export function doorCells(x: number, y: number, z: number, facing: number): Cell[] {
  const [fx, fz] = FACINGS[facing]!;
  const rx = fz, rz = -fx; // the player looks along -facing; their right is that turned a quarter clockwise
  const cells: Cell[] = [];
  for (let w = 0; w < DOOR_WIDTH; w++) for (let h = 0; h < DOOR_HEIGHT; h++) cells.push({ x: x + rx * w, y: y + h, z: z + rz * w });
  return cells;
}

/**
 * Every door cell joined to (x, y, z) through faces with the same facing, open or closed: the whole door, or a double
 * door. Bounded, so a wall of door cells cannot run away.
 */
export function connectedDoor(getBlock: (x: number, y: number, z: number) => number, x: number, y: number, z: number): Cell[] {
  const start = getBlock(x, y, z);
  if (!isDoor(start)) return [];
  const facing = blockVariant(start);
  const seen = new Set<string>([`${x},${y},${z}`]);
  const out: Cell[] = [], queue: Cell[] = [{ x, y, z }];
  const limit = DOOR_WIDTH * DOOR_HEIGHT * 4;
  while (queue.length && out.length < limit) {
    const c = queue.pop()!;
    out.push(c);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy, z: c.z + dz }, key = `${n.x},${n.y},${n.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const state = getBlock(n.x, n.y, n.z);
      if (isDoor(state) && blockVariant(state) === facing) queue.push(n);
    }
  }
  return out;
}

/** The same door cell opened or closed: the facing is kept. */
export function toggledDoor(state: number): number {
  return state >= BlockId.OPEN_DOOR ? BlockId.DOOR + blockVariant(state) : BlockId.OPEN_DOOR + blockVariant(state);
}
