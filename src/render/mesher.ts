import { CHUNK_SIZE } from '../config';
import { localIndex } from '../core/coords';
import { BlockId, EMISSION_TABLE, OPAQUE_TABLE, blockTopHeight, getBlockDef, isOpaque } from '../world/blocks';
import { LIGHT_CURVE, buildRegion, computeBlockLight, computeSkyLight, neighborIndex, regionIndex } from '../world/light';
import { FACES, FACE_UVS } from './faces';
import { tileUV } from './tiles';

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  /** Per vertex: [sky brightness, block brightness], each 0..1 (LIGHT_CURVE applied). */
  light: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshData {
  solid: MeshData;
  translucent: MeshData;
}

const P = CHUNK_SIZE + 2;
const STRIDE_X = 1;
const STRIDE_Z = P;
const STRIDE_Y = P * P;
const AXIS_STRIDE = [STRIDE_X, STRIDE_Y, STRIDE_Z] as const;
const AO_LEVELS = [0.5, 0.7, 0.85, 1.0] as const;
const CENTER = 13; // neighborIndex(0, 0, 0)
/** The two diagonal quads of a cross block (plants). Corners as in FACES: counter-clockwise from the front. */
const CROSS_QUADS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
  [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]],
];

export function padIndex(px: number, py: number, pz: number): number {
  return (py * P + pz) * P + px;
}

/** Which neighbour chunk (-1, 0, 1) and local coordinate a padded coordinate 0..17 falls in. */
function split(p: number): [number, number] {
  const r = p - 1;
  const d = r < 0 ? -1 : r >= CHUNK_SIZE ? 1 : 0;
  return [d, r - d * CHUNK_SIZE];
}

/**
 * neighbors: 27 chunk block arrays, index (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1); the centre chunk is index 13.
 * Returns an 18 x 18 x 18 volume: the centre chunk plus a 1-block border on every side.
 */
export function buildPaddedVolume(neighbors: readonly Uint16Array[]): Uint16Array {
  if (neighbors.length !== 27) throw new Error('buildPaddedVolume needs 27 chunks');
  const vol = new Uint16Array(P * P * P);
  for (let py = 0; py < P; py++) {
    const [dy, ly] = split(py);
    for (let pz = 0; pz < P; pz++) {
      const [dz, lz] = split(pz);
      for (let px = 0; px < P; px++) {
        const [dx, lx] = split(px);
        vol[padIndex(px, py, pz)] = neighbors[neighborIndex(dx, dy, dz)]![localIndex(lx, ly, lz)]!;
      }
    }
  }
  return vol;
}

/** The padded volume cut out of a light region (which already holds the 27 chunks). */
function paddedFromRegion(region: Uint16Array): Uint16Array {
  const vol = new Uint16Array(P * P * P);
  for (let py = 0; py < P; py++)
    for (let pz = 0; pz < P; pz++) {
      const to = padIndex(0, py, pz);
      const from = regionIndex(CHUNK_SIZE - 1, CHUNK_SIZE - 1 + py, CHUNK_SIZE - 1 + pz);
      for (let px = 0; px < P; px++) vol[to + px] = region[from + px]!;
    }
  return vol;
}

/** True if no face of the centre chunk can be visible: it is all opaque and so is every cell touching it. */
function fullyHidden(neighbors: readonly Uint16Array[]): boolean {
  const center = neighbors[CENTER]!;
  for (let i = 0; i < center.length; i++) if (!isOpaque(center[i]!)) return false;
  const last = CHUNK_SIZE - 1;
  for (let a = 0; a < CHUNK_SIZE; a++)
    for (let b = 0; b < CHUNK_SIZE; b++) {
      if (
        !isOpaque(neighbors[neighborIndex(-1, 0, 0)]![localIndex(last, a, b)]!) ||
        !isOpaque(neighbors[neighborIndex(1, 0, 0)]![localIndex(0, a, b)]!) ||
        !isOpaque(neighbors[neighborIndex(0, -1, 0)]![localIndex(a, last, b)]!) ||
        !isOpaque(neighbors[neighborIndex(0, 1, 0)]![localIndex(a, 0, b)]!) ||
        !isOpaque(neighbors[neighborIndex(0, 0, -1)]![localIndex(a, b, last)]!) ||
        !isOpaque(neighbors[neighborIndex(0, 0, 1)]![localIndex(a, b, 0)]!)
      )
        return false;
    }
  return true;
}

// Precomputed per face: neighbor offset and, per vertex, the [side1, side2, corner] AO sample offsets.
const FACE_NEIGHBOR = FACES.map((f) => f.dir[0] * STRIDE_X + f.dir[1] * STRIDE_Y + f.dir[2] * STRIDE_Z);
const FACE_AO = FACES.map((f) => {
  const normalAxis = f.dir[0] !== 0 ? 0 : f.dir[1] !== 0 ? 1 : 2;
  const [ua, va] = [0, 1, 2].filter((a) => a !== normalAxis) as [number, number];
  return f.corners.map((c) => {
    const su = (c[ua]! * 2 - 1) * AXIS_STRIDE[ua as 0 | 1 | 2];
    const sv = (c[va]! * 2 - 1) * AXIS_STRIDE[va as 0 | 1 | 2];
    return [su, sv, su + sv] as const;
  });
});

class MeshBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  light: number[] = [];
  indices: number[] = [];
  vertexCount = 0;

  build(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      light: new Float32Array(this.light),
      indices: new Uint32Array(this.indices),
    };
  }
}

function emptyMesh(): ChunkMeshData {
  return { solid: new MeshBuilder().build(), translucent: new MeshBuilder().build() };
}

/**
 * Meshes chunk (cx, cy, cz). neighbors: the 27 block arrays around it (see buildPaddedVolume). tops: the 9
 * column-top arrays around its column, index (dz + 1) * 3 + (dx + 1). Positions are relative to the chunk origin.
 */
export function buildChunkMesh(neighbors: readonly Uint16Array[], tops: readonly Int32Array[], cy: number): ChunkMeshData {
  if (neighbors.length !== 27) throw new Error('buildChunkMesh needs 27 chunks');
  if (tops.length !== 9) throw new Error('buildChunkMesh needs 9 column-top arrays');
  // Quick exits; both give exactly what full meshing would (no faces), without computing light.
  if (neighbors[CENTER]!.every((b) => b === BlockId.AIR)) return emptyMesh();
  if (fullyHidden(neighbors)) return emptyMesh();

  const region = buildRegion(neighbors);
  const vol = paddedFromRegion(region);
  const opaque = OPAQUE_TABLE;
  const skyLight = computeSkyLight(region, tops, (cy - 1) * CHUNK_SIZE);
  const blockLight = computeBlockLight(region);
  const solid = new MeshBuilder();
  const translucent = new MeshBuilder();
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = padIndex(lx + 1, y + 1, lz + 1);
        const id = vol[i]!;
        if (id === BlockId.AIR) continue;
        const def = getBlockDef(id);
        if (def.shape === 'cross') {
          // Plants: two diagonal quads, each drawn from both sides, lit by their own cell. No neighbour culling.
          const r = regionIndex(lx + CHUNK_SIZE, y + CHUNK_SIZE, lz + CHUNK_SIZE);
          const skyB = LIGHT_CURVE[skyLight[r]!]!;
          const blkB = LIGHT_CURVE[Math.max(blockLight[r]!, EMISSION_TABLE[id]!)]!;
          const uv = tileUV(def.tiles.side);
          const base = solid.vertexCount;
          for (const quad of CROSS_QUADS) {
            for (let k = 0; k < 4; k++) {
              const c = quad[k]!;
              solid.positions.push(lx + c[0], y + c[1], lz + c[2]);
              const fu = FACE_UVS[k]!;
              solid.uvs.push(fu[0] === 0 ? uv.u0 : uv.u1, fu[1] === 0 ? uv.v0 : uv.v1);
              solid.colors.push(1, 1, 1);
              solid.light.push(skyB, blkB);
            }
          }
          // Both windings, so each quad is visible from either side.
          const [a, b] = [base, base + 4];
          solid.indices.push(
            a, a + 1, a + 2, a, a + 2, a + 3, a, a + 2, a + 1, a, a + 3, a + 2,
            b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2,
          );
          solid.vertexCount += 8;
          continue;
        }
        const out = def.layer === 'translucent' ? translucent : solid;

        for (let f = 0; f < 6; f++) {
          const n = i + FACE_NEIGHBOR[f]!;
          const nid = vol[n]!;
          if (opaque[nid]) continue;
          if (nid === id && def.cullSame) continue;

          const face = FACES[f]!;
          const aoOffsets = FACE_AO[f]!;
          for (let k = 0; k < 4; k++) {
            const [s1, s2, c] = aoOffsets[k]!;
            const side1 = opaque[vol[n + s1]!]!;
            const side2 = opaque[vol[n + s2]!]!;
            const corner = opaque[vol[n + c]!]!;
            ao[k] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
          }

          // Flat lighting: the whole face uses the light of the cell it faces (always inside the region).
          const r = regionIndex(lx + CHUNK_SIZE + face.dir[0], y + CHUNK_SIZE + face.dir[1], lz + CHUNK_SIZE + face.dir[2]);
          const sky = skyLight[r]!;
          const blk = Math.max(blockLight[r]!, EMISSION_TABLE[id]!); // glowing blocks are always fully lit
          const top = blockTopHeight(id);
          const skyB = LIGHT_CURVE[sky]!;
          const blkB = LIGHT_CURVE[blk]!;

          const uv = tileUV(def.tiles[face.tile]);
          const base = out.vertexCount;
          for (let k = 0; k < 4; k++) {
            const corner = face.corners[k]!;
            // Flowing water stands lower than a full block: its top corners sit at its level (spec 25, slice 4).
            out.positions.push(lx + corner[0], y + (corner[1] === 1 ? top : corner[1]), lz + corner[2]);
            const fu = FACE_UVS[k]!;
            out.uvs.push(fu[0] === 0 ? uv.u0 : uv.u1, fu[1] === 0 ? uv.v0 : uv.v1);
            const brightness = face.shade * AO_LEVELS[ao[k]! as 0 | 1 | 2 | 3];
            out.colors.push(brightness, brightness, brightness);
            out.light.push(skyB, blkB);
          }
          // Split the quad along the brighter diagonal to avoid AO artifacts.
          if (ao[0]! + ao[2]! >= ao[1]! + ao[3]!) {
            out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            out.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          }
          out.vertexCount += 4;
        }
      }
    }
  }
  return { solid: solid.build(), translucent: translucent.build() };
}
