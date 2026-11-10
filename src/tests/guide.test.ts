import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { sourcesOf, usesOf } from '../game/guide';

describe('item guide', () => {
  it('every item can be got somehow in survival', () => {
    const none = BLOCKS.types.filter((t) => t.item && sourcesOf(t.key).length === 0).map((t) => t.key);
    expect(none).toEqual([]);
  });

  it('names sources and uses', () => {
    expect(sourcesOf('iron_ingot')).toContain('smelted from Iron ore');
    expect(sourcesOf('gel').some((s) => s.startsWith('dropped by') && s.includes('Green Slime'))).toBe(true);
    expect(usesOf('gel')).toContain('Healing Potion');
  });
});

describe('journal rewards and the bestiary', async () => {
  const { Chunk } = await import('../engine/chunk');
  const { World } = await import('../engine/world');
  const { Play } = await import('../game/play');
  const { Player } = await import('../game/player');
  const { Creatures } = await import('../creatures/creatures');
  const { SPECIES_BY_KEY } = await import('../creatures/species');
  const S = (k: string) => BLOCKS.state(k);
  const setup = () => {
    const world = new World();
    for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
    return { world, play: new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival') };
  };

  it('a milestone gives its reward once', () => {
    const { play } = setup();
    play.inventory.slots[0] = { state: S('log'), count: 1 };
    play.checkJournal();
    play.checkJournal();
    expect(play.inventory.count(S('torch'))).toBe(4);
  });

  it('records sightings, kills and drops, and keeps them in saves', () => {
    const { world, play } = setup();
    const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    play.creatures = cs;
    const slime = cs.add(SPECIES_BY_KEY.get('slime')!, 2.5, 0, 0.5, 1);
    play.noteSeen(0.5, 0.5);
    expect(play.seen.has('slime')).toBe(true);
    const player = new Player(0.5, 0, 0.5);
    player.yaw = -Math.PI / 2;
    player.pitch = 0;
    const actions = new Set(['break']);
    const input = { slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) } as never;
    play.inventory.slots[0] = { state: S('iron_sword'), count: 1 };
    play.update(1, input, player);
    expect(slime.health).toBeLessThanOrEqual(0);
    expect(play.bestiary.get('slime')?.kills).toBe(1);
    const copy = setup().play;
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect(copy.seen.has('slime')).toBe(true);
    expect(copy.bestiary.get('slime')).toEqual(play.bestiary.get('slime'));
  });
});
