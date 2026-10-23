import { BLOCK_SIZE_M, SEA_LEVEL_M } from '../config';
import { clamp } from '../core/math';
import { type ClimateFields, heightMeters } from './shape';

/**
 * Region simulation (spec 41, phase 2 item 3).
 *
 * The world is split into square regions. Each is simulated once on a coarse grid through the
 * standard hydrology pipeline: fill depressions, route water downhill, accumulate catchment,
 * erode, then derive lakes, rivers and moisture from the result.
 *
 * Everything here is pure and three-free. `simulateRegion` is a pure function of the height
 * source and the region index, so a cached region always equals a fresh one.
 */

// ---- Grid geometry ----

/** Edge of one coarse cell, in blocks. Also the flow-routing neighbourhood scale. */
export const REGION_CELL_BLOCKS = 32;
/** Cells across a region's core (the part it owns). */
export const REGION_CORE_CELLS = 128;
/** Cells of overlap on every side: simulated but not owned, so edges do not depend on the boundary. */
export const REGION_MARGIN_CELLS = 32;
/** Cells across the simulated grid, core plus both margins. */
export const REGION_CELLS = REGION_CORE_CELLS + REGION_MARGIN_CELLS * 2;
/** Blocks across a region core: 128 * 32 = 4096 blocks (1228.8 m). */
export const REGION_CORE_BLOCKS = REGION_CORE_CELLS * REGION_CELL_BLOCKS;
/** Blocks from the simulated grid centre out to its edge. */
export const REGION_HALF_BLOCKS = (REGION_CELLS / 2) * REGION_CELL_BLOCKS;
/** Metres per coarse cell. */
export const REGION_CELL_M = REGION_CELL_BLOCKS * BLOCK_SIZE_M;

const CELL_COUNT = REGION_CELLS * REGION_CELLS;
const LAST = REGION_CELLS - 1;

/** The eight neighbours, in a fixed order: four orthogonal then four diagonal. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DZ = [0, 0, 1, -1, 1, -1, 1, -1] as const;
/** Distance to each neighbour's centre, in cells. Used for D8 slope. */
const DIST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const;

// ---- Hydrology and erosion constants ----

/** Stream-power coefficient. Larger cuts deeper. */
const EROSION_K = 0.02;
/** Stream-power discharge exponent. 0.4 is the literature value for real basins. */
const EROSION_M = 0.4;
/** Stream-power slope exponent. */
const EROSION_N = 1;
/** Ceiling on total incision below the filled surface, in metres. */
const MAX_INCISION_M = 30;
/** Fraction of the over-steep excess that slides per thermal pass. */
const THERMAL_RATE = 0.3;
/** Angle of repose as a slope (rise over run). Steeper than this, material moves. */
const TALUS_SLOPE = 0.8;
/** Fill above the real surface that turns a cell into lake, in metres. */
const LAKE_MIN_DEPTH_M = 1.5;
/**
 * Rise given to each cell by depression filling, in metres. It must be small enough to be
 * invisible and large enough that no two cells tie (see `priorityFlood`).
 */
const FILL_EPSILON = 1e-3;
/** Catchment size, in cells, above which a cell carries a river. */
const RIVER_THRESHOLD = 300;
/** Widest a river gets, in metres. */
const RIVER_MAX_WIDTH_M = 30;
/** Deepest a river cuts, in metres. */
const RIVER_MAX_DEPTH_M = 8;

/** Prevailing wind as a unit vector: westerlies, blowing east and slightly south. */
const WIND_X = 0.82;
const WIND_Z = -0.57;
/** How far upwind a cell reads moisture from, in cells. */
const MOISTURE_LOOKUP = 6;
/** Moisture lost per lookup, so far inland it dries out. */
const MOISTURE_DECAY = 0.05;
/** Orographic drying per metre of climb: air wrings out on the windward face of a range. */
const MOISTURE_OROGRAPHIC_PER_M = 0.01;

// ---- Types ----

