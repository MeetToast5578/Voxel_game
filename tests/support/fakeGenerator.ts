import { CHUNK_SIZE } from '../../src/config';
import { columnIndex, localIndex } from '../../src/core/coords';
import { BlockId } from '../../src/world/blocks';
import type { Chunk } from '../../src/world/chunk';
import type { ChunkGenerator } from '../../src/world/chunkManager';

/**
 * Stone up to and including top(x, z), air above, plus block overrides. columnTops returns top(x, z): overrides
 * must not change the real tops (carve caves below them, for example).
 */
export class FakeGenerator implements ChunkGenerator {
  readonly overrides = new Map<string, number>();
  columnTopCalls = 0;

  constructor(private readonly top: (x: number, z: number) => number) {}

  block(x: number, y: number, z: number): number {
    return this.overrides.get(`${x},${y},${z}`) ?? (y <= this.top(x, z) ? BlockId.STONE : BlockId.AIR);
  }

  generateChunk(chunk: Chunk): void {
    for (let ly = 0; ly < CHUNK_SIZE; ly++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let lx = 0; lx < CHUNK_SIZE; lx++)
          chunk.blocks[localIndex(lx, ly, lz)] = this.block(
            chunk.cx * CHUNK_SIZE + lx,
            chunk.cy * CHUNK_SIZE + ly,
            chunk.cz * CHUNK_SIZE + lz,
          );
  }

  columnTops(cx: number, cz: number): Int32Array {
    this.columnTopCalls++;
    const tops = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) tops[columnIndex(lx, lz)] = this.top(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
    return tops;
  }
}
