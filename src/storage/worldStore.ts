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
  readonly stale?: boolean;
  /** Writes the meta and these chunk records (replacing records with the same key) in one transaction. */
  write(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean>;
  /** Deletes the meta and every chunk record. */
  clear(): Promise<boolean>;
  /** Atomically replaces the complete save; failure leaves the previous save intact. */
  replace(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean>;
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

  replace(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean> {
    if (this.failWrites) return Promise.resolve(false);
    const nextMeta=clone(meta),nextChunks=new Map(chunks.map(c=>[c.key,clone(c)]));
    this.meta=nextMeta;this.chunks.clear();for(const [key,c] of nextChunks)this.chunks.set(key,c);
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
const REVISION_KEY = 'world-revision';

/** IndexedDB database `voxel-game`, schema version 1: object stores `meta` (one record) and `chunks` (by key). */
export class IndexedDbWorldStore implements WorldStore {
  private staleSession = false;
  get stale():boolean { return this.staleSession; }
  private constructor(private readonly db: IDBDatabase, private revision:number) {}

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
        request.onsuccess = () => {
          const db=request.result;
          try {
            const read=db.transaction(META_STORE,'readonly').objectStore(META_STORE).get(REVISION_KEY);
            read.onsuccess=()=>{
              const revision=read.result ?? 0;
              if(!Number.isSafeInteger(revision)||revision<0){db.close();resolve(null);return;}
              resolve(new IndexedDbWorldStore(db,revision));
            };
            read.onerror=()=>{db.close();resolve(null);};
          } catch {db.close();resolve(null);}
        };
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
    }, true);
  }

  replace(meta: MetaRecord, chunks: ChunkRecord[]): Promise<boolean> {
    return this.transaction(tx=>{
      const records=tx.objectStore(CHUNK_STORE); records.clear();
      tx.objectStore(META_STORE).put(meta,META_KEY);
      for(const chunk of chunks)records.put(chunk);
    }, true);
  }

  /** Check the opened world's generation inside every write transaction; stale tabs cannot resurrect old saves. */
  private transaction(work: (tx: IDBTransaction) => void, replace=false): Promise<boolean> {
    const expected=this.revision;
    return new Promise(resolve=>{
      let tx:IDBTransaction|undefined;
      const abort=()=>{try{tx?.abort();}catch{/* inactive */}resolve(false);};
      try {
        const current=this.db.transaction([META_STORE,CHUNK_STORE],'readwrite');tx=current;
        current.oncomplete=()=>{if(replace)this.revision=expected+1;resolve(true);};
        current.onerror=()=>resolve(false);current.onabort=()=>resolve(false);
        const version=current.objectStore(META_STORE).get(REVISION_KEY);
        version.onsuccess=()=>{
          if((version.result ?? 0)!==expected){this.staleSession=true;abort();return;}
          try {
            work(current);
            if(replace)current.objectStore(META_STORE).put(expected+1,REVISION_KEY);
          } catch {abort();}
        };
      } catch {abort();}
    });
  }
}