/** What the simulation produces for one coarse cell. */
export interface RegionData {
  /** Base height from the climate fields, before anything else. Metres. */
  baseHeight: Float32Array;
  /** Height after depression filling. >= baseHeight everywhere. Metres. */
  filledHeight: Float32Array;
  /** Final surface: filled, eroded, then cut by river channels. Metres. */
  height: Float32Array;
  /** Catchment area draining through each cell, in cells. */
  flow: Float32Array;
  /** Downstream cell index, or -1 at an outlet. */
  downstream: Int32Array;
  /** 1 where a river channel runs. */
  river: Uint8Array;
  /** Channel depth below the surrounding land, in metres. */
  riverDepth: Float32Array;
  /** Channel width, in metres. */
  riverWidth: Float32Array;
  /** Unit flow direction where a river runs, (0, 0) elsewhere. */
  flowX: Float32Array;
  flowZ: Float32Array;
  /** Lake surface height in metres, or -Infinity where there is no lake. */
  lakeLevel: Float32Array;
  /** 1 inside a lake. */
  lake: Uint8Array;
  /** Advected moisture, 0..1. */
  moisture: Float32Array;
}

/** The height sampling the simulation needs, injected so tests can drive it with a known surface. */
export interface HeightSource {
  /** Surface height in metres at a world position given in metres. */
  height(xM: number, zM: number): number;
}

/** Builds a height source from climate fields, so the simulation starts from the generator's surface. */
export function climateHeightSource(fields: (xM: number, zM: number) => ClimateFields): HeightSource {
  return { height: (xM, zM) => heightMeters(fields(xM, zM)) };
}

// ---- Sampling ----

/** What one block column reads out of the simulation. Heights and distances in metres. */
export interface ColumnSample {
  /** Surface offset after erosion and river carving: the new base for the 3D density. */
  offsetM: number;
  /** Channel depth below the surrounding land, or 0 outside a channel. */
  riverDepthM: number;
  /** Channel width. */
  riverWidthM: number;
  /** Unit flow direction inside a channel, (0, 0) elsewhere. */
  flowX: number;
  flowZ: number;
  /**
   * Water surface height for this column: the sea, a lake's level, a river's own level, or the
   * ground height where the column is dry. The generator fills water up to here.
   */
  waterLevelM: number;
  /** Advected moisture, 0..1. */
  moisture: number;
  /** True where the column is inside a lake basin. */
  isLake: boolean;
  /** True where the column is inside a river channel. */
  isRiver: boolean;
}

/** Fraction of a channel's depth that water fills. Real rivers are not brim-full. */
const RIVER_FILL = 0.8;

