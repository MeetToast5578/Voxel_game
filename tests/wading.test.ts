import { describe, expect, it } from 'vitest';
import { metersToBlocks, SPLASH_MIN_SPEED } from '../src/config';
import { NO_CONTROLS, Player } from '../src/player/player';

const DT = 1 / 60;
const floor = (_x: number, y: number) => y < 10; // solid below y = 10; the feet start at y = 10
const FORWARD = { ...NO_CONTROLS, forward: true };

/** Walks forward for 2 s and returns the horizontal speed (blocks per second) it reaches. */
function walkSpeed(water: (x: number, y: number, z: number) => boolean): number {
  const p = new Player();
  p.setPosition(0.5, 10, 0.5);
  p.yaw = Math.PI; // facing +Z
  for (let i = 0; i < 120; i++) p.update(DT, FORWARD, floor, water);
  return Math.hypot(p.velocity.x, p.velocity.z);
}

describe('wading and splash', () => {
  it('walks more slowly in a shallow puddle than on dry ground', () => {
    const dry = walkSpeed(() => false);
    const puddle = walkSpeed((_x, y) => y === 10); // surface at y = 11: about 17% of the body under water
    expect(dry).toBeGreaterThan(0);
    expect(puddle / dry).toBeGreaterThan(0.85);
    expect(puddle / dry).toBeLessThan(0.95);
  });

  it('walks more slowly at the edge of swimming, but still faster than a stroke', () => {
    const dry = walkSpeed(() => false);
    // Water up to y = 11 (surface at 12): the waist (2 blocks up) is just out of it, so the body is wading.
    const edge = walkSpeed((_x, y) => y >= 10 && y <= 11);
    expect(edge).toBeLessThan(dry * 0.9);
    expect(edge).toBeGreaterThan(metersToBlocks(3)); // a swim stroke tops out at about 2.6 m/s
  });

  it('splashes once when a fast fall enters the water', () => {
    const lake = (_x: number, y: number) => y >= 10 && y <= 19; // surface at y = 20
    const p = new Player();
    p.setPosition(0.5, 21.5, 0.5); // dry, 1.5 blocks above the surface
    const splashes: number[] = [];
    for (let i = 0; i < 120; i++) {
      p.update(DT, NO_CONTROLS, floor, lake);
      if (p.splashSpeed > 0) splashes.push(p.splashSpeed);
    }
    expect(splashes.length).toBe(1);
    expect(splashes[0]).toBeGreaterThanOrEqual(SPLASH_MIN_SPEED);
  });

  it('does not splash for a slow entry', () => {
    const lake = (_x: number, y: number) => y >= 10 && y <= 19;
    const p = new Player();
    p.setPosition(0.5, 20.2, 0.5); // 0.2 blocks above the surface: the fall is gentle
    let splashed = false;
    for (let i = 0; i < 60; i++) {
      p.update(DT, NO_CONTROLS, floor, lake);
      if (p.splashSpeed > 0) splashed = true;
    }
    expect(splashed).toBe(false);
  });
});
