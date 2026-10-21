import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import {
  BARE_ROCK_AMP_M, BOULDER_SPACING, BOULDER_RADIUS, FALLEN_LOG_SPACING, FALLEN_LOG_MAX_LENGTH,
  COAST_PROBE_M, COAST_CONTINENTAL_BAND, COAST_EXPOSED, COAST_SANDBAR_RISE_M, COAST_SANDBAR_SCALE_M,
  REED_CHANCE, REED_MIN_HEIGHT_M, REED_MAX_HEIGHT_M, REED_BANK_HEIGHT_M, roundBlocks,
  CAVE_BOTTOM_ROWS,
  BEACH_BAND,
  BLOCK_SIZE_M,
  BIOME_BLEND_BLOCKS,
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
  DEEPSLATE_DEPTH_M,
  TERRAIN_CHUNK_BOTTOM,
  TREE_CHANCE,
  TREE_REACH,
  type TreeSpecies,
} from '../config';
import { columnIndex, columnKey, localIndex } from '../core/coords';
import { floorDiv } from '../core/math';
import { hash2, mulberry32 } from '../core/random';
import { caveKind, createCaveNoises, type CaveNoises } from './caves';
import { BlockId, blocksSky, getBlockDef, parseBlockStateName } from './blocks';
import { Chunk } from './chunk';
import { AquiferSampler } from './aquifer';
import { UndergroundPools } from './undergroundPools';
import { TerrainDensity } from './density';
import { ClimateSampler, detailAmpMeters, heightMeters, type ClimateFields } from './shape';
import { blockPrecipitation, blockTemperature } from './climate';
import { FeatureRegistry, type FeatureBlock } from './feature';
import { anchorSpecies, biomeAt, biomeName, blendSurfaceBlocks, riparianTreeSpecies, secondarySpecies, soilBlock, surfaceBlock, treeSpecies } from './biome';
import { climateHeightSource, RegionSampler, REGION_CELLS, type ColumnSample, type RegionData } from './region';
import { riverbedMaterial } from './riverbed';
import { coastProfile, waveExposure } from './coast';
import { groundCoverAt } from './groundCover';
import { boulderBlocks, fallenLogBlocks, lilyPadAt, mossAt, dampClimate, type SurfaceSite } from './surfaceFeatures';
import { MAX_TREE_RISE, treeBlocks } from './trees';

/** The column cache is only a cache, so clearing it never changes a result. */
const COLUMN_CACHE_LIMIT = 2048;

/** Valid substrate for shoreline reeds. */
const REED_GROUNDS = new Set<number>([BlockId.GRASS, BlockId.SAND, BlockId.CLAY, BlockId.GRAVEL]);
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
  /** Surface offset from the region simulation, in meters. */
  offsets: Float64Array;
  /** Detail amplitude, in meters. */
  amps: Float64Array;
  /** Rock-layer warp: 2D noise in [-1, 1]. */
  warp: Float64Array;
  /** Water surface height for each cell, in meters. Sea level where there is no lake or channel. */
  waterLevels: Float64Array;
  /** 0 = ordinary terrain/ocean, 1 = river, 2 = lake. */
  waterBodies: Uint8Array;
  /** Highest groundwater row for deep density voids and carved caves (spec 46). */
  waterTables: Int32Array;
  coastMaterials: Uint16Array;
  /** Biome at each surface cell, using actual elevation and moisture. */
  biomeKeys: string[];
  surfaces: Uint16Array;
  temperatures: Float64Array;
  precipitation: Float64Array;
}

export class TerrainGenerator {
  readonly seed: number;
  private readonly climate: ClimateSampler;
  private readonly density: TerrainDensity;
  /** Region simulation: rivers, lakes, erosion and moisture (spec 41). */
  private readonly regions: RegionSampler;
  private readonly rockNoise: NoiseFunction2D;
  /** The four cave systems (spec 45). */
  private readonly caves: CaveNoises;
  private readonly aquifers: AquiferSampler;
  private readonly pools: UndergroundPools;
  private readonly columnCache = new Map<string, Column>();
  /** Trees are evaluated separately so small features can reject whole-tree collisions. */
  private readonly featureRegistry = new FeatureRegistry();
  private readonly surfaceRegistry = new FeatureRegistry();
  private readonly treeCache = new Map<string, FeatureBlock[]>();
  private readonly surfaceFeatureCache = new Map<string, FeatureBlock[]>();
  /** Callback when a grass block is placed during generation. Used to schedule grass-spread ticks. */
  onGrassPlaced?: (wx: number, wy: number, wz: number) => void;

