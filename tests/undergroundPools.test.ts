import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SHORE_ROOF } from '../src/config';
import { localIndex } from '../src/core/coords';
import { UndergroundPools } from '../src/world/undergroundPools';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';

function read(g: TerrainGenerator, x: number, y: number, z: number): number {
  const cx = Math.floor(x / 16), cy = Math.floor(y / 16), cz = Math.floor(z / 16);
  const c = new Chunk(cx, cy, cz); g.generateChunk(c);
  return c.get(x - cx * 16, y - cy * 16, z - cz * 16);
}

describe('dedicated underground pools (T-D4)', () => {
  it('is seeded and stateless at negative grid coordinates, with separated depth bands', () => {
    const a = new UndergroundPools(1), again = new UndergroundPools(1), b = new UndergroundPools(2);
    for (const lava of [false, true]) {
      expect(a.poolAt(-1, -2, lava)).toEqual(again.poolAt(-1, -2, lava));
      expect(a.poolAt(-1, -2, lava)).not.toEqual(b.poolAt(-1, -2, lava));
    }
    expect(a.poolAt(-1, -2, true).y).toBeLessThan(a.poolAt(-1, -2, false).y);
  });
  it.each([false, true])('builds a real generated basin with a level liquid, air and solid shell (lava=%s)', lava => {
    const p = new UndergroundPools(1).poolAt(0, 0, lava), g = new TerrainGenerator(1);
    expect(read(g, p.x, p.y, p.z)).toBe(p.fluid);
    expect(read(g, p.x, p.y + 1, p.z)).toBe(BlockId.AIR);
    expect(read(g, p.x, p.y - p.halfHeight, p.z)).toBe(lava ? BlockId.BASALT : BlockId.STONE);
    expect(read(g, p.x + p.radius, p.y, p.z)).toBe(lava ? BlockId.BASALT : BlockId.STONE);
    expect(read(g, p.x, p.y + p.halfHeight, p.z)).toBe(lava ? BlockId.BASALT : BlockId.STONE);
  });
  it('reproduces the same basin in combined and split vertical slices across negative chunks', () => {
    const pools = new UndergroundPools(3), p = pools.poolAt(-1, -1, false);
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16), y0 = Math.floor(p.y / 16) * 16;
    const full = new Uint16Array(16 * 32 * 16).fill(BlockId.GRANITE);
    pools.fill(cx, cz, y0, y0 + 32, full, () => 100);
    const split = new Uint16Array(full.length);
    for (const offset of [16, 0]) {
      const c = new Uint16Array(4096).fill(BlockId.GRANITE);
      pools.fill(cx, cz, y0 + offset, y0 + offset + 16, c, () => 100);
      split.set(c, offset * 256);
    }
    expect(split).toEqual(full);
    expect(full.includes(BlockId.WATER)).toBe(true);
  });
  it('rejects the whole basin if even a distant shell cell would breach the terrain roof', () => {
    const pools = new UndergroundPools(1), p = pools.poolAt(0, 0, false);
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16), y0 = p.y - 16;
    const out = new Uint16Array(16 * 32 * 16).fill(BlockId.GRANITE);
    pools.fill(cx, cz, y0, y0 + 32, out, (x, z) => x === p.x + p.radius + 1 && z === p.z ? p.y : 100);
    expect(out.every(id => id === BlockId.GRANITE)).toBe(true);
  });
  it('leaves the entire surface-water roof untouched, even if it intersects a basin', () => {
    const pools = new UndergroundPools(1), p = pools.poolAt(0, 0, false);
    const cx = Math.floor(p.x / CHUNK_SIZE), cz = Math.floor(p.z / CHUNK_SIZE), y0 = p.y - 16;
    const out = new Uint16Array(16 * 32 * 16).fill(BlockId.SAND);
    const surface = p.y + 1;
    pools.fill(cx, cz, y0, y0 + 32, out, () => surface);
    for (let y = surface - SHORE_ROOF + 1; y < y0 + 32; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++)
      expect(out[localIndex(x, y - y0, z)]).toBe(BlockId.SAND);
  });
});
