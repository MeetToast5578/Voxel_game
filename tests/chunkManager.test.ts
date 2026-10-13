import { describe, expect, it } from 'vitest';
import type { ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { TerrainGenerator } from '../src/world/generator';
import { World } from '../src/world/world';

class FakeSink implements MeshSink {
  meshes = new Map<string, ChunkMeshData>();
  sets = 0;
  set(cx: number, cz: number, data: ChunkMeshData): void {
    this.meshes.set(`${cx},${cz}`, data);
    this.sets++;
  }
  remove(cx: number, cz: number): void {
    this.meshes.delete(`${cx},${cz}`);
  }
}

function setup(renderDistance: number) {
  const world = new World(7);
  const sink = new FakeSink();
  const manager = new ChunkManager(world, new TerrainGenerator(7), sink, renderDistance);
  return { world, sink, manager };
}

describe('ChunkManager', () => {
  it('generates and meshes every chunk within the render distance circle', () => {
    const { world, sink, manager } = setup(2);
    manager.update(0, 0, Infinity, Infinity);
    expect(sink.meshes.size).toBe(13); // chunks with dx² + dz² <= 2²
    expect(sink.meshes.has('2,0')).toBe(true);
    expect(sink.meshes.has('2,1')).toBe(false);
    expect(world.hasChunk(4, 0)).toBe(true); // generation radius = renderDistance + 2
    expect(manager.isAreaMeshed(0, 0, 1)).toBe(true);
    expect(manager.stats).toMatchObject({ meshed: 13, pendingGen: 0, pendingMesh: 0 });
  });
  it('makes progress every frame even with a zero time budget', () => {
    const { sink, manager } = setup(2);
    let frames = 0;
    while (sink.meshes.size < 13 && frames < 500) {
      manager.update(0, 0, 0, 0);
      frames++;
    }
    expect(sink.meshes.size).toBe(13);
  });
  it('unloads chunks that are far away after the player moves', () => {
    const { world, sink, manager } = setup(2);
    manager.update(0, 0, Infinity, Infinity);
    manager.update(16 * 20, 0, Infinity, Infinity);
    expect(sink.meshes.has('0,0')).toBe(false);
    expect(world.hasChunk(0, 0)).toBe(false);
    expect(sink.meshes.has('20,0')).toBe(true);
  });
  it('remeshes all chunks touching a changed corner block, and keeps edits after unloading', () => {
    const { world, sink, manager } = setup(2);
    manager.update(0, 0, Infinity, Infinity);
    const before = sink.sets;
    world.setBlock(15, 100, 15, BlockId.STONE); // corner of chunk (0,0)
    manager.onBlockChanged(15, 100, 15);
    expect(sink.sets - before).toBe(4); // (0,0) (1,0) (0,1) (1,1)
    manager.update(16 * 20, 0, Infinity, Infinity);
    manager.update(0, 0, Infinity, Infinity);
    expect(world.getBlock(15, 100, 15)).toBe(BlockId.STONE);
  });
  it('handles negative coordinates', () => {
    const { sink, manager } = setup(1);
    manager.update(-0.5, -0.5, Infinity, Infinity);
    expect(sink.meshes.has('-1,-1')).toBe(true);
    expect(manager.isAreaMeshed(-0.5, -0.5, 0)).toBe(true);
  });
});
