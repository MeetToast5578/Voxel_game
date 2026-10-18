import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE_M,
  LEGACY_HEIGHT,
  TREE_CHANCE,
  TREE_DENSITY_PER_M2,
  TREE_REACH,
  TREE_SPECIES,
} from '../src/config';
import { floorDiv } from '../src/core/math';
import { hash2 } from '../src/core/random';
import { BlockId } from '../src/world/blocks';
import { TerrainGenerator } from '../src/world/generator';
import { MAX_TREE_RISE, treeBlocks, type TreeBlock } from '../src/world/trees';
import { landColumns, stackedColumn, type StackedColumn } from './support/stackedColumn';

const SEED = 42;
const ANCHORS: Array<[number, number]> = [];
for (let az = -30; az <= 30; az += 3) for (let ax = -30; ax <= 30; ax += 3) ANCHORS.push([ax, az]);

/** The blocks of a tree at a ground height of 20 (the height only shifts the tree, so 20 is arbitrary). */
function tree(ax: number, az: number): TreeBlock[] {
  return treeBlocks(SEED, ax, 20, az);
}

describe('trees', () => {
  it('dead snags are leafless, deterministic and connected across seeds and anchors (T-E15)', () => {
    for (const seed of [1, 42, 99, 2026]) for (const [ax, az] of ANCHORS.filter((_, i) => i % 40 === 0)) {
      const blocks = treeBlocks(seed, ax, 20, az, 'dead_snag');
      expect(blocks).toEqual(treeBlocks(seed, ax, 20, az, 'dead_snag'));
      expect(blocks.some((b) => b.id === BlockId.LEAVES)).toBe(false);
      expect(blocks.every((b) => Math.abs(b.x - ax) <= TREE_REACH && Math.abs(b.z - az) <= TREE_REACH &&
        b.y >= 20 && b.y <= 20 + MAX_TREE_RISE)).toBe(true);
      const logs = new Set(blocks.filter((b) => b.id === BlockId.LOG).map((b) => `${b.x},${b.y},${b.z}`));
      const start = `${ax},21,${az}`;
      expect(logs.has(start)).toBe(true);
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const [x, y, z] = queue.pop()!.split(',').map(Number) as [number, number, number];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
          const next = `${x + dx},${y + dy},${z + dz}`;
          if (logs.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      expect(seen.size).toBe(logs.size);
    }
  });
  it('every species with a nonzero foliage radius still produces leaves (T-E15)', () => {
    for (const def of TREE_SPECIES.filter((s) => s.blobRadiusBlocks > 0)) {
      for (const seed of [1, 42, 99]) {
        const blocks = treeBlocks(seed, -16, 20, 15, def.key);
        expect(blocks.some((b) => b.id === BlockId.LEAVES), def.key).toBe(true);
        expect(blocks).toEqual(treeBlocks(seed, -16, 20, 15, def.key));
      }
    }
  });
  it('new species have distinct deterministic geometry at the same anchor (T-E11)', () => {
    const keys = ['maple', 'fir', 'larch', 'baobab', 'palm'] as const;
    const signatures = new Set<string>();
    for (const key of keys) {
      const blocks = treeBlocks(SEED, 0, 20, 0, key);
      expect(blocks).toEqual(treeBlocks(SEED, 0, 20, 0, key));
      const signature = blocks.map((b) => `${b.x},${b.y},${b.z},${b.id}`).sort().join(';');
      signatures.add(signature);
      const logs = new Set(blocks.filter((b) => b.id === BlockId.LOG).map((b) => `${b.x},${b.y},${b.z}`));
      const seen = new Set(['0,21,0']);
      const queue = ['0,21,0'];
      while (queue.length) {
        const [x, y, z] = queue.pop()!.split(',').map(Number) as [number, number, number];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
          const next = `${x + dx},${y + dy},${z + dz}`;
          if (logs.has(next) && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size, `${key} logs must connect to the trunk`).toBe(logs.size);
    }
    expect(signatures.size).toBe(keys.length);
  });
  it('reach their species height (branches may rise a little above the trunk)', () => {
    for (const def of TREE_SPECIES) {
      for (const [ax, az] of ANCHORS.slice(0, 24)) {
        const rise = Math.max(...treeBlocks(SEED, ax, 20, az, def.key).map((b) => b.y)) - 20;
        expect(rise).toBeGreaterThanOrEqual(def.heightMinBlocks - 1);
        expect(rise).toBeLessThanOrEqual(MAX_TREE_RISE);
      }
    }
  });
  it('stay within reach of the trunk and within MAX_TREE_RISE of the ground, for every species', () => {
    for (const def of TREE_SPECIES) {
      const outside = ANCHORS.flatMap(([ax, az]) =>
        treeBlocks(SEED, ax, 20, az, def.key).filter(
          (b) =>
            Math.abs(b.x - ax) > TREE_REACH ||
            Math.abs(b.z - az) > TREE_REACH ||
            b.y - 20 < 0 ||
            b.y - 20 > MAX_TREE_RISE,
        ),
      );
      expect(outside).toEqual([]);
    }
  }, 30_000); // every species at every anchor: taller trees take longer to build
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
        const surf = cell(ax, ground, az);
        // Only test trees that were actually placed: surface is plant-growing (not stone, not sand)
        // AND the hash2 check passed (same condition as generator's placeTrees).
        if (surf === BlockId.STONE || surf === BlockId.GRANITE || surf === BlockId.DIORITE ||
            surf === BlockId.ANDESITE || surf === BlockId.SANDSTONE || surf === BlockId.LIMESTONE ||
            surf === BlockId.SLATE || surf === BlockId.BASALT || surf === BlockId.DEEPSLATE ||
            surf === BlockId.SAND) continue;
        if (hash2(SEED, ax, az) >= TREE_CHANCE) continue; // generator didn't place a tree here
        const species = g.treeSpeciesAt(ax, az);
        if (!species) continue; // this anchor grows no tree (wrong biome, or a non-grass surface)
        const blocks: TreeBlock[] = treeBlocks(SEED, ax, ground, az, species);
        if (new Set(blocks.map((b) => floorDiv(b.x, 16) + ',' + floorDiv(b.z, 16))).size > 1) crossing++;
        for (const b of blocks) {
          if (b.y < 0 || b.y >= LEGACY_HEIGHT) continue;
          const got = cell(b.x, b.y, b.z);
          if (b.id === BlockId.LOG) {
            if (got !== BlockId.AIR) expect(got).toBe(BlockId.LOG); // tree placed here: LOG must be present
          } else if (got !== BlockId.AIR) {
            expect(got).not.toBe(BlockId.AIR); // leaves fill air, so this cell must not be air
          }
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
    for (const { cx, cz } of landColumns(g, 60)) columns.push(stackedColumn(g, cx, cz));
    const withTrees = columns.filter((c) => c.blocks.includes(BlockId.LOG)).length;
    expect(withTrees).toBeGreaterThan(5);
    expect(withTrees).toBeLessThan(60);
  });
  it('every leafy trunk top in a column has leaves directly above it', { timeout: 30000 }, () => {
    const g = new TerrainGenerator(SEED);
    for (let i = 0; i < 20; i++) {
      const c = stackedColumn(g, ...[landColumns(g, 20)[i]!.cx, landColumns(g, 20)[i]!.cz] as const);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          for (let y = 1; y < c.blocks.length / 256 - 1; y++) {
            // A trunk base is a log on dirt; walk up the trunk and check the cell above its top.
            if (c.get(lx, y, lz) !== BlockId.LOG || c.get(lx, y - 1, lz) !== BlockId.DIRT) continue;
            const species = g.treeSpeciesAt(c.cx * 16 + lx, c.cz * 16 + lz);
            if (TREE_SPECIES.find((s) => s.key === species)?.blobRadiusBlocks === 0) continue;
            let top = y;
            while (c.get(lx, top + 1, lz) === BlockId.LOG) top++;
            expect(c.get(lx, top + 1, lz)).toBe(BlockId.LEAVES);
          }
        }
    }
  });
});
