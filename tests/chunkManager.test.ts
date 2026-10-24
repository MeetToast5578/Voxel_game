import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, VERTICAL_RENDER_DISTANCE } from '../src/config';
import type { ChunkMeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { World } from '../src/world/world';
import { FakeGenerator } from './support/fakeGenerator';

class FakeSink implements MeshSink {
  meshes = new Map<string, ChunkMeshData>();
  order: string[] = [];
  set(cx: number, cy: number, cz: number, data: ChunkMeshData): void {
    this.meshes.set(`${cx},${cy},${cz}`, data);
    this.order.push(`${cx},${cy},${cz}`);
  }
  remove(cx: number, cy: number, cz: number): void {
    this.meshes.delete(`${cx},${cy},${cz}`);
  }
}

const V = VERTICAL_RENDER_DISTANCE;

function setup(renderDistance: number, top: (x: number, z: number) => number = () => 0) {
  const world = new World(7);
  const sink = new FakeSink();
  const generator = new FakeGenerator(top);
  const manager = new ChunkManager(world, generator, sink, renderDistance);
  return { world, sink, manager, generator };
}

/** Runs update() with unlimited budgets until nothing changes (tops arrive first, then the bands load). */
function settle(manager: ChunkManager, x: number, y: number, z: number): void {
  for (let i = 0; i < 10; i++) {
    const before = JSON.stringify(manager.stats);
    manager.update(x, y, z, Infinity, Infinity);
    if (JSON.stringify(manager.stats) === before && manager.stats.pendingGen + manager.stats.pendingMesh === 0) return;
  }
}

/** Columns within a circle of `radius` chunks. */
const circle = (radius: number) => {
  let n = 0;
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dz * dz <= radius * radius) n++;
  return n;
};

