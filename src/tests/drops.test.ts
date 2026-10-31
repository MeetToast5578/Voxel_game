import { describe, expect, it } from 'vitest';
import { DROP_LIFETIME_S, DROP_PICKUP_M, toCells } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Drops } from '../game/drops';
import { FULL } from '../game/collision';
import { Inventory } from '../game/inventory';
import type { Body } from '../game/physics';

const S = (key: string) => BLOCKS.state(key, 0);
/** Solid ground below y = 0 (a full cell is bottom 0, top 16 sixteenths). */
const ground = (_x: number, y: number) => (y < 0 ? FULL : 0);
const player = (x: number): Body => ({ x, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 3, onGround: true });

function run(drops: Drops, seconds: number, p: Body | null, inv = new Inventory()): Inventory {
  for (let t = 0; t < seconds; t += 0.05) drops.update(0.05, ground, p, inv);
  return inv;
}

describe('drops', () => {
  it('fall to the ground and slide to a stop', () => {
    const drops = new Drops();
    drops.spawn({ state: S('dirt'), count: 3 }, 0.5, 4, 0.5, 6, 0, 0);
    run(drops, 3, null);
    const b = drops.list[0]!.body;
    expect(b.y).toBeCloseTo(0, 5);
    expect(b.onGround).toBe(true);
    expect(Math.abs(b.vx)).toBeLessThan(0.01);
  });

  it('are picked up within reach, as much as fits, and not while they wait', () => {
    const drops = new Drops();
    drops.spawn({ state: S('dirt'), count: 10 }, 0.5, 0, 0.5, 0, 0, 0, 1);
    const far = run(drops, 0.5, player(0.5 + toCells(DROP_PICKUP_M) + 2));
    expect(far.count(S('dirt'))).toBe(0);
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length - 1; i++) inv.slots[i] = { state: S('stone'), count: 64 };
    inv.slots[inv.slots.length - 1] = { state: S('dirt'), count: 60 };
    run(drops, 0.2, player(1), inv);
    expect(inv.count(S('dirt'))).toBe(60); // still waiting
    run(drops, 1, player(1), inv);
    expect(inv.count(S('dirt'))).toBe(64);
    expect(drops.list[0]!.stack.count).toBe(6);
  });

  it('vanish after their lifetime and survive a save', () => {
    const drops = new Drops();
    drops.spawn({ state: S('wooden_pickaxe'), count: 1, wear: 5 }, 2.5, 0, 0.5);
    const copy = new Drops();
    copy.load(JSON.parse(JSON.stringify(drops.save())));
    expect(copy.list[0]!.stack).toEqual({ state: S('wooden_pickaxe'), count: 1, wear: 5 });
    copy.load([['nope', 1, 0, 0, 0, 0, 0], ['dirt', 'x'], null]);
    expect(copy.list.length).toBe(0);
    run(drops, DROP_LIFETIME_S + 1, null);
    expect(drops.list.length).toBe(0);
  });
});
