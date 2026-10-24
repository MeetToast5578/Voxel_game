import {
  CHUNK_SIZE, CREATURE_REPOPULATE_S, CREATURE_SPAWN_CHANCE, DARK_LIGHT, HOSTILE_DESPAWN, HOSTILE_SPAWN_MAX, HOSTILE_SPAWN_MIN,
  HOSTILE_SPAWN_S, metersToBlocks,
} from '../config';
import { columnKey } from '../core/coords';
import { mulberry32 } from '../core/random';
import { BLOCK_REGISTRY, isSolid, isWaterState } from '../world/blocks';
import { CreatureSystem, type Creature, type SavedCreature } from './creatures';
import { planGroup, underCap } from './spawning';
import { SPECIES } from './species';

/** What population control reads from the world. */
export interface PopulationWorld {
  seed: number;
  columnKeys(): string[];
  topAt(x: number, z: number): number | undefined;
  getBlock(x: number, y: number, z: number): number;
  isLoadedAt(x: number, y: number, z: number): boolean;
  biomeAt(x: number, y: number, z: number): string;
}

const HOSTILES = SPECIES.filter((s) => s.hostile);
const BIRDS = SPECIES.filter((s) => s.medium === 'air');
const LIGHT_SCAN = 6; // cells around a dark spawn spot checked for light sources

const columnOf = (x: number, z: number) => columnKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));

/**
 * Where creatures live while their column is loaded or not (T-H2), and how they come and go (T-H7..T-H9): each column
 * gets its wildlife once, when first seen; creatures of a column that unloads are stored and come back with it;
 * wildlife slowly repopulates near the player under the caps; hostiles appear at night or in the dark and leave by day.
 */
export class CreaturePopulation {
  private readonly stored = new Map<string, SavedCreature[]>();
  private readonly populated = new Set<string>();
  private active = new Set<string>();
  private repopulateS = CREATURE_REPOPULATE_S;
  private hostileS = HOSTILE_SPAWN_S;

  load(creatures: readonly SavedCreature[], populated: readonly string[]): void {
    for (const c of creatures) {
      const key = columnOf(c.x, c.z);
      this.stored.set(key, [...(this.stored.get(key) ?? []), c]);
    }
    for (const key of populated) this.populated.add(key);
  }

  /** Every non-hostile creature, live or stored, and the columns already populated, for the save. */
  snapshot(system: CreatureSystem): { creatures: SavedCreature[]; populated: string[] } {
    const live = system.all().filter((c) => !c.species.hostile).map(CreatureSystem.save);
    return { creatures: [...live, ...[...this.stored.values()].flat()], populated: [...this.populated] };
  }

  /** Called about once a second: stores and restores creatures with their columns, then spawns and despawns. */
  update(dt: number, system: CreatureSystem, world: PopulationWorld, player: { x: number; y: number; z: number }, night: boolean, rand: () => number): void {
    const current = new Set(world.columnKeys());
    for (const c of system.all()) {
      const key = columnOf(c.x, c.z);
      const far = c.species.hostile && (c.x - player.x) ** 2 + (c.z - player.z) ** 2 > HOSTILE_DESPAWN ** 2;
      const sunlit = c.species.hostile && !night && (world.topAt(Math.floor(c.x), Math.floor(c.z)) ?? Infinity) <= c.y;
      if (far || sunlit) { system.remove(c.id); continue; }
      if (current.has(key)) continue;
      system.remove(c.id);
      if (!c.species.hostile) this.stored.set(key, [...(this.stored.get(key) ?? []), CreatureSystem.save(c)]);
    }
    for (const key of current) {
      if (this.active.has(key)) continue;
      for (const saved of this.stored.get(key) ?? []) system.restore(saved, rand);
      this.stored.delete(key);
      if (!this.populated.has(key)) {
        this.populated.add(key);
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        const r = mulberry32((world.seed * 73856093) ^ (cx * 19349663) ^ (cz * 83492791));
        if (r() < CREATURE_SPAWN_CHANCE) this.spawnGroup(system, world, cx, cz, r);
      }
    }
    this.active = current;
    if ((this.repopulateS -= dt) <= 0) {
      this.repopulateS = CREATURE_REPOPULATE_S;
      const keys = [...current].filter((k) => {
        const [cx, cz] = k.split(',').map(Number) as [number, number];
        return Math.hypot((cx + 0.5) * CHUNK_SIZE - player.x, (cz + 0.5) * CHUNK_SIZE - player.z) > metersToBlocks(20);
      });
      const key = keys[Math.floor(rand() * keys.length)];
      if (key) {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        this.spawnGroup(system, world, cx, cz, rand);
      }
    }
    if ((this.hostileS -= dt) <= 0) {
      this.hostileS = HOSTILE_SPAWN_S;
      this.spawnHostile(system, world, player, night, rand);
    }
  }

