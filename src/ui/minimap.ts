import type { World } from '../engine/world';
import { Atlas, MAP_SCALE } from './atlas';

const SIZE = 128;

/**
 * The map item: a north-up picture of the land the player has seen around them (about 150 m across), from the
 * atlas, with the player in the middle. Unseen land is dark.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  readonly atlas = new Atlas();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(SIZE, SIZE);
  }

  draw(world: World, px: number, pz: number, yaw: number): void {
    this.atlas.record(world, px, pz, SIZE / 2);
    const data = this.image.data, mx0 = Math.floor(px / MAP_SCALE) - SIZE / 2, mz0 = Math.floor(pz / MAP_SCALE) - SIZE / 2;
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        const c = this.atlas.at(mx0 + i, mz0 + j);
        data.set(c ? [c[0], c[1], c[2], 255] : [20, 20, 24, 255], (j * SIZE + i) * 4);
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
