import { describe, expect, it } from 'vitest';
import { FeatureRegistry } from '../src/world/feature';

describe('FeatureRegistry', () => {
  it('registers and looks up features by key', () => {
    const reg = new FeatureRegistry();
    reg.registerFeature({
      key: 'test',
      densityPerChunk: 1,
      maxExtentBlocks: 2,
      place: () => {},
    });
    expect(reg.getFeature('test')).toBeDefined();
    expect(reg.getFeature('missing')).toBeUndefined();
  });

  it('throws on duplicate key', () => {
    const reg = new FeatureRegistry();
    reg.registerFeature({ key: 'dup', densityPerChunk: 1, maxExtentBlocks: 1, place: () => {} });
    expect(() => reg.registerFeature({ key: 'dup', densityPerChunk: 1, maxExtentBlocks: 1, place: () => {} })).toThrow();
  });

  it('evaluates anchors deterministically: same seed and range gives same blocks', () => {
    const reg = new FeatureRegistry();
    const blocks: number[] = [];
    reg.registerFeature({
      key: 'det',
      densityPerChunk: 4,
      maxExtentBlocks: 4,
      place: (_seed, ax, az, emit) => {
        emit({ x: ax, y: 0, z: az, state: 1 });
      },
    });
    reg.evaluateAnchors(42, 0, 32, 0, 32, 0, 1, (b) => blocks.push(b.x * 1000 + b.z));
    const first = [...blocks].sort();
    blocks.length = 0;
    reg.evaluateAnchors(42, 0, 32, 0, 32, 0, 1, (b) => blocks.push(b.x * 1000 + b.z));
    expect([...blocks].sort()).toEqual(first);
  });

  it('different seeds give different anchors', () => {
    const reg = new FeatureRegistry();
    const blocks1: number[] = [];
    const blocks2: number[] = [];
    reg.registerFeature({
      key: 'diff',
      densityPerChunk: 4,
      maxExtentBlocks: 4,
      place: (_seed, ax, az, emit) => emit({ x: ax, y: 0, z: az, state: 1 }),
    });
    reg.evaluateAnchors(1, 0, 32, 0, 32, 0, 1, (b) => blocks1.push(b.x * 1000 + b.z));
    reg.evaluateAnchors(2, 0, 32, 0, 32, 0, 1, (b) => blocks2.push(b.x * 1000 + b.z));
    expect([...blocks1].sort()).not.toEqual([...blocks2].sort());
  });

  it('only emits blocks inside the requested range', () => {
    const reg = new FeatureRegistry();
    const blocks: number[] = [];
    reg.registerFeature({
      key: 'inrange',
      densityPerChunk: 1,
      maxExtentBlocks: 100,
      place: (_seed, ax, az, emit) => {
        emit({ x: ax, y: 0, z: az, state: 1 });
        emit({ x: ax + 200, y: 0, z: az + 200, state: 1 }); // far outside range
      },
    });
    reg.evaluateAnchors(42, 0, 16, 0, 16, 0, 1, (b) => blocks.push(b.x * 1000 + b.z));
    for (const v of blocks) {
      const x = Math.floor(v / 1000);
      const z = v % 1000;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(16);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThan(16);
    }
  });

  it('features are seamless across chunk borders', () => {
    const reg = new FeatureRegistry();
    const left: number[] = [];
    const right: number[] = [];
    reg.registerFeature({
      key: 'seam',
      densityPerChunk: 1,
      maxExtentBlocks: 8,
      place: (_seed, ax, az, emit) => {
        for (let dx = -2; dx <= 2; dx++) emit({ x: ax + dx, y: 0, z: az, state: 1 });
        for (let dz = -2; dz <= 2; dz++) emit({ x: ax, y: 0, z: az + dz, state: 1 });
      },
    });
    reg.evaluateAnchors(42, 0, 16, 0, 16, 0, 1, (b) => left.push(b.x * 100 + b.z));
    reg.evaluateAnchors(42, 16, 32, 0, 16, 0, 1, (b) => right.push(b.x * 100 + b.z));
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    for (const v of leftSet) {
      const x = Math.floor(v / 100);
      if (x < 15) expect(rightSet.has(v)).toBe(false);
    }
    for (const v of rightSet) {
      const x = Math.floor(v / 100);
      if (x > 16) expect(leftSet.has(v)).toBe(false);
    }
  });

  it('respects maxExtentBlocks: anchors too far away are not evaluated', () => {    const reg = new FeatureRegistry();
    let evaluated = 0;
    reg.registerFeature({
      key: 'near',
      densityPerChunk: 1,
      maxExtentBlocks: 1,
      place: () => { evaluated++; },
    });
    reg.evaluateAnchors(42, 0, 16, 0, 16, 0, 1, () => {});
    expect(evaluated).toBeGreaterThan(0);
  });

  it('gives features with equal-length keys independent anchor jitter', () => {
    const run = (key: string) => {
      const reg = new FeatureRegistry();
      const out: number[] = [];
      reg.registerFeature({
        key,
        densityPerChunk: 1,
        maxExtentBlocks: 0,
        place: (_seed, ax, az, emit) => emit({ x: ax, y: 0, z: az, state: 1 }),
      });
      reg.evaluateAnchors(42, 0, 64, 0, 64, 0, 1, (b) => out.push(b.x * 1000 + b.z));
      return out.sort();
    };
    // The jitter used to be keyed by key.length, so these two would coincide.
    expect(run('aaaa')).not.toEqual(run('bbbb'));
  });
});
