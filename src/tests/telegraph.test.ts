import { describe, expect, it } from 'vitest';
import { WINDUP_S } from '../config';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { COLLISION } from '../game/collision';
import { Creatures, type CreatureContext } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import { biomeIndex } from '../worldgen/biomes';

function plain() {
  const world = new World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) for (let cy = -1; cy <= 1; cy++) {
    const col = world.add(new Chunk(cx, cy, cz, cy < 0 ? BLOCKS.state('grass') : 0, cy < 0 ? 0 : 15));
    col.biome.fill(biomeIndex('plains'));
    col.surface.fill(-1);
    col.water.fill(-1000);
  }
  return world;
}
const player = () => ({ x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true });
const ctx = (world: World, p = player()): CreatureContext => ({
  player: p, survival: true, day: false, hostiles: 1, boxAt: (x, y, z) => COLLISION[world.get(x, y, z)]!, waterAt: () => false,
});

describe('telegraphed attacks', () => {
  it('a monster winds up before its bite lands, and a step back dodges it', () => {
    const world = plain();
    let bitten = 0;
    const cs = new Creatures(world, mulberry32(2), { bite: (d) => (bitten += d), sound: () => undefined });
    const z = cs.add(SPECIES_BY_KEY.get('zombie')!, 1.6, 0, 0.5, 20);
    const p = player(), c = ctx(world, p);
    let frames = 0;
    while (!z.windup && frames++ < 120) cs.update(1 / 60, c);
    expect(z.windup).toBeGreaterThan(0);
    expect(bitten).toBe(0);
    // Standing still: the bite lands once the wind-up ends.
    for (let i = 0; i < (WINDUP_S + 0.1) * 60; i++) cs.update(1 / 60, c);
    expect(bitten).toBeGreaterThan(0);

    // A second zombie: the player steps well back during the wind-up, and it misses.
    bitten = 0;
    const w2 = plain(), cs2 = new Creatures(w2, mulberry32(2), { bite: (d) => (bitten += d), sound: () => undefined });
    const z2 = cs2.add(SPECIES_BY_KEY.get('zombie')!, 1.6, 0, 0.5, 20);
    const p2 = player(), c2 = ctx(w2, p2);
    frames = 0;
    while (!z2.windup && frames++ < 120) cs2.update(1 / 60, c2);
    p2.x = -4;
    for (let i = 0; i < (WINDUP_S + 0.05) * 60; i++) cs2.update(1 / 60, c2);
    expect(z2.windup).toBe(0);
    expect(bitten).toBe(0);
  });

  it('the Slime King slams: the landing hurts a player on the ground near it, but not one who stepped away', () => {
    const hits = (away: boolean) => {
      const world = plain();
      let bitten = 0;
      const said: string[] = [];
      const cs = new Creatures(world, mulberry32(3), { bite: (d) => (bitten += d), sound: () => undefined, boss: (_c, w) => said.push(w) });
      const king = cs.add(SPECIES_BY_KEY.get('king_slime')!, 8, 0, 0.5, 200);
      king.special = 0;
      const p = player(), c = ctx(world, p);
      for (let i = 0; i < 60 * 4 && !said.includes('land'); i++) {
        if (away && king.move?.struck) p.x = -12;
        cs.update(1 / 60, c);
      }
      expect(said.slice(0, 2)).toEqual(['slam', 'land']);
      return bitten;
    };
    expect(hits(false)).toBeGreaterThan(0);
    expect(hits(true)).toBe(0);
  });

  it('the Matriarch dives at where the player stood', () => {
    const world = plain();
    let bitten = 0;
    const said: string[] = [];
    const cs = new Creatures(world, mulberry32(3), { bite: (d) => (bitten += d), sound: () => undefined, boss: (_c, w) => said.push(w) });
    const moth = cs.add(SPECIES_BY_KEY.get('gloom_matriarch')!, 6, 3, 0.5, 200);
    moth.special = 0;
    const c = ctx(world);
    for (let i = 0; i < 60 * 4 && bitten === 0; i++) cs.update(1 / 60, c);
    expect(said[0]).toBe('dive');
    expect(bitten).toBeGreaterThan(0);
  });

  it('the Frost Colossus stomps round itself and hurls ice boulders', () => {
    const world = plain();
    let bitten = 0;
    const said: string[] = [], shots: (string | undefined)[] = [];
    const cs = new Creatures(world, mulberry32(5), { bite: (d) => (bitten += d), sound: () => undefined, boss: (_c, w) => said.push(w),
      shoot: (_c, _x, _y, _z, item) => shots.push(item) });
    const giant = cs.add(SPECIES_BY_KEY.get('frost_colossus')!, 3.5, 0, 0.5, 420);
    const c = ctx(world);
    for (let i = 0; i < 60 * 40 && !(said.includes('stomp') && said.includes('boulder')); i++) {
      if (!giant.move && !giant.windup) giant.body.x = 3.5;
      cs.update(1 / 60, c);
    }
    expect(said).toContain('stomp');
    expect(said).toContain('boulder');
    for (let i = 0; i < 60; i++) cs.update(1 / 60, c);
    expect(shots).toContain('ice');
    expect(bitten).toBeGreaterThan(0);
  });

  it('every boss has a summon item that is made somewhere, and a treasure bag', async () => {
    const { SPECIES } = await import('../creatures/species');
    const { RECIPES } = await import('../game/crafting');
    for (const s of SPECIES.filter((s) => s.boss)) {
      expect(s.summon, s.key).toBeDefined();
      expect(RECIPES.some((r) => r.result[0] === s.summon!.item), s.key).toBe(true);
      expect(BLOCKS.type(BLOCKS.state(`${s.key}_bag`)).bag).toBe(s.key);
    }
  });

  it('a boss turns enraged below half health and calls a brood', () => {
    const world = plain();
    const said: string[] = [];
    const cs = new Creatures(world, mulberry32(3), { bite: () => undefined, sound: () => undefined, boss: (_c, w) => said.push(w) });
    const king = cs.add(SPECIES_BY_KEY.get('king_slime')!, 8, 0, 0.5, 100);
    cs.damage(king, 20, 0, 0);
    expect(king.phase).toBeUndefined();
    const before = cs.list.length;
    cs.damage(king, 40, 0, 0);
    expect(king.phase).toBe(2);
    expect(said).toContain('enraged');
    expect(cs.list.length - before).toBeGreaterThanOrEqual(3);
  });
});
