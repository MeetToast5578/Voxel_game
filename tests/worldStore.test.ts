import { describe, expect, it } from 'vitest';
import { startingSlots } from '../src/player/inventory';
import { chunkRecord, metaRecord, readSave, type WorldMeta } from '../src/storage/save';
import { WorldSaver } from '../src/storage/saver';
import { MemoryWorldStore, type WorldStore } from '../src/storage/worldStore';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';

const meta = (seed: number): WorldMeta => ({
  seed,
  selectedSlot: 0,
  player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false },
  inventory: startingSlots(),
  items: [],
  timeOfDay: 0.5,
  timeOfYear: 0.5,
  gameMode: 'creative',
  health: 20,
  hunger: 20,
  air: 15,
});

/** A world with chunk (0, 0, 0) loaded and its column's tops installed, so blocks can be edited. */
function editableWorld(): World {
  const w = new World(1);
  w.addChunk(new Chunk(0, 0, 0));
  w.addChunk(new Chunk(1, 0, 0));
  w.installColumnTops(0, 0, new Int32Array(256).fill(-100));
  w.installColumnTops(1, 0, new Int32Array(256).fill(-100));
  return w;
}

describe('MemoryWorldStore', () => {
  it('keeps the latest meta and every chunk record, replacing changed chunks', async () => {
    const store = new MemoryWorldStore();
    const a = chunkRecord('0,0,0', new Map([[1, BlockId.STONE]]));
    const b = chunkRecord('1,0,0', new Map([[2, BlockId.DIRT]]));
    expect(await store.write(metaRecord(meta(1)), [a, b])).toBe(true);
    const a2 = chunkRecord('0,0,0', new Map([[1, BlockId.STONE], [3, BlockId.BRICK]]));
    expect(await store.write(metaRecord(meta(2)), [a2])).toBe(true);
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    const save = readSave(loaded.meta, loaded.chunks)!;
    expect(save.meta.seed).toBe(2);
    expect([...save.edits.get('0,0,0')!]).toEqual([[1, BlockId.STONE], [3, BlockId.BRICK]]);
    expect([...save.edits.get('1,0,0')!]).toEqual([[2, BlockId.DIRT]]);
  });
  it('is empty after clearing', async () => {
    const store = new MemoryWorldStore();
    await store.write(metaRecord(meta(1)), [chunkRecord('0,0,0', new Map([[1, BlockId.STONE]]))]);
    expect(await store.clear()).toBe(true);
    const loaded = await store.load();
    expect(loaded.meta).toBeNull();
    expect(loaded.chunks).toEqual([]);
  });
});

describe('WorldSaver', () => {
  it('writes only the chunks edited since the last save', async () => {
    const store = new MemoryWorldStore();
    const world = editableWorld();
    const saver = new WorldSaver(store, world, () => meta(1));
    world.setBlock(1, 1, 1, BlockId.BRICK);
    world.setBlock(17, 1, 1, BlockId.BRICK);
    expect(await saver.save()).toBe(true);
    world.setBlock(2, 1, 1, BlockId.GLASS);
    expect(world.takeDirtyEdits()).toEqual(['0,0,0']); // exactly one chunk is dirty
    world.restoreDirtyEdits(['0,0,0']);
    const writes: string[][] = [];
    const spy: WorldStore = { ...store, load: () => store.load(), clear: () => store.clear(), write: (m, c) => (writes.push(c.map((r) => r.key)), store.write(m, c)) };
    expect(await new WorldSaver(spy, world, () => meta(1)).save()).toBe(true);
    expect(writes).toEqual([['0,0,0']]);
  });
  it('keeps chunks dirty when the write fails', async () => {
    const store = new MemoryWorldStore();
    const world = editableWorld();
    const saver = new WorldSaver(store, world, () => meta(1));
    world.setBlock(1, 1, 1, BlockId.BRICK);
    store.failWrites = true;
    expect(await saver.save()).toBe(false);
    store.failWrites = false;
    expect(await saver.save()).toBe(true);
    const save = readSave((await store.load()).meta, (await store.load()).chunks)!;
    expect(save.edits.get('0,0,0')!.get(1 + 16 + 256)).toBe(BlockId.BRICK);
  });
  it('never runs two writes at once; requests during a write share one follow-up write', async () => {
    const store = new MemoryWorldStore();
    let active = 0;
    let maxActive = 0;
    let writes = 0;
    const slow: WorldStore = {
      load: () => store.load(),
      clear: () => store.clear(),
      write: async (m, c) => {
        active++;
        writes++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return store.write(m, c);
      },
    };
    const saver = new WorldSaver(slow, editableWorld(), () => meta(1));
    const results = await Promise.all([saver.save(), saver.save(), saver.save(), saver.save()]);
    expect(results).toEqual([true, true, true, true]);
    expect(maxActive).toBe(1);
    expect(writes).toBe(2);
  });
});
