import { CHUNK_SIZE } from '../config';
import { hash2 } from '../core/random';

/** A block emitted by a feature: world coordinates and block state. */
export interface FeatureBlock {
  x: number;
  y: number;
  z: number;
  state: number;
}

/** A registered feature type. */
export interface FeatureDef {
  /** Stable key, e.g. 'tree', 'boulder'. */
  key: string;
  /** Number of anchor grid cells per 16x16 chunk (density hint). */
  densityPerChunk: number;
  /** Maximum horizontal extent of the feature from its anchor, in blocks. */
  maxExtentBlocks: number;
  /** Anchor grid spacing in blocks. Defaults to CHUNK_SIZE / sqrt(densityPerChunk). */
  spacing?: number;
  /**
   * Emit all blocks of the feature rooted at (anchorX, anchorZ).
   * `emit` is called for each block; the caller filters by its own chunk range.
   */
  place: (
    seed: number,
    anchorX: number,
    anchorZ: number,
    emit: (block: FeatureBlock) => void,
  ) => void;
}

/**
 * Anchor-grid spacing: anchors are spaced this far apart on each axis.
 * A smaller spacing means more potential anchor locations.
 */
export const ANCHOR_SPACING_BLOCKS = 16;

/** A stable 32-bit hash (FNV-1a) of a feature key, so two features never share a jitter stream. */
function keySeed(key: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Feature registry: maps feature keys to definitions. Provides deterministic,
 * jittered-grid anchor evaluation so that a chunk can evaluate every anchor whose
 * extent reaches into it and write only its own blocks — features are seamless
 * across chunk borders by construction.
 */
export class FeatureRegistry {
  private readonly features = new Map<string, FeatureDef>();

  /** Register a feature type. Throws on duplicate key. */
  registerFeature(def: FeatureDef): void {
    if (this.features.has(def.key)) throw new Error(`Duplicate feature key '${def.key}'`);
    this.features.set(def.key, def);
  }

  /** Look up a feature by key. */
  getFeature(key: string): FeatureDef | undefined {
    return this.features.get(key);
  }

  /**
   * Evaluate all anchors for all registered features whose extent overlaps the
   * world range [x0, x1) × [z0, z1), y range [y0, y1). Calls `emit` for each
   * block that falls inside the range. Deterministic: same seed and range gives
   * the same blocks regardless of which chunk asks or in what order.
   */
  evaluateAnchors(
    seed: number,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    emit: (block: FeatureBlock) => void,
  ): void {
    for (const def of this.features.values()) {
      // Anchor spacing derived from density: anchors per chunk = densityPerChunk,
      // so spacing^2 = CHUNK_SIZE^2 / densityPerChunk. Override if the feature says so.
      const spacing = def.spacing ?? Math.max(1, Math.round(CHUNK_SIZE / Math.sqrt(def.densityPerChunk)));
      const half = def.maxExtentBlocks;
      // A per-key seed, so two features (even with equal-length keys) jitter independently.
      const ks = keySeed(def.key);

      // Anchor grid cells that could reach into [x0, x1) × [z0, z1).
      const gx0 = Math.floor((x0 - half) / spacing) - 1;
      const gx1 = Math.floor((x1 - 1 + half) / spacing) + 1;
      const gz0 = Math.floor((z0 - half) / spacing) - 1;
      const gz1 = Math.floor((z1 - 1 + half) / spacing) + 1;

      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          // Jitter each anchor within its grid cell, deterministic per (seed, key, gx, gz).
          const jx = hash2(seed + 1000 + ks, gx, gz);
          const jz = hash2(seed + 2000 + ks, gx, gz);
          const ax = gx * spacing + Math.floor(jx * spacing);
          const az = gz * spacing + Math.floor(jz * spacing);

          // Quick reject: anchor's extent cannot reach the range.
          if (ax + half < x0 || ax - half >= x1) continue;
          if (az + half < z0 || az - half >= z1) continue;

          def.place(seed, ax, az, (block) => {
            if (
              block.x >= x0 && block.x < x1 &&
              block.z >= z0 && block.z < z1 &&
              block.y >= y0 && block.y < y1
            ) {
              emit(block);
            }
          });
        }
      }
    }
  }
}
