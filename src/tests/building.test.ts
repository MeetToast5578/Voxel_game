import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { buildingMaterial } from '../game/building';
import { Inventory } from '../game/inventory';
import { Play } from '../game/play';
import { Player } from '../game/player';
import type { Input } from '../game/input';
import { blockInteractionHint } from '../game/interactionHint';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
function setup(mode: 'survival' | 'creative' = 'survival') {
  const world = new World();
  world.add(new Chunk(0, 0, 0, 0));
  world.set(4, 2, 0, S('chest'));
  const play = new Play(world, (x, y, z, s) => { world.set(x, y, z, s); }, {sound: () => {}, sleep: () => true}, mode);
  const player = new Player(0.5, 0, 0.5);
  player.yaw = -Math.PI / 2;
  const actions = new Set<string>();
  const input = {slot: -1, placing: false, breaking: false, descend: false, consume: (a: string) => actions.delete(a)} as unknown as Input & {placing: boolean};
  const press = (action: string) => actions.add(action);
  return {world, play, player, input, press};
}

describe('building controls', () => {
  it('opens a chest normally, but crouch places against it and refills a depleted stack', () => {
    const {play, player, input, press, world} = setup();
    play.inventory.slots[0] = {state: S('glass'), count: 1};
    play.inventory.slots[9] = {state: S('glass'), count: 12};
    press('place'); play.update(1 / 60, input, player);
    expect(play.screen).toBe('chest'); expect(world.get(3, 2, 0)).toBe(0);
    play.closeScreen(); input.descend = true;
    press('place'); play.update(1 / 60, input, player);
    expect(play.screen).toBe('none'); expect(world.get(3, 2, 0)).toBe(S('glass'));
    expect(play.held?.count).toBe(12); expect(play.inventory.slots[9]).toBeNull();
    input.placing = true;
    for (let i = 0; i < 16; i++) play.update(1 / 60, input, player);
    expect(world.get(2, 2, 0)).toBe(S('glass')); expect(play.held?.count).toBe(11);
    // Repeated placement cannot put a block through the player's body.
    for (let i = 0; i < 120; i++) play.update(1 / 60, input, player);
    expect(world.get(0, 2, 0)).toBe(0); expect(play.held?.count).toBe(10);
  });

  it('selects owned materials from hotbar and swaps backpack materials without losing the held item', () => {
    const {play, player, input, press, world} = setup();
    world.set(4, 2, 0, S('planks', 2));
    const tool = {state: S('iron_pickaxe'), count: 1, wear: 39, upgrade: 2};
    play.inventory.slots[0] = tool;
    play.inventory.slots[9] = {state: S('planks', 2), count: 22};
    press('pick'); play.update(1 / 60, input, player);
    expect(play.held).toEqual({state: S('planks', 2), count: 22});
    expect(play.inventory.slots[9]).toEqual(tool);
    play.inventory.selected = 1;
    press('pick'); play.update(1 / 60, input, player);
    expect(play.inventory.selected).toBe(0);
    expect(play.inventory.count(S('planks', 2))).toBe(22);
  });

  it('never creates survival materials that are absent, and handles block orientations', () => {
    const {play, player, input, press, world} = setup();
    world.set(4, 2, 0, S('furnace', 3));
    play.inventory.slots[0] = {state: S('dirt'), count: 8};
    press('pick'); play.update(1 / 60, input, player);
    expect(play.held).toEqual({state: S('dirt'), count: 8}); expect(play.message).toContain('No Furnace');
    play.inventory.slots[15] = {state: S('furnace'), count: 2};
    press('pick'); play.update(1 / 60, input, player);
    expect(play.held?.state).toBe(S('furnace')); expect(play.held?.count).toBe(2);
  });

  it('preserves picked creative wood species and uses existing hotbar stacks', () => {
    const {play, player, input, press, world} = setup('creative');
    world.set(4, 2, 0, S('planks', 2));
    press('pick'); play.update(1 / 60, input, player);
    expect(play.held).toEqual({state: S('planks', 2), count: 64});
    play.inventory.selected = 3;
    press('pick'); play.update(1 / 60, input, player);
    expect(play.inventory.selected).toBe(0); expect(play.inventory.slots[3]).toBeNull();
    expect(buildingMaterial(S('leaves', 4))).toBe(S('leaves', 5));
    expect(buildingMaterial(S('lit_furnace', 2))).toBe(S('furnace'));
    expect(buildingMaterial(S('stone_slab', 1))).toBe(S('stone_slab'));
  });

  it('refills only exact matching building stacks from the backpack', () => {
    const inv = new Inventory();
    inv.slots[0] = {state: S('planks', 2), count: 1};
    inv.slots[1] = {state: S('planks', 2), count: 5};
    inv.slots[9] = {state: S('planks'), count: 64};
    inv.useHeld(true);
    expect(inv.held).toBeNull(); expect(inv.slots[1]?.count).toBe(5); expect(inv.slots[9]?.count).toBe(64);
    inv.slots[0] = {state: S('cooked_meat'), count: 1};
    inv.slots[10] = {state: S('cooked_meat'), count: 6};
    inv.useHeld(); expect(inv.held).toBeNull(); expect(inv.slots[10]?.count).toBe(6);
  });

  it('shows the configured crouch key and the actual placement action', () => {
    expect(blockInteractionHint(S('chest'), {crouchKey: 'C', crouching: false})).toContain('C+Right click: Place');
    expect(blockInteractionHint(S('chest'), {crouchKey: 'C', crouching: true})).toBe('Chest · Right click: Place held block');
  });
});
