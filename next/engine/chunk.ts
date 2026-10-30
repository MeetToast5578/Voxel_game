import { CHUNK_VOLUME } from '../config';
import { chunkKey } from '../core/coords';

/**
 * A 16³ chunk. Block states are palette-compressed: a uniform chunk is a single palette entry with no index array;
 * otherwise each cell holds a palette index, in 8 bits until the palette outgrows 256 entries, then 16.
 * Light is one byte per cell (sky light in the high nibble, block light in the low one), or a single value while
 * every cell has the same light.
 */
export class Chunk {
  readonly key: number;
  /** Bumped on every change to blocks or light; meshing uses it to tell stale results apart. */
  version = 0;
  /** Differs from what generation produced, so saving must store it. */
  modified = false;

  private palette: number[];
  private lookup = new Map<number, number>();
  private indices: Uint8Array | Uint16Array | null = null;
  private light: Uint8Array | null = null;
  private uniformLight: number;

  constructor(readonly cx: number, readonly cy: number, readonly cz: number, fill = 0, skyLight = 0) {
    this.key = chunkKey(cx, cy, cz);
    this.palette = [fill];
    this.lookup.set(fill, 0);
    this.uniformLight = skyLight << 4;
  }

  /** One state everywhere: no index array is held. */
  get uniform(): boolean {
    return this.indices === null;
  }

  get paletteSize(): number {
    return this.palette.length;
  }

  get(i: number): number {
    return this.indices === null ? this.palette[0]! : this.palette[this.indices[i]!]!;
  }

  /** Sets one cell; returns false if it already held that state. */
  set(i: number, state: number): boolean {
    if (this.get(i) === state) return false;
    let p = this.lookup.get(state);
    if (p === undefined) {
      if (this.palette.length === 256 && !(this.indices instanceof Uint16Array)) {
        this.compact();
        if (this.palette.length === 256) this.indices = Uint16Array.from(this.indices!);
      }
      p = this.palette.length;
      this.palette.push(state);
      this.lookup.set(state, p);
    }
    this.indices ??= new Uint8Array(CHUNK_VOLUME);
    this.indices[i] = p;
    this.version++;
    return true;
  }

  /** Writes every cell's state into `out` (length CHUNK_VOLUME). */
  copyTo(out: Uint16Array): void {
    if (this.indices === null) {
      out.fill(this.palette[0]!);
      return;
    }
    const palette = this.palette, indices = this.indices;
    for (let i = 0; i < CHUNK_VOLUME; i++) out[i] = palette[indices[i]!]!;
  }

  /** Replaces every cell from `states` (length CHUNK_VOLUME) and stores it as compactly as it allows. */
  load(states: Uint16Array): void {
    this.palette = [];
    this.lookup.clear();
    const indices = new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const s = states[i]!;
      let p = this.lookup.get(s);
      if (p === undefined) {
        p = this.palette.length;
        this.palette.push(s);
        this.lookup.set(s, p);
      }
      indices[i] = p;
    }
    this.indices = this.palette.length === 1 ? null : this.palette.length <= 256 ? Uint8Array.from(indices) : indices;
    this.version++;
  }

  /** Drops palette entries no cell uses any more, and the index array if one state is left. */
  compact(): void {
    if (this.indices === null) return;
    const states = new Uint16Array(CHUNK_VOLUME);
    this.copyTo(states);
    const version = this.version;
    this.load(states);
    this.version = version;
  }

  skyLight(i: number): number {
    return (this.light === null ? this.uniformLight : this.light[i]!) >> 4;
  }

  blockLight(i: number): number {
    return (this.light === null ? this.uniformLight : this.light[i]!) & 15;
  }

  /** The raw light byte of a cell: sky << 4 | block. */
  lightByte(i: number): number {
    return this.light === null ? this.uniformLight : this.light[i]!;
  }

  setLight(i: number, sky: number, block: number): void {
    const v = (sky << 4) | block;
    if (this.lightByte(i) === v) return;
    if (this.light === null) this.light = new Uint8Array(CHUNK_VOLUME).fill(this.uniformLight);
    this.light[i] = v;
    this.version++;
  }

  /** Writes every cell's light byte into `out`. */
  copyLightTo(out: Uint8Array): void {
    if (this.light === null) out.fill(this.uniformLight);
    else out.set(this.light);
  }

  /** Sets every cell's light at once (for example from the generator), keeping it uniform when it is. */
  loadLight(bytes: Uint8Array): void {
    const first = bytes[0]!;
    this.light = bytes.length < CHUNK_VOLUME || bytes.every((b) => b === first) ? null : Uint8Array.from(bytes);
    this.uniformLight = first;
    this.version++;
  }

  /** Approximate bytes held by this chunk's cell data. */
  get byteSize(): number {
    return (this.indices?.byteLength ?? 0) + (this.light?.byteLength ?? 0) + this.palette.length * 8;
  }
}
