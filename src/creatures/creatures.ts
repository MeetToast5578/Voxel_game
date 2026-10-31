import {
  ATTACK_COOLDOWN_S, ATTACK_REACH_M, BURN_PER_S, BURN_S, CREATURE_CAP, CREATURE_FALL_M, DESPAWN_M, FLEE_M, GRAVITY_M_S2, HOSTILE_CAP, HUNT_M,
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

export type Mode = 'wander' | 'idle' | 'flee' | 'hunt' | 'sleep';

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
    private readonly events: { bite(damage: number, by: string): void; sound(name: 'break' | 'place' | 'step', volume: number): void }) {}

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
      if (d > toCells(DESPAWN_M) || (c.species.hostile && ((ctx.day && d > toCells(SPAWN_MIN_M) && this.rand() < dt * 0.2) || ctx.hostiles <= 0))) {
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
      if (this.burn(c, dt, ctx)) this.list.splice(this.list.indexOf(c), 1);
    }
  }

  private active(c: Creature, ctx: CreatureContext): boolean {
    if (c.species.hostile) return !ctx.day || this.light(c) < 7;
    return c.species.nocturnal ? !ctx.day : ctx.day;
  }

  private light(c: Creature): number {
    const x = Math.floor(c.body.x), y = Math.floor(c.body.y + 0.5), z = Math.floor(c.body.z);
    const chunk = this.world.chunkAt(x, y, z);
    return chunk ? chunk.skyLight(localIndex(toLocal(x), toLocal(y), toLocal(z))) : 15;
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
  private waypoint(c: Creature, t: Body, dt: number, ctx: CreatureContext): [number, number] | null {
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
    if (c.mode === 'hunt' && c.target) {
      const t = c.target === 'player' ? ctx.player : c.target.body;
      goal = [t.x, t.z];
      if (s.medium === 'land') goal = this.waypoint(c, t, dt, ctx) ?? goal;
      const reach = toCells(ATTACK_REACH_M) + b.halfWidth + t.halfWidth;
      if (Math.hypot(t.x - b.x, t.z - b.z) < reach && Math.abs(t.y - b.y) < b.height && c.cooldown <= 0) {
        c.cooldown = ATTACK_COOLDOWN_S;
        if (c.target === 'player') this.events.bite(s.attack, s.name);
        else this.damage(c.target, s.attack, b.x, b.z);
      }
    }
    if (c.mode === 'flee' || c.mode === 'hunt') speed *= RUN_FACTOR;
    let vx = 0, vz = 0;
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
        const blocked = s.medium === 'land' && ((ctx.waterAt(ax, fy, az) && c.mode !== 'flee') || ground <= fy - FALL ||
          (ctx.boxAt(ax, fy + STEP, az) !== 0 && ctx.boxAt(ax, fy, az) !== 0));
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
    else b.vy -= GRAVITY * dt;
    // Up a step when walking into one.
    const before = b.x + b.z;
    moveBody(b, dt, ctx.boxAt, s.medium === 'land' ? STEP : 0);
    if (s.medium === 'land' && (vx !== 0 || vz !== 0) && Math.abs(b.x + b.z - before) < 1e-4 && b.onGround) b.vy = toCells(5.5);
    c.walk += Math.hypot(b.vx, b.vz) * dt * 3;
  }

  /** Lava and campfires set a creature alight and water puts it out; returns whether it burned to death. */
  private burn(c: Creature, dt: number, ctx: CreatureContext): boolean {
    const b = c.body, key = BLOCKS.type(this.world.get(Math.floor(b.x), Math.floor(b.y + 0.1), Math.floor(b.z))).key;
    if (key === 'lava' || key === 'flowing_lava' || key === 'campfire') c.burning = BURN_S;
    if (ctx.waterAt(Math.floor(b.x), Math.floor(b.y + b.height * 0.5), Math.floor(b.z))) c.burning = 0;
    if (c.burning <= 0) return false;
    c.burning -= dt;
    c.health -= BURN_PER_S * 2 * dt;
    c.hurt = Math.max(c.hurt, 0.1);
    return c.health <= 0;
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
    if (c.health > 0) return false;
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

  /** Adds a group of a species fitting the place a random spot near the player offers. */
  private spawn(ctx: CreatureContext): void {
    if (this.list.length >= CREATURE_CAP) return;
    const p = ctx.player;
    const angle = this.rand() * Math.PI * 2, dist = toCells(SPAWN_MIN_M + this.rand() * (SPAWN_MAX_M - SPAWN_MIN_M));
    const x = Math.floor(p.x + Math.cos(angle) * dist), z = Math.floor(p.z + Math.sin(angle) * dist);
    const column = this.world.column(toChunk(x), toChunk(z));
    if (!column) return;
    const i = columnIndex(toLocal(x), toLocal(z));
    const top = column.surface[i]!;
    const water = column.water[i]! > top + 1;
    const y = water ? column.water[i]! - 2 : top + 1;
    if (!this.world.isLoaded(x, y, z) || (!water && ctx.boxAt(x, y, z) !== 0)) return;
    const biome = biomeByIndex(column.biome[i]!).key;
    const hostiles = this.list.filter((c) => c.species.hostile).length;
    const chunk = this.world.chunkAt(x, y, z)!;
    const dark = chunk.skyLight(localIndex(toLocal(x), toLocal(y), toLocal(z))) < 7 || !ctx.day;
    const options = SPECIES.filter((s) => (water ? s.medium === 'water' : s.medium === 'land' && (s.biomes.includes(biome) ||
      (s.biomes.includes('dark') && dark && hostiles < HOSTILE_CAP * ctx.hostiles))));
    if (options.length === 0) return;
    const s = options[Math.floor(this.rand() * options.length)]!;
    const n = s.group[0] + Math.floor(this.rand() * (s.group[1] - s.group[0] + 1));
    for (let k = 0; k < n && this.list.length < CREATURE_CAP; k++) {
      this.add(s, x + 0.5 + (this.rand() - 0.5) * 3, y, z + 0.5 + (this.rand() - 0.5) * 3, s.health);
    }
  }

  add(s: Species, x: number, y: number, z: number, health: number): Creature {
    const c: Creature = {
      id: this.nextId++, species: s, yaw: this.rand() * Math.PI * 2, health, mode: 'idle', goal: null, target: null,
      think: this.rand() * THINK_S, cooldown: 0, walk: 0, hurt: 0, path: [], replan: 0, burning: 0,
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

/** Everything a dead creature leaves: meat, and leather from hides. */
export function lootOf(c: Creature): { state: number; count: number }[] {
  const meat = meatOf(c);
  return [...(meat ? [meat] : []), ...(c.species.leather ? [{ state: BLOCKS.state('leather'), count: c.species.leather }] : [])];
}
