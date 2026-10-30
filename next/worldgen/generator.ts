import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import {
  BARE_ROCK_AMP_M, BEACH_BAND_M, BLOCK_SIZE_M, BOULDER_DENSITY_PER_M2, BOULDER_RADIUS_M, CHUNK_AREA, CHUNK_SIZE,
  COLUMN_CACHE, DEEP_SEA_FLOOR_M, DETAIL_H_M, DETAIL_V_M, FALLEN_LOG_DENSITY_PER_M2, FALLEN_LOG_MAX_M,
  FALLEN_LOG_MIN_M, FERN_CHANCE, FLOWER_CHANCE, MUSHROOM_CHANCE, SEA_LEVEL_M, SECONDARY_TREE_CHANCE,
  SHORE_CAVE_BAND_M, SHORE_ROOF_CELLS, SOIL_DEPTH_M, TALL_GRASS_CHANCE, TREE_DENSITY_PER_M2, TREE_REACH_CELLS, cells,
} from '../config';
import { hash2, mulberry32 } from '../core/random';
import { BLOCKS, BLOCKS_SKY } from '../engine/blocks';
import { biomeAt, biomeByIndex, biomeIndex, precipitationAt, temperatureAt } from './biomes';
import { ClimateSampler, detailAmpMeters, heightMeters } from './climate';
import { treeCells, unpackTreeCell, type TreeSpecies } from './trees';
import { Underground } from './underground';

// Imported constants copied locally: hot loops then read a plain constant, not a module binding.
const N = CHUNK_SIZE;
const AREA = CHUNK_AREA;
const B = BLOCK_SIZE_M;
const S = (key: string) => BLOCKS.state(key);
const AIR = S('air'), STONE = S('stone'), DIRT = S('dirt'), GRASS = S('grass'), SAND = S('sand'), GRAVEL = S('gravel');
const WATER = S('water'), LOG = S('log'), LEAVES = S('leaves'), COBBLE = S('cobblestone');
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
  /** Whether the surface cell was opened by a cave. */
  open: Uint8Array;
  /** Tree and feature cells in this column: column index, y, state (flat triples). */
  features: Int32Array;
  minTop: number;
  /** Highest terrain or feature cell. */
  maxTop: number;
}

type Base = Omit<ColumnData, 'skyTop' | 'features' | 'maxTop'> & { terrainMax: number };

