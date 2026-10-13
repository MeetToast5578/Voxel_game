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
  it('keeps physics steps smaller than the player (no tunneling)', () => {
    expect(C.FLY_SPEED * C.FIXED_DT).toBeLessThan(C.PLAYER_HALF_WIDTH * 2);
    expect(C.TERMINAL_VELOCITY * C.FIXED_DT).toBeLessThan(C.PLAYER_HEIGHT);
  });
});
