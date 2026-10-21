// Runs inside a Web Worker. Computes column tops, generates chunks and meshes them off the main thread.
import { buildChunkMesh } from '../render/mesher';
import { Chunk } from '../world/chunk';
import { TerrainGenerator } from '../world/generator';
import { meshBuffers, type WorkerRequest, type WorkerResponse } from './protocol';

const generators = new Map<number, TerrainGenerator>();

function generatorFor(seed: number): TerrainGenerator {
  let generator = generators.get(seed);
  if (!generator) {
    generator = new TerrainGenerator(seed);
    generators.set(seed, generator);
  }
  return generator;
}

function reply(message: WorkerResponse, transfer: ArrayBuffer[]): void {
  self.postMessage(message, { transfer });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'tops') {
    const tops = generatorFor(msg.seed).columnTops(msg.cx, msg.cz);
    reply({ type: 'tops', id: msg.id, tops, groundMin: generatorFor(msg.seed).columnGroundMin(msg.cx, msg.cz) }, [tops.buffer as ArrayBuffer]);
  } else if (msg.type === 'generate') {
    const chunk = new Chunk(msg.cx, msg.cy, msg.cz);
    generatorFor(msg.seed).generateChunk(chunk);
    reply({ type: 'generated', id: msg.id, blocks: chunk.blocks }, [chunk.blocks.buffer as ArrayBuffer]);
  } else {
    const mesh = buildChunkMesh(msg.neighbors, msg.tops, msg.cy, { seed: msg.seed, cx: msg.cx, cz: msg.cz });
    reply({ type: 'meshed', id: msg.id, mesh }, meshBuffers(mesh));
  }
};
