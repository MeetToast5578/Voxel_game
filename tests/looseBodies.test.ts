import { describe, expect, it } from 'vitest';
import { LOOSE_BODY_CAP } from '../src/config';
import { LooseBodies, type LooseBody } from '../src/items/looseBodies';
import { BlockId } from '../src/world/blocks';

const DT = 1 / 60;
const noRand = () => 0.5;
const density = (state: number) => (state === BlockId.PLANKS ? 600 : state === BlockId.STONE ? 2600 : 2000);

/** Steps one body set until a body settles, or until the step limit. Returns the first body that settled, or null. */
function runUntilSettled(bodies: LooseBodies, steps: number, isSolid: (x: number, y: number, z: number) => boolean, isWater: (x: number, y: number, z: number) => boolean): LooseBody | null {
  for (let i = 0; i < steps; i++) {
    const settled = bodies.step(DT, isSolid, isWater, density);
    if (settled.length > 0) return settled[0]!;
  }
  return null;
}

const floor = (_x: number, y: number) => y < 0; // solid below y = 0: the ground top is y = 0
const dry = () => false;

describe('loose rigid bodies (spec 25, slice 6)', () => {
  it('a body falls onto the floor, rests there, and settles with its block state', () => {
    const bodies = new LooseBodies();
    bodies.spawn(BlockId.STONE, 0.5, 5, 0.5, noRand);
    const settled = runUntilSettled(bodies, 600, floor, dry);
    expect(settled).not.toBeNull();
    expect(settled!.state).toBe(BlockId.STONE);
    expect(settled!.y).toBeCloseTo(0, 2);
    expect(bodies.bodies).toHaveLength(0);
  });

  it('a body is stopped by a wall beside it', () => {
    const bodies = new LooseBodies();
    const body = bodies.spawn(BlockId.STONE, 0.5, 2, 0.5, noRand);
    body.vx = 6;
    const wall = (x: number, y: number) => y < 0 || (x >= 2 && y >= 0 && y < 4);
    runUntilSettled(bodies, 300, wall, dry);
    // A one-block body centred at x = 0.5 stops with its face against the wall at x = 2.
    expect(body.x).toBeLessThanOrEqual(1.5 + 1e-6);
  });

  it('a body lighter than water floats up and stays near the surface', () => {
    const bodies = new LooseBodies();
    const body = bodies.spawn(BlockId.PLANKS, 0.5, 1, 0.5, noRand);
    const water = (_x: number, y: number, _z: number) => y >= 0 && y < 8;
    for (let i = 0; i < 360; i++) bodies.step(DT, floor, water, density);
    expect(body.y).toBeGreaterThan(3);
    expect(body.y).toBeLessThan(9);
  });

  it('a body heavier than water sinks to the floor', () => {
    const bodies = new LooseBodies();
    bodies.spawn(BlockId.STONE, 0.5, 5, 0.5, noRand);
    const water = (_x: number, y: number, _z: number) => y >= 0 && y < 8;
    const settled = runUntilSettled(bodies, 900, floor, water);
    expect(settled).not.toBeNull();
    expect(settled!.y).toBeCloseTo(0, 2);
  });

  it('a body on a ledge slides off the edge and drops', () => {
    const bodies = new LooseBodies();
    const body = bodies.spawn(BlockId.STONE, 1.5, 3, 0.5, noRand);
    body.vx = 3;
    const ledge = (x: number, y: number) => y < 0 || (x <= 2 && y >= 0 && y < 3);
    const settled = runUntilSettled(bodies, 900, ledge, dry);
    expect(settled).not.toBeNull();
    expect(settled!.x).toBeGreaterThan(2.5);
    expect(settled!.y).toBeCloseTo(0, 2);
  });

  it('twenty bodies run within a frame budget', () => {
    const bodies = new LooseBodies();
    for (let i = 0; i < 20; i++) bodies.spawn(BlockId.STONE, 0.5 + i * 1.5, 6 + (i % 3), 0.5, Math.random);
    const start = performance.now();
    for (let i = 0; i < 120; i++) bodies.step(DT, floor, dry, density);
    const ms = performance.now() - start;
    // Two seconds of simulated time for 20 bodies: well inside one 16 ms frame per step on any machine that runs the tests.
    expect(ms / 120).toBeLessThan(2);
  });

  it('the cap stops more bodies being added', () => {
    const bodies = new LooseBodies();
    for (let i = 0; i < LOOSE_BODY_CAP; i++) {
      expect(bodies.canAdd).toBe(true);
      bodies.spawn(BlockId.STONE, 0.5, 5, 0.5, noRand);
    }
    expect(bodies.canAdd).toBe(false);
  });
});
