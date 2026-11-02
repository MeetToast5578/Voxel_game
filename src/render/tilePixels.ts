import { BLOCKS } from '../engine/blocks';
import { artworkPixels } from './woodlandArt';
import { EXTRA_TILE_NAMES } from './variationNames';

/** Authored Woodland & Ember tiles, shared by terrain, items and UI. */
export const TILE_SIZE = 32;

/** Every tile name the block table uses, in a fixed order: the layer index of each tile. */
export const TILE_NAMES: readonly string[] = [...new Set([
  ...BLOCKS.types.filter((t) => t.layer !== 'none')
    .flatMap((t) => t.variantTiles ?? [t.tiles.top, t.tiles.side, t.tiles.bottom, ...(t.front ? [t.front] : []), ...(t.variantFaces?.flatMap(f => [f.top,f.side,f.bottom]) ?? [])]),
  ...Array.from({ length: 10 }, (_, i) => 'crack_' + i),
  ...EXTRA_TILE_NAMES, 'ember_pickaxe', 'ember_chestplate',
])];

export function tileIndex(name: string): number {
  const i = TILE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Unknown tile '${name}'`);
  return i;
}

/** The tile that shows a state as an item (slot icons, dropped items): its front, side or own tile. */
export function itemTile(state: number, upgrade = 0): string {
  const t = BLOCKS.type(state);
  if(upgrade>0&&t.tool?.kind==='pickaxe')return 'ember_pickaxe';
  if(upgrade>0&&t.armour?.slot===1)return 'ember_chestplate';
  const faces = t.variantFaces?.[state-t.id] ?? t.tiles;
  return t.variantTiles ? t.variantTiles[state - t.id]! : t.front ?? (t.shape === 'cube' ? faces.side : faces.top);
}

export function hasPainter(name: string): boolean {
  return /^crack_[0-9]$/.test(name) || artworkPixels(name) !== undefined;
}

let cached: Uint8ClampedArray | undefined;
/** RGBA layers, bottom row first for WebGL. Do not mutate this shared pixel buffer. */
export function tilePixels(): Uint8ClampedArray {
  if (cached) return cached;
  const layer = TILE_SIZE * TILE_SIZE * 4;
  cached = new Uint8ClampedArray(layer * TILE_NAMES.length);
  TILE_NAMES.forEach((name, t) => {
    const pixels = artworkPixels(name);
    if (!pixels) throw new Error(`Missing artwork for '${name}'`);
    for (let y = 0; y < TILE_SIZE; y++) {
      cached!.set(pixels.subarray(y * TILE_SIZE * 4, (y + 1) * TILE_SIZE * 4),
        t * layer + (TILE_SIZE - 1 - y) * TILE_SIZE * 4);
    }
  });
  return cached;
}
