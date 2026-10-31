import { GRAVITY_M_S2, PROJECTILE_LIFE_S, toCells } from '../config';
import type { BoxAt } from './collision';
import type { Body } from './physics';

/** An arrow or bolt in flight, in cells and cells per second. */
export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  /** Who shot it: the player's arrows hit creatures, creatures' bolts hit the player. */
  fromPlayer: boolean;
  age: number;
}

/** What a projectile ran into this step. */
export type ProjectileHit = { kind: 'body'; body: Body; p: Projectile } | { kind: 'ground'; p: Projectile };

const GRAVITY = toCells(GRAVITY_M_S2);
const SUBSTEP = 0.25;

/** Whether point (x, y, z) is inside body `b`, grown by `pad` cells. */
const inside = (b: Body, x: number, y: number, z: number, pad: number) =>
  Math.abs(x - b.x) <= b.halfWidth + pad && Math.abs(z - b.z) <= b.halfWidth + pad && y >= b.y - pad && y <= b.y + b.height + pad;

/** Arrows and bolts: they fly under gravity until they hit a body or the ground, or grow too old. */
export class Projectiles {
  readonly list: Projectile[] = [];

  shoot(x: number, y: number, z: number, dx: number, dy: number, dz: number, speedCells: number, damage: number, fromPlayer: boolean): void {
    const len = Math.hypot(dx, dy, dz) || 1;
    this.list.push({ x, y, z, vx: (dx / len) * speedCells, vy: (dy / len) * speedCells, vz: (dz / len) * speedCells, damage, fromPlayer, age: 0 });
  }

  /**
   * Moves every projectile by dt; returns what each hit. `targets` gives the bodies a projectile can hit (by who shot
   * it). The step is cut into pieces no longer than a quarter cell, so nothing passes through a thin target.
   */
  update(dt: number, boxAt: BoxAt, targets: (fromPlayer: boolean) => readonly Body[]): ProjectileHit[] {
    const hits: ProjectileHit[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      p.vy -= GRAVITY * dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / SUBSTEP));
      let hit: ProjectileHit | null = null;
      for (let s = 0; s < steps && !hit; s++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        p.z += (p.vz * dt) / steps;
        const body = targets(p.fromPlayer).find((b) => inside(b, p.x, p.y, p.z, 0.1));
        if (body) hit = { kind: 'body', body, p };
        else if (boxAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== 0) hit = { kind: 'ground', p };
      }
      if (hit) hits.push(hit);
      if (hit || p.age > PROJECTILE_LIFE_S) this.list.splice(i, 1);
    }
    return hits;
  }
}

/**
 * Unit direction to shoot from (x, y, z) at `speed` (cells/s) so the shot falls onto (tx, ty, tz) under gravity: the
 * flatter of the two ballistic angles, or 45° (the longest throw) when the target is out of reach.
 */
export function aimAt(x: number, y: number, z: number, tx: number, ty: number, tz: number, speed: number): [number, number, number] {
  const dx = tx - x, dz = tz - z, flat = Math.hypot(dx, dz) || 1e-6, rise = ty - y, v2 = speed * speed;
  const root = v2 * v2 - GRAVITY * (GRAVITY * flat * flat + 2 * rise * v2);
  const angle = root >= 0 ? Math.atan((v2 - Math.sqrt(root)) / (GRAVITY * flat)) : Math.PI / 4;
  const c = Math.cos(angle);
  return [(dx / flat) * c, Math.sin(angle), (dz / flat) * c];
}
