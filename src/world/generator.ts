import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import {
  BEACH_BAND,
  BLOCK_SIZE_M,
  CAVE_SCALE_H_M,
  CAVE_SCALE_V_M,
  CHUNK_SIZE,
  LEGACY_CHUNKS,
  LEGACY_HEIGHT,
  metersToBlocks,
  SEA_LEVEL,
  SHORE_CAVE_BAND,
  SHORE_ROOF,
  SOIL_DEPTH,
  TERRAIN_CHUNK_BOTTOM,
  TERRAIN_MAX_BLOCKS,
  TREE_CHANCE,
  TREE_REACH,
} from '../config';
import { columnIndex, columnKey, localIndex } from '../core/coords';
import { clamp, floorDiv } from '../core/math';
import { hash2, mulberry32 } from '../core/random';
import { BlockId, blocksSky } from './blocks';
import { Chunk } from './chunk';
import { ClimateSampler, heightMeters } from './shape';
import { MAX_TREE_RISE, treeBlocks } from './trees';

const CAVE_THRESHOLD = 0.012;
/** The height cache is only a cache, so clearing it never changes a result. */
const HEIGHT_CACHE_LIMIT = 4096;

export class TerrainGenerator {
  readonly seed: number;
  private readonly climate: ClimateSampler;
  private readonly caveNoiseA: NoiseFunction3D;
  private readonly caveNoiseB: NoiseFunction3D;
  /** Heights of each column (16 x 16 cells, keyed by columnKey), so trees can read their neighbours cheaply. */
  private readonly heightCache = new Map<string, Int32Array>();

  constructor(seed: number) {
    this.seed = seed;
    this.climate = new ClimateSampler(seed);
    this.caveNoiseA = createNoise3D(mulberry32(seed + 3));
    this.caveNoiseB = createNoise3D(mulberry32(seed + 4));
  }

  /** Y of the highest solid block in this column: the terrain surface, from the climate and shape fields. */
  getHeight(wx: number, wz: number): number {
    const fields = this.climate.fields(wx * BLOCK_SIZE_M, wz * BLOCK_SIZE_M);
    return clamp(Math.floor(metersToBlocks(heightMeters(fields))), TERRAIN_CHUNK_BOTTOM * CHUNK_SIZE, TERRAIN_MAX_BLOCKS);
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
        maxHeight = Math.max(maxHeight, this.heightAt(wx, wz));
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
    const heights = this.columnHeights(cx, cz);
    // Trees within reach of this column can rise from a neighbour, so the early exit looks at the whole reach.
    if (y0 > this.reachMaxHeight(cx, cz) + MAX_TREE_RISE) {
      out.fill(BlockId.AIR, 0, count * CHUNK_SIZE * CHUNK_SIZE); // above every surface, tree and sea
      return;
    }

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = heights[columnIndex(lx, lz)]!;
        const beach = h <= SEA_LEVEL + BEACH_BAND;
        for (let y = y0; y < y1; y++) {
          let id: number = BlockId.AIR;
          if (y < h - SOIL_DEPTH) id = BlockId.STONE;
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
    this.placeTrees(cx, cz, y0, y1, out);
  }

  /** Cached heights of column (cx, cz), indexed lz * 16 + lx. */
  private columnHeights(cx: number, cz: number): Int32Array {
    const key = columnKey(cx, cz);
    let heights = this.heightCache.get(key);
    if (!heights) {
      if (this.heightCache.size >= HEIGHT_CACHE_LIMIT) this.heightCache.clear();
      heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let lx = 0; lx < CHUNK_SIZE; lx++)
          heights[columnIndex(lx, lz)] = this.getHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
      this.heightCache.set(key, heights);
    }
    return heights;
  }

  private heightAt(wx: number, wz: number): number {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    return this.columnHeights(cx, cz)[columnIndex(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE)]!;
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

  /** Trees whose anchor is in this column or within reach of it. Each tree is computed whole, then clipped. */
  private placeTrees(cx: number, cz: number, y0: number, y1: number, out: Uint16Array): void {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    for (let wz = z0 - TREE_REACH; wz < z0 + CHUNK_SIZE + TREE_REACH; wz++) {
      for (let wx = x0 - TREE_REACH; wx < x0 + CHUNK_SIZE + TREE_REACH; wx++) {
        if (hash2(this.seed, wx, wz) >= TREE_CHANCE) continue;
        const h = this.heightAt(wx, wz);
        // Trees grow on grass: not a beach, and the cave carver left the surface block alone.
        if (h <= SEA_LEVEL + BEACH_BAND) continue;
        if (h >= 2 && h <= this.caveTop(h) && this.isCave(wx, h, wz)) continue;
        if (h >= y1 || h + MAX_TREE_RISE < y0) continue; // this tree has no block in the range
        for (const b of treeBlocks(this.seed, wx, h, wz)) {
          const lx = b.x - x0;
          const ly = b.y - y0;
          const lz = b.z - z0;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= y1 - y0) continue;
          const i = localIndex(lx, ly, lz);
          // Leaves fill only air; logs and the ground block replace what is there.
          if (b.id === BlockId.LEAVES) {
            if (out[i] === BlockId.AIR) out[i] = BlockId.LEAVES;
          } else out[i] = b.id;
        }
      }
    }
  }
}
