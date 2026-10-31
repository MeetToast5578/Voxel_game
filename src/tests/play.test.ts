import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import type { Input } from '../game/input';
import { COLLISION } from '../game/collision';
import { Play, weaponDamage } from '../game/play';
import { tickFurnace } from '../game/furnace';
import { RECIPES } from '../game/crafting';
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

/** Lets dropped items land for a second, then walks the player over them, as in the game loop. */
function collect(world: World, play: Play, player: Player): void {
  const boxAt = (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!;
  for (let i = 0; i < 20; i++) play.drops.update(0.05, boxAt, null, play.inventory);
  for (const d of [...play.drops.list]) {
    Object.assign(player.body, { x: d.body.x, y: d.body.y, z: d.body.z });
    play.drops.update(0.05, boxAt, player.body, play.inventory);
  }
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
    // The block pops out as an item, picked up when near.
    expect(play.inventory.count(S('cobblestone'))).toBe(0);
    collect(world, play, player);
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

  it('lays out a recipe from the inventory, only when everything is there and it fits the grid', () => {
    const { play } = setup('survival');
    const recipe = (key: string) => RECIPES.find((r) => r.result[0] === key)!;
    play.inventory.add({ state: S('planks'), count: 3 });
    play.inventory.add({ state: S('stick'), count: 2 });
    play.openScreen('inventory', 2);
    expect(play.canMake(recipe('wooden_pickaxe'))).toBe(false); // 3×3 only
    play.openScreen('inventory', 3);
    expect(play.fillRecipe(recipe('wooden_pickaxe'))).toBe(true);
    expect(play.craftOutput).toEqual({ state: S('wooden_pickaxe'), count: 1 });
    expect(play.inventory.count(S('planks')) + play.inventory.count(S('stick'))).toBe(0);
    // Not enough for a chest (eight planks): nothing moves.
    expect(play.fillRecipe(recipe('chest'))).toBe(false);
    expect(play.craftOutput).toEqual({ state: S('wooden_pickaxe'), count: 1 });
    // Another recipe takes the grid back into the inventory first.
    expect(play.fillRecipe(recipe('stick'))).toBe(true);
    expect(play.craftOutput).toEqual({ state: S('stick'), count: 4 });
    expect(play.inventory.count(S('planks'))).toBe(1);
  });

  it('leaves the grid alone when a recipe is picked with no room to put the grid back', () => {
    const { play } = setup('survival');
    play.openScreen('inventory', 2);
    for (let i = 0; i < 36; i++) play.inventory.slots[i] = { state: S('dirt'), count: 64 };
    play.inventory.slots[0] = { state: S('planks'), count: 2 };
    play.craft[0] = { state: S('log'), count: 1 };
    expect(play.fillRecipe(RECIPES.find((r) => r.result[0] === 'stick')!)).toBe(false);
    expect(play.craft[0]).toEqual({ state: S('log'), count: 1 });
    expect(play.drops.list).toHaveLength(0);
  });

  it('hits hardest with a sword, by tier, and weaker when swinging too fast', () => {
    expect(weaponDamage({ state: S('iron_sword'), count: 1 })).toBeGreaterThan(weaponDamage({ state: S('stone_sword'), count: 1 }));
    expect(weaponDamage({ state: S('stone_sword'), count: 1 })).toBeGreaterThan(weaponDamage({ state: S('stone_axe'), count: 1 }));
    expect(weaponDamage(null)).toBe(1);
    // A zombie (20 health) takes under a quarter of the full swings with an iron sword that it takes with a fist.
    expect(Math.ceil(20 / weaponDamage({ state: S('iron_sword'), count: 1 }))).toBeLessThan(20 / weaponDamage(null) / 4);
  });

  it('cooks raw food on a campfire, and gives it back raw if the fire goes', () => {
    const { world, play, player, input, press } = setup('survival');
    world.set(2, 0, 0, S('campfire'));
    player.pitch = -0.85; // looking down at the cell in front
    play.inventory.slots[0] = { state: S('raw_meat'), count: 2 };
    play.update(0, input, player);
    press('place');
    play.update(0, input, player);
    expect(play.target).toMatchObject({ x: 2, y: 0, z: 0 });
    expect(play.campfires.get('2,0,0')).toHaveLength(1);
    expect(play.inventory.count(S('raw_meat'))).toBe(1);
    for (let t = 0; t < 25; t++) play.tickCampfires(1);
    expect(play.drops.list.map((d) => BLOCKS.type(d.stack.state).key)).toEqual(['cooked_meat']);
    press('place');
    play.update(0, input, player);
    world.set(2, 0, 0, 0);
    play.tickCampfires(1);
    expect(play.drops.list.map((d) => BLOCKS.type(d.stack.state).key).sort()).toEqual(['cooked_meat', 'raw_meat']);
  });

  it('scoops up a water source with a bucket and pours it out again', () => {
    const { world, play, player, input, press } = setup('survival');
    world.set(2, 0, 0, S('water'));
    world.set(3, 0, 0, S('stone'));
    player.pitch = -0.85;
    play.inventory.slots[0] = { state: S('bucket'), count: 1 };
    press('place');
    play.update(0, input, player);
    expect(world.get(2, 0, 0)).toBe(0);
    expect(play.inventory.slots[0]).toEqual({ state: S('water_bucket'), count: 1 });
    press('place');
    play.update(0, input, player);
    expect(world.get(2, 0, 0)).toBe(S('water'));
    expect(play.inventory.slots[0]).toEqual({ state: S('bucket'), count: 1 });
  });

  it('a lava bucket burns in a furnace and leaves the bucket', () => {
    const f = { input: { state: S('iron_ore'), count: 1 }, fuel: { state: S('lava_bucket'), count: 1 }, output: null, burn: 0, progress: 0 };
    tickFurnace(f, 0.1);
    expect(f.fuel).toEqual({ state: S('bucket'), count: 1 });
  });

  it('hangs a ladder on the side of the wall that was clicked, not on floors', () => {
    const { world, play, player, input, press } = setup('survival');
    for (let y = 0; y < 4; y++) world.set(2, y, 0, S('stone'));
    player.pitch = 0;
    player.body.y = 0;
    play.inventory.slots[0] = { state: S('ladder'), count: 3 };
    press('place');
    play.update(0, input, player);
    expect(BLOCKS.stateName(world.get(1, 2, 0))).toBe('ladder'); // facing +x: variant 0
    player.pitch = -1.4;
    press('place');
    play.update(0, input, player);
    expect(play.inventory.count(S('ladder'))).toBe(2);
  });

  it('saves and restores the player state', () => {
    const { play, world } = setup('survival');
    play.inventory.add({ state: S('torch'), count: 7 });
    play.survival.hunger = 11;
    play.spawn = [1, 2, 3];
    play.difficulty = 'hard';
    play.furnaces.set('1,0,1', { input: null, fuel: { state: S('coal'), count: 2 }, output: null, burn: 3, progress: 1 });
    const back = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true }, 'creative');
    back.load(JSON.parse(JSON.stringify(play.save())));
    expect(back.mode).toBe('survival');
    expect(back.inventory.count(S('torch'))).toBe(7);
    expect(back.survival.hunger).toBe(11);
    expect(back.spawn).toEqual([1, 2, 3]);
    expect(back.difficulty).toBe('hard');
    expect(back.survival.hungerRate).toBe(1.25);
    expect(back.furnaces.get('1,0,1')!.fuel).toEqual({ state: S('coal'), count: 2 });
  });
});

