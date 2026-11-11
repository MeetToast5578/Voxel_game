import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Generator } from '../worldgen/generator';
import { Underground, type CaveBiome } from '../worldgen/underground';

const N = CHUNK_SIZE;

describe('cave biomes', () => {
  it('seed 1 has every kind within 300 m of spawn, each dressed in its own blocks', () => {
    const ug = new Underground(1), gen = new Generator(1), r = Math.floor(300 / BLOCK_SIZE_M);
    const found = new Map<CaveBiome, [number, number]>();
    for (let x = -r; x <= r; x += 24) for (let z = -r; z <= r; z += 24) {
      const k = ug.caveBiome(x, z);
      if (!found.has(k) && Math.hypot(x, z) <= r) found.set(k, [x, z]);
    }
    expect([...found.keys()].sort()).toEqual(['crystal', 'flooded', 'mushroom', 'none', 'spider']);
    // Generate a block of chunks 20–80 m down in the middle of each region and count what is there.
    const wanted: Partial<Record<CaveBiome, string>> = { mushroom: 'glow_mushroom', crystal: 'cave_crystal', spider: 'cobweb', flooded: 'water' };
    for (const [kind, block] of Object.entries(wanted)) {
      const [x, z] = found.get(kind as CaveBiome)!;
      let n = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let cy = -9; cy <= -3; cy++) {
        const cx = Math.floor(x / N) + dx, cz = Math.floor(z / N) + dz, out = new Uint16Array(CHUNK_VOLUME), u = gen.generate(cx, cy, cz, out);
        if (u >= 0) continue;
        // Only cells in this region (regions have wavy edges).
        out.forEach((s, i) => { if (BLOCKS.type(s).key === block && ug.caveBiome(cx * N + (i % N), cz * N + (Math.floor(i / N) % N)) === kind) n++; });
      }
      expect(n, kind).toBeGreaterThan(5);
    }
  });
});
