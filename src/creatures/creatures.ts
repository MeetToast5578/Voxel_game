import {
  BREED_COOLDOWN_S, FED_S, FOLLOW_M, GROW_UP_S, ARCHER_FAR_M, ARCHER_NEAR_M, ARCHER_SHOT_S, ATTACK_COOLDOWN_S, ATTACK_REACH_M, BLOCK_SIZE_M, BURN_PER_S, BURN_S, DEPTH_TOUGHNESS_PER_100M, SAFE_LIGHT, CREATURE_CAP, CREATURE_FALL_M, DESPAWN_M, FLEE_M, GRAVITY_M_S2, HOSTILE_CAP, HUNT_M,
  KNOCKBACK_M_S, RUN_FACTOR, SPAWN_INTERVAL_S, SPAWN_MAX_M, SPAWN_MIN_M, STEP_HEIGHT_M, cells, toCells,
} from '../config';
import { columnIndex, localIndex, toChunk, toLocal } from '../core/coords';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import type { BoxAt } from '../game/collision';
import { moveBody, type Body } from '../game/physics';
import { biomeByIndex } from '../worldgen/biomes';
import { findPath } from './pathfinding';
import { SPECIES, SPECIES_BY_KEY, type Species } from './species';

export type Mode = 'wander' | 'idle' | 'flee' | 'hunt' | 'sleep' | 'follow';

export interface Creature {
  id: number;
  species: Species;
  body: Body;
  yaw: number;
  health: number;
  mode: Mode;
  goal: [number, number] | null;
  target: Creature | 'player' | null;
  /** Seconds until the next decision, and until the next bite. */
  think: number;
  cooldown: number;
  /** Walk cycle phase, and a short red flash after being hit. */
  walk: number;
  hurt: number;
  /** Seconds it keeps burning after touching lava or fire. */
  burning: number;
  /** Seconds it is ready to breed after being fed (negative: seconds before it can be fed again). */
  fed: number;
  /** Seconds until a young one is grown (0: grown). */
  young: number;
  /** While hunting on land: cells to walk through (flat x, y, z), and seconds until it is planned again. */
  path: number[];
  replan: number;
}

/** What creatures need to know about the world and the player each tick. */
export interface CreatureContext {
  player: Body;
  /** Survival: hostiles hunt the player and bites hurt. */
  survival: boolean;
  day: boolean;
  /** Share of the hostile cap that may be alive, from the difficulty: 0 keeps hostiles away entirely. */
  hostiles: number;
  /** The item type the player holds, if any: animals that eat it follow. */
  playerHolds?: string | null;
  boxAt: BoxAt;
  waterAt: (x: number, y: number, z: number) => boolean;
}

const GRAVITY = toCells(GRAVITY_M_S2);
const STEP = cells(STEP_HEIGHT_M);
const FALL = cells(CREATURE_FALL_M);
const THINK_S = 0.25;
/** Seconds between path plans while hunting, and the search budget of one plan. */
const REPLAN_S = 1;
const PATH_NODES = 300;

/**
 * Wildlife and monsters: spawning around the player by biome and time of day, simple minds (wander, graze, herd,
 * flee, hunt, sleep), physics shared with the player, bites and being hit. Ported from the old game, in meters.
 */
export class Creatures {
  readonly list: Creature[] = [];
  private nextId = 1;
  private spawnIn = 0;

  constructor(private readonly world: World, private readonly rand: () => number,
    private readonly events: {
      bite(damage: number, by: string): void;
      sound(name: 'break' | 'place' | 'step', volume: number): void;
      /** A creature calls, is hurt or dies (for its sound). */
      call?(c: Creature, kind: 'call' | 'hurt' | 'death'): void;
      /** A ranged creature shoots at the player from (x, y, z). */
      shoot?(c: Creature, x: number, y: number, z: number): void;
    }) {}