/** Bilinear read of a coarse field at a fractional cell coordinate, clamped to the grid. */
function bilinear(field: Float32Array, fx: number, fz: number): number {
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const xa = Math.min(LAST, Math.max(0, x0));
  const xb = Math.min(LAST, Math.max(0, x0 + 1));
  const za = Math.min(LAST, Math.max(0, z0));
  const zb = Math.min(LAST, Math.max(0, z0 + 1));
  const a = field[idx(xa, za)]!;
  const b = field[idx(xb, za)]!;
  const c = field[idx(xa, zb)]!;
  const d = field[idx(xb, zb)]!;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Clamps a coarse-cell coordinate to a valid index cell. */
function clampCell(f: number): number {
  return Math.min(LAST, Math.max(0, Math.round(f)));
}

/**
 * Owns the region cache and upsamples the coarse grid to block columns.
 *
 * The cache is a cache in the strict sense: dropping every region changes nothing about the
 * values a given column reads, which is the determinism rule the roadmap requires.
 */
export class RegionSampler {
  private readonly cache = new Map<string, RegionData>();

  constructor(
    private readonly source: HeightSource,
    private readonly cacheLimit = 6,
  ) {}

  /** The simulated region containing a world column, computing it if needed. */
  regionAt(wx: number, wz: number): RegionData {
    return this.region(regionIndexOf(wx), regionIndexOf(wz));
  }

  /** The simulated region (regionX, regionZ), computing it if needed. */
  region(regionX: number, regionZ: number): RegionData {
    const key = `${regionX},${regionZ}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const data = simulateRegion(this.source, regionX, regionZ);
    if (this.cache.size >= this.cacheLimit) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, data);
    return data;
  }

  /** How many regions are resident. Useful for tests and the F3 overlay. */
  get cachedRegions(): number {
    return this.cache.size;
  }

  /** Drops every region. Values are unchanged; only the cost of the next read rises. */
  clear(): void {
    this.cache.clear();
  }

  /** The simulation's view of one block column. */
  sample(wx: number, wz: number): ColumnSample {
    const rx = regionIndexOf(wx);
    const rz = regionIndexOf(wz);
    const region = this.region(rx, rz);
    const originX = rx * REGION_CORE_BLOCKS - REGION_HALF_BLOCKS;
    const originZ = rz * REGION_CORE_BLOCKS - REGION_HALF_BLOCKS;
    // Fractional coarse-cell coordinate. Grid cell k covers the world block at origin + k * CELL,
    // so no margin shift belongs here: the core is simply the middle of the grid.
    const fx = (wx - originX) / REGION_CELL_BLOCKS;
    const fz = (wz - originZ) / REGION_CELL_BLOCKS;
    const i = idx(clampCell(fx), clampCell(fz));

    const isRiver = region.river[i] === 1;
    const isLake = region.lake[i] === 1;
    const isRiverOrLake = isRiver || isLake;
    const riverDepthM = isRiver ? region.riverDepth[i]! : 0;
    const riverWidthM = isRiver ? region.riverWidth[i]! : 0;
    const flowX = isRiver ? region.flowX[i]! : 0;
    const flowZ = isRiver ? region.flowZ[i]! : 0;

    // Open ground interpolates, because it is smooth. A channel or a basin takes the nearest
    // cell's height: interpolating across a lake would pull the bed up toward its banks and
    // drain it, and across a channel it would fill the trough back in.
    const offsetM = isRiverOrLake ? region.height[i]! : bilinear(region.height, fx, fz);
    const moisture = bilinear(region.moisture, fx, fz);

    // Water: the sea, or a lake's level, or a river's own surface inside its channel.
    let waterLevelM = SEA_LEVEL_M;
    if (isLake) waterLevelM = Math.max(waterLevelM, region.lakeLevel[i]!);
    if (riverDepthM > 0) waterLevelM = Math.max(waterLevelM, offsetM + riverDepthM * RIVER_FILL);

    return { offsetM, riverDepthM, riverWidthM, flowX, flowZ, waterLevelM, moisture, isLake, isRiver };
  }
}

/** Regions are centred on multiples of CORE_BLOCKS; ownership is their middle core. */
export function regionIndexOf(wx: number): number {
  return Math.floor((wx + REGION_CORE_BLOCKS / 2) / REGION_CORE_BLOCKS);
}

// ---- Simulation ----

/**
 * Runs the full pipeline over one region. `regionX`/`regionZ` index regions on the core grid;
 * cell (0, 0) of the simulated grid is the far corner of the margin.
 */
export function simulateRegion(source: HeightSource, regionX: number, regionZ: number): RegionData {
  const baseHeight = new Float32Array(CELL_COUNT);
  const filledHeight = new Float32Array(CELL_COUNT);
  const height = new Float32Array(CELL_COUNT);
  const flow = new Float32Array(CELL_COUNT);
  const river = new Uint8Array(CELL_COUNT);
  const riverDepth = new Float32Array(CELL_COUNT);
  const riverWidth = new Float32Array(CELL_COUNT);
  const flowX = new Float32Array(CELL_COUNT);
  const flowZ = new Float32Array(CELL_COUNT);
  const lakeLevel = new Float32Array(CELL_COUNT);
  const lake = new Uint8Array(CELL_COUNT);
  const moisture = new Float32Array(CELL_COUNT);
  lakeLevel.fill(-Infinity);

  const originX = regionX * REGION_CORE_BLOCKS - REGION_HALF_BLOCKS;
  const originZ = regionZ * REGION_CORE_BLOCKS - REGION_HALF_BLOCKS;

  // 1. Base surface from the climate fields.
  for (let cz = 0; cz < REGION_CELLS; cz++)
    for (let cx = 0; cx < REGION_CELLS; cx++) {
      baseHeight[idx(cx, cz)] = source.height(
        (originX + cx * REGION_CELL_BLOCKS) * BLOCK_SIZE_M,
        (originZ + cz * REGION_CELL_BLOCKS) * BLOCK_SIZE_M,
      );
    }

  // 2. Priority-flood depression filling: no interior pits.
  priorityFlood(baseHeight, filledHeight);

  // 3-4. Flow routing on the filled surface, then catchment accumulation.
  const downstream = routeFlow(filledHeight);
  const order = descendingOrder(filledHeight);
  accumulateFlow(downstream, order, flow);

  // 5. Erosion, starting from the filled surface so channels have somewhere to go.
  height.set(filledHeight);
  erodeStreamPower(height, flow);
  erodeThermal(height);

  // 6. Lakes: where filling raised the surface above the real one, water stands.
  //
  //    The level is taken from the basin's *outlet*, not from each cell's own fill. Priority
  //    flood adds an epsilon at every step of its walk, so two cells in one basin differ by a
  //    few hundredths of a millimetre; reading each cell's own fill would give a basin a very
  //    slight slope instead of a flat surface. Every cell of a basin drains to the same outlet,
  //    so this gives one exact level per basin.
  markLakes(baseHeight, filledHeight, downstream, lake, lakeLevel);
  // Flood filling routes drainage; it must not replace a lake basin with solid rock.
  for (let i = 0; i < CELL_COUNT; i++) if (lake[i]) height[i] = Math.min(height[i]!, baseHeight[i]!);

  // 7. Rivers along the drainage network. Lakes are skipped: a channel cut through a lake would
  //    drain it, and the lake's own outlet already carries the flow onward.
  carveRivers(height, flow, downstream, lake, river, riverDepth, riverWidth, flowX, flowZ);

  // 8. Moisture advection along the prevailing wind.
  advectMoisture(baseHeight, moisture);

  return {
    baseHeight,
    filledHeight,
    height,
    flow,
    downstream,
    river,
    riverDepth,
    riverWidth,
    flowX,
    flowZ,
    lakeLevel,
    lake,
    moisture,
  };
}

function idx(cx: number, cz: number): number {
  return cz * REGION_CELLS + cx;
}

/**
 * Priority-flood depression filling (Barnes, Lehman and Mulla 2014).
 *
 * A binary heap pops the lowest cell; every unvisited neighbour is filled to at least the popped
 * cell's level plus `FILL_EPSILON`, then pushed. Cells on the grid edge are seeded as outlets
 * and keep their own height. The result has no interior pits, which is what makes rivers
 * continuous instead of ponding in noise.
 *
 * The epsilon matters: without it two cells that both sit exactly at the spill level tie, neither
 * is strictly lower than the other, and both become outlets. That leaves thousands of
 * one-cell "lakes" scattered through the flat parts of the map.
 */
export function priorityFlood(base: Float32Array, filled: Float32Array): void {
  const visited = new Uint8Array(CELL_COUNT);
  const heap = new MinHeap();
  const seed = (cx: number, cz: number): void => {
    const i = idx(cx, cz);
    if (visited[i]) return;
    visited[i] = 1;
    filled[i] = base[i]!;
    heap.push(i, filled[i]!);
  };
  for (let c = 0; c < REGION_CELLS; c++) {
    seed(0, c);
    seed(LAST, c);
    seed(c, 0);
    seed(c, LAST);
  }

  while (heap.size > 0) {
    const i = heap.pop();
    const cx = i % REGION_CELLS;
    const cz = (i / REGION_CELLS) | 0;
    const level = filled[i]! + FILL_EPSILON;
    for (let n = 0; n < 8; n++) {
      const nx = cx + DX[n]!;
      const nz = cz + DZ[n]!;
      if (nx < 0 || nz < 0 || nx >= REGION_CELLS || nz >= REGION_CELLS) continue;
      const j = idx(nx, nz);
      if (visited[j]) continue;
      visited[j] = 1;
      filled[j] = Math.max(base[j]!, level);
      heap.push(j, filled[j]!);
    }
  }
}

/**
 * D8 flow routing on a surface: each cell drains to the lowest of its eight neighbours.
 * A cell with no lower neighbour is an outlet and gets -1.
 */
export function routeFlow(surface: Float32Array): Int32Array {
  const downstream = new Int32Array(CELL_COUNT).fill(-1);
  for (let cz = 0; cz < REGION_CELLS; cz++)
    for (let cx = 0; cx < REGION_CELLS; cx++) {
      const i = idx(cx, cz);
      let best = -1;
      let bestH = surface[i]!;
      for (let n = 0; n < 8; n++) {
        const nx = cx + DX[n]!;
        const nz = cz + DZ[n]!;
        if (nx < 0 || nz < 0 || nx >= REGION_CELLS || nz >= REGION_CELLS) continue;
        const j = idx(nx, nz);
        if (surface[j]! < bestH) {
          bestH = surface[j]!;
          best = j;
        }
      }
      downstream[i] = best;
    }
  return downstream;
}

/** Cell indices sorted by height, highest first. */
export function descendingOrder(surface: Float32Array): Int32Array {
  const order = new Int32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) order[i] = i;
  // A typed array cannot be sorted directly with a comparator, so copy out and back.
  const arr = Array.from(order);
  arr.sort((a, b) => surface[b]! - surface[a]! || a - b);
  for (let i = 0; i < CELL_COUNT; i++) order[i] = arr[i]!;
  return order;
}

/**
 * Flow accumulation: every cell starts with one unit of catchment and passes it downstream.
 * `order` is highest first, so a cell always receives its whole upstream contribution before it
 * passes its own on. That ordering is what makes this exact rather than iterative.
 */
export function accumulateFlow(downstream: Int32Array, order: Int32Array, flow: Float32Array): void {
  flow.fill(1);
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const d = downstream[i]!;
    if (d >= 0) flow[d] = flow[d]! + flow[i]!;
  }
}

/**
 * Stream-power incision, `E = K * A^m * S^n`, in one pass. Only the drainage network erodes,
 * since cells below the flow threshold carry almost no water. Nothing is cut more than
 * `MAX_INCISION_M` below the surface it started from.
 */
export function erodeStreamPower(height: Float32Array, flow: Float32Array): void {
  const start = Float32Array.from(height);
  for (let cz = 0; cz < REGION_CELLS; cz++)
    for (let cx = 0; cx < REGION_CELLS; cx++) {
      const i = idx(cx, cz);
      const a = flow[i]!;
      if (a < RIVER_THRESHOLD) continue;
      const slope = maxSlope(height, cx, cz) / REGION_CELL_M;
      if (slope <= 0) continue;
      const drop = EROSION_K * Math.pow(a, EROSION_M) * Math.pow(slope, EROSION_N);
      height[i] = Math.max(height[i]! - drop, start[i]! - MAX_INCISION_M);
    }
}

/**
 * Steepest-descent slope at a cell, rise over run. Distances use D8, so a diagonal neighbour is
 * sqrt(2) cells away and its drop counts for less. Zero at a flat cell or at the grid edge.
 */
function maxSlope(height: Float32Array, cx: number, cz: number): number {
  const h = height[idx(cx, cz)]!;
  let best = 0;
  for (let n = 0; n < 8; n++) {
    const nx = cx + DX[n]!;
    const nz = cz + DZ[n]!;
    if (nx < 0 || nz < 0 || nx >= REGION_CELLS || nz >= REGION_CELLS) continue;
    const s = (h - height[idx(nx, nz)]!) / DIST[n]!;
    if (s > best) best = s;
  }
  return best;
}

/** Greatest drop to any neighbour, in metres. */
function maxDrop(height: Float32Array, cx: number, cz: number): number {
  const h = height[idx(cx, cz)]!;
  let best = 0;
  for (let n = 0; n < 8; n++) {
    const nx = cx + DX[n]!;
    const nz = cz + DZ[n]!;
    if (nx < 0 || nz < 0 || nx >= REGION_CELLS || nz >= REGION_CELLS) continue;
    const drop = h - height[idx(nx, nz)]!;
    if (drop > best) best = drop;
  }
  return best;
}

/**
 * Thermal (talus) erosion: any slope past the angle of repose sheds part of its excess to the
 * steepest downhill neighbour. This is what turns noise spikes into believable scree slopes.
 * Each cell only donates, so a pass cannot move material into a cell that is also giving.
 */
export function erodeThermal(height: Float32Array, passes = 4): void {
  const delta = new Float32Array(CELL_COUNT);
  for (let p = 0; p < passes; p++) {
    delta.fill(0);
    for (let cz = 0; cz < REGION_CELLS; cz++)
      for (let cx = 0; cx < REGION_CELLS; cx++) {
        const i = idx(cx, cz);
        const drop = maxDrop(height, cx, cz);
        const slope = drop / REGION_CELL_M;
        if (slope <= TALUS_SLOPE) continue;
        const move = THERMAL_RATE * (drop - TALUS_SLOPE * REGION_CELL_M);
        delta[i] = delta[i]! - move;
        let best = -1;
        let bestDrop = 0;
        for (let n = 0; n < 8; n++) {
          const nx = cx + DX[n]!;
          const nz = cz + DZ[n]!;
          if (nx < 0 || nz < 0 || nx >= REGION_CELLS || nz >= REGION_CELLS) continue;
          const d = height[i]! - height[idx(nx, nz)]!;
          if (d > bestDrop) {
            bestDrop = d;
            best = idx(nx, nz);
          }
        }
        if (best >= 0) delta[best] = delta[best]! + move;
      }
    for (let i = 0; i < CELL_COUNT; i++) height[i] = height[i]! + delta[i]!;
  }
}

/**
 * Lakes: a cell is a lake where depression filling raised the surface above the real one by more
 * than `LAKE_MIN_DEPTH_M`, and the basin spills above sea level (below it the cell is already sea).
 *
 * The level is the fill height at the basin's *spill point* — the last cell before the chain
 * leaves the filled basin. That is the height at which the basin fills and starts to spill, so it
 * is the only correct surface. Reading the cell's own fill instead drifts by the epsilon priority
 * flood adds at each step, and reading the drainage path's exit is worse still: that walks on to
 * the sea, which would put every lake in the world at sea level.
 */
export function markLakes(
  base: Float32Array,
  filled: Float32Array,
  downstream: Int32Array,
  lake: Uint8Array,
  level: Float32Array,
): void {
  const spillOf = new Int32Array(CELL_COUNT);
  spillOf.fill(-2); // -2 = not walked yet
  for (let i = 0; i < CELL_COUNT; i++) {
    if (filled[i]! - base[i]! <= LAKE_MIN_DEPTH_M) continue;
    const spill = findSpill(i, base, filled, downstream, spillOf);
    const lvl = filled[spill]!;
    if (lvl <= SEA_LEVEL_M) continue;
    lake[i] = 1;
    level[i] = lvl;
  }
}

/**
 * The last cell of the basin a cell belongs to, walking `downstream` while the chain is still
 * filled above the real surface. Memoised, and bounded so a corrupt grid cannot hang the worker.
 */
function findSpill(
  start: number,
  base: Float32Array,
  filled: Float32Array,
  downstream: Int32Array,
  memo: Int32Array,
): number {
  const path: number[] = [];
  let i = start;
  for (;;) {
    const known = memo[i]!;
    if (known !== -2) {
      for (const p of path) memo[p] = known;
      return known;
    }
    const d = downstream[i]!;
    const leavesBasin = d < 0 || filled[d]! - base[d]! <= LAKE_MIN_DEPTH_M;
    if (leavesBasin || path.length > CELL_COUNT) {
      memo[i] = i;
      for (const p of path) memo[p] = i;
      return i;
    }
    path.push(i);
    i = d;
  }
}

/**
 * Rivers: cells whose catchment is large enough carry a channel. Width and depth grow with the
 * square root of flow, and the channel is cut below the surrounding land. The flow direction is
 * stored for phase 5's currents.
 */
export function carveRivers(
  height: Float32Array,
  flow: Float32Array,
  downstream: Int32Array,
  lake: Uint8Array,
  river: Uint8Array,
  depth: Float32Array,
  width: Float32Array,
  flowX: Float32Array,
  flowZ: Float32Array,
): void {
  for (let cz = 0; cz < REGION_CELLS; cz++)
    for (let cx = 0; cx < REGION_CELLS; cx++) {
      const i = idx(cx, cz);
      if (lake[i]) continue;
      const a = flow[i]!;
      if (a < RIVER_THRESHOLD) continue;
      // Square root of the excess catchment, scaled so a threshold river is about a metre deep
      // (three blocks) and a big one hits the depth cap.
      const s = Math.sqrt(a - RIVER_THRESHOLD) * 0.12;
      river[i] = 1;
      width[i] = Math.min(RIVER_MAX_WIDTH_M, s * REGION_CELL_M * 0.5);
      depth[i] = Math.min(RIVER_MAX_DEPTH_M, s);
      height[i] = height[i]! - depth[i]!;
      const d = downstream[i]!;
      if (d >= 0) {
        const vx = (d % REGION_CELLS) - cx;
        const vz = ((d / REGION_CELLS) | 0) - cz;
        const len = Math.hypot(vx, vz) || 1;
        flowX[i] = vx / len;
        flowZ[i] = vz / len;
      }
    }
}

/**
 * Moisture advection along the prevailing wind.
 *
 * Each cell reads the moisture `MOISTURE_LOOKUP` cells upwind and loses some in transit. The
 * loops march *downwind*, so every value read is already final; marching the wrong way reads
 * zeros. Ocean cells are always saturated. The result is that the windward slope of a range is
 * wet and the lee side is dry — a rain shadow, which is the whole reason for doing this instead
 * of reading a humidity noise field.
 */
export function advectMoisture(height: Float32Array, moisture: Float32Array): void {
  const stepX = WIND_X >= 0 ? 1 : -1;
  const stepZ = WIND_Z >= 0 ? 1 : -1;
  const startX = stepX > 0 ? 0 : LAST;
  const startZ = stepZ > 0 ? 0 : LAST;
  for (let cz = startZ; cz >= 0 && cz < REGION_CELLS; cz += stepZ)
    for (let cx = startX; cx >= 0 && cx < REGION_CELLS; cx += stepX) {
      const i = idx(cx, cz);
      const here = height[i]!;
      // Ocean is the moisture source and stays saturated.
      if (here <= SEA_LEVEL_M) {
        moisture[i] = 1;
        continue;
      }
      const px = cx - stepX * MOISTURE_LOOKUP;
      const pz = cz - stepZ * MOISTURE_LOOKUP;
      // Past the upwind edge, assume arriving air is as wet as it gets over open ocean.
      const m = px < 0 || pz < 0 || px >= REGION_CELLS || pz >= REGION_CELLS ? 1 : moisture[idx(px, pz)]!;
      // Climbing terrain wrings moisture out; descending terrain gets none back.
      const sx = Math.min(LAST, Math.max(0, px));
      const sz = Math.min(LAST, Math.max(0, pz));
      const climb = here - height[idx(sx, sz)]!;
      const orographic = climb > 0 ? 1 - MOISTURE_OROGRAPHIC_PER_M * climb : 1;
      moisture[i] = clamp(m * (1 - MOISTURE_DECAY) * orographic, 0, 1);
    }
}

// ---- Binary min-heap over cell indices ----

class MinHeap {
  private keys = new Float64Array(CELL_COUNT);
  private values = new Int32Array(CELL_COUNT);
  private count = 0;

  get size(): number {
    return this.count;
  }

  push(value: number, key: number): void {
    if (this.count >= this.keys.length) {
      this.keys = growF(this.keys);
      this.values = growI(this.values);
    }
    let i = this.count++;
    this.keys[i] = key;
    this.values[i] = value;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const top = this.values[0]!;
    this.count--;
    if (this.count > 0) {
      this.keys[0] = this.keys[this.count]!;
      this.values[0] = this.values[this.count]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.count && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.count && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a]!;
    this.keys[a] = this.keys[b]!;
    this.keys[b] = k;
    const v = this.values[a]!;
    this.values[a] = this.values[b]!;
    this.values[b] = v;
  }
}

function growF(a: Float64Array): Float64Array<ArrayBuffer> {
  const b = new Float64Array(a.length * 2);
  b.set(a);
  return b;
}

function growI(a: Int32Array): Int32Array<ArrayBuffer> {
  const b = new Int32Array(a.length * 2);
  b.set(a);
  return b;
}
