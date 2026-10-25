import { describe, expect, it } from 'vitest';
import { MIN_RENDER_DISTANCE } from '../src/config';
import { MIN_WORK_SHARE, cappedRenderDistance, chunkWorkShare } from '../src/world/budgets';

describe('adaptive budgets and memory caps (T-J6)', () => {
  it('chunk work gets its full budget at 60 fps and shrinks on slow frames, never below the minimum', () => {
    expect(chunkWorkShare(1 / 60)).toBe(1);
    expect(chunkWorkShare(1 / 120)).toBe(1);
    expect(chunkWorkShare(1 / 40)).toBeGreaterThan(MIN_WORK_SHARE);
    expect(chunkWorkShare(1 / 40)).toBeLessThan(1);
    expect(chunkWorkShare(1 / 30)).toBeCloseTo(MIN_WORK_SHARE);
    expect(chunkWorkShare(1 / 5)).toBe(MIN_WORK_SHARE);
  });

  it('steps the render distance down over the chunk cap and back up once well under it', () => {
    expect(cappedRenderDistance(12, 12, 11000, 10000)).toBe(11);
    expect(cappedRenderDistance(MIN_RENDER_DISTANCE, 12, 20000, 10000)).toBe(MIN_RENDER_DISTANCE);
    expect(cappedRenderDistance(11, 12, 8000, 10000)).toBe(11); // under the cap, but not far enough to grow again
    expect(cappedRenderDistance(11, 12, 5000, 10000)).toBe(12);
    expect(cappedRenderDistance(12, 12, 5000, 10000)).toBe(12);
    expect(cappedRenderDistance(12, 8, 5000, 10000)).toBe(8); // the player chose less
  });
});
