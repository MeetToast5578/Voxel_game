import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import {
  BARE_ROCK_AMP_M, BEACH_BAND_M, BIOME_JITTER_C, BIOME_JITTER_MM, BLOCK_SIZE_M, BOULDER_DENSITY_PER_M2, BOULDER_RADIUS_M, CHUNK_AREA, CHUNK_SIZE,
  COLUMN_CACHE, DEEP_SEA_FLOOR_M, DETAIL_H_M, DETAIL_V_M, FALLEN_LOG_DENSITY_PER_M2, FALLEN_LOG_MAX_M,
  FALLEN_LOG_MIN_M, FERN_CHANCE, FLOWER_CHANCE, LILY_PAD_CHANCE, MUSHROOM_CHANCE, REED_CHANCE, SEA_LEVEL_M, SECONDARY_TREE_CHANCE,
  SHORE_CAVE_BAND_M, SHORE_ROOF_CELLS, SOIL_DEPTH_M, SPAWN_SEARCH_M, TALL_GRASS_CHANCE, TREE_DENSITY_PER_M2, TREE_REACH_CELLS, cells,
} from '../config';
import { hash2, mulberry32 } from '../core/random';
import { BLOCKS, BLOCKS_SKY, FLUID_LEVELS } from '../engine/blocks';
import { biomeAt, biomeByIndex, biomeIndex, precipitationAt, temperatureAt } from './biomes';
import { ClimateSampler, detailAmpMeters, heightMeters } from './climate';
import { treeCells, unpackTreeCell, type TreeSpecies } from './trees';
import { Rivers, type WaterSample } from './rivers';
import { Underground } from './underground';

// Imported constants copied locally: hot loops then read a plain constant, not a module binding.
const N = CHUNK_SIZE;
const AREA = CHUNK_AREA;
const B = BLOCK_SIZE_M;
const S = (key: string) => BLOCKS.state(key);
const AIR = S('air'), STONE = S('stone'), DIRT = S('dirt'), GRASS = S('grass'), SAND = S('sand'), GRAVEL = S('gravel');
const WATER = S('water'), LOG = S('log'), LEAVES = S('leaves'), COBBLE = S('cobblestone'), CLAY = S('clay');
const REED = S('reed'), LILY = S('lily_pad'), LAVA = S('lava');
/** Flowing water at full level, resting and falling (variants: level - 1, plus FLUID_LEVELS when falling). */
const SPILL = BLOCKS.state('flowing_water', FLUID_LEVELS - 1), FALLING = BLOCKS.state('flowing_water', 2 * FLUID_LEVELS - 1);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** How far below an opened surface cell the cave floor is looked for. */
const OPENING_DEPTH_CELLS = 48;
const COVER = { tall: S('tall_grass'), fern: S('fern'), poppy: S('poppy'), dandelion: S('dandelion'),
  brown: S('brown_mushroom'), red: S('red_mushroom') };

/** Cells with y below this are under the sea. */
export const SEA_CELL = Math.round(SEA_LEVEL_M / B);
const SOIL_CELLS = cells(SOIL_DEPTH_M);
const BEACH_TOP_M = SEA_LEVEL_M + BEACH_BAND_M;
const DEEP_FLOOR_M = SEA_LEVEL_M - DEEP_SEA_FLOOR_M;
const TREE_CHANCE = TREE_DENSITY_PER_M2 * B * B;
const BOULDER_CHANCE = BOULDER_DENSITY_PER_M2 * B * B;
const LOG_CHANCE = FALLEN_LOG_DENSITY_PER_M2 * B * B;
const R = TREE_REACH_CELLS;

