import {
  BOSS_SPECIAL_S, BOSS_WINDUP_S, DIVE_M_S, SLAM_RADIUS_M, WINDUP_S, BREED_COOLDOWN_S, FED_S, FOLLOW_M, GROW_UP_S, ARCHER_AIM_S, ARCHER_FAR_M, ARCHER_NEAR_M, ARCHER_SHOT_S, ATTACK_COOLDOWN_S, ATTACK_REACH_M, BLOCK_SIZE_M, BURN_PER_S, BURN_S, DEPTH_TOUGHNESS_PER_100M, SAFE_LIGHT, CREATURE_CAP, CREATURE_FALL_M, DESPAWN_M, FLEE_M, GRAVITY_M_S2, HOSTILE_CAP, HUNT_M,
  KNOCKBACK_M_S, RUN_FACTOR, SPAWN_INTERVAL_S, SPAWN_MAX_M, SPAWN_MIN_M, STEP_HEIGHT_M, cells, toCells,
} from '../config';
import { columnIndex, localIndex, toChunk, toLocal } from '../core/coords';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import type { BoxAt } from '../game/collision';
import { moveBody, type Body } from '../game/physics';
import { biomeByIndex } from '../worldgen/biomes';
import { findPath } from './pathfinding';
import { SPECIES, SPECIES_BY_KEY, type BossMove, type Species } from './species';

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
  /** Hoppers: seconds until the next hop. */
  hop: number;
  /** Health when spawned, for health bars. */
  maxHealth: number;
  /** A villager's bed: where it goes at night and stays near by day. */
  home?: readonly [number, number, number];
  /** Tamed by the player: follows them and fights what threatens them. */
  tame?: boolean;
  /** A guardian's shrine (its anchor, "x,z"). */
  site?: string;
  /** A boss summoned at an altar: it leaves twice the treasure. */
  atAltar?: boolean;
  /** Which way it lies in its bed (default: head toward +x, as in village houses). */
  homeYaw?: number;
  /** Seconds left in a wind-up before its bite lands. */
  windup?: number;
  /** A boss's named attack under way: seconds left in its wind-up, where it aims, and whether it has struck. */
  move?: { kind: BossMove; t: number; aim: [number, number, number]; struck?: boolean };
  /** Seconds until a boss's next named attack, and its phase (2: enraged, below half health). */
  special?: number;
  phase?: number;
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
/** A pet guards the player against monsters within this many cells of them. */
const TAME_GUARD = 14;
/** Seconds a defeated creature takes to fall over and fade. */
export const DEATH_S = 0.7;
/** Seconds between path plans while hunting, and the search budget of one plan. */
const REPLAN_S = 1;
const PATH_NODES = 300;

/**
 * Wildlife and monsters: spawning around the player by biome and time of day, simple minds (wander, graze, herd,
 * flee, hunt, sleep), physics shared with the player, bites and being hit. Ported from the old game, in meters.
 */
export class Creatures {
  readonly list: Creature[] = [];
  /** Creatures that just died, for their fall: seconds since, and whether the puff of their passing was shown. */
  readonly dying: { c: Creature; t: number; puffed: boolean }[] = [];
  private nextId = 1;
  private spawnIn = 0;

  constructor(private readonly world: World, private readonly rand: () => number,
    private readonly events: {
      bite(damage: number, by: string, species?: Species, biter?: Creature): void;
      sound(name: 'break' | 'place' | 'step', volume: number): void;
      /** A creature calls, is hurt or dies (for its sound). */
      call?(c: Creature, kind: 'call' | 'hurt' | 'death'): void;
      /** A ranged creature shoots at the player from (x, y, z). */
      shoot?(c: Creature, x: number, y: number, z: number, item?: string): void;
      /** A boss starts a named attack, lands one, or turns enraged. */
      boss?(c: Creature, what: BossMove | 'land' | 'enraged'): void;
    }) {}