  constructor(seed: number) {
    this.seed = seed;
    this.climate = new ClimateSampler(seed);
    this.density = new TerrainDensity(seed);
    // The simulation starts from the plain climate surface and returns an eroded one, so both
    // the sampler and the height source below read the same `ClimateSampler` instance.
    this.regions = new RegionSampler(climateHeightSource((xM, zM) => this.climate.fields(xM, zM)));
    this.rockNoise = createNoise2D(mulberry32(seed + 300));
    this.caves = createCaveNoises(seed);
    this.aquifers = new AquiferSampler(seed);
    this.pools = new UndergroundPools(seed);
    this.featureRegistry.registerFeature({
      key: 'tree',
      densityPerChunk: TREE_CHANCE * CHUNK_SIZE * CHUNK_SIZE,
      spacing: 1, // every block is a potential anchor, preserves the old per-block hash behavior
      maxExtentBlocks: TREE_REACH,
      place: this.placeTreeFromAnchor.bind(this),
    });
    for (const [key, spacing, reach, build] of [
      ['boulder', BOULDER_SPACING, BOULDER_RADIUS, boulderBlocks],
      ['fallen_log', FALLEN_LOG_SPACING, FALLEN_LOG_MAX_LENGTH, fallenLogBlocks],
    ] as const) this.surfaceRegistry.registerFeature({
      key, spacing, maxExtentBlocks: reach, densityPerChunk: 1,
      place: (seed, x, z, emit) => {
        const cacheKey = `${key}:${x}:${z}`;
        let blocks = this.surfaceFeatureCache.get(cacheKey);
        if (!blocks) {
          blocks = build(seed, x, z, (wx, wz) => this.surfaceSite(wx, wz));
          if (blocks.length) {
            // Check the whole feature against trees, even if another chunk owns the collision.
            const cells = new Set(blocks.map(b => `${b.x}:${b.y}:${b.z}`));
            let collision = false;
            this.featureRegistry.evaluateAnchors(seed,
              Math.min(...blocks.map(b => b.x)), Math.max(...blocks.map(b => b.x)) + 1,
              Math.min(...blocks.map(b => b.z)), Math.max(...blocks.map(b => b.z)) + 1,
              Math.min(...blocks.map(b => b.y)), Math.max(...blocks.map(b => b.y)) + 1,
              b => { if (cells.has(`${b.x}:${b.y}:${b.z}`)) collision = true; });
            if (collision) blocks = [];
          }
          if (this.surfaceFeatureCache.size >= COLUMN_CACHE_LIMIT) this.surfaceFeatureCache.clear();
          this.surfaceFeatureCache.set(cacheKey, blocks);
        }
        blocks.forEach(emit);
      },
    });
  }

  /** Y of the highest solid block in this column, from the density. Water and trees are not counted. */
  getHeight(wx: number, wz: number): number {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    return this.column(cx, cz).solidTop[columnIndex(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE)]!;
  }

  /** Lowest actual ground under the canopy; lighting tops alone cannot bound a dense forest. */
  columnGroundMin(cx: number, cz: number): number { return Math.min(...this.column(cx, cz).solidTop); }

  /** The exact density surface of one cell, without preparing its 255 neighbouring columns. */
  sampleSurface(wx: number, wz: number): { height: number; waterLevelM: number; moisture: number; ampM: number } {
    const fields = this.climate.fields(wx * BLOCK_SIZE_M, wz * BLOCK_SIZE_M), sample = this.regions.sample(wx, wz);
    const p = this.surfaceParameters(wx, wz, fields, sample);
    return { height: this.solidTop(wx, wz, p.offsetM, p.ampM), waterLevelM: sample.waterLevelM, moisture: sample.moisture, ampM: p.ampM };
  }

