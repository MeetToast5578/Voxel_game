import {
  AIR_ACCEL, EYE_HEIGHT, FLY_SPEED, GRAVITY, GROUND_ACCEL, JUMP_SPEED, PLAYER_HALF_WIDTH, PLAYER_HEIGHT,
  SPRINT_SPEED, SWIM_GRAVITY, SWIM_SINK_SPEED, SWIM_SPEED_FACTOR, SWIM_UP_SPEED, TERMINAL_VELOCITY, WALK_SPEED,
} from '../config';
import { clamp, lerp } from '../core/math';
import { moveAndCollide, type BodyShape, type SolidFn, type Vec3 } from './physics';

export interface PlayerControls {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  descend: boolean;
  sprint: boolean;
}

export const NO_CONTROLS: PlayerControls = {
  forward: false, back: false, left: false, right: false, jump: false, descend: false, sprint: false,
};

export const PLAYER_SHAPE: BodyShape = { halfWidth: PLAYER_HALF_WIDTH, height: PLAYER_HEIGHT };
const MAX_PITCH = Math.PI / 2 - 0.001;

export class Player {
  readonly position: Vec3 = { x: 0, y: 0, z: 0 };
  readonly prevPosition: Vec3 = { x: 0, y: 0, z: 0 };
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  /** True when the middle of the body is in water (updated by update()). */
  inWater = false;
  /** True when the last step bumped into a wall horizontally. */
  private againstWall = false;

  setPosition(x: number, y: number, z: number): void {
    this.position.x = this.prevPosition.x = x;
    this.position.y = this.prevPosition.y = y;
    this.position.z = this.prevPosition.z = z;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
  }

  /** dx, dy: mouse movement in pixels. sensitivity: radians per pixel. */
  addLook(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -MAX_PITCH, MAX_PITCH);
    // keep yaw in [-PI, PI) so it never loses precision
    this.yaw = ((((this.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  }

  toggleFlying(): void {
    this.flying = !this.flying;
    this.velocity.y = 0;
  }

  /** isWater is optional so older callers and tests keep working; it defaults to "no water anywhere". */
  update(dt: number, c: PlayerControls, isSolid: SolidFn, isWater: SolidFn = () => false): void {
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    const bx = Math.floor(this.position.x);
    const bz = Math.floor(this.position.z);
    this.inWater = isWater(bx, Math.floor(this.position.y + 0.6), bz); // water at waist height
    const feetInWater = isWater(bx, Math.floor(this.position.y + 0.1), bz);
    const swimming = this.inWater && !this.flying;

    // Horizontal wish direction from yaw. Yaw 0 looks toward -Z.
    const ix = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const iz = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * iz + cos * ix;
    let wz = -cos * iz - sin * ix;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const speed = (this.flying ? FLY_SPEED : c.sprint ? SPRINT_SPEED : WALK_SPEED) * (swimming ? SWIM_SPEED_FACTOR : 1);
    const t = 1 - Math.exp(-(this.flying || this.onGround || swimming ? GROUND_ACCEL : AIR_ACCEL) * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * t;
    this.velocity.z += (wz * speed - this.velocity.z) * t;

    if (this.flying) {
      const iy = (c.jump ? 1 : 0) - (c.descend ? 1 : 0);
      this.velocity.y += (iy * FLY_SPEED - this.velocity.y) * t;
    } else if (c.jump && feetInWater && this.againstWall) {
      this.velocity.y = JUMP_SPEED; // climb out of the water onto a ledge
    } else if (swimming) {
      if (c.jump) this.velocity.y += (SWIM_UP_SPEED - this.velocity.y) * t;
      else this.velocity.y = Math.max(this.velocity.y - SWIM_GRAVITY * dt, -SWIM_SINK_SPEED);
    } else {
      if (c.jump && this.onGround) this.velocity.y = JUMP_SPEED;
      this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
    }

    const r = moveAndCollide(this.position, this.velocity, dt, PLAYER_SHAPE, isSolid);
    this.onGround = r.onGround;
    this.againstWall = r.hitX || r.hitZ;
    if (this.flying && r.onGround) this.flying = false; // landing ends flight
  }

  /** Interpolated eye position for rendering. alpha in [0, 1]. */
  eyePosition(alpha: number): Vec3 {
    return {
      x: lerp(this.prevPosition.x, this.position.x, alpha),
      y: lerp(this.prevPosition.y, this.position.y, alpha) + EYE_HEIGHT,
      z: lerp(this.prevPosition.z, this.position.z, alpha),
    };
  }

  /** Unit vector the camera looks along. */
  lookDirection(): Vec3 {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
}
