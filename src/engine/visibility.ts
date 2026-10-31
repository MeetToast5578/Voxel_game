import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { chunkKey } from '../core/coords';
import { BLOCKS, OPAQUE } from './blocks';

/**
 * Cave culling. For each chunk, which pairs of its six faces are joined through non-opaque cells (15 bits); then a
 * walk outward from the camera's chunk that only passes through a chunk between faces it joins, and never turns back
 * towards the camera. Chunks it does not reach are hidden: sealed caves below the surface, for one.
 */

/** Faces: +x, -x, +y, -y, +z, -z. */
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const OPPOSITE = [1, 0, 3, 2, 5, 4];
/** Bit of the pair (a, b) of faces, a != b. */
const PAIR = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
{
  let bit = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) PAIR[a]![b] = PAIR[b]![a] = 1 << bit++;
}
export const ALL_CONNECTED = 0x7fff;

const N = CHUNK_SIZE;
const FLAGS = BLOCKS.flags;
const visited = new Uint8Array(CHUNK_VOLUME);
const queue = new Int16Array(CHUNK_VOLUME);

/** The face-pair mask of a chunk's states (x, z, y layout, CHUNK_VOLUME long). Pure; runs in workers. */
export function faceConnectivity(cell: (i: number) => number): number {
  visited.fill(0);
  let mask = 0;
  for (let start = 0; start < CHUNK_VOLUME; start++) {
    if (visited[start] || (FLAGS[cell(start)]! & OPAQUE) !== 0) continue;
    let faces = 0, head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      if (x === N - 1) faces |= 1;
      if (x === 0) faces |= 2;
      if (y === N - 1) faces |= 4;
      if (y === 0) faces |= 8;
      if (z === N - 1) faces |= 16;
      if (z === 0) faces |= 32;
      const near = [x < N - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, y < N - 1 ? i + 256 : -1, y > 0 ? i - 256 : -1,
        z < N - 1 ? i + 16 : -1, z > 0 ? i - 16 : -1];
      for (const n of near) {
        if (n < 0 || visited[n] || (FLAGS[cell(n)]! & OPAQUE) !== 0) continue;
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    for (let a = 0; a < 6; a++) if (faces & (1 << a)) for (let b = a + 1; b < 6; b++) if (faces & (1 << b)) mask |= PAIR[a]![b]!;
    if (mask === ALL_CONNECTED) break;
  }
  return mask;
}

/**
 * Chunks visible from the camera chunk, as keys. `maskOf` gives a chunk's face-pair mask. The walk is bounded by
 * `radius` chunks horizontally and by chunk heights [yMin, yMax].
 */
export function visibleChunks(cx: number, cy: number, cz: number, radius: number, yMin: number, yMax: number,
  maskOf: (key: number) => number): Set<number> {
  const seen = new Set<number>();
  // Queue entries: chunk coords, the face it was entered by (-1 at the start), and the directions taken so far.
  const q: [number, number, number, number, number][] = [[cx, cy, cz, -1, 0]];
  seen.add(chunkKey(cx, cy, cz));
  for (let h = 0; h < q.length; h++) {
    const [x, y, z, entered, used] = q[h]!;
    const mask = entered < 0 ? ALL_CONNECTED : maskOf(chunkKey(x, y, z));
    for (let d = 0; d < 6; d++) {
      // Never turn back towards the camera.
      if (used & (1 << OPPOSITE[d]!)) continue;
      if (entered >= 0 && (mask & PAIR[entered]![d]!) === 0) continue;
      const [dx, dy, dz] = DIRS[d]!;
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (Math.abs(nx - cx) > radius || Math.abs(nz - cz) > radius || ny < yMin || ny > yMax) continue;
      const key = chunkKey(nx, ny, nz);
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nx, ny, nz, OPPOSITE[d]!, used | (1 << d)]);
    }
  }
  return seen;
}
