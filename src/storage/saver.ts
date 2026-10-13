import { chunkRecord, metaRecord, type WorldMeta } from './save';
import type { WorldStore } from './worldStore';

/** What the saver needs from the world: its edits and which chunks' edits changed since the last write. */
export interface EditSource {
  readonly edits: ReadonlyMap<string, ReadonlyMap<number, number>>;
  /** Returns the chunk keys whose edits changed since the last call, and forgets them. */
  takeDirtyEdits(): string[];
  /** Marks chunk keys as changed again (their write failed). */
  restoreDirtyEdits(keys: readonly string[]): void;
}

/**
 * Writes the meta plus only the chunks whose edits changed. Two writes never run at once: a save requested while
 * one is running runs once after it (several requests share that one). Dirty chunks stay dirty if a write fails.
 */
export class WorldSaver {
  private running: Promise<boolean> | null = null;
  private queued: Promise<boolean> | null = null;

  constructor(
    private readonly store: WorldStore,
    private readonly world: EditSource,
    private readonly meta: () => WorldMeta,
  ) {}

  /** Resolves to true once the write has completed. */
  save(): Promise<boolean> {
    if (!this.running) return this.start();
    this.queued ??= this.running.then(() => {
      this.queued = null;
      return this.start();
    });
    return this.queued;
  }

  private start(): Promise<boolean> {
    const keys = this.world.takeDirtyEdits();
    const chunks = keys.map((key) => chunkRecord(key, this.world.edits.get(key) ?? new Map()));
    const running = this.store.write(metaRecord(this.meta()), chunks).then((ok) => {
      if (!ok) this.world.restoreDirtyEdits(keys);
      this.running = null;
      return ok;
    });
    this.running = running;
    return running;
  }
}
