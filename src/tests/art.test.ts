import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { TILE_NAMES, TILE_SIZE, itemTile, tilePixels } from '../render/tilePixels';
import { artworkPixels } from '../render/woodlandArt';

describe('Woodland & Ember artwork', () => {
  it('covers every registered face, item, crop stage and breaking overlay with RGBA pixels', () => {
    expect(TILE_SIZE).toBe(32);
    const packed = tilePixels();
    expect(packed.length).toBe(TILE_NAMES.length * 32 * 32 * 4);
    for (const name of TILE_NAMES) {
      const p = artworkPixels(name)!;
      expect(p, name).toBeDefined();
      expect(p.length, name).toBe(4096);
      expect(p.some((v, i) => i % 4 === 3 && v > 0), name).toBe(true);
      // WebGL layer orientation is bottom-first; UI reverses it back.
      const layer = TILE_NAMES.indexOf(name) * 4096;
      // Clear texels take a fill colour (see the halo test), so only visible texels are compared.
      const visible = (a: ArrayLike<number>) => Array.from({ length: 32 }, (_, i) => a[i * 4 + 3] ? [...Array.from({ length: 4 }, (_, k) => a[i * 4 + k])] : 0);
      expect(visible(packed.subarray(layer, layer + 128)), name).toEqual(visible(p.subarray(31 * 128)));
    }
  });
  it('keeps opaque terrain solid and held items on transparent backgrounds', () => {
    for (const t of BLOCKS.types) {
      if (t.layer === 'none') continue;
      const p = artworkPixels(itemTile(t.id))!;
      const alpha = Array.from(p).filter((_, i) => i % 4 === 3);
      if (t.item) {
        expect(alpha.includes(0), t.key).toBe(true);
        expect(alpha.includes(255), t.key).toBe(true);
      } else if (t.opaque) expect(alpha.every(a => a === 255), t.key).toBe(true);
    }
  });
  it('gives clear texels of cutouts the art colour, so distant plants have no dark halo', () => {
    const p = tilePixels(), size = TILE_SIZE * TILE_SIZE * 4, layer = TILE_NAMES.indexOf('poppy');
    const clear = Array.from({ length: TILE_SIZE * TILE_SIZE }, (_, i) => layer * size + i * 4).filter((o) => p[o + 3] === 0);
    expect(clear.length).toBeGreaterThan(0);
    expect(clear.every((o) => p[o]! + p[o + 1]! + p[o + 2]! > 60)).toBe(true);
  });
  it('matches natural texture edges under repetition', () => {
    for (const name of ['stone','dirt','grass_top','grass_side','sand','log_side','planks','water','ember_ore']) {
      const p = artworkPixels(name)!;
      for(let i=0;i<32;i++) {
        expect([...p.subarray(i*128,i*128+4)],name).toEqual([...p.subarray(i*128+124,i*128+128)]);
        expect([...p.subarray(i*4,i*4+4)],name).toEqual([...p.subarray(3968+i*4,3972+i*4)]);
      }
    }
  });
  it('adds connected cracks without losing previous stages', () => {
    for(let s=1;s<10;s++) {
      const before=artworkPixels(`crack_${s-1}`)!, after=artworkPixels(`crack_${s}`)!;
      for(let i=3;i<before.length;i+=4) if(before[i]) expect(after[i]).toBeGreaterThanOrEqual(before[i]!);
    }
  });
});
