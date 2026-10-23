import { describe, expect, it } from 'vitest';
import { INVENTORY_SIZE, MAX_STACK, STARTING_STACK } from '../src/config';
import { DEFAULT_HOTBAR, Inventory, type ItemStack, startingSlots } from '../src/player/inventory';
import { BlockId } from '../src/world/blocks';

const empty = (): (ItemStack | null)[] => Array.from({ length: INVENTORY_SIZE }, () => null);

describe('Inventory', () => {
  it('starts with the default hotbar, a full stack of each, and an empty grid', () => {
    const inv = new Inventory();
    expect(inv.slots.length).toBe(INVENTORY_SIZE);
    expect(inv.slots.slice(0, 9)).toEqual(DEFAULT_HOTBAR.map((state) => ({ state, count: STARTING_STACK })));
    expect(inv.slots.slice(9).every((s) => s === null)).toBe(true);
    expect(startingSlots()).toEqual(inv.slots);
  });

  it('selects, scrolls with wrap-around, and selects the block in hand', () => {
    const inv = new Inventory();
    expect(inv.selected).toBe(0);
    expect(inv.selectedBlock).toBe(BlockId.STONE);
    inv.select(4);
    expect(inv.selected).toBe(4);
    inv.select(9); // out of range: ignored
    expect(inv.selected).toBe(4);
    inv.scroll(5);
    expect(inv.selected).toBe(0);
    inv.scroll(-1);
    expect(inv.selected).toBe(8);
    inv.setSlot(8, BlockId.SAND, 3);
    expect(inv.selectedBlock).toBe(BlockId.SAND);
    inv.setSlot(8, BlockId.AIR); // air is ignored
    expect(inv.selectedBlock).toBe(BlockId.SAND);
  });

  it('pick selects a block in the hotbar, or puts a full stack into the selected slot', () => {
    const inv = new Inventory();
    inv.select(8);
    inv.pick(BlockId.DIRT); // in slot 1: select it
    expect(inv.selected).toBe(1);
    inv.pick(BlockId.SAND); // not in the hotbar: a full stack replaces the selected slot
    expect(inv.slots[1]).toEqual({ state: BlockId.SAND, count: MAX_STACK });
    expect(inv.selectedBlock).toBe(BlockId.SAND);
    expect(inv.slots[9]).toEqual({ state: BlockId.DIRT, count: STARTING_STACK });
  });

  it('survival pick (no new stack) only selects a block already in the hotbar (T-I11)', () => {
    const inv = new Inventory();
    inv.select(8);
    inv.pick(BlockId.DIRT, false);
    expect(inv.selected).toBe(1);
    const before = JSON.stringify(inv.slots);
    inv.pick(BlockId.SAND, false); // not carried: nothing is created or moved
    expect(JSON.stringify(inv.slots)).toBe(before);
    expect(inv.selected).toBe(1);
  });

  it('pick keeps the old stack when it does not fit in the grid', () => {
    const slots = empty();
    for (let i = 0; i < INVENTORY_SIZE; i++) slots[i] = { state: BlockId.STONE, count: 1 };
    slots[0] = { state: BlockId.DIRT, count: 5 };
    const inv = new Inventory(slots);
    inv.pick(BlockId.SAND);
    expect(inv.slots[0]).toEqual({ state: BlockId.DIRT, count: 5 });
  });

  it('add fills existing stacks first, never goes past MAX_STACK, and returns what did not fit', () => {
    const slots = empty();
    slots[12] = { state: BlockId.STONE, count: 60 };
    const inv = new Inventory(slots);
    expect(inv.add(BlockId.STONE, 10)).toBe(0);
    expect(inv.slots[12]).toEqual({ state: BlockId.STONE, count: MAX_STACK });
    expect(inv.slots[0]).toEqual({ state: BlockId.STONE, count: 6 });
    expect(inv.add(BlockId.STONE, 0)).toBe(0);
    const full = new Inventory(Array.from({ length: INVENTORY_SIZE }, () => ({ state: BlockId.DIRT, count: MAX_STACK })));
    expect(full.add(BlockId.STONE, 5)).toBe(5);
    expect(full.add(BlockId.DIRT, 5)).toBe(5);
    expect(full.add(BlockId.AIR, 2)).toBe(2); // air is never added
  });

  it('consumeSelected takes one item and empties the slot at zero', () => {
    const inv = new Inventory();
    inv.select(2);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.slots[2]).toEqual({ state: BlockId.GRASS, count: STARTING_STACK - 1 });
    inv.setSlot(2, BlockId.GRASS, 1);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.slots[2]).toBeNull();
    expect(inv.consumeSelected()).toBe(false);
  });

  describe('clickSlot', () => {
    it('an empty cursor takes the whole stack, and an empty click does nothing', () => {
      const inv = new Inventory();
      const cursor = inv.clickSlot(0, null);
      expect(cursor).toEqual({ state: BlockId.STONE, count: STARTING_STACK });
      expect(inv.slots[0]).toBeNull();
      expect(inv.clickSlot(0, null)).toBeNull();
    });

    it('a cursor is put down into an empty slot', () => {
      const inv = new Inventory();
      const cursor = inv.clickSlot(0, null);
      expect(inv.clickSlot(20, cursor)).toBeNull();
      expect(inv.slots[20]).toEqual({ state: BlockId.STONE, count: STARTING_STACK });
    });

    it('a cursor merges into the same block up to MAX_STACK, and the rest stays on the cursor', () => {
      const slots = empty();
      slots[3] = { state: BlockId.DIRT, count: 50 };
      const inv = new Inventory(slots);
      const rest = inv.clickSlot(3, { state: BlockId.DIRT, count: 20 });
      expect(inv.slots[3]).toEqual({ state: BlockId.DIRT, count: MAX_STACK });
      expect(rest).toEqual({ state: BlockId.DIRT, count: 6 });
    });

    it('a cursor swaps with a different block', () => {
      const inv = new Inventory();
      const cursor = inv.clickSlot(1, null); // dirt
      const back = inv.clickSlot(0, cursor); // stone: swap
      expect(inv.slots[0]).toEqual({ state: BlockId.DIRT, count: STARTING_STACK });
      expect(back).toEqual({ state: BlockId.STONE, count: STARTING_STACK });
    });

    it('an invalid slot index leaves the cursor as it is', () => {
      const inv = new Inventory();
      const cursor = { state: BlockId.STONE, count: 2 };
      expect(inv.clickSlot(INVENTORY_SIZE, cursor)).toBe(cursor);
      expect(inv.clickSlot(-1, cursor)).toBe(cursor);
    });
  });
});

