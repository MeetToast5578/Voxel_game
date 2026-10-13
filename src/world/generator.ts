import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../config';
import { localIndex } from '../core/coords';
import { clamp } from '../core/math';
import { hash2, mulberry32 } from '../core/random';
import { BlockId } from './blocks';
import type { Chunk } from './chunk';

const TREE_CHANCE = 0.012;
/** Smaller = thinner, rarer cave tunnels. 0.012 carves about 3% of the underground. */
const CAVE_THRESHOLD = 0.012;

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
    return clamp(Math.floor(h), 1, WORLD_HEIGHT - 12);
  }

  generateChunk(chunk: Chunk): void {
    const b = chunk.blocks;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = chunk.cx * CHUNK_SIZE + lx;
        const wz = chunk.cz * CHUNK_SIZE + lz;
        const h = this.getHeight(wx, wz);
        const beach = h <= SEA_LEVEL + 1;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let id: number = BlockId.AIR;
          if (y === 0) id = BlockId.BEDROCK;
          else if (y < h - 3) id = BlockId.STONE;
          else if (y < h) id = beach ? BlockId.SAND : BlockId.DIRT;
          else if (y === h) id = beach ? BlockId.SAND : BlockId.GRASS;
          else if (y <= SEA_LEVEL) id = BlockId.WATER;
          b[localIndex(lx, y, lz)] = id;
        }
        this.carveCaves(chunk, lx, lz, h);
      }
    }
    this.placeTrees(chunk);
  }

  /**
   * "Spaghetti" caves: a block becomes air where two independent 3D noise fields are both close to zero,
   * which happens along thin winding tubes. Bedrock (y = 0) and y = 1 are never carved. Under beaches,
   * lakes and the sea the top 5 blocks are never carved, so water never sits above a cave opening.
   */
  private carveCaves(chunk: Chunk, lx: number, lz: number, h: number): void {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const top = h <= SEA_LEVEL + 3 ? h - 5 : h;
    for (let y = 2; y <= top; y++) {
      const a = this.caveNoiseA(wx / 40, y / 24, wz / 40);
      if (a * a >= CAVE_THRESHOLD) continue; // cheap early exit: skip the second noise most of the time
      const c = this.caveNoiseB(wx / 40, y / 24, wz / 40);
      if (a * a + c * c < CAVE_THRESHOLD) chunk.blocks[localIndex(lx, y, lz)] = BlockId.AIR;
    }
  }

  private placeTrees(chunk: Chunk): void {
    for (let lz = 2; lz <= CHUNK_SIZE - 3; lz++) {
      for (let lx = 2; lx <= CHUNK_SIZE - 3; lx++) {
        const wx = chunk.cx * CHUNK_SIZE + lx;
        const wz = chunk.cz * CHUNK_SIZE + lz;
        if (hash2(this.seed, wx, wz) >= TREE_CHANCE) continue;
        const h = this.getHeight(wx, wz);
        if (chunk.get(lx, h, lz) !== BlockId.GRASS) continue;
        const trunk = 4 + Math.floor(hash2(this.seed + 7, wx, wz) * 3);
        const top = h + trunk;
        for (let y = top - 2; y <= top + 1; y++) {
          const r = y <= top - 1 ? 2 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              if (r === 1 && y === top + 1 && Math.abs(dx) + Math.abs(dz) === 2) continue;
              if (chunk.get(lx + dx, y, lz + dz) === BlockId.AIR) chunk.set(lx + dx, y, lz + dz, BlockId.LEAVES);
            }
          }
        }
        for (let y = h + 1; y <= top; y++) chunk.set(lx, y, lz, BlockId.LOG);
        chunk.set(lx, h, lz, BlockId.DIRT);
      }
    }
  }
}
