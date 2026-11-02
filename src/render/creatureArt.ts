import { SPECIES } from '../creatures/species';
import skins from './creatureSkins.json';
import { decodeArtTile, type PackedArtTile } from './artCodec';

export const SKIN_SIZE = 32;
export const SKIN_ROWS = 4;
export const SKIN_COLUMNS = SPECIES.length;
export const SKIN_INDEX = new Map(SPECIES.map((s, i) => [s.key, i]));
const source: Record<string, PackedArtTile> = skins;

/** Full-colour authored body/face/leg skins, packed into the existing instanced creature atlas. */
export function creaturePixels(): Uint8Array {
  const width = SKIN_COLUMNS * SKIN_SIZE;
  const pixels = new Uint8Array(width * SKIN_SIZE * SKIN_ROWS * 4);
  SPECIES.forEach((s, column) => {
    ['body', 'face', 'legs'].forEach((part, row) => {
      const tile = source[`${s.key}_${part}`];
      if (!tile) throw new Error(`Missing creature skin: ${s.key}_${part}`);
      const decoded = decodeArtTile(tile);
      for (let y = 0; y < SKIN_SIZE; y++) {
        const offset = ((row * SKIN_SIZE + SKIN_SIZE - 1 - y) * width + column * SKIN_SIZE) * 4;
        pixels.set(decoded.subarray(y * SKIN_SIZE * 4, (y + 1) * SKIN_SIZE * 4), offset);
      }
    });
  });
  // A neutral fourth row supplies untextured horn, tusk and glowing-core parts.
  pixels.fill(255, width * SKIN_SIZE * 3 * 4);
  return pixels;
}
