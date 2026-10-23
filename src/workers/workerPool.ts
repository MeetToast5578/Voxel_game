import type { ChunkMeshData } from '../render/mesher';
import type { ChunkJobs, ColumnSurface } from '../world/chunkManager';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Pending = { worker: Worker; resolve: (response: WorkerResponse) => void; reject: (error: Error) => void };

/** A few Web Workers that generate and mesh chunks. Implements ChunkJobs for the ChunkManager. */
export class WorkerPool implements ChunkJobs {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextWorker = 0;
  private nextId = 1;
  private failure: Error | null = null;

  constructor(
    private readonly seed: number,
    size: number,
  ) {
    for (let i = 0; i < size; i++) {
      let worker: Worker;
      try { worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' }); }
      catch (error) {
        this.failure = error instanceof Error ? error : new Error('worker creation failed');
        for (const started of this.workers) started.terminate();
        break;
      }
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        pending?.resolve(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.failure = new Error(`chunk worker failed: ${event.message}`);
        for (const [id, pending] of this.pending) {
          this.pending.delete(id);
          pending.reject(this.failure);
        }
      };
      this.workers.push(worker);
    }
  }

  columnTops(cx: number, cz: number): Promise<ColumnSurface> {
    return this.send({ type: 'tops', id: 0, seed: this.seed, cx, cz }, []).then((r) => {
      if (r.type !== 'tops') throw new Error('unexpected worker reply');
      return { tops: r.tops, groundMin: r.groundMin };
    });
  }

  generate(cx: number, cy: number, cz: number): Promise<Uint16Array> {
    return this.send({ type: 'generate', id: 0, seed: this.seed, cx, cy, cz }, []).then((r) => {
      if (r.type !== 'generated') throw new Error('unexpected worker reply');
      return r.blocks;
    });
  }

  /** The block and top arrays are moved to the worker, so pass copies. */
  mesh(cx: number, cy: number, cz: number, neighbors: Uint16Array[], tops: Int32Array[]): Promise<ChunkMeshData> {
    const transfer = [...neighbors, ...tops].map((a) => a.buffer as ArrayBuffer);
    return this.send({ type: 'mesh', id: 0, seed: this.seed, cx, cy, cz, neighbors, tops }, transfer).then((r) => {
      if (r.type !== 'meshed') throw new Error('unexpected worker reply');
      return r.mesh;
    });
  }

  dispose(): void {
    this.failure = new Error('worker pool disposed');
    for (const worker of this.workers) worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error('worker pool disposed'));
    this.pending.clear();
  }

  private send(request: WorkerRequest, transfer: ArrayBuffer[]): Promise<WorkerResponse> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    const worker = this.workers[this.nextWorker]!;
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { worker, resolve, reject });
      try { worker.postMessage({ ...request, id }, transfer); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
}
