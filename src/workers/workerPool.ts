import type { ChunkMeshData } from '../render/mesher';
import type { ChunkJobs } from '../world/chunkManager';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Pending = (response: WorkerResponse) => void;

/** A few Web Workers that generate and mesh chunks. Implements ChunkJobs for the ChunkManager. */
export class WorkerPool implements ChunkJobs {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextWorker = 0;
  private nextId = 1;

  constructor(
    private readonly seed: number,
    size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const resolve = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        resolve?.(event.data);
      };
      worker.onerror = (event) => console.error('chunk worker error:', event.message);
      this.workers.push(worker);
    }
  }

  generate(cx: number, cz: number): Promise<Uint8Array> {
    return this.send({ type: 'generate', id: 0, seed: this.seed, cx, cz }, []).then((r) => {
      if (r.type !== 'generated') throw new Error('unexpected worker reply');
      return r.blocks;
    });
  }

  /** The neighbor arrays are moved to the worker, so pass copies. */
  mesh(neighbors: Uint8Array[]): Promise<ChunkMeshData> {
    const transfer = neighbors.map((n) => n.buffer as ArrayBuffer);
    return this.send({ type: 'mesh', id: 0, neighbors }, transfer).then((r) => {
      if (r.type !== 'meshed') throw new Error('unexpected worker reply');
      return r.mesh;
    });
  }

  private send(request: WorkerRequest, transfer: ArrayBuffer[]): Promise<WorkerResponse> {
    const id = this.nextId++;
    const worker = this.workers[this.nextWorker]!;
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage({ ...request, id }, transfer);
    });
  }
}
