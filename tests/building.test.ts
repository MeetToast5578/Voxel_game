import { describe, expect, it } from 'vitest';
import { DOOR_HEIGHT, DOOR_WIDTH } from '../src/config';
import { craftResult } from '../src/player/crafting';
import { connectedDoor, doorCells, toggledDoor } from '../src/player/doors';
import { minedWith } from '../src/player/tools';
import { BlockId, blockBoxes, blockDrop, blockFaceTile, facingVariant, getBlockDef, parseBlockStateName, Tile } from '../src/world/blocks';

const s = (name: string) => parseBlockStateName(name)!;
const filled = (rows: string[], name: string) => rows.flatMap((row) => [...row]).map((ch) => (ch === 'M' ? { state: s(name), count: 1 } : null));

describe('stairs (T-K5)', () => {
  it('draw a bottom half and the upper half toward their facing, with their material tiles', () => {
    const east = s('planks_stairs') + facingVariant(1, 0);
    expect(blockBoxes(east)).toEqual([[0, 0, 0, 1, 0.5, 1], [0.5, 0.5, 0, 1, 1, 1]]);
    expect(blockBoxes(s('planks_stairs') + facingVariant(0, -1))![1]).toEqual([0, 0.5, 0, 1, 1, 0.5]);
    expect(blockFaceTile(east, 0, 1, 0)).toBe(Tile.PLANKS);
    expect(blockBoxes(BlockId.STONE)).toBeNull();
  });

  it('are crafted four from six, drop unturned, and mine with their material tool', () => {
    expect(craftResult(filled(['M  ', 'MM ', 'MMM'], 'cobblestone'), 3)).toEqual({ state: s('cobblestone_stairs'), count: 4 });
    expect(blockDrop(s('cobblestone_stairs') + 3)).toEqual({ state: s('cobblestone_stairs'), count: 1 });
    expect(minedWith(s('cobblestone_stairs'))).toBe('pickaxe');
    expect(minedWith(s('planks_stairs'))).toBe('axe');
  });
});

describe('doors (T-K5)', () => {
  it('are a thin panel on their facing side, turned a quarter when open', () => {
    const [closed] = blockBoxes(BlockId.DOOR + facingVariant(0, -1))!;
    expect(closed![2]).toBe(0);
    expect(closed![5]).toBeLessThan(0.25);
    const [open] = blockBoxes(BlockId.OPEN_DOOR + facingVariant(0, -1))!;
    expect(open![3]).toBe(1);
    expect(open![0]).toBeGreaterThan(0.75); // the next facing, east
    expect(getBlockDef(BlockId.DOOR).solid).toBe(true);
    expect(getBlockDef(BlockId.OPEN_DOOR).solid).toBe(false);
  });

  it('fill DOOR_WIDTH × DOOR_HEIGHT cells to the placer\'s right, and the whole door is found from any cell', () => {
    const south = facingVariant(0, 1); // the player stands to the south, looking north: their right is east
    const cells = doorCells(10, 0, 5, south);
    expect(cells).toHaveLength(DOOR_WIDTH * DOOR_HEIGHT);
    expect(new Set(cells.map((c) => c.x))).toEqual(new Set([10, 11]));
    expect(Math.max(...cells.map((c) => c.y))).toBe(DOOR_HEIGHT - 1);
    const world = new Map(cells.map((c) => [`${c.x},${c.y},${c.z}`, BlockId.DOOR + south]));
    world.set('12,0,5', BlockId.DOOR + facingVariant(1, 0)); // a door cell facing elsewhere is not joined
    const getBlock = (x: number, y: number, z: number) => world.get(`${x},${y},${z}`) ?? BlockId.AIR;
    expect(connectedDoor(getBlock, 11, 3, 5)).toHaveLength(cells.length);
    expect(connectedDoor(getBlock, 0, 0, 0)).toEqual([]);
  });

  it('toggle keeping their facing, drop one door, and come from six planks', () => {
    expect(toggledDoor(BlockId.DOOR + 2)).toBe(BlockId.OPEN_DOOR + 2);
    expect(toggledDoor(BlockId.OPEN_DOOR + 2)).toBe(BlockId.DOOR + 2);
    expect(blockDrop(BlockId.OPEN_DOOR + 1)).toEqual({ state: BlockId.DOOR, count: 1 });
    expect(craftResult(filled(['MM ', 'MM ', 'MM '], 'planks'), 3)).toEqual({ state: BlockId.DOOR, count: 1 });
  });
});