  private surfaceParameters(wx: number, wz: number, fields: ClimateFields, sample: ColumnSample) {
    let offsetM = sample.offsetM;
    // The 3D detail noise has an amplitude of up to 22 m, which is far more than a river
    // channel is deep, so left alone it fills every channel back in with rock and the river
    // never appears. Damping it inside channels and lakes lets the water show while keeping
    // some bumpiness.
    const ampScale = sample.isRiver ? 0.2 : sample.isLake ? 0.35 : 1;
    let ampM = detailAmpMeters(fields) * ampScale;
    let exposure = 0, coastal = false, coastSlope = 0;
    if (!sample.isRiver && !sample.isLake && Math.abs(fields.continentalness) <= COAST_CONTINENTAL_BAND) {
      coastal = true;
      const xM = wx * BLOCK_SIZE_M, zM = wz * BLOCK_SIZE_M;
      const east = this.climate.fields(xM + COAST_PROBE_M, zM), west = this.climate.fields(xM - COAST_PROBE_M, zM);
      const north = this.climate.fields(xM, zM + COAST_PROBE_M), south = this.climate.fields(xM, zM - COAST_PROBE_M);
      exposure = waveExposure(east.continentalness - west.continentalness, north.continentalness - south.continentalness);
      coastSlope = Math.hypot(heightMeters(east) - heightMeters(west), heightMeters(north) - heightMeters(south)) / (2 * COAST_PROBE_M);
      if (exposure >= COAST_EXPOSED && fields.erosion < 0) ampM *= 1 + exposure * 2;
      if (exposure < 0.35 && sample.offsetM > -3 && sample.offsetM < 0)
        offsetM += COAST_SANDBAR_RISE_M * Math.max(0, this.rockNoise(xM / COAST_SANDBAR_SCALE_M, zM / COAST_SANDBAR_SCALE_M));
    }
    return { offsetM, ampM, exposure, coastal, coastSlope };
  }

  /** Climate at a block, for the F3 overlay: temperature (°C), precipitation (mm a year) and the biome's name. */
  climateAt(wx: number, wy: number, wz: number): { temperatureC: number; precipitationMm: number; biome: string } {
    const fields = this.climate.fields(wx * BLOCK_SIZE_M, wz * BLOCK_SIZE_M);
    const sample = this.regions.sample(wx, wz);
    const amp = this.amplitudeAt(wx, wz);
    return {
      temperatureC: blockTemperature(fields, wy * BLOCK_SIZE_M),
      precipitationMm: blockPrecipitation(fields, amp, sample.moisture),
      biome: biomeName(this.biomeKeyAt(wx, wz)),
    };
  }

