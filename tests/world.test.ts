import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { columnIndex } from '../src/core/coords';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { World, type ChunkFallback } from '../src/world/world';

/** Tops of a column where every cell's top is `y`. */
const flatTops = (y: number) => new Int32Array(256).fill(y);

/** Fallback: stone at y < 0, air above. Counts calls. */
function stoneBelowZero(): ChunkFallback & { calls: number } {
  const f = Object.assign(
    (_cx: number, cy: number): Uint16Array => {
      f.calls++;
      return new Uint16Array(CHUNK_VOLUME).fill(cy < 0 ? BlockId.STONE : BlockId.AIR);
    },
    { calls: 0 },
  );
  return f;
}

/** A world whose column (0, 0) has tops at y = -1 and chunks cy -1..1 loaded from the fallback. */
function smallWorld() {
  const fallback = stoneBelowZero();
  const w = new World(1, fallback);
  for (let cy = -1; cy <= 1; cy++) {
    const c = new Chunk(0, cy, 0);
    c.blocks.set(fallback(0, cy, 0));
    w.addChunk(c);
  }
  fallback.calls = 0;
  w.installColumnTops(0, 0, flatTops(-1));
  return { w, fallback };
}

describe('Chunk', () => {
  it('get/set and out-of-bounds reads return AIR', () => {
    const c = new Chunk(0, 0, 0);
    c.set(3, 7, 9, BlockId.STONE);
    expect(c.get(3, 7, 9)).toBe(BlockId.STONE);
    expect(c.get(-1, 7, 9)).toBe(BlockId.AIR);
    expect(c.get(3, 16, 9)).toBe(BlockId.AIR);
    c.set(16, 0, 0, BlockId.STONE); // ignored, must not throw
  });
});

describe('World', () => {
  it('reads and writes across negative chunks', () => {
    const w = new World(1);
    w.addChunk(new Chunk(-1, 0, -1));
    w.installColumnTops(-1, -1, flatTops(-5));
    expect(w.setBlock(-1, 10, -1, BlockId.STONE)).toBe(true);
    expect(w.getBlock(-1, 10, -1)).toBe(BlockId.STONE);
    expect(w.getChunk(-1, 0, -1)!.get(15, 10, 15)).toBe(BlockId.STONE);
  });
  it('round-trips blocks deep down and high up', () => {
    const w = new World(1);
    w.addChunk(new Chunk(0, -3, 0)); // y -48..-33
    w.addChunk(new Chunk(0, 18, 0)); // y 288..303
    w.installColumnTops(0, 0, flatTops(-100));
    expect(w.setBlock(2, -40, 3, BlockId.BRICK)).toBe(true);
    expect(w.setBlock(2, 300, 3, BlockId.GLASS)).toBe(true);
    expect(w.getBlock(2, -40, 3)).toBe(BlockId.BRICK);
    expect(w.getBlock(2, 300, 3)).toBe(BlockId.GLASS);
  });
  it('treats unloaded chunks as air and refuses to edit them or columns without tops', () => {
    const w = new World(1);
    expect(w.setBlock(100, 10, 100, BlockId.STONE)).toBe(false);
    expect(w.getBlock(100, 10, 100)).toBe(BlockId.AIR);
    expect(w.isLoadedAt(100, 10, 100)).toBe(false);
    expect(w.getBlock(0, -1, 0)).toBe(BlockId.AIR); // no special case below 0 any more
    w.addChunk(new Chunk(0, 0, 0));
    expect(w.isLoadedAt(0, 10, 0)).toBe(true);
    expect(w.isLoadedAt(0, 16, 0)).toBe(false);
    expect(w.getColumnTops(0, 0)).toBeUndefined();
    expect(w.setBlock(0, 10, 0, BlockId.STONE)).toBe(false); // no tops yet
    expect(w.getBlock(0, 10, 0)).toBe(BlockId.AIR);
  });
  it('re-applies an edit at y = -40 when its chunk is created again', () => {
    const w = new World(1);
    w.addChunk(new Chunk(-1, -3, -1));
    w.installColumnTops(-1, -1, flatTops(-100));
    w.setBlock(-1, -40, -1, BlockId.BRICK);
    w.removeChunk(-1, -3, -1);
    expect(w.hasChunk(-1, -3, -1)).toBe(false);
    const fresh = new Chunk(-1, -3, -1);
    w.applyEdits(fresh);
    expect(fresh.get(15, 8, 15)).toBe(BlockId.BRICK); // -40 = -3 * 16 + 8
  });
  it('lists chunks', () => {
    const w = new World(1);
    w.addChunk(new Chunk(0, 0, 0));
    w.addChunk(new Chunk(1, -2, 0));
    expect(w.chunkCount).toBe(2);
    expect(w.chunks().map((c) => `${c.cx},${c.cy},${c.cz}`).sort()).toEqual(['0,0,0', '1,-2,0']);
  });
  it('removes column tops only when none of its chunks are loaded', () => {
    const w = new World(1);
    w.addChunk(new Chunk(0, 5, 0));
    w.installColumnTops(0, 0, flatTops(3));
    expect(w.removeColumnTops(0, 0)).toBe(false);
    expect(w.getColumnTops(0, 0)).toBeDefined();
    w.removeChunk(0, 5, 0);
    expect(w.removeColumnTops(0, 0)).toBe(true);
    expect(w.getColumnTops(0, 0)).toBeUndefined();
  });
});

