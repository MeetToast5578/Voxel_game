import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import {
  BLOCK_SIZE_M, CAVE_CHEESE_FADE_M, CAVE_CHEESE_OPENING, CAVE_CHEESE_SCALE_H_M, CAVE_CHEESE_SCALE_V_M,
  CAVE_CHEESE_THRESHOLD, CAVE_NOODLE_ROOF_M, CAVE_NOODLE_SCALE_H_M, CAVE_NOODLE_SCALE_V_M, CAVE_NOODLE_STRETCH,
  CAVE_NOODLE_THRESHOLD, CAVE_SCALE_H_M, CAVE_SCALE_V_M, CAVE_THRESHOLD, CHUNK_SIZE, DEEPSLATE_DEPTH_M,
  GEOLOGY_LAYER_M, GEOLOGY_WARP_M, RAVINE_BAND, RAVINE_DEPTH_M, RAVINE_ROOF_M, RAVINE_SCALE_M,
} from '../config';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';

const B = BLOCK_SIZE_M;
const N = CHUNK_SIZE;
const ROCKS = ['granite', 'diorite', 'andesite', 'sandstone', 'limestone', 'slate', 'basalt'].map((k) => BLOCKS.state(k));
const DEEPSLATE = BLOCKS.state('deepslate');
const STONE = BLOCKS.state('stone');
/** Rock ores may replace. */
export const HOST_ROCK = new Set([STONE, DEEPSLATE, ...ROCKS]);
const CHEESE_PUSH = CAVE_CHEESE_OPENING - CAVE_CHEESE_THRESHOLD;

/**
 * Ore veins per 1000 m³ of rock in their depth band, and cells per vein. Rates are per volume, so they do not change
 * with the cell size.
 */
const ORES = [
  { key: 'coal_ore', topM: -4, bottomM: -40, per1000M3: 1.0, cells: 6 },
  { key: 'iron_ore', topM: -32, bottomM: -96, per1000M3: 0.6, cells: 5 },
  { key: 'gold_ore', topM: -64, bottomM: -160, per1000M3: 0.3, cells: 4 },
  { key: 'redstone_ore', topM: -96, bottomM: -224, per1000M3: 0.4, cells: 5 },
  { key: 'lapis_ore', topM: -128, bottomM: -320, per1000M3: 0.3, cells: 4 },
  { key: 'diamond_ore', topM: -160, bottomM: -480, per1000M3: 0.15, cells: 3 },
  { key: 'emerald_ore', topM: -160, bottomM: -480, per1000M3: 0.1, cells: 2 },
].map((o) => ({ ...o, state: BLOCKS.state(o.key) }));

/** Rock layers, caves and ores: everything below the surface. Pure and deterministic per seed. */
export class Underground {
  private readonly warp: NoiseFunction2D;
  private readonly cheese: NoiseFunction3D;
  private readonly noodleA: NoiseFunction3D;
  private readonly noodleB: NoiseFunction3D;
  private readonly spagA: NoiseFunction3D;
  private readonly spagB: NoiseFunction3D;
  private readonly ravine: NoiseFunction2D;

  constructor(private readonly seed: number) {
    const n3 = (o: number) => createNoise3D(mulberry32(seed + o));
    this.warp = createNoise2D(mulberry32(seed + 300));
    this.cheese = n3(500);
    this.noodleA = n3(501);
    this.noodleB = n3(502);
    this.spagA = n3(3);
    this.spagB = n3(4);
    this.ravine = createNoise2D(mulberry32(seed + 503));
  }

  /** Warp of the rock layers at a column cell, in [-1, 1]. */
  warpAt(x: number, z: number): number {
    return this.warp((x * B) / GEOLOGY_WARP_M, (z * B) / GEOLOGY_WARP_M);
  }

  /** The rock at height y (cells): bent strata, and deepslate deep down. */
  rockAt(y: number, warp: number): number {
    if (y * B < DEEPSLATE_DEPTH_M) return DEEPSLATE;
    const layer = Math.floor((y * B) / GEOLOGY_LAYER_M + 3 * warp);
    return ROCKS[((layer % ROCKS.length) + ROCKS.length) % ROCKS.length]!;
  }

