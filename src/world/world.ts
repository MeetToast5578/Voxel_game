import { WORLD_HEIGHT } from '../config';
import { chunkKey, localIndex, worldToChunk, worldToLocal } from '../core/coords';
import { BlockId } from './blocks';
import { Chunk } from './chunk';

export class World {
  readonly seed: number;
  private readonly chunkMap = new Map<string, Chunk>();
  /** Player edits: chunkKey -> (localIndex -> blockId). Survives chunk unloading. */
  readonly edits = new Map<string, Map<number, number>>();

  constructor(seed: number) {
    this.seed = seed;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunkMap.get(chunkKey(cx, cz));
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunkMap.has(chunkKey(cx, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunkMap.set(chunkKey(chunk.cx, chunk.cz), chunk);
  }

  removeChunk(cx: number, cz: number): void {
    this.chunkMap.delete(chunkKey(cx, cz));
  }

  /** Snapshot of all loaded chunks (safe to remove chunks while iterating). */
  chunks(): Chunk[] {
    return [...this.chunkMap.values()];
  }

  get chunkCount(): number {
    return this.chunkMap.size;
  }

  isLoadedAt(wx: number, wz: number): boolean {
    return this.hasChunk(worldToChunk(wx), worldToChunk(wz));
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return BlockId.BEDROCK;
    if (wy >= WORLD_HEIGHT) return BlockId.AIR;
    const chunk = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    if (!chunk) return BlockId.AIR;
    return chunk.get(worldToLocal(wx), wy, worldToLocal(wz));
  }

  /** Returns false if the position is out of the world or its chunk is not loaded. */
  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const cx = worldToChunk(wx);
    const cz = worldToChunk(wz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    chunk.set(lx, wy, lz, id);
    const key = chunkKey(cx, cz);
    let chunkEdits = this.edits.get(key);
    if (!chunkEdits) {
      chunkEdits = new Map();
      this.edits.set(key, chunkEdits);
    }
    chunkEdits.set(localIndex(lx, wy, lz), id);
    return true;
  }

  /** Re-applies stored player edits to a freshly generated chunk. */
  applyEdits(chunk: Chunk): void {
    const chunkEdits = this.edits.get(chunkKey(chunk.cx, chunk.cz));
    if (!chunkEdits) return;
    for (const [index, id] of chunkEdits) chunk.blocks[index] = id;
  }
}
