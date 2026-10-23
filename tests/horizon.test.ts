import { describe, expect, it } from 'vitest';
import { TerrainGenerator } from '../src/world/generator';
import { BLOCK_SIZE_M, CHUNK_SIZE, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, terrainTransition } from '../src/config';
import { buildHorizon, HorizonSampler, type HorizonSample } from '../src/world/horizon';
import { HORIZON_RECENTER_BLOCKS, HORIZON_RING_CELLS, HORIZON_STEPS_BLOCKS } from '../src/config';
const field = (x: number, z: number): HorizonSample => [Math.sin(x / 100) * 10 + z / 100, 0.2, 0.4, 0.1];
describe('distant terrain rings (T-D7)', () => {
  it('builds bounded finite geometry to kilometres with upward triangles and coverage under the moving shader hole', () => {
    const d = buildHorizon(-64, -128, 128, field);
    expect(d.radius * 0.3).toBeGreaterThan(2000); expect(d.indices.length).toBeGreaterThan(0);
    expect(Array.from(d.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(d.indices).every(i => i < d.positions.length / 3)).toBe(true);
    for (let i = 0; i < d.indices.length; i += 3) {
      const a = d.indices[i]! * 3, b = d.indices[i + 1]! * 3, c = d.indices[i + 2]! * 3;
      const nx = (d.positions[b + 2]! - d.positions[a + 2]!) * (d.positions[c]! - d.positions[a]!) - (d.positions[b]! - d.positions[a]!) * (d.positions[c + 2]! - d.positions[a + 2]!);
      expect(nx).toBeGreaterThan(0);
      expect(Math.max(...[a, b, c].map(v => Math.max(Math.abs(d.positions[v]!), Math.abs(d.positions[v + 2]!))))).toBeGreaterThan(0);
    }
  });
  it('covers the snapped centre so camera movement cannot expose an unmeshed square hole', () => {
    const d = buildHorizon(64, 64, 128, field);
    const used = new Set(d.indices);
    const centre = Array.from({ length: d.positions.length / 3 }, (_, i) => i)
      .find(i => d.positions[i * 3] === 0 && d.positions[i * 3 + 2] === 0)!;
    expect(used.has(centre)).toBe(true);
  });
  it('snaps fine outer vertices to linear coarse edges, avoiding cracks', () => {
    const d = buildHorizon(0, 0, 128, field), side = HORIZON_RING_CELLS * 2 + 1;
    const radius = HORIZON_STEPS_BLOCKS[0] * HORIZON_RING_CELLS;
    for (let i = 0; i < side * side; i++) {
      const x = d.positions[i * 3]!, z = d.positions[i * 3 + 2]!;
      if (Math.abs(x) !== radius || z % HORIZON_STEPS_BLOCKS[1] === 0) continue;
      const z0 = Math.floor(z / HORIZON_STEPS_BLOCKS[1]) * HORIZON_STEPS_BLOCKS[1], t = (z - z0) / HORIZON_STEPS_BLOCKS[1];
      const expected = field(x, z0)[0] * (1 - t) + field(x, z0 + HORIZON_STEPS_BLOCKS[1])[0] * t;
      expect(d.positions[i * 3 + 1]).toBeCloseTo(expected, 5);
    }
  });
  it('keeps the snapped hole inside loaded terrain at minimum and maximum view distances', () => {
    for (const view of [32, 128, 256]) {
      const d = buildHorizon(-64, 0, view, field), recenter = Math.min(HORIZON_RECENTER_BLOCKS, Math.max(16, view / 2));
      expect(d.inner + recenter).toBeLessThanOrEqual(view);
    }
  });
  it('uses deterministic real seeded terrain with variation and a water surface', () => {
    const a = new HorizonSampler(1), b = new HorizonSampler(1), c = new HorizonSampler(2);
    const sample = a.at(-5000, -5000, 0, 0, 128);
    expect(sample).toEqual(b.at(-5000, -5000, 0, 0, 128));
    expect(sample).not.toEqual(c.at(-5000, -5000, 0, 0, 128));
    expect(sample.every(Number.isFinite)).toBe(true);
  });
});

it('uses the same ground and water heights as voxels at near and distant coordinates, independent of camera', () => {
  const sampler = new HorizonSampler(1), terrain = new TerrainGenerator(1);
  for (const [x, z] of [[0, 0], [101, -26], [3517, -2163], [-5000, -5000]]) {
    const surface = terrain.sampleSurface(x!, z!);
    expect(surface.height).toBe(terrain.getHeight(x!, z!));
    const expected = Math.max(surface.height, Math.floor(Math.max(0, surface.waterLevelM) / BLOCK_SIZE_M)) + 1 - 0.05;
    expect(sampler.at(x!, z!, 0, 0, 128)[0]).toBeCloseTo(expected, 8);
    expect(sampler.at(x!, z!, x!, z!, 32)).toEqual(sampler.at(x!, z!, 0, 0, 128));
  }
});

it('finishes the proxy fade before fading voxels, and hides clipped features before the chunk edge', () => {
  for (let r = MIN_RENDER_DISTANCE; r <= MAX_RENDER_DISTANCE; r++) {
    const fade = terrainTransition(r * CHUNK_SIZE);
    expect(fade.proxyStart).toBeGreaterThanOrEqual(0);
    expect(fade.proxyStart).toBeLessThan(fade.start);
    expect(fade.start).toBeLessThan(fade.end);
    expect(fade.end).toBeLessThanOrEqual((r - 1) * CHUNK_SIZE);
  }
});
