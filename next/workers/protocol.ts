/** Messages between the main thread and chunk workers. Every request carries an id; the reply echoes it. */
export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'column'; id: number; cx: number; cz: number }
  | { type: 'generate'; id: number; cx: number; cy: number; cz: number }
  | { type: 'mesh'; id: number; states: Uint16Array; light: Uint8Array; climate: Uint8Array };

export type WorkerResponse =
  | { type: 'column'; id: number; top: Int32Array; skyTop: Int32Array; climate: Uint8Array; minTop: number; maxTop: number }
  /**
   * `uniform` is the single state of a uniform chunk (then `states` is absent), or -1. Likewise `uniformLight` is the
   * light byte of every cell, or -1 when `light` holds one per cell.
   */
  | { type: 'generate'; id: number; uniform: number; states?: Uint16Array; uniformLight: number; light?: Uint8Array }
  | { type: 'mesh'; id: number; layers: Uint32Array[] }
  | { type: 'error'; id: number; message: string };
