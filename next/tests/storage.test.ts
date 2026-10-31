import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../config';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { decodeChunk, encodeChunk } from '../storage/chunkCodec';
import { Saver } from '../storage/saver';
import { MemoryStore, RevisionConflict, SAVE_VERSION, parseMeta, type WorldMeta } from '../storage/store';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const meta = (name = 'w'): WorldMeta => ({
  version: SAVE_VERSION, name, seed: 5, created: 1, lastPlayed: 1, revision: 0, dayTime: 0.3,
  player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, flying: false },
});

function cells(chunk: Chunk): Uint16Array {
  const out = new Uint16Array(CHUNK_VOLUME);
  chunk.copyTo(out);
  return out;
}

describe('chunk codec', () => {
  it('round-trips uniform, 8-bit and 16-bit chunks with their light', async () => {
    const uniform = new Chunk(1, 2, 3, S('stone'), 0);
    const mixed = new Chunk(-1, 0, 4);
    mixed.set(5, S('glowstone'));
    mixed.set(100, S('snow', 3));
    mixed.setLight(5, 2, 15);
    const wide = new Chunk(0, 0, 0);
    for (let i = 0; i < 300; i++) wide.set(i, i % BLOCKS.stateCount);
    for (const c of [uniform, mixed, wide]) {
      const back = await decodeChunk(c.cx, c.cy, c.cz, await encodeChunk(c));
      expect(cells(back)).toEqual(cells(c));
      const a = new Uint8Array(CHUNK_VOLUME), b = new Uint8Array(CHUNK_VOLUME);
      c.copyLightTo(a);
      back.copyLightTo(b);
      expect(b).toEqual(a);
      expect(back.modified).toBe(true);
    }
  });

  it('keeps a mostly empty chunk small', async () => {
    const c = new Chunk(0, 0, 0);
    c.set(0, S('stone'));
    expect((await encodeChunk(c)).length).toBeLessThan(200);
  });

  it('rejects corrupt records', async () => {
    const data = await encodeChunk(new Chunk(0, 0, 0, S('stone')));
    await expect(decodeChunk(0, 0, 0, data.slice(0, data.length - 3))).rejects.toThrow();
    await expect(decodeChunk(0, 0, 0, new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe('saver', () => {
  it('saves changed chunks and loads them back, including ones unloaded before the save', async () => {
    const store = new MemoryStore();
    const saver = await Saver.open(store, meta());
    const world = new World();
    const a = new Chunk(0, 0, 0), b = new Chunk(1, 0, 0), untouched = new Chunk(2, 0, 0);
    [a, b, untouched].forEach((c) => world.add(c));
    world.set(1, 1, 1, S('stone'));
    world.set(17, 1, 1, S('glass'));
    // b unloads before the autosave: it is encoded at once and stays readable.
    saver.unload(b, world);
    world.remove(1, 0, 0);
    expect(saver.has(b.key)).toBe(true);
    expect(cells((await saver.load(1, 0, 0, b.key))!)).toEqual(cells(b));
    await saver.save(world, { dayTime: 0.75 });
    expect(saver.has(untouched.key)).toBe(false);
    const reopened = await Saver.open(store, meta());
    expect(reopened.worldMeta.dayTime).toBe(0.75);
    expect(reopened.worldMeta.revision).toBe(1);
    expect((await reopened.load(0, 0, 0, a.key))!.get(1 * 256 + 1 * 16 + 1)).toBe(S('stone'));
    expect((await reopened.load(1, 0, 0, b.key))!.get(1 * 256 + 1 * 16 + 1)).toBe(S('glass'));
    expect(await reopened.load(2, 0, 0, untouched.key)).toBeNull();
  });

  it('only writes chunks that changed since the last save', async () => {
    const store = new MemoryStore();
    const saver = await Saver.open(store, meta());
    const world = new World();
    world.add(new Chunk(0, 0, 0));
    world.set(0, 0, 0, S('stone'));
    await saver.save(world, {});
    const before = await store.getChunk('w', world.chunk(0, 0, 0)!.key);
    let writes = 0;
    const put = store.putChunks.bind(store);
    store.putChunks = async (w, c) => { writes += c.length; return put(w, c); };
    await saver.save(world, {});
    expect(writes).toBe(0);
    world.set(0, 0, 0, S('dirt'));
    await saver.save(world, {});
    expect(writes).toBe(1);
    expect(await store.getChunk('w', world.chunk(0, 0, 0)!.key)).not.toEqual(before);
  });

  it('refuses to overwrite a save made by another session', async () => {
    const store = new MemoryStore();
    const first = await Saver.open(store, meta());
    const second = await Saver.open(store, meta());
    await first.save(new World(), {});
    await expect(second.save(new World(), {})).rejects.toBeInstanceOf(RevisionConflict);
    expect(second.conflict).toBe(true);
  });

  it('falls back to generation for unreadable chunks', async () => {
    const store = new MemoryStore();
    await store.putChunks('w', [[42, new Uint8Array([9, 9, 9])]]);
    const saver = await Saver.open(store, meta());
    expect(saver.has(42)).toBe(true);
    expect(await saver.load(0, 0, 0, 42)).toBeNull();
  });

  it('validates meta records', () => {
    expect(parseMeta(meta())).toEqual(meta());
    expect(parseMeta({ ...meta(), version: 3 })).toBeNull();
    expect(parseMeta({ ...meta(), player: { x: 'a' } })).toBeNull();
    expect(parseMeta(null)).toBeNull();
  });
});

describe('archives and settings', () => {
  it('exports and imports a world under a new name', async () => {
    const { exportWorld, importWorld } = await import('../storage/archive');
    const store = new MemoryStore();
    const saver = await Saver.open(store, meta('home'));
    const world = new World();
    world.add(new Chunk(3, -1, 2));
    world.set(48, -16, 32, S('brick'));
    await saver.save(world, {});
    const text = await exportWorld(store, 'home');
    await expect(importWorld(store, text)).rejects.toThrow(/already exists/);
    expect(await importWorld(store, text, 'copy')).toBe('copy');
    const copy = await Saver.open(store, meta('copy'));
    expect(copy.worldMeta.seed).toBe(5);
    const key = world.chunk(3, -1, 2)!.key;
    expect((await copy.load(3, -1, 2, key))!.get(0)).toBe(S('brick'));
    expect(copy.skyTop(3, 2)).toEqual(await (await Saver.open(store, meta('home'))).skyTop(3, 2));
    await expect(importWorld(store, '{"format":"voxel-world","version":3}')).rejects.toThrow(/version/);
    await expect(importWorld(store, 'nonsense')).rejects.toThrow(/Not a world/);
  });

  it('clamps and defaults settings', async () => {
    const { parseSettings, DEFAULT_SETTINGS } = await import('../storage/settings');
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ viewChunks: 999, fov: 'x', mouseSensitivity: 0.004 })).toEqual({ ...DEFAULT_SETTINGS, viewChunks: 32, mouseSensitivity: 0.004 });
  });
});
