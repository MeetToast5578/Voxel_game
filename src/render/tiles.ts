export const TILE_SIZE = 16; // pixels per tile
export const ATLAS_TILES = 16; // tiles per row/column
export const ATLAS_SIZE = TILE_SIZE * ATLAS_TILES; // 256 px
const UV_INSET = 1 / 1024;

export interface TileUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** UV rectangle of a tile. Tile 0 is the top-left of the atlas canvas. Assumes texture.flipY === true (three.js default). */
export function tileUV(tile: number): TileUV {
  const col = tile % ATLAS_TILES;
  const row = Math.floor(tile / ATLAS_TILES);
  return {
    u0: col / ATLAS_TILES + UV_INSET,
    u1: (col + 1) / ATLAS_TILES - UV_INSET,
    v0: 1 - (row + 1) / ATLAS_TILES + UV_INSET,
    v1: 1 - row / ATLAS_TILES - UV_INSET,
  };
}
