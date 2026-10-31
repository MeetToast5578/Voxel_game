import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import { TILE_NAMES, TILE_SIZE, tilePixels } from '../render/tilePixels';

const SIZE = 128;
/** Cells per pixel: 2 cells (1.2 m), so the map shows about 150 m across. */
const SCALE = 2;

/**
 * The map item: a north-up picture of the loaded land around the player, each pixel coloured by the top tile of the
 * highest block there and shaded by slope, with the player in the middle.
 * shortcut: only loaded columns show, nothing is remembered; keep explored columns (saved) if players want a real atlas.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly colours = new Map<number, readonly [number, number, number]>();

  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(SIZE, SIZE);
  }

  /** Average colour of a block's top tile (or side, for cross plants), cached per type. */
  private colour(state: number): readonly [number, number, number] {
    const t = BLOCKS.type(state);
    const hit = this.colours.get(t.id);
    if (hit) return hit;
    const pixels = tilePixels(), layer = TILE_NAMES.indexOf(t.tiles.top), n = TILE_SIZE * TILE_SIZE;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < n; i++) {
      const o = (layer * n + i) * 4;
      if (pixels[o + 3]! < 128) continue;
      r += pixels[o]!;
      g += pixels[o + 1]!;
      b += pixels[o + 2]!;
      count++;
    }
    const c = count ? [r / count, g / count, b / count] as const : [0, 0, 0] as const;
    this.colours.set(t.id, c);
    return c;
  }

  draw(world: World, px: number, pz: number, yaw: number): void {
    const data = this.image.data, x0 = Math.floor(px) - (SIZE * SCALE) / 2, z0 = Math.floor(pz) - (SIZE * SCALE) / 2;
    const height = (x: number, z: number) => world.column(x >> 4, z >> 4)?.skyTop[((z & 15) << 4) | (x & 15)];
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        const x = x0 + i * SCALE, z = z0 + j * SCALE, h = height(x, z), o = (j * SIZE + i) * 4;
        if (h === undefined || !world.isLoaded(x, h, z)) {
          data.set([20, 20, 24, 255], o);
          continue;
        }
        const c = this.colour(world.get(x, h, z));
        // Lit from the north-west: rising ground brighter, falling ground darker.
        const shade = Math.max(0.6, Math.min(1.35, 1 + (h - (height(x - SCALE, z - SCALE) ?? h)) * 0.08));
        data.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], o);
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
    // The player: an arrow the way they look.
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Screen angle (radians, clockwise from straight ahead) from a viewer at (x, z) looking along `yaw` to (tx, tz). */
export function bearing(x: number, z: number, yaw: number, tx: number, tz: number): number {
  const dx = tx - x, dz = tz - z;
  const forward = -Math.sin(yaw) * dx - Math.cos(yaw) * dz, right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  return Math.atan2(right, forward);
}
