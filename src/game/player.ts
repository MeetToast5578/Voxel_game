import {
  AIR_ACCEL, AIR_JUMP_FACTOR, EYE_HEIGHT_M, GLIDE_FALL_M_S, FALL_GRAVITY_FACTOR, JUMP_CUT, FLY_FAST_FACTOR, FLY_SPEED_M_S, GRAVITY_M_S2, GROUND_ACCEL, JUMP_SPEED_M_S, JUMP_GRACE_S, JUMP_BUFFER_S, PLAYER_DENSITY,
  PLAYER_HALF_WIDTH_M, PLAYER_HEIGHT_M, SPRINT_SPEED_M_S, STEP_HEIGHT_M, STEP_SMOOTH_S, SWIM_THRUST_M_S2, SWIM_UP_M_S2,
  TERMINAL_SPEED_M_S, WALK_SPEED_M_S, BOAT_SPEED_M_S, WATER_DENSITY, WATER_DRAG_PER_M, toCells, BLOCK_SIZE_M, CROUCH_FACTOR, CLIMB_SPEED_M_S, CURRENT_ACCEL_M_S2, HOOK_HOLD_M, HOOK_PULL_M_S, HOOK_RANGE_M, DASH_COOLDOWN_S, DASH_SPEED_M_S, DASH_TAP_S
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
  private jumpGrace = 0;
  private jumpBuffer = 0;
  private jumpWasHeld = false;
  /** Rising from a jump that releasing the key can still cut short. */
  private jumping = false;
  /** From accessories: extra speed as a fraction, jumps allowed in the air, and gliding while jump is held. */
  speedBonus = 0;
  airJumps = 0;
  glide = false;
  private airJumpsUsed = 0;
  /** Dash Boots: a double tap of a direction dashes that way. `dashed` is set when it happens (the game clears it). */
  dash = false;
  dashed = false;
  private clock = 0;
  private tapAt = -1;
  private tapDir: [number, number] = [0, 0];
  private dashAt = -9;
  private dashLeft = 0;
  private wasWishing = false;
  /** Where the grappling hook holds fast (cells), or null: it pulls the player there and holds them until a jump. */
  hook: [number, number, number] | null = null;
  /** Set when an air jump happens, for a puff of effect; the game clears it. */
  airJumped = false;

  constructor(x: number, y: number, z: number) {
    this.body = {
      x, y, z, vx: 0, vy: 0, vz: 0, onGround: false,
      halfWidth: toCells(PLAYER_HALF_WIDTH_M), height: toCells(PLAYER_HEIGHT_M),
    };
  }

  /** A second tap of the same direction soon after the first dashes that way (with Dash Boots, off cooldown). */
  private tryDash(wx: number, wz: number, dt: number): void {
    this.clock += dt;
    const wishing = Math.hypot(wx, wz) > 0.5, fresh = wishing && !this.wasWishing;
    this.wasWishing = wishing;
    if (!fresh || !this.dash) return;
    const again = this.clock - this.tapAt < DASH_TAP_S && wx * this.tapDir[0] + wz * this.tapDir[1] > 0.7;
    this.tapAt = this.clock;
    this.tapDir = [wx, wz];
    if (!again || this.clock - this.dashAt < DASH_COOLDOWN_S) return;
    const len = Math.hypot(wx, wz), v = toCells(DASH_SPEED_M_S);
    this.body.vx = (wx / len) * v;
    this.body.vz = (wz / len) * v;
    this.dashAt = this.clock;
    this.dashLeft = 0.18;
    this.dashed = true;
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

  /** Crouching: walking slowly, and not off edges. */
  crouching = false;
  /** Riding a boat: it floats on the water and goes fast there, and drags slowly on land. */
  boating = false;

  /** Whether the body touches a climbable cell (a ladder) at its feet or middle. */
  private onLadder(climbAt: (x: number, y: number, z: number) => boolean): boolean {
    const b = this.body, x = Math.floor(b.x), z = Math.floor(b.z);
    return climbAt(x, Math.floor(b.y + 0.1), z) || climbAt(x, Math.floor(b.y + b.height / 2), z);
  }

  /** Whether anything solid is under the body's footprint if it stood at (x, z). */
  private supported(x: number, z: number, boxAt: BoxAt): boolean {
    const b = this.body, y = Math.floor(b.y - 0.05), w = b.halfWidth - 0.01;
    for (const cx of [x - w, x + w]) for (const cz of [z - w, z + w]) if (boxAt(Math.floor(cx), y, Math.floor(cz)) !== 0) return true;
    return false;
  }

  /**
   * `currentAt` gives the flow of the water in a cell as a unit-ish vector (x, y, z), or null: flowing water pushes a
   * swimmer along it, and falling water pushes down.
   */
  update(dt: number, input: Input, boxAt: BoxAt, waterAt: WaterAt, climbAt: (x: number, y: number, z: number) => boolean = () => false,
    currentAt: (x: number, y: number, z: number) => readonly [number, number, number] | null = () => null): void {
    const b = this.body;
    this.jumpGrace = b.onGround ? JUMP_GRACE_S : Math.max(0, this.jumpGrace - dt);
    const pressed = input.jump && !this.jumpWasHeld;
    this.jumpBuffer = pressed ? JUMP_BUFFER_S : Math.max(0, this.jumpBuffer - dt);
    if (b.onGround) this.airJumpsUsed = 0;
    this.jumpWasHeld = input.jump;
    this.crouching = false;
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
    if (this.flying || this.boating || this.submerged > 0.05 || this.onLadder(climbAt)) {
      this.jumpGrace = this.jumpBuffer = 0;
    }

    if (this.flying) {
      const speed = toCells(FLY_SPEED_M_S) * (input.sprint ? FLY_FAST_FACTOR : 1);
      const blend = Math.min(1, GROUND_ACCEL * dt);
      b.vx += (wx * speed - b.vx) * blend;
      b.vz += (wz * speed - b.vz) * blend;
      b.vy += (((input.jump ? 1 : 0) - (input.descend ? 1 : 0)) * speed - b.vy) * blend;
      moveBody(b, dt, boxAt, 0);
    } else if (this.boating) {
      const x = Math.floor(b.x), z = Math.floor(b.z), feet = Math.floor(b.y + 0.05);
      const afloat = waterAt(x, feet, z) || waterAt(x, Math.floor(b.y - 0.1), z);
      const speed = toCells(BOAT_SPEED_M_S) * (afloat ? 1 : 0.1);
      const blend = Math.min(1, 1.5 * dt);
      b.vx += (wx * speed - b.vx) * blend;
      b.vz += (wz * speed - b.vz) * blend;
      // The hull rides on the surface: rise while the feet are under water, rest on it, fall when off it.
      if (waterAt(x, feet, z)) b.vy = Math.min(toCells(3), b.vy + toCells(20) * dt);
      else if (afloat) {
        b.vy = 0;
        b.y = Math.floor(b.y - 0.1) + 1;
      }
      else b.vy = Math.max(-toCells(TERMINAL_SPEED_M_S), b.vy - GRAVITY * dt);
      // No stepping: a bank higher than the water stops the boat.
      this.move(dt, boxAt, 0);
      if (afloat && b.vy === 0) b.onGround = true;
    } else if (this.hook) {
      // On the hook: pulled toward its point, then held there. A jump lets go with a hop; air jumps come back.
      this.airJumpsUsed = 0;
      const [hx, hy, hz] = this.hook, dx = hx - b.x, dy = hy - (b.y + b.height * 0.5), dz = hz - b.z, d = Math.hypot(dx, dy, dz) || 1;
      if (pressed || d > toCells(HOOK_RANGE_M) + 2) {
        this.hook = null;
        if (pressed) {
          b.vy = toCells(JUMP_SPEED_M_S);
          this.jumping = true;
        }
      } else {
        const pull = d < toCells(HOOK_HOLD_M) ? 0 : toCells(HOOK_PULL_M_S), blend = Math.min(1, 10 * dt);
        b.vx += ((dx / d) * pull - b.vx) * blend;
        b.vy += ((dy / d) * pull - b.vy) * blend;
        b.vz += ((dz / d) * pull - b.vz) * blend;
      }
      this.move(dt, boxAt, toCells(STEP_HEIGHT_M));
    } else if (this.submerged > 0.05) {
      const thrust = toCells(SWIM_THRUST_M_S2);
      b.vx += wx * thrust * dt;
      b.vz += wz * thrust * dt;
      b.vy += (BUOYANCY * this.submerged - GRAVITY) * dt + (input.jump ? toCells(SWIM_UP_M_S2) * dt : 0);
      const flow = currentAt(Math.floor(b.x), Math.floor(b.y + b.height * 0.3), Math.floor(b.z));
      if (flow) {
        const push = toCells(CURRENT_ACCEL_M_S2) * dt;
        b.vx += flow[0] * push;
        b.vy += flow[1] * push;
        b.vz += flow[2] * push;
      }
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const drag = Math.max(0, 1 - WATER_DRAG * speed * dt);
      b.vx *= drag;
      b.vy *= drag;
      b.vz *= drag;
      // Climbing out onto a ledge from the water works like walking up a step.
      this.move(dt, boxAt, toCells(STEP_HEIGHT_M));
    } else {
      this.crouching = input.descend && b.onGround;
      const speed = toCells(input.sprint && !this.crouching ? SPRINT_SPEED_M_S : WALK_SPEED_M_S) * (this.crouching ? CROUCH_FACTOR : 1) * (1 + this.speedBonus);
      const blend = Math.min(1, (b.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt);
      this.tryDash(wx, wz, dt);
      if ((this.dashLeft -= dt) <= 0) {
        b.vx += (wx * speed - b.vx) * blend;
        b.vz += (wz * speed - b.vz) * blend;
      }
      // Crouching never steps off an edge: movement that would leave nothing underfoot stops, per axis.
      if (this.crouching && this.supported(b.x, b.z, boxAt)) {
        if (!this.supported(b.x + b.vx * dt, b.z, boxAt)) b.vx = 0;
        if (!this.supported(b.x, b.z + b.vz * dt, boxAt)) b.vz = 0;
      }
      if (this.onLadder(climbAt)) {
        // On a ladder: walking or jumping climbs, crouching climbs down, otherwise the player holds on.
        const climb = toCells(CLIMB_SPEED_M_S);
        b.vy = input.moveZ !== 0 || input.jump ? climb : input.descend ? -climb : 0;
      } else {
        if ((input.jump || this.jumpBuffer > 0) && this.jumpGrace > 0) {
          b.vy = toCells(JUMP_SPEED_M_S);
          this.jumpGrace = this.jumpBuffer = 0;
          this.jumping = true;
        } else if (pressed && this.jumpGrace <= 0 && this.airJumpsUsed < this.airJumps) {
          b.vy = toCells(JUMP_SPEED_M_S) * AIR_JUMP_FACTOR;
          this.airJumpsUsed++;
          this.jumping = true;
          this.airJumped = true;
        }
        // Releasing jump early cuts the rise short, once per jump.
        if (this.jumping && !input.jump && b.vy > 0) {
          b.vy *= JUMP_CUT;
          this.jumping = false;
        }
        if (b.vy <= 0) this.jumping = false;
        b.vy = Math.max(-toCells(TERMINAL_SPEED_M_S), b.vy - GRAVITY * (b.vy < 0 ? FALL_GRAVITY_FACTOR : 1) * dt);
        if (this.glide && input.jump && b.vy < -toCells(GLIDE_FALL_M_S)) b.vy = -toCells(GLIDE_FALL_M_S);
      }
      this.move(dt, boxAt, toCells(STEP_HEIGHT_M));
    }
    this.stepOffset *= Math.max(0, 1 - dt / STEP_SMOOTH_S);
  }

  private move(dt: number, boxAt: BoxAt, step: number): void {
    const r = moveBody(this.body, dt, boxAt, step);
    this.stepOffset += r.stepped;
  }
}
