import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import {
  BARE_ROCK_AMP_M,
  BEACH_BAND,
  BLOCK_SIZE_M,
  CAVE_SCALE_H_M,
  CAVE_SCALE_V_M,
  CHUNK_SIZE,
  GEOLOGY_LAYER_M,
  GEOLOGY_WARP_M,
  LEGACY_CHUNKS,
  LEGACY_HEIGHT,
  metersToBlocks,
  ORE_GEN,
  SEA_LEVEL,
  SHORE_CAVE_BAND,
  SHORE_ROOF,
  SOIL_DEPTH,
  DANDELION_CHANCE,
  BROWN_MUSHROOM_CHANCE,
  DEEPSLATE_DEPTH_M,
  FERN_CHANCE,
  RED_MUSHROOM_CHANCE,
  POPPY_CHANCE,
  TALL_GRASS_CHANCE,
  TERRAIN_CHUNK_BOTTOM,
  TREE_CHANCE,
  TREE_REACH,
  type TreeSpecies,
} from '../config';
import { columnIndex, columnKey, localIndex } from '../core/coords';
import { floorDiv } from '../core/math';
import { hash2, mulberry32 } from '../core/random';
import { BlockId, blocksSky, parseBlockStateName } from './blocks';
import { Chunk } from './chunk';
import { TerrainDensity } from './density';
import { ClimateSampler, detailAmpMeters, heightMeters } from './shape';
import { blockPrecipitation, blockTemperature } from './climate';
import { FeatureRegistry, type FeatureBlock } from './feature';
import { biomeAt, soilBlock, surfaceBlock, treeSpecies } from './biome';
import { MAX_TREE_RISE, treeBlocks } from './trees';

const CAVE_THRESHOLD = 0.012;
/** The column cache is only a cache, so clearing it never changes a result. */
const COLUMN_CACHE_LIMIT = 2048;
/** Rock types of the strata, in layer order (the layer index wraps around this list). */
const ROCKS = [
  BlockId.GRANITE, BlockId.DIORITE, BlockId.ANDESITE, BlockId.SANDSTONE, BlockId.LIMESTONE, BlockId.SLATE, BlockId.BASALT,
] as const;

/** Ore generation: the block id, its depth band in blocks, and the placement odds, built from `src/config.ts`. */
const ORE_DEFS: readonly {
  readonly id: number;
  /** Inclusive, blocks. */
  readonly minY: number;
  /** Inclusive, blocks. */
  readonly maxY: number;
  readonly chancePerColumn: number;
  readonly clusterTries: number;
}[] = ORE_GEN.map((d) => {
  const id = parseBlockStateName(d.key);
  if (id === null) throw new Error(`Ore '${d.key}' is not a registered block`);
  const minY = Math.ceil(metersToBlocks(d.bottomM));
  const maxY = Math.floor(metersToBlocks(d.topM));
  return { id, minY, maxY, chancePerColumn: d.chancePerColumn, clusterTries: d.clusterTries };
});

/** The rock ores can replace: stone, the strata rocks and deepslate — never soil, plants or air. */
const ORE_HOSTS = new Set<number>([BlockId.STONE, ...ROCKS, BlockId.DEEPSLATE]);

/** One roll per column and ore type decides whether this column gets a cluster. */
const ORE_SEED_OFFSET = 1000;

/** Per-column terrain, indexed by columnIndex: the top solid block and the two inputs of the density. */
interface Column {
  /** World y of the highest solid block (the surface, before water and trees). */
  solidTop: Int32Array;
  /** Surface offset from the shape fields, in meters. */
  offsets: Float64Array;
  /** Detail amplitude, in meters. */
  amps: Float64Array;
  /** Rock-layer warp: 2D noise in [-1, 1]. */
  warp: Float64Array;
  /** Biome key for this column (computed once at column center). */
  biomeKey: string;
}

export class TerrainGenerator {
  readonly seed: number;
  private readonly climate: ClimateSampler;
  private readonly density: TerrainDensity;
  private readonly rockNoise: NoiseFunction2D;
  private readonly caveNoiseA: NoiseFunction3D;
  private readonly caveNoiseB: NoiseFunction3D;
  private readonly columnCache = new Map<string, Column>();
  /** Feature registry: trees and later biomes register here. */
  private readonly featureRegistry = new FeatureRegistry();
  /** Callback when a grass block is placed during generation. Used to schedule grass-spread ticks. */
  onGrassPlaced?: (wx: number, wy: number, wz: number) => void;

