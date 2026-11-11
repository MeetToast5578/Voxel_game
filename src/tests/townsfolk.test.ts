import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Creatures } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import { checkRoom } from '../game/housing';
import { Play } from '../game/play';
import { linesOf, QUESTS, TALKERS, talkLine } from '../game/townsfolk';

const S = (k: string) => BLOCKS.state(k);
const setup = () => {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  return { world, play: new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival') };
};

describe('townsfolk', () => {
  it('each has at least eight things to say, and talks about red nights', () => {
    for (const job of TALKERS) expect(linesOf(job).length, job).toBeGreaterThanOrEqual(8);
    expect(talkLine('farmer', { night: true, raining: false, event: 'red_night', seed: 1, time: 0 })).toMatch(/red/i);
  });

  it('a bring quest takes its items and pays; a defeat quest counts kills', () => {
    const { play, world } = setup();
    const wheat = QUESTS.find((q) => q.id === 'farmer_wheat')!;
    expect(play.questFor('farmer')).toBe(wheat);
    play.acceptQuest(wheat.id);
    play.inventory.slots[0] = { state: S('wheat'), count: 20 };
    expect(play.turnInQuest(wheat.id)).toBe(true);
    expect(play.inventory.count(S('wheat'))).toBe(4);
    expect(play.inventory.count(S('trade_coin'))).toBe(4);
    const zombies = play.questFor('farmer')!;
    expect(zombies.id).toBe('farmer_zombies');
    play.acceptQuest(zombies.id);
    expect(play.turnInQuest(zombies.id)).toBe(false);
    const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    play.creatures = cs;
    for (let i = 0; i < 5; i++) {
      const z = cs.add(SPECIES_BY_KEY.get('zombie')!, 2, 0, 0.5, 1);
      (play as unknown as { defeated(c: unknown): void }).defeated(z);
    }
    expect(play.questProgress(zombies)).toBe(5);
    expect(play.turnInQuest(zombies.id)).toBe(true);
    expect(play.questFor('farmer')).toBeUndefined();
    const copy = setup().play;
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect(copy.questsDone.size).toBe(2);
  });

  it('a wooden table makes a room a home as a workbench does', () => {
    const { world } = setup();
    for (let x = -1; x <= 5; x++) for (let z = -1; z <= 5; z++) for (let y = 0; y <= 3; y++) if (x === -1 || x === 5 || z === -1 || z === 5 || y === 3) world.set(x, y, z, S('planks'));
    world.set(2, 0, -1, S('door')); world.set(2, 1, -1, S('door'));
    world.set(0, 0, 4, S('candle'));
    world.set(4, 0, 4, S('wooden_table'));
    expect(checkRoom((x, y, z) => world.get(x, y, z), 2, 1, 2).missing).toEqual([]);
  });
});

describe('a harder world', () => {
  it('nights bring more monsters as the world ages, never on peaceful', () => {
    const { play } = setup();
    const day1 = (play.stats.days = 1, play.hostileShare);
    const day20 = (play.stats.days = 20, play.hostileShare);
    expect(day20).toBeGreaterThan(day1);
    play.difficulty = 'peaceful';
    expect(play.hostileShare).toBe(0);
  });

  it('the tinkerer puts two accessories into one, and the explorer\'s map marks a place for the compass', async () => {
    const { trade, SHOPS } = await import('../game/workshops');
    const { play } = setup();
    const tinker = SHOPS.tinkerer!, storm = tinker.findIndex((o) => o.gives[0] === 'storm_charm');
    play.inventory.slots[0] = { state: S('cloud_charm'), count: 1 };
    expect(trade(play.inventory, storm, tinker)).toBe(false); // the featherfall charm is missing
    expect(play.inventory.count(S('cloud_charm'))).toBe(1);
    play.inventory.slots[1] = { state: S('feather_charm'), count: 1 };
    expect(trade(play.inventory, storm, tinker)).toBe(true);
    expect(play.inventory.count(S('storm_charm'))).toBe(1);
    expect(play.inventory.count(S('cloud_charm')) + play.inventory.count(S('feather_charm'))).toBe(0);
    // A map marks the nearest unmarked place; a second marks another one.
    play.seed = 1;
    expect(play.readMap()).toBe(true);
    expect(play.readMap()).toBe(true);
    expect(play.markers).toHaveLength(2);
    expect(play.markers[0]!.name).not.toBe('');
    expect(play.markers[0]!.x).not.toBe(play.markers[1]!.x);
  });
});
