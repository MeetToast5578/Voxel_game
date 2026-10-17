import { describe, expect, it } from 'vitest';
import * as C from '../src/config';

describe('config', () => {
  it('has consistent world sizes (cubic chunks, no height limit)', () => {
    expect(C.CHUNK_VOLUME).toBe(C.CHUNK_SIZE * C.CHUNK_SIZE * C.CHUNK_SIZE);
    expect('WORLD_HEIGHT' in C).toBe(false);
    expect(C.SEA_LEVEL).toBe(0); // sea level is y = 0 (spec 13)
  });
  it('has sane ranges', () => {
    expect(C.MIN_RENDER_DISTANCE).toBeLessThanOrEqual(C.DEFAULT_RENDER_DISTANCE);
    expect(C.DEFAULT_RENDER_DISTANCE).toBeLessThanOrEqual(C.MAX_RENDER_DISTANCE);
    expect(C.MIN_FOV).toBeLessThanOrEqual(C.DEFAULT_FOV);
    expect(C.DEFAULT_FOV).toBeLessThanOrEqual(C.MAX_FOV);
    expect(C.EYE_HEIGHT).toBeLessThan(C.PLAYER_HEIGHT);
  });
  it('converts meters to blocks (1 block = 0.3 m)', () => {
    expect(C.metersToBlocks(0.3)).toBeCloseTo(1, 9);
    expect(C.metersToBlocks(1.75)).toBeCloseTo(1.75 / 0.3, 9);
    expect(C.PLAYER_HEIGHT).toBeCloseTo(1.75 / 0.3, 9);
    expect(C.EYE_HEIGHT).toBeCloseTo(1.62 / 0.3, 9);
    expect(C.PLAYER_HALF_WIDTH).toBeCloseTo(0.24 / 0.3, 9);
  });
  it('every tree species except the bush fits the documented 8-12 m band (task T-B1 leftover)', () => {
    // TREE_SPECIES is written in blocks (owner decision 1); these constants give the band they must fit, so they are
    // no longer orphans. Bushes stay small on purpose. Floor/ceil absorbs the float division (12 / 0.3 != 40 exactly).
    const min = Math.floor(C.metersToBlocks(C.TREE_HEIGHT_MIN_M));
    const max = Math.ceil(C.metersToBlocks(C.TREE_HEIGHT_MAX_M));
    for (const s of C.TREE_SPECIES) {
      if (s.key === 'bush') {
        expect(s.heightMaxBlocks, 'the bush stays below the tree band').toBeLessThan(min);
        continue;
      }
      expect(s.heightMinBlocks, `${s.key} min`).toBeGreaterThanOrEqual(min);
      expect(s.heightMaxBlocks, `${s.key} max`).toBeLessThanOrEqual(max);
    }
  });
  it('keeps physics steps smaller than the player (no tunneling)', () => {
    // The solver resolves a collision by moving then pushing back, so a step longer than the
    // body's own extent can pass straight through a wall. Every speed that can be applied has to
    // stay under the limit, not just the two extremes.
    expect(C.FLY_SPEED * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
    expect(C.TERMINAL_VELOCITY * C.FIXED_DT).toBeLessThan(C.PLAYER_HEIGHT);
    for (const speed of [C.WALK_SPEED, C.SPRINT_SPEED, C.FLY_SPEED]) {
      expect(speed * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
    }
    // Jumping adds to whatever horizontal speed the player already had.
    expect((C.SPRINT_SPEED + C.JUMP_SPEED) * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
  });
});
