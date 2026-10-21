import { afterEach, expect, it, vi } from 'vitest';
import { WorkerPool } from '../src/workers/workerPool';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: unknown) => void) | null = null;
  onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage() {}
  terminate() { this.terminated = true; }
}
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; });

it('rejects all outstanding and subsequent work after a worker crashes', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const pool = new WorkerPool(1, 2);
  const a = expect(pool.generate(0, 0, 0)).rejects.toThrow('worker failed');
  const b = expect(pool.columnTops(1, 0)).rejects.toThrow('worker failed');
  FakeWorker.instances[0]!.onerror!({message: 'crash', preventDefault() {}});
  await Promise.all([a, b]);
  await expect(pool.generate(0, 0, 0)).rejects.toThrow('worker failed');
  pool.dispose();
  expect(FakeWorker.instances.every(w => w.terminated)).toBe(true);
});

it('cancels pending work when disposed', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const pool = new WorkerPool(1, 1);
  const pending = expect(pool.generate(0, 0, 0)).rejects.toThrow('disposed');
  pool.dispose(); await pending;
});

it('turns worker-construction failures into rejected jobs for manager fallback', async () => {
  vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked worker'); } });
  const pool = new WorkerPool(1, 1);
  await expect(pool.generate(0, 0, 0)).rejects.toThrow('blocked worker');
});
