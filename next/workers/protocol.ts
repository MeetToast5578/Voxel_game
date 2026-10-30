/** Messages between the main thread and chunk workers. Every request carries an id; the reply echoes it. */
export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'column'; id: number; cx: number; cz: number }
  | { type: 'generate'; id: number; cx: number; cy: number; cz: number }
  | { type: 'mesh'; id: number; states: Uint16Array; light: Uint8Array; climate: Uint8Array }
  /** Far terrain on rings around (x, z) (cells): `radii` ring distances, `segments` samples per ring. */
  | { type: 'horizon'; id: number; x: number; z: number; radii: Float32Array; segments: number };

export type WorkerResponse =
  | { type: 'column'; id: number; top: Int32Array; skyTop: Int32Array; climate: Uint8Array; minTop: number; maxTop: number }
  /**
   * `uniform` is the single state of a uniform chunk (then `states` is absent), or -1. Likewise `uniformLight` is the
   * light byte of every cell, or -1 when `light` holds one per cell.
   */
  | { type: 'generate'; id: number; uniform: number; states?: Uint16Array; uniformLight: number; light?: Uint8Array }
  /** `visibility`: which pairs of the chunk's faces are joined through open cells (see engine/visibility.ts). */
  | { type: 'mesh'; id: number; layers: Uint32Array[]; visibility: number }
  | { type: 'horizon'; id: number; heights: Float32Array; colors: Uint8Array }
  | { type: 'error'; id: number; message: string };
