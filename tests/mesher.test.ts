import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { buildChunkMesh, buildPaddedVolume, padIndex, type MeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { neighborIndex } from '../src/world/light';
import { TestWorld, uniformTops } from './support/testWorld';

/** 27 empty chunks. Index (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1); the centre chunk is index 13. */
function emptyNeighbors(): Uint16Array[] {
  return Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME));
}
const CENTER = 13;
const SKY = uniformTops(-1000); // open sky everywhere
const mesh = (n: Uint16Array[]) => buildChunkMesh(n, SKY, 0);
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

/** Number of quads whose 4 corners all lie on the plane y = planeY. */
function quadsOnPlaneY(m: MeshData, planeY: number): number {
  let n = 0;
  for (let q = 0; q < m.positions.length / 12; q++)
    if ([0, 1, 2, 3].every((k) => m.positions[(q * 4 + k) * 3 + 1] === planeY)) n++;
  return n;
}

describe('buildChunkMesh', () => {
  it('a lone block has 6 faces (4 vertices + 6 indices each)', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.STONE;
    const m = mesh(n);
    expect(quads(m.solid)).toBe(6);
    expect(m.solid.positions.length).toBe(6 * 4 * 3);
    expect(m.solid.uvs.length).toBe(6 * 4 * 2);
    expect(m.solid.colors.length).toBe(6 * 4 * 3);
    expect(quads(m.translucent)).toBe(0);
  });
  it('builds bottom faces at local y = 0 unless the chunk below hides them', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 0, 5)] = BlockId.STONE;
    expect(quads(mesh(n).solid)).toBe(6); // no bedrock floor any more
    n[neighborIndex(0, -1, 0)]![localIndex(5, 15, 5)] = BlockId.STONE;
    expect(quads(mesh(n).solid)).toBe(5);
  });
  it('hides the face between two touching blocks', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[CENTER]![localIndex(6, 10, 5)] = BlockId.STONE;
    expect(quads(mesh(n).solid)).toBe(10);
  });
  it('hides faces against blocks in neighbor chunks', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(15, 10, 5)] = BlockId.STONE;
    n[neighborIndex(1, 0, 0)]![localIndex(0, 10, 5)] = BlockId.STONE;
    expect(quads(mesh(n).solid)).toBe(5);
    const n2 = emptyNeighbors();
    n2[CENTER]![localIndex(5, 10, 0)] = BlockId.STONE;
    n2[neighborIndex(0, 0, -1)]![localIndex(5, 10, 15)] = BlockId.STONE;
    expect(quads(mesh(n2).solid)).toBe(5);
  });
  it('keeps faces next to see-through blocks', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[CENTER]![localIndex(6, 10, 5)] = BlockId.GLASS;
    // stone keeps all 6 faces (glass does not hide it); glass loses the face touching stone
    expect(quads(mesh(n).solid)).toBe(11);
  });
  it('glass-glass and water-water faces are hidden, leaves-leaves are kept', () => {
    const pair = (id: number) => {
      const n = emptyNeighbors();
      n[CENTER]![localIndex(5, 10, 5)] = id;
      n[CENTER]![localIndex(6, 10, 5)] = id;
      return mesh(n);
    };
    expect(quads(pair(BlockId.GLASS).solid)).toBe(10);
    expect(quads(pair(BlockId.LEAVES).solid)).toBe(12);
    const water = pair(BlockId.WATER);
    expect(quads(water.solid)).toBe(0);
    expect(quads(water.translucent)).toBe(10);
  });
  it('uses top/side/bottom tiles: grass top uv differs from grass side uv', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.GRASS;
    const m = mesh(n);
    const uvSets = new Set<string>();
    for (let q = 0; q < 6; q++) uvSets.add(`${m.solid.uvs[q * 8]},${m.solid.uvs[q * 8 + 1]}`);
    expect(uvSets.size).toBe(3); // top, side, bottom(dirt)
  });
  it('ambient occlusion darkens vertices next to a neighboring block', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.STONE;
    n[CENTER]![localIndex(6, 11, 5)] = BlockId.STONE; // diagonal: above and to the +X side
    const m = mesh(n);
    const top = quadColors(m.solid, (x, y, z) => y === 11 && x >= 5 && x <= 6 && z >= 5 && z <= 6);
    expect(top.length).toBe(4);
    expect(top.filter((c) => c === 1).length).toBe(2); // the 2 vertices at x = 5 stay fully lit
    expect(top.filter((c) => c < 1).length).toBe(2); // the 2 vertices at x = 6 are darkened
  });
  it('a fully lit top face has brightness 1, side faces are darker', () => {
    const n = emptyNeighbors();
    n[CENTER]![localIndex(5, 10, 5)] = BlockId.STONE;
    const m = mesh(n);
    expect(quadColors(m.solid, (_x, y) => y === 11)).toEqual([1, 1, 1, 1]);
    const all = Array.from(m.solid.colors);
    expect(Math.min(...all)).toBeCloseTo(0.5); // bottom face shade
  });
  it('meshes a generated surface chunk in reasonable time', () => {
    const g = new TerrainGenerator(5);
    const top = g.columnTops(0, 0)[8 * 16 + 8]!;
    const cy = Math.floor(top / 16);
    const chunks: Uint16Array[] = new Array(27);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = new Chunk(dx, cy + dy, dz);
          g.generateChunk(c);
          chunks[neighborIndex(dx, dy, dz)] = c.blocks;
        }
    const tops: Int32Array[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tops.push(g.columnTops(dx, dz));
    buildChunkMesh(chunks, tops, cy); // warm up
    // Take the fastest of several runs: the suite runs files in parallel, so a single
    // wall-clock sample measures machine load as much as the mesher. The minimum is
    // robust to preemption and still catches a real slowdown.
    let ms = Infinity;
    let m = buildChunkMesh(chunks, tops, cy);
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      m = buildChunkMesh(chunks, tops, cy);
      ms = Math.min(ms, performance.now() - t0);
    }
    console.log(`buildChunkMesh: ${ms.toFixed(2)} ms, ${quads(m.solid)} solid quads`);
    expect(quads(m.solid)).toBeGreaterThan(100);
    expect(ms).toBeLessThan(50);
  });

  it('builds no faces between stacked chunks', () => {
    const w = new TestWorld((_x, y) => (y === 15 || y === 16 ? BlockId.STONE : BlockId.AIR)); // cy 0 top layer, cy 1 bottom layer
    const below = buildChunkMesh(w.neighbors(0), w.tops(), 0);
    const above = buildChunkMesh(w.neighbors(1), w.tops(), 1);
    expect(quadsOnPlaneY(below.solid, 16)).toBe(0); // the shared plane, relative to chunk 0
    expect(quadsOnPlaneY(above.solid, 0)).toBe(0); // the same plane, relative to chunk 1
    expect(quadsOnPlaneY(below.solid, 15)).toBe(256); // bottom faces of chunk 0's layer
    expect(quadsOnPlaneY(above.solid, 1)).toBe(256); // top faces of chunk 1's layer (local y 0)
  });
  it('builds top faces at a vertical border, with AO read from the chunk above', () => {
    const w = new TestWorld().set(5, 15, 5, BlockId.STONE).set(6, 16, 5, BlockId.STONE); // diagonal, in chunk cy = 1
    const m = buildChunkMesh(w.neighbors(0), w.tops(), 0);
    const top = quadColors(m.solid, (x, y, z) => y === 16 && x >= 5 && x <= 6 && z >= 5 && z <= 6);
    expect(top.length).toBe(4);
    expect(top.filter((c) => c === 1).length).toBe(2); // the 2 vertices at x = 5 stay fully lit
    expect(top.filter((c) => c < 1).length).toBe(2); // the 2 vertices at x = 6 are darkened
  });
  it('quick exits give exactly what full meshing gives', () => {
    const empty = mesh(emptyNeighbors());
    expect(quads(empty.solid) + quads(empty.translucent)).toBe(0);
    const stone = () => Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME).fill(BlockId.STONE));
    const buried = mesh(stone());
    expect(quads(buried.solid) + quads(buried.translucent)).toBe(0);
    const n = stone();
    n[neighborIndex(0, 1, 0)]![localIndex(3, 0, 4)] = BlockId.AIR; // one air cell touching the top
    const one = buildChunkMesh(n, uniformTops(1000), 0);
    expect(quads(one.solid)).toBe(1);
    expect(quadsOnPlaneY(one.solid, 16)).toBe(1);
  });
});

describe('buildPaddedVolume', () => {
  it('copies 16-bit block states without truncating them', () => {
    const neighbors = emptyNeighbors();
    neighbors[neighborIndex(1, 0, 0)]![localIndex(0, 5, 3)] = 300; // the +X neighbor's first column, in the padding
    neighbors[neighborIndex(0, 1, 0)]![localIndex(2, 0, 3)] = 301; // the chunk above
    const vol = buildPaddedVolume(neighbors);
    expect(vol[padIndex(17, 6, 4)]).toBe(300);
    expect(vol[padIndex(3, 17, 4)]).toBe(301);
  });
});
