import {
  LAVA_DENSITY, LAVA_BODY_DRAG, GRAVITY, LOOSE_BODY_CAP, LOOSE_BODY_FRICTION, LOOSE_BODY_MAX_S, LOOSE_BODY_REST_S, LOOSE_BODY_REST_SPEED_M_S, LOOSE_BODY_SPIN_RATE,
  LOOSE_BODY_WATER_DRAG, TERMINAL_VELOCITY, WATER_DENSITY, metersToBlocks,
} from '../config';
import { type BodyShape, moveAndCollide, type SolidFn } from '../player/physics';

/** A one-block cube that tumbles: a block that broke free of a collapse (spec 25, slice 6). (x, z) is its centre and y its bottom, in blocks. */
export interface LooseBody {
  id: number;
  /** The block state it becomes when it settles, or drops as when it does not fit. */
  state: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Tumble angles, for drawing. Spin rates decay once the body is on the ground. */
  angleX: number;
  angleY: number;
  angleZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  /** True when the body stands on a solid block after its last move. */
  onGround: boolean;
  /** Seconds it has been alive, and seconds it has been at rest on the ground. */
  age: number;
  rest: number;
}

const SHAPE: BodyShape = { halfWidth: 0.5, height: 1 };
const REST_SPEED = metersToBlocks(LOOSE_BODY_REST_SPEED_M_S); // blocks per second
/** The most a body moves in one sub-step, in blocks, so the sweep never skips a block. */
const MAX_MOVE = 0.4;

/** The fraction of a body's height under water, sampled in the lower and upper half of the block. */
function submergedFraction(isWater: (x: number, y: number, z: number) => boolean, b: LooseBody): number {
  const cx = Math.floor(b.x);
  const cz = Math.floor(b.z);
  const low = isWater(cx, Math.floor(b.y + 0.25), cz) ? 1 : 0;
  const high = isWater(cx, Math.floor(b.y + 0.75), cz) ? 1 : 0;
  return (low + high) / 2;
}

/**
 * Loose rigid bodies: one-block cubes that fall, tumble, bump into blocks, float or sink by their density, and settle.
 * A body that is at rest on the ground for a moment settles, and the caller turns it back into a block or an item.
 * Pure: the caller passes in the solid and water tests, and the density of each block state.
 */
export class LooseBodies {
  readonly bodies: LooseBody[] = [];
  private nextId = 1;

  /** True while another body fits under the cap. */
  get canAdd(): boolean {
    return this.bodies.length < LOOSE_BODY_CAP;
  }

  /**
   * Starts a body for a block state at (x, y, z), where (x, z) is its centre and y its bottom. It gets a small random
   * push and spin, so a collapse looks like tumbling. `rand` returns numbers in [0, 1).
   */
  spawn(state: number, x: number, y: number, z: number, rand: () => number): LooseBody {
    const body: LooseBody = {
      id: this.nextId++,
      state,
      x,
      y,
      z,
      vx: (rand() - 0.5) * 2,
      vy: 0,
      vz: (rand() - 0.5) * 2,
      angleX: rand() * Math.PI,
      angleY: rand() * Math.PI,
      angleZ: rand() * Math.PI,
      spinX: (rand() - 0.5) * 2 * LOOSE_BODY_SPIN_RATE,
      spinY: (rand() - 0.5) * 2 * LOOSE_BODY_SPIN_RATE,
      spinZ: (rand() - 0.5) * 2 * LOOSE_BODY_SPIN_RATE,
      onGround: false,
      age: 0,
      rest: 0,
    };
    this.bodies.push(body);
    return body;
  }

  /**
   * Moves every body by dt seconds: gravity, buoyancy from the water it is in, drag in water, collision with solid
   * blocks, friction on the ground, and spin. Returns the bodies that settle this step, and removes them.
   */
  step(
    dt: number,
    isSolid: SolidFn,
    isWater: (x: number, y: number, z: number) => boolean,
    densityOf: (state: number) => number,
    isLava: SolidFn = () => false,
  ): LooseBody[] {
    const settled: LooseBody[] = [];
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]!;
      b.age += dt;
      const water = submergedFraction(isWater, b);
      const lava = submergedFraction(isLava, b);
      const submerged = Math.max(water, lava);
      const density = lava > 0 && water === 0 ? LAVA_DENSITY : WATER_DENSITY;
      const fluidDrag = lava > 0 && water === 0 ? LAVA_BODY_DRAG : LOOSE_BODY_WATER_DRAG;
      // Buoyancy pushes up with the weight of the water a body displaces, so a body lighter than water floats and a
      // heavier one sinks at a reduced rate.
      const buoyancy = submerged * GRAVITY * (density / densityOf(b.state));
      b.vy = Math.max(-TERMINAL_VELOCITY, b.vy + (buoyancy - GRAVITY) * dt);
      if (submerged > 0) {
        const drag = Math.exp(-fluidDrag * submerged * dt);
        b.vx *= drag;
        b.vy *= drag;
        b.vz *= drag;
      }
      this.sweep(b, dt, isSolid);
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      b.rest = b.onGround && speed < REST_SPEED ? b.rest + dt : 0;
      b.angleX += b.spinX * dt;
      b.angleY += b.spinY * dt;
      b.angleZ += b.spinZ * dt;
      if (b.onGround) {
        const damp = Math.exp(-4 * dt);
        b.spinX *= damp;
        b.spinY *= damp;
        b.spinZ *= damp;
      }
      if (b.rest >= LOOSE_BODY_REST_S || b.age >= LOOSE_BODY_MAX_S) {
        settled.push(b);
        this.bodies.splice(i, 1);
      }
    }
    return settled;
  }

  /** Moves a body along its velocity in sub-steps, and updates its ground flag from the sweep. */
  private sweep(b: LooseBody, dt: number, isSolid: SolidFn): void {
    const fastest = Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz));
    const parts = Math.max(1, Math.ceil((fastest * dt) / MAX_MOVE));
    const h = dt / parts;
    b.onGround = false;
    for (let p = 0; p < parts; p++) {
      const pos = { x: b.x, y: b.y, z: b.z };
      const vel = { x: b.vx, y: b.vy, z: b.vz };
      const result = moveAndCollide(pos, vel, h, SHAPE, isSolid);
      b.x = pos.x;
      b.y = pos.y;
      b.z = pos.z;
      b.vx = vel.x;
      b.vy = vel.y;
      b.vz = vel.z;
      if (result.onGround) {
        b.onGround = true;
        const f = Math.exp(-LOOSE_BODY_FRICTION * h);
        b.vx *= f;
        b.vz *= f;
      }
    }
  }
}
