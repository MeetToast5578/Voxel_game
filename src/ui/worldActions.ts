import { exportWorld, importWorld } from '../storage/archive';
import type { WorldStore } from '../storage/store';
import type { NewWorld } from './app';

/**
 * Opening, creating, deleting, exporting and importing saved worlds, shared by the title screen and the pause menu.
 * A world is opened by loading the page with its name in the URL; `beforeLeave` runs first (to save the current one).
 */
export function worldActions(store: WorldStore, opts: { beforeLeave(): Promise<void>; changed(): void }) {
  return {
    async openWorld(name: string, create?: NewWorld): Promise<void> {
      await opts.beforeLeave();
      const q = new URLSearchParams({ world: name });
      if (create) Object.entries({ new: '1', seed: String(create.seed), mode: create.mode, difficulty: create.difficulty }).forEach(([k, v]) => q.set(k, v));
      location.search = q.toString();
    },
    async deleteWorld(name: string): Promise<void> {
      await store.deleteWorld(name);
      opts.changed();
    },
    async exportWorld(name: string): Promise<void> {
      const text = await exportWorld(store, name);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `${name}.world.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    async importWorld(file: File): Promise<void> {
      try {
        const name = await importWorld(store, await file.text());
        alert(`Imported world '${name}'.`);
      } catch (err) {
        alert(`Could not import: ${(err as Error).message}`);
      }
      opts.changed();
    },
  };
}
