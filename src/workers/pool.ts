import { JOBS_PER_WORKER } from '../config';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Job = Exclude<WorkerRequest, { type: 'init' }>;
type JobInput<T extends Job['type']> = Omit<Extract<Job, { type: T }>, 'id'>;
type Reply<T extends Job['type']> = Extract<WorkerResponse, { type: T }>;

interface Pending {
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
}

/**
 * Chunk workers. A job is sent to the worker its column hashes to, so each worker's column cache keeps hitting.
 * If a worker fails, its pending jobs are rejected and later jobs for it go to the next healthy worker.
 */
export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly alive: boolean[] = [];
  private readonly inFlight: number[] = [];
  private readonly pending: Map<number, Pending>[] = [];
  private nextId = 1;

  constructor(seed: number, count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      const pending = new Map<number, Pending>();
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        this.inFlight[i]!--;
        if (e.data.type === 'error') p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      w.onerror = (e) => {
        e.preventDefault();
        this.alive[i] = false;
        for (const p of pending.values()) p.reject(new Error(`worker ${i} failed: ${e.message}`));
        pending.clear();
        this.inFlight[i] = 0;
      };
      w.postMessage({ type: 'init', seed } satisfies WorkerRequest);
      this.workers.push(w);
      this.alive.push(true);
      this.inFlight.push(0);
      this.pending.push(pending);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  /** The worker for column (cx, cz), skipping failed ones; -1 when none is left. */
  workerFor(cx: number, cz: number): number {
    const n = this.workers.length;
    const h = (Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cz, 0x165667b1)) >>> 0;
    for (let k = 0; k < n; k++) {
      const i = (h + k) % n;
      if (this.alive[i]) return i;
    }
    return -1;
  }

  /** Whether worker i can take another job now; `extra` lets urgent work past the usual limit. */
  hasRoom(i: number, extra = 0): boolean {
    return i >= 0 && this.alive[i]! && this.inFlight[i]! < JOBS_PER_WORKER + extra;
  }

  /** The healthy worker with the fewest jobs in flight, or -1. Meshing has no cache to keep warm, so any will do. */
  leastBusy(): number {
    let best = -1;
    for (let i = 0; i < this.workers.length; i++) {
      if (this.alive[i] && (best < 0 || this.inFlight[i]! < this.inFlight[best]!)) best = i;
    }
    return best;
  }

  get busy(): number {
    return this.inFlight.reduce((a, b) => a + b, 0);
  }

  run<T extends Job['type']>(worker: number, job: JobInput<T> & { type: T }, transfer: Transferable[] = []): Promise<Reply<T>> {
    const id = this.nextId++;
    return new Promise<Reply<T>>((resolve, reject) => {
      if (!this.alive[worker]) {
        reject(new Error(`worker ${worker} is not available`));
        return;
      }
      this.pending[worker]!.set(id, { resolve: resolve as (r: WorkerResponse) => void, reject });
      this.inFlight[worker]!++;
      this.workers[worker]!.postMessage({ ...job, id }, transfer);
    });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
  }
}
