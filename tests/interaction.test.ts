import { describe, expect, it } from 'vitest';
import { Hotbar } from '../src/player/hotbar';
import { blockIntersectsBody, canBreak, placementTarget } from '../src/player/interaction';
import { BlockId } from '../src/world/blocks';

const shape = { halfWidth: 0.3, height: 1.8 };
const feet = { x: 0.5, y: 10, z: 0.5 }; // standing on block (0, 9, 0)

describe('blockIntersectsBody', () => {
  it('detects overlap with the cells the body occupies', () => {
    expect(blockIntersectsBody(0, 10, 0, feet, shape)).toBe(true);
    expect(blockIntersectsBody(0, 11, 0, feet, shape)).toBe(true);
  });
  it('touching is not overlapping', () => {
    expect(blockIntersectsBody(0, 9, 0, feet, shape)).toBe(false); // block under the feet
    expect(blockIntersectsBody(0, 12, 0, feet, shape)).toBe(false); // above the head (10 + 1.8 = 11.8 < 12)
    expect(blockIntersectsBody(1, 10, 0, feet, shape)).toBe(false); // body spans x 0.2..0.8
  });
});

describe('placementTarget', () => {
  const air = () => BlockId.AIR;
  it('places on the face that was hit', () => {
    const hit = { x: 5, y: 9, z: 5, nx: 0, ny: 1, nz: 0, distance: 3 };
    expect(placementTarget(hit, air, BlockId.STONE, feet, shape)).toEqual({ x: 5, y: 10, z: 5 });
  });
  it('refuses to place a solid block inside the player', () => {
    const hit = { x: 0, y: 9, z: 0, nx: 0, ny: 1, nz: 0, distance: 1 };
    expect(placementTarget(hit, air, BlockId.STONE, feet, shape)).toBeNull();
  });
  it('can replace water but not other blocks', () => {
    const hit = { x: 5, y: 9, z: 5, nx: 0, ny: 1, nz: 0, distance: 3 };
    expect(placementTarget(hit, () => BlockId.WATER, BlockId.STONE, feet, shape)).not.toBeNull();
    expect(placementTarget(hit, () => BlockId.DIRT, BlockId.STONE, feet, shape)).toBeNull();
  });
  it('refuses to place outside the world height', () => {
    const hit = { x: 5, y: 127, z: 5, nx: 0, ny: 1, nz: 0, distance: 3 };
    expect(placementTarget(hit, air, BlockId.STONE, feet, shape)).toBeNull();
  });
  it('canBreak', () => {
    expect(canBreak(BlockId.STONE)).toBe(true);
    expect(canBreak(BlockId.BEDROCK)).toBe(false);
    expect(canBreak(BlockId.WATER)).toBe(false);
  });
});

describe('Hotbar', () => {
  it('selects, scrolls with wrap-around, and picks', () => {
    const h = new Hotbar();
    expect(h.selected).toBe(0);
    expect(h.selectedBlock).toBe(BlockId.STONE);
    h.select(4);
    expect(h.selected).toBe(4);
    h.select(9); // out of range: ignored
    expect(h.selected).toBe(4);
    h.scroll(5);
    expect(h.selected).toBe(0);
    h.scroll(-1);
    expect(h.selected).toBe(8);
    h.pick(BlockId.DIRT); // already in slot 1: select it
    expect(h.selected).toBe(1);
    h.pick(BlockId.SAND); // not in the hotbar: replaces the selected slot
    expect(h.slots[1]).toBe(BlockId.SAND);
    expect(h.selectedBlock).toBe(BlockId.SAND);
  });
});