describe('column tops', () => {
  it('rise when a sky-blocking block is placed above the top; glass leaves them alone', () => {
    const { w } = smallWorld();
    expect(w.setBlock(3, 30, 4, BlockId.GLASS)).toBe(true);
    expect(w.topAt(3, 4)).toBe(-1);
    w.addChunk(new Chunk(0, 3, 0));
    expect(w.setBlock(3, 49, 4, BlockId.STONE)).toBe(true); // 50 above the top
    expect(w.topAt(3, 4)).toBe(49);
    expect(w.getColumnTops(0, 0)![columnIndex(3, 4)]).toBe(49);
    expect(w.topAt(4, 4)).toBe(-1); // other cells untouched
  });
  it('fall to the next blocker when the top block is removed', () => {
    const { w } = smallWorld();
    w.setBlock(3, 20, 4, BlockId.STONE);
    w.setBlock(3, 5, 4, BlockId.LEAVES);
    expect(w.topAt(3, 4)).toBe(20);
    w.setBlock(3, 20, 4, BlockId.AIR);
    expect(w.topAt(3, 4)).toBe(5);
    w.setBlock(3, 5, 4, BlockId.GLASS); // replaced by a non-blocking block
    expect(w.topAt(3, 4)).toBe(-1);
  });
  it('use the fallback for unloaded chunks below without adding them to the world', () => {
    const { w, fallback } = smallWorld();
    for (let y = -1; y >= -16; y--) w.setBlock(3, y, 4, BlockId.AIR); // dig through chunk cy = -1
    expect(fallback.calls).toBe(1); // chunk cy = -2 is not loaded
    expect(w.topAt(3, 4)).toBe(-17);
    expect(w.chunkCount).toBe(3);
  });
  it('include saved edits when they are installed', () => {
    const g = new TerrainGenerator(42);
    const fallback: ChunkFallback = (cx, cy, cz) => {
      const c = new Chunk(cx, cy, cz);
      g.generateChunk(c);
      return c.blocks;
    };
    const generated = g.columnTops(0, 0);
    const surface = generated[columnIndex(5, 6)]!;

    // Edits made in another world (as if loaded from a save).
    const source = new World(42, fallback);
    for (const cy of [Math.floor(surface / 16), 18]) {
      const c = new Chunk(0, cy, 0);
      c.blocks.set(fallback(0, cy, 0));
      source.addChunk(c);
    }
    source.installColumnTops(0, 0, g.columnTops(0, 0));
    source.setBlock(2, 300, 3, BlockId.STONE);
    source.setBlock(5, surface, 6, BlockId.AIR);

    const w = new World(42, fallback);
    w.loadEdits(source.edits);
    w.installColumnTops(0, 0, g.columnTops(0, 0));
    expect(w.topAt(2, 3)).toBe(300);
    expect(w.topAt(5, 6)).toBe(source.topAt(5, 6));
    expect(w.topAt(5, 6)).toBeLessThan(surface);
    expect(w.chunkCount).toBe(0);
  });
});
