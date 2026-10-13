import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { buildChunkMesh, buildPaddedVolume, padIndex, type MeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';

/** 9 empty chunks. Index (dz + 1) * 3 + (dx + 1); the center chunk is index 4. */
function emptyNeighbors(): Uint16Array[] {
  return Array.from({ length: 9 }, () => new Uint16Array(CHUNK_VOLUME));
}
const quads = (m: MeshData) => m.indices.length / 6;

/** Brightness (red channel) of the 4 vertices of every quad whose 4 corners all satisfy `match`. */
function quadColors(m: MeshData, match: (x: number, y: number, z: number) => boolean): number[] {
  const out: number[] = [];
  for (let q = 0; q < m.positions.length / 12; q++) {
    const verts = [0, 1, 2, 3].map((k) => q * 4 + k);
    if (verts.every((v) => match(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!))) {
      for (const v of verts) out.push(m.colors[v * 3]!);
    }
  }
  return out;
}

describe('buildChunkMesh', () => {
  it('a lone block has 6 faces (4 vertices + 6 indices each)', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.STONE;
    const m = buildChunkMesh(n);
    expect(quads(m.solid)).toBe(6);
    expect(m.solid.positions.length).toBe(6 * 4 * 3);
    expect(m.solid.uvs.length).toBe(6 * 4 * 2);
    expect(m.solid.colors.length).toBe(6 * 4 * 3);
    expect(quads(m.translucent)).toBe(0);
  });
  it('never builds bottom faces at y = 0', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 0, 5)] = BlockId.STONE;
    expect(quads(buildChunkMesh(n).solid)).toBe(5);
  });
  it('hides the face between two touching blocks', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[4]![localIndex(6, 10, 5)] = BlockId.STONE;
    expect(quads(buildChunkMesh(n).solid)).toBe(10);
  });
  it('hides faces against blocks in neighbor chunks', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(15, 10, 5)] = BlockId.STONE;
    n[5]![localIndex(0, 10, 5)] = BlockId.STONE; // index 5 = (dx = +1, dz = 0)
    expect(quads(buildChunkMesh(n).solid)).toBe(5);
    const n2 = emptyNeighbors();
    n2[4]![localIndex(5, 10, 0)] = BlockId.STONE;
    n2[1]![localIndex(5, 10, 15)] = BlockId.STONE; // index 1 = (dx = 0, dz = -1)
    expect(quads(buildChunkMesh(n2).solid)).toBe(5);
  });
  it('keeps faces next to see-through blocks', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[4]![localIndex(6, 10, 5)] = BlockId.GLASS;
    // stone keeps all 6 faces (glass does not hide it); glass loses the face touching stone
    expect(quads(buildChunkMesh(n).solid)).toBe(11);
  });
  it('glass-glass and water-water faces are hidden, leaves-leaves are kept', () => {
    const pair = (id: number) => {
      const n = emptyNeighbors();
      n[4]![localIndex(5, 10, 5)] = id;
      n[4]![localIndex(6, 10, 5)] = id;
      return buildChunkMesh(n);
    };
    expect(quads(pair(BlockId.GLASS).solid)).toBe(10);
    expect(quads(pair(BlockId.LEAVES).solid)).toBe(12);
    const water = pair(BlockId.WATER);
    expect(quads(water.solid)).toBe(0);
    expect(quads(water.translucent)).toBe(10);
  });
  it('uses top/side/bottom tiles: grass top uv differs from grass side uv', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.GRASS;
    const m = buildChunkMesh(n);
    const uvSets = new Set<string>();
    for (let q = 0; q < 6; q++) uvSets.add(`${m.solid.uvs[q * 8]},${m.solid.uvs[q * 8 + 1]}`);
    expect(uvSets.size).toBe(3); // top, side, bottom(dirt)
  });
  it('ambient occlusion darkens vertices next to a neighboring block', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[4]![localIndex(6, 11, 5)] = BlockId.STONE; // diagonal: above and to the +X side
    const m = buildChunkMesh(n);
    const top = quadColors(m.solid, (x, y, z) => y === 11 && x >= 5 && x <= 6 && z >= 5 && z <= 6);
    expect(top.length).toBe(4);
    expect(top.filter((c) => c === 1).length).toBe(2); // the 2 vertices at x = 5 stay fully lit
    expect(top.filter((c) => c < 1).length).toBe(2); // the 2 vertices at x = 6 are darkened
  });
  it('a fully lit top face has brightness 1, side faces are darker', () => {
    const n = emptyNeighbors();
    n[4]![localIndex(5, 10, 5)] = BlockId.STONE;
    const m = buildChunkMesh(n);
    expect(quadColors(m.solid, (_x, y) => y === 11)).toEqual([1, 1, 1, 1]);
    const all = Array.from(m.solid.colors);
    expect(Math.min(...all)).toBeCloseTo(0.5); // bottom face shade
  });
  it('meshes a generated chunk in reasonable time', () => {
    const g = new TerrainGenerator(5);
    const chunks: Uint16Array[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = new Chunk(dx, dz);
        g.generateChunk(c);
        chunks.push(c.blocks);
      }
    buildChunkMesh(chunks); // warm up
    const t0 = performance.now();
    let m = buildChunkMesh(chunks);
    for (let i = 0; i < 9; i++) m = buildChunkMesh(chunks);
    const ms = (performance.now() - t0) / 10;
    console.log(`buildChunkMesh: ${ms.toFixed(2)} ms, ${quads(m.solid)} solid quads`);
    expect(quads(m.solid)).toBeGreaterThan(256);
    expect(ms).toBeLessThan(50);
  });
});

describe('buildPaddedVolume', () => {
  it('copies 16-bit block states without truncating them', () => {
    const neighbors = emptyNeighbors();
    neighbors[5]![localIndex(0, 20, 3)] = 300; // the +X neighbor's first column, inside the padding
    const vol = buildPaddedVolume(neighbors);
    expect(vol[padIndex(17, 21, 4)]).toBe(300);
  });
});
