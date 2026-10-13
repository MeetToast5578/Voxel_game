import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';

describe('Chunk', () => {
  it('get/set and out-of-bounds reads return AIR', () => {
    const c = new Chunk(0, 0);
    c.set(3, 70, 9, BlockId.STONE);
    expect(c.get(3, 70, 9)).toBe(BlockId.STONE);
    expect(c.get(-1, 70, 9)).toBe(BlockId.AIR);
    expect(c.get(3, 200, 9)).toBe(BlockId.AIR);
    c.set(16, 0, 0, BlockId.STONE); // ignored, must not throw
  });
});

describe('World', () => {
  it('reads and writes across negative chunks', () => {
    const w = new World(1);
    w.addChunk(new Chunk(-1, -1));
    expect(w.setBlock(-1, 10, -1, BlockId.STONE)).toBe(true);
    expect(w.getBlock(-1, 10, -1)).toBe(BlockId.STONE);
    expect(w.getChunk(-1, -1)!.get(15, 10, 15)).toBe(BlockId.STONE);
  });
  it('handles unloaded chunks and out-of-range y', () => {
    const w = new World(1);
    expect(w.setBlock(100, 10, 100, BlockId.STONE)).toBe(false);
    expect(w.getBlock(100, 10, 100)).toBe(BlockId.AIR);
    expect(w.isLoadedAt(100, 100)).toBe(false);
    expect(w.getBlock(0, -1, 0)).toBe(BlockId.BEDROCK);
    expect(w.getBlock(0, 500, 0)).toBe(BlockId.AIR);
  });
  it('remembers edits after a chunk is unloaded', () => {
    const w = new World(1);
    w.addChunk(new Chunk(-1, -1));
    w.setBlock(-1, 10, -1, BlockId.STONE);
    w.removeChunk(-1, -1);
    expect(w.hasChunk(-1, -1)).toBe(false);
    const fresh = new Chunk(-1, -1);
    w.applyEdits(fresh);
    expect(fresh.get(15, 10, 15)).toBe(BlockId.STONE);
  });
  it('lists chunks', () => {
    const w = new World(1);
    w.addChunk(new Chunk(0, 0));
    w.addChunk(new Chunk(1, 0));
    expect(w.chunkCount).toBe(2);
    expect(w.chunks().map((c) => `${c.cx},${c.cz}`).sort()).toEqual(['0,0', '1,0']);
  });
});
