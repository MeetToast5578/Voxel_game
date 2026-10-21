import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { Chunk } from '../src/world/chunk';
import { BlockId } from '../src/world/blocks';
import { scheduleFallingBlocks } from '../src/world/falling';
import { WorldSaver } from '../src/storage/saver';
import { MemoryWorldStore } from '../src/storage/worldStore';
import { parseMeta, readSave } from '../src/storage/save';
import { startingSlots } from '../src/player/inventory';

function add(world: World, cy = 0) {
  const c = new Chunk(0, cy, 0);
  world.applyEdits(c); world.addChunk(c);
  world.installColumnTops(0, 0, new Int32Array(256).fill(-100));
  return c;
}
function steps(world: World, n: number) { for (let i = 0; i < n; i++) world.tickStep(100); }

describe('durable scheduled updates', () => {
  it('saves a mid-fall delay and resumes exactly after reload, without scan acceleration', async () => {
    const world = new World(1); add(world);
    world.setBlock(5, 0, 5, BlockId.STONE); world.setBlock(5, 5, 5, BlockId.SAND);
    world.scheduleTick(5, 5, 5, 4, 'fall'); steps(world, 1);
    const store = new MemoryWorldStore();
    const saver = new WorldSaver(store, world, () => ({ seed: 1, scheduledTicks: world.snapshotTicks(), gameTick: world.currentTick,
      player: {x: 5, y: 9, z: 5, yaw: 0, pitch: 0, flying: false}, selectedSlot: 0, inventory: startingSlots(), items: [],
      timeOfDay: .3, timeOfYear: 0, gameMode: 'creative', health: 20, hunger: 20, air: 15 }));
    expect(await saver.save()).toBe(true);
    const stored = await store.load(), saved = readSave(stored.meta, stored.chunks)!;
    const restored = new World(saved.meta.seed);
    restored.loadEdits(saved.edits); restored.loadTicks(saved.meta.scheduledTicks!, saved.meta.gameTick);
    const chunk = add(restored); scheduleFallingBlocks(restored, chunk);
    expect(restored.currentTick).toBe(1);
    steps(restored, 2); expect(restored.getBlock(5, 5, 5)).toBe(BlockId.SAND);
    steps(restored, 1); expect(restored.getBlock(5, 4, 5)).toBe(BlockId.SAND);
    steps(world, 3);
    expect([...restored.getChunk(0, 0, 0)!.blocks]).toEqual([...world.getChunk(0, 0, 0)!.blocks]);
    expect(restored.snapshotTicks()).toEqual(world.snapshotTicks());
  });
  it('pauses unloaded work and preserves non-falling rules across unload and save snapshots', () => {
    const world = new World(1); add(world);
    world.scheduleTick(5, 5, 5, 4, 'leaf-decay'); steps(world, 1);
    world.removeChunk(0, 0, 0); steps(world, 100);
    expect(world.snapshotTicks()).toEqual([{ x: 5, y: 5, z: 5, delay: 3, reason: 'leaf-decay' }]);
    const restored = new World(1); restored.loadTicks(world.snapshotTicks(), world.currentTick);
    add(restored); restored.setBlock(5, 5, 5, BlockId.LEAVES);
    steps(restored, 2); expect(restored.getBlock(5, 5, 5)).toBe(BlockId.LEAVES);
    steps(restored, 1); expect(restored.getBlock(5, 5, 5)).toBe(BlockId.AIR);
  });
  it('keeps and coalesces updates addressed to a chunk before it loads', () => {
    const world = new World(1);
    world.scheduleTick(-2, -1, 3, 8, 'flow'); world.scheduleTick(-2, -1, 3, 3, 'flow');
    expect(world.snapshotTicks()).toEqual([{x: -2, y: -1, z: 3, delay: 3, reason: 'flow'}]);
    world.addChunk(new Chunk(-1, -1, 0));
    expect(world.pendingTickCount).toBe(1);
    steps(world, 3); expect(world.snapshotTicks()).toEqual([]);
  });
  it('repairs malformed pending updates without throwing away a usable old save', () => {
    const raw = {version: 3, seed: 1, selectedSlot: 0, player: {x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false},
      scheduledTicks: [null, {x: 0, y: 0, z: 0, delay: -1, reason: 'flow'}, {x: .5, y: 0, z: 0, delay: 1, reason: 'flow'},
        {x: 0, y: 0, z: 0, delay: 1, reason: 'unknown'}, {x: 0, y: 0, z: 0, delay: 2, reason: 'support'}]};
    expect(parseMeta(raw)!.scheduledTicks).toEqual([{x: 0, y: 0, z: 0, delay: 2, reason: 'support'}]);
    expect(parseMeta({...raw, scheduledTicks: undefined})!.scheduledTicks).toEqual([]);
  });
});
