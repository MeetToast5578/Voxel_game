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
function plain() {
  const world = new World();
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) for (let cy = -1; cy <= 1; cy++) {
    const c = new Chunk(cx, cy, cz, cy < 0 ? BLOCKS.state('grass') : 0, cy < 0 ? 0 : 15);
    const col = world.add(c);
    col.biome.fill(biomeIndex('plains'));
    col.surface.fill(-1);
    col.water.fill(-1000);
  }
  return world;
}

const player = () => ({ x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true });
const ctx = (world: World, p = player(), survival = true, day = true): CreatureContext => ({
  player: p, survival, day, boxAt: (x, y, z) => COLLISION[world.get(x, y, z)]!, waterAt: () => false,
});

describe('creatures', () => {
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
    const plainsKinds = new Set(['deer', 'rabbit', 'sheep', 'cow']);
    for (const c of cs.list) expect(plainsKinds.has(c.species.key)).toBe(true);
    const back = new Creatures(world, mulberry32(5), { bite: () => undefined, sound: () => undefined });
    back.load(JSON.parse(JSON.stringify(cs.save())));
    expect(back.save()).toEqual(cs.save());
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
