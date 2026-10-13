import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('runs whole fixed steps and passes the leftover fraction to render', () => {
    let updates = 0;
    let alpha = -1;
    const loop = new FixedStepLoop(1 / 60, 0.25, () => updates++, (a) => (alpha = a));
    expect(loop.advance(1 / 30 + 1e-9)).toBe(2);
    expect(loop.advance(0.001)).toBe(0);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });
  it('clamps very long frames to maxFrameDt', () => {
    let updates = 0;
    const loop = new FixedStepLoop(1 / 60, 0.25, () => updates++, () => {});
    loop.advance(10);
    expect(updates).toBe(15);
  });
  it('ignores negative frame times', () => {
    const loop = new FixedStepLoop(1 / 60, 0.25, () => {}, () => {});
    expect(loop.advance(-1)).toBe(0);
  });
});