const quantize = (v: number) => Math.max(0, Math.min(15, Math.round((v + 1) * 7.5)));
/** Leaves only grow into open air; logs and cacti also push through leaves and plants. */
const replaceableBy = (state: number, cell: number) =>
  cell === AIR || (state !== LEAVES && (cell === LEAVES || BLOCKS.types[BLOCKS.typeIndex[cell]!]!.shape === 'cross'));

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

  constructor(readonly seed: number) {
    this.climate = new ClimateSampler(seed);
    this.noise = createNoise3D(mulberry32(seed + 200));
    this.underground = new Underground(seed);
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

  private caveTop(top: number): number {
    return (top + 1) * B <= SEA_LEVEL_M + SHORE_CAVE_BAND_M ? top - SHORE_ROOF_CELLS : top;
  }

  /** Terrain of a column without features; cached, because features look at neighbouring columns. */
  private base(cx: number, cz: number): Base {
    const key = `${cx},${cz}`;
    const hit = this.bases.get(key);
    if (hit) return hit;
    const d: Base = {
      top: new Int32Array(AREA), climate: new Uint8Array(AREA), offset: new Float32Array(AREA), amp: new Float32Array(AREA),
      surface: new Uint16Array(AREA), soil: new Uint16Array(AREA), biome: new Uint8Array(AREA), warp: new Float32Array(AREA),
      open: new Uint8Array(AREA), minTop: Infinity, terrainMax: -Infinity,
    };
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const x = cx * N + lx, z = cz * N + lz, i = lz * N + lx;
        const f = this.climate.fields((x + 0.5) * B, (z + 0.5) * B);
        const offset = heightMeters(f), amp = detailAmpMeters(f);
        let y = Math.ceil((offset + amp) / B);
        const bottom = Math.floor((offset - amp) / B);
        while (y > bottom && !this.solid(x, y, z, offset, amp)) y--;
        const topM = (y + 1) * B;
        const temp = temperatureAt(f, topM), precip = precipitationAt(f, amp);
        const biome = biomeAt(temp, precip, topM, amp, f.weirdness);
        const warp = this.underground.warpAt(x, z);
        d.top[i] = y;
        d.offset[i] = offset;
        d.amp[i] = amp;
        d.warp[i] = warp;
        d.biome[i] = biomeIndex(biome.key);
        d.climate[i] = (quantize((temp - 5) / 25) << 4) | quantize(precip / 1000 - 1);
        // shortcut: no dithering between neighbouring biomes' surfaces yet; add it if borders look too sharp.
        if (y + 1 <= SEA_CELL) d.surface[i] = d.soil[i] = topM < DEEP_FLOOR_M ? GRAVEL : SAND;
        else if (topM <= BEACH_TOP_M) d.surface[i] = d.soil[i] = SAND;
        else if (amp >= BARE_ROCK_AMP_M) d.surface[i] = d.soil[i] = this.underground.rockAt(y, warp);
        else {
          d.surface[i] = S(biome.surface);
          d.soil[i] = S(biome.soil);
        }
        d.open[i] = y <= this.caveTop(y) && this.underground.isCave(x, y, z, 0) ? 1 : 0;
        d.minTop = Math.min(d.minTop, y);
        d.terrainMax = Math.max(d.terrainMax, y);
      }
    }
    this.bases.set(key, d);
    if (this.bases.size > COLUMN_CACHE) this.bases.delete(this.bases.keys().next().value!);
    return d;
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
    if (!biome.trees || c.open[i] || c.top[i]! + 1 <= SEA_CELL) return null;
    const ground = c.surface[i]!;
    if (biome.trees === 'saguaro' ? ground !== SAND : ground !== GRASS) return null;
    return biome.secondTrees && hash2(this.seed + 23, x, z) < SECONDARY_TREE_CHANCE ? biome.secondTrees : biome.trees;
  }

  /** Features anchored at (x, z) as [dx, dy, dz, state] relative to the anchor's ground cell, or null. */
  private featureAt(x: number, z: number): [number, number, number, number][] | null {
    const species = this.treeAt(x, z);
    if (species) return [...treeCells(this.seed, x, z, species)].map(([k, s]) => [...unpackTreeCell(k), s]);
    const [c, i] = this.cellBase(x, z);
    if (c.open[i] || c.surface[i] !== GRASS || c.top[i]! + 1 <= SEA_CELL) return null;
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
    for (let i = 0; i < AREA; i++) skyTop[i] = Math.max(base.top[i]!, SEA_CELL - 1);
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
        const caveTop = this.caveTop(top), warp = col.warp[i]!;
        const cover = top + 1 >= SEA_CELL && surface === GRASS && !col.open[i] ? this.groundCover(x, z, col.biome[i]!) : AIR;
        for (let ly = 0; ly < N; ly++) {
          const y = cy * N + ly;
          let s: number;
          if (y > top || !this.solid(x, y, z, offset, amp)) s = y < SEA_CELL ? WATER : y === top + 1 ? cover : AIR;
          else if (y <= caveTop && ug.isCave(x, y, z, (top - y) * B)) s = AIR;
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
    const h = heightMeters(f), amp = detailAmpMeters(f);
    const set = (r: number, g: number, b: number) => { out.r = r; out.g = g; out.b = b; };
    if (h < SEA_LEVEL_M) {
      out.height = SEA_CELL - 0.15;
      set(48, 90, 180);
      return;
    }
    out.height = h / B;
    const temp = temperatureAt(f, h);
    const biome = biomeAt(temp, precipitationAt(f, amp), h, amp, f.weirdness);
    if (temp < -6) set(232, 238, 244);
    else if (h <= BEACH_TOP_M) set(214, 202, 160);
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

