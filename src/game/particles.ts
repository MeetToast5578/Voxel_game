import { GRAVITY_M_S2, toCells } from '../config';

/** A bit of a broken block: the block's state (for its tile), position and velocity in cells, seconds left. */
export interface Particle {
  state: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

const GRAVITY = toCells(GRAVITY_M_S2);
/** Most bits alive at once; older ones go first. */
const CAP = 96;

/** Bits that fly out of a broken block and fall away. */
export class Particles {
  readonly list: Particle[] = [];

  /** A burst of `count` bits of `state` from the centre (x, y, z) of a cell. */
  burst(state: number, x: number, y: number, z: number, count = 8, rand = Math.random): void {
    for (let k = 0; k < count; k++) {
      if (this.list.length >= CAP) this.list.shift();
      this.list.push({
        state, x: x + (rand() - 0.5) * 0.6, y: y + (rand() - 0.5) * 0.6, z: z + (rand() - 0.5) * 0.6,
        vx: (rand() - 0.5) * 4, vy: 2 + rand() * 3, vz: (rand() - 0.5) * 4, life: 0.5 + rand() * 0.4,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      if ((p.life -= dt) <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }
}
