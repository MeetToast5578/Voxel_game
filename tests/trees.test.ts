import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE_M,
  LEGACY_HEIGHT,
  roundBlocks,
  TREE_CHANCE,
  TREE_DENSITY_PER_M2,
  TREE_HEIGHT_MAX_M,
  TREE_REACH,
} from '../src/config';
import { floorDiv } from '../src/core/math';
import { hash2 } from '../src/core/random';
import { BlockId } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { MAX_TREE_RISE, treeBlocks, type TreeBlock } from '../src/world/trees';
import { stackedColumn, type StackedColumn } from './support/stackedColumn';

const SEED = 42;
const ANCHORS: Array<[number, number]> = [];
for (let az = -30; az <= 30; az += 3) for (let ax = -30; ax <= 30; ax += 3) ANCHORS.push([ax, az]);

/** The blocks of a tree at a ground height of 20 (the height only shifts the tree, so 20 is arbitrary). */
function tree(ax: number, az: number): TreeBlock[] {
  return treeBlocks(SEED, ax, 20, az);
}

describe('trees', () => {
  it('reach 12–20 blocks up, the crown top at most 20', () => {
    const minTall = roundBlocks(TREE_HEIGHT_MAX_M) - 8; // 12: the crown top may be one block lower
    for (const [ax, az] of ANCHORS) {
      const rise = Math.max(...tree(ax, az).map((b) => b.y)) - 20;
      expect(rise).toBeGreaterThanOrEqual(minTall);
      expect(rise).toBeLessThanOrEqual(roundBlocks(TREE_HEIGHT_MAX_M));
    }
  });
  it('stay within reach of the trunk and within MAX_TREE_RISE of the ground', () => {
    const outside = ANCHORS.flatMap(([ax, az]) =>
      tree(ax, az).filter(
        (b) =>
          Math.abs(b.x - ax) > TREE_REACH ||
          Math.abs(b.z - az) > TREE_REACH ||
          b.y - 20 < 0 ||
          b.y - 20 > MAX_TREE_RISE,
      ),
    );
    expect(outside).toEqual([]);
  });
  it('every log is connected to the trunk through logs', () => {
    for (const [ax, az] of ANCHORS) {
      const blocks = tree(ax, az);
      const logs = new Set(blocks.filter((b) => b.id === BlockId.LOG).map((b) => `${b.x},${b.y},${b.z}`));
      const start = `${ax},21,${az}`; // the trunk's first log, one block above the ground
      expect(logs.has(start)).toBe(true);
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        const [x, y, z] = queue.pop()!.split(',').map(Number) as [number, number, number];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
          const k = `${x + dx},${y + dy},${z + dz}`;
          if (logs.has(k) && !seen.has(k)) {
            seen.add(k);
            queue.push(k);
          }
        }
      }
      expect(seen.size).toBe(logs.size);
    }
  });
  it('the crown covers the top of the trunk, and logs are never replaced by leaves', () => {
    for (const [ax, az] of ANCHORS) {
      const blocks = tree(ax, az);
      const centre = blocks.filter((b) => b.x === ax && b.z === az && b.id === BlockId.LOG);
      const topY = Math.max(...centre.map((b) => b.y));
      const above = blocks.find((b) => b.x === ax && b.z === az && b.y === topY + 1);
      expect(above?.id).toBe(BlockId.LEAVES);
    }
  });
  it('is deterministic, and different anchors grow different trees', () => {
    expect(tree(5, -3)).toEqual(tree(5, -3));
    const heights = new Set(ANCHORS.map(([ax, az]) => Math.max(...tree(ax, az).map((b) => b.y)) - 20));
    expect(heights.size).toBeGreaterThan(3);
  });
  it('a tree whose crown crosses a column border is drawn on both sides', { timeout: 30000 }, () => {
    const g = new TerrainGenerator(SEED);
    const columns = new Map<string, StackedColumn>();
    const column = (cx: number, cz: number) => {
      const key = `${cx},${cz}`;
      if (!columns.has(key)) columns.set(key, stackedColumn(g, cx, cz));
      return columns.get(key)!;
    };
    const cell = (x: number, y: number, z: number): number => {
      const cx = floorDiv(x, 16);
      const cz = floorDiv(z, 16);
      return column(cx, cz).get(x - cx * 16, y, z - cz * 16);
    };
    let crossing = 0;
    for (let az = -20; az <= 20; az++)
      for (let ax = -20; ax <= 20; ax++) {
        const ground = g.getHeight(ax, az);
        if (cell(ax, ground, az) !== BlockId.DIRT) continue; // only the trees that were actually placed
        const blocks = treeBlocks(SEED, ax, ground, az);
        if (new Set(blocks.map((b) => floorDiv(b.x, 16) + ',' + floorDiv(b.z, 16))).size > 1) crossing++;
        for (const b of blocks) {
          if (b.y < 0 || b.y >= LEGACY_HEIGHT) continue;
          const got = cell(b.x, b.y, b.z);
          if (b.id === BlockId.LOG) expect(got).toBe(BlockId.LOG);
          else expect(got).not.toBe(BlockId.AIR); // leaves fill air, so this cell must not be air
        }
      }
    expect(crossing).toBeGreaterThan(0);
  });
  it('the anchor density is TREE_DENSITY_PER_M2 per square metre', () => {
    let anchors = 0;
    const side = 200;
    for (let az = 0; az < side; az++)
      for (let ax = 0; ax < side; ax++) if (hash2(SEED, ax, az) < TREE_CHANCE) anchors++;
    const squareMetres = (side * BLOCK_SIZE_M) ** 2;
    expect(anchors / squareMetres).toBeGreaterThan(TREE_DENSITY_PER_M2 * 0.8);
    expect(anchors / squareMetres).toBeLessThan(TREE_DENSITY_PER_M2 * 1.2);
  });
  it('some columns have trees, not all', { timeout: 30000 }, () => {
    const g = new TerrainGenerator(SEED);
    const columns: StackedColumn[] = [];
    for (let i = 0; i < 40; i++) columns.push(stackedColumn(g, i, 7));
    const withTrees = columns.filter((c) => c.blocks.includes(BlockId.LOG)).length;
    expect(withTrees).toBeGreaterThan(5);
    expect(withTrees).toBeLessThan(40);
  });
  it('every trunk top in a column has leaves directly above it', { timeout: 30000 }, () => {
    const g = new TerrainGenerator(SEED);
    for (let i = 0; i < 20; i++) {
      const c = stackedColumn(g, i, 7);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          for (let y = 1; y < LEGACY_HEIGHT - 1; y++) {
            // A trunk base is a log on dirt; walk up the trunk and check the cell above its top.
            if (c.get(lx, y, lz) !== BlockId.LOG || c.get(lx, y - 1, lz) !== BlockId.DIRT) continue;
            let top = y;
            while (c.get(lx, top + 1, lz) === BlockId.LOG) top++;
            expect(c.get(lx, top + 1, lz)).toBe(BlockId.LEAVES);
          }
        }
    }
  });
});
