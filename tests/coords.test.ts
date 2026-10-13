import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { chunkKey, columnKey, inChunkBounds, localIndex, worldToChunk, worldToLocal } from '../src/core/coords';

describe('coords', () => {
  it('maps world coordinates to chunk + local (including negatives)', () => {
    expect(worldToChunk(0)).toBe(0);
    expect(worldToChunk(15)).toBe(0);
    expect(worldToChunk(16)).toBe(1);
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToChunk(-16)).toBe(-1);
    expect(worldToChunk(-17)).toBe(-2);
    expect(worldToLocal(0)).toBe(0);
    expect(worldToLocal(17)).toBe(1);
    expect(worldToLocal(-1)).toBe(15);
    expect(worldToLocal(-17)).toBe(15);
  });
  it('world y -1 is in chunk -1 at local 15', () => {
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToLocal(-1)).toBe(15);
  });
  it('chunkKey formats as "cx,cy,cz" and columnKey as "cx,cz"', () => {
    expect(chunkKey(-1, -2, 3)).toBe('-1,-2,3');
    expect(columnKey(-2, 3)).toBe('-2,3');
  });
  it('localIndex covers 0..4095 exactly once', () => {
    expect(CHUNK_VOLUME).toBe(4096);
    const seen = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) seen[localIndex(x, y, z)]++;
    expect(seen.every((v) => v === 1)).toBe(true);
    expect(localIndex(1, 0, 0)).toBe(1); // x is the fastest-changing axis
    expect(localIndex(0, 0, 1)).toBe(16);
    expect(localIndex(0, 1, 0)).toBe(256);
  });
  it('inChunkBounds checks all three axes', () => {
    expect(inChunkBounds(0, 0, 0)).toBe(true);
    expect(inChunkBounds(15, 15, 15)).toBe(true);
    for (const bad of [16, -1]) {
      expect(inChunkBounds(bad, 0, 0)).toBe(false);
      expect(inChunkBounds(0, bad, 0)).toBe(false);
      expect(inChunkBounds(0, 0, bad)).toBe(false);
    }
  });
});
