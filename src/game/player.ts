import {
  AIR_ACCEL, EYE_HEIGHT_M, FLY_FAST_FACTOR, FLY_SPEED_M_S, GRAVITY_M_S2, GROUND_ACCEL, JUMP_SPEED_M_S, PLAYER_DENSITY,
  PLAYER_HALF_WIDTH_M, PLAYER_HEIGHT_M, SPRINT_SPEED_M_S, STEP_HEIGHT_M, STEP_SMOOTH_S, SWIM_THRUST_M_S2, SWIM_UP_M_S2,
  TERMINAL_SPEED_M_S, WALK_SPEED_M_S, WATER_DENSITY, WATER_DRAG_PER_M, toCells, BLOCK_SIZE_M,
} from '../config';
import type { BoxAt } from './collision';
import type { Input } from './input';
import { moveBody, type Body } from './physics';

/** Whether cell (x, y, z) holds water the body can float in. */
export type WaterAt = (x: number, y: number, z: number) => boolean;

const GRAVITY = toCells(GRAVITY_M_S2);
const BUOYANCY = GRAVITY * (WATER_DENSITY / PLAYER_DENSITY);
// Drag a = -k |v| v: with v in cells per second, k in 1/m becomes k * (m per cell) per cell.
const WATER_DRAG = WATER_DRAG_PER_M * BLOCK_SIZE_M;

/** Fraction of the body's volume inside water cells, from 0 to 1. */
export function submergedFraction(b: Body, waterAt: WaterAt): number {
  const x0 = b.x - b.halfWidth, x1 = b.x + b.halfWidth, z0 = b.z - b.halfWidth, z1 = b.z + b.halfWidth;
  const y0 = b.y, y1 = b.y + b.height;
  let wet = 0;
  for (let y = Math.floor(y0); y < y1; y++) {
    const oy = Math.min(y1, y + 1) - Math.max(y0, y);
    for (let z = Math.floor(z0); z < z1; z++) {
      const oz = Math.min(z1, z + 1) - Math.max(z0, z);
      for (let x = Math.floor(x0); x < x1; x++) {
        if (!waterAt(x, y, z)) continue;
        wet += oy * oz * (Math.min(x1, x + 1) - Math.max(x0, x));
      }
    }
  }
  return wet / ((x1 - x0) * (z1 - z0) * (y1 - y0));
}

/** The player's body and its movement: walking, jumping, swimming and flying. Units are cells. */
export class Player {
  readonly body: Body;
  yaw = 0;
  pitch = 0;
  flying = false;
  submerged = 0;
  /** Camera offset that eases out a step, so stepping up or down is not a jolt. */
  private stepOffset = 0;

  constructor(x: number, y: number, z: number) {
    this.body = {
      x, y, z, vx: 0, vy: 0, vz: 0, onGround: false,
      halfWidth: toCells(PLAYER_HALF_WIDTH_M), height: toCells(PLAYER_HEIGHT_M),
    };
  }

  /** Eye position in cells. */
  get eyeY(): number {
    return this.body.y + toCells(EYE_HEIGHT_M) - this.stepOffset;
  }

  /** Unit view direction. */
  direction(): [number, number, number] {
    const c = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c];
  }

  update(dt: number, input: Input, boxAt: BoxAt, waterAt: WaterAt): void {
    const b = this.body;
    if (input.consume('fly')) {
      this.flying = !this.flying;
      b.vy = 0;
    }
    // Wish direction in the horizontal plane.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let wx = fx * input.moveZ - fz * input.moveX, wz = fz * input.moveZ + fx * input.moveX;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    this.submerged = submergedFraction(b, waterAt);

    if (this.flying) {
      const speed = toCells(FLY_SPEED_M_S) * (input.sprint ? FLY_FAST_FACTOR : 1);
      const blend = Math.min(1, GROUND_ACCEL * dt);
      b.vx += (wx * speed - b.vx) * blend;
      b.vz += (wz * speed - b.vz) * blend;
      b.vy += (((input.jump ? 1 : 0) - (input.descend ? 1 : 0)) * speed - b.vy) * blend;
      moveBody(b, dt, boxAt, 0);
    } else if (this.submerged > 0.05) {
      const thrust = toCells(SWIM_THRUST_M_S2);
      b.vx += wx * thrust * dt;
      b.vz += wz * thrust * dt;
      b.vy += (BUOYANCY * this.submerged - GRAVITY) * dt + (input.jump ? toCells(SWIM_UP_M_S2) * dt : 0);
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const drag = Math.max(0, 1 - WATER_DRAG * speed * dt);
      b.vx *= drag;
      b.vy *= drag;
      b.vz *= drag;
      // Climbing out onto a ledge from the water works like walking up a step.
      this.move(dt, boxAt, toCells(STEP_HEIGHT_M));
    } else {
      const speed = toCells(input.sprint ? SPRINT_SPEED_M_S : WALK_SPEED_M_S);
      const blend = Math.min(1, (b.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt);
      b.vx += (wx * speed - b.vx) * blend;
      b.vz += (wz * speed - b.vz) * blend;
      if (input.jump && b.onGround) b.vy = toCells(JUMP_SPEED_M_S);
      b.vy = Math.max(-toCells(TERMINAL_SPEED_M_S), b.vy - GRAVITY * dt);
      this.move(dt, boxAt, toCells(STEP_HEIGHT_M));
    }
    this.stepOffset *= Math.max(0, 1 - dt / STEP_SMOOTH_S);
  }

  private move(dt: number, boxAt: BoxAt, step: number): void {
    const r = moveBody(this.body, dt, boxAt, step);
    this.stepOffset += r.stepped;
  }
}
