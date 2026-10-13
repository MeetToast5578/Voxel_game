import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../src/config';
import { chunkKey, inChunkBounds, localIndex, worldToChunk, worldToLocal } from '../src/core/coords';

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
  it('chunkKey formats as "cx,cz"', () => {
    expect(chunkKey(-2, 3)).toBe('-2,3');
  });
  it('localIndex covers 0..CHUNK_VOLUME-1 exactly once', () => {
    const seen = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y < 128; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) seen[localIndex(x, y, z)]++;
    expect(seen.every((v) => v === 1)).toBe(true);
    expect(localIndex(1, 0, 0)).toBe(1); // x is the fastest-changing axis
    expect(localIndex(0, 0, 1)).toBe(16);
    expect(localIndex(0, 1, 0)).toBe(256);
  });
  it('inChunkBounds', () => {
    expect(inChunkBounds(0, 0, 0)).toBe(true);
    expect(inChunkBounds(15, 127, 15)).toBe(true);
    expect(inChunkBounds(16, 0, 0)).toBe(false);
    expect(inChunkBounds(0, -1, 0)).toBe(false);
    expect(inChunkBounds(0, 128, 0)).toBe(false);
  });
});
