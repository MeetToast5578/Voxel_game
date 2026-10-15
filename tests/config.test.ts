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
  it('keeps physics steps smaller than the player (no tunneling)', () => {
    expect(C.FLY_SPEED * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
    expect(C.TERMINAL_VELOCITY * C.FIXED_DT).toBeLessThan(C.PLAYER_HEIGHT);
  });
});
