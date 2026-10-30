import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import {
  BEACH_BAND_M, BLOCK_SIZE_M, CHUNK_AREA, CHUNK_SIZE, COLUMN_CACHE, DEEP_SEA_FLOOR_M, DETAIL_H_M,
  DETAIL_V_M, SEA_LEVEL_M, SOIL_DEPTH_M, cells,
} from '../config';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { ClimateSampler, detailAmpMeters, heightMeters } from './climate';

// Imported constants copied locally: hot loops then read a plain constant, not a module binding.
const CHUNK_SIZE_ = CHUNK_SIZE;
const CHUNK_AREA_ = CHUNK_AREA;
const BLOCK_SIZE_M_ = BLOCK_SIZE_M;
const DETAIL_H_M_ = DETAIL_H_M;
const DETAIL_V_M_ = DETAIL_V_M;
const AIR = BLOCKS.state('air');
const STONE = BLOCKS.state('stone');
const DIRT = BLOCKS.state('dirt');
const GRASS = BLOCKS.state('grass');
const SAND = BLOCKS.state('sand');
const GRAVEL = BLOCKS.state('gravel');
const WATER = BLOCKS.state('water');

/** Cells with y below this are under the sea. */
export const SEA_CELL = Math.round(SEA_LEVEL_M / BLOCK_SIZE_M_);
const SOIL_CELLS = cells(SOIL_DEPTH_M);
const BEACH_TOP_M = SEA_LEVEL_M + BEACH_BAND_M;
const DEEP_FLOOR_M = SEA_LEVEL_M - DEEP_SEA_FLOOR_M;

/** Generated data of one 16×16 column, shared by every chunk in it. */
export interface ColumnData {
  /** Highest solid cell per column cell (z * 16 + x). */
  top: Int32Array;
  /** Highest cell that stops direct sunlight (the ground, or the sea surface above it). */
  skyTop: Int32Array;
  /** Per column cell: temperature << 4 | humidity, each 0..15, for grass and leaf tint. */
  climate: Uint8Array;
  /** Surface height and detail amplitude per column cell, in meters. */
  offset: Float32Array;
  amp: Float32Array;
  /** Surface block per column cell. */
  surface: Uint16Array;
  minTop: number;
  maxTop: number;
}

const quantize = (v: number) => Math.max(0, Math.min(15, Math.round((v + 1) * 7.5)));

/**
 * Terrain from climate fields and 3D density (ported from the old generator, without rivers, caves or features yet).
 * A cell is solid where `offset - height + amp * noise > 0`, heights in meters. Pure and deterministic per seed.
 */
export class Generator {
  private readonly climate: ClimateSampler;
  private readonly noise: NoiseFunction3D;
  private readonly columns = new Map<string, ColumnData>();

  constructor(readonly seed: number) {
    this.climate = new ClimateSampler(seed);
    this.noise = createNoise3D(mulberry32(seed + 200));
  }

  /** Two octaves of 3D simplex noise in [-1, 1] at the centre of cell (x, y, z). */
  private detail(x: number, y: number, z: number): number {
    const xm = (x + 0.5) * BLOCK_SIZE_M_, ym = (y + 0.5) * BLOCK_SIZE_M_, zm = (z + 0.5) * BLOCK_SIZE_M_;
    const a = this.noise(xm / DETAIL_H_M_, ym / DETAIL_V_M_, zm / DETAIL_H_M_);
    const b = this.noise((2 * xm) / DETAIL_H_M_, (2 * ym) / DETAIL_V_M_, (2 * zm) / DETAIL_H_M_);
    return (a + 0.5 * b) / 1.5;
  }

  private solid(x: number, y: number, z: number, offset: number, amp: number): boolean {
    const d = offset - (y + 0.5) * BLOCK_SIZE_M_;
    if (d > amp) return true;
    if (d < -amp) return false;
    return d + amp * this.detail(x, y, z) > 0;
  }

