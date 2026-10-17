import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../src/config';
import { BlockId } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { findSpawnColumn, surfaceY } from '../src/world/spawn';

describe('spawn', () => {
  it('findSpawnColumn picks dry land for many seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new TerrainGenerator(seed);
      const s = findSpawnColumn(g);
      expect(g.getHeight(Math.floor(s.x), Math.floor(s.z))).toBeGreaterThan(SEA_LEVEL + 1);
    }
  }, 30_000); // each seed builds a generator and scans rings of columns; a few seconds on a loaded machine
  it('surfaceY scans down from the column top to just above the highest solid block (water is not solid)', () => {
    expect(surfaceY((_x, y) => (y <= 50 ? BlockId.STONE : BlockId.AIR), 0.5, 0.5, 50)).toBe(51);
    expect(surfaceY((_x, y) => (y <= 50 ? BlockId.STONE : y <= 55 ? BlockId.WATER : BlockId.AIR), 0.5, 0.5, 55)).toBe(51);
    expect(surfaceY((_x, y) => (y <= -300 ? BlockId.STONE : BlockId.AIR), 0.5, 0.5, -300)).toBe(-299);
  });
});
