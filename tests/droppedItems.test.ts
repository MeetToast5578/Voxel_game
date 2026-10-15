import { describe, expect, it } from 'vitest';
import { ITEM_HEIGHT, ITEM_PICKUP_DELAY_S, DROPPED_ITEM_MAX, metersToBlocks } from '../src/config';
import {
  addDroppedItem, canPickUp, spawnDroppedItem, stepDroppedItem, type DroppedItem,
} from '../src/items/droppedItems';
import { HeldItems } from '../src/items/heldItems';

const DT = 1 / 60;
/** Ground: every block with y < 0 is solid, so the surface is at y = 0. */
const floor = (_x: number, y: number) => y < 0;
const ZERO_RANDOM = () => 0.5; // centred random: zero sideways speed

function item(over: Partial<DroppedItem> = {}): DroppedItem {
  return { blockId: 1, pos: { x: 0.5, y: 3, z: 0.5 }, vel: { x: 0, y: 0, z: 0 }, spin: 0, pickupDelay: 0, ...over };
}

describe('spawnDroppedItem', () => {
  it('starts centred in the broken cell, with its bottom face at the cell middle minus half the item', () => {
    const it0 = spawnDroppedItem(7, 4, 9, -2, ZERO_RANDOM);
    expect(it0.blockId).toBe(7);
    expect(it0.pos.x).toBeCloseTo(4.5);
    expect(it0.pos.z).toBeCloseTo(-1.5);
    expect(it0.pos.y).toBeCloseTo(9 + (1 - ITEM_HEIGHT) / 2);
  });

  it('gives sideways speed within the spread, and no upward speed', () => {
    const spawned = spawnDroppedItem(1, 0, 0, 0, () => 0);
    expect(spawned.vel.x).toBeCloseTo(-metersToBlocks(0.5));
    expect(spawned.vel.y).toBe(0);
    expect(spawned.pickupDelay).toBe(ITEM_PICKUP_DELAY_S);
  });
});

describe('stepDroppedItem', () => {
  it('falls and comes to rest on the solid block below, not inside it', () => {
    const it0 = item({ pos: { x: 0.5, y: 3, z: 0.5 } });
    for (let t = 0; t < 2; t += DT) expect(stepDroppedItem(it0, DT, floor)).toBe(true);
    expect(it0.pos.y).toBeCloseTo(0, 3);
    expect(it0.vel.y).toBe(0);
  });

  it('never tunnels through a thin floor at high fall speed', () => {
    // A one-block-thick floor at y = -1 with air under it: a fast item must still stop on top of it.
    const thin = (_x: number, y: number) => y === -1;
    const it0 = item({ pos: { x: 0.5, y: 8, z: 0.5 } });
    for (let t = 0; t < 3; t += DT) stepDroppedItem(it0, DT, thin);
    expect(it0.pos.y).toBeCloseTo(0, 3);
  });

  it('stops sideways motion once it has landed', () => {
    // Just above the floor, so it lands within this one frame; the sideways speed is kept until then.
    const it0 = item({ pos: { x: 0.5, y: 0.01, z: 0.5 }, vel: { x: 0.5, y: 0, z: -0.5 } });
    stepDroppedItem(it0, DT, floor);
    expect(it0.vel.x).toBe(0);
    expect(it0.vel.z).toBe(0);
  });

  it('turns the spin and wraps it into [0, 360)', () => {
    const it0 = item({ spin: 359 });
    stepDroppedItem(it0, 1, floor);
    expect(it0.spin).toBeGreaterThanOrEqual(0);
    expect(it0.spin).toBeLessThan(360);
  });

  it('counts down the pickup delay and stops at zero', () => {
    const it0 = item({ pickupDelay: 0.2 });
    stepDroppedItem(it0, 0.5, floor);
    expect(it0.pickupDelay).toBe(0);
  });

  it('nudges an item out of a block placed on top of it', () => {
    // Solid from y = 0 to y = 1 (a new block where the item was): the item moves up to y = 1.
    const placed = (_x: number, y: number) => y >= 0 && y < 1;
    const it0 = item({ pos: { x: 0.5, y: 0.2, z: 0.5 } });
    expect(stepDroppedItem(it0, DT, placed)).toBe(true);
    expect(it0.pos.y).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('removes an item that is buried in solid rock', () => {
    const solidEverywhere = () => true;
    expect(stepDroppedItem(item(), DT, solidEverywhere)).toBe(false);
  });
});

describe('canPickUp', () => {
  const feet = { x: 0.5, y: 0, z: 0.5 };

  it('is false during the pickup delay, even when the item is in reach', () => {
    expect(canPickUp(item({ pos: { x: 0.5, y: 1, z: 0.5 }, pickupDelay: 0.1 }), feet)).toBe(false);
  });

  it('is true within the pickup radius and false beyond it', () => {
    expect(canPickUp(item({ pos: { x: 0.5, y: 1, z: 0.5 } }), feet)).toBe(true);
    expect(canPickUp(item({ pos: { x: 20, y: 1, z: 0.5 } }), feet)).toBe(false);
  });
});

describe('addDroppedItem', () => {
  it('keeps at most DROPPED_ITEM_MAX items and drops the oldest', () => {
    const items: DroppedItem[] = [];
    for (let i = 0; i < DROPPED_ITEM_MAX + 3; i++) addDroppedItem(items, item({ blockId: i + 1 }));
    expect(items).toHaveLength(DROPPED_ITEM_MAX);
    expect(items[0]!.blockId).toBe(4);
  });
});

describe('HeldItems', () => {
  it('counts pickups per block state and totals them', () => {
    const held = new HeldItems();
    held.add(5);
    held.add(5);
    held.add(9);
    expect(held.count(5)).toBe(2);
    expect(held.count(3)).toBe(0);
    expect(held.total).toBe(3);
    expect(held.entries()).toEqual([[5, 2], [9, 1]]);
  });
});