describe('creative building', () => {
  it('undoes and redoes edits, and fills and clears boxes between two corners', () => {
    const { world, play, player, input, press } = setup('creative');
    play.inventory.slots[0] = { state: S('brick'), count: 64 };
    play.update(0.05, input, player);
    const t = play.target!;
    const at = [t.x + t.nx, t.y + t.ny, t.z + t.nz] as const;
    press('place');
    play.update(0.05, input, player);
    expect(world.get(...at)).toBe(S('brick'));
    press('undo');
    play.update(0.05, input, player);
    expect(world.get(...at)).toBe(0);
    press('redo');
    play.update(0.05, input, player);
    expect(world.get(...at)).toBe(S('brick'));

    // A box from the cell in front of the target face to a second corner 3 cells further along +z.
    press('fill');
    play.update(0.05, input, player);
    expect(play.corner).not.toBeNull();
    play.corner = [at[0], at[1], at[2] + 3];
    press('fill');
    play.update(0.05, input, player);
    play.update(0.05, input, player);
    let filled = 0;
    for (let z = at[2]; z <= at[2] + 3; z++) if (world.get(at[0], at[1], z) === S('brick')) filled++;
    expect(filled).toBe(4);
    press('undo');
    play.update(0.05, input, player);
    for (let z = at[2] + 1; z <= at[2] + 3; z++) expect(world.get(at[0], at[1], z)).toBe(0);
  });
});

