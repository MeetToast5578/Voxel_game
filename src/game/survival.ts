import {
  BURN_PER_S, BURN_S, BREATH_S, DROWN_PER_S, HUNGER_PER_S, LAVA_PER_S, MAX_HEALTH, MAX_HUNGER, REGEN_HUNGER, REGEN_PER_S, SAFE_FALL_SPEED_M_S,
  SPRINT_HUNGER_PER_S, STARVE_PER_S,
} from '../config';
import { BodyTemperature } from './bodyTemperature';

/** Health, hunger and breath, and what changes them. */
export class Survival {
  health = MAX_HEALTH;
  hunger = MAX_HUNGER;
  /** Seconds of breath left under water. */
  air = BREATH_S;
  /** Last cause of damage, for the death message. */
  cause = '';
  /** How fast hunger drains, from the difficulty. */
  hungerRate = 1;
  readonly temperature = new BodyTemperature();
  /** Seconds the player keeps burning after touching lava or fire; water puts it out. */
  burning = 0;
  /** The temperature the player last felt, for the HUD. */
  feltC = 20;

  get dead(): boolean {
    return this.health <= 0;
  }

  /**
   * One step: hunger falls (faster when sprinting), health regenerates when well fed and drains when starving; breath
   * runs out with the head under water, then drowning hurts; lava burns.
   */
  update(dt: number, s: { sprinting: boolean; headInWater: boolean; inLava: boolean; feltC?: number; inFire?: boolean; inWater?: boolean }): void {
    this.hunger = Math.max(0, this.hunger - (HUNGER_PER_S + (s.sprinting ? SPRINT_HUNGER_PER_S : 0)) * this.hungerRate * dt);
    if (this.hunger >= REGEN_HUNGER) this.health = Math.min(MAX_HEALTH, this.health + REGEN_PER_S * dt);
    if (this.hunger <= 0) this.hurt(STARVE_PER_S * dt, 'starved');
    if (s.headInWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) this.hurt(DROWN_PER_S * dt, 'drowned');
    } else this.air = Math.min(BREATH_S, this.air + dt * 3);
    if (s.inLava) this.hurt(LAVA_PER_S * dt, 'burned in lava');
    if (s.inLava || s.inFire) this.burning = BURN_S;
    if (s.inWater || s.headInWater) this.burning = 0;
    if (this.burning > 0) {
      this.burning = Math.max(0, this.burning - dt);
      this.hurt(BURN_PER_S * dt, 'burned to death');
    }
    if (s.feltC !== undefined) {
      this.feltC = s.feltC;
      const t = this.temperature.update(dt, s.feltC);
      if (t.damage > 0) this.hurt(t.damage, t.cause);
    }
  }

  /** Damage from landing at `speedM_S` (meters per second, downwards). */
  land(speedM_S: number): void {
    if (speedM_S > SAFE_FALL_SPEED_M_S) this.hurt(speedM_S - SAFE_FALL_SPEED_M_S, 'fell');
  }

  hurt(amount: number, cause: string): void {
    this.health = Math.max(0, this.health - amount);
    this.cause = cause;
  }

  eat(food: number): boolean {
    if (this.hunger >= MAX_HUNGER) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food);
    return true;
  }

  reset(): void {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.air = BREATH_S;
    this.temperature.reset();
    this.burning = 0;
  }
}
