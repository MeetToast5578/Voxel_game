import './style.css';
import { INTERIM_SAVE_KEY } from './config';
import { installDebugApi } from './debugApi';
import { Game, type GameSave } from './game';
import { readOptions, type GameOptions } from './options';
import { readSave, SAVE_VERSION } from './storage/save';
import { browserStore } from './storage/store';
import { IndexedDbWorldStore, MemoryWorldStore } from './storage/worldStore';

const container = document.getElementById('app');
if (!container) throw new Error('#app element missing from index.html');

/**
 * Opens and reads the world save. ?nosave=1 and ?seed= use a throw-away memory store. When IndexedDB is unavailable
 * (or reading it fails), the game runs on a memory store too, so an existing save is never overwritten.
 */
async function openSave(options: GameOptions): Promise<GameSave> {
  const persistent = !options.nosave && options.seed === null;
  if (!persistent) return { store: new MemoryWorldStore(), loaded: null, persistent: false, unavailable: false };
  browserStore().removeItem(INTERIM_SAVE_KEY); // the localStorage save of development builds; v1 is left alone
  const store = await IndexedDbWorldStore.open();
  const stored = store ? await store.load() : null;
  if (!store || !stored?.ok) return { store: new MemoryWorldStore(), loaded: null, persistent: false, unavailable: true };
  // A save of another version has block coordinates at another size, so its chunk records must go too.
  if (stored.meta && (stored.meta as { version?: unknown }).version !== SAVE_VERSION) await store.clear();
  const loaded = readSave(stored.meta, stored.chunks);
  if (loaded && loaded.dropped > 0) console.warn(`save: ignored ${loaded.dropped} invalid block edits`);
  return { store, loaded, persistent: true, unavailable: false };
}

async function main(root: HTMLElement): Promise<void> {
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Loading world…';
  root.append(loading);
  const options = readOptions(window.location.search);
  const save = await openSave(options);
  loading.remove();
  const game = new Game(root, options, save);
  installDebugApi(game);
  game.start();
}

void main(container);
