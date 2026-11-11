import { BLOCKS } from '../engine/blocks';

/** What a weapon's modifier changes: damage and knockback factors, extra crit chance, swing speed factor. */
export interface Modifier { name: string; damage?: number; knock?: number; crit?: number; speed?: number }

/** Modifiers in a fixed order (saves store the index + 1); the last is a bad one. */
export const MODIFIERS: readonly (readonly [key: string, mod: Modifier, weight: number])[] = [
  ['keen', { name: 'Keen', crit: 0.1 }, 3],
  ['heavy', { name: 'Heavy', knock: 1.5, damage: 1.05 }, 3],
  ['swift', { name: 'Swift', speed: 1.25 }, 3],
  ['mighty', { name: 'Mighty', damage: 1.15 }, 2],
  ['dull', { name: 'Dull', damage: 0.85 }, 2],
];
const TOTAL = MODIFIERS.reduce((s, [, , w]) => s + w, 0);
const WEAPONS = new Set(['sword', 'axe', 'spear', 'hammer']);

/** Whether a state is a weapon that takes a modifier. */
export const takesModifier = (state: number): boolean => WEAPONS.has(BLOCKS.type(state).tool?.kind ?? '');
/** A random modifier, by weight. */
export function rollModifier(rand: () => number): string {
  let r = rand() * TOTAL;
  for (const [key, , w] of MODIFIERS) if ((r -= w) < 0) return key;
  return MODIFIERS[0]![0];
}
export const modifierOf = (key: string | undefined): Modifier | undefined => MODIFIERS.find(([k]) => k === key)?.[1];
/** For saving: 0 for none, else the modifier's place + 1; and back. */
export const modIndex = (key: string | undefined): number => MODIFIERS.findIndex(([k]) => k === key) + 1;
export const modFromIndex = (i: unknown): string | undefined => (typeof i === 'number' && i >= 1 ? MODIFIERS[Math.floor(i) - 1]?.[0] : undefined);
