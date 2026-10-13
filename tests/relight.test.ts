import { describe, expect, it } from 'vitest';
import type { ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { TerrainGenerator } from '../src/world/generator';
import { World } from '../src/world/world';

class CountingSink implements MeshSink {
  sets: string[] = [];
  set(cx: number, cz: number, _data: ChunkMeshData): void {
    this.sets.push(`${cx},${cz}`);
  }
  remove(): void {}
}

describe('relighting after edits', () => {
  it('remeshes the edited chunk at once and its 8 neighbors on the next update', () => {
    const world = new World(3);
    const sink = new CountingSink();
    const manager = new ChunkManager(world, new TerrainGenerator(3), sink, 3);
    manager.update(0, 0, Infinity, Infinity);
    sink.sets = [];
    world.setBlock(8, 100, 8, BlockId.GLOWSTONE); // middle of chunk (0,0)
    manager.onBlockChanged(8, 100, 8);
    expect(sink.sets).toEqual(['0,0']);
    manager.update(0, 0, Infinity, Infinity);
    expect(sink.sets.length).toBe(9);
    expect(new Set(sink.sets).size).toBe(9);
  });
});
