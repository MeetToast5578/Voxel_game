import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { canCraft, CRAFTS } from '../game/crafting';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';
import { Survival } from '../game/survival';
import { SPECIES_BY_KEY } from '../creatures/species';

const S = (k: string) => BLOCKS.state(k);
const calm = { sprinting: false, headInWater: false, inLava: false };

function setup() {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
  const player = new Player(0.5, 0, 0.5);
  player.pitch = 1.2; // looking up at the sky: right click uses the held item
  const actions = new Set<string>();
  const input = { slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) } as unknown as Input;
  const use = (key: string) => {
    play.inventory.slots[0] = { state: S(key), count: 1 };
    play.inventory.selected = 0;
    actions.add('place');
    play.update(0, input, player);
  };
  return { world, play, use };
}

describe('status effects', () => {
  it('poison hurts, stops regeneration and wears off; an antidote keeps it away', () => {
    const s = new Survival();
    s.health = 10;
    s.addEffect('poisoned', 5);
    for (let t = 0; t < 4; t += 0.1) s.update(0.1, calm);
    expect(s.health).toBeLessThan(10);
    const low = s.health;
    for (let t = 0; t < 3; t += 0.1) s.update(0.1, calm);
    expect(s.has('poisoned')).toBe(false);
    for (let t = 0; t < 5; t += 0.1) s.update(0.1, calm);
    expect(s.health).toBeGreaterThan(low);
    s.addEffect('antidote', 10);
    s.addEffect('poisoned', 5);
    expect(s.has('poisoned')).toBe(false);
  });

  it('regeneration heals even when hungry', () => {
    const s = new Survival();
    s.health = 5;
    s.hunger = 2;
    s.addEffect('regeneration', 10);
    for (let t = 0; t < 10; t += 0.1) s.update(0.1, calm);
    expect(s.health).toBeGreaterThan(9);
  });

  it('a healing potion heals once, then potion sickness stops a second', () => {
    const { play, use } = setup();
    play.survival.health = 6;
    use('healing_potion');
    expect(play.survival.health).toBe(14);
    expect(play.inventory.slots[0]).toBeNull();
    use('healing_potion');
    expect(play.survival.health).toBe(14);
    expect(play.inventory.slots[0]?.count).toBe(1);
  });

  it('swiftness speeds the player, slowed slows; fire resistance and water breathing count as the accessories do', () => {
    const { play, use } = setup();
    use('swiftness_potion');
    expect(play.bonus.speed).toBeCloseTo(0.3);
    play.survival.addEffect('slowed', 3);
    expect(play.bonus.speed).toBeCloseTo(-0.05);
    use('fire_resistance_potion');
    use('water_breathing_potion');
    expect(play.bonus).toMatchObject({ fireproof: true, breath: Infinity });
  });

  it('an antidote cures poison', () => {
    const { play, use } = setup();
    play.survival.addEffect('poisoned', 20);
    use('antidote');
    expect(play.survival.has('poisoned')).toBe(false);
    expect(play.survival.has('antidote')).toBe(true);
  });

  it('a cooked meal leaves the player well fed', () => {
    const { play, use } = setup();
    play.survival.hunger = 5;
    use('cooked_meat');
    expect(play.survival.has('well_fed')).toBe(true);
  });

  it('bites carry their effect: cave crawlers poison, frost brutes slow, ember slimes burn', () => {
    const { play } = setup();
    play.bitten(2, 'Cave crawler', SPECIES_BY_KEY.get('crawler'), () => 0);
    play.bitten(2, 'Frost brute', SPECIES_BY_KEY.get('brute'), () => 0);
    play.bitten(2, 'Ember Slime', SPECIES_BY_KEY.get('ember_slime'), () => 0);
    expect(play.survival.has('poisoned') && play.survival.has('slowed')).toBe(true);
    expect(play.survival.burning).toBeGreaterThan(0);
    play.bitten(2, 'Cave crawler', SPECIES_BY_KEY.get('zombie'), () => 0);
    expect(play.survival.cause).toBe('killed by a cave crawler');
  });

  it('effects are kept in saves', () => {
    const { play } = setup();
    play.survival.addEffect('swiftness', 42);
    const copy = setup().play;
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect(copy.survival.effects.swiftness).toBe(42);
  });
});

describe('brewing', () => {
  it('potions are made only beside an alchemy table, which is made from bottles and planks', () => {
    const slots = [{ state: S('red_mushroom'), count: 1 }, { state: S('gel'), count: 1 }, { state: S('glass_bottle'), count: 1 }];
    const healing = CRAFTS.find((c) => c.result[0] === 'healing_potion')!;
    expect(canCraft(healing, slots, ['table'])).toBe(false);
    expect(canCraft(healing, slots, ['hand', 'alchemy'])).toBe(true);
    const table = CRAFTS.find((c) => c.result[0] === 'alchemy_table')!;
    expect(canCraft(table, [{ state: S('glass_bottle'), count: 2 }, { state: S('planks'), count: 3 }], 'table')).toBe(true);
  });

  it('Play knows an alchemy table is near when the inventory opens', () => {
    const { world, play } = setup();
    world.set(2, 0, 0, S('alchemy_table'));
    play.openScreen('inventory');
    expect(play.stations).toContain('alchemy');
  });
});

describe('armour sets', () => {
  it('a full set adds its bonus; a mixed set adds none', () => {
    const { play } = setup();
    const wear = (m: string) => ['helmet', 'chestplate', 'leggings', 'boots'].forEach((p, i) => (play.armour[i] = { state: S(`${m}_${p}`), count: 1 }));
    wear('leather');
    expect(play.armourSet).toBe('leather');
    expect(play.bonus.speed).toBeCloseTo(0.1);
    wear('iron');
    expect(play.bonus.protection).toBe(2);
    play.armour[0] = { state: S('leather_helmet'), count: 1 };
    expect(play.armourSet).toBeNull();
    expect(play.bonus.protection).toBe(0);
  });

  it('jade armour hurts whatever bites', async () => {
    const { world, play } = setup();
    const { Creatures } = await import('../creatures/creatures');
    const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    play.creatures = cs;
    ['helmet', 'chestplate', 'leggings', 'boots'].forEach((p, i) => (play.armour[i] = { state: S(`jade_${p}`), count: 1 }));
    const zombie = cs.add(SPECIES_BY_KEY.get('zombie')!, 2, 0, 0.5, 20);
    play.bitten(3, 'Zombie', zombie.species, () => 1, zombie);
    expect(zombie.health).toBe(17);
  });
});
