import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { COLLISION } from '../game/collision';
import { aimAt, Projectiles } from '../game/projectiles';
import { Creatures, lootOf, type CreatureContext } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import { biomeIndex } from '../worldgen/biomes';

const S = (key: string) => BLOCKS.state(key);

/**
 * A stone world with a closed cave room around y = ycave (cells): floor below, 6 cells of air. `blockLight` fills the
 * room (as torches would). The surface is far above, so it counts as underground.
 */
function cave(ycave: number, blockLight: number) {
  const world = new World();
  const cy0 = Math.floor(ycave / 16) - 1;
  for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) for (let cy = cy0; cy <= cy0 + 3; cy++) {
    const c = new Chunk(cx, cy, cz, S('stone'), 0);
    const col = world.add(c);
    col.surface.fill(1000);
    col.biome.fill(biomeIndex('plains'));
    col.water.fill(-100000);
  }
  for (let x = -120; x < 120; x++) for (let z = -120; z < 120; z++) for (let y = ycave; y < ycave + 6; y++) world.set(x, y, z, 0);
  if (blockLight > 0) for (const c of world.chunks.values()) for (let i = 0; i < 4096; i++) c.setLight(i, 0, blockLight);
  return world;
}

const body = (x: number, y: number, z: number) => ({ x, y, z, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true });

function spawnCount(world: World, y: number, steps = 400): number {
  const cs = new Creatures(world, mulberry32(5), { bite: () => undefined, sound: () => undefined });
  const ctx: CreatureContext = { player: body(0.5, y, 0.5), survival: true, day: true, hostiles: 1,
    boxAt: (x, yy, z) => COLLISION[world.get(x, yy, z)]!, waterAt: () => false };
  let seen = 0;
  for (let i = 0; i < steps; i++) {
    cs.update(1.5, ctx); // one spawn attempt per step
    seen = Math.max(seen, cs.list.filter((c) => c.species.hostile).length);
    cs.list.length = 0;
  }
  return seen;
}

describe('danger', () => {
  it('spawns monsters in dark caves, never in a torch-lit room', () => {
    expect(spawnCount(cave(-20, 0), -20)).toBeGreaterThan(0);
    expect(spawnCount(cave(-20, 12), -20)).toBe(0);
  });

  it('makes monsters tougher deep down, and frost brutes only deep', () => {
    const tally = (y: number) => {
      const world = cave(y, 0), cs = new Creatures(world, mulberry32(9), { bite: () => undefined, sound: () => undefined });
      const ctx: CreatureContext = { player: body(0.5, y, 0.5), survival: true, day: true, hostiles: 1,
        boxAt: (x, yy, z) => COLLISION[world.get(x, yy, z)]!, waterAt: () => false };
      const keys = new Set<string>(), health: number[] = [];
      for (let i = 0; i < 400; i++) {
        cs.update(1.5, ctx);
        for (const c of cs.list) {
          keys.add(c.species.key);
          health.push(c.health / c.species.health);
        }
        cs.list.length = 0;
      }
      return { keys, toughness: Math.max(...health) };
    };
    const shallow = tally(-20), deep = tally(-300);
    expect(deep.toughness).toBeGreaterThan(shallow.toughness);
    expect(shallow.keys.has('brute')).toBe(false);
    expect(deep.keys.has('brute')).toBe(true);
  });

  it('leaves loot that feeds recipes', () => {
    const c = { species: SPECIES_BY_KEY.get('crawler')! } as Parameters<typeof lootOf>[0];
    expect(lootOf(c).map((l) => BLOCKS.stateName(l.state))).toEqual(['string']);
  });

  it('flies arrows under gravity onto what they are aimed at', () => {
    const p = new Projectiles(), target = body(30, 0, 0.5);
    const [dx, dy, dz] = aimAt(0.5, 3, 0.5, target.x, target.y + 2, target.z, 50);
    p.shoot(0.5, 3, 0.5, dx, dy, dz, 50, 5, true);
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) hit = p.update(1 / 60, () => 0, () => [target])[0] ?? null;
    expect(hit?.kind).toBe('body');
  });
});

describe('monster behaviour', () => {
  /** A flat lit plain, ground below y = 0, with optional extra solid cells. */
  function plain(extra: (x: number, y: number, z: number) => boolean = () => false) {
    const world = new World();
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) for (let cy = -1; cy <= 1; cy++) {
      const col = world.add(new Chunk(cx, cy, cz, cy < 0 ? S('grass') : 0, cy < 0 ? 0 : 15));
      col.biome.fill(biomeIndex('plains'));
      col.surface.fill(-1);
      col.water.fill(-1000);
    }
    const boxAt = (x: number, y: number, z: number) => (extra(x, y, z) ? COLLISION[S('stone')]! : COLLISION[world.get(x, y, z)]!);
    return { world, boxAt };
  }

  it('skulkers keep their distance and shoot at night', () => {
    const { world, boxAt } = plain();
    let shots = 0;
    const cs = new Creatures(world, mulberry32(2), { bite: () => undefined, sound: () => undefined, shoot: () => shots++ });
    const sk = cs.add(SPECIES_BY_KEY.get('skulker')!, 12, 0, 0.5, 14);
    for (let i = 0; i < 600; i++) cs.update(1 / 60, { player: body(0.5, 0, 0.5), survival: true, day: false, hostiles: 0.0001, boxAt, waterAt: () => false });
    expect(shots).toBeGreaterThan(0);
    expect(Math.hypot(sk.body.x - 0.5, sk.body.z - 0.5)).toBeGreaterThan(8);
  });

  it('cave crawlers climb walls that stop other monsters', () => {
    const wall = (x: number, y: number) => x === 4 && y >= 0 && y < 6;
    for (const key of ['crawler', 'zombie']) {
      const { world, boxAt } = plain(wall);
      const cs = new Creatures(world, mulberry32(3), { bite: () => undefined, sound: () => undefined });
      const c = cs.add(SPECIES_BY_KEY.get(key)!, 1.5, 0, 0.5, 20);
      for (let i = 0; i < 600; i++) cs.update(1 / 60, { player: body(12.5, 0, 0.5), survival: true, day: false, hostiles: 0.0001, boxAt, waterAt: () => false });
      if (key === 'crawler') expect(c.body.x).toBeGreaterThan(5);
      else expect(c.body.y).toBeLessThan(1);
    }
  });

  it('a fleeing deer goes round a wall instead of stopping at it', () => {
    // A wall along x = 6 from z = -4 to 4: the deer starts west of it and the player chases from further west.
    const { world, boxAt } = plain((x, y, z) => x === 6 && y >= 0 && y < 4 && z >= -4 && z <= 4);
    const cs = new Creatures(world, mulberry32(4), { bite: () => undefined, sound: () => undefined });
    const deer = cs.add(SPECIES_BY_KEY.get('deer')!, 4.5, 0, 0.5, 10);
    for (let i = 0; i < 900; i++) cs.update(1 / 60, { player: body(0.5, 0, 0.5), survival: true, day: true, hostiles: 1, boxAt, waterAt: () => false });
    expect(deer.body.x).toBeGreaterThan(7);
  });
});
