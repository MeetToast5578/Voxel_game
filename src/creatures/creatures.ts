import {
  CREATURE_ATTACK_S, CREATURE_FALL, CREATURE_FLEE_RADIUS, CREATURE_FOLLOW_RADIUS, CREATURE_HERD_RADIUS, CREATURE_HUNGER_S,
  CREATURE_HUNT_RADIUS, CREATURE_JUMP_SPEED, CREATURE_KNOCKBACK, CREATURE_PATH_NODES, CREATURE_REACH, CREATURE_RUN_FACTOR,
  CREATURE_SOUND_CHANCE, CREATURE_SOUND_RADIUS, CREATURE_STEP, CREATURE_THINK_S, CREATURE_WANDER_RADIUS, BIRD_ALTITUDE,
} from '../config';
import type { CollisionFn } from '../player/physics';
import { EntitySystem, type Entity } from '../world/entity';
import { findPath, type PathCell } from './pathfinding';
import { SPECIES_BY_KEY, type Species } from './species';

export type Behaviour = 'wander' | 'graze' | 'flee' | 'hunt' | 'follow' | 'herd' | 'sleep' | 'idle';

/** The target id that stands for the player. */
export const PLAYER_TARGET = -1;

/** A creature (T-H1): an entity with a species, health and a current behaviour. */
export interface Creature extends Entity {
  species: Species;
  health: number;
  yaw: number;
  behaviour: Behaviour;
  /** What it flees from, hunts or follows: a creature id, PLAYER_TARGET, or null. */
  target: number | null;
  goal: { x: number; y: number; z: number } | null;
  path: PathCell[];
  thinkS: number;
  /** Walk animation phase, advanced by distance walked (T-H4). */
  walk: number;
  hurtS: number;
  attackS: number;
  /** Seconds since a predator last ate; it hunts once this passes CREATURE_HUNGER_S. */
  fedS: number;
  /** Hit by the player recently: grazers panic, fighters strike back. */
  provoked: boolean;
}

/** What the creatures see of the world each step. Cells are integer coordinates. */
export interface CreatureView {
  isSolid(x: number, y: number, z: number): boolean;
  isWater(x: number, y: number, z: number): boolean;
  isLoaded(x: number, y: number, z: number): boolean;
  /** The first air cell above the column's ground, if the column is loaded. */
  groundY(x: number, z: number): number | undefined;
  player: { x: number; y: number; z: number; holdingWheat: boolean; /** survival: can be hunted and scares wildlife */ prey: boolean };
  night: boolean;
  /** Bears sleep the winter through, and grazers keep closer to home (T-H5: activity follows the season). */
  winter: boolean;
  rand(): number;
}

export type CreatureEvent =
  | { kind: 'bite'; damage: number; x: number; z: number; species: Species }
  | { kind: 'sound'; species: Species; x: number; y: number; z: number }
  | { kind: 'death'; creature: Creature; byPlayer: boolean };

/** A creature as saved (T-H2). */
export interface SavedCreature { species: string; x: number; y: number; z: number; health: number; yaw: number; }

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Every creature, its behaviour (T-H5), movement and fights. Pure: the world comes in through a CreatureView. */
export class CreatureSystem {
  readonly entities = new EntitySystem<Creature>();
  private events: CreatureEvent[] = [];

  get count(): number { return this.entities.count; }

  all(): Creature[] { return this.entities.all(); }

  spawn(species: Species, x: number, y: number, z: number, rand: () => number, health = species.health, yaw = rand() * Math.PI * 2): Creature {
    return this.entities.add({
      type: species.key, x, y, z, vx: 0, vy: 0, vz: 0, halfWidth: species.halfWidth, height: species.height, onGround: false,
      species, health, yaw, behaviour: 'idle', target: null, goal: null, path: [], thinkS: rand() * CREATURE_THINK_S,
      walk: 0, hurtS: 0, attackS: 0, fedS: CREATURE_HUNGER_S * rand(), provoked: false,
    });
  }

  restore(saved: SavedCreature, rand: () => number): Creature | null {
    const species = SPECIES_BY_KEY.get(saved.species);
    return species ? this.spawn(species, saved.x, saved.y, saved.z, rand, saved.health, saved.yaw) : null;
  }

  static save(c: Creature): SavedCreature {
    return { species: c.species.key, x: c.x, y: c.y, z: c.z, health: c.health, yaw: c.yaw };
  }

  remove(id: number): void { this.entities.despawn(id); }

