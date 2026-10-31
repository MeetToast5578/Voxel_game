import { describe, expect, it } from 'vitest';
import { chunkKey } from '../core/coords';
import { BLOCKS } from '../engine/blocks';
import { ALL_CONNECTED, faceConnectivity, visibleChunks } from '../engine/visibility';

const STONE = BLOCKS.state('stone');

describe('cave culling', () => {
  it('joins faces through open cells only', () => {
    expect(faceConnectivity(() => 0)).toBe(ALL_CONNECTED);
    expect(faceConnectivity(() => STONE)).toBe(0);
    // A tunnel along x at y = z = 5 joins only +x and -x (pair bit 0).
    expect(faceConnectivity((i) => ((i >> 8) === 5 && ((i >> 4) & 15) === 5 ? 0 : STONE))).toBe(1);
  });

  it('hides a sealed cave below the camera but not open sky around it', () => {
    // Camera chunk (0, 1, 0) in open air; chunks at y = 0 are solid ground; (0, -1, 0) is a sealed cave below it.
    const mask = (k: number) => {
      if (k === chunkKey(0, -1, 0)) return ALL_CONNECTED; // the cave is open inside, but walled off by y = 0
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
        if (k === chunkKey(x, 0, z)) return 0;
        if (k === chunkKey(x, 1, z) || k === chunkKey(x, 2, z)) return ALL_CONNECTED;
      }
      return 0;
    };
    const seen = visibleChunks(0, 1, 0, 3, -3, 3, mask);
    expect(seen.has(chunkKey(2, 1, -2))).toBe(true);
    expect(seen.has(chunkKey(0, 0, 0))).toBe(true); // the ground itself is drawn
    expect(seen.has(chunkKey(0, -1, 0))).toBe(false);
  });
});
