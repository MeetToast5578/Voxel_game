import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';

const S = (key: string, v = 0) => BLOCKS.state(key, v);

/** A flat world with ground below y = 0, a player standing at (0.5, 0, 0.5) looking along +x and down a little. */
function setup(mode: 'creative' | 'survival') {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, mode);
  const player = new Player(0.5, 0, 0.5);
  player.yaw = -Math.PI / 2; // looking along +x
  player.pitch = -0.35;
  const actions = new Set<string>();
  const input = {
    slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false,
    consume: (a: string) => actions.delete(a),
  } as unknown as Input & { breaking: boolean };
  const press = (a: string) => actions.add(a);
  return { world, play, player, input, press };
}

describe('play', () => {
  it('breaks at once and places without using up items in creative', () => {
    const { world, play, player, input, press } = setup('creative');
    play.inventory.slots[0] = { state: S('glass'), count: 5 };
    press('break');
    (input as { breaking: boolean }).breaking = true;
    play.update(0.05, input, player);
    const t = play.target!;
    expect(world.get(t.x, t.y, t.z)).toBe(0);
    (input as { breaking: boolean }).breaking = false;
    play.update(0.05, input, player);
    press('place');
    play.update(0.05, input, player);
    expect(play.inventory.slots[0]!.count).toBe(5);
  });

  it('digs over time in survival, with drops and tool wear', () => {
    const { world, play, player, input } = setup('survival');
    play.inventory.slots[0] = { state: S('wooden_pickaxe'), count: 1 };
    (input as { breaking: boolean }).breaking = true;
    play.update(0.05, input, player);
    const t = play.target!;
    expect(world.get(t.x, t.y, t.z)).toBe(S('stone'));
    // Stone takes 1.5 s by hand-hardness, half that with a wooden pickaxe.
    let steps = 0;
    while (world.get(t.x, t.y, t.z) !== 0 && steps < 100) {
      play.update(0.05, input, player);
      steps++;
    }
    expect(steps * 0.05).toBeCloseTo(0.75, 1);
    expect(play.inventory.count(S('cobblestone'))).toBe(1);
    expect(play.inventory.slots[0]!.wear).toBe(1);
  });

  it('places a door four cells tall and opens it whole', () => {
    const { world, play, player, input, press } = setup('survival');
    play.inventory.slots[0] = { state: S('door'), count: 1 };
    player.pitch = -0.9;
    press('place');
    play.update(0.05, input, player);
    const door = BLOCKS.byName('door');
    let cells = 0, x = 0, z = 0;
    for (let px = 0; px < 6; px++) for (let pz = -2; pz <= 2; pz++) if (BLOCKS.type(world.get(px, 0, pz)) === door) { x = px; z = pz; }
    for (let y = 0; y < 4; y++) if (BLOCKS.type(world.get(x, y, z)) === door) cells++;
    expect(cells).toBe(4);
    expect(play.inventory.slots[0]).toBeNull();
    play.target = { x, y: 2, z, nx: -1, ny: 0, nz: 0, distance: 1 };
    // Use it directly (the ray is set by hand above, so call the private path through update with the target kept).
    const before = world.get(x, 0, z);
    (play as unknown as { use(p: Player): void }).use(player);
    for (let y = 0; y < 4; y++) expect(world.get(x, y, z)).toBe(before + 4);
  });

  it('runs furnaces and lights the block while burning', () => {
    const { world, play } = setup('survival');
    world.set(3, 0, 0, S('furnace', 1));
    play.furnaces.set('3,0,0', { input: { state: S('sand'), count: 1 }, fuel: { state: S('coal'), count: 1 }, output: null, burn: 0, progress: 0 });
    play.tickFurnaces(0.1);
    expect(BLOCKS.type(world.get(3, 0, 0)).key).toBe('lit_furnace');
    for (let i = 0; i < 100; i++) play.tickFurnaces(0.1);
    expect(play.furnaces.get('3,0,0')!.output).toEqual({ state: S('glass'), count: 1 });
  });

  it('crafts from the grid onto the cursor', () => {
    const { play } = setup('survival');
    play.craft[0] = { state: S('log'), count: 2 };
    play.takeCraft();
    expect(play.cursor).toEqual({ state: S('planks'), count: 4 });
    expect(play.craft[0]!.count).toBe(1);
    play.closeScreen();
    expect(play.inventory.count(S('planks'))).toBe(4);
    expect(play.inventory.count(S('log'))).toBe(1);
  });

  it('saves and restores the player state', () => {
    const { play, world } = setup('survival');
    play.inventory.add({ state: S('torch'), count: 7 });
    play.survival.hunger = 11;
    play.spawn = [1, 2, 3];
    play.furnaces.set('1,0,1', { input: null, fuel: { state: S('coal'), count: 2 }, output: null, burn: 3, progress: 1 });
    const back = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true }, 'creative');
    back.load(JSON.parse(JSON.stringify(play.save())));
    expect(back.mode).toBe('survival');
    expect(back.inventory.count(S('torch'))).toBe(7);
    expect(back.survival.hunger).toBe(11);
    expect(back.spawn).toEqual([1, 2, 3]);
    expect(back.furnaces.get('1,0,1')!.fuel).toEqual({ state: S('coal'), count: 2 });
  });
});
