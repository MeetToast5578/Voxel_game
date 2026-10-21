import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOULDER_SPACING, CHUNK_VOLUME, FALLEN_LOG_SPACING, FALLEN_LOG_MAX_LENGTH, SURFACE_LAYER_HEIGHT } from '../src/config';
import { boulderBlocks, fallenLogBlocks, lilyPadAt, mossAt, dampClimate, type SurfaceSite } from '../src/world/surfaceFeatures';
import { BlockId, Tile, blockFaceTile, blockStateName, parseBlockStateName, isSolid, isOpaque, blocksSky, blockTopHeight } from '../src/world/blocks';
import { FeatureRegistry, type FeatureBlock } from '../src/world/feature';
import { TerrainGenerator } from '../src/world/generator';
import { TerrainDensity } from '../src/world/density';
import { ClimateSampler } from '../src/world/shape';
import { RegionSampler } from '../src/world/region';
import { Chunk } from '../src/world/chunk';
import { buildChunkMesh } from '../src/render/mesher';
import { localIndex } from '../src/core/coords';
import { uniformTops } from './support/testWorld';
import { blockGeometry } from '../src/render/blockGeometry';
import { generateAtlasPixels } from '../src/render/atlasPixels';
import { ATLAS_SIZE, ATLAS_TILES, TILE_SIZE } from '../src/render/tiles';
const flat = (): SurfaceSite => ({ height: 15, waterY: 0, biome: 'birch', rock: BlockId.GRANITE, dry: true, damp: true });
afterEach(() => vi.restoreAllMocks());

