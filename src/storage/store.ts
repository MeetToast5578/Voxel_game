/** Where worlds are kept: a meta record per world, saved chunks and per-column sky tops. */

export const SAVE_VERSION = 4;

export interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
}

export interface WorldMeta {
  version: number;
  name: string;
  seed: number;
  created: number;
  lastPlayed: number;
  /** Bumped on every save; a save from a session that read an older revision is refused (another tab saved). */
  revision: number;
  player: SavedPlayer;
  dayTime: number;
  /** Pending block updates: [x, y, z, kind, ticks remaining]. Checked when loaded. */
  ticks?: unknown;
  /** The simulation's tick counter. */
  simTick?: number;
  /** Time of year, 0..1 from the spring equinox. */
  yearTime?: number;
  /** The player's game state (mode, inventory, health, furnaces); checked when loaded. */
  play?: unknown;
  /** Creatures alive when saved; checked when loaded. */
  creatures?: unknown;
  /** Unloaded chunks with growing crops and when they unloaded; checked when loaded. */
  growth?: unknown;
}

export interface WorldStore {
  listWorlds(): Promise<WorldMeta[]>;
  getMeta(world: string): Promise<WorldMeta | undefined>;
  /** Writes the meta record if the stored revision is still `expectedRevision` (or none is stored); throws otherwise. */
  putMeta(meta: WorldMeta, expectedRevision: number): Promise<void>;
  chunkKeys(world: string): Promise<number[]>;
  getChunk(world: string, key: number): Promise<Uint8Array | undefined>;
  putChunks(world: string, chunks: [number, Uint8Array][]): Promise<void>;
  getColumns(world: string): Promise<Map<number, Int32Array>>;
  putColumns(world: string, columns: [number, Int32Array][]): Promise<void>;
  deleteWorld(world: string): Promise<void>;
}

export class RevisionConflict extends Error {
  constructor() {
    super('The world was saved by another tab or window since it was opened here');
  }
}

/** Checks a meta record read from storage or an import. Returns null if anything is missing or of the wrong type. */
export function parseMeta(value: unknown): WorldMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const p = m.player as Record<string, unknown> | undefined;
  if (m.version !== SAVE_VERSION || typeof m.name !== 'string' || m.name.length === 0 || !num(m.seed) || !num(m.created) ||
    !num(m.lastPlayed) || !num(m.revision) || !num(m.dayTime) || typeof p !== 'object' || p === null ||
    !['x', 'y', 'z', 'yaw', 'pitch'].every((k) => num(p[k])) || typeof p.flying !== 'boolean') return null;
  return {
    version: SAVE_VERSION, name: m.name, seed: m.seed as number, created: m.created as number, lastPlayed: m.lastPlayed as number,
    revision: m.revision as number, dayTime: m.dayTime as number,
    player: { x: p.x as number, y: p.y as number, z: p.z as number, yaw: p.yaw as number, pitch: p.pitch as number, flying: p.flying },
    ...(Array.isArray(m.ticks) ? { ticks: m.ticks } : {}),
    ...(num(m.simTick) ? { simTick: m.simTick as number } : {}),
    ...(num(m.yearTime) ? { yearTime: m.yearTime as number } : {}),
    ...(typeof m.play === 'object' && m.play !== null ? { play: m.play } : {}),
    ...(Array.isArray(m.creatures) ? { creatures: m.creatures } : {}),
    ...(Array.isArray(m.growth) ? { growth: m.growth } : {}),
  };
}

/** In-memory store, for tests and when IndexedDB is unavailable. */
export class MemoryStore implements WorldStore {
  private readonly metas = new Map<string, WorldMeta>();
  private readonly chunks = new Map<string, Map<number, Uint8Array>>();
  private readonly columns = new Map<string, Map<number, Int32Array>>();

  async listWorlds() {
    return [...this.metas.values()].map((m) => structuredClone(m));
  }

  async getMeta(world: string) {
    const m = this.metas.get(world);
    return m && structuredClone(m);
  }