  /**
   * A hit (T-H9 combat): knocks the creature away from (fromX, fromZ). Returns true when it dies; the death event is
   * returned by the next step, with `byPlayer` saying who gets the drops.
   */
  hurt(c: Creature, damage: number, fromX: number, fromZ: number, byPlayer: boolean): boolean {
    c.health -= damage;
    c.hurtS = 0.4;
    if (byPlayer) c.provoked = true;
    const dx = c.x - fromX, dz = c.z - fromZ, d = Math.hypot(dx, dz) || 1;
    c.vx += (dx / d) * CREATURE_KNOCKBACK;
    c.vz += (dz / d) * CREATURE_KNOCKBACK;
    c.vy = Math.max(c.vy, CREATURE_KNOCKBACK * 0.5);
    c.thinkS = 0; // react at once
    if (c.health > 0) return false;
    this.entities.despawn(c.id);
    this.events.push({ kind: 'death', creature: c, byPlayer });
    return true;
  }

  /** Thinks, moves and fights every creature by `dt` seconds. Creatures in unloaded chunks wait. Returns what happened. */
  step(dt: number, view: CreatureView, isSolidAt: CollisionFn): CreatureEvent[] {
    const all = this.entities.all();
    for (const c of all) {
      if (!this.entities.get(c.id)) continue; // killed earlier this step
      if (!view.isLoaded(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z))) { c.vx = c.vy = c.vz = 0; continue; }
      c.hurtS = Math.max(0, c.hurtS - dt);
      c.attackS = Math.max(0, c.attackS - dt);
      c.fedS += dt;
      if ((c.thinkS -= dt) <= 0) {
        c.thinkS = CREATURE_THINK_S * (0.8 + view.rand() * 0.4);
        this.think(c, all, view);
      }
      this.act(c, all, view, dt);
    }
    const before = new Map(all.map((c) => [c.id, [c.x, c.z] as const]));
    this.entities.step(dt, isSolidAt, {
      stepHeight: (c) => (c.species.medium === 'land' ? CREATURE_STEP : 0),
      gravity: (c) => gravityOf(c, view),
    });
    for (const c of this.entities.values()) {
      const [x0, z0] = before.get(c.id) ?? [c.x, c.z];
      c.walk += Math.hypot(c.x - x0, c.z - z0);
      // Wanting to go on but blocked by more than a step: jump.
      if (c.hitWall && c.onGround && c.species.medium === 'land' && Math.hypot(c.vx, c.vz) > 0.1) c.vy = CREATURE_JUMP_SPEED;
    }
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Rescores the behaviours (utility AI, T-H5) and picks the best, with its target and path. */
  private think(c: Creature, all: readonly Creature[], view: CreatureView): void {
    const s = c.species, p = view.player;
    let best = 'wander' as Behaviour, score = 0.25 + view.rand() * 0.1, target = null as number | null; // widened: `consider` assigns them
    const consider = (b: Behaviour, value: number, t: number | null = null) => {
      if (value > score) { best = b; score = value; target = t; }
    };
    const dPlayer = Math.sqrt(dist2(c, p) + (c.y - p.y) ** 2);
    const active = s.nocturnal ? view.night : !view.night;
    if (s.grazer || s.medium === 'water') {
      if (p.prey && dPlayer < CREATURE_FLEE_RADIUS && !p.holdingWheat) consider('flee', 1.5 - dPlayer / CREATURE_FLEE_RADIUS, PLAYER_TARGET);
      if (c.provoked && c.hurtS > 0 && s.attack === 0) consider('flee', 3, PLAYER_TARGET);
      for (const o of all) {
        if (o === c || !(o.species.prey.includes(s.key) || o.species.hostile)) continue;
        const d = Math.sqrt(dist2(c, o));
        if (d < CREATURE_FLEE_RADIUS * 1.3) consider('flee', 1.8 - d / CREATURE_FLEE_RADIUS, o.id);
      }
    }
    if (s.attack > 0 && c.provoked && p.prey && dPlayer < CREATURE_HUNT_RADIUS) consider('hunt', 2.5, PLAYER_TARGET);
    if (s.hostile && p.prey && dPlayer < CREATURE_HUNT_RADIUS) consider('hunt', 2, PLAYER_TARGET);
    if (s.prey.length && c.fedS > CREATURE_HUNGER_S && active) {
      let nearest: Creature | null = null, nd = CREATURE_HUNT_RADIUS ** 2;
      for (const o of all) if (o !== c && s.prey.includes(o.species.key) && dist2(c, o) < nd) { nearest = o; nd = dist2(c, o); }
      if (nearest) consider('hunt', 1.6 - Math.sqrt(nd) / CREATURE_HUNT_RADIUS, nearest.id);
    }
    if (s.grazer && p.holdingWheat && dPlayer < CREATURE_FOLLOW_RADIUS) consider('follow', 1.2, PLAYER_TARGET);
    if (!active && s.medium === 'land' && !s.hostile) consider('sleep', 0.7);
    if (view.winter && s.key === 'bear' && !c.provoked) consider('sleep', 2.5); // hibernation
    if (s.herds) {
      const herd = all.filter((o) => o !== c && o.species === s && dist2(c, o) < (CREATURE_HERD_RADIUS * 3) ** 2);
      if (herd.length) {
        const cx = herd.reduce((a, o) => a + o.x, 0) / herd.length, cz = herd.reduce((a, o) => a + o.z, 0) / herd.length;
        const d = Math.hypot(cx - c.x, cz - c.z);
        if (d > CREATURE_HERD_RADIUS * 0.5) consider('herd', 0.35 + 0.35 * Math.min(1, d / CREATURE_HERD_RADIUS));
      }
    }
    if (s.grazer && c.onGround) consider('graze', 0.2 + view.rand() * 0.25);
    consider('idle', view.rand() * 0.22);
    if (s.medium === 'air') { best = 'herd'; target = null; } // birds only flock (cosmetic)

    if (best !== c.behaviour || target !== c.target) c.path = [];
    c.behaviour = best;
    c.target = target;
    if (best === 'wander' && !c.goal) {
      const a = view.rand() * Math.PI * 2, r = CREATURE_WANDER_RADIUS * (0.3 + view.rand() * 0.7) * (view.winter ? 0.5 : 1);
      c.goal = { x: c.x + Math.cos(a) * r, y: c.y + (view.rand() - 0.5) * 4, z: c.z + Math.sin(a) * r };
    }
    if (best !== 'wander') c.goal = null;
    // A* towards a hunted or followed target on land (T-H6); in the open, steering straight at it is enough.
    const t = this.targetPos(target, all, view);
    if (t && s.medium === 'land' && (best === 'hunt' || best === 'follow') && (c.hitWall || Math.abs(t.y - c.y) > CREATURE_STEP)) {
      c.path = findPath((x, y, z) => view.isSolid(x, y, z), { x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) },
        { x: Math.floor(t.x), y: Math.floor(t.y), z: Math.floor(t.z) },
        { height: Math.ceil(s.height), step: CREATURE_STEP, fall: CREATURE_FALL, maxNodes: CREATURE_PATH_NODES });
    }
    if (dPlayer < CREATURE_SOUND_RADIUS && view.rand() < CREATURE_SOUND_CHANCE * (best === 'hunt' ? 4 : 1)) {
      this.events.push({ kind: 'sound', species: s, x: c.x, y: c.y, z: c.z });
    }
  }

  private targetPos(target: number | null, all: readonly Creature[], view: CreatureView): { x: number; y: number; z: number } | null {
    if (target === PLAYER_TARGET) return view.player;
    if (target === null) return null;
    return all.find((o) => o.id === target && this.entities.get(o.id)) ?? null;
  }

  /** Sets the creature's velocity for its behaviour, and lands its bites. */
  private act(c: Creature, all: readonly Creature[], view: CreatureView, dt: number): void {
    const s = c.species, walk = s.speed, run = s.speed * CREATURE_RUN_FACTOR;
    let tx = 0, tz = 0, speed = 0, ty: number | null = null;
    const t = this.targetPos(c.target, all, view);
    switch (c.behaviour) {
      case 'flee':
        if (t) { tx = c.x - t.x; tz = c.z - t.z; speed = run; }
        break;
      case 'hunt':
      case 'follow': {
        if (!t) break;
        const next = c.path[0];
        if (next && Math.hypot(next.x + 0.5 - c.x, next.z + 0.5 - c.z) < 0.6) c.path.shift();
        const aim = c.path[0] ? { x: c.path[0].x + 0.5, y: c.path[0].y, z: c.path[0].z + 0.5 } : t;
        tx = aim.x - c.x; tz = aim.z - c.z; ty = aim.y;
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        speed = c.behaviour === 'hunt' ? run : d > CREATURE_FOLLOW_RADIUS * 0.25 ? walk : 0;
        const reach = c.halfWidth + CREATURE_REACH + (t === view.player ? 0.4 : (t as Creature).halfWidth);
        if (c.behaviour === 'hunt' && d < reach && Math.abs(t.y - c.y) < c.height && c.attackS <= 0) {
          c.attackS = CREATURE_ATTACK_S;
          if (t === view.player) this.events.push({ kind: 'bite', damage: s.attack, x: c.x, z: c.z, species: s });
          else if (this.hurt(t as Creature, Math.max(1, s.attack), c.x, c.z, false)) c.fedS = 0;
        }
        break;
      }
      case 'wander':
        if (c.goal) {
          tx = c.goal.x - c.x; tz = c.goal.z - c.z; ty = c.goal.y; speed = walk * 0.6;
          if (Math.hypot(tx, tz) < 0.8) { c.goal = null; c.behaviour = 'idle'; speed = 0; }
        }
        break;
      case 'herd': {
        // Boids: towards the herd's centre, along its heading, and away from anyone too close.
        let cx = 0, cz = 0, ax = 0, az = 0, sx = 0, sz = 0, n = 0;
        for (const o of all) {
          if (o === c || o.species !== s) continue;
          const d2 = dist2(c, o);
          if (d2 > (CREATURE_HERD_RADIUS * 3) ** 2) continue;
          n++; cx += o.x; cz += o.z; ax += o.vx; az += o.vz;
          if (d2 < (c.halfWidth * 4) ** 2) { sx += c.x - o.x; sz += c.z - o.z; }
        }
        if (n) { tx = (cx / n - c.x) * 0.5 + ax / n * 0.3 + sx * 2; tz = (cz / n - c.z) * 0.5 + az / n * 0.3 + sz * 2; speed = walk * 0.7; }
        if (s.medium === 'air') {
          // Birds circle loosely around the player at BIRD_ALTITUDE over the ground.
          tx += (view.player.x - c.x) * 0.02 + Math.cos(c.walk * 0.01 + c.id) * 2;
          tz += (view.player.z - c.z) * 0.02 + Math.sin(c.walk * 0.01 + c.id) * 2;
          ty = (view.groundY(Math.floor(c.x), Math.floor(c.z)) ?? c.y) + BIRD_ALTITUDE;
          speed = walk;
        }
        break;
      }
      default:
        speed = 0;
    }
    const len = Math.hypot(tx, tz);
    const k = Math.min(1, dt * 8);
    const wantX = len > 0.01 ? (tx / len) * speed : 0, wantZ = len > 0.01 ? (tz / len) * speed : 0;
    // Knockback dies away rather than being overwritten at once.
    c.vx += (wantX - c.vx) * k;
    c.vz += (wantZ - c.vz) * k;
    if (speed > 0 && len > 0.01) c.yaw = Math.atan2(-tx, -tz);
    if (s.medium !== 'land') {
      const goalY = ty ?? c.y;
      c.vy += ((Math.max(-1, Math.min(1, goalY - c.y)) * walk * 0.5) - c.vy) * k;
      if (s.medium === 'water' && !view.isWater(Math.floor(c.x + c.vx * 0.3), Math.floor(c.y + 0.1), Math.floor(c.z + c.vz * 0.3))) {
        c.vx = -c.vx; c.vz = -c.vz; c.goal = null; // turn back at the water's edge
      }
    }
  }
}

