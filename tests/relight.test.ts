import { describe, expect, it } from 'vitest';
import type { ChunkMeshData, MeshData } from '../src/render/mesher';
import { BlockId } from '../src/world/blocks';
import { ChunkManager, type MeshSink } from '../src/world/chunkManager';
import { LIGHT_CURVE } from '../src/world/light';
import { World } from '../src/world/world';
import { FakeGenerator } from './support/fakeGenerator';

class RecordingSink implements MeshSink {
  sets: string[] = [];
  meshes = new Map<string, ChunkMeshData>();
  set(cx: number, cy: number, cz: number, data: ChunkMeshData): void {
    this.sets.push(`${cx},${cy},${cz}`);
    this.meshes.set(`${cx},${cy},${cz}`, data);
  }
  remove(): void {}
}

/** Mean sky light (0..1, LIGHT_CURVE applied) of the quad whose 4 corners all match, or null. Corners differ with smooth lighting. */
function quadSky(m: MeshData, match: (x: number, y: number, z: number) => boolean): number | null {
  for (let q = 0; q < m.positions.length / 12; q++) {
    const verts = [0, 1, 2, 3].map((k) => q * 4 + k);
    if (verts.every((v) => match(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!))) return verts.reduce((sum, v) => sum + m.light[v * 2]!, 0) / 4;
  }
  return null;
}

describe('relighting after edits', () => {
  it('remeshes the edited chunk at once and its 26 neighbours on the next update', () => {
    const world = new World(3);
    const sink = new RecordingSink();
    const manager = new ChunkManager(world, new FakeGenerator(() => 40), sink, 3);
    for (let i = 0; i < 5; i++) manager.update(8, 8, 8, Infinity, Infinity);
    sink.sets = [];
    const oldTop = world.topAt(8, 8);
    world.setBlock(8, 8, 8, BlockId.GLOWSTONE); // middle of chunk (0,0,0), underground: the top does not move
    manager.onBlockChanged(8, 8, 8, oldTop, world.topAt(8, 8));
    expect(sink.sets).toEqual(['0,0,0']);
    manager.update(8, 8, 8, Infinity, Infinity);
    expect(sink.sets.length).toBe(27);
    expect(new Set(sink.sets).size).toBe(27);
  });
  it('removing a roof lets sunlight spill into the cave in the chunk below', () => {
    // Stone up to y = 20 (roof in chunk cy = 1), with a cave at y 10..15 under x, z 0..15 (chunk cy = 0).
    const generator = new FakeGenerator(() => 20);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 10; y <= 15; y++) generator.overrides.set(`${x},${y},${z}`, BlockId.AIR);
    const world = new World(3);
    const sink = new RecordingSink();
    const manager = new ChunkManager(world, generator, sink, 2);
    for (let i = 0; i < 5; i++) manager.update(8, 30, 8, Infinity, Infinity);
    const floorAt6 = (m: MeshData) => quadSky(m, (x, y, z) => y === 10 && x >= 6 && x <= 7 && z >= 5 && z <= 6);
    expect(floorAt6(sink.meshes.get('0,0,0')!.solid)).toBeCloseTo(LIGHT_CURVE[0]!); // dark cave floor

    for (let y = 20; y >= 16; y--) {
      const oldTop = world.topAt(5, 5);
      expect(world.setBlock(5, y, 5, BlockId.AIR)).toBe(true); // dig a shaft through the roof
      manager.onBlockChanged(5, y, 5, oldTop, world.topAt(5, 5));
    }
    expect(world.topAt(5, 5)).toBe(9); // the cave floor
    for (let i = 0; i < 3; i++) manager.update(8, 30, 8, Infinity, Infinity);
    const floor = sink.meshes.get('0,0,0')!.solid;
    // Smooth lighting (T-F8) blends each corner with its neighbours: under the shaft is brightest, the side close behind.
    const underShaft = quadSky(floor, (x, y, z) => y === 10 && x >= 5 && x <= 6 && z >= 5 && z <= 6)!;
    const side = floorAt6(floor)!;
    expect(underShaft).toBeGreaterThan(side);
    expect(underShaft).toBeGreaterThan(LIGHT_CURVE[14]!);
    expect(side).toBeGreaterThan(LIGHT_CURVE[13]!); // 1 block to the side
    expect(side).toBeLessThan(LIGHT_CURVE[15]!);
  });
});
