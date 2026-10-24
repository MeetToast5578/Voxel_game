import { describe, expect, it, vi } from 'vitest';
import { CHUNK_VOLUME, RIVER_CURRENT, metersToBlocks } from '../src/config';
import { localIndex } from '../src/core/coords';
import { Game } from '../src/game';
import { buildChunkMesh } from '../src/render/mesher';
import { BlockId, flowingWaterState, isFallingWater } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { TerrainGenerator } from '../src/world/generator';
import { uniformTops } from './support/testWorld';

const SKY = uniformTops(-1000);
const neighbors = () => Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME));

/** The [x, z] flow written on the top face vertices of water at local cell (lx, ly, lz). */
function topFlow(blocks: (n: Uint16Array) => void, river?: (x: number, z: number) => readonly [number, number] | null) {
  const n = neighbors();
  blocks(n[13]!);
  const m = buildChunkMesh(n, SKY, 0, { seed: 1, cx: 0, cz: 0, riverFlow: river }).translucent;
  const flows: [number, number][] = [];
  for (let v = 0; v < m.positions.length / 3; v++) flows.push([m.season[v * 2]!, m.season[v * 2 + 1]!]);
  return flows;
}

describe('river flow and water animation (T-G10, T-G15)', () => {
  it('flowing water carries its direction toward lower water; still pools carry none', () => {
    const flows = topFlow((c) => { c[localIndex(5, 5, 5)] = flowingWaterState(6, false); c[localIndex(6, 5, 5)] = flowingWaterState(4, false); });
    expect(flows.some(([x, z]) => x > 0.9 && Math.abs(z) < 0.1)).toBe(true);
    const pool = topFlow((c) => { for (let x = 3; x < 9; x++) for (let z = 3; z < 9; z++) c[localIndex(x, 5, z)] = BlockId.WATER; });
    expect(pool.every(([x, z]) => x === 0 && z === 0)).toBe(true);
  });

  it('still river water takes the river flow from the region simulation', () => {
    const flows = topFlow((c) => { for (let x = 3; x < 9; x++) for (let z = 3; z < 9; z++) c[localIndex(x, 5, z)] = BlockId.WATER; }, () => [0, -1]);
    expect(flows.every(([x, z]) => x === 0 && z === -1)).toBe(true);
  });

  it('a river source pushes the player downstream', () => {
    const game = Object.create(Game.prototype) as Game;
    Object.assign(game, { world: { getBlock: () => BlockId.WATER }, generator: { sampleColumn: () => ({ isRiver: true, flowX: 1, flowZ: 0 }) } });
    expect(game.currentAt(0, 0, 0)).toEqual({ x: RIVER_CURRENT, y: 0, z: 0 });
    Object.assign(game, { generator: { sampleColumn: vi.fn(() => ({ isRiver: false, flowX: 0, flowZ: 0 })) } });
    expect(game.currentAt(0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('waterfalls (T-G11)', () => {
  it('fill the drop where a river falls between two columns with falling water', () => {
    // Seed 1 has a river that drops from 165 to 162 blocks at (-366, -1296); see the generator.
    const g = new TerrainGenerator(1);
    const [x, z] = [-366, -1296];
    const low = Math.floor(metersToBlocks(g.sampleColumn(x, z).waterLevelM));
    const cy = Math.floor((low + 2) / 16);
    const chunk = new Chunk(Math.floor(x / 16), cy, Math.floor(z / 16));
    g.generateChunk(chunk);
    const lx = x - chunk.cx * 16, lz = z - chunk.cz * 16;
    const above = chunk.blocks[localIndex(lx, low + 1 - cy * 16, lz)]!;
    expect(isFallingWater(above)).toBe(true);
  });
});

describe('dropped items in a current (T-G12)', () => {
  it('drift along the flow', async () => {
    const { ItemEntities } = await import('../src/items/itemEntities');
    const items = new ItemEntities();
    items.spawn(BlockId.STONE, 1, 0.5, 0.2, 0.5, () => 0.5);
    const solid = (_x: number, y: number) => y < 0;
    for (let i = 0; i < 60; i++) items.step(1 / 60, solid, () => ({ x: 1, y: 0, z: 0 }));
    const still = new ItemEntities();
    still.spawn(BlockId.STONE, 1, 0.5, 0.2, 0.5, () => 0.5);
    for (let i = 0; i < 60; i++) still.step(1 / 60, solid);
    expect(items.items[0]!.x).toBeGreaterThan(still.items[0]!.x + 0.1);
  });
});
