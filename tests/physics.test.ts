import { describe, expect, it } from 'vitest';
import { PLAYER_HALF_WIDTH } from '../src/config';
import { moveAndCollide } from '../src/player/physics';
import { PLAYER_SHAPE } from '../src/player/player';

const shape = PLAYER_SHAPE; // half width 0.24 m, height 1.75 m
const DT = 1 / 60;
const floor = (_x: number, y: number) => y < 10; // ground surface at y = 10

describe('moveAndCollide', () => {
  it('lands on the ground and reports onGround', () => {
    const pos = { x: 0.5, y: 10.5, z: 0.5 };
    const vel = { x: 0, y: -20, z: 0 };
    let r = moveAndCollide(pos, vel, DT, shape, floor);
    for (let i = 0; i < 10 && !r.onGround; i++) {
      vel.y = -20;
      r = moveAndCollide(pos, vel, DT, shape, floor);
    }
    expect(r.onGround).toBe(true);
    expect(r.hitY).toBe(true);
    expect(pos.y).toBeCloseTo(10, 3);
    expect(vel.y).toBe(0);
  });
  it('stops at walls in +X and -X', () => {
    const walls = (x: number, y: number) => y < 10 || x === 3 || x === -3;
    const a = { x: 1.5, y: 10, z: 0.5 };
    const b = { x: -1.5, y: 10, z: 0.5 };
    for (let i = 0; i < 30; i++) {
      moveAndCollide(a, { x: 5, y: 0, z: 0 }, DT, shape, walls);
      moveAndCollide(b, { x: -5, y: 0, z: 0 }, DT, shape, walls);
    }
    expect(a.x).toBeCloseTo(3 - PLAYER_HALF_WIDTH, 3);
    expect(b.x).toBeCloseTo(-2 + PLAYER_HALF_WIDTH, 3);
  });
  it('stops at walls in +Z and -Z', () => {
    const walls = (_x: number, y: number, z: number) => y < 10 || z === 3 || z === -3;
    const a = { x: 0.5, y: 10, z: 1.5 };
    const b = { x: 0.5, y: 10, z: -1.5 };
    for (let i = 0; i < 30; i++) {
      moveAndCollide(a, { x: 0, y: 0, z: 5 }, DT, shape, walls);
      moveAndCollide(b, { x: 0, y: 0, z: -5 }, DT, shape, walls);
    }
    expect(a.z).toBeCloseTo(3 - PLAYER_HALF_WIDTH, 3);
    expect(b.z).toBeCloseTo(-2 + PLAYER_HALF_WIDTH, 3);
  });
  it('bumps its head on a ceiling', () => {
    const ceiling = (_x: number, y: number) => y < 10 || y === 16;
    const pos = { x: 0.5, y: 10.05, z: 0.5 }; // head at ~15.9, ceiling block starts at y = 16
    const vel = { x: 0, y: 8, z: 0 };
    const r = moveAndCollide(pos, vel, DT, shape, ceiling);
    expect(r.hitY).toBe(true);
    expect(r.onGround).toBe(false);
    expect(pos.y + shape.height).toBeLessThanOrEqual(16);
    expect(vel.y).toBe(0);
  });
  it('slides along a wall when moving diagonally', () => {
    const wall = (x: number, y: number) => y < 10 || x === 3;
    const pos = { x: 3 - PLAYER_HALF_WIDTH - 0.01, y: 10, z: 0.5 }; // just short of the wall
    const vel = { x: 3, y: 0, z: 3 };
    const r = moveAndCollide(pos, vel, DT, shape, wall);
    expect(r.hitX).toBe(true);
    expect(vel.x).toBe(0);
    expect(pos.z).toBeCloseTo(0.55, 3);
  });
  it('fits through a 2-wide, 6-tall gap', () => {
    // Walls at x = -1 and x = 2 leave 2 blocks (0.6 m) between them; the ceiling is 6 blocks (1.8 m) above the floor.
    const corridor = (x: number, y: number) => y < 10 || y >= 16 || x === -1 || x === 2;
    const pos = { x: 1, y: 10, z: 0.5 };
    for (let i = 0; i < 60; i++) moveAndCollide(pos, { x: 0, y: 0, z: -4 }, DT, shape, corridor);
    expect(pos.z).toBeLessThan(-3);
  });
});
