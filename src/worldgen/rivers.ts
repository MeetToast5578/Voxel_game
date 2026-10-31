import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { RIVER_LEVELS, RIVER_MEANDER_M, RIVER_MEANDER_WAVELENGTH_M, SEA_LEVEL_M } from '../config';
import { hash2, mulberry32 } from '../core/random';
import { heightMeters, type ClimateSampler } from './climate';

/**
 * Rivers and lakes from a world-wide drainage network, with no regions and so no seams between them.
 *
 * Each level is a grid of jittered nodes (finer levels: smaller, more frequent streams). A node drains to the lowest
 * of its eight neighbours on the same grid when that one is lower; the segment between them is a river, its water
 * falling linearly from one node's height to the other's. A node lower than all its neighbours on land holds a lake.
 * Every decision reads only nearby nodes, so any two places agree on the rivers between them, whatever order they
 * are generated in.
 */

export interface WaterSample {
  /** Water surface in meters, or -Infinity where there is no river or lake. */
  level: number;
  /** Highest the ground may be here (meters): the bed under water, a slope down to it on the banks. */
  ground: number;
  /** 1 river, 2 lake, 0 none (banks may still lower the ground). */
  kind: number;
  /** 0..1: how close to the water's edge (1 in the water, falling to 0 at the end of the banks). */
  near: number;
}

interface Node {
  x: number;
  z: number;
  h: number;
  /** Downstream node, or null at a sink or the sea. */
  down: Node | null;
  /** Whether this node's segment carries a river at its level. */
  flows: boolean;
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export class Rivers {
  private readonly nodes = RIVER_LEVELS.map(() => new Map<number, Node>());
  private readonly warpX: NoiseFunction2D;
  private readonly warpZ: NoiseFunction2D;

  constructor(private readonly seed: number, private readonly climate: ClimateSampler) {
    this.warpX = createNoise2D(mulberry32(seed + 950));
    this.warpZ = createNoise2D(mulberry32(seed + 951));
  }

  private height(xM: number, zM: number): number {
    return heightMeters(this.climate.fields(xM, zM));
  }

  /** Node (i, j) of a level: a jittered point in its grid cell, with its height and where it drains. */
  private node(level: number, i: number, j: number, link = true): Node {
    const key = (i + 32768) * 65536 + (j + 32768);
    const cache = this.nodes[level]!;
    let n = cache.get(key);
    if (!n) {
      const s = RIVER_LEVELS[level]!.spacingM, salt = this.seed + 900 + level * 17;
      const x = (i + 0.5 + (hash2(salt, i, j) - 0.5) * 0.6) * s, z = (j + 0.5 + (hash2(salt + 1, i, j) - 0.5) * 0.6) * s;
      n = { x, z, h: this.height(x, z), down: null, flows: hash2(salt + 2, i, j) < RIVER_LEVELS[level]!.share };
      cache.set(key, n);
      if (cache.size > 20000) cache.delete(cache.keys().next().value!);
    }
    if (link && n.down === null && n.h > SEA_LEVEL_M) {
      let best: Node | null = null;
      for (const [di, dj] of N8) {
        const m = this.node(level, i + di, j + dj, false);
        if (m.h < n.h && (!best || m.h < best.h)) best = m;
      }
      n.down = best;
    }
    return n;
  }

  /** Rivers and lakes at a place in meters, given the ground height there before any carving. */
  sample(xM0: number, zM0: number, groundM: number, out: WaterSample): WaterSample {
    // Meanders: the place is shifted by a smooth noise before measuring distances to the straight segments.
    const w = RIVER_MEANDER_WAVELENGTH_M;
    const xM = xM0 + this.warpX(xM0 / w, zM0 / w) * RIVER_MEANDER_M, zM = zM0 + this.warpZ(xM0 / w, zM0 / w) * RIVER_MEANDER_M;
    out.level = -Infinity;
    out.ground = Infinity;
    out.kind = 0;
    out.near = 0;
    for (let level = 0; level < RIVER_LEVELS.length; level++) {
      const def = RIVER_LEVELS[level]!;
      const s = def.spacingM;
      const ci = Math.floor(xM / s), cj = Math.floor(zM / s);
      const bank = def.widthM * 1.5 + 3;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const a = this.node(level, ci + di, cj + dj);
          if (a.h <= SEA_LEVEL_M) continue;
          if (a.down && a.flows) this.segment(a, a.down, xM, zM, groundM, def.widthM / 2, def.depthM, bank, out);
          else if (!a.down) this.lake(a, xM, zM, groundM, s, out);
        }
      }
    }
    return out;
  }

  private segment(a: Node, b: Node, xM: number, zM: number, groundM: number, half: number, depth: number, bank: number,
    out: WaterSample): void {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((xM - a.x) * dx + (zM - a.z) * dz) / len2));
    const d = Math.hypot(xM - (a.x + dx * t), zM - (a.z + dz * t));
    if (d > half + bank) return;
    // The surface falls from one node to the next; where the land dips below it the water follows the land.
    const level = Math.max(SEA_LEVEL_M, Math.min(a.h + (b.h - a.h) * t, groundM - 0.3));
    const near = d <= half ? 1 : 1 - (d - half) / bank;
    if (d <= half) {
      // Deepest in the middle of the channel.
      const bed = level - depth * (0.4 + 0.6 * (1 - d / half));
      if (out.kind === 0 || level < out.level) {
        out.level = level;
        out.kind = 1;
      }
      out.ground = Math.min(out.ground, bed);
    } else {
      // Banks slope from just above the water up to the land.
      out.ground = Math.min(out.ground, level + 0.5 + (d - half) * 0.6);
    }
    out.near = Math.max(out.near, near);
  }

  /** A lake around a sink node: water up to a little above the sink, wherever the land is lower than that. */
  private lake(a: Node, xM: number, zM: number, groundM: number, spacing: number, out: WaterSample): void {
    const r = spacing * 0.22, d = Math.hypot(xM - a.x, zM - a.z);
    if (d > r) return;
    const level = a.h + 1.5;
    if (groundM >= level + 0.5) return;
    if (out.kind === 0) {
      out.level = level;
      out.kind = 2;
    }
    // A bowl: deeper towards the middle.
    out.ground = Math.min(out.ground, level - 0.6 - 2.5 * (1 - d / r));
    out.near = Math.max(out.near, 1);
  }
}
