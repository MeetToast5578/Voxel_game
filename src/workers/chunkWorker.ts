// Runs inside a Web Worker. Generates and meshes chunks off the main thread.
import { buildChunkMesh } from '../render/mesher';
import { Chunk } from '../world/chunk';
import { TerrainGenerator } from '../world/generator';
import { meshBuffers, type WorkerRequest, type WorkerResponse } from './protocol';

const generators = new Map<number, TerrainGenerator>();

function reply(message: WorkerResponse, transfer: ArrayBuffer[]): void {
  self.postMessage(message, { transfer });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'generate') {
    let generator = generators.get(msg.seed);
    if (!generator) {
      generator = new TerrainGenerator(msg.seed);
      generators.set(msg.seed, generator);
    }
    const chunk = new Chunk(msg.cx, msg.cz);
    generator.generateChunk(chunk);
    reply({ type: 'generated', id: msg.id, blocks: chunk.blocks }, [chunk.blocks.buffer]);
  } else {
    const mesh = buildChunkMesh(msg.neighbors);
    reply({ type: 'meshed', id: msg.id, mesh }, meshBuffers(mesh));
  }
};
