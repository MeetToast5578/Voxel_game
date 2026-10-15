import {
  AIR_ACCEL, EYE_HEIGHT, FEET_WATER_HEIGHT, FLY_SPEED, GRAVITY, GROUND_ACCEL, JUMP_SPEED, PLAYER_DENSITY,
  PLAYER_HALF_WIDTH, PLAYER_HEIGHT, SPRINT_SPEED, STEP_HEIGHT, STEP_SMOOTH_S, SWIM_THRUST, SWIM_UP_ACCEL,
  SPLASH_MIN_SPEED, SWIM_WAIST_HEIGHT, TERMINAL_VELOCITY, WADE_SLOWDOWN, WALK_SPEED, WATER_DENSITY, WATER_DRAG,
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

/**
 * Share of a body's height (feet at feetY) under the water surface: the top of the highest water block in its column.
 * 0 with no water, 1 when the surface is above the head.
 */
export function submergedFraction(bx: number, bz: number, feetY: number, isWater: SolidFn): number {
  for (let y = Math.floor(feetY + PLAYER_HEIGHT); y >= Math.floor(feetY); y--) {
    if (isWater(bx, y, bz)) return clamp((y + 1 - feetY) / PLAYER_HEIGHT, 0, 1);
  }
  return 0;
}

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
  /**
   * Downward speed (blocks/s) of the frame in which the body entered water fast enough to splash; 0 on every other
   * frame. The game plays the splash sound on it, and fall damage will read it later.
   */
  splashSpeed = 0;
  /** Submerged fraction at the start of the last update, for detecting entry into water. */
  private submerged = 0;
  /** True when the last step bumped into a wall horizontally. */
  private againstWall = false;
  /**
   * Visual-only eye offset (<= 0) after stepping up a ledge, so the camera rises smoothly instead of snapping.
   * Never used by physics.
   */
  private eyeOffset = 0;
  private prevEyeOffset = 0;

  setPosition(x: number, y: number, z: number): void {
    this.position.x = this.prevPosition.x = x;
    this.position.y = this.prevPosition.y = y;
    this.position.z = this.prevPosition.z = z;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.eyeOffset = this.prevEyeOffset = 0;
    this.submerged = 0;
    this.splashSpeed = 0;
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
    this.prevEyeOffset = this.eyeOffset;
    this.eyeOffset = Math.min(0, this.eyeOffset + (STEP_HEIGHT / STEP_SMOOTH_S) * dt);
    const bx = Math.floor(this.position.x);
    const bz = Math.floor(this.position.z);
    this.inWater = isWater(bx, Math.floor(this.position.y + SWIM_WAIST_HEIGHT), bz); // water at waist height
    const feetInWater = isWater(bx, Math.floor(this.position.y + FEET_WATER_HEIGHT), bz);
    const swimming = this.inWater && !this.flying;
    const submerged = this.flying ? 0 : submergedFraction(bx, bz, this.position.y, isWater);
    const fallSpeed = -this.velocity.y;
    this.splashSpeed = this.submerged === 0 && submerged > 0 && fallSpeed >= SPLASH_MIN_SPEED ? fallSpeed : 0;
    this.submerged = submerged;

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
    // Wading: shallow water slows the walk in proportion to how much of the body is under it (spec 17).
    const speed = (this.flying ? FLY_SPEED : c.sprint ? SPRINT_SPEED : WALK_SPEED) * (1 - WADE_SLOWDOWN * submerged);
    const t = 1 - Math.exp(-(this.flying || this.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt);
    if (swimming) {
      // Drag first, then the stroke, so that at steady speed thrust = drag × speed² exactly.
      const drag = 1 - WATER_DRAG * Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z) * dt;
      this.velocity.x *= drag;
      this.velocity.y *= drag;
      this.velocity.z *= drag;
      this.velocity.x += wx * SWIM_THRUST * dt;
      this.velocity.z += wz * SWIM_THRUST * dt;
    } else {
      this.velocity.x += (wx * speed - this.velocity.x) * t;
      this.velocity.z += (wz * speed - this.velocity.z) * t;
    }

    if (this.flying) {
      const iy = (c.jump ? 1 : 0) - (c.descend ? 1 : 0);
      this.velocity.y += (iy * FLY_SPEED - this.velocity.y) * t;
    } else if (c.jump && feetInWater && this.againstWall) {
      this.velocity.y = JUMP_SPEED; // climb out of the water onto a ledge
    } else {
      if (c.jump && swimming) this.velocity.y += SWIM_UP_ACCEL * dt;
      else if (c.jump && this.onGround) this.velocity.y = JUMP_SPEED;
      // Buoyancy is gravity's counterweight, scaled by how much of the body is under water.
      this.velocity.y += (GRAVITY * (WATER_DENSITY / PLAYER_DENSITY) * submerged - GRAVITY) * dt;
      this.velocity.y = Math.max(this.velocity.y, -TERMINAL_VELOCITY);
    }

    const stepHeight = this.flying || this.inWater ? 0 : STEP_HEIGHT;
    const r = moveAndCollide(this.position, this.velocity, dt, PLAYER_SHAPE, isSolid, stepHeight);
    this.eyeOffset -= r.stepped; // the body rose; keep the eye where it was and let it catch up
    this.onGround = r.onGround;
    this.againstWall = r.hitX || r.hitZ;
    if (this.flying && r.onGround) this.flying = false; // landing ends flight
  }

  /** Interpolated eye position for rendering. alpha in [0, 1]. */
  eyePosition(alpha: number): Vec3 {
    return {
      x: lerp(this.prevPosition.x, this.position.x, alpha),
      y: lerp(this.prevPosition.y, this.position.y, alpha) + EYE_HEIGHT + lerp(this.prevEyeOffset, this.eyeOffset, alpha),
      z: lerp(this.prevPosition.z, this.position.z, alpha),
    };
  }

  /** Unit vector the camera looks along. */
  lookDirection(): Vec3 {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
}
