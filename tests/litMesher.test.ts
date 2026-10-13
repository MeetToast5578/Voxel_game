import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { buildChunkMesh } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { LIGHT_CURVE } from '../src/world/light';

/** 9 chunks filled with stone up to and including y = groundY. Index (dz + 1) * 3 + (dx + 1). */
function flatNeighbors(groundY: number): Uint8Array[] {
  return Array.from({ length: 9 }, () => {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y <= groundY; y++)
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) blocks[localIndex(x, y, z)] = BlockId.STONE;
    return blocks;
  });
}
describe('buildChunkMesh lighting', () => {
  it('faces open to the sky get full sky light; faces in a sealed cave get none', () => {
    const n = flatNeighbors(50);
    for (let x = 3; x <= 8; x++) n[4]![localIndex(x, 30, 3)] = BlockId.AIR;
    const m = buildChunkMesh(n).solid;
    let sawSky = false;
    let sawDark = false;
    for (let v = 0; v < m.positions.length / 3; v++) {
      const y = m.positions[v * 3 + 1]!;
      const sky = m.light[v * 2]!;
      if (y === 51) {
        expect(sky).toBe(1);
        sawSky = true;
      }
      if (y > 29 && y < 31.5 && m.positions[v * 3 + 2]! >= 3 && m.positions[v * 3 + 2]! <= 4) {
        expect(sky).toBeCloseTo(LIGHT_CURVE[0]!);
        sawDark = true;
      }
    }
    expect(sawSky && sawDark).toBe(true);
  });
  it('glowstone faces are fully lit by block light', () => {
    const n = flatNeighbors(50);
    n[4]![localIndex(5, 51, 5)] = BlockId.GLOWSTONE;
    const m = buildChunkMesh(n).solid;
    let found = false;
    for (let v = 0; v < m.positions.length / 3; v++) {
      if (m.positions[v * 3 + 1] === 52 && m.positions[v * 3] === 5 && m.positions[v * 3 + 2] === 5) {
        expect(m.light[v * 2 + 1]).toBe(1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
  it('meshing with lighting stays fast enough', () => {
    const g = new TerrainGenerator(5);
    const chunks: Uint8Array[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = new Chunk(dx, dz);
        g.generateChunk(c);
        chunks.push(c.blocks);
      }
    buildChunkMesh(chunks);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) buildChunkMesh(chunks);
    const ms = (performance.now() - t0) / 10;
    console.log(`buildChunkMesh with light: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(80);
  });
});
