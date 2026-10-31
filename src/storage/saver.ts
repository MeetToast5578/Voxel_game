import { columnKey } from '../core/coords';
import type { Chunk } from '../engine/chunk';
import type { World } from '../engine/world';
import { decodeChunk, encodeChunk } from './chunkCodec';
import type { WorldMeta, WorldStore } from './store';

/**
 * Saves a world as whole chunks: every chunk that differs from what generation makes, plus the sky tops of their
 * columns and a meta record. There is no edit log, so a save only grows with the area that was changed.
 * Chunks unloaded before an autosave are encoded at once and kept here until written.
 */
export class Saver {
  /** Chunks stored in the save (or waiting to be written). */
  private readonly saved: Set<number>;
  private readonly columns: Map<number, Int32Array>;
  /** chunk.version when each chunk was last encoded. */
  private readonly savedVersion = new Map<number, number>();
  /** Encoded chunks not yet written to the store. */
  private readonly pending = new Map<number, Promise<Uint8Array>>();
  private readonly pendingColumns = new Map<number, Int32Array>();
  /** Encoded chunks being written right now; a reload during the write reads them from here. */
  private readonly writing = new Map<number, Promise<Uint8Array>>();
  private revision: number;
  private saving: Promise<void> = Promise.resolve();
  conflict = false;

  private constructor(private readonly store: WorldStore, private meta: WorldMeta, keys: number[], columns: Map<number, Int32Array>) {
    this.saved = new Set(keys);
    this.columns = columns;
    this.revision = meta.revision;
  }

  /** Opens a world, creating its meta record if it does not exist yet. */
  static async open(store: WorldStore, meta: WorldMeta): Promise<Saver> {
    const existing = await store.getMeta(meta.name);
    if (!existing) await store.putMeta(meta, meta.revision);
    const m = existing ?? meta;
    const [keys, columns] = await Promise.all([store.chunkKeys(m.name), store.getColumns(m.name)]);
    return new Saver(store, m, keys, columns);
  }

  get worldMeta(): WorldMeta {
    return this.meta;
  }

  /** Whether a chunk comes from the save rather than the generator. */
  has(key: number): boolean {
    return this.saved.has(key);
  }

  /** Saved sky tops of a column whose chunks were changed. */
  skyTop(cx: number, cz: number): Int32Array | undefined {
    const key = columnKey(cx, cz);
    return this.pendingColumns.get(key) ?? this.columns.get(key);
  }

  /** Reads a saved chunk; null if it is missing or unreadable (then it is generated instead). */
  async load(cx: number, cy: number, cz: number, key: number): Promise<Chunk | null> {
    try {
      const data = await (this.pending.get(key) ?? this.writing.get(key) ?? this.store.getChunk(this.meta.name, key));
      if (!data) return null;
      const chunk = await decodeChunk(cx, cy, cz, data);
      this.savedVersion.set(key, chunk.version);
      return chunk;
    } catch (err) {
      console.warn(`Saved chunk ${cx},${cy},${cz} could not be read; generating it instead.`, err);
      return null;
    }
  }

  /** Encodes a changed chunk now, because it is about to be unloaded. */
  unload(chunk: Chunk, world: World): void {
    if (chunk.modified && this.savedVersion.get(chunk.key) !== chunk.version) this.capture(chunk, world);
    this.savedVersion.delete(chunk.key);
  }

  private capture(chunk: Chunk, world: World): void {
    this.saved.add(chunk.key);
    this.savedVersion.set(chunk.key, chunk.version);
    this.pending.set(chunk.key, encodeChunk(chunk));
    const column = world.column(chunk.cx, chunk.cz);
    if (column) this.pendingColumns.set(column.key, column.skyTop.slice());
  }

  /** Writes every changed chunk, their columns and the meta record. Saves run one after another. */
  save(world: World, meta: Partial<WorldMeta>): Promise<void> {
    for (const chunk of world.chunks.values()) {
      if (chunk.modified && this.savedVersion.get(chunk.key) !== chunk.version) this.capture(chunk, world);
    }
    const chunks = [...this.pending];
    const columns = [...this.pendingColumns];
    this.pending.clear();
    this.pendingColumns.clear();
    for (const [k, p] of chunks) this.writing.set(k, p);
    this.saving = this.saving.then(async () => {
      if (this.conflict) return;
      const encoded = await Promise.all(chunks.map(async ([k, p]) => [k, await p] as [number, Uint8Array]));
      if (encoded.length) await this.store.putChunks(this.meta.name, encoded);
      for (const [k, p] of chunks) if (this.writing.get(k) === p) this.writing.delete(k);
      if (columns.length) await this.store.putColumns(this.meta.name, columns);
      for (const [k, v] of columns) this.columns.set(k, v);
      const next: WorldMeta = { ...this.meta, ...meta, lastPlayed: Date.now(), revision: this.revision + 1 };
      try {
        await this.store.putMeta(next, this.revision);
      } catch (err) {
        this.conflict = true;
        throw err;
      }
      this.meta = next;
      this.revision = next.revision;
    });
    return this.saving;
  }
}
