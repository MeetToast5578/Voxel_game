import { describe, expect, it } from 'vitest';
import { GRAPH_FRAMES, frameStats } from '../src/ui/debugOverlay';

describe('F3 frame-time graph (T-J8)', () => {
  it('averages and finds the worst of the frames recorded so far', () => {
    const samples = new Float32Array(GRAPH_FRAMES);
    expect(frameStats(samples)).toEqual({ avg: 0, max: 0 });
    samples.set([10, 20, 60]);
    expect(frameStats(samples)).toEqual({ avg: 30, max: 60 });
  });
});
