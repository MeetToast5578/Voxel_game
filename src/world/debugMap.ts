import { metersToBlocks, SEA_LEVEL, TERRAIN_MAX_BLOCKS } from '../config';
import type { TerrainGenerator } from './generator';

/**
 * RGBA pixels of a size x size top-down map of the surface. Pixel (px, pz) covers the column at world x = x0 + px * stride,
 * z = z0 + pz * stride, in blocks. Below sea level the colour darkens with depth; above it runs from green at sea level to
 * white at the highest terrain.
 */
export function mapPixels(
  generator: TerrainGenerator,
  x0: number,
  z0: number,
  size: number,
  stride = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let pz = 0; pz < size; pz++)
    for (let px = 0; px < size; px++) {
      const h = generator.getHeight(x0 + px * stride, z0 + pz * stride);
      const [r, g, b] = h < SEA_LEVEL ? seaColour(h) : landColour(h);
      const i = (pz * size + px) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  return out;
}

function seaColour(h: number): [number, number, number] {
  const depth = Math.min(1, (SEA_LEVEL - h) / metersToBlocks(300)); // 300 m deep is the darkest
  return [20, 60 + Math.round(40 * (1 - depth)), 160 + Math.round(60 * (1 - depth))];
}

function landColour(h: number): [number, number, number] {
  const t = Math.min(1, (h - SEA_LEVEL) / (TERRAIN_MAX_BLOCKS - SEA_LEVEL)); // 0 at sea level, 1 at the highest terrain
  if (t < 0.5) {
    const u = t * 2; // green to brown
    return [Math.round(60 + 110 * u), Math.round(140 - 40 * u), Math.round(50 - 10 * u)];
  }
  const u = (t - 0.5) * 2; // brown to white
  return [Math.round(170 + 85 * u), Math.round(100 + 155 * u), Math.round(40 + 215 * u)];
}
