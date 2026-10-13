import { describe, expect, it } from 'vitest';
import { clamp, floorDiv, lerp, mod } from '../src/core/math';
import { hash2, mulberry32 } from '../src/core/random';

describe('math', () => {
  it('floorDiv rounds toward negative infinity', () => {
    expect(floorDiv(0, 16)).toBe(0);
    expect(floorDiv(15, 16)).toBe(0);
    expect(floorDiv(16, 16)).toBe(1);
    expect(floorDiv(-1, 16)).toBe(-1);
    expect(floorDiv(-16, 16)).toBe(-1);
    expect(floorDiv(-17, 16)).toBe(-2);
  });
  it('mod is never negative', () => {
    expect(mod(-1, 16)).toBe(15);
    expect(mod(-16, 16)).toBe(0);
    expect(mod(17, 16)).toBe(1);
    expect(mod(5, 16)).toBe(5);
  });
  it('clamp and lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('random', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
  it('hash2 is deterministic, in [0, 1) and depends on every input', () => {
    expect(hash2(1, 5, -7)).toBe(hash2(1, 5, -7));
    expect(hash2(1, 5, -7)).not.toBe(hash2(2, 5, -7));
    expect(hash2(1, 5, -7)).not.toBe(hash2(1, 6, -7));
    expect(hash2(1, 5, -7)).not.toBe(hash2(1, 5, -8));
    for (let i = -50; i < 50; i++) {
      const v = hash2(9, i, i * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
