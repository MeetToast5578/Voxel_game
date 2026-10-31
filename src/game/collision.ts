import { BLOCKS } from '../engine/blocks';

/** A collision box inside a cell: x0, y0, z0, x1, y1, z1 in fractions of a cell. */
export type CellBox = readonly [number, number, number, number, number, number];

/** Box sets, indexed by the values of COLLISION. Set 0 is no box; set 1 is the full cell. */
export const BOX_SETS: (readonly CellBox[])[] = [[], [[0, 0, 0, 1, 1, 1]]];
/** COLLISION value of a full solid cell. */
export const FULL = 1;

/** Collision box set of every state, as an index into BOX_SETS. 0 is no box. */
export const COLLISION = new Uint16Array(BLOCKS.stateCount);
const seen = new Map<string, number>([[JSON.stringify(BOX_SETS[1]), FULL]]);
for (const t of BLOCKS.types) {
  if (!t.solid) continue;
  for (let v = 0; v < t.variants; v++) {
    // An open door is passable: its panel would leave a gap narrower than the player.
    if (t.key === 'door' && v >= 4) continue;
    const boxes: CellBox[] = t.shape === 'slab' ? [[0, v === 0 ? 0 : 0.5, 0, 1, v === 0 ? 0.5 : 1, 1]]
      : t.key === 'snow' ? [[0, 0, 0, 1, (v + 1) / 8, 1]]
      : t.shape === 'cube' ? [[0, 0, 0, 1, 1, 1]]
      : (t.boxes?.(v) ?? []).map((b) => b.map((n) => n / 16) as unknown as CellBox);
    if (boxes.length === 0) continue;
    const key = JSON.stringify(boxes);
    let id = seen.get(key);
    if (id === undefined) {
      id = BOX_SETS.push(boxes) - 1;
      seen.set(key, id);
    }
    COLLISION[t.id + v] = id;
  }
}

/** Collision box set of the cell (x, y, z), an index into BOX_SETS; 0 for none. */
export type BoxAt = (x: number, y: number, z: number) => number;
