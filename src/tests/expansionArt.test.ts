import { describe, expect, it } from 'vitest';
import { decodeArtTile, type PackedArtTile } from '../render/artCodec';
import { TILE_NAMES, tileIndex } from '../render/tilePixels';
import { VARIED_MATERIALS, ANIMATED_MATERIALS } from '../render/textureVariants';
import manifest from '../../assets/woodland-ember/expansion/manifest.json';

import trees from '../../assets/woodland-ember/expansion/trees.json';
import creatures from '../../assets/woodland-ember/expansion/creatures.json';
import materials from '../../assets/woodland-ember/expansion/materials.json';
import effects from '../../assets/woodland-ember/expansion/effects.json';
import ui from '../../assets/woodland-ember/expansion/ui.json';
import hands from '../../assets/woodland-ember/expansion/hands.json';
import future from '../../assets/woodland-ember/expansion/future.json';
const sheets: Record<string, Record<string, PackedArtTile>> = { trees, creatures, materials, effects, ui, hands, future };
const load = (group: string): Record<string, PackedArtTile> => sheets[group]!;

describe('expanded asset library', () => {
  it('exports all 336 named assets with valid indices, sizes, pixels and populated image pixels', () => {
    let count = 0;
    const names = new Set<string>();
    for (const [group, sheet] of Object.entries(manifest)) {
      const packed = load(group);
      expect(sheet.names.length).toBe(sheet.columns * sheet.rows);
      expect(Object.keys(packed)).toEqual(sheet.names);
      for (const name of sheet.names) {
        expect(names.has(name), name).toBe(false); names.add(name);
        const tile = packed[name]!;
        const bytes = atob(tile.indices);
        expect(bytes.length, name).toBe(sheet.size ** 2 * 2);
        for (let i = 0; i < bytes.length; i += 2) expect((bytes.charCodeAt(i) | bytes.charCodeAt(i + 1) << 8) * 4 + 3, name).toBeLessThan(tile.palette.length);
        const rgba = decodeArtTile(tile);
        expect(rgba.some((v, i) => i % 4 === 3 && v > 0), name).toBe(true);
        count++;
      }
    }
    expect(count).toBe(336);
  });
  it('keeps material alternatives contiguous and fluids animated within packed vertex limits', () => {
    expect(TILE_NAMES.length).toBeLessThanOrEqual(1024);
    for (const name of VARIED_MATERIALS) {
      const start = tileIndex(`${name}_alt_0`);
      for (let v = 0; v < 4; v++) expect(tileIndex(`${name}_alt_${v}`)).toBe(start + v);
    }
    for (const name of ANIMATED_MATERIALS) {
      const start = tileIndex(`${name}_0`);
      const frames = load('effects');
      for (let v = 0; v < 8; v++) {
        expect(tileIndex(`${name}_${v}`)).toBe(start + v);
        const p = decodeArtTile(frames[`${name}_${v}`]!);
        expect(Array.from(p).filter((_, i) => i % 4 === 3).every(a => a === 255)).toBe(true);
      }
      expect(frames[`${name}_0`]).not.toEqual(frames[`${name}_1`]);
    }
  });
  it('exports transparent UI symbols, hand sprites and all eight sapling species', () => {
    for (const [group, name] of [['ui', 'nav_settings'], ['ui', 'prompt_idle'], ['hands', 'bare_idle'], ['hands', 'palm_sapling']]) {
      const p = decodeArtTile(load(group!)[name!]!);
      const alpha = Array.from(p).filter((_, i) => i % 4 === 3);
      expect(alpha.includes(0), name).toBe(true);
      expect(alpha.some(a => a > 127), name).toBe(true);
    }
    const saplings = [...manifest.trees.names, ...manifest.hands.names].filter(n => n.endsWith('_sapling'));
    expect(saplings).toHaveLength(8);
  });
});