  /** The biome key of the actual surface cell (wx, wz). */
  biomeKeyAt(wx: number, wz: number): string {
    const cx = floorDiv(wx, CHUNK_SIZE), cz = floorDiv(wz, CHUNK_SIZE);
    return this.column(cx, cz).biomeKeys[columnIndex(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE)]!;
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
        const coast = column.coastMaterials[i]!;
        const surface = coast || (soil ? (beach ? BlockId.SAND :
          (column.surfaces[i] ||= this.surfaceAt(wx, wz, column.biomeKeys[i]!))) : BlockId.AIR);
        // Plants only grow on grass, so beaches, deserts and bare rock stay bare.
        // Water level: the sea, or a lake or river surface from the region simulation. A riverbed
        // or lakebed is sand or gravel, not grass.
        const waterY = Math.max(SEA_LEVEL, Math.floor(metersToBlocks(column.waterLevels[i]!)));
        const waterTable = column.waterTables[i]!;
        const submerged = h < waterY;
        const bed = column.waterBodies[i] === 1 ? riverbedMaterial(this.seed, wx, wz) : coast || BlockId.SAND;
        const plant = !submerged && surface === BlockId.GRASS && inSlice ? this.plantAt(wx, wz, h, column.biomeKeys[i]!) : BlockId.AIR;
        const reed = !submerged ? this.reedHeight(wx, wz, h, surface, waterY) : 0;
        const temperature = column.temperatures[i]!;
        const damp = dampClimate(temperature, column.precipitation[i]!);
        const lily = lilyPadAt(this.seed, wx, wz, waterY - h, column.waterBodies[i] === 2, temperature);
        const moss = !submerged && !soil && !coast && !this.isCave(wx, h, wz, h) &&
          mossAt(this.seed, wx, wz, damp) &&
          (this.getHeight(wx - 1, wz) > h || this.getHeight(wx, wz - 1) > h);
        for (let y = y0; y < y1; y++) {
          let id: number;
          if (this.density.isSolid(wx, y, wz, offsetM, ampM)) {
            if ((soil || coast) && y === h) {
              // Rivers carry patches of clay, gravel and sand; lake/ocean beds retain sand.
              id = submerged ? bed : surface;
              if (id === BlockId.GRASS && !beach) {
                this.onGrassPlaced?.(wx, y, wz);
              }
            } else if ((soil || coast) && y >= h - SOIL_DEPTH) {
              id = coast || (submerged ? bed : beach ? BlockId.SAND : soilBlock(column.biomeKeys[i]!));
            } else id = this.rockAt(y, warp);
          } else if (lily && y === waterY + 1) id = BlockId.LILY_PAD;
          else if (moss && y === h + 1) id = BlockId.MOSS;
          else if (y > h && y <= h + reed) id = BlockId.REED;
          else if (y === h + 1 && plant !== BlockId.AIR) id = plant;
          else {
            // Surface water retains its local level. Enclosed density voids use groundwater,
            // just like carved caves, so sea level does not flood every underground passage.
            const level = y <= h - SHORE_ROOF ? waterTable : waterY;
            id = y <= level ? BlockId.WATER : BlockId.AIR;
          }
          out[localIndex(lx, y - y0, lz)] = id;
        }
        const top = Math.min(this.caveTop(h, column.waterBodies[i] ? waterY : SEA_LEVEL), y1 - 1);
        for (let y = Math.max(TERRAIN_CHUNK_BOTTOM * CHUNK_SIZE + CAVE_BOTTOM_ROWS, y0); y <= top; y++) {
          if (this.isCave(wx, y, wz, h)) out[localIndex(lx, y - y0, lz)] = y <= waterTable ? BlockId.WATER : BlockId.AIR;
        }
      }
    }
    this.placeOres(column, cx, cz, y0, y1, out);
    this.pools.fill(cx, cz, y0, y1, out, (x, z) => this.getHeight(x, z));
    this.placeTrees(cx, cz, y0, y1, out);
    this.surfaceRegistry.evaluateAnchors(this.seed, cx * CHUNK_SIZE, (cx + 1) * CHUNK_SIZE,
      cz * CHUNK_SIZE, (cz + 1) * CHUNK_SIZE, y0, y1, b => {
        const i = localIndex(b.x - cx * CHUNK_SIZE, b.y - y0, b.z - cz * CHUNK_SIZE);
        if (out[i] === BlockId.AIR || getBlockDef(out[i]!).shape !== 'cube') out[i] = b.state;
      });
  }

  /**
   * The column's cells: the region simulation's surface, the density inputs and the highest solid
   * block. Cached, because the region simulation and the fields cost real work per cell and every
   * chunk of a column reads them.
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
      waterLevels: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
      waterBodies: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      waterTables: new Int32Array(CHUNK_SIZE * CHUNK_SIZE),
      coastMaterials: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE),
      biomeKeys: new Array<string>(CHUNK_SIZE * CHUNK_SIZE),
      surfaces: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE),
      temperatures: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
      precipitation: new Float64Array(CHUNK_SIZE * CHUNK_SIZE),
    };
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = columnIndex(lx, lz);
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const fields = this.climate.fields(wx * BLOCK_SIZE_M, wz * BLOCK_SIZE_M);
        // The region's surface replaces the raw shape height: it already carries erosion,
        // river channels and lake basins.
        const sample = this.regions.sample(wx, wz);
        const p = this.surfaceParameters(wx, wz, fields, sample);
        column.offsets[i] = p.offsetM; column.amps[i] = p.ampM;
        column.warp[i] = this.rockNoise((wx * BLOCK_SIZE_M) / GEOLOGY_WARP_M, (wz * BLOCK_SIZE_M) / GEOLOGY_WARP_M);
        column.waterLevels[i] = sample.waterLevelM;
        column.waterBodies[i] = sample.isRiver ? 1 : sample.isLake ? 2 : 0;
        column.solidTop[i] = this.solidTop(wx, wz, column.offsets[i]!, column.amps[i]!);
        if (p.coastal) column.coastMaterials[i] = coastProfile(column.solidTop[i]! * BLOCK_SIZE_M,
          Math.max(p.coastSlope, column.amps[i]! / 16), p.exposure).material;
        const heightM = column.solidTop[i]! * BLOCK_SIZE_M;
        column.temperatures[i] = blockTemperature(fields, heightM);
        column.precipitation[i] = blockPrecipitation(fields, column.amps[i]!, sample.moisture);
        column.biomeKeys[i] = biomeAt(column.temperatures[i]!, column.precipitation[i]!,
          heightM, column.amps[i]!, false, fields.weirdness).key;
        column.waterTables[i] = this.aquifers.waterTableAt(wx, wz, column.solidTop[i]!);
      }
    this.columnCache.set(key, column);
    return column;
  }

  /** Pure terrain facts used by feature builders; no generated chunk or neighbour load order. */
  private surfaceSite(x: number, z: number): SurfaceSite {
    const cx = floorDiv(x, CHUNK_SIZE), cz = floorDiv(z, CHUNK_SIZE), column = this.column(cx, cz);
    const i = columnIndex(x - cx * CHUNK_SIZE, z - cz * CHUNK_SIZE), height = column.solidTop[i]!;
    const waterY = Math.max(SEA_LEVEL, Math.floor(metersToBlocks(column.waterLevels[i]!)));
    return { height, waterY, biome: column.biomeKeys[i]!, rock: this.rockAt(height, column.warp[i]!),
      dry: height > waterY + BEACH_BAND && !column.coastMaterials[i] && !this.isCave(x, height, z, height),
      damp: dampClimate(column.temperatures[i]!, column.precipitation[i]!) };
  }

  /** Blend toward the nearest real biome boundary, independent of chunk edges. */
  private surfaceAt(x: number, z: number, own: string): number {
    const base = surfaceBlock(own, false);
    for (let d = 1; d <= BIOME_BLEND_BLOCKS; d++) {
      for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const other = this.biomeKeyAt(x + dx!, z + dz!);
        if (other !== own && surfaceBlock(other, false) !== base)
          return blendSurfaceBlocks(base, surfaceBlock(other, false), x, z,
            (BIOME_BLEND_BLOCKS + 1 - d) / (2 * BIOME_BLEND_BLOCKS));
      }
    }
    return base;
  }

  /** The region simulation's view of one column: rivers, lakes and moisture. */
  sampleColumn(wx: number, wz: number): ColumnSample {
    return this.regions.sample(wx, wz);
  }

  /** The simulated region containing a world column, for tests and the debug map. */
  regionAt(wx: number, wz: number): RegionData {
    return this.regions.regionAt(wx, wz);
  }

  /** Cells across one simulated region grid, including the margins. */
  static get regionCells(): number {
    return REGION_CELLS;
  }

  /** How many simulated regions are cached. Used by tests and the F3 overlay. */
  get cachedRegions(): number {
    return this.regions.cachedRegions;
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
  private plantAt(wx: number, wz: number, h: number, biome: string): number {
    if (this.isCave(wx, h, wz, h)) return BlockId.AIR;
    return groundCoverAt(this.seed, wx, wz, biome);
  }

  /** Dry banks beside actual generated surface water; evaluate whole plants before slicing into chunks. */
  private reedHeight(x: number, z: number, h: number, ground: number, waterY: number): number {
    if (!REED_GROUNDS.has(ground) ||
        h > waterY + roundBlocks(REED_BANK_HEIGHT_M) || hash2(this.seed + 1200, x, z) >= REED_CHANCE || this.isCave(x, h, z, h)) return 0;
    const bank = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
      const nx = x + dx!, nz = z + dz!, sample = this.regions.sample(nx, nz);
      return this.getHeight(nx, nz) < Math.max(SEA_LEVEL, Math.floor(metersToBlocks(sample.waterLevelM)));
    });
    if (!bank) return 0;
    return roundBlocks(REED_MIN_HEIGHT_M + hash2(this.seed + 1201, x, z) * (REED_MAX_HEIGHT_M - REED_MIN_HEIGHT_M));
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
   * The highest cell of a column that caves may carve. Cheese caverns, noodle tunnels, spaghetti tubes and ravines
   * all stop here. Under beaches, lakes and the sea the top few blocks are never carved, so water never sits above a
   * cave opening (specs 14, 45).
   */
  private caveTop(h: number, waterY = SEA_LEVEL): number {
    return h <= waterY + SHORE_CAVE_BAND ? h - SHORE_ROOF : h;
  }

  /** True when a cave system carves this cell (spec 45). `surfaceBlocks` is the column's highest solid block. */
  private isCave(wx: number, y: number, wz: number, surfaceBlocks: number): boolean {
    return caveKind(this.caves, wx, y, wz, surfaceBlocks) !== null;
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
    // Trees need intact soil; riparian species and desert cacti have explicit habitat exceptions.
    const amp = this.amplitudeAt(anchorX, anchorZ);
    if (amp >= BARE_ROCK_AMP_M) return null; // no trees on bare rock

    // Species comes from the column's biome, from real temperature and precipitation (height in
    // metres). Precipitation uses the region's advected moisture, matching the biome lookup.
    const fields = this.climate.fields(anchorX * BLOCK_SIZE_M, anchorZ * BLOCK_SIZE_M);
    const heightM = h * BLOCK_SIZE_M;
    const sample = this.regions.sample(anchorX, anchorZ);
    const temperature = blockTemperature(fields, heightM);
    const precipitation = blockPrecipitation(fields, amp, sample.moisture);
    const waterY = Math.max(SEA_LEVEL, Math.floor(metersToBlocks(sample.waterLevelM)));
    if (h >= 2 && h <= this.caveTop(h, sample.isRiver || sample.isLake ? waterY : SEA_LEVEL) && this.isCave(anchorX, h, anchorZ, h)) return null;
    const riparian = riparianTreeSpecies(temperature, precipitation, waterY - h, sample.isRiver || sample.isLake);
    if (riparian) return riparian;
    const cx = floorDiv(anchorX, CHUNK_SIZE), cz = floorDiv(anchorZ, CHUNK_SIZE);
    if (this.column(cx, cz).coastMaterials[columnIndex(anchorX - cx * CHUNK_SIZE, anchorZ - cz * CHUNK_SIZE)]) return null;
    // Ordinary trees and cacti cannot grow below the waterline or on the beach band.
    if (h < waterY || h <= SEA_LEVEL + BEACH_BAND) return null;
    const biome = { key: this.biomeKeyAt(anchorX, anchorZ) };
    const species = treeSpecies(biome.key);
    // No tree where the biome grows none, and none on a surface that is not grass (sand, rock).
    if (!species || (surfaceBlock(biome.key, false) !== BlockId.GRASS && species !== 'saguaro')) return null;
    // Biomes that name a secondary species mix it in on a share of the anchors (task T-E11), deterministically.
    return anchorSpecies(species, secondarySpecies(biome.key), this.seed, anchorX, anchorZ);
  }

  /**
   * Place a tree rooted at anchor (anchorX, anchorZ). The hash check reproduces the
   * old per-block anchor selection exactly. The species comes from the column's biome.
   */
  private placeTreeFromAnchor(seed: number, anchorX: number, anchorZ: number, emit: (block: FeatureBlock) => void): void {
    if (hash2(seed, anchorX, anchorZ) >= TREE_CHANCE) return;
    const key = columnKey(anchorX, anchorZ);
    let blocks = this.treeCache.get(key);
    if (!blocks) {
      const species = this.treeSpeciesAt(anchorX, anchorZ);
      blocks = species ? treeBlocks(seed, anchorX, this.getHeight(anchorX, anchorZ), anchorZ, species)
        .map(b => ({ x: b.x, y: b.y, z: b.z, state: b.id })) : [];
      if (this.treeCache.size >= COLUMN_CACHE_LIMIT) this.treeCache.clear();
      this.treeCache.set(key, blocks);
    }
    blocks.forEach(emit);
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
