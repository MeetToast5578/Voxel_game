import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../src/config';
import { localIndex } from '../src/core/coords';
import { BlockId } from '../src/world/blocks';
import { buildRegion, computeBlockLight, computeSkyLight, regionIndex } from '../src/world/light';

/** 9 chunks filled with stone up to and including y = groundY. Index (dz + 1) * 3 + (dx + 1). */
function flatNeighbors(groundY: number): Uint16Array[] {
  return Array.from({ length: 9 }, () => {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let y = 0; y <= groundY; y++)
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) blocks[localIndex(x, y, z)] = BlockId.STONE;
    return blocks;
  });
}
const C = CHUNK_SIZE; // region coordinate of the center chunk's local x/z = 0

describe('computeSkyLight', () => {
  it('open air is fully lit and solid ground is dark', () => {
    const light = computeSkyLight(buildRegion(flatNeighbors(50)));
    expect(light[regionIndex(C + 5, 51, C + 5)]).toBe(15);
    expect(light[regionIndex(C + 5, 100, C + 5)]).toBe(15);
    expect(light[regionIndex(C + 5, 50, C + 5)]).toBe(0);
  });
  it('sunlight falls straight down a shaft and spreads sideways into a tunnel, losing 1 per block', () => {
    const n = flatNeighbors(50);
    for (let y = 40; y <= 50; y++) n[4]![localIndex(5, y, 5)] = BlockId.AIR; // shaft
    for (let x = 6; x <= 10; x++) n[4]![localIndex(x, 40, 5)] = BlockId.AIR; // tunnel at the bottom
    const light = computeSkyLight(buildRegion(n));
    expect(light[regionIndex(C + 5, 40, C + 5)]).toBe(15);
    expect(light[regionIndex(C + 6, 40, C + 5)]).toBe(14);
    expect(light[regionIndex(C + 10, 40, C + 5)]).toBe(10);
  });
  it('a sealed cave is completely dark', () => {
    const n = flatNeighbors(50);
    for (let x = 3; x <= 8; x++) n[4]![localIndex(x, 30, 3)] = BlockId.AIR;
    const light = computeSkyLight(buildRegion(n));
    expect(light[regionIndex(C + 5, 30, C + 3)]).toBe(0);
  });
  it('light fades by 1 per block of water', () => {
    const n = flatNeighbors(40);
    for (let y = 41; y <= 45; y++) n[4]![localIndex(5, y, 5)] = BlockId.WATER;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      for (let y = 41; y <= 45; y++) n[4]![localIndex(5 + dx, y, 5 + dz)] = BlockId.STONE; // walls around the column
    const light = computeSkyLight(buildRegion(n));
    expect(light[regionIndex(C + 5, 45, C + 5)]).toBe(14);
    expect(light[regionIndex(C + 5, 41, C + 5)]).toBe(10);
  });
});

describe('computeBlockLight', () => {
  it('glowstone lights its surroundings, fading with distance, blocked by walls', () => {
    const n = flatNeighbors(50);
    for (let x = 0; x < 16; x++) for (let y = 30; y <= 32; y++) n[4]![localIndex(x, y, 5)] = BlockId.AIR; // tunnel
    n[4]![localIndex(2, 31, 5)] = BlockId.GLOWSTONE;
    n[4]![localIndex(9, 31, 5)] = BlockId.STONE; // partial wall, light goes around it
    const light = computeBlockLight(buildRegion(n));
    expect(light[regionIndex(C + 2, 31, C + 5)]).toBe(15);
    expect(light[regionIndex(C + 3, 31, C + 5)]).toBe(14);
    expect(light[regionIndex(C + 7, 31, C + 5)]).toBe(10);
    expect(light[regionIndex(C + 10, 31, C + 5)]).toBe(5); // 8 steps along x + 2 to step around the wall = 10
  });
});

describe('buildRegion', () => {
  it('copies 16-bit block states without truncating them', () => {
    const neighbors = flatNeighbors(10);
    neighbors[5]![localIndex(0, 20, 3)] = 300; // the +X neighbor
    expect(buildRegion(neighbors)[regionIndex(2 * C, 20, C + 3)]).toBe(300);
  });
});
