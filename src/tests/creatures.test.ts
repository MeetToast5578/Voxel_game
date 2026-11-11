import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { COLLISION } from '../game/collision';
import { Creatures, meatOf, type CreatureContext } from '../creatures/creatures';
import { findPath } from '../creatures/pathfinding';
import { SPECIES_BY_KEY } from '../creatures/species';
import { biomeIndex } from '../worldgen/biomes';

/** A flat grass plain (ground below y = 0) with plains biome everywhere, lit by the sky. */
function plain(biome='plains') {
  const world = new World();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) for (let cy = -1; cy <= 1; cy++) {
    const c = new Chunk(cx, cy, cz, cy < 0 ? BLOCKS.state('grass') : 0, cy < 0 ? 0 : 15);
    const col = world.add(c);
    col.biome.fill(biomeIndex(biome));
    col.surface.fill(-1);
    col.water.fill(-1000);
  }
  return world;
}

const player = () => ({ x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true });
const ctx = (world: World, p = player(), survival = true, day = true, hostiles = 1): CreatureContext => ({
  player: p, survival, day, hostiles, boxAt: (x, y, z) => COLLISION[world.get(x, y, z)]!, waterAt: () => false,
});

describe('creatures', () => {
  it('lets animals sleep but never monsters', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(2), { bite: () => undefined, sound: () => undefined });
    const deer = cs.add(SPECIES_BY_KEY.get('deer')!, 30, 0, 30, 10), zombie = cs.add(SPECIES_BY_KEY.get('zombie')!, -30, 0, 30, 20);
    // Night: deer sleep, the zombie (out in its own hour) is awake. Day: the zombie lingers, it does not sleep.
    for (let i = 0; i < 60; i++) cs.update(1 / 60, ctx(world, player(), false, false));
    expect(deer.mode).toBe('sleep');
    expect(zombie.mode).not.toBe('sleep');
    for (let i = 0; i < 60; i++) cs.update(1 / 60, ctx(world, player(), false, true, 1));
    if (cs.list.includes(zombie)) expect(zombie.mode).not.toBe('sleep');
  });

  it('villagers stay near home by day and go to bed at night', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(6), { bite: () => undefined, sound: () => undefined });
    const v = cs.add(SPECIES_BY_KEY.get('farmer')!, 10.5, 0, 10.5, 30);
    v.home = [20.5, 0, 10.5];
    let farthest = 0;
    for (let i = 0; i < 60 * 60; i++) {
      cs.update(1 / 60, ctx(world, player(), false, true));
      farthest = Math.max(farthest, Math.hypot(v.body.x - 20.5, v.body.z - 10.5));
    }
    expect(farthest).toBeLessThan(25);
    for (let i = 0; i < 60 * 40; i++) cs.update(1 / 60, ctx(world, player(), false, false));
    expect(v.mode).toBe('sleep');
    expect(Math.hypot(v.body.x - 20.5, v.body.z - 10.5)).toBeLessThan(1);
    expect(cs.save().some((e) => e[0] === 'farmer')).toBe(false); // villagers come back from their houses, not the save
  });

  it('slimes move in hops and bats fly above the ground', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(3), { bite: () => undefined, sound: () => undefined });
    const slime = cs.add(SPECIES_BY_KEY.get('slime')!, 12, 0, 0.5, 8), bat = cs.add(SPECIES_BY_KEY.get('bat')!, -12, 0, 0.5, 4);
    let airborne = 0, grounded = 0, high = 0;
    for (let i = 0; i < 600; i++) {
      cs.update(1 / 60, ctx(world, player(), true, true));
      if (slime.body.onGround) grounded++; else airborne++;
      if (bat.body.y > 1.5) high++;
    }
    expect(airborne).toBeGreaterThan(20);
    expect(grounded).toBeGreaterThan(20);
    expect(slime.body.x).toBeLessThan(11); // hopped towards the player
    expect(high).toBeGreaterThan(300);
  });

  it('grazers run from the player', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(1), { bite: () => undefined, sound: () => undefined });
    const deer = cs.add(SPECIES_BY_KEY.get('deer')!, 6, 0, 0.5, 10);
    const c = ctx(world);
    for (let i = 0; i < 30; i++) cs.update(1 / 60, c);
    expect(deer.mode).toBe('flee');
    for (let i = 0; i < 90; i++) cs.update(1 / 60, c);
    expect(deer.body.x).toBeGreaterThan(8);
  });

  it('monsters hunt and bite the player in survival only', () => {
    const world = plain();
    let bitten = 0;
    const cs = new Creatures(world, mulberry32(2), { bite: (d) => (bitten += d), sound: () => undefined });
    cs.add(SPECIES_BY_KEY.get('zombie')!, 5, 0, 0.5, 20);
    for (let i = 0; i < 600; i++) cs.update(1 / 60, ctx(world, player(), true, false));
    expect(bitten).toBeGreaterThan(0);
    const calm = new Creatures(world, mulberry32(2), { bite: () => (bitten = -1), sound: () => undefined });
    calm.add(SPECIES_BY_KEY.get('zombie')!, 5, 0, 0.5, 20);
    bitten = 0;
    for (let i = 0; i < 600; i++) calm.update(1 / 60, ctx(world, player(), false, false));
    expect(bitten).toBe(0);
  });

  it('keeps no monsters on peaceful, but leaves animals alone', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(4), { bite: () => undefined, sound: () => undefined });
    cs.add(SPECIES_BY_KEY.get('zombie')!, 5, 0, 0.5, 20);
    cs.add(SPECIES_BY_KEY.get('cow')!, -5, 0, 0.5, 10);
    cs.update(1 / 60, ctx(world, player(), true, false, 0));
    expect(cs.list.some((c) => c.species.hostile)).toBe(false);
    expect(cs.list.some((c) => c.species.key === 'cow')).toBe(true);
  });

  it('can be hit by a ray, dies, and leaves meat', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(3), { bite: () => undefined, sound: () => undefined });
    const cow = cs.add(SPECIES_BY_KEY.get('cow')!, 4, 0, 0.5, 10);
    const hit = cs.raycast(0.5, 1.5, 0.5, 1, 0, 0, 10)!;
    expect(hit.creature).toBe(cow);
    expect(cs.raycast(0.5, 1.5, 0.5, -1, 0, 0, 10)).toBeNull();
    expect(cs.damage(cow, 4, 0, 0)).toBe(false);
    expect(cs.damage(cow, 6, 0, 0)).toBe(true);
    expect(cs.list).not.toContain(cow);
    expect(meatOf(cow)).toEqual({ state: BLOCKS.state('raw_meat'), count: 3 });
  });

  it('saves and loads, and spawns species that fit the biome', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(4), { bite: () => undefined, sound: () => undefined });
    for (let i = 0; i < 60 * 60; i++) cs.update(1 / 60, ctx(world));
    expect(cs.list.length).toBeGreaterThan(0);
    const plainsKinds = new Set(['deer', 'rabbit', 'sheep', 'cow', 'trader', 'slime']);
    for (const c of cs.list) expect(plainsKinds.has(c.species.key)).toBe(true);
    const back = new Creatures(world, mulberry32(5), { bite: () => undefined, sound: () => undefined });
    back.load(JSON.parse(JSON.stringify(cs.save())));
    expect(back.save()).toEqual(cs.save());
  });

  it('spawns the three new monsters only in their matching biomes and keeps peaceful mode safe',()=>{
    const keys=['desert_stalker','swamp_hollow','snow_prowler'];
    for(const [biome,wanted] of [['desert','desert_stalker'],['swamp','swamp_hollow'],['snowy_taiga','snow_prowler']]){
      const world=plain(biome),cs=new Creatures(world,mulberry32(31),{bite:()=>undefined,sound:()=>undefined});
      const seen=new Set<string>();
      for(let i=0;i<100;i++){cs.update(1.5,ctx(world,player(),true,false));for(const c of cs.list)seen.add(c.species.key);cs.list.length=0;}
      expect(seen.has(wanted!),biome).toBe(true);
      for(const key of keys)if(key!==wanted)expect(seen.has(key),biome).toBe(false);
      cs.add(SPECIES_BY_KEY.get(wanted!)!,2,0,0.5,20);cs.update(1/60,ctx(world,player(),true,false,0));
      expect(cs.list.some(c=>c.species.hostile)).toBe(false);
    }
  });

  it('hunters walk round a wall to reach the player', () => {
    const world = plain();
    for (let z = -5; z <= 5; z++) for (let y = 0; y < 5; y++) world.set(3, y, z, BLOCKS.state('stone'));
    let bitten = 0;
    const cs = new Creatures(world, mulberry32(3), { bite: (d) => (bitten += d), sound: () => undefined });
    cs.add(SPECIES_BY_KEY.get('zombie')!, 7.5, 0, 0.5, 20);
    for (let i = 0; i < 60 * 20 && bitten === 0; i++) cs.update(1 / 60, ctx(world, player(), true, false));
    expect(bitten).toBeGreaterThan(0);
  });
});

