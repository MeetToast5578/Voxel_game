import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CREATURE_HUNGER_S, INVENTORY_SIZE, metersToBlocks } from '../src/config';
import { CreatureSystem, PLAYER_TARGET, rayHitCreature, type CreatureView } from '../src/creatures/creatures';
import { findPath } from '../src/creatures/pathfinding';
import { CreaturePopulation, type PopulationWorld } from '../src/creatures/population';
import { speciesFor, underCap } from '../src/creatures/spawning';
import { SPECIES_BY_KEY } from '../src/creatures/species';
import { mulberry32 } from '../src/core/random';
import { creatureParts } from '../src/render/creatureMeshes';
import { metaRecord, parseMeta, type WorldMeta } from '../src/storage/save';
import { BlockId } from '../src/world/blocks';

const sp = (key: string) => SPECIES_BY_KEY.get(key)!;
/** Flat ground: solid below y = 0, plus any extra solid cells. */
function flat(extra: Set<string> = new Set()) {
  return (x: number, y: number, z: number) => y < 0 || extra.has(`${x},${y},${z}`);
}
function view(over: Partial<CreatureView> = {}, player = { x: 1000, y: 0, z: 1000, holdingWheat: false, prey: true }): CreatureView {
  const solid = flat();
  return { isSolid: solid, isWater: () => false, isLoaded: () => true, groundY: () => 0, player, night: false, winter: false, rand: mulberry32(7), ...over };
}
function run(sys: CreatureSystem, v: CreatureView, seconds: number, solid = flat()) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...sys.step(1 / 60, v, solid));
  return events;
}

