import { ATLAS_TILES, TILE_SIZE } from '../render/tiles';
import { getBlockDef } from '../world/blocks';

/** Pixels per side of a block icon. The views scale it up without smoothing. */
export const ICON_PIXELS = 32;

/** Draws a block's side texture into a square canvas, scaled up without smoothing. State 0 clears the canvas. */
export function drawBlockIcon(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, state: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state === 0) return;
  const tile = getBlockDef(state).tiles.side;
  const sx = (tile % ATLAS_TILES) * TILE_SIZE;
  const sy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
  ctx.drawImage(atlas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, canvas.width, canvas.height);
}

const urls = new Map<number, string>();

/** A block's icon as an image URL, made once per block state. Empty for state 0 (air). */
export function iconUrl(atlas: HTMLCanvasElement, state: number): string {
  if (state === 0) return '';
  let url = urls.get(state);
  if (url === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PIXELS;
    canvas.height = ICON_PIXELS;
    drawBlockIcon(canvas, atlas, state);
    url = canvas.toDataURL();
    urls.set(state, url);
  }
  return url;
}