  /** A wildlife group somewhere in column (cx, cz), by its biome; birds over land now and then. */
  spawnGroup(system: CreatureSystem, world: PopulationWorld, cx: number, cz: number, rand: () => number): number {
    const x = cx * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE), z = cz * CHUNK_SIZE + Math.floor(rand() * CHUNK_SIZE);
    const top = world.topAt(x, z);
    if (top === undefined || !world.isLoadedAt(x, top, z)) return 0;
    const water = isWaterState(world.getBlock(x, top, z));
    const biome = world.biomeAt(x, top, z);
    const plan = planGroup(system.all(), { x: x + 0.5, y: top + 1, z: z + 0.5, biome, water }, rand);
    const bird = !water && rand() < 0.15 ? BIRDS[0] : undefined;
    if (bird && bird.biomes.includes(biome) && underCap(system.all(), bird, x, z)) {
      for (let i = 0; i < bird.group[0]; i++) system.spawn(bird, x + rand() * 4, top + 1 + metersToBlocks(18), z + rand() * 4, rand);
    }
    if (!plan) return 0;
    for (const at of plan.at) system.spawn(plan.species, at.x, at.y, at.z, rand);
    return plan.at.length;
  }

  /**
   * One hostile (T-H9) in a ring around the player, on ground in darkness: under the night sky, or under cover with no
   * light source nearby. Shortcut: darkness is judged from the sky and nearby emitters, not the mesher's light values.
   */
  spawnHostile(system: CreatureSystem, world: PopulationWorld, player: { x: number; y: number; z: number }, night: boolean, rand: () => number): Creature | null {
    const species = HOSTILES[Math.floor(rand() * HOSTILES.length)];
    if (!species || !underCap(system.all(), species, player.x, player.z)) return null;
    const a = rand() * Math.PI * 2, d = HOSTILE_SPAWN_MIN + rand() * (HOSTILE_SPAWN_MAX - HOSTILE_SPAWN_MIN);
    const x = Math.floor(player.x + Math.cos(a) * d), z = Math.floor(player.z + Math.sin(a) * d);
    const top = world.topAt(x, z);
    if (top === undefined) return null;
    // Try the surface at night, else a cave floor near the player's height.
    for (const y0 of [top + 1, Math.floor(player.y)]) {
      for (let y = y0; y > y0 - 8; y--) {
        if (!world.isLoadedAt(x, y, z)) break;
        const floor = isSolid(world.getBlock(x, y - 1, z));
        const room = [0, 1, 2, 3, 4, 5].every((h) => !isSolid(world.getBlock(x, y + h, z)) && !isWaterState(world.getBlock(x, y + h, z)));
        if (!floor || !room) continue;
        const open = top < y;
        if (open ? !night : nearLight(world, x, y, z)) break;
        return system.spawn(species, x + 0.5, y, z + 0.5, rand);
      }
    }
    return null;
  }
}

function nearLight(world: PopulationWorld, x: number, y: number, z: number): boolean {
  for (let dx = -LIGHT_SCAN; dx <= LIGHT_SCAN; dx++) for (let dy = -LIGHT_SCAN; dy <= LIGHT_SCAN; dy++) for (let dz = -LIGHT_SCAN; dz <= LIGHT_SCAN; dz++) {
    if (BLOCK_REGISTRY.lightEmission(world.getBlock(x + dx, y + dy, z + dz)) >= DARK_LIGHT) return true;
  }
  return false;
}