  update(dt: number, ctx: CreatureContext): void {
    for (let i = this.dying.length - 1; i >= 0; i--) if ((this.dying[i]!.t += dt) > DEATH_S) this.dying.splice(i, 1);
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
      if (!c.tame && (d > toCells(DESPAWN_M) || (c.species.hostile && ((ctx.day && !c.species.guardian && !c.species.daytime && d > toCells(SPAWN_MIN_M) && this.rand() < dt * 0.2) || ctx.hostiles <= 0)))) {
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
        this.die(c);
      }
    }
  }

  private active(c: Creature, ctx: CreatureContext): boolean {
    if (c.species.guardian || c.species.daytime) return true;
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
    if (c.tame) {
      // A pet: goes for the nearest monster near the player, else keeps close; left far behind, it catches up at once.
      const foe = this.list.filter((o) => o.species.hostile && o.health > 0 && Math.hypot(o.body.x - p.x, o.body.z - p.z) < TAME_GUARD).sort((a, o) =>
        Math.hypot(a.body.x - b.x, a.body.z - b.z) - Math.hypot(o.body.x - b.x, o.body.z - b.z))[0];
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d > TAME_GUARD * 3) Object.assign(b, { x: p.x + 1, y: p.y, z: p.z + 1, vx: 0, vy: 0, vz: 0 });
      if (foe) { c.mode = 'hunt'; c.target = foe; c.goal = null; }
      else if (d > 3) { c.mode = 'follow'; c.target = null; c.goal = [p.x, p.z]; }
      else { c.mode = 'idle'; c.target = null; c.goal = null; }
      return;
    }
    if (c.home) {
      // Villagers: home to bed at night, out and about near home by day.
      const [hx, hy, hz] = c.home, homeD = Math.hypot(hx - b.x, hz - b.z);
      if (!this.active(c, ctx)) {
        if (homeD < 0.6 && Math.abs(hy - b.y) < 1.5) {
          c.mode = 'sleep';
          c.goal = null;
          // Head on the pillow (+x), lying along the bed.
          c.yaw = c.homeYaw ?? Math.PI;
        } else {
          c.mode = 'wander';
          c.goal = [hx, hz];
        }
        return;
      }
      if (c.mode === 'sleep' || !c.goal || Math.hypot(c.goal[0] - b.x, c.goal[1] - b.z) < toCells(0.8) || this.rand() < 0.04) {
        if (this.rand() < 0.4) { c.mode = 'idle'; c.goal = null; return; }
        const a = this.rand() * Math.PI * 2, r = toCells(2 + this.rand() * 9);
        c.mode = 'wander';
        c.goal = [hx + Math.cos(a) * r, hz + Math.sin(a) * r];
      }
      return;
    }
    if (!this.active(c, ctx) && c.mode !== 'flee') {
      // Only animals and people sleep; a monster out of its hour lingers, waiting.
      c.mode = s.hostile ? 'idle' : 'sleep';
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
    if (s.boss && c.mode === 'hunt' && c.target === 'player' && this.bossMove(c, dt, ctx)) return;
    let speed = toCells(s.speedM_S) * (c.phase === 2 ? 1.25 : 1);
    let goal = c.goal;
    if (c.mode === 'hunt' && c.target && s.ranged && c.target === 'player') {
      // Archers keep between the near and far distance, and shoot when they can see the player.
      const t = ctx.player, d = Math.hypot(t.x - b.x, t.z - b.z);
      goal = d < toCells(ARCHER_NEAR_M) ? [b.x - (t.x - b.x), b.z - (t.z - b.z)] : d > toCells(ARCHER_FAR_M) ? this.waypoint(c, t, dt, ctx) ?? [t.x, t.z] : null;
      c.yaw = Math.atan2(-(t.x - b.x), -(t.z - b.z));
      const eye = b.y + b.height * 0.85;
      const sees = d < toCells(ARCHER_FAR_M + 4) && this.sees(b.x, eye, b.z, t.x, t.y + t.height * 0.8, t.z, ctx);
      // The draw: it stands still for the last ARCHER_AIM_S, and holds the draw until it sees the player.
      if (!sees) c.cooldown = Math.max(c.cooldown, ARCHER_AIM_S);
      else if (c.cooldown <= ARCHER_AIM_S) {
        goal = null;
        if (c.cooldown <= 0) {
          c.cooldown = ARCHER_SHOT_S;
          this.events.shoot?.(c, b.x, eye, b.z);
        }
      }
    } else if (c.mode === 'hunt' && c.target) {
      const t = c.target === 'player' ? ctx.player : c.target.body;
      goal = [t.x, t.z];
      if (s.medium === 'land' && !s.climbs && !s.flies) goal = this.waypoint(c, t, dt, ctx) ?? goal;
      const reach = toCells(ATTACK_REACH_M) + b.halfWidth + t.halfWidth;
      const level = s.flies ? Math.abs(t.y + t.height * 0.6 - b.y) < 1.6 : Math.abs(t.y - b.y) < b.height;
      const dist = Math.hypot(t.x - b.x, t.z - b.z);
      if (c.windup) {
        // Winding up: it holds still, then strikes only if the target is still within reach (a step back dodges).
        goal = null;
        if ((c.windup -= dt) <= 0) {
          c.windup = 0;
          c.cooldown = ATTACK_COOLDOWN_S;
          if (dist < reach * 1.15 && level) {
            if (c.target === 'player') this.events.bite(s.attack, s.name, s, c);
            else this.damage(c.target, s.attack, b.x, b.z);
          }
        }
      } else if (dist < reach && level && c.cooldown <= 0) c.windup = s.boss ? BOSS_WINDUP_S * 0.6 : WINDUP_S;
    }
    else if (goal && s.medium === 'land' && !s.flies && (c.mode === 'flee' || c.mode === 'wander' || c.mode === 'follow')) {
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
        const blocked = s.medium === 'land' && !s.flies && ((ctx.waterAt(ax, fy, az) && c.mode !== 'flee') || (ground <= fy - FALL && !s.climbs) || (wall && !s.climbs));
        if (blocked) {
          vx = vz = 0;
          c.goal = null;
          c.think = Math.min(c.think, 0.1);
        }
      }
    }
    // Just hit: staggered, carried by the knockback instead of steering.
    if (c.hurt > 0.12 && !s.flies) {
      vx = b.vx;
      vz = b.vz;
    }
    if (s.hops) {
      // Sits between hops, then leaps: higher and more often when chasing. In the air it keeps its momentum.
      if (b.onGround) {
        const stop = Math.max(0, 1 - dt * 14);
        b.vx *= stop;
        b.vz *= stop;
        c.hop -= dt;
        if (c.hop <= 0 && (vx !== 0 || vz !== 0)) {
          const chase = c.mode === 'hunt';
          c.hop = chase ? 0.45 + this.rand() * 0.35 : 1 + this.rand() * 1.6;
          b.vy = toCells(chase ? 6.5 : 5);
          b.vx = vx * 1.3;
          b.vz = vz * 1.3;
        }
      }
    } else {
      b.vx += (vx - b.vx) * Math.min(1, dt * 8);
      b.vz += (vz - b.vz) * Math.min(1, dt * 8);
    }
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
    } else if (s.flies) {
      // Flutters at a wavering height: at the player's head when hunting, else a few cells over the ground.
      let ty: number;
      if (c.mode === 'hunt' && c.target === 'player') ty = ctx.player.y + ctx.player.height * 0.7;
      else {
        let ground = Math.floor(b.y);
        while (ground > b.y - 8 && ctx.boxAt(Math.floor(b.x), ground - 1, Math.floor(b.z)) === 0) ground--;
        ty = ground + 2.5;
      }
      ty += Math.sin(c.walk * 0.9 + c.id) * 0.8;
      b.vy += ((ty - b.y) * 2 - b.vy) * Math.min(1, dt * 3);
      if (c.mode === 'sleep' || c.mode === 'idle') {
        // Never hangs still in the air: drifts round a small circle.
        b.vx += (Math.cos(c.walk * 0.6) * 1.2 - b.vx) * Math.min(1, dt * 2);
        b.vz += (Math.sin(c.walk * 0.6) * 1.2 - b.vz) * Math.min(1, dt * 2);
        c.walk += dt * 2;
      }
    } else if (inWater) b.vy += (toCells(1.5) - b.vy) * Math.min(1, dt * 3); // float up and swim
    else if (climbing) b.vy = toCells(2);
    else b.vy -= GRAVITY * dt;
    // Up a step when walking into one.
    const before = b.x + b.z;
    moveBody(b, dt, ctx.boxAt, s.medium === 'land' ? STEP : 0);
    if (s.medium === 'land' && !s.hops && !s.flies && (vx !== 0 || vz !== 0) && Math.abs(b.x + b.z - before) < 1e-4 && b.onGround) b.vy = toCells(5.5);
    c.walk += Math.hypot(b.vx, b.vz) * dt * 3;
  }

  /**
   * A boss's named attacks, every few seconds while it hunts: the Slime King crouches and leaps at the player, and its
   * landing hurts anyone on the ground near it (jump or step away); the Matriarch rises and dives at where the player
   * stood; the Frost Colossus stomps (the same shock where it stands) or hurls an ice boulder. Returns whether one is
   * under way (it then moves the boss itself).
   */
  private bossMove(c: Creature, dt: number, ctx: CreatureContext): boolean {
    const b = c.body, p = ctx.player, s = c.species;
    if (!c.move) {
      c.special = (c.special ?? BOSS_SPECIAL_S / 2) - dt;
      if (c.special > 0 || c.windup || (!s.flies && !b.onGround) || Math.hypot(p.x - b.x, p.z - b.z) > toCells(12)) return false;
      c.special = BOSS_SPECIAL_S * (c.phase === 2 ? 0.6 : 1);
      const moves = s.moves ?? ['slam'];
      c.move = { kind: moves[Math.floor(this.rand() * moves.length)]!, t: BOSS_WINDUP_S, aim: [p.x, p.y + p.height * 0.5, p.z] };
      this.events.boss?.(c, c.move.kind);
    }
    const m = c.move;
    m.t -= dt;
    const dx = m.aim[0] - b.x, dy = m.aim[1] - b.y, dz = m.aim[2] - b.z, len = Math.hypot(dx, dz) || 1;
    c.yaw = Math.atan2(-dx, -dz);
    if (m.kind === 'burrow') {
      // Rears up, sinks under the ground, tunnels to beneath where the player now stands, and bursts up through them.
      if (m.t > 0) b.vx = b.vz = 0;
      else if (m.t > -BURROW_S) {
        Object.assign(b, { x: b.x + Math.sign(p.x - b.x) * Math.min(Math.abs(p.x - b.x), toCells(8) * dt), z: b.z + Math.sign(p.z - b.z) * Math.min(Math.abs(p.z - b.z), toCells(8) * dt), vx: 0, vy: 0, vz: 0 });
        m.aim = [b.x, p.y, b.z];
        return true;
      } else if (!m.struck) {
        m.struck = true;
        Object.assign(b, { y: m.aim[1], vy: toCells(9), vx: 0, vz: 0 });
        if (Math.hypot(p.x - b.x, p.z - b.z) < toCells(SLAM_RADIUS_M) + b.halfWidth && Math.abs(p.y - b.y) < 1.5) this.events.bite(Math.round(s.attack * 1.5), s.name, s, c);
        this.events.boss?.(c, 'land');
      } else if (b.onGround) c.move = undefined;
      b.vy -= GRAVITY * dt;
    } else if (m.kind === 'stomp' || m.kind === 'boulder' || m.kind === 'spit') {
      // Planted while it winds up (a flier hangs still), then the stomp shakes the ground round it, or the boulder or
      // venom flies at the player.
      b.vx = b.vz = 0;
      if (m.t <= 0) {
        if (m.kind !== 'stomp') this.events.shoot?.(c, b.x, b.y + b.height * 0.5, b.z, m.kind === 'boulder' ? 'ice' : 'stinger');
        else {
          if (Math.hypot(p.x - b.x, p.z - b.z) < toCells(SLAM_RADIUS_M * 1.4) + b.halfWidth && Math.abs(p.y - b.y) < 1) this.events.bite(s.attack, s.name, s, c);
          this.events.boss?.(c, 'land');
        }
        c.move = undefined;
      }
      if (s.flies) b.vy *= 0.9;
      else b.vy -= GRAVITY * dt;
    } else if (m.kind === 'slam') {
      if (m.t > 0) {
        // The crouch: it sits still, gathering itself.
        b.vx = b.vz = 0;
      } else if (!m.struck) {
        // The leap: high, and far enough to come down where the player stood.
        m.struck = true;
        b.vy = toCells(8);
        const air = (2 * b.vy) / GRAVITY, v = Math.min(len / air, toCells(9));
        b.vx = (dx / len) * v;
        b.vz = (dz / len) * v;
      } else if (b.onGround && m.t < -0.2) {
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < toCells(SLAM_RADIUS_M) + b.halfWidth && p.y - b.y < 1 && p.y - b.y > -1.5) this.events.bite(Math.round(s.attack * 1.5), s.name, s, c);
        this.events.boss?.(c, 'land');
        c.move = undefined;
      }
      b.vy -= GRAVITY * dt;
    } else {
      if (m.t > 0) {
        // Rising before the dive.
        b.vx *= 0.9;
        b.vz *= 0.9;
        b.vy = toCells(2.5);
      } else {
        const d3 = Math.hypot(dx, dy, dz) || 1, v = toCells(DIVE_M_S) * (c.phase === 2 ? 1.3 : 1);
        b.vx = (dx / d3) * v;
        b.vy = (dy / d3) * v;
        b.vz = (dz / d3) * v;
        const reach = toCells(ATTACK_REACH_M) + b.halfWidth + p.halfWidth;
        if (!m.struck && Math.hypot(p.x - b.x, p.z - b.z) < reach && Math.abs(p.y + p.height * 0.5 - b.y) < 1.6) {
          m.struck = true;
          this.events.bite(s.attack + 2, s.name, s, c);
        }
        if (d3 < 0.8 || m.t < -2) c.move = undefined;
      }
    }
    moveBody(b, dt, ctx.boxAt, 0);
    c.walk += Math.hypot(b.vx, b.vz) * dt * 3;
    return true;
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
    if (c.species.guardian || c.species.fireproof) return false;
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
  damage(c: Creature, amount: number, fromX: number, fromZ: number, knock = 1): boolean {
    if (burrowed(c)) return false;
    c.health -= amount;
    c.hurt = 0.3;
    // Heavy creatures are pushed less.
    const k = knock * Math.min(1.4, 1.2 / Math.max(0.6, c.species.heightM * c.species.halfWidthM * 4)) * (c.species.guardian ? 0.2 : 1);
    const dx = c.body.x - fromX, dz = c.body.z - fromZ, len = Math.hypot(dx, dz) || 1;
    c.body.vx = (dx / len) * toCells(KNOCKBACK_M_S) * k;
    c.body.vz = (dz / len) * toCells(KNOCKBACK_M_S) * k;
    c.body.vy = toCells(3) * Math.min(1.3, k);
    if (c.species.grazer) {
      c.mode = 'flee';
      c.goal = [c.body.x + (dx / len) * toCells(12), c.body.z + (dz / len) * toCells(12)];
    }
    if (c.health > 0 && c.species.boss) {
      // Below half health a boss is enraged: faster, its named attacks come sooner, and it calls a whole brood at once.
      const enrage = c.phase !== 2 && c.health < c.maxHealth / 2;
      if (enrage) {
        c.phase = 2;
        this.events.boss?.(c, 'enraged');
      }
      // Bosses call their brood as they are struck: the Slime King sheds slimes, the Matriarch calls moths.
      const small = SPECIES_BY_KEY.get(c.species.brood ?? 'slime')!;
      for (let k = enrage ? 3 : this.rand() < 0.4 ? 1 : 0; k > 0 && this.list.length < CREATURE_CAP; k--)
        this.add(small, c.body.x + (this.rand() - 0.5) * 2, c.body.y + 1, c.body.z + (this.rand() - 0.5) * 2, small.health);
    }
    if (c.health > 0) {
      this.events.call?.(c, 'hurt');
      return false;
    }
    this.events.call?.(c, 'death');
    this.die(c);
    return true;
  }

  private die(c: Creature): void {
    this.list.splice(this.list.indexOf(c), 1);
    if (this.dying.length < 16) this.dying.push({ c, t: 0, puffed: false });
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
      ? room && (dark || s.daytime) && (s.biomes.includes('dark') || s.biomes.includes(biome))
      : s.biomes.includes(biome))));
    this.spawnGroup(options, x, y, z, ctx.boxAt);
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
    this.spawnGroup(SPECIES.filter((s) => s.hostile && (s.biomes.includes('dark') || s.biomes.includes('cave') || (deep && s.biomes.includes('deep')))), x, y, z, ctx.boxAt);
  }

  private spawnGroup(options: readonly Species[], x: number, y: number, z: number, boxAt: CreatureContext['boxAt']): void {
    if (options.length === 0) return;
    const s = options[Math.floor(this.rand() * options.length)]!;
    const tall = Math.ceil(toCells(s.heightM)), clear = (cx: number, cz: number) => {
      for (let h = 0; h < tall; h++) if (boxAt(cx, y + h, cz) !== 0) return false;
      return true;
    };
    const n = s.group[0] + Math.floor(this.rand() * (s.group[1] - s.group[0] + 1));
    const tough = s.hostile ? 1 + Math.max(0, -y * BLOCK_SIZE_M) / 100 * DEPTH_TOUGHNESS_PER_100M : 1;
    for (let k = 0; k < n && this.list.length < CREATURE_CAP; k++) {
      // Group members spread out, but only onto open cells: otherwise they share the first one's spot.
      let px = x + 0.5 + (this.rand() - 0.5) * 3, pz = z + 0.5 + (this.rand() - 0.5) * 3;
      if (!clear(Math.floor(px), Math.floor(pz))) [px, pz] = [x + 0.5, z + 0.5];
      this.add(s, px, y, pz, Math.round(s.health * tough));
    }
  }

  /** Whether a guardian is within `reach` cells of (x, y, z). */
  guardianNear(x: number, y: number, z: number, reach: number): boolean {
    return this.list.some((c) => c.species.guardian && Math.hypot(c.body.x - x, c.body.y - y, c.body.z - z) < reach);
  }

  add(s: Species, x: number, y: number, z: number, health: number): Creature {
    const c: Creature = {
      id: this.nextId++, species: s, yaw: this.rand() * Math.PI * 2, health, mode: 'idle', goal: null, target: null,
      think: this.rand() * THINK_S, cooldown: 0, walk: 0, hurt: 0, path: [], replan: 0, burning: 0, fed: 0, young: 0, hop: this.rand(), maxHealth: health,
      body: { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, halfWidth: toCells(s.halfWidthM), height: toCells(s.heightM) },
    };
    this.list.push(c);
    return c;
  }

  save(): [string, number, number, number, number, number][] {
    // Villagers are not saved: they come back to their houses' beds.
    return this.list.filter((c) => !c.home).map((c) => [c.species.key, c.body.x, c.body.y, c.body.z, c.health, c.tame ? 1 : 0]);
  }

  load(saved: unknown): void {
    if (!Array.isArray(saved)) return;
    for (const e of saved) {
      if (!Array.isArray(e) || e.length < 5) continue;
      const s = SPECIES_BY_KEY.get(String(e[0]));
      if (s && [1, 2, 3, 4].every((k) => Number.isFinite(e[k]))) {
        const c = this.add(s, e[1], e[2], e[3], Math.max(1, e[4]));
        if (e[5] === 1) c.tame = true;
      }
    }
  }
}