describe('chests', () => {
  it('opens, keeps items, saves them, and spills its items when broken in survival', () => {
    const { world, play, player, input, press } = setup('survival');
    play.inventory.slots[0] = { state: S('chest'), count: 1 };
    play.update(0.05, input, player);
    const t = play.target!;
    const at = [t.x + t.nx, t.y + t.ny, t.z + t.nz] as const;
    press('place');
    play.update(0.05, input, player);
    expect(BLOCKS.type(world.get(...at)).key).toBe('chest');
    play.target = { x: at[0], y: at[1], z: at[2], nx: 0, ny: 1, nz: 0, distance: 1 };
    (play as unknown as { use(p: Player): void }).use(player);
    expect(play.screen).toBe('chest');
    const key = `${at[0]},${at[1]},${at[2]}`;
    play.chests.get(key)![4] = { state: S('coal'), count: 9 };
    const back = new Play(world, () => undefined, { sound: () => undefined, sleep: () => true });
    back.load(JSON.parse(JSON.stringify(play.save())));
    expect(back.chests.get(key)![4]).toEqual({ state: S('coal'), count: 9 });
    play.closeScreen();
    (play as unknown as { breakCell(x: number, y: number, z: number, s: number, survival: boolean, roll: number): void })
      .breakCell(at[0], at[1], at[2], world.get(...at), true, 0.5);
    collect(world, play, player);
    expect(play.inventory.count(S('coal'))).toBe(9);
    expect(play.inventory.count(S('chest'))).toBe(1);
  });

  it('drops what does not fit into the world, and throws the held item with Q', () => {
    const { world, play, player, input, press } = setup('survival');
    for (let i = 0; i < play.inventory.slots.length; i++) play.inventory.slots[i] = { state: S('glass'), count: 64 };
    play.inventory.slots[0] = { state: S('wooden_pickaxe'), count: 1 };
    (input as { breaking: boolean }).breaking = true;
    play.update(0.05, input, player);
    const t = play.target!;
    for (let steps = 0; world.get(t.x, t.y, t.z) !== 0 && steps < 100; steps++) play.update(0.05, input, player);
    expect(play.drops.list.map((d) => d.stack)).toEqual([{ state: S('cobblestone'), count: 1 }]);
    (input as { breaking: boolean }).breaking = false;
    play.inventory.selected = 1;
    press('drop');
    play.update(0.05, input, player);
    expect(play.inventory.slots[1]!.count).toBe(63);
    expect(play.drops.list.length).toBe(2);
    expect(play.drops.list[1]!.body.vx).toBeGreaterThan(0); // thrown along +x, where the player looks
  });
});
