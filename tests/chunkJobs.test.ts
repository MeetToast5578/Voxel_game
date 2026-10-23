import { describe, expect, it } from 'vitest';
import { MAX_JOBS_IN_FLIGHT, VERTICAL_RENDER_DISTANCE } from '../src/config';
import { buildChunkMesh, type ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { ChunkManager, type ChunkJobs, type MeshSink } from '../src/world/chunkManager';
import { World } from '../src/world/world';
import { FakeGenerator } from './support/fakeGenerator';

/** Fake worker pool: jobs run only when flush() is called, like results arriving later from a worker. */
class FakeJobs implements ChunkJobs {
  private queue: { name: string; run: () => void }[] = [];
  readonly generator = new FakeGenerator(() => 0);
  maxQueued = 0;
  /** Jobs whose name matches are kept in the queue forever (a worker that never answers). */
  hold: (name: string) => boolean = () => false;

  columnTops(cx: number, cz: number): Promise<Int32Array> {
    return this.enqueue(`tops ${cx},${cz}`, () => this.generator.columnTops(cx, cz));
  }

  generate(cx: number, cy: number, cz: number): Promise<Uint16Array> {
    return this.enqueue(`generate ${cx},${cy},${cz}`, () => {
      const chunk = new Chunk(cx, cy, cz);
      this.generator.generateChunk(chunk);
      return chunk.blocks;
    });
  }

  mesh(cx: number, cy: number, cz: number, neighbors: Uint16Array[], tops: Int32Array[]): Promise<ChunkMeshData> {
    return this.enqueue(`mesh ${cx},${cy},${cz}`, () => buildChunkMesh(neighbors, tops, cy));
  }

  /** Runs every queued job (except held ones) and lets the promise callbacks run. */
  async flush(): Promise<void> {
    const jobs = this.queue;
    this.queue = jobs.filter((j) => this.hold(j.name));
    for (const job of jobs) if (!this.hold(job.name)) job.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private enqueue<T>(name: string, work: () => T): Promise<T> {
    return new Promise((resolve) => {
      this.queue.push({ name, run: () => resolve(work()) });
      this.maxQueued = Math.max(this.maxQueued, this.queue.length);
    });
  }
}

class Sink implements MeshSink {
  meshes = new Map<string, ChunkMeshData>();
  set(cx: number, cy: number, cz: number, data: ChunkMeshData): void {
    this.meshes.set(`${cx},${cy},${cz}`, data);
  }
  remove(cx: number, cy: number, cz: number): void {
    this.meshes.delete(`${cx},${cy},${cz}`);
  }
}

const V = VERTICAL_RENDER_DISTANCE;
const FULL = 13 * (2 * V + 1); // R = 2: 13 columns, flat tops at y = 0 inside the cylinder

function setup() {
  const world = new World(7);
  const jobs = new FakeJobs();
  const sink = new Sink();
  const manager = new ChunkManager(world, jobs.generator, sink, 2, jobs);
  return { world, jobs, sink, manager };
}

async function load(manager: ChunkManager, jobs: FakeJobs, sink: Sink, x = 8, y = 8, z = 8): Promise<void> {
  for (let i = 0; i < 1000 && sink.meshes.size < FULL; i++) {
    manager.update(x, y, z, 4, 4);
    await jobs.flush();
  }
}

describe('ChunkManager with ChunkJobs', () => {
  it(`loads everything through jobs, never more than ${MAX_JOBS_IN_FLIGHT} in flight`, async () => {
    const { jobs, sink, manager } = setup();
    await load(manager, jobs, sink);
    expect(sink.meshes.size).toBe(FULL);
    expect(jobs.maxQueued).toBeLessThanOrEqual(MAX_JOBS_IN_FLIGHT);
    expect(jobs.generator.columnTopCalls).toBeGreaterThan(0);
  });
  it('drops a worker result that finished after the chunk was edited', async () => {
    const { world, jobs, sink, manager } = setup();
    await load(manager, jobs, sink);
    // Make chunk (1,0,0) dirty, let a worker job start for it, then edit it again before the job finishes.
    world.setBlock(24, -8, 8, BlockId.BRICK);
    manager.onBlockChanged(24, -8, 8); // remeshes (1,-1,0) now, marks the 3x3x3 around it dirty
    manager.update(8, 8, 8, 4, 4); // starts worker jobs for the dirty neighbors, e.g. (0,-1,0)
    world.setBlock(8, -8, 8, BlockId.GLASS);
    manager.onBlockChanged(8, -8, 8); // (0,-1,0) is remeshed right now with the glass
    const fresh = sink.meshes.get('0,-1,0');
    await jobs.flush(); // the outdated job for (0,-1,0) finishes now and must be ignored
    expect(sink.meshes.get('0,-1,0')).toBe(fresh);
  });
  it('drops a worker result that finished after the player moved far away', async () => {
    const { jobs, sink, manager } = setup();
    jobs.hold = (name) => name.startsWith('mesh');
    for (let i = 0; i < 200; i++) {
      manager.update(8, 8, 8, 4, 4);
      await jobs.flush();
    }
    expect(sink.meshes.size).toBe(0); // mesh jobs are waiting
    manager.update(16 * 50, 8, 8, 4, 4); // the player moves 50 chunks away
    jobs.hold = () => false;
    await jobs.flush();
    expect(sink.meshes.has('0,0,0')).toBe(false);
  });
  it('does not mesh a chunk while a neighbour or a column top is missing', async () => {
    const { jobs, manager } = setup();
    jobs.hold = (name) => name === 'tops 1,0' || name === 'generate -2,0,-2';
    for (let i = 0; i < 300; i++) {
      manager.update(8, 8, 8, 4, 4);
      await jobs.flush();
    }
    expect(manager.isMeshed(0, 0, 0)).toBe(false); // needs column (1, 0)
    expect(manager.isMeshed(2, 0, 0)).toBe(false);
    expect(manager.isMeshed(-1, 0, -1)).toBe(false); // needs chunk (-2, 0, -2)
    expect(manager.isMeshed(-1, 1, -1)).toBe(false);
    expect(manager.isMeshed(-1, 2, -1)).toBe(true); // its neighbours are all there
    expect(manager.isMeshed(-1, 0, 1)).toBe(true);
  });
});

it.each(['tops', 'generate', 'mesh'])('recovers from rejected %s jobs through synchronous fallback', async failure => {
  const world = new World(7), sink = new Sink();
  const reject = () => Promise.reject(new Error('worker crashed'));
  const manager = new ChunkManager(world, new FakeGenerator(() => 0), sink, 2,
    { columnTops: (cx, cz) => failure === 'tops' ? reject() : Promise.resolve(new FakeGenerator(() => 0).columnTops(cx, cz)),
      generate: (cx, cy, cz) => { if (failure === 'generate') return reject(); const c = new Chunk(cx, cy, cz); new FakeGenerator(() => 0).generateChunk(c); return Promise.resolve(c.blocks); },
      mesh: (_cx, cy, _cz, neighbors, tops) => failure === 'mesh' ? reject() : Promise.resolve(buildChunkMesh(neighbors, tops, cy)) });
  manager.update(8, 8, 8, 4, 4);
  for (let i = 0; i < 30; i++) { manager.update(8, 8, 8, 4, 4); await new Promise(resolve => setTimeout(resolve, 0)); }
  for (let i = 0; i < 10; i++) manager.update(8, 8, 8, Infinity, Infinity);
  expect(sink.meshes.size).toBe(FULL);
  expect(manager.stats.jobsInFlight).toBe(0);
});

it('transfers actual ground bounds with worker lighting tops under a dense canopy', async () => {
  const world = new World(7), sink = new Sink(), jobs = new FakeJobs();
  const manager = new ChunkManager(world, jobs.generator, sink, 2, {
    columnTops: async () => ({ tops: new Int32Array(256).fill(64), groundMin: 0 }),
    generate: (...args) => jobs.generate(...args), mesh: (...args) => jobs.mesh(...args),
  });
  for (let i = 0; i < 80; i++) { manager.update(8, 200, 8, 4, 4); await jobs.flush(); }
  expect(manager.isMeshed(0, 0, 0)).toBe(true);
  expect(manager.isMeshed(0, 4, 0)).toBe(true);
});