describe('path-finding', () => {
  const flat = (walls: Set<string>) => (x: number, y: number, z: number) => y < 0 || walls.has(`${x},${y},${z}`);
  const cells = (p: number[]) => Array.from({ length: p.length / 3 }, (_, i) => p.slice(i * 3, i * 3 + 3).join(','));
  const limits = { height: 3, step: 2, fall: 10, maxNodes: 2000 };

  it('goes round a wall, climbs a step, and stops nearest an unreachable goal', () => {
    const wall = new Set<string>();
    for (let z = -5; z <= 5; z++) for (let y = 0; y < 8; y++) wall.add(`3,${y},${z}`);
    const around = cells(findPath(flat(wall), 0, 0, 0, 6, 0, 0, limits));
    expect(around.at(-1)).toBe('6,0,0');
    expect(around.every((c) => !wall.has(c))).toBe(true);
    const ledge = new Set(['1,0,0', '1,1,0', '2,0,0', '2,1,0']);
    expect(cells(findPath(flat(ledge), 0, 0, 0, 2, 2, 0, limits)).at(-1)).toBe('2,2,0');
    const boxed = new Set<string>();
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let y = 0; y < 8; y++) boxed.add(`${x},${y},${z}`);
    expect(findPath(flat(boxed), 0, 0, 0, 9, 0, 0, limits)).toEqual([]);
  });
});

