import { CHUNK_SIZE, CHUNK_VOLUME } from '../../src/config';
import { columnIndex, localIndex } from '../../src/core/coords';
import { BlockId, blocksSky } from '../../src/world/blocks';
import { neighborIndex, regionIndex } from '../../src/world/light';

/** Top used for columns with no sky-blocking block in the scanned range. */
export const OPEN_SKY = -1000;

/**
 * A small world for light and mesher tests: blocks come from `base(x, y, z)` plus overrides. Builds the 27
 * neighbour arrays and 9 exact column-top arrays around chunk (0, cy, 0).
 */
export class TestWorld {
  private readonly overrides = new Map<string, number>();
  constructor(private readonly base: (x: number, y: number, z: number) => number = () => BlockId.AIR) {}

  set(x: number, y: number, z: number, id: number): this {
    this.overrides.set(`${x},${y},${z}`, id);
    return this;
  }

  get(x: number, y: number, z: number): number {
    return this.overrides.get(`${x},${y},${z}`) ?? this.base(x, y, z);
  }

  neighbors(cy: number): Uint16Array[] {
    const out: Uint16Array[] = new Array(27);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = new Uint16Array(CHUNK_VOLUME);
          for (let ly = 0; ly < CHUNK_SIZE; ly++)
            for (let lz = 0; lz < CHUNK_SIZE; lz++)
              for (let lx = 0; lx < CHUNK_SIZE; lx++)
                a[localIndex(lx, ly, lz)] = this.get(dx * 16 + lx, (cy + dy) * 16 + ly, dz * 16 + lz);
          out[neighborIndex(dx, dy, dz)] = a;
        }
    return out;
  }

  /** Exact tops of the 9 columns around (0, 0), scanning y from `from` down to -`from`. */
  tops(from = 160): Int32Array[] {
    const out: Int32Array[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = new Int32Array(CHUNK_SIZE * CHUNK_SIZE).fill(OPEN_SKY);
        for (let lz = 0; lz < CHUNK_SIZE; lz++)
          for (let lx = 0; lx < CHUNK_SIZE; lx++)
            for (let y = from; y >= -from; y--)
              if (blocksSky(this.get(dx * 16 + lx, y, dz * 16 + lz))) {
                t[columnIndex(lx, lz)] = y;
                break;
              }
        out.push(t);
      }
    return out;
  }
}

/** The same top for every cell of the 9 columns. */
export function uniformTops(y: number): Int32Array[] {
  return Array.from({ length: 9 }, () => new Int32Array(CHUNK_SIZE * CHUNK_SIZE).fill(y));
}

/** Region index of world position (x, y, z) when meshing chunk (0, cy, 0); x and z in -16..31. */
export function at(x: number, y: number, z: number, cy: number): number {
  return regionIndex(x + CHUNK_SIZE, y - (cy - 1) * CHUNK_SIZE, z + CHUNK_SIZE);
}