  constructor(seed: number) {
    this.seed = seed;
    this.climate = new ClimateSampler(seed);
    this.density = new TerrainDensity(seed);
    this.rockNoise = createNoise2D(mulberry32(seed + 300));
    this.caveNoiseA = createNoise3D(mulberry32(seed + 3));
    this.caveNoiseB = createNoise3D(mulberry32(seed + 4));
    this.featureRegistry.registerFeature({
      key: 'tree',
      densityPerChunk: TREE_CHANCE * CHUNK_SIZE * CHUNK_SIZE,
      spacing: 1, // every block is a potential anchor, preserves the old per-block hash behavior
      maxExtentBlocks: TREE_REACH,
      place: this.placeTreeFromAnchor.bind(this),
    });
  }

  /** Y of the highest solid block in this column, from the density. Water and trees are not counted. */
  getHeight(wx: number, wz: number): number {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    return this.column(cx, cz).solidTop[columnIndex(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE)]!;
  }

  /** The biome key of the column that contains (wx, wz). */
  biomeKeyAt(wx: number, wz: number): string {
    return this.column(floorDiv(wx, CHUNK_SIZE), floorDiv(wz, CHUNK_SIZE)).biomeKey;
  }

  /** Fills chunk.blocks with the generated terrain of chunk (cx, cy, cz). */
  generateChunk(chunk: Chunk): void {
    const b = chunk.blocks;
    if (chunk.cy < TERRAIN_CHUNK_BOTTOM) {
      b.fill(BlockId.STONE);
      return;
    }
    if (chunk.cy >= LEGACY_CHUNKS) {
      b.fill(BlockId.AIR);
      return;
    }
    this.fillRange(chunk.cx, chunk.cz, chunk.cy * CHUNK_SIZE, CHUNK_SIZE, b);
  }

