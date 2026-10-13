import { CHUNK_VOLUME } from '../config';
import { inChunkBounds, localIndex } from '../core/coords';
import { BlockId } from './blocks';

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks = new Uint16Array(CHUNK_VOLUME); // block states

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  get(lx: number, y: number, lz: number): number {
    if (!inChunkBounds(lx, y, lz)) return BlockId.AIR;
    return this.blocks[localIndex(lx, y, lz)];
  }

  set(lx: number, y: number, lz: number, id: number): void {
    if (!inChunkBounds(lx, y, lz)) return;
    this.blocks[localIndex(lx, y, lz)] = id;
  }
}
