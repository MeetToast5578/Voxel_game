import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, Player } from '../src/player/player';

const DT = 1 / 60;
// A pool: floor at y = 10 (solid below), water from y = 10 to y = 14 (surface at y = 15) for x < 5.
// For x >= 5 there is a wall/ledge whose top is at y = 16 (one block above the water surface).
const solid = (x: number, y: number) => y < 10 || (x >= 5 && y < 16);
const water = (x: number, y: number) => x < 5 && y >= 10 && y <= 14;

describe('swimming', () => {
  it('sinks slowly in water', () => {
    const p = new Player();
    p.setPosition(0.5, 13, 0.5);
    p.update(DT, NO_CONTROLS, solid, water);
    expect(p.inWater).toBe(true);
    for (let i = 0; i < 30; i++) p.update(DT, NO_CONTROLS, solid, water);
    expect(p.velocity.y).toBeGreaterThanOrEqual(-2 - 1e-9);
    expect(p.position.y).toBeLessThan(13);
    expect(p.position.y).toBeGreaterThan(12);
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
    expect(p.position.y).toBeCloseTo(16, 2);
  });
  it('is slower in water than on land', () => {
    const p = new Player();
    p.setPosition(0.5, 10, 0.5);
    p.yaw = Math.PI; // facing +Z
    for (let i = 0; i < 60; i++) p.update(DT, { ...NO_CONTROLS, forward: true }, solid, water);
    expect(p.position.z - 0.5).toBeLessThan(4.3 * 0.7);
  });
});
