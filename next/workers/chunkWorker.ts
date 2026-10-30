import { CHUNK_VOLUME } from '../config';
import { buildMesh } from '../engine/mesher';
import { Generator } from '../worldgen/generator';
import type { WorkerRequest, WorkerResponse } from './protocol';

let generator: Generator | null = null;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type === 'init') {
    generator = new Generator(req.seed);
    return;
  }
  try {
    if (req.type === 'column') {
      const c = generator!.column(req.cx, req.cz);
      const top = c.top.slice(), climate = c.climate.slice();
      post({ type: 'column', id: req.id, top, climate, minTop: c.minTop, maxTop: c.maxTop }, [top.buffer, climate.buffer]);
    } else if (req.type === 'generate') {
      const states = new Uint16Array(CHUNK_VOLUME);
      const uniform = generator!.generate(req.cx, req.cy, req.cz, states);
      if (uniform >= 0) post({ type: 'generate', id: req.id, uniform });
      else post({ type: 'generate', id: req.id, uniform, states }, [states.buffer]);
    } else {
      const layers = buildMesh(req);
      post({ type: 'mesh', id: req.id, layers }, layers.map((l) => l.buffer));
    }
  } catch (err) {
    post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
