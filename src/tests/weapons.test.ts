import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Creatures } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import { COLLISION } from '../game/collision';
import type { Input } from '../game/input';
import { Play, weaponDamage } from '../game/play';
import { Player } from '../game/player';

const S = (k: string) => BLOCKS.state(k);
function setup() {
  const world = new World();
  for (let cx = -2; cx <= 2; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -2; cz <= 2; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
  const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
  play.creatures = cs;
  const player = new Player(0.5, 0, 0.5);
  player.yaw = -Math.PI / 2;
  player.pitch = 0;
  const actions = new Set<string>();
  const input = { slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) } as unknown as Input & { placing: boolean; moveZ: number };
  const act = (a: string, dt = 1) => { actions.add(a); play.update(dt, input, player); };
  const boxAt = (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!;
  return { world, play, cs, player, input, act, boxAt };
}

describe('weapons', () => {
  it('a spear reaches further than a sword; a hammer hits hardest and knocks back furthest', () => {
    const { play, cs, act } = setup();
    const zombie = SPECIES_BY_KEY.get('zombie')!;
    // 7.5 m away: past a sword's 6 m reach, within a spear's.
    const far = cs.add(zombie, 0.5 + 7.5 / 0.6, 0, 0.5, 40);
    play.inventory.slots[0] = { state: S('iron_sword'), count: 1 };
    act('break');
    expect(far.health).toBe(40);
    play.inventory.slots[0] = { state: S('iron_spear'), count: 1 };
    act('break');
    expect(far.health).toBeLessThan(40);
    expect(weaponDamage({ state: S('iron_hammer'), count: 1 })).toBeGreaterThan(weaponDamage({ state: S('iron_sword'), count: 1 }));
  });

  it('throwing knives fly and hurt, and are used up; the boomerang comes back to be thrown again', () => {
    const { play, cs, player, act, boxAt } = setup();
    const target = cs.add(SPECIES_BY_KEY.get('zombie')!, 8.5, 0, 0.5, 40);
    play.inventory.slots[0] = { state: S('throwing_knife'), count: 3 };
    player.pitch = 0.05;
    act('place', 0);
    expect(play.inventory.slots[0]?.count).toBe(2);
    for (let t = 0; t < 1; t += 1 / 60) play.tickProjectiles(1 / 60, boxAt, player);
    expect(target.health).toBeLessThan(40);
    cs.list.length = 0;
    play.inventory.slots[0] = { state: S('boomerang'), count: 1 };
    act('place', 0);
    expect(play.boomerangOut).toBe(true);
    act('place', 0);
    expect(play.projectiles.list.filter((p) => p.item === 'boomerang').length).toBe(1);
    for (let t = 0; t < 3; t += 1 / 60) play.tickProjectiles(1 / 60, boxAt, player);
    expect(play.boomerangOut).toBe(false);
    expect(play.inventory.slots[0]?.state).toBe(S('boomerang'));
  });

  it('the bow shoots the best arrows carried; ember arrows set targets alight', () => {
    const { play, cs, player, input, boxAt } = setup();
    const target = cs.add(SPECIES_BY_KEY.get('zombie')!, 12.5, 0, 0.5, 40);
    play.inventory.slots[0] = { state: S('bow'), count: 1 };
    play.inventory.slots[1] = { state: S('arrow'), count: 5 };
    play.inventory.slots[2] = { state: S('ember_arrow'), count: 5 };
    player.pitch = 0.06;
    input.placing = true;
    play.update(2, input, player);
    input.placing = false;
    play.update(0, input, player);
    expect(play.inventory.count(S('ember_arrow'))).toBe(4);
    for (let t = 0; t < 1.5 && target.burning === 0; t += 1 / 60) play.tickProjectiles(1 / 60, boxAt, player);
    expect(target.burning).toBeGreaterThan(0);
  });

  it('Dash Boots: a double tap dashes, a single tap only walks', () => {
    const { player, input, boxAt } = setup();
    const step = (s: number) => { for (let t = 0; t < s; t += 1 / 60) player.update(1 / 60, input, boxAt, () => false); };
    step(0.5);
    player.dash = true;
    input.moveZ = 1; step(0.05); input.moveZ = 0; step(0.05); input.moveZ = 1; step(1 / 60);
    expect(player.dashed).toBe(true);
    expect(Math.hypot(player.body.vx, player.body.vz)).toBeGreaterThan(20);
  });

  it('dying drops half the coins carried and keeps everything else', () => {
    const { play } = setup();
    play.inventory.slots[0] = { state: S('trade_coin'), count: 31 };
    play.inventory.slots[1] = { state: S('iron_sword'), count: 1 };
    play.armour[0] = { state: S('iron_helmet'), count: 1 };
    play.dropAll();
    expect(play.inventory.count(S('trade_coin'))).toBe(16);
    expect(play.lostCoins).toBe(15);
    expect(play.inventory.count(S('iron_sword'))).toBe(1);
    expect(play.armour[0]).not.toBeNull();
    expect(play.drops.list.map((d) => d.stack.count)).toEqual([15]);
  });
});
