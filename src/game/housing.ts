import { BLOCKS } from '../engine/blocks';
import { COLLISION } from './collision';

/** A room is a home with at least this many open cells inside, and at most this many (more means it is not closed). */
export const MIN_ROOM_CELLS = 24;
export const MAX_ROOM_CELLS = 600;
const TABLES = new Set(['crafting_table', 'alchemy_table', 'wooden_table']);

export interface RoomCheck { ok: boolean; cells: number; missing: string[] }

/**
 * Whether the room around open cell (x, y, z) is a home: closed all round (walls, floor and roof, no gap the open air
 * gets through), at least MIN_ROOM_CELLS big, with a door, a light, and a table or workbench in or on its walls.
 * A flood fill through open cells; doors count as wall. `get` gives a cell's state (0 where nothing is loaded).
 */
export function checkRoom(get: (x: number, y: number, z: number) => number, x: number, y: number, z: number): RoomCheck {
  const seen = new Set<string>(), queue: [number, number, number][] = [[x, y, z]];
  let door = false, light = false, table = false, closed = true;
  const look = (s: number) => {
    const t = BLOCKS.type(s);
    door ||= t.key === 'door';
    light ||= (t.lightEmission ?? 0) > 0;
    table ||= TABLES.has(t.key);
  };
  while (queue.length) {
    const [cx, cy, cz] = queue.pop()!, key = `${cx},${cy},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > MAX_ROOM_CELLS) { closed = false; break; }
    look(get(cx, cy, cz));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, s = get(nx, ny, nz);
      if (COLLISION[s] === 0 && BLOCKS.type(s).key !== 'door') queue.push([nx, ny, nz]);
      else look(s);
    }
  }
  const missing: string[] = [];
  if (!closed) missing.push('walls, a floor and a roof all round');
  else if (seen.size < MIN_ROOM_CELLS) missing.push('more room');
  if (!door) missing.push('a door');
  if (!light) missing.push('a light');
  if (!table) missing.push('a table or workbench');
  return { ok: missing.length === 0, cells: seen.size, missing };
}