  /**
   * Whether a cave carves cell (x, y, z) with `coverM` metres of rock above it (to the column's surface).
   * Caverns fade out towards the surface, tunnels keep a roof, ravines cut down from just under it.
   */
  isCave(x: number, y: number, z: number, coverM: number): boolean {
    if (coverM < 0) return false;
    const xm = (x + 0.5) * B, ym = (y + 0.5) * B, zm = (z + 0.5) * B;
    const cheese = this.cheese(xm / CAVE_CHEESE_SCALE_H_M, ym / CAVE_CHEESE_SCALE_V_M, zm / CAVE_CHEESE_SCALE_H_M);
    const fade = coverM >= CAVE_CHEESE_FADE_M ? 0 : CHEESE_PUSH * (1 - coverM / CAVE_CHEESE_FADE_M);
    if (cheese > CAVE_CHEESE_THRESHOLD + fade) return true;
    if (coverM < CAVE_NOODLE_ROOF_M) return false;
    const nh = CAVE_NOODLE_SCALE_H_M, nv = CAVE_NOODLE_SCALE_V_M * CAVE_NOODLE_STRETCH;
    const a = this.noodleA(xm / nh, ym / nv, zm / nh);
    if (a * a < CAVE_NOODLE_THRESHOLD) {
      const b = this.noodleB(xm / nh + 7.3, ym / nv + 3.1, zm / nh + 11.7);
      if (a * a + b * b < CAVE_NOODLE_THRESHOLD) return true;
    }
    const s = this.spagA(xm / CAVE_SCALE_H_M, ym / CAVE_SCALE_V_M, zm / CAVE_SCALE_H_M);
    if (s * s < CAVE_THRESHOLD) {
      const t = this.spagB(xm / CAVE_SCALE_H_M, ym / CAVE_SCALE_V_M, zm / CAVE_SCALE_H_M);
      if (s * s + t * t < CAVE_THRESHOLD) return true;
    }
    const belowRoof = coverM - RAVINE_ROOF_M;
    if (belowRoof >= 0 && belowRoof < RAVINE_DEPTH_M) {
      const width = RAVINE_BAND * (1 - belowRoof / RAVINE_DEPTH_M);
      if (Math.abs(this.ravine(xm / RAVINE_SCALE_M, zm / RAVINE_SCALE_M)) < width) return true;
    }
    return false;
  }

  /** Places ore veins in chunk (cx, cy, cz) of `out`, replacing host rock only. Veins stay inside the chunk. */
  placeOres(cx: number, cy: number, cz: number, out: Uint16Array): void {
    const y0m = cy * N * B, y1m = (cy + 1) * N * B, volume = (N * B) ** 3;
    ORES.forEach((ore, oi) => {
      if (y0m > ore.topM || y1m < ore.bottomM) return;
      const rng = mulberry32((((this.seed * 31 + oi) * 1000003) ^ (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0);
      const expected = (ore.per1000M3 * volume) / 1000;
      const veins = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
      for (let v = 0; v < veins; v++) {
        let x = Math.floor(rng() * N), y = Math.floor(rng() * N), z = Math.floor(rng() * N);
        for (let c = 0; c < ore.cells; c++) {
          const ym = (cy * N + y) * B;
          const i = (y * N + z) * N + x;
          if (ym <= ore.topM && ym >= ore.bottomM && HOST_ROCK.has(out[i]!)) out[i] = ore.state;
          const d = Math.floor(rng() * 6);
          x = Math.min(N - 1, Math.max(0, x + (d === 0 ? 1 : d === 1 ? -1 : 0)));
          y = Math.min(N - 1, Math.max(0, y + (d === 2 ? 1 : d === 3 ? -1 : 0)));
          z = Math.min(N - 1, Math.max(0, z + (d === 4 ? 1 : d === 5 ? -1 : 0)));
        }
      }
    });
  }
}