/** Gravity, as a share of full: none in a creature's own medium, and land animals float in deep water. */
function gravityOf(c: Creature, view: CreatureView): number {
  const x = Math.floor(c.x), z = Math.floor(c.z);
  if (c.species.medium === 'air') return 0;
  const feet = view.isWater(x, Math.floor(c.y), z);
  if (c.species.medium === 'water') return feet ? 0 : 1;
  if (!feet) return 1;
  return view.isWater(x, Math.floor(c.y + c.height * 0.5), z) ? -0.4 : 0.2;
}

/** The nearest creature whose box a ray from `o` along unit `d` enters within `max`, and the distance (slab method). */
export function rayHitCreature(all: readonly Creature[], o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }, max: number): { creature: Creature; distance: number } | null {
  let best: { creature: Creature; distance: number } | null = null;
  for (const c of all) {
    let t0 = 0, t1 = max;
    const lo = [c.x - c.halfWidth, c.y, c.z - c.halfWidth], hi = [c.x + c.halfWidth, c.y + c.height, c.z + c.halfWidth];
    const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      if (Math.abs(ds[a]!) < 1e-9) { if (os[a]! < lo[a]! || os[a]! > hi[a]!) t0 = Infinity; continue; }
      let ta = (lo[a]! - os[a]!) / ds[a]!, tb = (hi[a]! - os[a]!) / ds[a]!;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1 && (!best || t0 < best.distance)) best = { creature: c, distance: t0 };
  }
  return best;
}
