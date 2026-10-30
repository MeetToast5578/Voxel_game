import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../config';
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
});
