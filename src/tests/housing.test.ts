import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Creatures } from '../creatures/creatures';
import { checkRoom } from '../game/housing';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';

const S = (k: string, v = 0) => BLOCKS.state(k, v);

/** A 5×3×5 room of planks on a stone floor (inside x, z 0..4, y 0..2), optionally with door, torch and workbench. */
function room(parts: { door?: boolean; light?: boolean; table?: boolean; roof?: boolean } = {}) {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  for (let x = -1; x <= 5; x++) for (let z = -1; z <= 5; z++) for (let y = 0; y <= 3; y++) {
    const wall = x === -1 || x === 5 || z === -1 || z === 5;
    if (wall || (y === 3 && parts.roof !== false)) world.set(x, y, z, S('planks'));
  }
  if (parts.door !== false) { world.set(2, 0, -1, S('door')); world.set(2, 1, -1, S('door')); }
  if (parts.light !== false) world.set(0, 0, 4, S('torch'));
  if (parts.table !== false) world.set(4, 0, 4, S('crafting_table'));
  return world;
}

describe('housing', () => {
  it('a closed, lit room with a door and a table is a home; each missing part is named', () => {
    const get = (w: World) => (x: number, y: number, z: number) => w.get(x, y, z);
    expect(checkRoom(get(room()), 2, 1, 2)).toMatchObject({ ok: true, missing: [] });
    expect(checkRoom(get(room({ door: false })), 2, 1, 2).missing).toEqual(['a door']);
    expect(checkRoom(get(room({ light: false, table: false })), 2, 1, 2).missing).toEqual(['a light', 'a table or workbench']);
    expect(checkRoom(get(room({ roof: false })), 2, 1, 2).missing[0]).toMatch(/roof/);
  });

  it('a bed placed in a home brings a villager who sleeps in it, and who comes back after a save', () => {
    const world = room();
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
    play.creatures = cs;
    // Standing in the room facing +x, looking down at the floor cell (1, -1, 1): the bed's foot goes on it, the head at x 2.
    const player = new Player(0.5, 0, 1.5);
    player.yaw = -Math.PI / 2;
    player.pitch = Math.atan2(0 - player.eyeY, 1);
    const actions = new Set(['place']);
    const input = { slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) } as unknown as Input;
    play.inventory.slots[0] = { state: S('bed'), count: 1 };
    play.update(0, input, player);
    expect(play.homes.size).toBe(1);
    play.wakeVillagers(player);
    const guide = cs.list.find((c) => c.species.key === 'guide');
    expect(guide?.home).toBeDefined();
    const copy = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true }, 'survival');
    copy.load(JSON.parse(JSON.stringify(play.save())));
    expect([...copy.homes.values()][0]?.who).toBe('guide');
  });
});
