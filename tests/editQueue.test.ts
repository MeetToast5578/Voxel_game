import { describe, expect, it } from 'vitest';
import { EDIT_CELLS_PER_STEP, UNDO_LIMIT } from '../src/config';
import type { ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { EditQueue } from '../src/world/editQueue';
import { World } from '../src/world/world';
import { FakeGenerator } from './support/fakeGenerator';

class FakeSink implements MeshSink {
  set(_cx: number, _cy: number, _cz: number, _data: ChunkMeshData): void {}
  remove(): void {}
}

/** Loaded terrain with stone up to y = 0 around the origin. Only stone is breakable in these tests. */
function setup() {
  const world = new World(7);
  const manager = new ChunkManager(world, new FakeGenerator(() => 0), new FakeSink(), 2);
  for (let i = 0; i < 10; i++) manager.update(8, 8, 8, Infinity, Infinity);
  const queue = new EditQueue(world, manager, (id) => id === BlockId.STONE);
  return { world, queue };
}

/** Cells that fill: set to id, replacing only air and water. */
const fill = (cells: { x: number; y: number; z: number }[], id: number) => cells.map((c) => ({ ...c, id, clear: false }));
/** Cells that clear: remove breakable blocks. */
const clear = (cells: { x: number; y: number; z: number }[]) => cells.map((c) => ({ ...c, id: BlockId.AIR, clear: true }));

/** Every cell of a box of cells with corner (x0, y0, z0) and size sx, sy, sz. */
function cellsIn(x0: number, y0: number, z0: number, sx: number, sy: number, sz: number) {
  const out: { x: number; y: number; z: number }[] = [];
  for (let y = y0; y < y0 + sy; y++) for (let z = z0; z < z0 + sz; z++) for (let x = x0; x < x0 + sx; x++) out.push({ x, y, z });
  return out;
}

describe('EditQueue', () => {
  it('adds into air only, and undo puts the air back', () => {
    const { world, queue } = setup();
    const cells = cellsIn(14, 0, 14, 3, 3, 3); // y = 0 is stone: its 9 bottom cells stay as they are
    expect(queue.start(fill(cells, BlockId.BRICK))).toBe(true);
    queue.step();
    expect(queue.busy).toBe(false);
    expect(world.getBlock(15, 1, 15)).toBe(BlockId.BRICK);
    expect(world.getBlock(15, 0, 15)).toBe(BlockId.STONE);
    expect(queue.undoCount).toBe(1);

    expect(queue.undo()).toBe(true);
    queue.step();
    expect(world.getBlock(15, 1, 15)).toBe(BlockId.AIR);
    expect(world.getBlock(15, 0, 15)).toBe(BlockId.STONE);
    expect(queue.undoCount).toBe(0);
  });

  it('removes breakable blocks only', () => {
    const { world, queue } = setup();
    expect(queue.start(clear(cellsIn(14, -1, 14, 3, 2, 3)))).toBe(true);
    queue.step();
    expect(world.getBlock(15, 0, 15)).toBe(BlockId.AIR);
    expect(world.getBlock(15, -1, 15)).toBe(BlockId.AIR);
    expect(queue.undoCount).toBe(1);
  });

  it('spreads a large action over several steps, EDIT_CELLS_PER_STEP cells at a time', () => {
    const { world, queue } = setup();
    const cells = cellsIn(10, 2, 10, 17, 17, 17); // 4913 cells, more than one step
    expect(cells.length).toBeGreaterThan(EDIT_CELLS_PER_STEP);
    queue.start(fill(cells, BlockId.BRICK));
    queue.step();
    expect(queue.busy).toBe(true);
    let placed = 0;
    for (const c of cells) if (world.getBlock(c.x, c.y, c.z) === BlockId.BRICK) placed++;
    expect(placed).toBe(EDIT_CELLS_PER_STEP);
    queue.step();
    expect(queue.busy).toBe(false);
    for (const c of cells) expect(world.getBlock(c.x, c.y, c.z)).toBe(BlockId.BRICK);
  });

  it('refuses an action with a cell outside loaded terrain, and one already running', () => {
    const { queue } = setup();
    expect(queue.start(fill([{ x: 100_000, y: 0, z: 0 }], BlockId.BRICK))).toBe(false);
    expect(queue.start(fill(cellsIn(14, 2, 14, 2, 2, 2), BlockId.BRICK))).toBe(true);
    expect(queue.start(clear(cellsIn(14, 0, 14, 1, 1, 1)))).toBe(false);
  });

  it('undo leaves alone any cell that changed since the action', () => {
    const { world, queue } = setup();
    queue.start(fill(cellsIn(14, 2, 14, 3, 3, 3), BlockId.BRICK));
    queue.step();
    world.setBlock(15, 2, 15, BlockId.GLASS);
    queue.undo();
    queue.step();
    expect(world.getBlock(15, 2, 15)).toBe(BlockId.GLASS);
    expect(world.getBlock(14, 2, 14)).toBe(BlockId.AIR);
  });

  it('fills and clears in one action, which flatten needs', () => {
    const { world, queue } = setup();
    const edits = [...fill([{ x: 15, y: 1, z: 15 }], BlockId.BRICK), ...clear([{ x: 16, y: 0, z: 15 }])];
    expect(queue.start(edits)).toBe(true);
    queue.step();
    expect(world.getBlock(15, 1, 15)).toBe(BlockId.BRICK);
    expect(world.getBlock(16, 0, 15)).toBe(BlockId.AIR);
    queue.undo();
    queue.step();
    expect(world.getBlock(15, 1, 15)).toBe(BlockId.AIR);
    expect(world.getBlock(16, 0, 15)).toBe(BlockId.STONE);
  });

  it('keeps only the last UNDO_LIMIT actions', () => {
    const { queue } = setup();
    for (let i = 0; i < UNDO_LIMIT + 3; i++) {
      queue.start(fill([{ x: 12 + i, y: 3, z: 12 }], BlockId.BRICK));
      queue.step();
    }
    expect(queue.undoCount).toBe(UNDO_LIMIT);
  });
});

it('redo reverses only the cells actually undone, preserving later changes', () => {
  const { world, queue } = setup();
  queue.start(fill([{x:1,y:1,z:1},{x:2,y:1,z:1}],BlockId.STONE)); queue.step();
  world.setBlock(2,1,1,BlockId.DIRT);
  expect(queue.undo()).toBe(true); queue.step();
  expect(queue.redoCount).toBe(1);
  expect(queue.redo()).toBe(true); queue.step();
  expect(world.getBlock(1,1,1)).toBe(BlockId.STONE);
  expect(world.getBlock(2,1,1)).toBe(BlockId.DIRT);
  expect(queue.undo()).toBe(true); queue.step();
  expect(world.getBlock(1,1,1)).toBe(BlockId.AIR);
  expect(queue.undo()).toBe(false);
});

it('refuses unloaded or busy redo without losing history and invalidates redo on a changed edit', () => {
  const { world, queue } = setup();
  queue.start(fill([{x:1,y:1,z:1}],BlockId.STONE)); queue.step();
  queue.undo(); queue.step();
  world.removeChunk(0,0,0);
  expect(queue.redo()).toBe(false); expect(queue.redoCount).toBe(1);
  // A fresh loaded action in another chunk replaces the redo branch only after changing cells.
  expect(queue.start(fill([{x:17,y:1,z:1}],BlockId.STONE))).toBe(true);
  expect(queue.redo()).toBe(false); queue.step();
  expect(queue.redoCount).toBe(0);
});

it('redo observes edits made after undo and uses the same cell budget', () => {
  const { world, queue } = setup();
  const cells = Array.from({length: EDIT_CELLS_PER_STEP + 1}, (_,i) => ({x:i%32,y:1+Math.floor(i/1024),z:Math.floor(i/32)%32}));
  expect(queue.start(fill(cells,BlockId.STONE))).toBe(true);
  while(queue.busy) queue.step();
  queue.undo(); while(queue.busy) queue.step();
  world.setBlock(0,1,0,BlockId.DIRT);
  queue.redo(); queue.step(); expect(queue.busy).toBe(true);
  while(queue.busy) queue.step();
  expect(world.getBlock(0,1,0)).toBe(BlockId.DIRT);
});

it('pastes copied states without overwriting existing blocks, then undo restores replaced water',async()=>{
  const {BuildClipboard}=await import('../src/player/clipboard');
  const {slabState}=await import('../src/world/blocks');
  const {world,queue}=setup(),clipboard=new BuildClipboard();
  const upper=slabState(BlockId.STONE,true);
  world.setBlock(1,1,1,BlockId.STONE);world.setBlock(2,1,1,upper);
  clipboard.select({x:1,y:1,z:1},world);clipboard.select({x:2,y:1,z:1},world);
  world.setBlock(2,1,1,BlockId.AIR);world.setBlock(5,1,1,BlockId.DIRT);world.setBlock(6,1,1,BlockId.WATER);
  expect(queue.start(clipboard.paste({x:5,y:1,z:1}))).toBe(true);queue.step();
  expect(world.getBlock(5,1,1)).toBe(BlockId.DIRT);expect(world.getBlock(6,1,1)).toBe(upper);
  queue.undo();queue.step();expect(world.getBlock(6,1,1)).toBe(BlockId.WATER);
});