/** Generated data of one 16×16 column, shared by every chunk in it. Per-cell arrays are indexed z * 16 + x. */
export interface ColumnData {
  /** Highest solid terrain cell (not counting trees). */
  top: Int32Array;
  /** Highest cell that stops direct sunlight: ground, sea surface or tree. */
  skyTop: Int32Array;
  /** Temperature << 4 | humidity, each 0..15, for grass and leaf tint. */
  climate: Uint8Array;
  offset: Float32Array;
  amp: Float32Array;
  /** Surface block and the soil under it (stone where the ground is bare rock). */
  surface: Uint16Array;
  soil: Uint16Array;
  biome: Uint8Array;
  warp: Float32Array;
  /** Cells below this are water where open: the sea, or a river or lake surface. */
  water: Int32Array;
  /** 1 by a river or lake (reeds grow on its edge). */
  shore: Uint8Array;
  /** Whether the surface cell was opened by a cave. */
  open: Uint8Array;
  /** Tree and feature cells in this column: column index, y, state (flat triples). */
  features: Int32Array;
  minTop: number;
  /** Lowest cave floor seen through an opening in the surface, or Infinity where no cave opens it. */
  caveFloor: number;
  /** Highest terrain or feature cell. */
  maxTop: number;
}

type Base = Omit<ColumnData, 'skyTop' | 'features' | 'maxTop'> & { terrainMax: number };

const quantize = (v: number) => Math.max(0, Math.min(15, Math.round((v + 1) * 7.5)));
/** Leaves only grow into open air; logs and cacti also push through leaves and plants; anything replaces lily pads. */
const replaceableBy = (state: number, cell: number) =>
  cell === AIR || cell === LILY || (state !== LEAVES && (cell === LEAVES || BLOCKS.types[BLOCKS.typeIndex[cell]!]!.shape === 'cross'));

/**
 * Terrain from climate fields and 3D density, with biomes, bent rock strata, caves, ore veins, trees, ground cover,
 * boulders and fallen logs. Rivers, lakes and coasts come with the region model. Pure and deterministic per seed.
 */
export class Generator {
  private readonly climate: ClimateSampler;
  private readonly noise: NoiseFunction3D;
  readonly underground: Underground;
  private readonly bases = new Map<string, Base>();
  private readonly columns = new Map<string, ColumnData>();
  private readonly rivers: Rivers;
  private readonly horizonWater: WaterSample = { level: 0, ground: 0, kind: 0, near: 0 };

  constructor(readonly seed: number) {
    this.climate = new ClimateSampler(seed);
    this.noise = createNoise3D(mulberry32(seed + 200));
    this.underground = new Underground(seed);
    this.rivers = new Rivers(seed, this.climate);
  }

  /** Two octaves of 3D simplex noise in [-1, 1] at the centre of cell (x, y, z). */
  private detail(x: number, y: number, z: number): number {
    const xm = (x + 0.5) * B, ym = (y + 0.5) * B, zm = (z + 0.5) * B;
    const a = this.noise(xm / DETAIL_H_M, ym / DETAIL_V_M, zm / DETAIL_H_M);
    const b = this.noise((2 * xm) / DETAIL_H_M, (2 * ym) / DETAIL_V_M, (2 * zm) / DETAIL_H_M);
    return (a + 0.5 * b) / 1.5;
  }

  private solid(x: number, y: number, z: number, offset: number, amp: number): boolean {
    const d = offset - (y + 0.5) * B;
    if (d > amp) return true;
    if (d < -amp) return false;
    return d + amp * this.detail(x, y, z) > 0;
  }

  /** Caves stop short of the surface near or under water, so it cannot drain into them. */
  private caveTop(top: number, water = SEA_CELL): number {
    return (top + 1) * B <= Math.max(SEA_LEVEL_M, water * B) + SHORE_CAVE_BAND_M ? top - SHORE_ROOF_CELLS : top;
  }