  async putMeta(meta: WorldMeta, expectedRevision: number) {
    const current = this.metas.get(meta.name);
    if (current && current.revision !== expectedRevision) throw new RevisionConflict();
    this.metas.set(meta.name, structuredClone(meta));
  }

  async chunkKeys(world: string) {
    return [...(this.chunks.get(world)?.keys() ?? [])];
  }

  async getChunk(world: string, key: number) {
    return this.chunks.get(world)?.get(key)?.slice();
  }

  async putChunks(world: string, chunks: [number, Uint8Array][]) {
    let m = this.chunks.get(world);
    if (!m) this.chunks.set(world, (m = new Map()));
    for (const [k, v] of chunks) m.set(k, v.slice());
  }

  async getColumns(world: string) {
    return new Map([...(this.columns.get(world) ?? [])].map(([k, v]) => [k, v.slice()]));
  }

  async putColumns(world: string, columns: [number, Int32Array][]) {
    let m = this.columns.get(world);
    if (!m) this.columns.set(world, (m = new Map()));
    for (const [k, v] of columns) m.set(k, v.slice());
  }

  async deleteWorld(world: string) {
    this.metas.delete(world);
    this.chunks.delete(world);
    this.columns.delete(world);
  }
}

const DB_NAME = 'voxel-next';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new RevisionConflict());
  });
}

/** IndexedDB store: database 'voxel-next', separate from the old game's saves. */
export class IdbStore implements WorldStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbStore> {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('meta', { keyPath: 'name' });
      db.createObjectStore('chunks');
      db.createObjectStore('columns');
    };
    return new IdbStore(await request(r));
  }

  async listWorlds() {
    const all = await request(this.db.transaction('meta').objectStore('meta').getAll());
    return all.map(parseMeta).filter((m): m is WorldMeta => m !== null);
  }

  async getMeta(world: string) {
    return parseMeta(await request(this.db.transaction('meta').objectStore('meta').get(world))) ?? undefined;
  }

  async putMeta(meta: WorldMeta, expectedRevision: number) {
    const tx = this.db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const finished = done(tx);
    const current = parseMeta(await request(store.get(meta.name)));
    if (current && current.revision !== expectedRevision) {
      tx.abort();
      await finished.catch(() => undefined);
      throw new RevisionConflict();
    }
    store.put(meta);
    await finished;
  }

  async chunkKeys(world: string) {
    const keys = await request(this.db.transaction('chunks').objectStore('chunks').getAllKeys(IDBKeyRange.bound([world], [world, []])));
    return keys.map((k) => (k as [string, number])[1]);
  }

  async getChunk(world: string, key: number) {
    const v = await request(this.db.transaction('chunks').objectStore('chunks').get([world, key]));
    return v instanceof Uint8Array ? v : undefined;
  }

  async putChunks(world: string, chunks: [number, Uint8Array][]) {
    const tx = this.db.transaction('chunks', 'readwrite');
    for (const [k, v] of chunks) tx.objectStore('chunks').put(v, [world, k]);
    await done(tx);
  }

  async getColumns(world: string) {
    const tx = this.db.transaction('columns');
    const range = IDBKeyRange.bound([world], [world, []]);
    const [keys, values] = await Promise.all([request(tx.objectStore('columns').getAllKeys(range)), request(tx.objectStore('columns').getAll(range))]);
    return new Map(keys.map((k, i) => [(k as [string, number])[1], values[i] as Int32Array]));
  }

  async putColumns(world: string, columns: [number, Int32Array][]) {
    const tx = this.db.transaction('columns', 'readwrite');
    for (const [k, v] of columns) tx.objectStore('columns').put(v, [world, k]);
    await done(tx);
  }

  async deleteWorld(world: string) {
    const tx = this.db.transaction(['meta', 'chunks', 'columns'], 'readwrite');
    const range = IDBKeyRange.bound([world], [world, []]);
    tx.objectStore('meta').delete(world);
    tx.objectStore('chunks').delete(range);
    tx.objectStore('columns').delete(range);
    await done(tx);
  }
}
