import { describe, expect, it } from 'vitest';
import { buildChunkMesh } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { LIGHT_CURVE, neighborIndex } from '../src/world/light';
import { TestWorld } from './support/testWorld';

/** Stone up to and including y = groundY, air above. */
const ground = (groundY: number) => new TestWorld((_x, y) => (y <= groundY ? BlockId.STONE : BlockId.AIR));

describe('buildChunkMesh lighting', () => {
  it('faces open to the sky get full sky light; faces in a sealed cave get none', () => {
    const w = ground(50);
    for (let x = 3; x <= 8; x++) w.set(x, 30, 3, BlockId.AIR);
    const surface = buildChunkMesh(w.neighbors(3), w.tops(), 3).solid; // y 48..63
    let sawSky = false;
    for (let v = 0; v < surface.positions.length / 3; v++) {
      if (surface.positions[v * 3 + 1] === 51 - 48) {
        expect(surface.light[v * 2]).toBe(1);
        sawSky = true;
      }
    }
    const cave = buildChunkMesh(w.neighbors(1), w.tops(), 1).solid; // y 16..31
    let sawDark = false;
    for (let v = 0; v < cave.positions.length / 3; v++) {
      const y = cave.positions[v * 3 + 1]! + 16;
      const z = cave.positions[v * 3 + 2]!;
      if (y > 29 && y < 31.5 && z >= 3 && z <= 4) {
        expect(cave.light[v * 2]).toBeCloseTo(LIGHT_CURVE[0]!);
        sawDark = true;
      }
    }
    expect(sawSky && sawDark).toBe(true);
  });
  it('glowstone faces are fully lit by block light', () => {
    const w = ground(50).set(5, 51, 5, BlockId.GLOWSTONE);
    const m = buildChunkMesh(w.neighbors(3), w.tops(), 3).solid;
    let found = false;
    for (let v = 0; v < m.positions.length / 3; v++) {
      if (m.positions[v * 3 + 1] === 52 - 48 && m.positions[v * 3] === 5 && m.positions[v * 3 + 2] === 5) {
        expect(m.light[v * 2 + 1]).toBe(1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
  // The setup generates the neighbourhood of 50 chunks, which can pass vitest's default 5 s under parallel load.
  it('meshes 50 surface chunks of seed 42 fast enough', { timeout: 30000 }, () => {
    const g = new TerrainGenerator(42);
    const tops = new Map<string, Int32Array>();
    const columnTops = (cx: number, cz: number) => {
      const key = `${cx},${cz}`;
      if (!tops.has(key)) tops.set(key, g.columnTops(cx, cz));
      return tops.get(key)!;
    };
    const chunks = new Map<string, Uint16Array>();
    const blocks = (cx: number, cy: number, cz: number) => {
      const key = `${cx},${cy},${cz}`;
      if (!chunks.has(key)) {
        const c = new Chunk(cx, cy, cz);
        g.generateChunk(c);
        chunks.set(key, c.blocks);
      }
      return chunks.get(key)!;
    };
    // 50 surface chunks: the chunk holding the top of each column's centre cell, over a 10 x 5 area.
    const jobs: { n: Uint16Array[]; t: Int32Array[]; cy: number }[] = [];
    for (let cz = 0; cz < 5; cz++)
      for (let cx = 0; cx < 10; cx++) {
        const cy = Math.floor(columnTops(cx, cz)[8 * 16 + 8]! / 16);
        const n: Uint16Array[] = new Array(27);
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) n[neighborIndex(dx, dy, dz)] = blocks(cx + dx, cy + dy, cz + dz);
        const t: Int32Array[] = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) t.push(columnTops(cx + dx, cz + dz));
        jobs.push({ n, t, cy });
      }
    for (const j of jobs.slice(0, 5)) buildChunkMesh(j.n, j.t, j.cy); // warm up
    // Best of two passes: the suite runs files in parallel, so a single pass measures machine
    // load as much as the mesher. The minimum still catches a real slowdown.
    let ms = Infinity;
    for (let pass = 0; pass < 2; pass++) {
      const t0 = performance.now();
      for (const j of jobs) buildChunkMesh(j.n, j.t, j.cy);
      ms = Math.min(ms, (performance.now() - t0) / jobs.length);
    }
    console.log(`buildChunkMesh, 50 surface chunks of seed 42: ${ms.toFixed(2)} ms average`);
    // The budget guard for spec 28 (task T-A3). The spec target is 3 ms and is NOT met yet (T-J1 is open: measured
    // 4.1 ms alone, ~5.2 ms here). 15 ms is ~3x the slowest documented measurement: it catches a real regression
    // (the tree-size bug of spec 39 was ~100x) without flaking on a slow laptop under parallel load. Tighten this
    // toward 3 ms when T-J1 lands.
    expect(ms).toBeLessThan(15);
  });
});
