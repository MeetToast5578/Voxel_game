import packed from './woodlandArt.json';
import variations from './variationArt.json';
import trees from './treeArt.json';
import workshops from './workshopArt.json';
import stations from './stationArt.json';
import core from './coreArt.json';
import rework from './reworkArt.json';
import { decodeArtTile, type PackedArtTile } from './artCodec';

const SIZE = 32;
const tiles = new Map<string, Uint8ClampedArray>();
const source: Record<string, PackedArtTile> = { ...packed, ...variations, ...trees, ...workshops, ...stations, ...core, ...rework };

/** Connected fracture lines. Every later stage retains the earlier branches. */
function cracks(stage: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  const branches = [[15, 15, 2, 3], [15, 15, 29, 1], [15, 15, 30, 28], [15, 15, 2, 27],
    [8, 9, 0, 13], [23, 8, 31, 12], [23, 23, 20, 31], [8, 22, 0, 20], [15, 15, 12, 0], [15, 15, 14, 31]];
  for (let b = 0; b <= stage; b++) {
    const [x0, y0, x1, y1] = branches[b]!;
    const n = Math.max(Math.abs(x1! - x0!), Math.abs(y1! - y0!));
    for (let j = 0; j <= n; j++) {
      const x = Math.round(x0! + (x1! - x0!) * j / n);
      const y = Math.round(y0! + (y1! - y0!) * j / n);
      const i = (y * SIZE + x) * 4;
      pixels.set([32, 25, 31, 230], i);
    }
  }
  return pixels;
}

/** Decodes once, synchronously: workers and offline UI need no image requests or DOM. */
export function artworkPixels(name: string): Uint8ClampedArray | undefined {
  const hit = tiles.get(name);
  if (hit) return hit;
  if (/^crack_[0-9]$/.test(name)) {
    const pixels = cracks(Number(name.slice(-1)));
    tiles.set(name, pixels);
    return pixels;
  }
  const tile = source[name];
  if (!tile) return undefined;
  const pixels = decodeArtTile(tile);
  tiles.set(name, pixels);
  return pixels;
}
