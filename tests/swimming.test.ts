import { describe, expect, it } from 'vitest';
import { metersToBlocks, SWIM_THRUST, WATER_DRAG } from '../src/config';
import { NO_CONTROLS, Player, submergedFraction } from '../src/player/player';

const DT = 1 / 60;
// A pool: floor at y = 10 (solid below), water from y = 10 to y = 19 (surface at y = 20) for x < 5. The pool is
// deeper than the body (5.8 blocks), so standing in it keeps the waist under water.
// For x >= 5 there is a wall/ledge whose top is at y = 21 (one block above the water surface).
const solid = (x: number, y: number) => y < 10 || (x >= 5 && y < 21);
const water = (x: number, y: number) => x < 5 && y >= 10 && y <= 19;

describe('swimming', () => {
  it('floats: still in water, the body bobs around about 80% under the surface', () => {
    // Quadratic drag damps the bobbing slowly at low speed, so judge the average over the last 2 s.
    const p = new Player();
    p.setPosition(0.5, 13, 0.5);
    for (let i = 0; i < 480; i++) p.update(DT, NO_CONTROLS, solid, water);
    let sum = 0;
    for (let i = 0; i < 120; i++) {
      p.update(DT, NO_CONTROLS, solid, water);
      sum += (20 - p.position.y) / metersToBlocks(1.75); // the surface is at y = 20
    }
    const submerged = sum / 120;
    expect(submerged).toBeGreaterThan(0.75);
    expect(submerged).toBeLessThan(0.85);
  });
  it('a body fully under water rises when still, and one above the surface falls', () => {
    const under = new Player();
    under.setPosition(0.5, 10, 0.5);
    for (let i = 0; i < 30; i++) under.update(DT, NO_CONTROLS, solid, water);
    expect(under.velocity.y).toBeGreaterThan(0);
    const above = new Player();
    above.setPosition(0.5, 25, 0.5);
    above.update(DT, NO_CONTROLS, solid, water);
    expect(above.inWater).toBe(false);
    expect(above.velocity.y).toBeLessThan(0);
  });
  it('swims at the speed where drag balances the stroke: sqrt(thrust / drag)', () => {
    const lake = (_x: number, y: number) => y >= 10 && y <= 19; // open water, no walls
    const floor = (_x: number, y: number) => y < 10;
    const p = new Player();
    p.setPosition(0.5, 13, 0.5);
    p.yaw = -Math.PI / 2; // facing +X
    for (let i = 0; i < 360; i++) p.update(DT, { ...NO_CONTROLS, forward: true }, floor, lake); // 6 s to converge
    const expected = Math.sqrt(SWIM_THRUST / WATER_DRAG);
    expect(Math.abs(Math.hypot(p.velocity.x, p.velocity.z) - expected) / expected).toBeLessThan(0.02);
    expect(expected / metersToBlocks(1)).toBeCloseTo(2.6, 1); // about 2.6 m/s, as before
  });
  it('gives the submerged fraction of the body from the surface of the column', () => {
    const dry = (_x: number, _y: number) => false;
    const feet = 10;
    expect(submergedFraction(0, 0, feet, dry)).toBe(0);
    expect(submergedFraction(0, 0, feet, () => true)).toBe(1); // surface above the head
    // Water up to y = 12 (surface at 13): 3 blocks of the 5.8-block body are under.
    expect(submergedFraction(0, 0, feet, (_x, y) => y >= 10 && y <= 12)).toBeCloseTo(3 / metersToBlocks(1.75), 6);
  });
  it('swims up while holding jump', () => {
    const p = new Player();
    p.setPosition(0.5, 10, 0.5);
    for (let i = 0; i < 60; i++) p.update(DT, { ...NO_CONTROLS, jump: true }, solid, water);
    expect(p.position.y).toBeGreaterThan(13);
  });
  it('climbs out onto a ledge one block above the water', () => {
    const p = new Player();
    p.setPosition(4.2, 13, 0.5);
    p.yaw = -Math.PI / 2; // facing +X, toward the ledge
    for (let i = 0; i < 180; i++) p.update(DT, { ...NO_CONTROLS, forward: true, jump: true }, solid, water);
    for (let i = 0; i < 60; i++) p.update(DT, NO_CONTROLS, solid, water); // let go and land
    expect(p.position.x).toBeGreaterThan(5);
    expect(p.onGround).toBe(true);
    expect(p.position.y).toBeCloseTo(21, 2); // the ledge top
  });
  it('is slower in water than on land', () => {
    const p = new Player();
    p.setPosition(0.5, 10, 0.5);
    p.yaw = Math.PI; // facing +Z
    for (let i = 0; i < 60; i++) p.update(DT, { ...NO_CONTROLS, forward: true }, solid, water);
    expect(p.position.z - 0.5).toBeLessThan(metersToBlocks(4.3) * 0.7);
  });
  it('checks for water at waist height (0.6 m = 2 blocks above the feet)', () => {
    const floor = (_x: number, y: number) => y < 10;
    const deep = new Player();
    deep.setPosition(0.5, 10, 0.5);
    deep.update(DT, NO_CONTROLS, floor, (_x, y) => y >= 10 && y <= 12);
    expect(deep.inWater).toBe(true);
    const puddle = new Player();
    puddle.setPosition(0.5, 10, 0.5);
    puddle.update(DT, NO_CONTROLS, floor, (_x, y) => y === 10);
    expect(puddle.inWater).toBe(false);
  });
});
