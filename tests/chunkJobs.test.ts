import { describe, expect, it } from 'vitest';
import { buildChunkMesh, type ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { ChunkManager, type ChunkJobs, type MeshSink } from '../src/world/chunkManager';
import { TerrainGenerator } from '../src/world/generator';
import { World } from '../src/world/world';

/** Fake worker pool: jobs run only when flush() is called, like results arriving later from a worker. */
class FakeJobs implements ChunkJobs {
  private queue: (() => void)[] = [];
  private readonly generator = new TerrainGenerator(7);
  maxQueued = 0;

  generate(cx: number, cz: number): Promise<Uint16Array> {
    return this.enqueue(() => {
      const chunk = new Chunk(cx, cz);
      this.generator.generateChunk(chunk);
      return chunk.blocks;
    });
  }

  mesh(neighbors: Uint16Array[]): Promise<ChunkMeshData> {
    return this.enqueue(() => buildChunkMesh(neighbors));
  }

  /** Runs every queued job and lets the promise callbacks run. */
  async flush(): Promise<void> {
    const jobs = this.queue;
    this.queue = [];
    for (const job of jobs) job();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private enqueue<T>(work: () => T): Promise<T> {
    return new Promise((resolve) => {
      this.queue.push(() => resolve(work()));
      this.maxQueued = Math.max(this.maxQueued, this.queue.length);
    });
  }
}

class Sink implements MeshSink {
  meshes = new Map<string, ChunkMeshData>();
  set(cx: number, cz: number, data: ChunkMeshData): void {
    this.meshes.set(`${cx},${cz}`, data);
  }
  remove(cx: number, cz: number): void {
    this.meshes.delete(`${cx},${cz}`);
  }
}

function setup() {
  const world = new World(7);
  const jobs = new FakeJobs();
  const sink = new Sink();
  const manager = new ChunkManager(world, new TerrainGenerator(7), sink, 2, jobs);
  return { world, jobs, sink, manager };
}

describe('ChunkManager with ChunkJobs', () => {
  it('loads everything through jobs, never more than 8 in flight', async () => {
    const { jobs, sink, manager } = setup();
    for (let i = 0; i < 100 && sink.meshes.size < 13; i++) {
      manager.update(0, 0, 4, 4);
      await jobs.flush();
    }
    expect(sink.meshes.size).toBe(13);
    expect(jobs.maxQueued).toBeLessThanOrEqual(8);
  });
  it('drops a worker result that finished after the chunk was edited', async () => {
    const { world, jobs, sink, manager } = setup();
    for (let i = 0; i < 100 && sink.meshes.size < 13; i++) {
      manager.update(0, 0, 4, 4);
      await jobs.flush();
    }
    // Make chunk (1,0) dirty, let a worker job start for it, then edit it again before the job finishes.
    world.setBlock(24, 100, 8, BlockId.STONE);
    manager.onBlockChanged(24, 100, 8); // remeshes (1,0) now, marks neighbors dirty
    manager.update(0, 0, 4, 4); // starts worker jobs for the dirty neighbors, e.g. (0,0)
    world.setBlock(8, 100, 8, BlockId.BRICK);
    manager.onBlockChanged(8, 100, 8); // (0,0) is remeshed right now with the brick
    const fresh = sink.meshes.get('0,0');
    await jobs.flush(); // the outdated job for (0,0) finishes now and must be ignored
    expect(sink.meshes.get('0,0')).toBe(fresh);
  });
});
