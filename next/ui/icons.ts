import { BLOCKS } from '../engine/blocks';
import { TILE_NAMES, TILE_SIZE, tilePixels } from '../render/tilePixels';

let pixels: Uint8ClampedArray | null = null;
const cache = new Map<number, string>();

/** A data URL of the 16×16 picture shown for a state in slots: its front, side or own tile. */
export function iconUrl(state: number): string {
  const hit = cache.get(state);
  if (hit) return hit;
  pixels ??= tilePixels();
  const t = BLOCKS.type(state);
  const v = state - t.id;
  const name = t.variantTiles ? t.variantTiles[v]! : t.front ?? (t.shape === 'cube' ? t.tiles.side : t.tiles.top);
  const layer = TILE_NAMES.indexOf(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  const size = TILE_SIZE * TILE_SIZE * 4;
  // Tile layers are stored bottom row first; images are top row first.
  for (let y = 0; y < TILE_SIZE; y++) {
    image.data.set(pixels.subarray(layer * size + (TILE_SIZE - 1 - y) * TILE_SIZE * 4, layer * size + (TILE_SIZE - y) * TILE_SIZE * 4), y * TILE_SIZE * 4);
  }
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL();
  cache.set(state, url);
  return url;
}
