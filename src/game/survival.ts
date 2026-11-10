import {
  BURN_PER_S, BURN_S, BREATH_S, MANA_DELAY_S, MANA_PER_S, MAX_MANA, DROWN_PER_S, HUNGER_PER_S, LAVA_PER_S, MAX_HEALTH, MAX_HUNGER, REGEN_HUNGER, REGEN_PER_S, SAFE_FALL_SPEED_M_S,
  SPRINT_HUNGER_PER_S, STARVE_PER_S,
} from '../config';
import { BodyTemperature } from './bodyTemperature';
import { EFFECTS, type Effect } from './effects';

/** Health, hunger and breath, and what changes them. */
export class Survival {
  /** Mana for spells: spent by casting, refilling after a moment's rest. */
  mana = MAX_MANA;
  private sinceCast = 99;
  /** Raised by life crystals, up to twice the starting maximum. */
  maxHealth = MAX_HEALTH;
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
  /** Status effects: seconds left of each. */
  effects: Partial<Record<Effect, number>> = {};

  /** Starts `effect` for `seconds`, or extends it; an antidote keeps poison and bleeding off. */
  addEffect(effect: Effect, seconds: number): void {
    if (this.effects.antidote && (effect === 'poisoned' || effect === 'bleeding')) return;
    this.effects[effect] = Math.max(this.effects[effect] ?? 0, seconds);
  }

  has(effect: Effect): boolean {
    return (this.effects[effect] ?? 0) > 0;
  }

  get dead(): boolean {
    return this.health <= 0;
  }

  /**
   * One step: hunger falls (faster when sprinting), health regenerates when well fed and drains when starving; breath
   * runs out with the head under water, then drowning hurts; lava burns.
   */
  /** Spends `cost` mana if there is that much. */
  cast(cost: number): boolean {
    if (this.mana < cost) return false;
    this.mana -= cost;
    this.sinceCast = 0;
    return true;
  }

  update(dt: number, s: { sprinting: boolean; headInWater: boolean; inLava: boolean; feltC?: number; inFire?: boolean; inWater?: boolean;
    breath?: number; fireproof?: boolean; regen?: number }): void {
    if ((this.sinceCast += dt) > MANA_DELAY_S) this.mana = Math.min(MAX_MANA, this.mana + MANA_PER_S * dt);
    this.hunger = Math.max(0, this.hunger - (HUNGER_PER_S + (s.sprinting ? SPRINT_HUNGER_PER_S : 0)) * this.hungerRate * dt);
    let regen = s.regen ?? 1, blocked = false;
    for (const [key, left] of Object.entries(this.effects) as [Effect, number][]) {
      const e = EFFECTS[key];
      if (e.harm) this.hurt(e.harm * dt, e.cause!);
      if (e.heal) this.health = Math.min(this.maxHealth, this.health + e.heal * dt);
      if (e.regen) regen *= e.regen;
      blocked ||= !!e.stopsRegen;
      if ((this.effects[key] = left - dt) <= 0) delete this.effects[key];
    }
    if (this.hunger >= REGEN_HUNGER && !blocked) this.health = Math.min(this.maxHealth, this.health + REGEN_PER_S * regen * dt);
    if (this.hunger <= 0) this.hurt(STARVE_PER_S * dt, 'starved');
    if (s.headInWater) {
      this.air = Math.max(0, this.air - dt / (s.breath ?? 1));
      if (this.air <= 0) this.hurt(DROWN_PER_S * dt, 'drowned');
    } else this.air = Math.min(BREATH_S, this.air + dt * 3);
    if (s.inLava && !s.fireproof) this.hurt(LAVA_PER_S * dt, 'burned in lava');
    if ((s.inLava || s.inFire) && !s.fireproof) this.burning = BURN_S;
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

  /** A life crystal: two more health for good, and healed by as much. Returns false at the limit. */
  growHeart(): boolean {
    if (this.maxHealth >= MAX_HEALTH * 2) return false;
    this.maxHealth += 2;
    this.health = Math.min(this.maxHealth, this.health + 2);
    return true;
  }

  eat(food: number): boolean {
    if (this.hunger >= MAX_HUNGER) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food);
    return true;
  }

  reset(): void {
    this.health = this.maxHealth;
    this.mana = MAX_MANA;
    this.hunger = MAX_HUNGER;
    this.air = BREATH_S;
    this.temperature.reset();
    this.burning = 0;
  }
}
