import { describe, expect, it } from 'vitest';
import { BlockBreaking } from '../src/player/breaking';

const cell = (x: number) => ({ x, y: 0, z: 0 });

describe('BlockBreaking', () => {
  it('breaks a block with hardness 0 on the first update', () => {
    const b = new BlockBreaking();
    expect(b.update(1 / 60, true, cell(1), 0)).toEqual(cell(1));
    expect(b.target).toBeNull();
  });

  it('takes hardness seconds of holding, and not before', () => {
    const b = new BlockBreaking();
    expect(b.update(0.5, true, cell(1), 2)).toBeNull(); // 0.5 s of 2 s
    expect(b.stage).toBe(2);
    expect(b.update(0.5, true, cell(1), 2)).toBeNull(); // 1 s
    expect(b.update(0.5, true, cell(1), 2)).toBeNull(); // 1.5 s
    expect(b.stage).toBe(7);
    expect(b.update(0.5, true, cell(1), 2)).toEqual(cell(1)); // 2 s: broken
  });

  it('shows ten crack stages, one per tenth of the progress', () => {
    const b = new BlockBreaking();
    expect(b.stage).toBe(-1);
    b.update(0.1, true, cell(1), 1); // 10 %
    expect(b.stage).toBe(1);
    b.update(0.85, true, cell(1), 1); // 95 %
    expect(b.stage).toBe(9);
    b.update(0.05, true, cell(1), 1); // 100 %: broken
    expect(b.stage).toBe(-1);
  });

  it('starts again when the aim moves to another cell', () => {
    const b = new BlockBreaking();
    b.update(0.5, true, cell(1), 1);
    expect(b.stage).toBe(5);
    b.update(0.1, true, cell(2), 1);
    expect(b.stage).toBe(1);
    expect(b.target).toEqual(cell(2));
  });

  it('resets when the button is let go, or when there is nothing to break', () => {
    const b = new BlockBreaking();
    b.update(0.5, true, cell(1), 1);
    b.update(0.1, false, cell(1), 1);
    expect(b.stage).toBe(-1);
    b.update(0.5, true, cell(1), 1);
    expect(b.update(0.1, true, cell(1), null)).toBeNull(); // cannot be broken
    expect(b.stage).toBe(-1);
    b.update(0.5, true, null, 1);
    expect(b.stage).toBe(-1);
  });
});
