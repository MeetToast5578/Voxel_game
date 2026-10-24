import { CREATURE_CAP_GROUPS, CREATURE_CAP_RADIUS, HOSTILE_CAP, BIRD_ALTITUDE } from '../config';
import type { Creature } from './creatures';
import { SPECIES, type Species } from './species';

/** The wildlife that can live in a biome (T-H7). Hostiles spawn by darkness, not biome. */
export function speciesFor(biome: string): Species[] {
  return SPECIES.filter((s) => !s.hostile && s.biomes.includes(biome));
}

/** True when another group of `species` fits under its population cap (T-H8) around (x, z). */
export function underCap(all: readonly Creature[], species: Species, x: number, z: number): boolean {
  const near = all.filter((c) => c.species === species && (c.x - x) ** 2 + (c.z - z) ** 2 < CREATURE_CAP_RADIUS ** 2).length;
  return near + species.group[1] <= (species.hostile ? HOSTILE_CAP : species.group[1] * CREATURE_CAP_GROUPS);
}

export interface SpawnSpot {
  /** Feet position of the group's first member. */
  x: number; y: number; z: number;
  biome: string;
  /** The ground there is water (fish) rather than land. */
  water: boolean;
}

/**
 * Picks the species and members of a group for a spot: land wildlife on land, fish in water, birds high above ground.
 * Returns the species and feet positions, or null when nothing lives there or the cap is reached.
 */
export function planGroup(all: readonly Creature[], spot: SpawnSpot, rand: () => number): { species: Species; at: { x: number; y: number; z: number }[] } | null {
  const options = speciesFor(spot.biome).filter((s) => (s.medium === 'water') === spot.water);
  if (!options.length) return null;
  const species = options[Math.floor(rand() * options.length)]!;
  if (!underCap(all, species, spot.x, spot.z)) return null;
  const n = species.group[0] + Math.floor(rand() * (species.group[1] - species.group[0] + 1));
  const lift = species.medium === 'air' ? BIRD_ALTITUDE : species.medium === 'water' ? -1.5 : 0;
  const at = Array.from({ length: n }, () => ({ x: spot.x + (rand() - 0.5) * 4, y: spot.y + lift, z: spot.z + (rand() - 0.5) * 4 }));
  return { species, at };
}