  /** The column (cx, cz), computed once and kept in a bounded cache. */
  column(cx: number, cz: number): ColumnData {
    const key = `${cx},${cz}`;
    const cached = this.columns.get(key);
    if (cached) {
      this.columns.delete(key);
      this.columns.set(key, cached);
      return cached;
    }
    const data: ColumnData = {
      top: new Int32Array(CHUNK_AREA_), skyTop: new Int32Array(CHUNK_AREA_), climate: new Uint8Array(CHUNK_AREA_), offset: new Float32Array(CHUNK_AREA_),
      amp: new Float32Array(CHUNK_AREA_), surface: new Uint16Array(CHUNK_AREA_), minTop: Infinity, maxTop: -Infinity,
    };
    for (let lz = 0; lz < CHUNK_SIZE_; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_; lx++) {
        const x = cx * CHUNK_SIZE_ + lx, z = cz * CHUNK_SIZE_ + lz, i = lz * CHUNK_SIZE_ + lx;
        const f = this.climate.fields((x + 0.5) * BLOCK_SIZE_M_, (z + 0.5) * BLOCK_SIZE_M_);
        const offset = heightMeters(f), amp = detailAmpMeters(f);
        let y = Math.ceil((offset + amp) / BLOCK_SIZE_M_);
        const bottom = Math.floor((offset - amp) / BLOCK_SIZE_M_);
        while (y > bottom && !this.solid(x, y, z, offset, amp)) y--;
        const topM = (y + 1) * BLOCK_SIZE_M_;
        data.top[i] = y;
        data.skyTop[i] = Math.max(y, SEA_CELL - 1);
        data.offset[i] = offset;
        data.amp[i] = amp;
        data.climate[i] = (quantize(f.temperature) << 4) | quantize(f.humidity);
        data.surface[i] = y + 1 <= SEA_CELL ? (topM < DEEP_FLOOR_M ? GRAVEL : SAND) : topM <= BEACH_TOP_M ? SAND : GRASS;
        data.minTop = Math.min(data.minTop, y);
        data.maxTop = Math.max(data.maxTop, y);
      }
    }
    this.columns.set(key, data);
    if (this.columns.size > COLUMN_CACHE) this.columns.delete(this.columns.keys().next().value!);
    return data;
  }

  /**
   * Fills `out` (CHUNK_VOLUME, layout x, z, y) with chunk (cx, cy, cz). Returns the single state when the chunk is
   * uniform (then `out` is left untouched), or -1.
   */
  generate(cx: number, cy: number, cz: number, out: Uint16Array): number {
    const col = this.column(cx, cz);
    const y0 = cy * CHUNK_SIZE_, y1 = y0 + CHUNK_SIZE_ - 1;
    if (y0 > col.maxTop) return y0 >= SEA_CELL ? AIR : y1 < SEA_CELL ? WATER : this.fill(col, cx, cy, cz, out);
    let maxAmpCells = 0;
    for (let i = 0; i < CHUNK_AREA_; i++) maxAmpCells = Math.max(maxAmpCells, Math.ceil(col.amp[i]! / BLOCK_SIZE_M_));
    if (y1 < col.minTop - Math.max(SOIL_CELLS, maxAmpCells) - 1) return STONE;
    return this.fill(col, cx, cy, cz, out);
  }

  private fill(col: ColumnData, cx: number, cy: number, cz: number, out: Uint16Array): number {
    for (let lz = 0; lz < CHUNK_SIZE_; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_; lx++) {
        const i = lz * CHUNK_SIZE_ + lx, x = cx * CHUNK_SIZE_ + lx, z = cz * CHUNK_SIZE_ + lz;
        const top = col.top[i]!, offset = col.offset[i]!, amp = col.amp[i]!, surface = col.surface[i]!;
        const under = surface === GRASS ? DIRT : surface;
        for (let ly = 0; ly < CHUNK_SIZE_; ly++) {
          const y = cy * CHUNK_SIZE_ + ly;
          let s: number;
          if (y > top || !this.solid(x, y, z, offset, amp)) s = y < SEA_CELL ? WATER : AIR;
          else {
            const depth = top - y;
            s = depth === 0 ? (surface === GRASS && y + 1 < SEA_CELL ? DIRT : surface) : depth < SOIL_CELLS ? under : STONE;
          }
          out[(ly * CHUNK_SIZE_ + lz) * CHUNK_SIZE_ + lx] = s;
        }
      }
    }
    return -1;
  }
}
