import type { ChunkMeshData, MeshData } from '../render/mesher';

/** Messages from the main thread to a chunk worker. */
export type WorkerRequest =
  | { type: 'tops'; id: number; seed: number; cx: number; cz: number }
  | { type: 'generate'; id: number; seed: number; cx: number; cy: number; cz: number }
  | { type: 'mesh'; id: number; seed: number; cx: number; cz: number; cy: number; neighbors: Uint16Array[]; tops: Int32Array[] };

/** Messages from a chunk worker back to the main thread. */
export type WorkerResponse =
  | { type: 'tops'; id: number; tops: Int32Array }
  | { type: 'generated'; id: number; blocks: Uint16Array }
  | { type: 'meshed'; id: number; mesh: ChunkMeshData };

/** The ArrayBuffers inside a mesh, so postMessage can move them instead of copying. */
export function meshBuffers(mesh: ChunkMeshData): ArrayBuffer[] {
  const parts = (m: MeshData) => [m.positions, m.uvs, m.colors, m.light, m.indices].map((a) => a.buffer as ArrayBuffer);
  return [...parts(mesh.solid), ...parts(mesh.translucent)];
}
