import { buildHorizon, HorizonSampler } from '../world/horizon';
let seed: number | undefined, sampler: HorizonSampler;
self.onmessage = (event: MessageEvent<{ seed: number; centerX: number; centerZ: number; viewBlocks: number }>) => {
  const r = event.data;
  if (seed !== r.seed) { seed = r.seed; sampler = new HorizonSampler(seed); }
  const data = buildHorizon(r.centerX, r.centerZ, r.viewBlocks, (x, z) => sampler.at(x, z, r.centerX, r.centerZ, r.viewBlocks));
  self.postMessage(data, { transfer: [data.positions.buffer, data.colors.buffer, data.indices.buffer] });
};
