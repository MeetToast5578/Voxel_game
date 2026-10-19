import { CHUNK_VOLUME } from '../config';
import { chunkKey, inChunkBounds, localIndex } from '../core/coords';
import { BlockId } from './blocks';
import { TickQueue } from './tick';

/** A 16x16x16 cube of block states. */
export class Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly key: string;
  readonly blocks = new Uint16Array(CHUNK_VOLUME); // block states
  /** Scheduled ticks for this chunk (falling blocks, fluid flow, ...). */
  readonly ticks = new TickQueue();

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.key = chunkKey(cx, cy, cz);
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
