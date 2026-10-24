import { describe, expect, it } from 'vitest';
import type { ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { World, type CellWrite } from '../src/world/world';
import { FakeGenerator } from './support/fakeGenerator';

class FakeSink implements MeshSink {
  order: string[] = [];
  set(cx: number, cy: number, cz: number, _data: ChunkMeshData): void {
    this.order.push(`${cx},${cy},${cz}`);
  }
  remove(): void {}
}

/** Loaded world with flat stone up to y = 0 around the origin, meshed where the player stands. */
function setup() {
  const world = new World(7);
  const sink = new FakeSink();
  const manager = new ChunkManager(world, new FakeGenerator(() => 0), sink, 2);
  for (let i = 0; i < 10; i++) manager.update(8, 8, 8, Infinity, Infinity);
  sink.order = [];
  return { world, sink, manager };
}

/** A small deterministic set of writes that crosses chunk borders, mixing solid, glass, air and water. */
function writesAround(x0: number, y0: number, z0: number, n: number): CellWrite[] {
  const ids = [BlockId.AIR, BlockId.GLASS, BlockId.STONE, BlockId.WATER, BlockId.BRICK];
  const out: CellWrite[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i * 7) % 9) - 4;
    const y = y0 + ((i * 5) % 7) - 3;
    const z = z0 + ((i * 11) % 9) - 4;
    out.push({ x, y, z, id: ids[(i * 3) % ids.length]! });
  }
  return out;
}

describe('World.setBlocks', () => {
  it('is all or nothing: a cell outside the loaded chunks changes nothing', () => {
    const { world } = setup();
    const before = world.getBlock(15, 0, 15);
    const effect = world.setBlocks([
      { x: 15, y: 0, z: 15, id: BlockId.BRICK },
      { x: 10_000, y: 0, z: 0, id: BlockId.BRICK },
    ]);
    expect(effect).toBeNull();
    expect(world.getBlock(15, 0, 15)).toBe(before);
    expect(world.edits.size).toBe(0);
  });

  it('records only the cells whose value changes', () => {
    const { world } = setup();
    const first = world.setBlocks([{ x: 2, y: 3, z: 2, id: BlockId.BRICK }]);
    expect(first?.chunks).toHaveLength(1);
    const again = world.setBlocks([{ x: 2, y: 3, z: 2, id: BlockId.BRICK }]);
    expect(again).toEqual({ chunks: [], tops: [] });
  });

  it('gives the same blocks and column tops as the same writes applied one at a time', () => {
    const writes = writesAround(15, 1, 15, 300);
    const a = setup().world;
    const b = setup().world;
    for (const w of writes) a.setBlock(w.x, w.y, w.z, w.id);
    expect(b.setBlocks(writes)).not.toBeNull();
    for (let x = 8; x <= 22; x++)
      for (let z = 8; z <= 22; z++) {
        expect(b.topAt(x, z)).toBe(a.topAt(x, z));
        for (let y = -2; y <= 4; y++) expect(b.getBlock(x, y, z)).toBe(a.getBlock(x, y, z));
      }
  });

  it('reports each touched chunk once, and each column whose top moved', () => {
    const { world } = setup();
    const effect = world.setBlocks([
      { x: 15, y: 2, z: 15, id: BlockId.BRICK },
      { x: 16, y: 2, z: 15, id: BlockId.BRICK },
      { x: 17, y: 2, z: 15, id: BlockId.BRICK },
    ]);
    expect(effect).not.toBeNull();
    const keys = effect!.chunks.map((c) => `${c.cx},${c.cy},${c.cz}`);
    expect(new Set(keys).size).toBe(keys.length);
    // x = 15 is in column chunk 0, x = 16 and 17 are in chunk 1. The tops went from 0 to 2 in both.
    expect(effect!.tops).toHaveLength(2);
    expect(effect!.tops).toEqual(expect.arrayContaining([{ cx: 0, cz: 0, lo: 0, hi: 2 }, { cx: 1, cz: 0, lo: 0, hi: 2 }]));
  });
});

describe('ChunkManager.onBlocksChanged', () => {
  it('remeshes nothing synchronously, then rebuilds each touched chunk exactly once', () => {
    const { world, sink, manager } = setup();
    const effect = world.setBlocks(writesAround(15, 1, 15, 200));
    expect(effect).not.toBeNull();
    manager.onBlocksChanged(effect!);
    expect(sink.order).toEqual([]);
    for (let i = 0; i < 200 && manager.stats.pendingMesh > 0; i++) manager.update(8, 8, 8, Infinity, Infinity);
    expect(manager.stats.pendingMesh).toBe(0);
    const touched = new Set(effect!.chunks.map((c) => `${c.cx},${c.cy},${c.cz}`));
    for (const key of touched) expect(sink.order).toContain(key);
    expect(new Set(sink.order).size).toBe(sink.order.length);
  });
});

describe('tick-driven mesh invalidation', () => {
  it('remeshes falling blocks and keeps save dirtiness independent', () => {
    const { world, manager, sink } = setup();
    world.setBlock(8, 4, 8, BlockId.SAND);
    world.takeBlockChanges(); // Isolate the fall's changes from fixture construction.
    world.scheduleTick(8, 4, 8, world.currentTick + 1, 'fall');
    // Ticks run under a wall-clock budget (TICK_BUDGET_MS); on a loaded CI runner the first call can spend it before
    // reaching this chunk, and the due tick then runs on the next call. A few calls still prove one step of falling.
    for (let i = 0; i < 5 && world.getBlock(8, 3, 8) !== BlockId.SAND; i++) manager.tick();
    expect(world.getBlock(8, 3, 8)).toBe(BlockId.SAND);
    manager.update(8, 8, 8, Infinity, Infinity);
    expect(sink.order).toContain('0,0,0');
    expect(world.takeDirtyEdits()).toContain('0,0,0');
    expect(world.takeBlockChanges().chunks).toHaveLength(0);
  });
});
