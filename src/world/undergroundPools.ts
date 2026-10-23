import {
  CHUNK_SIZE, POOL_SPACING_M, POOL_WATER_LEVEL_M, POOL_WATER_DEPTH_RANGE_M, POOL_LAVA_LEVEL_M,
  POOL_LAVA_DEPTH_RANGE_M, POOL_WATER_RADIUS_M, POOL_WATER_RADIUS_RANGE_M, POOL_LAVA_RADIUS_M,
  POOL_LAVA_RADIUS_RANGE_M, POOL_HALF_HEIGHT_M, POOL_SHELL_M, SHORE_ROOF, TERRAIN_CHUNK_BOTTOM,
  CAVE_BOTTOM_ROWS, POOL_CACHE_LIMIT, roundBlocks,
} from '../config';
import { hash2 } from '../core/random';
import { localIndex } from '../core/coords';
import { BlockId } from './blocks';

export interface UndergroundPool {
  x: number; y: number; z: number;
  radius: number;
  halfHeight: number;
  fluid: number;
}
const SPACING = roundBlocks(POOL_SPACING_M);
const SHELL = roundBlocks(POOL_SHELL_M);
const REACH = roundBlocks(Math.max(POOL_WATER_RADIUS_M + POOL_WATER_RADIUS_RANGE_M, POOL_LAVA_RADIUS_M + POOL_LAVA_RADIUS_RANGE_M)) + SHELL;

/** Stateless, jittered basins. Both the solid shell and contents are reconstructed by every intersecting chunk. */
export class UndergroundPools {
  private readonly allowed = new Map<string, boolean>();
  constructor(private readonly seed: number) {}

  /** One water basin and one deeper lava basin per grid square, independent of chunk load order. */
  poolAt(gx: number, gz: number, lava: boolean): UndergroundPool {
    const seed = this.seed + (lava ? 710 : 700);
    return {
      x: gx * SPACING + Math.floor(hash2(seed, gx, gz) * SPACING),
      z: gz * SPACING + Math.floor(hash2(seed + 1, gx, gz) * SPACING),
      y: roundBlocks((lava ? POOL_LAVA_LEVEL_M : POOL_WATER_LEVEL_M) - hash2(seed + 2, gx, gz) * (lava ? POOL_LAVA_DEPTH_RANGE_M : POOL_WATER_DEPTH_RANGE_M)),
      radius: roundBlocks((lava ? POOL_LAVA_RADIUS_M : POOL_WATER_RADIUS_M) + hash2(seed + 3, gx, gz) * (lava ? POOL_LAVA_RADIUS_RANGE_M : POOL_WATER_RADIUS_RANGE_M)),
      halfHeight: roundBlocks(POOL_HALF_HEIGHT_M),
      fluid: lava ? BlockId.LAVA : BlockId.WATER,
    };
  }

  fill(cx: number, cz: number, y0: number, y1: number, out: Uint16Array, surfaceAt: (x: number, z: number) => number): void {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let gz = Math.floor((z0 - REACH) / SPACING); gz <= Math.floor((z0 + CHUNK_SIZE - 1 + REACH) / SPACING); gz++)
      for (let gx = Math.floor((x0 - REACH) / SPACING); gx <= Math.floor((x0 + CHUNK_SIZE - 1 + REACH) / SPACING); gx++)
        for (const lava of [false, true]) {
          const p = this.poolAt(gx, gz, lava), r = p.radius + SHELL, ry = p.halfHeight + SHELL;
          if (p.x + r < x0 || p.x - r >= x0 + CHUNK_SIZE || p.z + r < z0 || p.z - r >= z0 + CHUNK_SIZE || p.y + ry < y0 || p.y - ry >= y1) continue;
          const key = `${gx},${gz},${lava}`;
          let allowed = this.allowed.get(key);
          if (allowed === undefined) {
            // Reject the whole feature if any part of its shell would cut the protected roof.
            // The same global footprint check is used by every chunk, avoiding clipped basins.
            allowed = true;
            outer: for (let z = p.z - r; z <= p.z + r; z++) for (let x = p.x - r; x <= p.x + r; x++) {
              const horizontal = (x - p.x) ** 2 + (z - p.z) ** 2;
              if (horizontal > r * r) continue;
              const top = p.y + Math.floor(ry * Math.sqrt(1 - horizontal / (r * r)));
              if (top > surfaceAt(x, z) - SHORE_ROOF) { allowed = false; break outer; }
            }
            if (this.allowed.size >= POOL_CACHE_LIMIT) this.allowed.clear();
            this.allowed.set(key, allowed);
          }
          if (!allowed) continue;
          for (let z = Math.max(z0, p.z - r); z <= Math.min(z0 + CHUNK_SIZE - 1, p.z + r); z++)
            for (let x = Math.max(x0, p.x - r); x <= Math.min(x0 + CHUNK_SIZE - 1, p.x + r); x++) {
              const dx = x - p.x, dz = z - p.z;
              const horizontal = dx * dx + dz * dz;
              if (horizontal > r * r) continue;
              const roof = surfaceAt(x, z) - SHORE_ROOF;
              for (let y = Math.max(y0, p.y - ry, TERRAIN_CHUNK_BOTTOM * CHUNK_SIZE + CAVE_BOTTOM_ROWS); y <= Math.min(y1 - 1, p.y + ry, roof); y++) {
                const dy = y - p.y;
                if (horizontal / (r * r) + dy * dy / (ry * ry) > 1) continue;
                const inside = horizontal / (p.radius * p.radius) + dy * dy / (p.halfHeight * p.halfHeight) < 1;
                const id = inside ? (y <= p.y ? p.fluid : BlockId.AIR) : (lava ? BlockId.BASALT : BlockId.STONE);
                out[localIndex(x - x0, y - y0, z - z0)] = id;
              }
            }
        }
  }
}