/** Raw meat a dead creature leaves. */
export function meatOf(c: Creature): { state: number; count: number } | null {
  return c.species.meat > 0 ? { state: BLOCKS.state('raw_meat'), count: c.species.meat } : null;
}

/** Everything a dead creature leaves: meat, leather from hides, and its own loot. */
/** Seconds the Sandmaw tunnels underground before it bursts up. */
const BURROW_S = 1.6;
/** Under the ground: unseen and unharmed. */
export function burrowed(c: Creature): boolean {
  return c.move?.kind === 'burrow' && c.move.t <= 0 && !c.move.struck;
}

/** What a boss's treasure bag holds when opened: its loot (rare things by chance) and coins. */
export function bagLoot(s: Species, rand: () => number = Math.random): { state: number; count: number }[] {
  return [...(s.loot ?? []).filter(([, , chance]) => chance === undefined || rand() < chance).map(([key, count]) => ({ state: BLOCKS.state(key), count })),
    { state: BLOCKS.state('trade_coin'), count: 25 }];
}

export function lootOf(c: Creature, rand: () => number = Math.random): { state: number; count: number }[] {
  const meat = meatOf(c);
  const s = c.species;
  // Monsters carry a few coins, more the tougher they are.
  const coins = s.guardian || s.boss ? 25 : s.hostile && rand() < 0.6 ? 1 + Math.floor(rand() * (1 + s.health / 12)) : 0;
  return [...(meat ? [meat] : []), ...(s.leather ? [{ state: BLOCKS.state('leather'), count: s.leather }] : []),
    ...(s.loot ?? []).filter(([, , chance]) => chance === undefined || rand() < chance).map(([key, count]) => ({ state: BLOCKS.state(key), count })),
    ...(coins ? [{ state: BLOCKS.state('trade_coin'), count: coins }] : [])];
}
