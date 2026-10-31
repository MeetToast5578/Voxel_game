import { CHUNK_VOLUME } from '../config';
import { chunkLight } from '../engine/light';
import { buildMesh, padIndex } from '../engine/mesher';
import { faceConnectivity } from '../engine/visibility';
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
      const top = c.top.slice(), skyTop = c.skyTop.slice(), climate = c.climate.slice(), biome = c.biome.slice(), water = c.water.slice();
      post({ type: 'column', id: req.id, top, skyTop, climate, biome, water, minTop: c.minTop, caveFloor: c.caveFloor, maxTop: c.maxTop },
        [top.buffer, skyTop.buffer, climate.buffer, biome.buffer, water.buffer]);
    } else if (req.type === 'generate') {
      const states = new Uint16Array(CHUNK_VOLUME);
      const uniform = generator!.generate(req.cx, req.cy, req.cz, states);
      if (uniform >= 0) states.fill(uniform);
      const light = chunkLight(states, req.cy, generator!.column(req.cx, req.cz).skyTop);
      const first = light[0]!;
      const uniformLight = light.every((v) => v === first) ? first : -1;
      const transfer: Transferable[] = [];
      if (uniform < 0) transfer.push(states.buffer);
      if (uniformLight < 0) transfer.push(light.buffer);
      post({
        type: 'generate', id: req.id, uniform, uniformLight,
        ...(uniform < 0 ? { states } : {}), ...(uniformLight < 0 ? { light } : {}),
      }, transfer);
    } else if (req.type === 'horizon') {
      const n = req.radii.length * req.segments;
      const heights = new Float32Array(n), colors = new Uint8Array(n * 3);
      const s = { height: 0, r: 0, g: 0, b: 0 };
      for (let ring = 0; ring < req.radii.length; ring++) {
        for (let k = 0; k < req.segments; k++) {
          const a = (k / req.segments) * Math.PI * 2, i = ring * req.segments + k;
          generator!.horizonSample(Math.floor(req.x + Math.cos(a) * req.radii[ring]!), Math.floor(req.z + Math.sin(a) * req.radii[ring]!), s);
          heights[i] = s.height;
          colors.set([s.r, s.g, s.b], i * 3);
        }
      }
      post({ type: 'horizon', id: req.id, heights, colors }, [heights.buffer, colors.buffer]);
    } else {
      const layers = buildMesh(req);
      const states = req.states;
      const visibility = faceConnectivity((i) => states[padIndex(i & 15, i >> 8, (i >> 4) & 15)]!);
      post({ type: 'mesh', id: req.id, layers, visibility }, layers.map((l) => l.buffer));
    }
  } catch (err) {
    post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
