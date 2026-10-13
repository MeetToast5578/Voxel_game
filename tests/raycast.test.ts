import { describe, expect, it } from 'vitest';
import { raycastVoxels } from '../src/player/raycast';

describe('raycastVoxels', () => {
  it('hits along +X with the face normal pointing back', () => {
    const hit = raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 10, (x, y, z) => x === 3 && y === 0 && z === 0);
    expect(hit).toMatchObject({ x: 3, y: 0, z: 0, nx: -1, ny: 0, nz: 0 });
    expect(hit!.distance).toBeCloseTo(2.5);
  });
  it('hits the top of the ground when looking down', () => {
    const hit = raycastVoxels(0.5, 10.5, 0.5, 0, -1, 0, 10, (_x, y) => y <= 5);
    expect(hit).toMatchObject({ x: 0, y: 5, z: 0, nx: 0, ny: 1, nz: 0 });
    expect(hit!.distance).toBeCloseTo(4.5);
  });
  it('works with negative coordinates', () => {
    const hit = raycastVoxels(-0.5, 0.5, 0.5, -1, 0, 0, 10, (x) => x === -3);
    expect(hit).toMatchObject({ x: -3, nx: 1 });
    expect(hit!.distance).toBeCloseTo(1.5);
  });
  it('returns null when nothing is within maxDistance', () => {
    expect(raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 2, (x) => x === 5)).toBeNull();
  });
  it('skips the block containing the origin', () => {
    const hit = raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 10, () => true);
    expect(hit).toMatchObject({ x: 1, y: 0, z: 0 });
  });
  it('handles diagonal rays', () => {
    const d = Math.SQRT1_2;
    const hit = raycastVoxels(0.5, 0.5, 0.5, d, 0, d, 10, (x, _y, z) => x === 2 && z === 2);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBe(2);
    expect(hit!.z).toBe(2);
  });
});
