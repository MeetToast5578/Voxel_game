import { DROP_CAP, DROP_LIFETIME_S, DROP_PICKUP_M, DROP_SIZE_M, GRAVITY_M_S2, toCells } from '../config';
import { BLOCKS } from '../engine/blocks';
import type { Inventory, ItemStack } from './inventory';
import type { BoxAt } from './collision';
import { moveBody, type Body } from './physics';

const GRAVITY = toCells(GRAVITY_M_S2);
const HALF = toCells(DROP_SIZE_M) / 2;
const REACH = toCells(DROP_PICKUP_M);

export interface Drop {
  stack: ItemStack;
  body: Body;
  /** Seconds since it was dropped. */
  age: number;
  /** Seconds until it can be picked up. */
  wait: number;
}

/** Items lying in the world: they fall, slide to a stop, are picked up by a player who comes close, and vanish after a while. */
export class Drops {
  readonly list: Drop[] = [];

  /** Drops a stack with its feet at (x, y, z) in cells, moving at (vx, vy, vz) cells/s. */
  spawn(stack: ItemStack, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, wait = 0): void {
    if (stack.count <= 0) return;
    if (this.list.length >= DROP_CAP) this.list.shift();
    this.list.push({
      stack: { ...stack },
      body: { x, y, z, vx, vy, vz, halfWidth: HALF, height: HALF * 2, onGround: false },
      age: 0,
      wait,
    });
  }

  /** Moves every drop and gives the ones near `player` (if any) to `inventory`, as much as fits. Returns whether any was picked up. */
  update(dt: number, boxAt: BoxAt, player: Body | null, inventory: Inventory): boolean {
    const list = this.list;
    let picked = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i]!, b = d.body;
      d.age += dt;
      d.wait -= dt;
      if (d.age > DROP_LIFETIME_S) {
        list.splice(i, 1);
        continue;
      }
      b.vy -= GRAVITY * dt;
      if (b.onGround) {
        const f = Math.exp(-8 * dt);
        b.vx *= f;
        b.vz *= f;
      }
      moveBody(b, dt, boxAt);
      if (d.wait > 0 || !player) continue;
      const dx = b.x - player.x, dy = b.y - (player.y + player.height / 2), dz = b.z - player.z;
      if (dx * dx + dy * dy + dz * dz > REACH * REACH) continue;
      const left = inventory.add(d.stack);
      picked ||= left < d.stack.count;
      if (left === 0) list.splice(i, 1);
      else d.stack.count = left;
    }
    return picked;
  }

  save(): unknown {
    return this.list.map((d) => [BLOCKS.stateName(d.stack.state), d.stack.count, d.stack.wear ?? 0, d.body.x, d.body.y, d.body.z, d.age]);
  }

  /** Restores a save; malformed entries are skipped. */
  load(saved: unknown): void {
    this.list.length = 0;
    if (!Array.isArray(saved)) return;
    for (const e of saved) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || e.slice(1).some((v) => typeof v !== 'number' || !Number.isFinite(v))) continue;
      const state = BLOCKS.parseStateName(e[0]);
      if (state === null || !(e[1] > 0)) continue;
      this.spawn({ state, count: Math.floor(e[1]), ...(e[2] > 0 ? { wear: e[2] } : {}) }, e[3], e[4], e[5]);
      this.list[this.list.length - 1]!.age = e[6];
    }
  }
}
