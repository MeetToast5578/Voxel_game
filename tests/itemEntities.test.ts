import { describe, expect, it } from 'vitest';
import { ITEM_LIFETIME_S, ITEM_PICKUP_DELAY_S, MAX_ITEMS, metersToBlocks } from '../src/config';
import { ItemEntities } from '../src/items/itemEntities';
import { BlockId } from '../src/world/blocks';

const DT = 1 / 60;
/** A solid floor: every cell with y < 0 is solid. */
const floor = (_x: number, y: number) => y < 0;
const rand = () => 0.5;

describe('ItemEntities', () => {
  it('pops up first, then falls and rests on the floor', () => {
    const items = new ItemEntities();
    const item = items.spawn(BlockId.STONE, 1, 0.5, 0.5, 0.5, rand);
    items.step(DT, floor);
    expect(item.vy).toBeGreaterThan(0);
    expect(item.y).toBeGreaterThan(0.5);
    for (let i = 0; i < 600; i++) items.step(DT, floor);
    expect(item.y).toBeCloseTo(0, 3);
    expect(item.vy).toBe(0);
  });

  it('slides to a stop on the ground by friction', () => {
    const items = new ItemEntities();
    const item = items.spawn(BlockId.STONE, 1, 0, 0, 0, rand);
    for (let i = 0; i < 300; i++) items.step(DT, floor);
    const before = item.x;
    item.vx = 2;
    for (let i = 0; i < 600; i++) items.step(DT, floor);
    expect(Math.abs(item.vx)).toBeLessThan(0.01);
    expect(item.x - before).toBeGreaterThan(0.1); // it slid, then stopped
  });

  it('is not picked up before the delay, and is picked up within the radius', () => {
    const items = new ItemEntities();
    items.spawn(BlockId.STONE, 1, 0.5, 0, 0.5, rand);
    const take = (state: number, count: number) => (state === BlockId.STONE ? count - 1 : count);
    expect(items.collect(0.5, 0, 0.5, 2, take)).toBe(0); // too young
    for (let t = 0; t < ITEM_PICKUP_DELAY_S; t += DT) items.step(DT, floor);
    expect(items.collect(0.5 + metersToBlocks(3), 0, 0.5, 2, take)).toBe(0); // too far away
    expect(items.collect(0.5, 0, 0.5, 2, take)).toBe(1);
    expect(items.items.length).toBe(0);
  });

  it('reaches an item just below the feet, but not one further down', () => {
    const items = new ItemEntities();
    items.spawn(BlockId.STONE, 1, 0.5, 0, 0.5, rand);
    for (let t = 0; t < ITEM_PICKUP_DELAY_S; t += DT) items.step(DT, floor);
    const take = () => 0;
    // The item's top is at 0.5 blocks. Feet 2 blocks above it are out of reach; feet 0.5 blocks above it are in reach.
    expect(items.collect(0.5, 0.5 + 2, 0.5, 2, take)).toBe(0);
    expect(items.collect(0.5, 0.5 + 0.5, 0.5, 2, take)).toBe(1);
  });

  it('stays on the ground when the inventory has no room for it', () => {
    const items = new ItemEntities();
    items.spawn(BlockId.STONE, 4, 0.5, 0, 0.5, rand);
    for (let t = 0; t < ITEM_PICKUP_DELAY_S; t += DT) items.step(DT, floor);
    expect(items.collect(0.5, 0, 0.5, 2, (_s, count) => count)).toBe(0);
    expect(items.items[0]!.count).toBe(4);
    expect(items.collect(0.5, 0, 0.5, 2, (_s, count) => count - 1)).toBe(0); // a partial pick-up keeps the rest
    expect(items.items[0]!.count).toBe(3);
  });

  it('disappears after its lifetime', () => {
    const items = new ItemEntities();
    items.spawn(BlockId.STONE, 1, 0.5, 0, 0.5, rand);
    for (let t = 0; t < ITEM_LIFETIME_S; t += 1) items.step(1, floor);
    expect(items.items.length).toBe(0);
  });

  it('removes the oldest item when there are too many', () => {
    const items = new ItemEntities();
    for (let i = 0; i <= MAX_ITEMS; i++) items.spawn(BlockId.STONE, 1, i, 0, 0, rand);
    expect(items.items.length).toBe(MAX_ITEMS);
    expect(items.items[0]!.x).toBe(1);
  });

  it('snapshots and restores the same stacks and positions, at rest', () => {
    const items = new ItemEntities();
    items.spawn(BlockId.DIRT, 3, 1, 2, 3, rand);
    const saved = items.snapshot();
    expect(saved).toEqual([{ state: BlockId.DIRT, count: 3, x: 1, y: 2, z: 3 }]);
    const copy = new ItemEntities();
    copy.restore(saved);
    expect(copy.snapshot()).toEqual(saved);
    expect(copy.items[0]!.vy).toBe(0);
  });
});
