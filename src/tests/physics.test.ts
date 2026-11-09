import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { COLLISION, type BoxAt } from '../game/collision';
import { moveBody, overlapsSolid, unstick, type Body } from '../game/physics';
import { Player } from '../game/player';
import type { Input } from '../game/input';
import { JUMP_GRACE_S, JUMP_BUFFER_S } from '../config';

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

  it('walks up stairs as half steps, and only from the low side', () => {
    const STAIRS = COLLISION[BLOCKS.state('stone_stairs', 0)]!;
    const b = body(0.5, 0, 0.5);
    walk(b, world({ '2,0,0': STAIRS, '3,0,0': STONE }), 3, 0, 60, 0.55);
    expect(b.y).toBeCloseTo(1, 5);
    // From the high side the half step is still a full cell up.
    const c = body(4.5, 0, 0.5);
    walk(c, world({ '2,0,0': STAIRS }), -3, 0, 60, 0.55);
    expect(c.y).toBeCloseTo(0, 5);
    expect(c.x).toBeGreaterThan(3);
  });

  it('is blocked by a closed door but walks through an open one', () => {
    const closed = COLLISION[BLOCKS.state('door', 0)]!, open = COLLISION[BLOCKS.state('door', 4)]!;
    const door = (s: number) => world({ '2,0,0': s, '2,1,0': s, '2,2,0': s });
    const b = body(0.5, 0, 0.5);
    walk(b, door(closed), 3, 0, 60);
    expect(b.x).toBeLessThan(3);
    expect(open).toBe(0);
    const c = body(0.5, 0, 0.5);
    walk(c, door(open), 3, 0, 60);
    expect(c.x).toBeGreaterThan(3);
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

describe('jump timing', () => {
  const keys = (jump = false) => ({moveX: 0, moveZ: 0, jump, descend: false, sprint: false, consume: () => false}) as unknown as Input;
  const dt = 1 / 60;
  const tick = (p: Player, jump = false, floor = true) => p.update(dt, keys(jump), floor ? world({}) : () => 0, () => false);

  it('allows a jump just after leaving a ledge, but never after grace expires', () => {
    for (const expired of [false, true]) {
      const p = new Player(0.5, 0, 0.5); p.body.onGround = true;
      tick(p);
      for (let i = 0; i < (expired ? Math.ceil(JUMP_GRACE_S / dt) + 2 : 2); i++) tick(p, false, false);
      tick(p, true, false);
      expect(p.body.vy > 0).toBe(!expired);
    }
  });

  it('jumps higher while jump is held than for a tap, and falls faster than it rises', () => {
    const apex = (holdTicks: number) => {
      const p = new Player(0.5, 0, 0.5); p.body.onGround = true;
      let top = 0, rise = 0, fall = 0;
      for (let i = 0; i < 120; i++) {
        tick(p, i < holdTicks);
        if (p.body.vy > 0) rise++; else if (!p.body.onGround) fall++;
        top = Math.max(top, p.body.y);
      }
      return { top, rise, fall };
    };
    const held = apex(120), tap = apex(2);
    expect(held.top).toBeGreaterThan(2);
    expect(tap.top).toBeLessThan(held.top * 0.5);
    expect(held.fall).toBeLessThan(held.rise);
  });

  it('jumps again in mid-air with a cloud charm, once per flight, and glides with a featherfall charm', () => {
    const p = new Player(0.5, 10, 0.5);
    p.airJumps = 1;
    for (let i = 0; i < 20; i++) tick(p, false, false);
    const before = p.body.vy;
    tick(p, true, false);
    expect(p.body.vy).toBeGreaterThan(before + 5);
    expect(p.airJumped).toBe(true);
    const after = p.body.vy;
    tick(p, false, false); tick(p, true, false);
    expect(p.body.vy).toBeLessThan(after); // no third jump
    const g = new Player(0.5, 50, 0.5);
    g.glide = true;
    for (let i = 0; i < 120; i++) tick(g, true, false);
    expect(g.body.vy).toBeCloseTo(-2.5 / 0.6, 1); // 2.5 m/s, in cells
  });

  it('remembers a released jump pressed just before landing', () => {
    const p = new Player(0.5, 0.01, 0.5); p.body.vy = -2;
    tick(p, true); expect(p.body.onGround).toBe(true);
    tick(p); expect(p.body.vy).toBeGreaterThan(0);
  });

  it('expires buffered jumps and cannot jump twice during one flight', () => {
    const p = new Player(0.5, 10, 0.5);
    tick(p, true);
    for (let i = 0; i < Math.ceil(JUMP_BUFFER_S / dt) + 2; i++) tick(p);
    Object.assign(p.body, {y: 0.01, vy: -2});
    tick(p); tick(p); expect(p.body.onGround).toBe(true);
    tick(p, true); const vy = p.body.vy;
    tick(p); tick(p, true); expect(p.body.vy).toBeLessThan(vy);
  });

  it('does not carry jump grace from flying into walking', () => {
    const p = new Player(0.5, 0, 0.5); p.body.onGround = true;
    tick(p); p.flying = true; tick(p);
    p.flying = false; p.body.onGround = false; p.body.y = 5;
    tick(p, true); expect(p.body.vy).toBeLessThan(0);
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

describe('boats', () => {
  it('float on the surface, cross water faster than swimming, and stop at a raised bank', () => {
    const keys = { moveX: 0, moveZ: 1, jump: false, sprint: false, descend: false, consume: () => false } as unknown as Input;
    // Water fills y = 0 for x < 30, over a stone bed; at x >= 30 a bank rises to y = 2.
    const solid: BoxAt = (x, y) => (y < 0 || (x >= 30 && y < 2) ? STONE : 0);
    const water = (x: number, y: number) => y === 0 && x < 30;
    const boat = new Player(0.5, 1, 0.5), swimmer = new Player(0.5, 0.2, 0.5);
    boat.boating = true;
    for (const p of [boat, swimmer]) p.yaw = -Math.PI / 2;
    for (let i = 0; i < 120; i++) {
      boat.update(1 / 60, keys, solid, water);
      swimmer.update(1 / 60, keys, solid, water);
      expect(boat.body.y).toBeCloseTo(1, 5);
    }
    expect(boat.body.x).toBeGreaterThan(swimmer.body.x + 3);
    for (let i = 0; i < 600; i++) boat.update(1 / 60, keys, solid, water);
    expect(boat.body.x).toBeLessThan(30);
    expect(boat.body.x).toBeGreaterThan(29);
    expect(boat.body.y).toBeCloseTo(1, 5);
  });
});
