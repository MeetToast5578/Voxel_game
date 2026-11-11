/**
 * Status effects on the player: what each does each second while it lasts. Harm and healing are in health points per
 * second. Bites, potions and food start them (`Survival.addEffect`); the HUD lists them with the seconds left.
 */
export interface EffectInfo { name: string; bad?: boolean; harm?: number; cause?: string; stopsRegen?: boolean; regen?: number; heal?: number }

const LIST = {
  poisoned: { name: 'Poisoned', bad: true, harm: 0.4, cause: 'poisoned', stopsRegen: true },
  bleeding: { name: 'Bleeding', bad: true, harm: 0.3, cause: 'bled out', stopsRegen: true },
  slowed: { name: 'Slowed', bad: true },
  potion_sickness: { name: 'Potion sickness', bad: true },
  well_fed: { name: 'Well fed', regen: 1.5 },
  regeneration: { name: 'Regeneration', heal: 0.5 },
  swiftness: { name: 'Swiftness' },
  fire_resistance: { name: 'Fire resistance' },
  water_breathing: { name: 'Water breathing' },
  antidote: { name: 'Antidote' },
  night_vision: { name: 'Night vision' },
} as const satisfies Record<string, EffectInfo>;

export type Effect = keyof typeof LIST;
export const EFFECTS: Readonly<Record<Effect, EffectInfo>> = LIST;
export const isEffect = (key: string): key is Effect => key in EFFECTS;

/** Speed bonus from Swiftness, and the share of speed Slowed takes away. */
export const SWIFT_SPEED = 0.3;
export const SLOWED_SPEED = -0.35;
/** Seconds of Potion sickness after a healing potion: no second one until it wears off. */
export const POTION_SICKNESS_S = 30;