describe('A* pathfinding (T-H6)', () => {
  it('goes round a wall, climbs a step, and stops nearest an unreachable goal', () => {
    const wall = new Set<string>();
    for (let z = -5; z <= 5; z++) for (let y = 0; y < 8; y++) wall.add(`3,${y},${z}`);
    const limits = { height: 3, step: 2, fall: 10, maxNodes: 2000 };
    const around = findPath(flat(wall), { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, limits);
    expect(around.at(-1)).toEqual({ x: 6, y: 0, z: 0 });
    expect(around.every((c) => !wall.has(`${c.x},${c.y},${c.z}`))).toBe(true);
    const ledge = new Set(['1,0,0', '1,1,0', '2,0,0', '2,1,0']);
    expect(findPath(flat(ledge), { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, limits).at(-1)).toEqual({ x: 2, y: 2, z: 0 });
    const boxed = new Set<string>();
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let y = 0; y < 8; y++) boxed.add(`${x},${y},${z}`);
    expect(findPath(flat(boxed), { x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }, limits)).toEqual([]);
  });
});

describe('creature behaviour (T-H5)', () => {
  it('a grazer flees a survival player, but not a creative one, and follows wheat', () => {
    const sys = new CreatureSystem();
    const deer = sys.spawn(sp('deer'), 0.5, 0, 0.5, mulberry32(1));
    const near = { x: 3, y: 0, z: 0.5, holdingWheat: false, prey: true };
    run(sys, view({}, near), 2);
    expect(deer.behaviour).toBe('flee');
    expect(deer.x).toBeLessThan(0);
    run(sys, view({}, { ...near, x: deer.x + 3, holdingWheat: true }), 1);
    expect(deer.behaviour).toBe('follow');
    run(sys, view({}, { ...near, x: deer.x + 3, prey: false }), 1);
    expect(['flee', 'follow']).not.toContain(deer.behaviour);
  });

  it('a hungry wolf hunts and eats a rabbit; then it is fed', () => {
    const sys = new CreatureSystem();
    const wolf = sys.spawn(sp('wolf'), 0.5, 0, 0.5, mulberry32(2));
    wolf.fedS = CREATURE_HUNGER_S + 1;
    const rabbit = sys.spawn(sp('rabbit'), 6.5, 0, 0.5, mulberry32(3));
    const events = run(sys, view({ night: true }), 20);
    expect(sys.entities.get(rabbit.id)).toBeUndefined();
    expect(events.some((e) => e.kind === 'death' && e.creature === rabbit && !e.byPlayer)).toBe(true);
    expect(wolf.fedS).toBeLessThan(20);
  });

  it('a hostile hunts and bites a survival player at night', () => {
    const sys = new CreatureSystem();
    const zombie = sys.spawn(sp('zombie'), 0.5, 0, 0.5, mulberry32(4));
    const events = run(sys, view({ night: true }, { x: 8, y: 0, z: 0.5, holdingWheat: false, prey: true }), 8);
    expect(zombie.target).toBe(PLAYER_TARGET);
    expect(events.some((e) => e.kind === 'bite' && e.damage === sp('zombie').attack)).toBe(true);
  });

  it('day animals sleep at night, and herds keep together', () => {
    const sys = new CreatureSystem();
    const cow = sys.spawn(sp('cow'), 0.5, 0, 0.5, mulberry32(5));
    run(sys, view({ night: true }), 2);
    expect(cow.behaviour).toBe('sleep');
    const bear = sys.spawn(sp('bear'), 20.5, 0, 0.5, mulberry32(12));
    run(sys, view({ winter: true }), 2);
    expect(bear.behaviour).toBe('sleep'); // hibernating by day
    const herd = new CreatureSystem();
    const a = herd.spawn(sp('sheep'), 0.5, 0, 0.5, mulberry32(6)), b = herd.spawn(sp('sheep'), 30.5, 0, 0.5, mulberry32(7));
    const start = b.x - a.x;
    run(herd, view(), 10);
    expect(b.x - a.x).toBeLessThan(start);
  });

  it('walks up a ledge as high as the player steps, and land animals float in deep water', () => {
    const sys = new CreatureSystem();
    const ledge = new Set<string>();
    for (let x = 3; x < 40; x++) for (let z = -5; z <= 5; z++) { ledge.add(`${x},0,${z}`); ledge.add(`${x},1,${z}`); }
    const deer = sys.spawn(sp('deer'), 0.5, 0, 0.5, mulberry32(8));
    run(sys, view({ isSolid: flat(ledge) }, { x: -2, y: 0, z: 0.5, holdingWheat: false, prey: true }), 0.1, flat(ledge));
    run(sys, view({ isSolid: flat(ledge) }, { x: -3, y: 0, z: 0.5, holdingWheat: false, prey: true }), 3, flat(ledge));
    expect(deer.y).toBeCloseTo(2, 0);
    const swimmer = new CreatureSystem();
    const cow = swimmer.spawn(sp('cow'), 0.5, -8, 0.5, mulberry32(9));
    const water = view({ isWater: (_x, y) => y < 0 && y >= -10, isSolid: (_x, y) => y < -10 });
    run(swimmer, water, 6, (_x, y) => y < -10);
    expect(cow.y).toBeGreaterThan(-3);
  });

  it('player hits knock a creature back, and it dies with the player as the killer', () => {
    const sys = new CreatureSystem();
    const boar = sys.spawn(sp('boar'), 0.5, 0, 0.5, mulberry32(10));
    expect(sys.hurt(boar, 3, -2, 0.5, true)).toBe(false);
    expect(boar.vx).toBeGreaterThan(0);
    expect(boar.provoked).toBe(true);
    expect(sys.hurt(boar, 100, -2, 0.5, true)).toBe(true);
    expect(run(sys, view(), 1 / 60)).toEqual([expect.objectContaining({ kind: 'death', byPlayer: true })]);
    const hit = rayHitCreature([sys.spawn(sp('cow'), 5.5, 0, 0.5, mulberry32(11))], { x: 0, y: 1, z: 0.5 }, { x: 1, y: 0, z: 0 }, 20);
    expect(hit?.distance).toBeCloseTo(5.5 - sp('cow').halfWidth);
  });
});

describe('creature population (T-H2, T-H7..T-H9)', () => {
  function world(over: Partial<PopulationWorld> = {}): PopulationWorld {
    const keys = ['0,0', '1,0'];
    return { seed: 1, columnKeys: () => keys, topAt: () => -1, getBlock: (_x, y) => (y < 0 ? BlockId.GRASS : BlockId.AIR), isLoadedAt: () => true, biomeAt: () => 'plains', ...over };
  }

  it('spawns biome wildlife under its cap, and fish only in water', () => {
    expect(speciesFor('plains').map((s) => s.key)).toEqual(expect.arrayContaining(['deer', 'sheep', 'cow', 'rabbit']));
    expect(speciesFor('plains').some((s) => s.hostile)).toBe(false);
    const sys = new CreatureSystem(), pop = new CreaturePopulation();
    let total = 0;
    for (let i = 0; i < 40; i++) total += pop.spawnGroup(sys, world(), 0, 0, mulberry32(i));
    expect(total).toBeGreaterThan(0);
    for (const s of speciesFor('plains')) expect(underCap(sys.all(), s, 8, 8) || sys.all().filter((c) => c.species === s).length > 0).toBe(true);
    const counts = new Map<string, number>();
    for (const c of sys.all()) counts.set(c.species.key, (counts.get(c.species.key) ?? 0) + 1);
    for (const [key, n] of counts) expect(n).toBeLessThanOrEqual(sp(key).group[1] * 4);
    const wet = new CreatureSystem();
    pop.spawnGroup(wet, world({ getBlock: (_x, y) => (y <= -1 ? BlockId.WATER : BlockId.AIR), biomeAt: () => 'lake' }), 0, 0, mulberry32(3));
    expect(wet.all().every((c) => c.species.key === 'fish')).toBe(true);
  });

  it('stores the creatures of an unloaded column, brings them back, and saves them', () => {
    const sys = new CreatureSystem(), pop = new CreaturePopulation();
    const w = world({ columnKeys: () => ['0,0'] });
    pop.update(1, sys, w, { x: 0, y: 0, z: 0 }, false, mulberry32(1));
    sys.spawn(sp('cow'), CHUNK_SIZE + 2.5, 0, 2.5, mulberry32(2));
    const before = sys.count;
    pop.update(1, sys, w, { x: 0, y: 0, z: 0 }, false, mulberry32(1)); // column 1,0 is not loaded: the cow is stored
    expect(sys.count).toBe(before - 1);
    expect(pop.snapshot(sys).creatures.some((c) => c.species === 'cow')).toBe(true);
    pop.update(1, sys, world(), { x: 0, y: 0, z: 0 }, false, mulberry32(1));
    expect(sys.all().some((c) => c.species.key === 'cow')).toBe(true);
    const meta: WorldMeta = { seed: 1, selectedSlot: 0, player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false }, inventory: new Array(INVENTORY_SIZE).fill(null),
      items: [], timeOfDay: 0.5, timeOfYear: 0, gameMode: 'survival', health: 20, hunger: 20, air: 15, ...{ creatures: pop.snapshot(sys).creatures, creatureColumns: pop.snapshot(sys).populated } };
    const parsed = parseMeta(metaRecord(meta))!;
    expect(parsed.creatures).toEqual(meta.creatures);
    expect(parsed.creatureColumns).toEqual(meta.creatureColumns);
    expect(parseMeta({ ...metaRecord(meta), creatures: [{ species: 'dragon', x: 0, y: 0, z: 0, health: 1, yaw: 0 }] })!.creatures).toEqual([]);
  });

  it('hostiles spawn on the surface only at night, and not near light underground; daylight sends them away', () => {
    const sys = new CreatureSystem(), pop = new CreaturePopulation();
    const p = { x: 0, y: 0, z: 0 };
    expect(pop.spawnHostile(sys, world(), p, false, mulberry32(1))).toBeNull();
    const zombie = pop.spawnHostile(sys, world(), p, true, mulberry32(1));
    expect(zombie?.species.key).toBe('zombie');
    expect(Math.hypot(zombie!.x - p.x, zombie!.z - p.z)).toBeGreaterThan(metersToBlocks(11));
    // Under a roof (top far above), only a dark spot spawns.
    const cave = world({ topAt: () => 50, getBlock: (_x, y) => (y < 0 || y > 40 ? BlockId.STONE : BlockId.AIR) });
    expect(pop.spawnHostile(new CreatureSystem(), cave, p, false, mulberry32(2))).not.toBeNull();
    const lit = world({ topAt: () => 50, getBlock: (x, y, z) => (y < 0 || y > 40 ? BlockId.STONE : (x + z) % 3 === 0 && y === 2 ? BlockId.GLOWSTONE : BlockId.AIR) });
    expect(pop.spawnHostile(new CreatureSystem(), lit, p, false, mulberry32(2))).toBeNull();
    pop.update(1, sys, world(), p, false, mulberry32(3));
    expect(sys.entities.get(zombie!.id)).toBeUndefined();
  });
});

describe('creature models (T-H4)', () => {
  it('four-legged animals swing their legs while walking and lower the head to graze', () => {
    const sys = new CreatureSystem();
    const cow = sys.spawn(sp('cow'), 0, 0, 0, mulberry32(1));
    const still = creatureParts(cow, 0);
    expect(still).toHaveLength(7);
    expect(still.every((p) => (p.rot?.[0] ?? 0) === 0)).toBe(true);
    Object.assign(cow, { vx: cow.species.speed, walk: 1 });
    expect(creatureParts(cow, 0).some((p) => Math.abs(p.rot?.[0] ?? 0) > 0.05)).toBe(true);
    Object.assign(cow, { vx: 0, behaviour: 'graze' });
    expect(creatureParts(cow, 0)[1]!.c[1]).toBeLessThan(still[1]!.c[1]);
  });
});