  /** Terrain of a column without features; cached, because features look at neighbouring columns. */
  private base(cx: number, cz: number): Base {
    const key = `${cx},${cz}`;
    const hit = this.bases.get(key);
    if (hit) return hit;
    const d: Base = {
      top: new Int32Array(AREA), climate: new Uint8Array(AREA), offset: new Float32Array(AREA), amp: new Float32Array(AREA),
      surface: new Uint16Array(AREA), soil: new Uint16Array(AREA), biome: new Uint8Array(AREA), warp: new Float32Array(AREA),
      open: new Uint8Array(AREA), water: new Int32Array(AREA), shore: new Uint8Array(AREA), minTop: Infinity, caveFloor: Infinity, terrainMax: -Infinity,
    };
    const ws: WaterSample = { level: 0, ground: 0, kind: 0, near: 0 };
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const x = cx * N + lx, z = cz * N + lz, i = lz * N + lx;
        const f = this.climate.fields((x + 0.5) * B, (z + 0.5) * B);
        let offset = heightMeters(f), amp = detailAmpMeters(f);
        // Rivers and lakes cut their beds and banks into the surface, and calm its detail so water shows.
        this.rivers.sample((x + 0.5) * B, (z + 0.5) * B, offset, ws);
        if (ws.ground < offset) offset = ws.ground;
        if (ws.near > 0) amp *= 1 - 0.8 * ws.near;
        const water = ws.kind ? Math.max(SEA_CELL, Math.round(ws.level / B)) : SEA_CELL;
        let y = Math.ceil((offset + amp) / B);
        const bottom = Math.floor((offset - amp) / B);
        while (y > bottom && !this.solid(x, y, z, offset, amp)) y--;
        const topM = (y + 1) * B;
        const temp = temperatureAt(f, topM), precip = precipitationAt(f, amp);
        // A small per-cell nudge to the climate dithers biome borders instead of drawing them as clean lines.
        const jitter = hash2(this.seed + 64, x, z) - 0.5;
        const biome = biomeAt(temp + jitter * BIOME_JITTER_C, precip + jitter * BIOME_JITTER_MM, topM, amp, f.weirdness);
        const warp = this.underground.warpAt(x, z);
        d.top[i] = y;
        d.water[i] = water;
        d.shore[i] = ws.near > 0.3 ? 1 : 0;
        d.offset[i] = offset;
        d.amp[i] = amp;
        d.warp[i] = warp;
        d.biome[i] = biomeIndex(biome.key);
        d.climate[i] = (quantize((temp - 5) / 25) << 4) | quantize(precip / 1000 - 1);
        if (y + 1 <= water && water > SEA_CELL) {
          // River and lake beds: patches of sand, gravel and clay.
          const r = hash2(this.seed + 61, x, z);
          d.surface[i] = d.soil[i] = r < 0.4 ? SAND : r < 0.75 ? GRAVEL : CLAY;
        } else if (y + 1 <= SEA_CELL) d.surface[i] = d.soil[i] = topM < DEEP_FLOOR_M ? GRAVEL : SAND;
        else if (topM <= BEACH_TOP_M) d.surface[i] = d.soil[i] = SAND;
        else if (amp >= BARE_ROCK_AMP_M) d.surface[i] = d.soil[i] = this.underground.rockAt(y, warp);
        else {
          d.surface[i] = S(biome.surface);
          d.soil[i] = S(biome.soil);
        }
        d.open[i] = y <= this.caveTop(y, water) && this.underground.isCave(x, y, z, 0) ? 1 : 0;
        // Where a cave opens the surface, its floor is seen through the opening: streaming meshes down to it.
        if (d.open[i]) {
          let floor = y;
          while (floor > y - OPENING_DEPTH_CELLS && this.underground.isCave(x, floor - 1, z, (y - floor + 1) * B)) floor--;
          d.caveFloor = Math.min(d.caveFloor, floor);
        }
        d.minTop = Math.min(d.minTop, y);
        d.terrainMax = Math.max(d.terrainMax, y);
      }
    }
    this.bases.set(key, d);
    if (this.bases.size > COLUMN_CACHE) this.bases.delete(this.bases.keys().next().value!);
    return d;
  }

  /**
   * Where a new player starts: the cell above dry, open, level ground nearest (x, z), searched on widening rings. Never
   * in water, a cave opening, on a bank, a tree or a slope steeper than one cell. [x, y, z] in cells; y is NaN if the
   * search finds nothing.
   */
  spawnPoint(x: number, z: number): [number, number, number] {
    const max = cells(SPAWN_SEARCH_M);
    for (let r = 0; r <= max; r = r < N ? r + N : Math.ceil(r * 1.25)) {
      const n = r === 0 ? 1 : Math.max(8, Math.min(32, Math.round((2 * Math.PI * r) / N)));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, px = Math.floor(x + Math.cos(a) * r), pz = Math.floor(z + Math.sin(a) * r);
        const y = this.standable(px, pz);
        if (y !== null) return [px + 0.5, y, pz + 0.5];
      }
    }
    return [Math.floor(x) + 0.5, NaN, Math.floor(z) + 0.5];
  }

  /** The cell above (x, z)'s ground if a player can safely start there, else null. */
  private standable(x: number, z: number): number | null {
    const [c, i] = this.cellBase(x, z), top = c.top[i]!;
    if (top + 1 < c.water[i]! || c.open[i] || c.shore[i] || this.featureAt(x, z)) return null;
    for (const [dx, dz] of N4) {
      const [d, j] = this.cellBase(x + dx, z + dz);
      if (Math.abs(d.top[j]! - top) > 1 || d.top[j]! + 1 < d.water[j]! || d.open[j]) return null;
    }
    return top + 1;
  }

  /** Base data of the column holding cell (x, z), and the cell's index in it. */
  private cellBase(x: number, z: number): [Base, number] {
    const cx = Math.floor(x / N), cz = Math.floor(z / N);
    return [this.base(cx, cz), (z - cz * N) * N + (x - cx * N)];
  }

  /** The species of a tree anchored at (x, z), or null where none grows. */
  private treeAt(x: number, z: number): TreeSpecies | null {
    if (hash2(this.seed + 41, x, z) >= TREE_CHANCE) return null;
    const [c, i] = this.cellBase(x, z);
    const biome = biomeByIndex(c.biome[i]!);
    if (!biome.trees || c.open[i] || c.top[i]! + 1 <= c.water[i]! || c.shore[i]) return null;
    const ground = c.surface[i]!;
    if (biome.trees === 'saguaro' ? ground !== SAND : ground !== GRASS) return null;
    return biome.secondTrees && hash2(this.seed + 23, x, z) < SECONDARY_TREE_CHANCE ? biome.secondTrees : biome.trees;
  }

  /** Features anchored at (x, z) as [dx, dy, dz, state] relative to the anchor's ground cell, or null. */
  private featureAt(x: number, z: number): [number, number, number, number][] | null {
    const species = this.treeAt(x, z);
    if (species) return [...treeCells(this.seed, x, z, species)].map(([k, s]) => [...unpackTreeCell(k), s]);
    const [c, i] = this.cellBase(x, z);
    if (c.open[i] || c.surface[i] !== GRASS || c.top[i]! + 1 <= c.water[i]! || c.shore[i]) return null;
    if (hash2(this.seed + 43, x, z) < BOULDER_CHANCE) {
      const r = cells(BOULDER_RADIUS_M) - 0.5, out: [number, number, number, number][] = [];
      const rr = Math.ceil(r);
      for (let dy = 0; dy <= rr; dy++) for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + (dy * 1.4) ** 2 + dz * dz <= r * r) out.push([dx, dy, dz, hash2(this.seed + 44, x + dx, z + dz) < 0.5 ? COBBLE : STONE]);
      }
      return out;
    }
    if (hash2(this.seed + 45, x, z) < LOG_CHANCE) {
      const len = cells(FALLEN_LOG_MIN_M + (FALLEN_LOG_MAX_M - FALLEN_LOG_MIN_M) * hash2(this.seed + 46, x, z));
      const alongX = hash2(this.seed + 47, x, z) < 0.5;
      return Array.from({ length: len }, (_, k) => [alongX ? k : 0, 1, alongX ? 0 : k, LOG]);
    }
    return null;
  }

  /** The column (cx, cz) with its features, computed once and kept in a bounded cache. */
  column(cx: number, cz: number): ColumnData {
    const key = `${cx},${cz}`;
    const cached = this.columns.get(key);
    if (cached) {
      this.columns.delete(key);
      this.columns.set(key, cached);
      return cached;
    }
    const base = this.base(cx, cz);
    const skyTop = new Int32Array(AREA);
    for (let i = 0; i < AREA; i++) skyTop[i] = Math.max(base.top[i]!, base.water[i]! - 1);
    const features: number[] = [];
    let maxTop = base.terrainMax;
    const x0 = cx * N, z0 = cz * N;
    // Every anchor whose feature can reach into this column.
    for (let az = z0 - R; az < z0 + N + R; az++) {
      for (let ax = x0 - R; ax < x0 + N + R; ax++) {
        const cellsOf = this.featureAt(ax, az);
        if (!cellsOf) continue;
        const [c, ai] = this.cellBase(ax, az);
        const ground = c.top[ai]!;
        for (const [dx, dy, dz, state] of cellsOf) {
          const lx = ax + dx - x0, lz = az + dz - z0;
          if (lx < 0 || lx >= N || lz < 0 || lz >= N) continue;
          const i = lz * N + lx, y = ground + dy;
          if (y <= base.top[i]! && dy > 0) continue; // into the ground: never carve terrain for a tree
          features.push(i, y, state);
          if ((BLOCKS.flags[state]! & BLOCKS_SKY) !== 0) skyTop[i] = Math.max(skyTop[i]!, y);
          maxTop = Math.max(maxTop, y);
        }
      }
    }
    // Waterfalls: where a neighbour's water stands higher, it spills over the step as a curtain of flowing water, the
    // top cell level beside the neighbour's source and the rest falling (what the block updates would settle on). A
    // one-cell step just gets a source: water beside sources and on a source would become one anyway.
    for (let i = 0; i < AREA; i++) {
      const water = base.water[i]!;
      if (water <= base.top[i]! + 1 || base.open[i]) continue;
      const x = x0 + (i & 15), z = z0 + (i >> 4);
      let spill = -1;
      for (const [dx, dz] of N4) {
        const [c, j] = this.cellBase(x + dx, z + dz);
        const w = c.water[j]!;
        if (w > water && w > SEA_CELL && c.top[j]! < w - 1) spill = Math.max(spill, w - 1);
      }
      for (let y = water; y <= spill; y++) {
        const state = spill === water ? WATER : y === spill ? SPILL : FALLING;
        features.push(i, y, state);
        if ((BLOCKS.flags[state]! & BLOCKS_SKY) !== 0) skyTop[i] = Math.max(skyTop[i]!, y);
        maxTop = Math.max(maxTop, y);
      }
    }
    const data: ColumnData = { ...base, skyTop, features: Int32Array.from(features), maxTop };
    this.columns.set(key, data);
    if (this.columns.size > COLUMN_CACHE) this.columns.delete(this.columns.keys().next().value!);
    return data;
  }

  /**
   * Fills `out` (CHUNK_VOLUME, layout x, z, y) with chunk (cx, cy, cz). Returns the single state when the chunk is
   * uniform open sky or sea (then `out` is left untouched), or -1.
   */
  generate(cx: number, cy: number, cz: number, out: Uint16Array): number {
    const col = this.column(cx, cz);
    const y0 = cy * N, y1 = y0 + N - 1;
    if (y0 > col.maxTop) {
      if (y0 >= SEA_CELL) return AIR;
      if (y1 < SEA_CELL) return WATER;
    }
    this.fill(col, cx, cy, cz, out);
    this.underground.placeOres(cx, cy, cz, out);
    // Trees, boulders and logs last, so they sit on finished ground.
    const f = col.features;
    for (let k = 0; k < f.length; k += 3) {
      const y = f[k + 1]!;
      if (y < y0 || y > y1) continue;
      const i = f[k]!, idx = ((y - y0) * N + (i >> 4)) * N + (i & 15);
      if (replaceableBy(f[k + 2]!, out[idx]!) || f[k + 1]! <= col.top[i]!) out[idx] = f[k + 2]!;
    }
    return -1;
  }

  private fill(col: ColumnData, cx: number, cy: number, cz: number, out: Uint16Array): void {
    const ug = this.underground;
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const i = lz * N + lx, x = cx * N + lx, z = cz * N + lz;
        const top = col.top[i]!, offset = col.offset[i]!, amp = col.amp[i]!, surface = col.surface[i]!, soil = col.soil[i]!;
        const water = col.water[i]!, caveTop = this.caveTop(top, water), warp = col.warp[i]!;
        let cover = AIR;
        if (top + 1 >= water && !col.open[i]) {
          // Reeds at the water's edge, plants on grass, lily pads on lakes.
          if (col.shore[i] && top + 1 <= water + 1 && (surface === GRASS || surface === SAND) && hash2(this.seed + 62, x, z) < REED_CHANCE) cover = REED;
          else if (surface === GRASS) cover = this.groundCover(x, z, col.biome[i]!);
        }
        const lily = top + 1 < water && water > SEA_CELL && col.shore[i] && hash2(this.seed + 63, x, z) < LILY_PAD_CHANCE;
        for (let ly = 0; ly < N; ly++) {
          const y = cy * N + ly;
          let s: number;
          if (y > top || !this.solid(x, y, z, offset, amp)) {
            s = y < water ? WATER : y === top + 1 ? cover : lily && y === water ? LILY : AIR;
          }
          else if (y <= caveTop && ug.isCave(x, y, z, (top - y) * B)) s = ug.caveFill(x, y, z, WATER, LAVA, AIR);
          else {
            const depth = top - y;
            s = depth === 0 ? (surface === GRASS && y + 1 < SEA_CELL ? DIRT : surface) : depth < SOIL_CELLS ? soil : ug.rockAt(y, warp);
            if (s === STONE) s = ug.rockAt(y, warp);
          }
          out[(ly * N + lz) * N + lx] = s;
        }
      }
    }
  }

  /**
   * A coarse sample for far terrain: surface height in cells (the sea surface over water) and an RGB colour for what
   * covers it. Uses the climate surface only, without the 3D detail, so it costs a few noise lookups.
   */
  horizonSample(x: number, z: number, out: { height: number; r: number; g: number; b: number }): void {
    const f = this.climate.fields((x + 0.5) * B, (z + 0.5) * B);
    let h = heightMeters(f);
    const amp = detailAmpMeters(f);
    const set = (r: number, g: number, b: number) => { out.r = r; out.g = g; out.b = b; };
    const ws = this.rivers.sample((x + 0.5) * B, (z + 0.5) * B, h, this.horizonWater);
    // Banks next to the channel count as water too, so rivers narrower than the far rings stay unbroken.
    if ((ws.kind || ws.near > 0.6) && h > SEA_LEVEL_M) {
      out.height = (ws.kind ? ws.level : ws.ground - 0.5) / B - 0.15;
      set(56, 100, 186);
      return;
    }
    if (ws.ground < h) h = ws.ground;
    if (h < SEA_LEVEL_M) {
      out.height = SEA_CELL - 0.15;
      set(48, 90, 180);
      return;
    }
    out.height = h / B;
    const temp = temperatureAt(f, h);
    const biome = biomeAt(temp, precipitationAt(f, amp), h, amp, f.weirdness);
    // Coloured by the generated surface, as the chunks there will look on arrival (snow only settles near the player).
    if (h <= BEACH_TOP_M) set(214, 202, 160);
    else if (amp >= BARE_ROCK_AMP_M) set(122, 122, 122);
    else if (biome.surface === 'sand') set(214, 202, 160);
    else if (biome.surface === 'grass') set(biome.trees && biome.trees !== 'bush' ? 70 : 92, biome.trees && biome.trees !== 'bush' ? 128 : 150, 50);
    else set(118, 116, 112);
  }

  /** Grass, ferns, flowers and mushrooms on a grass cell, weighted by biome. */
  private groundCover(x: number, z: number, biome: number): number {
    const [poppy, dandelion] = biomeByIndex(biome).flowers;
    const r = hash2(this.seed + 11, x, z);
    let edge = FLOWER_CHANCE * dandelion;
    if (r < edge) return COVER.dandelion;
    if (r < (edge += FLOWER_CHANCE * poppy)) return COVER.poppy;
    if (r < (edge += TALL_GRASS_CHANCE)) return COVER.tall;
    if (r < (edge += FERN_CHANCE)) return COVER.fern;
    if (r < (edge += MUSHROOM_CHANCE)) return COVER.brown;
    return r < edge + MUSHROOM_CHANCE ? COVER.red : AIR;
  }
}

