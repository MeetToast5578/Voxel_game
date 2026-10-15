import './style.css';
import { DEFAULT_SEED, INTERIM_SAVE_KEY } from './config';
import { installDebugApi } from './debugApi';
import { Game, type GameSave } from './game';
import { readOptions, type GameOptions } from './options';
import { readSave, SAVE_VERSION } from './storage/save';
import { browserStore } from './storage/store';
import { IndexedDbWorldStore, MemoryWorldStore } from './storage/worldStore';
import { TerrainGenerator } from './world/generator';
import { mapPixels } from './world/debugMap';

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

/** ?map=1: a top-down picture of the terrain around the origin, 512 pixels of 31 m each. Tuning only. */
function showMap(root: HTMLElement, seed: number | null): void {
  const size = 512;
  const stride = 104; // blocks per pixel: about 31 m, so the map spans about 16 km and shows whole continents
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText = 'width:min(100vmin,512px);image-rendering:pixelated;display:block';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  const pixels = mapPixels(new TerrainGenerator(seed ?? DEFAULT_SEED), (-size / 2) * stride, (-size / 2) * stride, size, stride);
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  const label = document.createElement('p');
  label.textContent = `Debug map · seed ${seed ?? DEFAULT_SEED} · 1 pixel = 31 m · blue = sea`;
  label.style.cssText = 'color:#fff;font:14px system-ui;margin:8px';
  root.append(canvas, label);
}

async function main(root: HTMLElement): Promise<void> {
  const options = readOptions(window.location.search);
  if (options.map) return showMap(root, options.seed);
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Loading world…';
  root.append(loading);
  const save = await openSave(options);
  loading.remove();
  const game = new Game(root, options, save);
  installDebugApi(game);
  game.start();
}

void main(container);
