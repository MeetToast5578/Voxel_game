import * as THREE from 'three';
import { getBlockDef, blockBoxes, blockFaceTile, blockTopHeight, blockBottomHeight, Tile } from '../world/blocks';
import { tileUV } from './tiles';

type Corner = [number, number, number];

/** A flat piece with four corners, given bottom-left, bottom-right, top-right, top-left as seen from outside. */
interface Quad {
  corners: [Corner, Corner, Corner, Corner];
  tile: number;
  /** Brightness of the quad's vertices, 0..1. The shader adds the sky light on top. */
  shade: number;
}

/** UV of each corner in order, so the tile is not upside down. */
const CORNER_UV: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** A cube of edge 2h. shaded: sides darker than the top, as in the world; off for the crack overlay. */
function cubeQuads(tiles: { top: number; side: number; bottom: number }, h: number, shaded: boolean): Quad[] {
  const sideX = shaded ? 0.8 : 1;
  const sideZ = shaded ? 0.65 : 1;
  const bottom = shaded ? 0.5 : 1;
  return [
    { corners: [[h, -h, -h], [h, -h, h], [h, h, h], [h, h, -h]], tile: tiles.side, shade: sideX },
    { corners: [[-h, -h, h], [-h, -h, -h], [-h, h, -h], [-h, h, h]], tile: tiles.side, shade: sideX },
    { corners: [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]], tile: tiles.top, shade: 1 },
    { corners: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], tile: tiles.bottom, shade: bottom },
    { corners: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], tile: tiles.side, shade: sideZ },
    { corners: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]], tile: tiles.side, shade: sideZ },
  ];
}

/** Two crossed vertical quads, as plants are drawn in the world. Drawn from both sides (DoubleSide material). */
function crossQuads(tile: number, h: number): Quad[] {
  return [
    { corners: [[-h, -h, -h], [h, -h, h], [h, h, h], [-h, h, -h]], tile, shade: 1 },
    { corners: [[h, -h, -h], [-h, -h, h], [-h, h, h], [h, h, -h]], tile, shade: 1 },
  ];
}

/** Builds one geometry from quads, with the attributes the block shader needs (`aLight` = full sky light). */
function toGeometry(quads: Quad[]): THREE.BufferGeometry {
  const position: number[] = [];
  const uv: number[] = [];
  const color: number[] = [];
  const light: number[] = [];
  const index: number[] = [];
  quads.forEach((q, n) => {
    const t = tileUV(q.tile);
    q.corners.forEach((c, i) => {
      position.push(c[0], c[1], c[2]);
      uv.push(t.u0 + CORNER_UV[i]![0] * (t.u1 - t.u0), t.v0 + CORNER_UV[i]![1] * (t.v1 - t.v0));
      color.push(q.shade, q.shade, q.shade);
      light.push(1, 0);
    });
    index.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute('aLight', new THREE.Float32BufferAttribute(light, 2));
  geometry.setIndex(index);
  return geometry;
}

const cache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = make();
    cache.set(key, geometry);
  }
  return geometry;
}

/** A block as an item or in hand: a cube with its textures, or crossed quads for a plant. Cached per state and size. */
export function blockGeometry(state: number, size: number): THREE.BufferGeometry {
  const def = getBlockDef(state);
  return cached(`block:${state}:${size}`, () =>
    (() => {
      if (def.shape === 'cross') return toGeometry(crossQuads(def.tiles.side, size / 2));
      const normals: Corner[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      const boxes = blockBoxes(state);
      if (boxes) return toGeometry(boxes.flatMap((box) => cubeQuads(def.tiles, size / 2, true).map((q, i) => {
        q.tile = blockFaceTile(state, ...normals[i]!);
        q.corners.forEach((c) => { for (let a = 0; a < 3; a++) c[a] = (c[a]! > 0 ? box[a + 3]! : box[a]!) * size - size / 2; });
        return q;
      })));
      const quads = cubeQuads(def.tiles, size / 2, true);
      quads.forEach((q, i) => {
        q.tile = blockFaceTile(state, ...normals[i]!);
        if (def.shape === 'layer' || def.shape === 'slab') q.corners.forEach(c => { c[1] = (c[1] + size / 2) * (blockTopHeight(state) - blockBottomHeight(state)) + size * blockBottomHeight(state) - size / 2; });
      });
      return toGeometry(quads);
    })(),
  );
}

/** The cube that shows crack stage 0..9 over a block. Cached per stage and size. */
export function crackGeometry(stage: number, size: number): THREE.BufferGeometry {
  const tile = Tile.CRACK_0 + stage;
  return cached(`crack:${stage}:${size}`, () =>
    toGeometry(cubeQuads({ top: tile, side: tile, bottom: tile }, size / 2, false)),
  );
}