  /**
   * The terrain of one column from y = 0 up to the top of the band, as a 16 x LEGACY_HEIGHT x 16 array (same layout as a
   * chunk, so chunk cy is the slice at cy * CHUNK_VOLUME). Tests use it as the reference that chunks must reproduce.
   */
  legacyColumn(cx: number, cz: number): Uint16Array {
    const out = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * LEGACY_HEIGHT);
    this.fillRange(cx, cz, 0, LEGACY_HEIGHT, out);
    return out;
  }

  /**
   * World y of the highest sky-blocking block of each cell of column (cx, cz), indexed lz * 16 + lx. Chunks are generated
   * from the top down, starting above the highest surface in reach, and the scan stops once every cell is found. Water
   * fills every column up to sea level, so every cell is found at y >= 0.
   */
  columnTops(cx: number, cz: number): Int32Array {
    const tops = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const found = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    let remaining = CHUNK_SIZE * CHUNK_SIZE;
    const start = Math.min(LEGACY_CHUNKS - 1, floorDiv(this.reachMaxHeight(cx, cz) + MAX_TREE_RISE, CHUNK_SIZE));
    for (let cy = start; cy >= 0 && remaining > 0; cy--) {
      const chunk = new Chunk(cx, cy, cz);
      this.generateChunk(chunk);
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = columnIndex(lx, lz);
          if (found[i]) continue;
          for (let ly = CHUNK_SIZE - 1; ly >= 0; ly--) {
            if (!blocksSky(chunk.blocks[localIndex(lx, ly, lz)]!)) continue;
            tops[i] = cy * CHUNK_SIZE + ly;
            found[i] = 1;
            remaining--;
            break;
          }
        }
    }
    return tops;
  }

  /** The highest surface among the columns that trees in this column can reach (its own columns and a margin). */
  private reachMaxHeight(cx: number, cz: number): number {
    let maxHeight = SEA_LEVEL;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    for (let wz = z0 - TREE_REACH; wz < z0 + CHUNK_SIZE + TREE_REACH; wz++)
      for (let wx = x0 - TREE_REACH; wx < x0 + CHUNK_SIZE + TREE_REACH; wx++)
        maxHeight = Math.max(maxHeight, this.getHeight(wx, wz));
    return maxHeight;
  }

  /**
   * Generates layers y0 .. y0 + count - 1 of column (cx, cz) into out (16 x count x 16, chunk layout). Any range gives
   * exactly the matching slice of the full legacy column: terrain and caves depend only on the position, and each tree
   * is computed whole and then clipped to the range. The trees come from anchors in neighbouring columns too, so a crown
   * that crosses a border is drawn on both sides.
   */
  private fillRange(cx: number, cz: number, y0: number, count: number, out: Uint16Array): void {
    const y1 = y0 + count; // exclusive
    // Trees within reach of this column can rise from a neighbour, so the early exit looks at the whole reach.
    if (y0 > this.reachMaxHeight(cx, cz) + MAX_TREE_RISE) {
      out.fill(BlockId.AIR, 0, count * CHUNK_SIZE * CHUNK_SIZE); // above every surface, tree and sea
      return;
    }
    const column = this.column(cx, cz);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = columnIndex(lx, lz);
        const h = column.solidTop[i]!;
        const offsetM = column.offsets[i]!;
        const ampM = column.amps[i]!;
        const beach = h <= SEA_LEVEL + BEACH_BAND;
        // shortcut: steepness is the detail amplitude, not the real slope, so lumpy flat ground can be bare; upgrade to finite differences if it looks wrong
        const soil = ampM < BARE_ROCK_AMP_M;
        const warp = column.warp[i]!;
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const inSlice = h + 1 >= y0 && h + 1 < y1; // the plant cell is in this range
        const surface = soil ? (beach ? BlockId.SAND : surfaceBlock(column.biomeKey, beach)) : BlockId.AIR;
        // Plants only grow on grass, so beaches, deserts and bare rock stay bare.
        const plant = surface === BlockId.GRASS && inSlice ? this.plantAt(wx, wz, h) : BlockId.AIR;
        for (let y = y0; y < y1; y++) {
          let id: number;
          if (this.density.isSolid(wx, y, wz, offsetM, ampM)) {
            if (soil && y === h) {
              id = surface;
              if (id === BlockId.GRASS && !beach) {
                this.onGrassPlaced?.(wx, y, wz);
              }
            } else if (soil && y >= h - SOIL_DEPTH) id = beach ? BlockId.SAND : soilBlock(column.biomeKey);
            else id = this.rockAt(y, warp);
          } else if (y === h + 1 && plant !== BlockId.AIR) id = plant;
          else id = y <= SEA_LEVEL ? BlockId.WATER : BlockId.AIR;
          out[localIndex(lx, y - y0, lz)] = id;
        }
        const top = Math.min(this.caveTop(h), y1 - 1);
        for (let y = Math.max(2, y0); y <= top; y++) {
          if (this.isCave(wx, y, wz)) out[localIndex(lx, y - y0, lz)] = BlockId.AIR;
        }
      }
    }
    this.placeOres(column, cx, cz, y0, y1, out);
    this.placeTrees(cx, cz, y0, y1, out);
  }

  /**
   * The column's cells: the shape fields, the density inputs and the highest solid block. Cached, because the
   * fields cost six noises per cell and every chunk of a column reads them.
   */
  private column(cx: number, cz: number): Column {
    const key = columnKey(cx, cz);
    const cached = this.columnCache.get(key);
    if (cached) return cached;
    if (this.columnCache.size >= COLUMN_CACHE_LIMIT) this.columnCache.clear();
    const column: Column = {
      solidTop: new Int32Array(CHUNK_SIZE * CHUNK_SIZE),
      offsets: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
      amps: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
      warp: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
      biomeKey: '',
    };
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = columnIndex(lx, lz);
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const fields = this.climate.fields(wx * BLOCK_SIZE_M, wz * BLOCK_SIZE_M);
        column.offsets[i] = heightMeters(fields);
        column.amps[i] = detailAmpMeters(fields);
        column.warp[i] = this.rockNoise((wx * BLOCK_SIZE_M) / GEOLOGY_WARP_M, (wz * BLOCK_SIZE_M) / GEOLOGY_WARP_M);
        column.solidTop[i] = this.solidTop(wx, wz, column.offsets[i]!, column.amps[i]!);
      }
    // Compute biome at column center, from real temperature and precipitation (not the raw [-1,1] fields).
    const cxM = (cx * CHUNK_SIZE + 8) * BLOCK_SIZE_M;
    const czM = (cz * CHUNK_SIZE + 8) * BLOCK_SIZE_M;
    const centerFields = this.climate.fields(cxM, czM);
    const centerHeight = column.offsets[columnIndex(8, 8)]!;
    const centerAmp = column.amps[columnIndex(8, 8)]!;
    column.biomeKey = biomeAt(
      blockTemperature(centerFields, centerHeight),
      blockPrecipitation(centerFields, centerAmp),
      centerHeight,
      centerAmp,
      false,
      centerFields.weirdness,
    ).key;
    this.columnCache.set(key, column);
    return column;
  }

  /**
   * Highest solid block of one cell, scanning down from above the highest possible surface. The bottom of the scan is
   * solid by construction, so the scan always stops there at the latest.
   */
  private solidTop(wx: number, wz: number, offsetM: number, ampM: number): number {
    const bottom = Math.floor(metersToBlocks(offsetM - ampM)) - 2;
    let y = Math.floor(metersToBlocks(offsetM + ampM)) + 2;
    while (y > bottom && !this.density.isSolid(wx, y, wz, offsetM, ampM)) y--;
    return y;
  }

  /** The plant growing on the surface of column (wx, wz) at height h, or air. Caves that open the surface keep it bare. */
  private plantAt(wx: number, wz: number, h: number): number {
    if (this.isCave(wx, h, wz)) return BlockId.AIR;
    const r = hash2(this.seed + 11, wx, wz);
    let edge = DANDELION_CHANCE;
    if (r < edge) return BlockId.DANDELION;
    edge += POPPY_CHANCE;
    if (r < edge) return BlockId.POPPY;
    edge += TALL_GRASS_CHANCE;
    if (r < edge) return BlockId.TALL_GRASS;
    edge += FERN_CHANCE;
    if (r < edge) return BlockId.FERN;
    edge += BROWN_MUSHROOM_CHANCE;
    if (r < edge) return BlockId.BROWN_MUSHROOM;
    edge += RED_MUSHROOM_CHANCE;
    return r < edge ? BlockId.RED_MUSHROOM : BlockId.AIR;
  }

  /**
   * The rock of a solid block at height y: deepslate below DEEPSLATE_DEPTH_M, otherwise the strata layer it sits in,
   * bent by the warp noise.
   */
  private rockAt(y: number, warp: number): number {
    if (y * BLOCK_SIZE_M < DEEPSLATE_DEPTH_M) return BlockId.DEEPSLATE;
    const layer = Math.floor((y * BLOCK_SIZE_M) / GEOLOGY_LAYER_M + 3 * warp);
    return ROCKS[((layer % ROCKS.length) + ROCKS.length) % ROCKS.length]!;
  }

  /**
   * "Spaghetti" caves: a block becomes air where two independent 3D noise fields are both close to zero,
   * which happens along thin winding tubes. y = 0 and y = 1 are never carved. Under beaches, lakes and the sea
   * the top few blocks are never carved, so water never sits above a cave opening.
   */
  private caveTop(h: number): number {
    return h <= SEA_LEVEL + SHORE_CAVE_BAND ? h - SHORE_ROOF : h;
  }

  private isCave(wx: number, y: number, wz: number): boolean {
    const x = (wx * BLOCK_SIZE_M) / CAVE_SCALE_H_M;
    const yy = (y * BLOCK_SIZE_M) / CAVE_SCALE_V_M;
    const z = (wz * BLOCK_SIZE_M) / CAVE_SCALE_H_M;
    const a = this.caveNoiseA(x, yy, z);
    if (a * a >= CAVE_THRESHOLD) return false; // cheap early exit: skip the second noise most of the time
    const c = this.caveNoiseB(x, yy, z);
    return a * a + c * c < CAVE_THRESHOLD;
  }

  /** Detail amplitude of the cell at (wx, wz). */
  private amplitudeAt(wx: number, wz: number): number {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    return this.column(cx, cz).amps[columnIndex(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE)]!;
  }

  /**
   * Ore veins for one column. The clusters are a pure function of (seed, cx, cz), not of cy, so every chunk of the
   * column writes the same blocks and a chunk equals the matching slice of the legacy column. A cluster replaces
   * stone-like rock below the surface, never the surface block, soil, plants or air.
   */
  private placeOres(column: Column, cx: number, cz: number, y0: number, y1: number, out: Uint16Array): void {
    for (let oi = 0; oi < ORE_DEFS.length; oi++) {
      const ore = ORE_DEFS[oi]!;
      // One roll per column and ore type: the column either has this ore or not.
      if (hash2(this.seed + ORE_SEED_OFFSET + oi, cx, cz) >= ore.chancePerColumn) continue;
      const rng = mulberry32((this.seed + ORE_SEED_OFFSET + 1000 + oi) * 1000003 + cx * 7919 + cz * 17);
      for (let t = 0; t < ore.clusterTries; t++) {
        const lx = Math.floor(rng() * CHUNK_SIZE);
        const lz = Math.floor(rng() * CHUNK_SIZE);
        const i = columnIndex(lx, lz);
        const h = column.solidTop[i]!;
        // Below the surface and inside this ore's depth band.
        const y = ore.minY + Math.floor(rng() * (ore.maxY - ore.minY + 1));
        if (y < y0 || y >= y1 || y >= h) continue;
        const bi = localIndex(lx, y - y0, lz);
        if (ORE_HOSTS.has(out[bi]!)) out[bi] = ore.id;
      }
    }
  }

  /**
   * The tree species that grows at this anchor, or null when no tree does. Pure and
   * side-effect free, so tests and tools can ask the generator the same question.
   */
  treeSpeciesAt(anchorX: number, anchorZ: number): TreeSpecies | null {
    const h = this.getHeight(anchorX, anchorZ);
    // Trees grow on grass: not a beach or water, and the cave carver left the surface alone.
    if (h <= SEA_LEVEL + BEACH_BAND) return null;
    const amp = this.amplitudeAt(anchorX, anchorZ);
    if (amp >= BARE_ROCK_AMP_M) return null; // no trees on bare rock
    if (h >= 2 && h <= this.caveTop(h) && this.isCave(anchorX, h, anchorZ)) return null;

    // Species comes from the column's biome, from real temperature/precipitation (height in metres).
    const fields = this.climate.fields(anchorX * BLOCK_SIZE_M, anchorZ * BLOCK_SIZE_M);
    const heightM = h * BLOCK_SIZE_M;
    const biome = biomeAt(
      blockTemperature(fields, heightM),
      blockPrecipitation(fields, amp),
      heightM,
      amp,
      false,
      fields.weirdness,
    );
    const species = treeSpecies(biome.key);
    // No tree where the biome grows none, and none on a surface that is not grass (sand, rock).
    return species && surfaceBlock(biome.key, false) === BlockId.GRASS ? species : null;
  }

  /**
   * Place a tree rooted at anchor (anchorX, anchorZ). The hash check reproduces the
   * old per-block anchor selection exactly. The species comes from the column's biome.
   */
  private placeTreeFromAnchor(seed: number, anchorX: number, anchorZ: number, emit: (block: FeatureBlock) => void): void {
    if (hash2(seed, anchorX, anchorZ) >= TREE_CHANCE) return;
    const species = this.treeSpeciesAt(anchorX, anchorZ);
    if (!species) return;
    const h = this.getHeight(anchorX, anchorZ);
    for (const b of treeBlocks(seed, anchorX, h, anchorZ, species)) {
      emit({ x: b.x, y: b.y, z: b.z, state: b.id });
    }
  }

  /** Trees whose anchor is in this column or within reach of it. Each tree is computed whole, then clipped. */
  private placeTrees(cx: number, cz: number, y0: number, y1: number, out: Uint16Array): void {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    this.featureRegistry.evaluateAnchors(
      this.seed,
      x0, x0 + CHUNK_SIZE,
      z0, z0 + CHUNK_SIZE,
      y0, y1,
      (block) => {
        const lx = block.x - x0;
        const ly = block.y - y0;
        const lz = block.z - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= y1 - y0) return;
        const i = localIndex(lx, ly, lz);
        // Leaves fill only air; logs and the ground block replace what is there.
        if (block.state === BlockId.LEAVES) {
          if (out[i] === BlockId.AIR) out[i] = BlockId.LEAVES;
        } else out[i] = block.state;
      }
    );
  }
}