describe('Inventory bulk count and consume', () => {
  it('counts a block state across all slots', () => {
    const inv = new Inventory(empty());
    inv.setSlot(0, BlockId.STONE, 10);
    inv.setSlot(20, BlockId.STONE, 5);
    inv.setSlot(21, BlockId.BRICK, 3);
    expect(inv.count(BlockId.STONE)).toBe(15);
    expect(inv.count(BlockId.BRICK)).toBe(3);
    expect(inv.count(BlockId.GLASS)).toBe(0);
  });
  it('consumes from hotbar first and empties the stacks it drains', () => {
    const inv = new Inventory(empty());
    inv.setSlot(0, BlockId.STONE, 4);
    inv.setSlot(20, BlockId.STONE, 5);
    expect(inv.consume(BlockId.STONE, 6)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[20]).toEqual({ state: BlockId.STONE, count: 3 });
  });
  it('refuses a consume that the inventory cannot cover, changing nothing', () => {
    const inv = new Inventory(empty());
    inv.setSlot(0, BlockId.STONE, 4);
    expect(inv.consume(BlockId.STONE, 5)).toBe(false);
    expect(inv.slots[0]).toEqual({ state: BlockId.STONE, count: 4 });
    expect(inv.consume(BlockId.STONE, -1)).toBe(false);
  });
});
