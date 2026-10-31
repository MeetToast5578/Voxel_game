import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { COLLISION, type BoxAt } from '../game/collision';
import { moveBody, overlapsSolid, unstick, type Body } from '../game/physics';
import { Player } from '../game/player';
import type { Input } from '../game/input';

const STONE = COLLISION[BLOCKS.state('stone')]!;
const SLAB = COLLISION[BLOCKS.state('stone_slab')]!;

function world(cells: Record<string, number>, floor = 0): BoxAt {
  return (x, y, z) => cells[`${x},${y},${z}`] ?? (y < floor ? STONE : 0);
}

const body = (x: number, y: number, z: number, onGround = true): Body =>
  ({ x, y, z, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround });

/** Runs `steps` ticks of 1/60 s with a constant velocity and simple gravity. */
function walk(b: Body, boxAt: BoxAt, vx: number, vz: number, steps: number, step = 1): void {
  for (let i = 0; i < steps; i++) {
    b.vx = vx;
    b.vz = vz;
    b.vy -= 46 / 60;
    moveBody(b, 1 / 60, boxAt, step);
  }
}

describe('physics', () => {
  it('lands on the floor and stays on the ground', () => {
    const b = body(0.5, 3, 0.5, false);
    walk(b, world({}), 0, 0, 120);
    expect(b.y).toBeCloseTo(0, 5);
    expect(b.onGround).toBe(true);
  });

  it('walks up a one-cell ledge but not a two-cell wall', () => {
    const ledge = world({ '3,0,0': STONE, '4,0,0': STONE, '5,0,0': STONE });
    const b = body(0.5, 0, 0.5);
    walk(b, ledge, 4, 0, 60);
    expect(b.y).toBeCloseTo(1, 5);
    expect(b.x).toBeGreaterThan(3);
    const wall = world({ '3,0,0': STONE, '3,1,0': STONE });
    const c = body(0.5, 0, 0.5);
    walk(c, wall, 4, 0, 60);
    expect(c.y).toBeCloseTo(0, 5);
    expect(c.x).toBeLessThan(3 - 0.46);
  });

  it('steps once at a corner blocked on both axes', () => {
    const cells: Record<string, number> = {};
    for (let x = 2; x < 10; x++) for (let z = 2; z < 10; z++) cells[`${x},0,${z}`] = STONE;
    const b = body(1, 0, 1);
    b.vx = 3;
    b.vz = 3;
    b.x = 1.5;
    b.z = 1.5;
    const r = moveBody(b, 0.05, world(cells), 1);
    expect(r.stepped).toBeCloseTo(1, 5);
    expect(b.y).toBeCloseTo(1, 5);
  });

  it('steps down a ledge instead of falling off it', () => {
    const stairs = world({ '0,0,0': STONE, '1,0,0': STONE, '0,-1,0': STONE });
    const b = body(0.5, 1, 0.5);
    let dropped = 0;
    for (let i = 0; i < 60; i++) {
      b.vx = 3;
      b.vy -= 46 / 60;
      const r = moveBody(b, 1 / 60, stairs, 1);
      dropped += Math.min(0, r.stepped);
      expect(b.onGround).toBe(true);
    }
    expect(b.y).toBeCloseTo(0, 5);
    // Most of the drop is the snap; the rest is one tick of gravity before it.
    expect(dropped).toBeCloseTo(-1, 1);
  });

  it('climbs slabs as half steps', () => {
    const b = body(0.5, 0, 0.5);
    walk(b, world({ '2,0,0': SLAB, '3,0,0': STONE }), 3, 0, 60);
    expect(b.y).toBeCloseTo(1, 5);
  });

  it('stops at ceilings', () => {
    const b = body(0.5, 0, 0.5);
    b.vy = 20;
    moveBody(b, 0.5, world({ '0,4,0': STONE }), 1);
    expect(b.y + b.height).toBeCloseTo(4, 5);
    expect(b.vy).toBe(0);
  });

  it('does not tunnel at terminal speed', () => {
    const b = body(0.5, 50, 0.5, false);
    for (let i = 0; i < 60; i++) {
      b.vy = -84;
      moveBody(b, 1 / 60, world({}, 0), 1);
    }
    expect(b.y).toBeCloseTo(0, 5);
    const side = body(0.5, 0, 0.5);
    side.vx = 200;
    moveBody(side, 1 / 60, world({ '2,0,0': STONE, '2,1,0': STONE, '2,2,0': STONE }), 0);
    expect(side.x).toBeCloseTo(2 - 0.47, 5);
  });

  it('pushes a body out of solid to the nearest free space', () => {
    const boxes = world({ '0,0,0': STONE });
    const b = body(0.5, 0.2, 0.5);
    expect(overlapsSolid(b, boxes)).toBe(true);
    expect(unstick(b, boxes)).toBe(true);
    expect(overlapsSolid(b, boxes)).toBe(false);
    // Searched in sixteenths of a cell: the first free height above the block.
    expect(b.y).toBeGreaterThanOrEqual(1);
    expect(b.y).toBeLessThan(1 + 1 / 16);
  });
});

describe('crouching and ladders', () => {
  /** A player on a platform x < 3 (cells), with keys held as given. */
  const keys = (over: Partial<Input>) => ({ moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: () => false, ...over }) as unknown as Input;
  const platform = (x: number, y: number) => (y < 0 && x < 3 ? STONE : 0);

  it('crouching stops at the edge; walking goes over it', () => {
    for (const crouch of [true, false]) {
      const p = new Player(1.5, 0, 0.5);
      p.body.onGround = true;
      p.yaw = -Math.PI / 2; // facing +x
      for (let i = 0; i < 120; i++) p.update(1 / 60, keys({ moveZ: 1, descend: crouch }), platform, () => false);
      if (crouch) {
        expect(p.body.y).toBeCloseTo(0, 5);
        expect(p.body.x).toBeLessThan(3 + p.body.halfWidth);
      } else expect(p.body.y).toBeLessThan(-1);
    }
  });

  it('climbs a ladder by walking into it, holds on, and climbs down crouching', () => {
    const wall = (x: number, y: number) => (y < 0 || (x === 1 && y < 20) ? STONE : 0);
    const ladder = (x: number, y: number, z: number) => x === 0 && z === 0 && y >= 0 && y < 20;
    const p = new Player(0.5, 0, 0.5);
    p.body.onGround = true;
    p.yaw = -Math.PI / 2;
    for (let i = 0; i < 60; i++) p.update(1 / 60, keys({ moveZ: 1 }), wall, () => false, ladder);
    const up = p.body.y;
    expect(up).toBeGreaterThan(3.5); // 2.4 m/s is 4 cells a second
    for (let i = 0; i < 60; i++) p.update(1 / 60, keys({}), wall, () => false, ladder);
    expect(p.body.y).toBeCloseTo(up, 3);
    for (let i = 0; i < 30; i++) p.update(1 / 60, keys({ descend: true }), wall, () => false, ladder);
    expect(p.body.y).toBeLessThan(up - 1.5);
  });
});

describe('currents', () => {
  it('carry a swimmer along the flow', () => {
    const p = new Player(0.5, 0, 0.5);
    const keys = { moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: () => false } as unknown as Input;
    const water = () => true;
    for (let i = 0; i < 120; i++) p.update(1 / 60, keys, () => 0, water, () => false, () => [1, 0, 0]);
    expect(p.body.x).toBeGreaterThan(3);
  });
});
