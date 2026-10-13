import { describe, expect, it } from 'vitest';
import * as C from '../src/config';

describe('config', () => {
  it('has consistent world sizes', () => {
    expect(C.CHUNK_VOLUME).toBe(C.CHUNK_SIZE * C.CHUNK_SIZE * C.WORLD_HEIGHT);
    expect(C.SEA_LEVEL).toBeGreaterThan(0);
    expect(C.SEA_LEVEL).toBeLessThan(C.WORLD_HEIGHT);
  });
  it('has sane ranges', () => {
    expect(C.MIN_RENDER_DISTANCE).toBeLessThanOrEqual(C.DEFAULT_RENDER_DISTANCE);
    expect(C.DEFAULT_RENDER_DISTANCE).toBeLessThanOrEqual(C.MAX_RENDER_DISTANCE);
    expect(C.MIN_FOV).toBeLessThanOrEqual(C.DEFAULT_FOV);
    expect(C.DEFAULT_FOV).toBeLessThanOrEqual(C.MAX_FOV);
    expect(C.EYE_HEIGHT).toBeLessThan(C.PLAYER_HEIGHT);
  });
  it('converts meters to blocks (1 block = 0.6 m)', () => {
    expect(C.metersToBlocks(0.6)).toBeCloseTo(1, 9);
    expect(C.metersToBlocks(1.75)).toBeCloseTo(1.75 / 0.6, 9);
    expect(C.PLAYER_HEIGHT).toBeCloseTo(2.917, 3);
    expect(C.EYE_HEIGHT).toBeCloseTo(2.7, 9);
    expect(C.PLAYER_HALF_WIDTH).toBeCloseTo(0.4, 9);
  });
  it('keeps physics steps smaller than the player (no tunneling)', () => {
    expect(C.FLY_SPEED * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
    expect(C.TERMINAL_VELOCITY * C.FIXED_DT).toBeLessThan(C.PLAYER_HEIGHT);
  });
});