  update(dt: number, ctx: CreatureContext): void {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = SPAWN_INTERVAL_S;
      this.spawn(ctx);
    }
    const p = ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]!;
      const d = Math.hypot(c.body.x - p.x, c.body.z - p.z);
      // Out of range, a monster caught far away by daylight, or any monster when the difficulty allows none: gone.
      if (d > toCells(DESPAWN_M) || (c.species.hostile && ((ctx.day && !c.species.guardian && d > toCells(SPAWN_MIN_M) && this.rand() < dt * 0.2) || ctx.hostiles <= 0))) {
        this.list.splice(i, 1);
        continue;
      }
      if (!this.world.isLoaded(Math.floor(c.body.x), Math.floor(c.body.y), Math.floor(c.body.z))) continue;
      c.think -= dt;
      c.cooldown -= dt;
      c.hurt = Math.max(0, c.hurt - dt);
      if (c.think <= 0) {
        c.think = THINK_S * (0.8 + this.rand() * 0.4);
        this.decide(c, ctx);
      }
      this.move(c, dt, ctx);
      this.grow(c, dt);
      if (c.mode !== 'sleep' && this.rand() < dt / 20) this.events.call?.(c, 'call');
      if (this.burn(c, dt, ctx)) {
        this.events.call?.(c, 'death');
        this.list.splice(this.list.indexOf(c), 1);
      }
    }
  }

  private active(c: Creature, ctx: CreatureContext): boolean {
    if (c.species.guardian) return true;
    if (c.species.hostile) return !ctx.day || this.light(c) < 7;
    return c.species.nocturnal ? !ctx.day : ctx.day;
  }

  private light(c: Creature): number {
    const x = Math.floor(c.body.x), y = Math.floor(c.body.y + 0.5), z = Math.floor(c.body.z);
    const chunk = this.world.chunkAt(x, y, z);
    if (!chunk) return 15;
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    return Math.max(chunk.skyLight(i), chunk.blockLight(i));
  }

  /** Picks what to do: flee a threat, hunt prey, keep with the herd, wander or rest. */
  private decide(c: Creature, ctx: CreatureContext): void {
    const s = c.species, b = c.body, p = ctx.player;
    if (!this.active(c, ctx) && c.mode !== 'flee') {
      c.mode = 'sleep';
      c.goal = null;
      return;
    }
    const near = (x: number, z: number, m: number) => Math.hypot(x - b.x, z - b.z) < toCells(m);
    // Animals come to a player holding their food (instead of running away), and wait close by.
    if (s.food && ctx.playerHolds && s.food.includes(ctx.playerHolds) && near(p.x, p.z, FOLLOW_M)) {
      c.mode = near(p.x, p.z, 1.5) ? 'idle' : 'follow';
      c.goal = [p.x, p.z];
      return;
    }
    // Fed animals look for a mate.
    if (c.fed > 0) {
      const mate = this.list.find((o) => o !== c && o.species === s && o.fed > 0 && near(o.body.x, o.body.z, 10));
      if (mate) {
        c.mode = 'follow';
        c.goal = [mate.body.x, mate.body.z];
        return;
      }
    }
    // Grazers flee the player and predators.
    if (s.grazer) {
      const threat = near(p.x, p.z, FLEE_M) ? p : this.list.find((o) => o.species.prey.includes(s.key) && near(o.body.x, o.body.z, FLEE_M))?.body;
      if (threat) {
        const dx = b.x - threat.x, dz = b.z - threat.z, len = Math.hypot(dx, dz) || 1;
        c.mode = 'flee';
        c.goal = [b.x + (dx / len) * toCells(10), b.z + (dz / len) * toCells(10)];
        return;
      }
    }
    // Hunters chase the nearest prey (monsters: the player in survival).
    if (s.hostile && ctx.survival && near(p.x, p.z, HUNT_M)) {
      c.mode = 'hunt';
      c.target = 'player';
      return;
    }
    if (s.prey.length) {
      const prey = this.list.find((o) => s.prey.includes(o.species.key) && near(o.body.x, o.body.z, HUNT_M));
      if (prey) {
        c.mode = 'hunt';
        c.target = prey;
        return;
      }
    }
    c.target = null;
    if (c.mode === 'flee' || c.mode === 'hunt' || !c.goal || near(c.goal[0], c.goal[1], 0.8) || this.rand() < 0.05) {
      if (this.rand() < 0.35) {
        c.mode = 'idle';
        c.goal = null;
        return;
      }
      let gx = b.x + (this.rand() - 0.5) * toCells(16), gz = b.z + (this.rand() - 0.5) * toCells(16);
      if (s.herds) {
        // Keep near the others of the herd.
        const herd = this.list.filter((o) => o !== c && o.species === s && near(o.body.x, o.body.z, 12));
        if (herd.length) {
          gx = (gx + herd.reduce((a, o) => a + o.body.x, 0) / herd.length) / 2;
          gz = (gz + herd.reduce((a, o) => a + o.body.z, 0) / herd.length) / 2;
        }
      }
      c.mode = 'wander';
      c.goal = [gx, gz];
    }
  }

  /** The next cell centre on a path to `t`, planned again every second (around walls, up ledges); null if none. */
  private waypoint(c: Creature, t: { x: number; y: number; z: number }, dt: number, ctx: CreatureContext): [number, number] | null {
    const b = c.body;
    c.replan -= dt;
    if (c.replan <= 0) {
      c.replan = REPLAN_S;
      const solid = (x: number, y: number, z: number) => ctx.boxAt(x, y, z) !== 0;
      c.path = findPath(solid, Math.floor(b.x), Math.floor(b.y + 0.01), Math.floor(b.z), Math.floor(t.x), Math.floor(t.y + 0.01),
        Math.floor(t.z), { height: Math.ceil(b.height), step: STEP, fall: FALL - 1, maxNodes: PATH_NODES });
    }
    // Drop the cells already reached.
    while (c.path.length >= 3 && Math.abs(c.path[0]! + 0.5 - b.x) < 0.45 && Math.abs(c.path[2]! + 0.5 - b.z) < 0.45) c.path.splice(0, 3);
    return c.path.length >= 3 ? [c.path[0]! + 0.5, c.path[2]! + 0.5] : null;
  }

  private move(c: Creature, dt: number, ctx: CreatureContext): void {
    const s = c.species, b = c.body;
    let speed = toCells(s.speedM_S);
    let goal = c.goal;
    if (c.mode === 'hunt' && c.target && s.ranged && c.target === 'player') {
      // Archers keep between the near and far distance, and shoot when they can see the player.
      const t = ctx.player, d = Math.hypot(t.x - b.x, t.z - b.z);
      goal = d < toCells(ARCHER_NEAR_M) ? [b.x - (t.x - b.x), b.z - (t.z - b.z)] : d > toCells(ARCHER_FAR_M) ? this.waypoint(c, t, dt, ctx) ?? [t.x, t.z] : null;
      c.yaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
      const eye = b.y + b.height * 0.85;
      if (c.cooldown <= 0 && d < toCells(ARCHER_FAR_M + 4) && this.sees(b.x, eye, b.z, t.x, t.y + t.height * 0.8, t.z, ctx)) {
        c.cooldown = ARCHER_SHOT_S;
        this.events.shoot?.(c, b.x, eye, b.z);
      }
    } else if (c.mode === 'hunt' && c.target) {
      const t = c.target === 'player' ? ctx.player : c.target.body;
      goal = [t.x, t.z];
      if (s.medium === 'land' && !s.climbs) goal = this.waypoint(c, t, dt, ctx) ?? goal;
      const reach = toCells(ATTACK_REACH_M) + b.halfWidth + t.halfWidth;
      if (Math.hypot(t.x - b.x, t.z - b.z) < reach && Math.abs(t.y - b.y) < b.height && c.cooldown <= 0) {
        c.cooldown = ATTACK_COOLDOWN_S;
        if (c.target === 'player') this.events.bite(s.attack, s.name);
        else this.damage(c.target, s.attack, b.x, b.z);
      }
    }
    else if (goal && s.medium === 'land' && (c.mode === 'flee' || c.mode === 'wander' || c.mode === 'follow')) {
      // Walking somewhere: along a path round walls and up ledges, when one is found.
      goal = this.waypoint(c, { x: goal[0], y: b.y, z: goal[1] }, dt, ctx) ?? goal;
    }
    if (c.mode === 'flee' || c.mode === 'hunt') speed *= RUN_FACTOR;
    let vx = 0, vz = 0, climbing = false;
    if (goal && c.mode !== 'sleep' && c.mode !== 'idle') {
      const dx = goal[0] - b.x, dz = goal[1] - b.z, len = Math.hypot(dx, dz);
      if (len > 0.3) {
        vx = (dx / len) * speed;
        vz = (dz / len) * speed;
        c.yaw = Math.atan2(-vx, -vz);
        // Look one cell ahead: no walking into water (land animals), off a cliff, or at a wall too high to step.
        const ax = Math.floor(b.x + (dx / len) * (b.halfWidth + 0.6)), az = Math.floor(b.z + (dz / len) * (b.halfWidth + 0.6));
        const fy = Math.floor(b.y);
        let ground = fy;
        while (ground > fy - FALL - 1 && ctx.boxAt(ax, ground - 1, az) === 0 && !ctx.waterAt(ax, ground - 1, az)) ground--;
        const wall = ctx.boxAt(ax, fy + STEP, az) !== 0 && ctx.boxAt(ax, fy, az) !== 0;
        // Climbers go up anything in front of their feet, until over the top.
        climbing = !!s.climbs && ctx.boxAt(ax, fy, az) !== 0;
        const blocked = s.medium === 'land' && ((ctx.waterAt(ax, fy, az) && c.mode !== 'flee') || (ground <= fy - FALL && !s.climbs) || (wall && !s.climbs));
        if (blocked) {
          vx = vz = 0;
          c.goal = null;
          c.think = Math.min(c.think, 0.1);
        }
      }
    }
    b.vx += (vx - b.vx) * Math.min(1, dt * 8);
    b.vz += (vz - b.vz) * Math.min(1, dt * 8);
    const inWater = ctx.waterAt(Math.floor(b.x), Math.floor(b.y + b.height * 0.5), Math.floor(b.z));
    if (s.medium === 'water') {
      if (inWater) {
        // Fish swim level, drifting up and down a little.
        b.vy += ((Math.sin(c.walk * 0.7) * 0.5) - b.vy) * Math.min(1, dt * 4);
        if (!c.goal || this.rand() < dt * 0.3) c.goal = [b.x + (this.rand() - 0.5) * 8, b.z + (this.rand() - 0.5) * 8];
      } else {
        b.vy -= GRAVITY * dt;
        if (b.onGround && this.rand() < dt) this.damage(c, 1, b.x, b.z);
      }
    } else if (inWater) b.vy += (toCells(1.5) - b.vy) * Math.min(1, dt * 3); // float up and swim
    else if (climbing) b.vy = toCells(2);
    else b.vy -= GRAVITY * dt;
    // Up a step when walking into one.
    const before = b.x + b.z;
    moveBody(b, dt, ctx.boxAt, s.medium === 'land' ? STEP : 0);
    if (s.medium === 'land' && (vx !== 0 || vz !== 0) && Math.abs(b.x + b.z - before) < 1e-4 && b.onGround) b.vy = toCells(5.5);
    c.walk += Math.hypot(b.vx, b.vz) * dt * 3;
  }

  /** Feeds an animal its food: it is ready to breed for a while. Returns whether it took the food. */
  feed(c: Creature): boolean {
    if (c.young > 0 || c.fed !== 0 || !c.species.food) return false;
    c.fed = FED_S;
    return true;
  }

  /** Fed animals that meet make a young one (within the cap); young ones grow up. */
  private grow(c: Creature, dt: number): void {
    if (c.young > 0 && (c.young -= dt) <= 0) {
      c.young = 0;
      c.body.halfWidth = toCells(c.species.halfWidthM);
      c.body.height = toCells(c.species.heightM);
    }
    if (c.fed < 0) c.fed = Math.min(0, c.fed + dt);
    if (c.fed <= 0) return;
    if ((c.fed -= dt) <= 0) {
      c.fed = 0;
      return;
    }
    const mate = this.list.find((o) => o !== c && o.species === c.species && o.fed > 0 && Math.hypot(o.body.x - c.body.x, o.body.z - c.body.z) < 2.5);
    if (!mate) return;
    c.fed = mate.fed = -BREED_COOLDOWN_S;
    if (this.list.length >= CREATURE_CAP) return;
    const baby = this.add(c.species, (c.body.x + mate.body.x) / 2, c.body.y + 0.5, (c.body.z + mate.body.z) / 2, c.species.health);
    baby.young = GROW_UP_S;
    baby.body.halfWidth /= 2;
    baby.body.height /= 2;
    this.events.call?.(baby, 'call');
  }

  /** Lava and campfires set a creature alight and water puts it out; returns whether it burned to death. */
  private burn(c: Creature, dt: number, ctx: CreatureContext): boolean {
    if (c.species.guardian) return false;
    const b = c.body, key = BLOCKS.type(this.world.get(Math.floor(b.x), Math.floor(b.y + 0.1), Math.floor(b.z))).key;
    if (key === 'lava' || key === 'flowing_lava' || key === 'campfire') c.burning = BURN_S;
    if (ctx.waterAt(Math.floor(b.x), Math.floor(b.y + b.height * 0.5), Math.floor(b.z))) c.burning = 0;
    if (c.burning <= 0) return false;
    c.burning -= dt;
    c.health -= BURN_PER_S * 2 * dt;
    c.hurt = Math.max(c.hurt, 0.1);
    return c.health <= 0;
  }

  /** Whether nothing solid stands on the straight line between two points (sampled every half cell). */
  private sees(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, ctx: CreatureContext): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      if (ctx.boxAt(Math.floor(x0 + (x1 - x0) * f), Math.floor(y0 + (y1 - y0) * f), Math.floor(z0 + (z1 - z0) * f)) !== 0) return false;
    }
    return true;
  }

  /** Hurts a creature, knocking it away from (fromX, fromZ); returns whether it died (and was removed). */
  damage(c: Creature, amount: number, fromX: number, fromZ: number): boolean {
    c.health -= amount;
    c.hurt = 0.3;
    const dx = c.body.x - fromX, dz = c.body.z - fromZ, len = Math.hypot(dx, dz) || 1;
    c.body.vx = (dx / len) * toCells(KNOCKBACK_M_S);
    c.body.vz = (dz / len) * toCells(KNOCKBACK_M_S);
    c.body.vy = toCells(3);
    if (c.species.grazer) {
      c.mode = 'flee';
      c.goal = [c.body.x + (dx / len) * toCells(12), c.body.z + (dz / len) * toCells(12)];
    }
    if (c.health > 0) {
      this.events.call?.(c, 'hurt');
      return false;
    }
    this.events.call?.(c, 'death');
    this.list.splice(this.list.indexOf(c), 1);
    return true;
  }

  /** The creature a ray hits first within `reach` cells, and how far along. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number): { creature: Creature; distance: number } | null {
    let best: { creature: Creature; distance: number } | null = null;
    for (const c of this.list) {
      const b = c.body;
      const lo = [b.x - b.halfWidth, b.y, b.z - b.halfWidth], hi = [b.x + b.halfWidth, b.y + b.height, b.z + b.halfWidth];
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let near = 0, far = reach;
      for (let a = 0; a < 3 && near <= far; a++) {
        if (d[a] === 0) {
          if (o[a]! < lo[a]! || o[a]! > hi[a]!) far = -1;
          continue;
        }
        let t0 = (lo[a]! - o[a]!) / d[a]!, t1 = (hi[a]! - o[a]!) / d[a]!;
        if (t0 > t1) [t0, t1] = [t1, t0];
        near = Math.max(near, t0);
        far = Math.min(far, t1);
      }
      if (near <= far && (!best || near < best.distance)) best = { creature: c, distance: near };
    }
    return best;
  }

  /** Block light and sky light at a cell (0 where nothing is loaded). */
  private lightAt(x: number, y: number, z: number): [sky: number, block: number] {
    const chunk = this.world.chunkAt(x, y, z);
    if (!chunk) return [0, 15];
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    return [chunk.skyLight(i), chunk.blockLight(i)];
  }

  /**
   * Adds a group of a species fitting a random spot near the player: on the surface, or (when the player is under
   * ground) in a cave around them. Monsters only come where it is dark and never where torches light the cell, and the
   * deeper they come the tougher they are.
   */
  private spawn(ctx: CreatureContext): void {
    if (this.list.length >= CREATURE_CAP) return;
    const p = ctx.player;
    const angle = this.rand() * Math.PI * 2, dist = toCells(SPAWN_MIN_M + this.rand() * (SPAWN_MAX_M - SPAWN_MIN_M));
    const x = Math.floor(p.x + Math.cos(angle) * dist), z = Math.floor(p.z + Math.sin(angle) * dist);
    const column = this.world.column(toChunk(x), toChunk(z));
    if (!column) return;
    const i = columnIndex(toLocal(x), toLocal(z));
    const top = column.surface[i]!;
    const playerColumn = this.world.column(toChunk(Math.floor(p.x)), toChunk(Math.floor(p.z)));
    const playerUnder = playerColumn !== undefined && p.y < playerColumn.surface[columnIndex(toLocal(Math.floor(p.x)), toLocal(Math.floor(p.z)))]! - 6;
    const hostiles = this.list.filter((c) => c.species.hostile).length, room = hostiles < HOSTILE_CAP * ctx.hostiles;
    if (playerUnder && this.rand() < 0.7) {
      if (room) this.spawnInCave(x, z, p, ctx);
      return;
    }
    const water = column.water[i]! > top + 1;
    const y = water ? column.water[i]! - 2 : top + 1;
    if (!this.world.isLoaded(x, y, z) || (!water && ctx.boxAt(x, y, z) !== 0)) return;
    const biome = biomeByIndex(column.biome[i]!).key;
    const [sky, block] = this.lightAt(x, y, z);
    const dark = (sky < 7 || !ctx.day) && block < SAFE_LIGHT;
    const options = SPECIES.filter((s) => (water ? s.medium === 'water' : s.medium === 'land' && (s.hostile
      ? room && dark && (s.biomes.includes('dark') || s.biomes.includes(biome))
      : s.biomes.includes(biome))));
    this.spawnGroup(options, x, y, z);
  }

  /** A monster in a dark cave cell near (x, z), within a few meters up or down of the player. */
  private spawnInCave(x: number, z: number, p: Body, ctx: CreatureContext): void {
    let y = Math.floor(p.y + (this.rand() - 0.5) * toCells(16));
    // Down to a floor with room to stand on it.
    for (let k = 0; k < 16 && ctx.boxAt(x, y - 1, z) === 0; k++) y--;
    if (!this.world.isLoaded(x, y, z) || ctx.boxAt(x, y - 1, z) === 0) return;
    for (let h = 0; h < 4; h++) if (ctx.boxAt(x, y + h, z) !== 0 || ctx.waterAt(x, y + h, z)) return;
    const [sky, block] = this.lightAt(x, y, z);
    if (sky > 0 || block >= SAFE_LIGHT) return;
    const deep = y * BLOCK_SIZE_M < -60;
    this.spawnGroup(SPECIES.filter((s) => s.hostile && (s.biomes.includes('dark') || s.biomes.includes('cave') || (deep && s.biomes.includes('deep')))), x, y, z);
  }

  private spawnGroup(options: readonly Species[], x: number, y: number, z: number): void {
    if (options.length === 0) return;
    const s = options[Math.floor(this.rand() * options.length)]!;
    const n = s.group[0] + Math.floor(this.rand() * (s.group[1] - s.group[0] + 1));
    const tough = s.hostile ? 1 + Math.max(0, -y * BLOCK_SIZE_M) / 100 * DEPTH_TOUGHNESS_PER_100M : 1;
    for (let k = 0; k < n && this.list.length < CREATURE_CAP; k++) {
      this.add(s, x + 0.5 + (this.rand() - 0.5) * 3, y, z + 0.5 + (this.rand() - 0.5) * 3, Math.round(s.health * tough));
    }
  }

  /** Whether a guardian is within `reach` cells of (x, y, z). */
  guardianNear(x: number, y: number, z: number, reach: number): boolean {
    return this.list.some((c) => c.species.guardian && Math.hypot(c.body.x - x, c.body.y - y, c.body.z - z) < reach);
  }

  add(s: Species, x: number, y: number, z: number, health: number): Creature {
    const c: Creature = {
      id: this.nextId++, species: s, yaw: this.rand() * Math.PI * 2, health, mode: 'idle', goal: null, target: null,
      think: this.rand() * THINK_S, cooldown: 0, walk: 0, hurt: 0, path: [], replan: 0, burning: 0, fed: 0, young: 0,
      body: { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, halfWidth: toCells(s.halfWidthM), height: toCells(s.heightM) },
    };
    this.list.push(c);
    return c;
  }

  save(): [string, number, number, number, number][] {
    return this.list.map((c) => [c.species.key, c.body.x, c.body.y, c.body.z, c.health]);
  }

  load(saved: unknown): void {
    if (!Array.isArray(saved)) return;
    for (const e of saved) {
      if (!Array.isArray(e) || e.length !== 5) continue;
      const s = SPECIES_BY_KEY.get(String(e[0]));
      if (s && [1, 2, 3, 4].every((k) => Number.isFinite(e[k]))) this.add(s, e[1], e[2], e[3], Math.max(1, e[4]));
    }
  }
}

/** Raw meat a dead creature leaves. */
export function meatOf(c: Creature): { state: number; count: number } | null {
  return c.species.meat > 0 ? { state: BLOCKS.state('raw_meat'), count: c.species.meat } : null;
}

/** Everything a dead creature leaves: meat, leather from hides, and its own loot. */
export function lootOf(c: Creature): { state: number; count: number }[] {
  const meat = meatOf(c);
  return [...(meat ? [meat] : []), ...(c.species.leather ? [{ state: BLOCKS.state('leather'), count: c.species.leather }] : []),
    ...(c.species.loot ?? []).map(([key, count]) => ({ state: BLOCKS.state(key), count }))];
}
