import { CHUNK_AREA } from '../config';
import { chunkKey, columnIndex, columnKey, localIndex, toChunk, toLocal } from '../core/coords';
import { AIR } from './blocks';
import { Chunk } from './chunk';

/** Per-column data shared by every chunk of a column. */
export class Column {
  readonly key: number;
  /** Loaded chunks in this column. */
  chunkCount = 0;
  /** Generated ground height per cell (cell y of the top solid block), from the generator. */
  readonly surface = new Int32Array(CHUNK_AREA);
  /** Highest cell that stops direct sunlight, per cell; kept current through edits by the light engine. */
  readonly skyTop = new Int32Array(CHUNK_AREA);
  /** The sky top as generated, used below the loaded chunks. */
  readonly generatedSkyTop = new Int32Array(CHUNK_AREA);
  /** Highest generated cell of the column (terrain or trees): above it is open sky. */
  maxTop = 0;

  constructor(readonly cx: number, readonly cz: number) {
    this.key = columnKey(cx, cz);
  }
}

/**
 * The loaded world: chunks and columns keyed by packed integers. It only stores cells; generation, light and meshing
 * are separate systems that read and write through it.
 */
export class World {
  readonly chunks = new Map<number, Chunk>();
  readonly columns = new Map<number, Column>();
  /** Called after a cell changes, with its cell coordinates and old state. */
  onChange: ((x: number, y: number, z: number, previous: number) => void) | null = null;

  chunk(cx: number, cy: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  chunkAt(x: number, y: number, z: number): Chunk | undefined {
    return this.chunks.get(chunkKey(toChunk(x), toChunk(y), toChunk(z)));
  }

  column(cx: number, cz: number): Column | undefined {
    return this.columns.get(columnKey(cx, cz));
  }

  /** The state at a cell; air where no chunk is loaded. */
  get(x: number, y: number, z: number): number {
    const c = this.chunkAt(x, y, z);
    return c === undefined ? AIR : c.get(localIndex(toLocal(x), toLocal(y), toLocal(z)));
  }

  isLoaded(x: number, y: number, z: number): boolean {
    return this.chunkAt(x, y, z) !== undefined;
  }

  /** Sets a cell in a loaded chunk. Returns false if no chunk is loaded there or nothing changed. */
  set(x: number, y: number, z: number, state: number): boolean {
    const c = this.chunkAt(x, y, z);
    if (c === undefined) return false;
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    const previous = c.get(i);
    if (!c.set(i, state)) return false;
    c.modified = true;
    this.onChange?.(x, y, z, previous);
    return true;
  }

  /** Adds a chunk, creating its column record if needed. Replaces a chunk already at that key. */
  add(chunk: Chunk): Column {
    const ck = columnKey(chunk.cx, chunk.cz);
    let column = this.columns.get(ck);
    if (column === undefined) {
      column = new Column(chunk.cx, chunk.cz);
      this.columns.set(ck, column);
    }
    if (!this.chunks.has(chunk.key)) column.chunkCount++;
    this.chunks.set(chunk.key, chunk);
    return column;
  }

  /** Removes a chunk, and its column record once the column has no chunks left. */
  remove(cx: number, cy: number, cz: number): Chunk | undefined {
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (chunk === undefined) return undefined;
    this.chunks.delete(key);
    const ck = columnKey(cx, cz);
    const column = this.columns.get(ck)!;
    if (--column.chunkCount === 0) this.columns.delete(ck);
    return chunk;
  }

  /** Generated ground height at a cell column, or undefined if the column is not loaded. */
  surfaceAt(x: number, z: number): number | undefined {
    return this.columns.get(columnKey(toChunk(x), toChunk(z)))?.surface[columnIndex(toLocal(x), toLocal(z))];
  }
}
