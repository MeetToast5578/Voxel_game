import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { COLLISION } from '../game/collision';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';
import { Creatures, type CreatureContext } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import { Simulation } from '../sim/simulation';
import { biomeIndex } from '../worldgen/biomes';

const S = (key: string, v = 0) => BLOCKS.state(key, v);

function plain() {
  const world = new World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) for (let cy = -1; cy <= 0; cy++) {
    const col = world.add(new Chunk(cx, cy, cz, cy < 0 ? S('grass') : 0, cy < 0 ? 0 : 15));
    col.biome.fill(biomeIndex('plains'));
    col.surface.fill(-1);
    col.water.fill(-1000);
  }
  return world;
}
const body = (x: number, z: number) => ({ x, y: 0, z, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true });

describe('animals', () => {
  const ctx = (world: World, holds: string | null): CreatureContext => ({ player: body(0.5, 0.5), survival: true, day: true, hostiles: 1,
    boxAt: (x, y, z) => COLLISION[world.get(x, y, z)]!, waterAt: () => false, playerHolds: holds });

  it('follow a player holding their food instead of running away', () => {
    const world = plain(), cs = new Creatures(world, mulberry32(1), { bite: () => undefined, sound: () => undefined });
    const cow = cs.add(SPECIES_BY_KEY.get('cow')!, 10.5, 0, 0.5, 10);
    for (let i = 0; i < 240; i++) cs.update(1 / 60, ctx(world, 'wheat'));
    expect(cow.body.x).toBeLessThan(6);
  });

  it('make a young one when two fed ones meet, then wait before breeding again', () => {
    const world = plain(), cs = new Creatures(world, mulberry32(2), { bite: () => undefined, sound: () => undefined });
    const a = cs.add(SPECIES_BY_KEY.get('sheep')!, 4.5, 0, 0.5, 8), b = cs.add(SPECIES_BY_KEY.get('sheep')!, 5.5, 0, 0.5, 8);
    expect(cs.feed(a) && cs.feed(b)).toBe(true);
    for (let i = 0; i < 60; i++) cs.update(1 / 60, ctx(world, null));
    const young = cs.list.filter((c) => c.young > 0);
    expect(young).toHaveLength(1);
    expect(young[0]!.body.height).toBeLessThan(a.body.height);
    expect(cs.feed(a)).toBe(false);
  });
});

describe('farming and fishing', () => {
  function setup() {
    const world = plain();
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    const player = new Player(0.5, 0, 0.5);
    player.yaw = -Math.PI / 2;
    player.pitch = -0.85;
    const actions = new Set<string>();
    const input = { slot: -1, breaking: false, placing: false, consume: (a: string) => actions.delete(a) } as unknown as Input;
    return { world, play, player, input, press: (a: string) => actions.add(a) };
  }

  it('tills grass into farmland with a hoe and plants on it', () => {
    const { world, play, player, input, press } = setup();
    play.inventory.slots[0] = { state: S('wooden_hoe'), count: 1 };
    press('place');
    play.update(0, input, player);
    const t = play.target!;
    expect(world.get(t.x, t.y, t.z)).toBe(S('farmland'));
    play.inventory.slots[0] = { state: S('wheat'), count: 3 };
    press('place');
    play.update(0, input, player);
    expect(world.get(t.x, t.y + 1, t.z)).toBe(S('wheat'));
  });

  it('catches a fish some seconds after casting into water', () => {
    const { world, play, player, input, press } = setup();
    for (let x = 1; x < 6; x++) world.set(x, -1, 0, S('water'));
    play.inventory.slots[0] = { state: S('fishing_rod'), count: 1 };
    press('place');
    play.update(0, input, player);
    expect(play.fishingS).toBeGreaterThan(0);
    for (let t = 0; t < 16; t += 0.5) play.update(0.5, input, player);
    expect(play.inventory.count(S('raw_fish'))).toBe(1);
  });
});

describe('growth while away', () => {
  it('grows crops in a chunk by the time it was unloaded', () => {
    const world = plain(), sim = new Simulation(world, (x, y, z, s) => world.set(x, y, z, s), 1);
    world.set(3, 0, 3, S('wheat'));
    const chunk = world.chunkAt(3, 0, 3)!;
    sim.parkGrowth(chunk);
    sim.ticks.now += 20 * 60 * 30; // half an hour
    sim.catchUp(chunk);
    expect(world.get(3, 0, 3)).toBe(S('wheat', 3));
  });
});
