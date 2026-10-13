import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId, getBlockDef, isOpaque, isSolid } from '../src/world/blocks';

describe('blocks', () => {
  it('BLOCKS[i].id === i for every block', () => {
    BLOCKS.forEach((b, i) => expect(b.id).toBe(i));
    expect(BLOCKS.length).toBe(Object.keys(BlockId).length);
  });
  it('air, water and see-through blocks', () => {
    expect(isSolid(BlockId.AIR)).toBe(false);
    expect(isOpaque(BlockId.AIR)).toBe(false);
    expect(isSolid(BlockId.WATER)).toBe(false);
    expect(getBlockDef(BlockId.WATER).layer).toBe('translucent');
    expect(getBlockDef(BlockId.WATER).targetable).toBe(false);
    expect(isOpaque(BlockId.LEAVES)).toBe(false);
    expect(isSolid(BlockId.LEAVES)).toBe(true);
    expect(isOpaque(BlockId.GLASS)).toBe(false);
    expect(isOpaque(BlockId.STONE)).toBe(true);
    expect(getBlockDef(BlockId.BEDROCK).breakable).toBe(false);
  });
  it('every non-air block has a render layer and valid tiles', () => {
    for (const b of BLOCKS.slice(1)) {
      expect(b.layer).not.toBe('none');
      for (const t of [b.tiles.top, b.tiles.side, b.tiles.bottom]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(256);
      }
    }
  });
  it('getBlockDef throws on unknown ids', () => {
    expect(() => getBlockDef(200)).toThrow();
  });
});
