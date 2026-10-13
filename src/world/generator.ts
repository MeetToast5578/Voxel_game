import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { CHUNK_SIZE, SEA_LEVEL } from '../config';
import { columnIndex, localIndex } from '../core/coords';
import { clamp } from '../core/math';
import { hash2, mulberry32 } from '../core/random';
import { BlockId, blocksSky } from './blocks';
import type { Chunk } from './chunk';

const TREE_CHANCE = 0.012;
/** Smaller = thinner, rarer cave tunnels. 0.012 carves about 3% of the underground. */
const CAVE_THRESHOLD = 0.012;
/**
 * Height of the phase 1 "legacy column": today's terrain lives in y 0..127. Below it the world is solid stone and
 * above it air. Phase 2 replaces this generator.
 */
const LEGACY_HEIGHT = 128;
const LEGACY_VOLUME = CHUNK_SIZE * CHUNK_SIZE * LEGACY_HEIGHT;
/** A tree's highest block is at most this far above its ground block (trunk 4..6, plus 1 leaf layer). */
const MAX_TREE_RISE = 7;

function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export class TerrainGenerator {
  readonly seed: number;
  private readonly baseNoise: NoiseFunction2D;
  private readonly hillNoise: NoiseFunction2D;
  private readonly mountainNoise: NoiseFunction2D;
  private readonly caveNoiseA: NoiseFunction3D;
  private readonly caveNoiseB: NoiseFunction3D;

  constructor(seed: number) {
    this.seed = seed;
    this.baseNoise = createNoise2D(mulberry32(seed));
    this.hillNoise = createNoise2D(mulberry32(seed + 1));
    this.mountainNoise = createNoise2D(mulberry32(seed + 2));
    this.caveNoiseA = createNoise3D(mulberry32(seed + 3));
    this.caveNoiseB = createNoise3D(mulberry32(seed + 4));
  }

  /** Y of the highest solid block in this column. */
  getHeight(wx: number, wz: number): number {
    const base = fbm(this.baseNoise, wx / 256, wz / 256, 4);
    const hills = fbm(this.hillNoise, wx / 64, wz / 64, 4);
    const m = Math.max(0, fbm(this.mountainNoise, wx / 512, wz / 512, 2));
    const h = SEA_LEVEL + 2 + base * 14 + hills * 6 + m * m * 70;
    return clamp(Math.floor(h), 1, LEGACY_HEIGHT - 12);
  }

  /** Fills chunk.blocks with the generated terrain of chunk (cx, cy, cz). */
  generateChunk(chunk: Chunk): void {
    const b = chunk.blocks;
    if (chunk.cy < 0) {
      b.fill(BlockId.STONE);
      return;
    }
    if (chunk.cy * CHUNK_SIZE >= LEGACY_HEIGHT) {
      b.fill(BlockId.AIR);
      return;
    }
    this.fillRange(chunk.cx, chunk.cz, chunk.cy * CHUNK_SIZE, CHUNK_SIZE, b);
  }

  /**
   * The phase 1 terrain of one column as a 16 x 128 x 16 array (y 0..127, same layout as a chunk, so chunk cy
   * 0..7 is the slice at cy * CHUNK_VOLUME). Kept as the reference that cubic chunks must reproduce exactly.
   */
  legacyColumn(cx: number, cz: number): Uint16Array {
    const out = new Uint16Array(LEGACY_VOLUME);
    this.fillRange(cx, cz, 0, LEGACY_HEIGHT, out);
    return out;
  }

  /** World y of the highest sky-blocking block of each cell of column (cx, cz), indexed lz * 16 + lx. */
  columnTops(cx: number, cz: number): Int32Array {
    const column = this.legacyColumn(cx, cz);
    const tops = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let y = LEGACY_HEIGHT - 1;
        while (y >= 0 && !blocksSky(column[localIndex(lx, y, lz)]!)) y--;
        tops[columnIndex(lx, lz)] = y; // y = 0 is always stone, so this never goes below 0
      }
    return tops;
  }

  /**
   * Generates layers y0 .. y0 + count - 1 of column (cx, cz) into out (16 x count x 16, chunk layout).
   * Any range gives exactly the matching slice of the full legacy column: terrain and caves depend only on the
   * position, and trees are placed in the same order, writing only the cells inside the range. Every cell a tree
   * reads (the leaf cell it may fill) is one it would write, so it is inside the range too; the ground check is
   * computed from the terrain rules instead of read back.
   */
  private fillRange(cx: number, cz: number, y0: number, count: number, out: Uint16Array): void {
    const y1 = y0 + count; // exclusive
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    let maxHeight = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = this.getHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
        heights[columnIndex(lx, lz)] = h;
        maxHeight = Math.max(maxHeight, h);
      }
    if (y0 > Math.max(maxHeight + MAX_TREE_RISE, SEA_LEVEL)) {
      out.fill(BlockId.AIR, 0, count * CHUNK_SIZE * CHUNK_SIZE); // above every surface, tree and sea
      return;
    }

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = heights[columnIndex(lx, lz)]!;
        const beach = h <= SEA_LEVEL + 1;
        for (let y = y0; y < y1; y++) {
          let id: number = BlockId.AIR;
          if (y === 0) id = BlockId.STONE;
          else if (y < h - 3) id = BlockId.STONE;
          else if (y < h) id = beach ? BlockId.SAND : BlockId.DIRT;
          else if (y === h) id = beach ? BlockId.SAND : BlockId.GRASS;
          else if (y <= SEA_LEVEL) id = BlockId.WATER;
          out[localIndex(lx, y - y0, lz)] = id;
        }
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const top = Math.min(this.caveTop(h), y1 - 1);
        for (let y = Math.max(2, y0); y <= top; y++) {
          if (this.isCave(wx, y, wz)) out[localIndex(lx, y - y0, lz)] = BlockId.AIR;
        }
      }
    }
    this.placeTrees(cx, cz, heights, y0, y1, out);
  }

  /**
   * "Spaghetti" caves: a block becomes air where two independent 3D noise fields are both close to zero,
   * which happens along thin winding tubes. y = 0 and y = 1 are never carved. Under beaches, lakes and the sea
   * the top 5 blocks are never carved, so water never sits above a cave opening.
   */
  private caveTop(h: number): number {
    return h <= SEA_LEVEL + 3 ? h - 5 : h;
  }

  private isCave(wx: number, y: number, wz: number): boolean {
    const a = this.caveNoiseA(wx / 40, y / 24, wz / 40);
    if (a * a >= CAVE_THRESHOLD) return false; // cheap early exit: skip the second noise most of the time
    const c = this.caveNoiseB(wx / 40, y / 24, wz / 40);
    return a * a + c * c < CAVE_THRESHOLD;
  }

  private placeTrees(cx: number, cz: number, heights: Int32Array, y0: number, y1: number, out: Uint16Array): void {
    const inRange = (lx: number, y: number, lz: number) =>
      lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && y >= y0 && y < y1;
    const index = (lx: number, y: number, lz: number) => localIndex(lx, y - y0, lz);
    for (let lz = 2; lz <= CHUNK_SIZE - 3; lz++) {
      for (let lx = 2; lx <= CHUNK_SIZE - 3; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        if (hash2(this.seed, wx, wz) >= TREE_CHANCE) continue;
        const h = heights[columnIndex(lx, lz)]!;
        // Trees grow on grass: not a beach, and the cave carver left the surface block alone.
        if (h <= SEA_LEVEL + 1) continue;
        if (h >= 2 && h <= this.caveTop(h) && this.isCave(wx, h, wz)) continue;
        const trunk = 4 + Math.floor(hash2(this.seed + 7, wx, wz) * 3);
        const top = h + trunk;
        if (top + 1 < y0 || h >= y1) continue; // this tree has no block in the range
        for (let y = top - 2; y <= top + 1; y++) {
          const r = y <= top - 1 ? 2 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              if (r === 1 && y === top + 1 && Math.abs(dx) + Math.abs(dz) === 2) continue;
              if (!inRange(lx + dx, y, lz + dz)) continue;
              const i = index(lx + dx, y, lz + dz);
              if (out[i] === BlockId.AIR) out[i] = BlockId.LEAVES;
            }
          }
        }
        for (let y = h + 1; y <= top; y++) if (inRange(lx, y, lz)) out[index(lx, y, lz)] = BlockId.LOG;
        if (inRange(lx, h, lz)) out[index(lx, h, lz)] = BlockId.DIRT;
      }
    }
  }
}

/** Chunks cy 0 .. LEGACY_CHUNKS - 1 hold the legacy terrain; below is stone and above is air. */
export const LEGACY_CHUNKS = LEGACY_HEIGHT / CHUNK_SIZE;