describe('supported surface features (spec 49)', () => {
  it('makes rounded supported boulders and rejects a cliff, water or cave anywhere in the footprint', () => {
    let count = 0;
    for (let x = -30; x < 30; x++) {
      const blocks = boulderBlocks(1, x, -16, flat);
      if (!blocks.length) continue;
      count++;
      expect(blocks).toEqual(boulderBlocks(1, x, -16, flat));
      for (const b of blocks) {
        expect(b.y).toBeGreaterThan(15);
        if (b.state !== BlockId.MOSS && b.y > 16)
          expect(blocks.some(s => s.x === b.x && s.z === b.z && s.y === b.y - 1)).toBe(true);
      }
      expect(boulderBlocks(1, x, -16, (wx, wz) => ({ ...flat(), dry: wx === x && wz === -16 }))).toEqual([]);
      expect(boulderBlocks(1, x, -16, (wx) => ({ ...flat(), height: wx > x ? 20 : 15 }))).toEqual([]);
    }
    expect(count).toBeGreaterThan(5);
  });
  it('lays logs in both horizontal axes on forest floor, rejecting unsupported ends and nonforest biomes', () => {
    const axes = new Set<number>();
    for (let x = -40; x < 40; x++) {
      const blocks = fallenLogBlocks(1, x, -1, flat), logs = blocks.filter(b => b.state !== BlockId.MOSS);
      if (!logs.length) continue;
      axes.add(logs[0]!.state);
      expect(logs.length).toBeGreaterThanOrEqual(4); expect(logs.length).toBeLessThanOrEqual(8);
      expect(logs.every(b => b.y === 16)).toBe(true);
      const end = logs.at(-1)!;
      expect(fallenLogBlocks(1, x, -1, (wx, wz) => ({ ...flat(), dry: wx !== end.x || wz !== end.z }))).toEqual([]);
      expect(fallenLogBlocks(1, x, -1, () => ({ ...flat(), biome: 'desert' }))).toEqual([]);
    }
    expect([...axes].sort()).toEqual([BlockId.FALLEN_LOG_X, BlockId.FALLEN_LOG_Z]);
  });
  it('clips full features identically across negative horizontal and vertical chunk boundaries', () => {
    const registry = new FeatureRegistry();
    registry.registerFeature({ key: 'rock', spacing: BOULDER_SPACING, densityPerChunk: 1, maxExtentBlocks: 3,
      place: (seed, x, z, emit) => boulderBlocks(seed, x, z, () => ({ ...flat(), height: 14 })).forEach(emit) });
    registry.registerFeature({ key: 'log', spacing: FALLEN_LOG_SPACING, densityPerChunk: 1, maxExtentBlocks: FALLEN_LOG_MAX_LENGTH,
      place: (seed, x, z, emit) => fallenLogBlocks(seed, x, z, () => ({ ...flat(), height: 14 })).forEach(emit) });
    const collect = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
      const out: string[] = []; registry.evaluateAnchors(1, x0, x1, z0, z1, y0, y1, b => out.push(JSON.stringify(b))); return out;
    };
    const whole = collect(-64, 64, -64, 64, 0, 32).sort(), slices: string[] = [];
    for (let x = 48; x >= -64; x -= 16) for (let z = -64; z < 64; z += 16) for (const y of [16, 0]) slices.push(...collect(x, x + 16, z, z + 16, y, y + 16));
    expect(whole.some(b => JSON.parse(b).y < 16)).toBe(true);
    expect(whole.some(b => JSON.parse(b).y >= 16)).toBe(true);
    expect(whole.length).toBeGreaterThan(50); expect(slices.sort()).toEqual(whole);
    expect(collect(-64, 64, -64, 64, 0, 32).sort()).toEqual(whole);
  });
  it('rejects a whole boulder when a tree intersects its far side across a chunk border', () => {
    let seed = 1;
    while (!boulderBlocks(seed, 15, 0, flat).length) seed++;
    const raw = boulderBlocks(seed, 15, 0, flat), far = raw.find(b => b.x >= 16)!;
    expect(far).toBeDefined();
    const g = new TerrainGenerator(seed), internal = g as unknown as {
      surfaceSite: typeof flat; featureRegistry: FeatureRegistry; surfaceRegistry: FeatureRegistry;
    };
    vi.spyOn(internal, 'surfaceSite').mockImplementation(flat);
    internal.featureRegistry = new FeatureRegistry();
    internal.featureRegistry.registerFeature({ key: 'tree', spacing: 1, densityPerChunk: 1, maxExtentBlocks: 0,
      place: (_, x, z, emit) => { if (x === far.x && z === far.z) emit({ ...far, state: BlockId.LOG }); } });
    const placed: FeatureBlock[] = [];
    internal.surfaceRegistry.getFeature('boulder')!.place(seed, 15, 0, b => placed.push(b));
    expect(placed).toEqual([]);
  });
  it('limits lily pads to shallow unfrozen still lakes, and moss to damp climates', () => {
    let lily = 0, moss = 0;
    for (let x = -100; x < 100; x++) {
      lily += Number(lilyPadAt(1, x, 1, 2, true, 10)); moss += Number(mossAt(1, x, 1, true));
      expect(lilyPadAt(1, x, 1, 2, false, 10)).toBe(false);
      for (const depth of [0, -1, 7]) expect(lilyPadAt(1, x, 1, depth, true, 10)).toBe(false);
      expect(lilyPadAt(1, x, 1, 2, true, 0)).toBe(false); expect(mossAt(1, x, 1, false)).toBe(false);
    }
    expect(lily).toBeGreaterThan(3); expect(moss).toBeGreaterThan(25);
    expect(dampClimate(10, 1000)).toBe(true); expect(dampClimate(10, 200)).toBe(false); expect(dampClimate(-1, 1000)).toBe(false);
  });
  it('appends saveable states, points log end grain along its axis, and meshes thin noncolliding plants', () => {
    for (const state of [73, 74, 75, 76]) expect(parseBlockStateName(blockStateName(state))).toBe(state);
    expect(blockFaceTile(BlockId.FALLEN_LOG_X, 1, 0, 0)).toBe(Tile.LOG_TOP);
    expect(blockFaceTile(BlockId.FALLEN_LOG_X, 0, 1, 0)).toBe(Tile.LOG_SIDE);
    expect(blockFaceTile(BlockId.FALLEN_LOG_Z, 0, 0, -1)).toBe(Tile.LOG_TOP);
    for (const state of [BlockId.LILY_PAD, BlockId.MOSS]) {
      expect(isSolid(state)).toBe(false); expect(isOpaque(state)).toBe(false); expect(blocksSky(state)).toBe(false);
      expect(blockTopHeight(state)).toBe(SURFACE_LAYER_HEIGHT);
      const n = Array.from({ length: 27 }, () => new Uint16Array(CHUNK_VOLUME)); n[13]![localIndex(5, 2, 5)] = state;
      const mesh = buildChunkMesh(n, uniformTops(-100), 0).solid;
      const ys = Array.from(mesh.positions).filter((_, i) => i % 3 === 1);
      expect(Math.max(...ys)).toBeCloseTo(2 + SURFACE_LAYER_HEIGHT); expect(Math.min(...ys)).toBe(2);
      const geometry = blockGeometry(state, 1); geometry.computeBoundingBox();
      expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(SURFACE_LAYER_HEIGHT);
    }
    const pixels = generateAtlasPixels();
    for (const tile of [Tile.LILY_PAD, Tile.MOSS]) {
      const alphas: number[] = [];
      for (let y = 0; y < TILE_SIZE; y++) for (let x = 0; x < TILE_SIZE; x++) alphas.push(pixels[((Math.floor(tile / ATLAS_TILES) * TILE_SIZE + y) * ATLAS_SIZE + tile % ATLAS_TILES * TILE_SIZE + x) * 4 + 3]!);
      expect(alphas).toContain(0); expect(alphas).toContain(255);
    }
  });
  it('retains real seed-1 rock, log, moss and lake fixtures used by worker browser smoke', () => {
    const g = new TerrainGenerator(1);
    for (const [x, y, z, state] of [[3129, 152, -2168, 14], [3517, 161, -2163, 76], [3873, 186, -1690, 73], [4240, 223, -3020, 75]]) {
      const c = new Chunk(Math.floor(x! / 16), Math.floor(y! / 16), Math.floor(z! / 16)); g.generateChunk(c);
      expect(c.get((x! % 16 + 16) % 16, y! % 16, (z! % 16 + 16) % 16)).toBe(state);
      expect(g.getHeight(x!, z!)).toBeLessThan(y!);
      // Cache eviction and another chunk load order must reproduce the same feature cells.
      const caches = g as unknown as { columnCache: Map<string, unknown>; treeCache: Map<string, unknown>; surfaceFeatureCache: Map<string, unknown> };
      caches.columnCache.clear(); caches.treeCache.clear(); caches.surfaceFeatureCache.clear();
      const regenerated = new Chunk(c.cx, c.cy, c.cz); g.generateChunk(regenerated);
      expect(regenerated.blocks).toEqual(c.blocks);
      if (state === BlockId.LILY_PAD) expect(c.get(x! % 16, y! % 16 - 1, (z! % 16 + 16) % 16)).toBe(BlockId.WATER);
    }
  });
  it('generates lake pads directly on source water, reproducing cells across vertical slices', () => {
    vi.spyOn(ClimateSampler.prototype, 'fields').mockReturnValue({ continentalness: 0.2, erosion: 1, peaks: 0, temperature: 0.5, humidity: 0, weirdness: 0 });
    vi.spyOn(RegionSampler.prototype, 'sample').mockReturnValue({ offsetM: 3.9, riverDepthM: 0, riverWidthM: 0, flowX: 0, flowZ: 0,
      waterLevelM: 4.5, moisture: 0, isRiver: false, isLake: true });
    vi.spyOn(TerrainDensity.prototype, 'isSolid').mockImplementation((_, y) => y <= 13);
    vi.spyOn(TerrainGenerator.prototype, 'treeSpeciesAt').mockReturnValue(null);
    const g = new TerrainGenerator(1), low = new Chunk(-1, 0, -1), high = new Chunk(-1, 1, -1);
    g.generateChunk(high); g.generateChunk(low);
    let pads = 0;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (high.get(x, 0, z) === BlockId.LILY_PAD) {
      pads++; expect(low.get(x, 15, z)).toBe(BlockId.WATER);
    }
    expect(pads).toBeGreaterThan(0);
    expect(g.legacyColumn(-1, -1).slice(CHUNK_VOLUME, CHUNK_VOLUME * 2)).toEqual(high.blocks);
  });
});