describe('nothing gets stuck', () => {
  it('never spawns a creature inside a block, even among close pillars', () => {
    const world = plain();
    // Stone pillars on every other cell: only every other cell is open to stand in.
    for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) if ((x + z) & 1) for (let y = 0; y < 4; y++) world.set(x, y, z, BLOCKS.state('stone'));
    const cs = new Creatures(world, mulberry32(7), { bite: () => undefined, sound: () => undefined });
    for (let i = 0; i < 60 * 120; i++) cs.update(1 / 60, ctx(world, player(), true, false));
    expect(cs.list.length).toBeGreaterThan(3);
    for (const c of cs.list) expect(COLLISION[world.get(Math.floor(c.body.x), Math.floor(c.body.y), Math.floor(c.body.z))], c.species.key).toBe(0);
  });

  it('lets a boss go once the player is far away', () => {
    const world = plain();
    const cs = new Creatures(world, mulberry32(3), { bite: () => undefined, sound: () => undefined });
    const king = cs.add(SPECIES_BY_KEY.get('king_slime')!, 10, 0, 10, 240);
    const far = { ...player(), x: 2000, z: 2000 };
    cs.update(1 / 60, ctx(world, far, true, true));
    expect(cs.list.includes(king)).toBe(false);
  });
});

describe('archers', () => {
  it('skeletons stop and draw before each shot', () => {
    const world = plain();
    const shots: number[] = [];
    const cs = new Creatures(world, mulberry32(5), { bite: () => undefined, sound: () => undefined, shoot: (c) => shots.push(Math.hypot(c.body.vx, c.body.vz)) });
    const skel = cs.add(SPECIES_BY_KEY.get('skeleton')!, 18.5, 0, 0.5, 22);
    for (let i = 0; i < 60 * 12; i++) cs.update(1 / 60, ctx(world, player(), true, false));
    expect(skel.mode).toBe('hunt');
    expect(shots.length).toBeGreaterThanOrEqual(3);
    // Standing still at the moment of release: the draw is the warning.
    for (const v of shots) expect(v).toBeLessThan(0.2);
  });

  it('an arrow hits a player who stands still and misses one who steps aside', async () => {
    const { Projectiles, aimAt } = await import('../game/projectiles');
    const { toCells, BOLT_SPEED_M_S } = await import('../config');
    const fly = (sidestep: number) => {
      const p = new Projectiles(), body = { ...player(), x: 0.5, z: 0.5 }, speed = toCells(BOLT_SPEED_M_S);
      p.shoot(18.5, 2.5, 0.5, ...aimAt(18.5, 2.5, 0.5, body.x, body.y + body.height * 0.7, body.z, speed), speed, 4, false);
      for (let t = 0; t < 3; t += 1 / 60) {
        body.z += sidestep / 60;
        if (p.update(1 / 60, (_x, y) => (y < 0 ? 1 : 0), () => [body]).some((h) => h.kind === 'body')) return true;
      }
      return false;
    };
    expect(fly(0)).toBe(true);
    expect(fly(toCells(4.5))).toBe(false);
  });
});
