import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { craft, CRAFTS } from '../game/crafting';
import { Inventory } from '../game/inventory';
import { MODIFIERS, modifierOf, rollModifier } from '../game/modifiers';
import { Play, weaponDamage } from '../game/play';

const S = (k: string) => BLOCKS.state(k);
const setup = () => {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  return { world, play: new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival') };
};

describe('chests', () => {
  it('take all, deposit all, sort, names, and quick stack into nearby chests holding the same things', () => {
    const { world, play } = setup();
    world.set(2, 0, 0, S('chest'));
    const chest = new Array(27).fill(null);
    chest[5] = { state: S('dirt'), count: 10 };
    play.chests.set('2,0,0', chest);
    play.inventory.slots[12] = { state: S('dirt'), count: 20 };
    play.inventory.slots[13] = { state: S('torch'), count: 5 };
    expect(play.quickStack()).toBe(20);
    expect(play.inventory.count(S('torch'))).toBe(5);
    play.openChest = '2,0,0';
    play.openScreen('chest');
    play.depositAll();
    expect(play.inventory.count(S('torch'))).toBe(0);
    play.sortChest();
    expect(chest[0]).not.toBeNull();
    play.nameChest('Mine stuff');
    play.takeAll();
    expect(play.inventory.count(S('dirt'))).toBe(30);
    const copy = setup().play;
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect(copy.chestNames.get('2,0,0')).toBe('Mine stuff');
  });
});

describe('modifiers', () => {
  it('crafted weapons get a modifier that is kept in saves and changes the hit', () => {
    const inv = new Inventory();
    inv.slots[0] = { state: S('iron_ingot'), count: 2 };
    inv.slots[1] = { state: S('stick'), count: 1 };
    craft(CRAFTS.find((c) => c.result[0] === 'iron_sword')!, inv, 'table');
    const sword = inv.slots.find((s) => s?.state === S('iron_sword'))!;
    expect(MODIFIERS.map(([k]) => k)).toContain(sword.mod);
    const copy = new Inventory();
    copy.load(JSON.parse(JSON.stringify(inv.save())));
    expect(copy.slots.find((s) => s?.state === S('iron_sword'))!.mod).toBe(sword.mod);
    // Every modifier comes up, by weight.
    const seen = new Set(Array.from({ length: 200 }, (_, i) => rollModifier(() => (i + 0.5) / 200)));
    expect(seen.size).toBe(MODIFIERS.length);
    expect(modifierOf('mighty')!.damage! * weaponDamage({ state: S('iron_sword'), count: 1 })).toBeGreaterThan(weaponDamage({ state: S('iron_sword'), count: 1 }));
  });
});

describe('waystones and markers', () => {
  it('a touched waystone lets the player travel to another for coins; markers are saved', () => {
    const { play, world } = setup();
    world.set(0, 0, 0, S('waystone'));
    play.waystones.add('0,0,0');
    play.waystones.add('40,5,40');
    play.inventory.slots[0] = { state: S('trade_coin'), count: 5 };
    play.openWorkshop('waystone', '0,0,0');
    expect(play.travel('40,5,40')).toBe(true);
    expect(play.pendingTeleport).toEqual([40.5, 6, 40.5]);
    expect(play.inventory.count(S('trade_coin'))).toBe(3);
    play.mark('Home');
    const copy = setup().play;
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect(copy.markers.map((m) => m.name)).toEqual(['Home']);
    expect(copy.waystones.size).toBe(2);
  });
});

describe('pets and late movement', () => {
  it('a wolf fed a bone follows the player, fights monsters near them, and is kept in saves', async () => {
    const { Creatures } = await import('../creatures/creatures');
    const { SPECIES_BY_KEY } = await import('../creatures/species');
    const { COLLISION } = await import('../game/collision');
    const { world } = setup();
    const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    const wolf = cs.add(SPECIES_BY_KEY.get('wolf')!, 6.5, 0, 0.5, 12);
    wolf.tame = true;
    const zombie = cs.add(SPECIES_BY_KEY.get('zombie')!, -6.5, 0, 0.5, 20);
    const player = { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true };
    const ctx = { player, survival: true, day: true, hostiles: 1, boxAt: (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!, waterAt: () => false };
    for (let i = 0; i < 60 * 10; i++) cs.update(1 / 60, ctx);
    expect(zombie.health).toBeLessThan(20);
    expect(cs.list).toContain(wolf);
    const copy = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    copy.load(JSON.parse(JSON.stringify(cs.save())));
    expect(copy.list.find((c) => c.species.key === 'wolf')?.tame).toBe(true);
  });

  it('glider wings glide slowly and far; rocket boots climb while the fuel lasts', async () => {
    const { Player } = await import('../game/player');
    const air = () => 0, idle = { moveX: 0, moveZ: 1, jump: true, sprint: false, descend: false, consume: () => false } as never;
    const glider = new Player(0.5, 100, 0.5), plain = new Player(0.5, 100, 0.5);
    glider.wings = true;
    for (let t = 0; t < 2; t += 1 / 60) { glider.update(1 / 60, idle, air, () => false); plain.update(1 / 60, idle, air, () => false); }
    expect(glider.body.y).toBeGreaterThan(plain.body.y + 5);
    const rocket = new Player(0.5, 100, 0.5);
    rocket.rocket = true;
    for (let t = 0; t < 1; t += 1 / 60) rocket.update(1 / 60, idle, air, () => false);
    expect(rocket.body.y).toBeGreaterThan(100);
  });
});

describe('light in the dark', () => {
  it('a wisp in a bottle, made from geode crystals, gives a wisp; glowing mushrooms brew night vision', () => {
    const { play } = setup();
    expect(CRAFTS.some((r) => BLOCKS.type(BLOCKS.state(r.result[0])).key === 'wisp_bottle')).toBe(true);
    expect(play.bonus.wisp).toBe(false);
    play.accessories[0] = { state: S('wisp_bottle'), count: 1 };
    expect(play.bonus.wisp).toBe(true);
    expect(CRAFTS.some((r) => BLOCKS.type(BLOCKS.state(r.result[0])).key === 'night_vision_potion')).toBe(true);
    expect(BLOCKS.type(S('night_vision_potion')).potion!.effect).toBe('night_vision');
  });
});
