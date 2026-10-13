import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT, FIXED_DT, PLAYER_HALF_WIDTH, STEP_SMOOTH_S } from '../src/config';
import { moveAndCollide, type SolidFn } from '../src/player/physics';
import { NO_CONTROLS, PLAYER_SHAPE, Player, type PlayerControls } from '../src/player/player';

// Ground is solid for y < 10; the player's feet start at y = 10, at x = 2.5, z = 0.5 (body spans x 2.1..2.9).
const ledge: SolidFn = (x, y) => y < 10 || (x >= 3 && y === 10); // raised floor, top at y = 11
const wall: SolidFn = (x, y) => y < 10 || (x >= 3 && y <= 11); // 2 blocks high
const FORWARD: PlayerControls = { ...NO_CONTROLS, forward: true };
const BLOCKED_X = 3 - PLAYER_HALF_WIDTH; // 2.6

function player(y = 10): Player {
  const p = new Player();
  p.setPosition(2.5, y, 0.5);
  p.yaw = -Math.PI / 2; // facing +X
  return p;
}

function run(p: Player, ticks: number, solid: SolidFn, controls = FORWARD, water: SolidFn = () => false): void {
  for (let i = 0; i < ticks; i++) p.update(FIXED_DT, controls, solid, water);
}

describe('step-up', () => {
  it('walks up a 1-block ledge', () => {
    const p = player();
    run(p, 60, ledge);
    expect(p.position.y).toBeCloseTo(11, 3);
    expect(p.position.x).toBeGreaterThan(3.5);
    expect(p.onGround).toBe(true);
  });
  it('is still blocked by a 2-block wall', () => {
    const p = player();
    run(p, 60, wall);
    expect(p.position.x).toBeCloseTo(BLOCKED_X, 3);
    expect(p.position.y).toBeCloseTo(10, 3);
  });
  it('does not step when there is no headroom above the ledge', () => {
    const solid: SolidFn = (x, y) => ledge(x, y, 0) || (x === 3 && y === 13); // only 2 blocks of air on the ledge
    const p = player();
    run(p, 60, solid);
    expect(p.position.x).toBeCloseTo(BLOCKED_X, 3);
    expect(p.position.y).toBeCloseTo(10, 3);
  });
  it('does not step with a ceiling just above the head', () => {
    const solid: SolidFn = (x, y) => ledge(x, y, 0) || (x === 2 && y === 13); // head is at 12.917
    const p = player();
    run(p, 60, solid);
    expect(p.position.x).toBeCloseTo(BLOCKED_X, 3);
    expect(p.position.y).toBeCloseTo(10, 3);
  });
  it('does not step while flying', () => {
    const p = player(10.5);
    p.toggleFlying();
    run(p, 60, ledge);
    expect(p.position.x).toBeCloseTo(BLOCKED_X, 3);
    expect(p.position.y).toBeCloseTo(10.5, 3);
  });
  it('does not step while swimming', () => {
    const water: SolidFn = (x, y, z) => !ledge(x, y, z) && y >= 10 && y <= 13;
    const p = player();
    run(p, 60, ledge, FORWARD, water);
    expect(p.position.x).toBeLessThanOrEqual(2.61);
  });
  it('does not step while airborne', () => {
    const pos = { x: 2.55, y: 10.2, z: 0.5 };
    const vel = { x: 5, y: 3, z: 0 };
    const r = moveAndCollide(pos, vel, FIXED_DT, PLAYER_SHAPE, ledge, 1);
    expect(r.hitX).toBe(true);
    expect(r.stepped).toBe(0);
    expect(pos.x).toBeCloseTo(BLOCKED_X, 3);
  });
  it('is off by default', () => {
    const pos = { x: 2.5, y: 10, z: 0.5 };
    let r = moveAndCollide(pos, { x: 5, y: -1, z: 0 }, FIXED_DT, PLAYER_SHAPE, ledge);
    for (let i = 0; i < 30; i++) r = moveAndCollide(pos, { x: 5, y: -1, z: 0 }, FIXED_DT, PLAYER_SHAPE, ledge);
    expect(r.hitX).toBe(true);
    expect(r.stepped).toBe(0);
    expect(pos.x).toBeCloseTo(BLOCKED_X, 3);
    expect(pos.y).toBeCloseTo(10, 3);
  });
  it('steps up while moving diagonally and keeps sliding', () => {
    const p = player();
    p.yaw = -Math.PI / 4; // +X and -Z at 45 degrees
    let zAtStep: number | null = null;
    for (let i = 0; i < 120; i++) {
      p.update(FIXED_DT, FORWARD, ledge);
      if (zAtStep === null && p.position.y > 10.5) zAtStep = p.position.z;
    }
    expect(p.position.y).toBeCloseTo(11, 3);
    expect(p.position.x).toBeGreaterThan(3.5);
    expect(zAtStep).not.toBeNull();
    expect(p.position.z).toBeLessThan(zAtStep!);
  });
  it('climbs a staircase', () => {
    const stairs: SolidFn = (x, y) => y < 10 || (x === 3 && y <= 10) || (x === 4 && y <= 11) || (x >= 5 && y <= 12);
    const p = player();
    run(p, 180, stairs);
    expect(p.position.y).toBeCloseTo(13, 3);
  });

  describe('camera', () => {
    /** Runs case 1 until the tick where the body rises by about 1 block; returns the eye height before that tick. */
    function stepTick(p: Player): number {
      for (let i = 0; i < 120; i++) {
        const eyeBefore = p.eyePosition(1).y;
        const yBefore = p.position.y;
        p.update(FIXED_DT, FORWARD, ledge);
        if (p.position.y - yBefore > 0.9) return eyeBefore;
      }
      throw new Error('never stepped');
    }

    it('does not snap on the step tick', () => {
      const p = player();
      const before = stepTick(p);
      for (const alpha of [0, 0.5, 1]) {
        expect(p.eyePosition(alpha).y).toBeGreaterThanOrEqual(before - 1e-9);
        expect(p.eyePosition(alpha).y).toBeLessThanOrEqual(before + 0.2);
      }
    });
    it('catches up with the body and never overshoots', () => {
      const p = player();
      stepTick(p);
      const ticks = Math.ceil(STEP_SMOOTH_S / FIXED_DT) + 1;
      for (let i = 0; i < ticks; i++) {
        p.update(FIXED_DT, FORWARD, ledge);
        expect(p.eyePosition(1).y).toBeLessThanOrEqual(p.position.y + EYE_HEIGHT + 1e-9);
      }
      expect(p.eyePosition(1).y).toBeCloseTo(p.position.y + EYE_HEIGHT, 9);
    });
    it('resets when teleporting', () => {
      const p = player();
      stepTick(p);
      p.setPosition(0.5, 20, 0.5);
      expect(p.eyePosition(1).y).toBeCloseTo(20 + EYE_HEIGHT, 9);
    });
  });
});
