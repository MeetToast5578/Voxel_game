import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { BLOCKS, FLUID_LEVELS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Simulation } from '../sim/simulation';
import { TickKind } from '../sim/ticks';
import { Generator, SEA_CELL } from '../worldgen/generator';

/** River or lake water at a cell column: its water surface is above sea level and above the ground. */
function wet(gen: Generator, x: number, z: number): boolean {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const c = gen.column(cx, cz), i = (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE);
  return c.water[i]! > SEA_CELL && c.top[i]! + 1 <= c.water[i]!;
}

/** The first river cell found scanning outward from the origin along a line. */
function findRiver(gen: Generator): [number, number] {
  for (let r = 0; r < 4000; r += 3) for (const [x, z] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r]] as const) if (wet(gen, x, z)) return [x, z];
  throw new Error('no river found');
}

describe('rivers', () => {
  it('runs as one connected channel across many chunk borders', () => {
    const gen = new Generator(1);
    const [sx, sz] = findRiver(gen);
    // Flood along wet cells, bounded so the test stays quick.
    const seen = new Set<string>([`${sx},${sz}`]);
    const queue: [number, number][] = [[sx, sz]];
    const chunks = new Set<string>();
    while (queue.length > 0 && seen.size < 6000) {
      const [x, z] = queue.shift()!;
      chunks.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = `${x + dx},${z + dz}`;
        if (seen.has(k) || !wet(gen, x + dx, z + dz)) continue;
        seen.add(k);
        queue.push([x + dx, z + dz]);
      }
    }
    expect(chunks.size).toBeGreaterThan(8);
  }, 120000);

  it('does not depend on the order columns are generated in', () => {
    const a = new Generator(4), b = new Generator(4);
    const cols = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]] as const;
    const fromA = cols.map(([x, z]) => Array.from(a.column(x, z).water));
    const fromB = [...cols].reverse().map(([x, z]) => Array.from(b.column(x, z).water)).reverse();
    expect(fromB).toEqual(fromA);
  });

  it('spills over steps as waterfalls that block updates leave as they are', () => {
    // A tall fall in seed 1 (found by scanning column features).
    const gen = new Generator(1), world = new World();
    const [fx, fz] = [-591, -468], fcx = Math.floor(fx / CHUNK_SIZE), fcz = Math.floor(fz / CHUNK_SIZE);
    for (let cx = fcx - 1; cx <= fcx + 1; cx++) for (let cz = fcz - 1; cz <= fcz + 1; cz++) for (let cy = 0; cy <= 5; cy++) {
      const out = new Uint16Array(CHUNK_VOLUME), u = gen.generate(cx, cy, cz, out);
      const chunk = new Chunk(cx, cy, cz, u >= 0 ? u : 0);
      if (u < 0) chunk.load(out);
      world.add(chunk);
    }
    let changes = 0;
    const sim: Simulation = new Simulation(world, (x, y, z, s) => {
      const previous = world.get(x, y, z);
      if (world.set(x, y, z, s)) {
        changes++;
        sim.onCellChanged(x, y, z, previous);
      }
    }, 1);
    const SPILL = BLOCKS.state('flowing_water', FLUID_LEVELS - 1), FALLING = BLOCKS.state('flowing_water', 2 * FLUID_LEVELS - 1);
    let falls = 0;
    for (let x = fcx * CHUNK_SIZE; x < (fcx + 1) * CHUNK_SIZE; x++) for (let z = fcz * CHUNK_SIZE; z < (fcz + 1) * CHUNK_SIZE; z++) {
      for (let y = 0; y < 6 * CHUNK_SIZE; y++) {
        const s = world.get(x, y, z);
        if (s !== SPILL && s !== FALLING) continue;
        if (s === FALLING) falls++;
        sim.ticks.schedule(x, y, z, TickKind.Flow, 1);
      }
    }
    expect(falls).toBeGreaterThan(10);
    for (let i = 0; i < 100; i++) sim.step(0, 0);
    expect(changes).toBe(0);
  });
});
