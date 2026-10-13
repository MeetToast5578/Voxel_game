import { SAVE_DB_NAME } from '../config';
import type { ChunkRecord, MetaRecord } from './save';

/** Everything a store holds, as stored (parse with parseMeta and parseChunkRecord). */
export interface StoredWorld {
  /** False if reading failed; meta and chunks are then empty. */
  ok: boolean;
  meta: unknown;
  chunks: unknown[];
}

/** Where the world is saved. Every method is async and never throws: failures resolve to a result to check. */
export interface WorldStore {
  load(): Promise<StoredWorld>;
  /** Writes the meta and these chunk records (replacing records with the same key) in one transaction. */
  write(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean>;
  /** Deletes the meta and every chunk record. */
  clear(): Promise<boolean>;
}

/** Keeps the save in memory: for tests, ?nosave=1, ?seed=, and browsers without IndexedDB. */
export class MemoryWorldStore implements WorldStore {
  private meta: unknown = null;
  private readonly chunks = new Map<string, unknown>();
  /** Tests set this to make writes fail. */
  failWrites = false;

  load(): Promise<StoredWorld> {
    return Promise.resolve({ ok: true, meta: clone(this.meta), chunks: [...this.chunks.values()].map(clone) });
  }

  write(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean> {
    if (this.failWrites) return Promise.resolve(false);
    this.meta = clone(meta);
    for (const c of chunks) this.chunks.set(c.key, clone(c));
    return Promise.resolve(true);
  }

  clear(): Promise<boolean> {
    this.meta = null;
    this.chunks.clear();
    return Promise.resolve(true);
  }
}

/** Stored values are copies, as with IndexedDB's structured clone. */
function clone<T>(value: T): T {
  return value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const META_STORE = 'meta';
const CHUNK_STORE = 'chunks';
const META_KEY = 'meta';

/** IndexedDB database `voxel-game`, schema version 1: object stores `meta` (one record) and `chunks` (by key). */
export class IndexedDbWorldStore implements WorldStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (or creates) the database; resolves to null when IndexedDB is unavailable, e.g. in private mode. */
  static open(): Promise<IndexedDbWorldStore | null> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(SAVE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
          if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(new IndexedDbWorldStore(request.result));
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  load(): Promise<StoredWorld> {
    return new Promise((resolve) => {
      const failed: StoredWorld = { ok: false, meta: null, chunks: [] };
      try {
        const tx = this.db.transaction([META_STORE, CHUNK_STORE], 'readonly');
        const meta = tx.objectStore(META_STORE).get(META_KEY);
        const chunks = tx.objectStore(CHUNK_STORE).getAll();
        tx.oncomplete = () => resolve({ ok: true, meta: meta.result ?? null, chunks: chunks.result ?? [] });
        tx.onerror = () => resolve(failed);
        tx.onabort = () => resolve(failed);
      } catch {
        resolve(failed);
      }
    });
  }

  write(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean> {
    return this.transaction((tx) => {
      tx.objectStore(META_STORE).put(meta, META_KEY);
      const store = tx.objectStore(CHUNK_STORE);
      for (const c of chunks) store.put(c);
    });
  }

  clear(): Promise<boolean> {
    return this.transaction((tx) => {
      tx.objectStore(META_STORE).clear();
      tx.objectStore(CHUNK_STORE).clear();
    });
  }

  /** Runs `work` in a read-write transaction; resolves true once it has completed (is durable). */
  private transaction(work: (tx: IDBTransaction) => void): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([META_STORE, CHUNK_STORE], 'readwrite');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
        work(tx);
      } catch {
        resolve(false);
      }
    });
  }
}
