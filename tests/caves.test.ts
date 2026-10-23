import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, CAVE_BOTTOM_ROWS, CHUNK_SIZE, TERRAIN_CHUNK_BOTTOM, RAVINE_DEPTH_M, RAVINE_ROOF, SEA_LEVEL, SHORE_CAVE_BAND, SHORE_ROOF, SOIL_DEPTH } from '../src/config';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/chunk';
import { caveKind, createCaveNoises, isCaveBlock, type CaveKind } from '../src/world/caves';
import { TerrainGenerator } from '../src/world/generator';
import { landColumns, stackedColumn, type StackedColumn } from './support/stackedColumn';

describe('caves', () => {
  const g = new TerrainGenerator(1);
  const columns: StackedColumn[] = landColumns(g, 40, 60).map(({ cx, cz }) => stackedColumn(g, cx, cz));

  it('carve a small fraction of the underground', () => {
    let underground = 0;
    let air = 0;
    for (const c of columns)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(c.cx * 16 + lx, c.cz * 16 + lz);
          for (let y = 1; y < h - SOIL_DEPTH; y++) {
            underground++;
            if (c.get(lx, y, lz) === BlockId.AIR) air++;
          }
        }
    const fraction = air / underground;
    console.log(`cave fraction: ${(fraction * 100).toFixed(2)}%`);
    expect(fraction).toBeGreaterThan(0.005);
    // Four systems (spec 45), plus natural density voids, share the existing 16% total budget.
    // The old 8% bound predated cheese/noodles/ravines and depended on a clamped region strip.
    expect(fraction).toBeLessThan(0.16);
  });
  it('never carves the lowest two rows of the terrain band (spec 46 replaces the sea-level floor)', () => {
    const bottom = new Chunk(0, TERRAIN_CHUNK_BOTTOM, 0);
    g.generateChunk(bottom);
    for (let y = 0; y < CAVE_BOTTOM_ROWS; y++)
      for (let z = 0; z < CHUNK_SIZE; z++)
        for (let x = 0; x < CHUNK_SIZE; x++) {
          expect(bottom.get(x, y, z)).not.toBe(BlockId.AIR);
          expect(bottom.get(x, y, z)).not.toBe(BlockId.WATER);
        }
  });
  it('never open a hole under the shore', () => {
    for (const c of columns)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const h = g.getHeight(c.cx * 16 + lx, c.cz * 16 + lz);
          if (h > SEA_LEVEL + SHORE_CAVE_BAND) continue;
          for (let y = Math.max(1, h - SHORE_ROOF + 1); y <= h; y++) expect(c.get(lx, y, lz)).not.toBe(BlockId.AIR);
        }
  });
});

describe('cave systems (spec 45)', () => {
  const noises = createCaveNoises(1);
  const generator = new TerrainGenerator(1);
  const samples: { x: number; z: number; h: number }[] = [];
  for (let x = 0; x < 60; x += 4)
    for (let z = 0; z < 60; z += 4) {
      const wx = x * 11 - 900;
      const wz = z * 11 - 900;
      samples.push({ x: wx, z: wz, h: generator.getHeight(wx, wz) });
    }
  /** Cells of every sampled column from y = 2 up to its surface. */
  const cells: { kind: CaveKind | null; cover: number }[] = [];
  for (const s of samples)
    for (let y = 2; y <= s.h; y++) cells.push({ kind: caveKind(noises, s.x, y, s.z, s.h), cover: s.h - y });

  const share = (kind: CaveKind) => cells.filter((c) => c.kind === kind).length / cells.length;

  it('carves with all four systems', () => {
    expect(share('cheese')).toBeGreaterThan(0);
    expect(share('noodle')).toBeGreaterThan(0);
    expect(share('spaghetti')).toBeGreaterThan(0);
    expect(share('ravine')).toBeGreaterThan(0);
  });

  it('keeps each system inside its own volume budget, and leaves most rock solid', () => {
    // The exact shares are tuned in config.ts; these bands catch a field that stops carving or floods the world.
    expect(share('cheese')).toBeGreaterThan(0.03);
    expect(share('cheese')).toBeLessThan(0.09);
    expect(share('noodle')).toBeGreaterThan(0.002);
    expect(share('noodle')).toBeLessThan(0.02);
    expect(share('spaghetti')).toBeGreaterThan(0.01);
    expect(share('spaghetti')).toBeLessThan(0.05);
    expect(share('ravine')).toBeGreaterThan(0.001);
    expect(share('ravine')).toBeLessThan(0.02);
    const carved = cells.filter((c) => c.kind !== null).length / cells.length;
    expect(carved).toBeGreaterThan(0.05);
    expect(carved).toBeLessThan(0.16);
  });

  it('never carves above the surface, and only cheese may reach it', () => {
    for (const s of samples) expect(caveKind(noises, s.x, s.h + 1, s.z, s.h)).toBeNull();
    const atSurface = samples.filter((s) => caveKind(noises, s.x, s.h, s.z, s.h) !== null);
    for (const s of atSurface) expect(caveKind(noises, s.x, s.h, s.z, s.h)).toBe('cheese');
    // A cave mouth is a landmark, not the rule.
    expect(atSurface.length / samples.length).toBeLessThan(0.06);
    // Below four blocks of cover only a cheese cavern can carve.
    for (const kind of ['noodle', 'spaghetti', 'ravine'] as const) expect(cells.some((c) => c.kind === kind && c.cover < 4)).toBe(false);
  });

  it('tapers a ravine with depth and narrows it towards the surface', () => {
    // Compare per depth layer: the deep band covers many more layers than the shallow one.
    const perLayer = (from: number, to: number) => {
      const count = cells.filter((c) => c.kind === 'ravine' && c.cover >= from && c.cover < to).length;
      return count / (to - from);
    };
    expect(perLayer(RAVINE_ROOF, RAVINE_ROOF + 4)).toBeGreaterThan(perLayer(RAVINE_ROOF + 20, RAVINE_ROOF + 24));
    const depthBlocks = Math.round(RAVINE_DEPTH_M / BLOCK_SIZE_M);
    const deepest = cells.filter((c) => c.kind === 'ravine' && c.cover >= RAVINE_ROOF + depthBlocks).length;
    expect(deepest).toBe(0);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const again = createCaveNoises(1);
    for (let i = 0; i < 500; i++) {
      const x = (i * 37) % 400;
      const y = 10 + ((i * 13) % 200);
      const z = (i * 71) % 400;
      expect(caveKind(again, x, y, z, y + 60)).toBe(caveKind(noises, x, y, z, y + 60));
    }
    const other = createCaveNoises(2);
    let differences = 0;
    for (let i = 0; i < 500; i++) {
      const x = (i * 37) % 400;
      const y = 10 + ((i * 13) % 200);
      const z = (i * 71) % 400;
      if (caveKind(other, x, y, z, y + 60) !== caveKind(noises, x, y, z, y + 60)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it('agrees with the boolean helper the generator uses', () => {
    for (const { x, z, h } of samples.slice(0, 40))
      for (let y = 2; y < h; y += 7) expect(isCaveBlock(noises, x, y, z, h)).toBe(caveKind(noises, x, y, z, h) !== null);
  });
});
