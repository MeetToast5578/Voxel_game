import { describe, expect, it } from 'vitest';
import { localIndex } from '../src/core/coords';
import { BlockId } from '../src/world/blocks';
import { buildRegion, computeBlockLight, computeSkyLight, neighborIndex, regionIndex } from '../src/world/light';
import { TestWorld, at, uniformTops } from './support/testWorld';

/** Stone up to and including y = groundY, air above. */
const ground = (groundY: number) => new TestWorld((_x, y) => (y <= groundY ? BlockId.STONE : BlockId.AIR));

function skyLight(w: TestWorld, cy: number): Uint8Array {
  return computeSkyLight(buildRegion(w.neighbors(cy)), w.tops(), (cy - 1) * 16);
}

describe('computeSkyLight', () => {
  it('open air is fully lit and solid ground is dark', () => {
    const light = skyLight(ground(50), 3);
    expect(light[at(5, 51, 5, 3)]).toBe(15);
    expect(light[at(5, 70, 5, 3)]).toBe(15);
    expect(light[at(5, 50, 5, 3)]).toBe(0);
  });
  it('sunlight falls straight down a shaft and spreads sideways into a tunnel, losing 1 per block', () => {
    const w = ground(50);
    for (let y = 40; y <= 50; y++) w.set(5, y, 5, BlockId.AIR); // shaft
    for (let x = 6; x <= 10; x++) w.set(x, 40, 5, BlockId.AIR); // tunnel at the bottom
    const light = skyLight(w, 2);
    expect(light[at(5, 40, 5, 2)]).toBe(15);
    expect(light[at(6, 40, 5, 2)]).toBe(14);
    expect(light[at(10, 40, 5, 2)]).toBe(10);
  });
  it('a sealed cave is completely dark', () => {
    const w = ground(50);
    for (let x = 3; x <= 8; x++) w.set(x, 30, 3, BlockId.AIR);
    expect(skyLight(w, 1)[at(5, 30, 3, 1)]).toBe(0);
  });
  it('light fades by 1 per block of water', () => {
    const w = ground(40);
    for (let y = 41; y <= 45; y++) w.set(5, y, 5, BlockId.WATER);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      for (let y = 41; y <= 45; y++) w.set(5 + dx, y, 5 + dz, BlockId.STONE); // walls around the column
    const light = skyLight(w, 2);
    expect(light[at(5, 45, 5, 2)]).toBe(14);
    expect(light[at(5, 41, 5, 2)]).toBe(10);
  });
  it('is 15 everywhere when every column top is below the region', () => {
    const light = computeSkyLight(buildRegion(new TestWorld().neighbors(0)), uniformTops(-1000), -16);
    expect(light.every((l) => l === 15)).toBe(true);
  });
  it('is 0 everywhere when every column top is above the region (no sunlight, nothing to flood from)', () => {
    const light = computeSkyLight(buildRegion(new TestWorld().neighbors(0)), uniformTops(1000), -16);
    expect(light.every((l) => l === 0)).toBe(true);
  });
  it('a single open column is a shaft of sunlight that fades by 1 per block sideways', () => {
    const tops = uniformTops(1000);
    tops[4]![5 * 16 + 5] = -1000; // centre column, cell (5, 5)
    const light = computeSkyLight(buildRegion(new TestWorld().neighbors(0)), tops, -16);
    for (const y of [-10, 0, 7, 20]) {
      expect(light[at(5, y, 5, 0)]).toBe(15);
      expect(light[at(6, y, 5, 0)]).toBe(14);
      expect(light[at(5, y, 4, 0)]).toBe(14);
      expect(light[at(8, y, 5, 0)]).toBe(12);
      expect(light[at(5, y, 13, 0)]).toBe(7);
    }
  });
  it('an overhang in the chunk above shades the cells below; they are lit from the side', () => {
    const w = new TestWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.set(x, 20, z, BlockId.STONE); // roof in chunk cy = 1
    const light = skyLight(w, 0);
    expect(light[at(8, 5, 8, 0)]).toBe(7); // 8 blocks from the open column at x = 16
    expect(light[at(0, 5, 8, 0)]).toBe(14); // next to the open column at x = -1
    expect(light[at(8, 25, 8, 0)]).toBe(15); // above the roof
  });
});

