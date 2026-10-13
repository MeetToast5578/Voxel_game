import { CHUNK_VOLUME } from '../config';
import { inChunkBounds, localIndex } from '../core/coords';
import { BlockId } from './blocks';

/** A 16x16x16 cube of block states. */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly blocks = new Uint16Array(CHUNK_VOLUME); // block states

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
  }

  get(lx: number, ly: number, lz: number): number {
    if (!inChunkBounds(lx, ly, lz)) return BlockId.AIR;
    return this.blocks[localIndex(lx, ly, lz)]!;
  }

  set(lx: number, ly: number, lz: number, id: number): void {
    if (!inChunkBounds(lx, ly, lz)) return;
    this.blocks[localIndex(lx, ly, lz)] = id;
  }
}