describe('ChunkManager', () => {
  it('meshes the near cylinder: the render distance circle, VERTICAL_RENDER_DISTANCE chunks up and down', () => {
    const { world, sink, manager } = setup(2);
    settle(manager, 8, 8, 8);
    // Flat tops at y = 0: the surface band (cy -1..0) lies inside the cylinder.
    expect(sink.meshes.size).toBe(circle(2) * (2 * V + 1));
    expect(sink.meshes.has('2,0,0')).toBe(true);
    expect(sink.meshes.has('2,0,1')).toBe(false);
    expect(sink.meshes.has(`0,${V},0`)).toBe(true);
    expect(sink.meshes.has(`0,${V + 1},0`)).toBe(false);
    // Generated: the mesh set grown by 1 chunk in every direction.
    expect(world.hasChunk(3, 0, 0)).toBe(true);
    expect(world.hasChunk(4, 0, 0)).toBe(false);
    expect(world.hasChunk(0, V + 1, 0)).toBe(true);
    expect(world.hasChunk(0, V + 2, 0)).toBe(false);
    expect(manager.isAreaMeshed(8, 8, 8, 1)).toBe(true);
    expect(manager.stats).toMatchObject({ meshed: circle(2) * (2 * V + 1), pendingGen: 0, pendingMesh: 0 });
  });
  it('renders saved structures in sparse vertical bands without losing ground or filling empty gaps', () => {
    const { world, manager, sink } = setup(2);
    world.loadEdits(new Map<string, Map<number, number>>([
      ['0,20,0', new Map(Array.from({ length: CHUNK_SIZE ** 2 }, (_, i) => [i, BlockId.BRICK]))],
      ['0,250,0', new Map([[0, BlockId.GLASS]])],
      ['0,3000,0', new Map([[0, BlockId.AIR]])],
    ]));
    settle(manager, 8, 8, 8);
    for (const cy of [-1, 0, 20, 250]) expect(manager.isMeshed(0, cy, 0)).toBe(true);
    expect(world.getBlock(0, 320, 0)).toBe(BlockId.BRICK);
    expect(world.getBlock(0, 4000, 0)).toBe(BlockId.GLASS);
    expect(sink.meshes.has('0,250,0')).toBe(true);
    for (const cy of [10, 100, 3000]) expect(world.hasChunk(0, cy, 0), `empty gap cy=${cy}`).toBe(false);
    // Vertical movement must not evict an active edited band or its mesh neighbours.
    settle(manager, 8, -640, 8);
    for (const cy of [-1, 0, 20, 250]) expect(manager.isMeshed(0, cy, 0)).toBe(true);
    expect(world.hasChunk(1, 251, 1)).toBe(true);
    settle(manager, 640, 8, 8);
    expect(world.hasChunk(0, 250, 0)).toBe(false);
    settle(manager, 8, 8, 8);
    expect(world.getBlock(0, 4000, 0)).toBe(BlockId.GLASS);
    expect(manager.isMeshed(0, 250, 0)).toBe(true);
  });

  it('adds a new glass edit band even when lighting tops do not change', () => {
    const { world, manager } = setup(2);
    settle(manager, 8, 1600, 8);
    expect(world.setBlock(0, 1600, 0, BlockId.GLASS)).toBe(true);
    manager.onBlockChanged(0, 1600, 0, 0, 0);
    settle(manager, 8, 8, 8);
    expect(manager.isMeshed(0, 100, 0)).toBe(true);
    expect(world.getBlock(0, 1600, 0)).toBe(BlockId.GLASS);
  });

  it('makes progress every frame even with a zero time budget', () => {
    const { sink, manager } = setup(2);
    let frames = 0;
    while (sink.meshes.size < circle(2) * (2 * V + 1) && frames < 5000) {
      manager.update(8, 8, 8, 0, 0);
      frames++;
    }
    expect(sink.meshes.size).toBe(circle(2) * (2 * V + 1));
  });
  it('unloads chunks that are far away after the player moves', () => {
    const { world, sink, manager } = setup(2);
    settle(manager, 8, 8, 8);
    settle(manager, 16 * 20, 8, 8);
    expect(sink.meshes.has('0,0,0')).toBe(false);
    expect(world.hasChunk(0, 0, 0)).toBe(false);
    expect(world.getColumnTops(0, 0)).toBeUndefined();
    expect(sink.meshes.has('20,0,0')).toBe(true);
  });
  it('remeshes the chunks a changed corner block faces at once, the rest soon after, and keeps edits after unloading', () => {
    const { world, sink, manager } = setup(2);
    settle(manager, 8, 8, 8);
    sink.order = [];
    const oldTop = world.topAt(15, 15);
    world.setBlock(-1, -1, -1, BlockId.BRICK); // corner of chunk (-1, -1, -1), below the top
    manager.onBlockChanged(-1, -1, -1, oldTop, world.topAt(-1, -1));
    // T-J13: the block's own chunk and the three it faces are remeshed in the same call; edge and corner chunks wait.
    expect(new Set(sink.order)).toEqual(new Set(['-1,-1,-1', '0,-1,-1', '-1,0,-1', '-1,-1,0']));
    settle(manager, 8, 8, 8); // with the chunks whose light or shading the change touches
    expect(sink.order).toEqual(expect.arrayContaining(['0,0,-1', '0,-1,0', '-1,0,0', '0,0,0']));
    settle(manager, 16 * 20, 8, 8);
    settle(manager, 8, 8, 8);
    expect(world.getBlock(-1, -1, -1)).toBe(BlockId.BRICK);
  });
  it('handles negative coordinates', () => {
    const { sink, manager } = setup(1);
    settle(manager, -0.5, -0.5, -0.5);
    expect(sink.meshes.has('-1,-1,-1')).toBe(true);
    expect(manager.isAreaMeshed(-0.5, -0.5, -0.5, 0)).toBe(true);
  });

  it('meshes the surface band of a column whose tops are far above the player', () => {
    const R = 4;
    // Column (3, 0), at horizontal distance R - 1, has tops between y 200 and 230; the rest is flat at y = 0.
    const { manager } = setup(R, (x, z) => (Math.floor(x / 16) === 3 && Math.floor(z / 16) === 0 ? 200 + ((x + z) % 31) : 0));
    settle(manager, 8, 8, 8);
    for (let cy = 11; cy <= 14; cy++) {
      expect(manager.wantsMesh(3, cy, 0)).toBe(true);
      expect(manager.isMeshed(3, cy, 0)).toBe(true);
    }
    for (let cy = 6; cy <= 9; cy++) expect(manager.wantsMesh(3, cy, 0)).toBe(false);
    expect(manager.wantsMesh(3, 15, 0)).toBe(false);
  });
  it('meshes the near cylinder deep underground and the surface of every column within R', () => {
    const R = 2;
    const { manager } = setup(R);
    const y = -20 * CHUNK_SIZE + 8;
    settle(manager, 8, y, 8);
    for (let cy = -24; cy <= -16; cy++) expect(manager.isMeshed(0, cy, 0)).toBe(true);
    expect(manager.isMeshed(0, -25, 0)).toBe(false);
    for (const [cx, cz] of [[0, 0], [2, 0], [-1, 1], [0, -2]] as const) {
      expect(manager.isMeshed(cx, -1, cz)).toBe(true);
      expect(manager.isMeshed(cx, 0, cz)).toBe(true);
      expect(manager.isMeshed(cx, -5, cz)).toBe(false); // between the surface and the cylinder
    }
  });
  it('meshes nearest first: the player chunk, then by non-decreasing distance from the eye', () => {
    const { sink, manager } = setup(2);
    const eye = { x: 8, y: 8, z: 8 };
    settle(manager, eye.x, eye.y, eye.z);
    expect(sink.order[0]).toBe('0,0,0');
    const dist = (key: string) => {
      const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number];
      return ((cx + 0.5) * 16 - eye.x) ** 2 + ((cy + 0.5) * 16 - eye.y) ** 2 + ((cz + 0.5) * 16 - eye.z) ** 2;
    };
    for (let i = 1; i < sink.order.length; i++) expect(dist(sink.order[i]!)).toBeGreaterThanOrEqual(dist(sink.order[i - 1]!));
  });
  it('drops old near-cylinder meshes after moving 40 chunks down, but keeps the surface band', () => {
    const { manager, sink } = setup(2, () => 100); // tops at y = 100: band cy 5..6
    settle(manager, 8, 8, 8);
    expect(manager.isMeshed(0, 0, 0)).toBe(true);
    expect(manager.isMeshed(0, 6, 0)).toBe(true);
    settle(manager, 8, -40 * CHUNK_SIZE + 8, 8);
    expect(manager.isMeshed(0, 0, 0)).toBe(false);
    expect(sink.meshes.has('0,0,0')).toBe(false);
    expect(manager.isMeshed(0, 5, 0)).toBe(true);
    expect(manager.isMeshed(0, 6, 0)).toBe(true);
    expect(manager.isMeshed(1, 6, 1)).toBe(true);
    expect(manager.isMeshed(0, -40, 0)).toBe(true);
  });
  it('marks chunks dirty below and above a column top that moved', () => {
    const { world, sink, manager } = setup(2, () => 40); // tops at y = 40 (cy 2)
    settle(manager, 8, 40, 8);
    sink.order = [];
    const oldTop = world.topAt(8, 8)!;
    expect(world.setBlock(8, 60, 8, BlockId.STONE)).toBe(true); // 20 above the top, chunk (0, 3, 0)
    manager.onBlockChanged(8, 60, 8, oldTop, world.topAt(8, 8));
    settle(manager, 8, 40, 8);
    const remeshed = new Set(sink.order);
    // [40 - 15, 60 + 1] = [25, 61] touches cy 1..3 in the 3x3 columns around (0, 0).
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) for (let cy = 1; cy <= 3; cy++) expect(remeshed.has(`${dx},${cy},${dz}`)).toBe(true);
    expect(remeshed.has('0,0,0')).toBe(false);
    expect(remeshed.has('0,-1,0')).toBe(false);
    expect(remeshed.has('2,2,0')).toBe(false); // outside the 3x3 columns
  });
});

it('meshes the ground below a canopy covering every lighting-top cell', () => {
  class CanopyGenerator extends FakeGenerator {
    columnGroundMin() { return 0; }
    override columnTops() { return new Int32Array(256).fill(64); }
  }
  const world = new World(7), sink = new FakeSink();
  const manager = new ChunkManager(world, new CanopyGenerator(() => 0), sink, 2);
  for (let i = 0; i < 8; i++) manager.update(8, 200, 8, Infinity, Infinity);
  expect(manager.isMeshed(0, 0, 0)).toBe(true);
  expect(manager.isMeshed(0, 4, 0)).toBe(true);
});

it('removes orphan perimeter meshes after moving while retaining generated chunk hysteresis', () => {
  const world = new World(7), sink = new FakeSink();
  const manager = new ChunkManager(world, new FakeGenerator(() => 0), sink, 2);
  for (let i = 0; i < 8; i++) manager.update(8, 8, 8, Infinity, Infinity);
  expect(manager.isMeshed(-2, 0, 0)).toBe(true);
  manager.update(24, 8, 8, Infinity, Infinity);
  expect(manager.isMeshed(-2, 0, 0)).toBe(false);
  expect(world.hasChunk(-2, 0, 0)).toBe(true);
});
