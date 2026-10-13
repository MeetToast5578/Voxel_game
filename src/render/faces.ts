export type Vec3Tuple = readonly [number, number, number];

export interface FaceDef {
  /** Outward normal; also the offset to the neighbor block this face touches. */
  readonly dir: Vec3Tuple;
  /** 4 unit-cube corners, counter-clockwise when viewed from outside: bottom-left, bottom-right, top-right, top-left. */
  readonly corners: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
  /** Constant directional brightness multiplier. */
  readonly shade: number;
  /** Which texture of the block this face uses. */
  readonly tile: 'top' | 'side' | 'bottom';
}

export const FACES: readonly FaceDef[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.6, tile: 'side' }, // +X east
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6, tile: 'side' }, // -X west
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, tile: 'top' }, // +Y top
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, tile: 'bottom' }, // -Y bottom
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8, tile: 'side' }, // +Z south
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, tile: 'side' }, // -Z north
];

/** UV corner for each of the 4 face vertices (matches FaceDef.corners order). */
export const FACE_UVS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
