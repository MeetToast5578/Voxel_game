import {
  GRAVITY, ITEM_FRICTION, ITEM_LIFETIME_S, ITEM_PICKUP_BELOW_M, ITEM_PICKUP_DELAY_S, ITEM_PICKUP_RADIUS_M,
  ITEM_POP_SPEED_M_S, ITEM_SIZE, ITEM_SPREAD_M_S, MAX_ITEMS, TERMINAL_VELOCITY, metersToBlocks,
} from '../config';
import { type BodyShape, moveAndCollide, type CollisionFn } from '../player/physics';

/** A stack of block states lying on the ground. (x, z) is its centre and y its bottom, in blocks. */
export interface ItemEntity {
  id: number;
  state: number;
  count: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

/** A dropped item as the save stores it. */
export interface DroppedItem {
  state: number;
  count: number;
  x: number;
  y: number;
  z: number;
}

const SHAPE: BodyShape = { halfWidth: ITEM_SIZE / 2, height: ITEM_SIZE };
const POP_SPEED = metersToBlocks(ITEM_POP_SPEED_M_S);
const SPREAD_SPEED = metersToBlocks(ITEM_SPREAD_M_S);
const PICKUP_RADIUS = metersToBlocks(ITEM_PICKUP_RADIUS_M);
const PICKUP_BELOW = metersToBlocks(ITEM_PICKUP_BELOW_M);

/** Dropped items: falling, resting, lifetime, the cap, and pick-up. Pure. */
export class ItemEntities {
  readonly items: ItemEntity[] = [];
  private nextId = 1;

  /**
   * Drops a stack at (x, y, z), popping up with a small random sideways push. `rand` returns numbers in [0, 1).
   * When the cap is reached, the oldest item goes.
   */
  spawn(state: number, count: number, x: number, y: number, z: number, rand: () => number): ItemEntity {
    const angle = rand() * 2 * Math.PI;
    const speed = rand() * SPREAD_SPEED;
    const item: ItemEntity = {
      id: this.nextId++, state, count, x, y, z,
      vx: Math.cos(angle) * speed, vy: POP_SPEED, vz: Math.sin(angle) * speed, age: 0,
    };
    this.items.push(item);
    if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
    return item;
  }

  /** Puts saved items back at rest. */
  restore(saved: readonly DroppedItem[]): void {
    for (const d of saved) this.items.push({ id: this.nextId++, ...d, vx: 0, vy: 0, vz: 0, age: 0 });
    if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
  }

  /** The items as the save stores them. */
  snapshot(): DroppedItem[] {
    return this.items.map(({ state, count, x, y, z }) => ({ state, count, x, y, z }));
  }

  /** Moves every item by dt seconds under gravity and friction, and removes the ones past their lifetime. */
  step(dt: number, isSolid: CollisionFn): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      if (item.age >= ITEM_LIFETIME_S) {
        this.items.splice(i, 1);
        continue;
      }
      item.vy = Math.max(-TERMINAL_VELOCITY, item.vy - GRAVITY * dt);
      // moveAndCollide needs each move to be shorter than the item's size, so fast items take smaller steps.
      const fastest = Math.max(Math.abs(item.vx), Math.abs(item.vy), Math.abs(item.vz));
      const parts = Math.max(1, Math.ceil((fastest * dt) / (ITEM_SIZE / 2)));
      const h = dt / parts;
      for (let p = 0; p < parts; p++) {
        const pos = { x: item.x, y: item.y, z: item.z };
        const vel = { x: item.vx, y: item.vy, z: item.vz };
        const result = moveAndCollide(pos, vel, h, SHAPE, isSolid);
        Object.assign(item, pos);
        item.vx = vel.x;
        item.vy = vel.y;
        item.vz = vel.z;
        if (result.onGround) {
          const f = Math.exp(-ITEM_FRICTION * h);
          item.vx *= f;
          item.vz *= f;
        }
      }
    }
  }

  /**
   * Picks up the items within reach of a body whose feet are at (x, y, z) and whose height is bodyHeight: within the
   * radius, from one block below the feet up to the head. `take`
   * adds a stack to the player's items and returns how many did not fit. Items that do not fit stay, with the rest.
   * Returns the number of items picked up completely.
   */
  collect(x: number, y: number, z: number, bodyHeight: number, take: (state: number, count: number) => number): number {
    let picked = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      if (item.age < ITEM_PICKUP_DELAY_S) continue;
      const dx = item.x - x;
      const dz = item.z - z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      if (item.y + ITEM_SIZE < y - PICKUP_BELOW || item.y > y + bodyHeight) continue;
      const left = take(item.state, item.count);
      if (left === 0) {
        this.items.splice(i, 1);
        picked++;
      } else {
        item.count = left;
      }
    }
    return picked;
  }
}
