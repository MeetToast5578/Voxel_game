import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, CHUNK_SIZE, CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Journal, MILESTONES, type JournalFacts } from '../game/journal';
import { lootTableFor, rollLoot } from '../game/loot';
import { Play } from '../game/play';
import { Generator } from '../worldgen/generator';
import { siteIn, sitesNear, structureCells } from '../worldgen/structures';

const S = (key: string, v = 0) => BLOCKS.state(key, v);

/** Every state generated in the chunks of a site's footprint, from y0 to y1 (chunk rows). */
function statesAround(gen: Generator, x: number, z: number, cy0: number, cy1: number): Map<string, number> {
  const out = new Uint16Array(CHUNK_VOLUME), counts = new Map<string, number>();
  for (let cz = Math.floor((z - 8) / CHUNK_SIZE); cz <= Math.floor((z + 8) / CHUNK_SIZE); cz++)
    for (let cx = Math.floor((x - 8) / CHUNK_SIZE); cx <= Math.floor((x + 8) / CHUNK_SIZE); cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const u = gen.generate(cx, cy, cz, out);
        if (u >= 0) continue;
        for (const s of out) counts.set(BLOCKS.type(s).key, (counts.get(BLOCKS.type(s).key) ?? 0) + 1);
      }
  return counts;
}

describe('structures', () => {
  it('stay within reach of their anchor, so every column that holds a part of one finds it', () => {
    for (const kind of ['cabin', 'tower', 'camp', 'mine', 'vault', 'shrine'] as const) {
      for (const [dx, , dz] of structureCells(1, kind, 0, 0, 0)) expect(Math.max(Math.abs(dx), Math.abs(dz))).toBeLessThanOrEqual(8);
    }
  });

  it('are found from any column they reach into, whatever the order', () => {
    const seed = 4, site = sitesNear(seed, -4000, -4000, 4000, 4000).find((s) => s.kind === 'cabin')!;
    for (const [ox, oz] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) {
      const x = site.x + ox, z = site.z + oz;
      expect(sitesNear(seed, x, z, x, z).some((s) => s.kind === 'cabin' && s.x === site.x && s.z === site.z)).toBe(true);
    }
  });

  it('stands a few of each surface kind in a 1 km square of seed 1, on suitable ground', () => {
    const gen = new Generator(1), half = Math.round(500 / BLOCK_SIZE_M);
    const standing = sitesNear(1, -half, -half, half, half).filter((s) => gen.structureBase(s.kind, s.x, s.z) !== null);
    for (const kind of ['cabin', 'tower', 'camp', 'mine', 'vault'] as const) expect(standing.filter((s) => s.kind === kind).length, kind).toBeGreaterThan(0);
  });

  it('builds an ember shrine deep down with its ancient chest', () => {
    const seed = 2, gen = new Generator(seed);
    const site = sitesNear(seed, -1000, -1000, 1000, 1000).find((s) => s.kind === 'shrine')!;
    const base = gen.structureBase('shrine', site.x, site.z)!;
    expect(base * BLOCK_SIZE_M).toBeLessThanOrEqual(-110);
    const cy = Math.floor(base / CHUNK_SIZE);
    const states = statesAround(gen, site.x, site.z, cy - 1, cy + 1);
    expect(states.get('ancient_chest')).toBe(1);
    expect(states.get('obsidian')).toBeGreaterThan(100);
  });

  it('puts an ember shrine within 1.5 km of the start in every world', () => {
    const reach = Math.round(1500 / BLOCK_SIZE_M);
    for (let seed = 1; seed <= 20; seed++) {
      const near = sitesNear(seed, -reach, -reach, reach, reach).filter((s) => s.kind === 'shrine' && Math.hypot(s.x, s.z) <= reach);
      expect(near.length, `seed ${seed}`).toBeGreaterThan(0);
    }
    expect(siteIn(1, 'shrine', 0, 0)).not.toBeNull();
  });

  it('keeps chunk generation within its budget with structures', () => {
    const gen = new Generator(5), out = new Uint16Array(CHUNK_VOLUME);
    const t0 = performance.now();
    let n = 0;
    for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) for (let cy = -2; cy <= 2; cy++, n++) gen.generate(cx, cy, cz, out);
    expect((performance.now() - t0) / n).toBeLessThan(6);
  });
});

describe('loot', () => {
  it('is the same for a place every time, and better deeper down', () => {
    expect(rollLoot(1, 5, 2, 7, 'surface')).toEqual(rollLoot(1, 5, 2, 7, 'surface'));
    expect(rollLoot(1, 5, 2, 7, 'surface')).not.toEqual(rollLoot(1, 6, 2, 7, 'surface'));
    expect(lootTableFor('chest', 10)).toBe('surface');
    expect(lootTableFor('chest', -50)).toBe('mine');
    expect(lootTableFor('chest', -150)).toBe('vault');
    const shrine = rollLoot(3, 0, -200, 0, lootTableFor('ancient_chest', -200));
    expect(shrine.some((s) => s?.state === S('beacon_shard'))).toBe(true);
  });

  it('fills a generated chest on first opening, and leaves a placed one empty', () => {
    const world = new World();
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) for (let cy = -1; cy <= 0; cy++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    play.seed = 9;
    world.set(2, 0, 0, S('chest', 1));
    const input = { slot: -1, breaking: false, placing: false, consume: (a: string) => a === 'place' } as never;
    const player = { body: { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.4, height: 2.9, onGround: true }, eyeY: 2.7,
      direction: () => [Math.cos(0.85), -Math.sin(0.85), 0] as [number, number, number] } as never;
    play.update(0, input, player);
    expect(play.screen).toBe('chest');
    expect(play.chests.get('2,0,0')!.some((s) => s !== null)).toBe(true);
    expect(play.found.has('surface')).toBe(true);
  });
});

describe('the end goal and the journal', () => {
  function playAt() {
    const world = new World();
    for (const cy of [0, 15]) world.add(new Chunk(0, cy, 0, 0, 15));
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    return { world, play };
  }

  it('lights the beacon only high up under open sky', () => {
    const { world, play } = playAt();
    const light = (y: number) => (play as unknown as { lightBeacon(x: number, y: number, z: number): void }).lightBeacon(3, y, 3);
    world.set(3, 10, 3, S('beacon'));
    light(10);
    expect(play.beaconLit).toBe(false);
    expect(play.message).toContain('150 m');
    const high = Math.ceil(150 / BLOCK_SIZE_M) + 2;
    world.set(3, high, 3, S('beacon'));
    light(high);
    expect(play.beaconLit).toBe(true);
    expect(world.get(3, high, 3)).toBe(S('lit_beacon'));
  });

  it('reaches milestones once and remembers them', () => {
    const j = new Journal();
    const facts: JournalFacts = { has: (k) => k === 'log', stats: { days: 1, walkedM: 0, deaths: 0, killed: 0, mined: 0 }, deepestM: 0,
      biomes: 1, found: new Set(), armour: false, beacon: false };
    expect(j.update(facts)).toEqual(['Got wood', 'Survived a night']);
    expect(j.update(facts)).toEqual([]);
    const back = new Journal();
    back.load(j.save());
    expect(back.done.size).toBe(2);
    expect(MILESTONES.length).toBeGreaterThanOrEqual(20);
  });
});