describe('computeBlockLight', () => {
  it('glowstone lights its surroundings, fading with distance, blocked by walls', () => {
    const w = ground(50);
    for (let x = 0; x < 16; x++) for (let y = 30; y <= 32; y++) w.set(x, y, 5, BlockId.AIR); // tunnel
    w.set(2, 31, 5, BlockId.GLOWSTONE);
    w.set(9, 31, 5, BlockId.STONE); // partial wall, light goes around it
    const light = computeBlockLight(buildRegion(w.neighbors(1)));
    expect(light[at(2, 31, 5, 1)]).toBe(15);
    expect(light[at(3, 31, 5, 1)]).toBe(14);
    expect(light[at(7, 31, 5, 1)]).toBe(10);
    expect(light[at(10, 31, 5, 1)]).toBe(5); // 8 steps along x + 2 to step around the wall = 10
  });
  it('crosses a vertical chunk border', () => {
    const w = new TestWorld().set(5, -1, 5, BlockId.GLOWSTONE); // chunk (0, -1, 0), local y 15
    const light = computeBlockLight(buildRegion(w.neighbors(0)));
    expect(light[at(5, 0, 5, 0)]).toBe(14); // centre chunk, local y 0
  });
});

describe('buildRegion', () => {
  it('copies 16-bit block states without truncating them', () => {
    const neighbors = new TestWorld().neighbors(0);
    neighbors[neighborIndex(1, 0, 0)]![localIndex(0, 4, 3)] = 300; // the +X neighbor
    expect(buildRegion(neighbors)[regionIndex(32, 16 + 4, 16 + 3)]).toBe(300);
  });
  it('places the chunk below at region y 0..15 and the chunk above at 32..47', () => {
    const neighbors = new TestWorld().neighbors(0);
    neighbors[neighborIndex(0, -1, 0)]![localIndex(1, 2, 3)] = BlockId.BRICK;
    neighbors[neighborIndex(0, 1, 0)]![localIndex(1, 2, 3)] = BlockId.GLASS;
    const region = buildRegion(neighbors);
    expect(region[regionIndex(17, 2, 19)]).toBe(BlockId.BRICK);
    expect(region[regionIndex(17, 34, 19)]).toBe(BlockId.GLASS);
  });
  it('fills a caller-provided array, so a hot loop can reuse one buffer', () => {
    const neighbors = new TestWorld().neighbors(0);
    neighbors[neighborIndex(0, 0, 1)]![localIndex(2, 5, 1)] = BlockId.BRICK;
    const out = new Uint16Array(48 * 48 * 48);
    expect(buildRegion(neighbors, out)).toBe(out);
    expect(out[regionIndex(18, 21, 33)]).toBe(BlockId.BRICK);
  });
  it('rejects an output array of the wrong size instead of writing past it', () => {
    const neighbors = new TestWorld().neighbors(0);
    expect(() => buildRegion(neighbors, new Uint16Array(10))).toThrow(/110592/);
  });
  it('gives the same result when a chunk view cannot be copied as 32-bit words', () => {
    // A view with an odd byte offset cannot back a Uint32Array, so the copy falls back to 16-bit element copies.
    const backing = new Uint16Array(4097);
    const neighbors = new TestWorld().neighbors(0);
    const odd = backing.subarray(1, 1 + 16 * 16 * 16);
    odd.set(neighbors[neighborIndex(1, 0, 0)]!);
    odd[localIndex(0, 4, 3)] = 300;
    neighbors[neighborIndex(1, 0, 0)] = odd;
    expect(buildRegion(neighbors)[regionIndex(32, 16 + 4, 16 + 3)]).toBe(300);
  });
  it('places all 27 chunks at their own region offsets', () => {
    const neighbors = new TestWorld().neighbors(0);
    const states: number[] = [];
    let state = 1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          neighbors[neighborIndex(dx, dy, dz)] = new Uint16Array(16 * 16 * 16).fill(state);
          states.push(state++);
        }
    const region = buildRegion(neighbors);
    let i = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = 16 + dx * 16 + 3;
          const y = 16 + dy * 16 + 4;
          const z = 16 + dz * 16 + 5;
          expect(region[regionIndex(x, y, z)]).toBe(states[i]!);
          i++;
        }
  });
});
