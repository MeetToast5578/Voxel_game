import { CHUNK_SIZE, WORLD_HEIGHT } from '../config';
import { localIndex } from '../core/coords';
import { BlockId, getBlockDef, isOpaque, lightEmission } from '../world/blocks';
import { LIGHT_CURVE, MAX_LIGHT, buildRegion, computeBlockLight, computeSkyLight, regionIndex } from '../world/light';
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
const PH = WORLD_HEIGHT + 2;
const STRIDE_X = 1;
const STRIDE_Z = P;
const STRIDE_Y = P * P;
const AXIS_STRIDE = [STRIDE_X, STRIDE_Y, STRIDE_Z] as const;
const AO_LEVELS = [0.5, 0.7, 0.85, 1.0] as const;

export function padIndex(px: number, py: number, pz: number): number {
  return (py * P + pz) * P + px;
}

/**
 * neighbors: 9 chunk block arrays, index (dz + 1) * 3 + (dx + 1); center chunk is index 4.
 * Returns an (18 x 130 x 18) volume: the center chunk plus a 1-block border on every side.
 */
export function buildPaddedVolume(neighbors: readonly Uint16Array[]): Uint16Array {
  const vol = new Uint16Array(P * P * PH);
  vol.fill(BlockId.BEDROCK, 0, STRIDE_Y); // y = -1 is solid so bottom faces at y = 0 are never built
  for (let pz = 0; pz < P; pz++) {
    const rz = pz - 1;
    const dz = rz < 0 ? -1 : rz >= CHUNK_SIZE ? 1 : 0;
    const lz = rz - dz * CHUNK_SIZE;
    for (let px = 0; px < P; px++) {
      const rx = px - 1;
      const dx = rx < 0 ? -1 : rx >= CHUNK_SIZE ? 1 : 0;
      const lx = rx - dx * CHUNK_SIZE;
      const src = neighbors[(dz + 1) * 3 + (dx + 1)];
      if (!src) throw new Error('buildPaddedVolume needs 9 chunks');
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        vol[padIndex(px, y + 1, pz)] = src[localIndex(lx, y, lz)]!;
      }
    }
  }
  return vol;
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

export function buildChunkMesh(neighbors: readonly Uint16Array[]): ChunkMeshData {
  const vol = buildPaddedVolume(neighbors);
  const region = buildRegion(neighbors);
  const skyLight = computeSkyLight(region);
  const blockLight = computeBlockLight(region);
  const solid = new MeshBuilder();
  const translucent = new MeshBuilder();
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = padIndex(lx + 1, y + 1, lz + 1);
        const id = vol[i]!;
        if (id === BlockId.AIR) continue;
        const def = getBlockDef(id);
        const out = def.layer === 'translucent' ? translucent : solid;

        for (let f = 0; f < 6; f++) {
          const n = i + FACE_NEIGHBOR[f]!;
          const nid = vol[n]!;
          if (isOpaque(nid)) continue;
          if (nid === id && def.cullSame) continue;

          const face = FACES[f]!;
          const aoOffsets = FACE_AO[f]!;
          for (let k = 0; k < 4; k++) {
            const [s1, s2, c] = aoOffsets[k]!;
            const side1 = isOpaque(vol[n + s1]!) ? 1 : 0;
            const side2 = isOpaque(vol[n + s2]!) ? 1 : 0;
            const corner = isOpaque(vol[n + c]!) ? 1 : 0;
            ao[k] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
          }

          // Flat lighting: the whole face uses the light of the cell it faces.
          const ny = y + face.dir[1];
          let sky = MAX_LIGHT;
          let blk = 0;
          if (ny >= 0 && ny < WORLD_HEIGHT) {
            const r = regionIndex(lx + CHUNK_SIZE + face.dir[0], ny, lz + CHUNK_SIZE + face.dir[2]);
            sky = skyLight[r]!;
            blk = blockLight[r]!;
          }
          blk = Math.max(blk, lightEmission(id)); // glowing blocks are always fully lit
          const skyB = LIGHT_CURVE[sky]!;
          const blkB = LIGHT_CURVE[blk]!;

          const uv = tileUV(def.tiles[face.tile]);
          const base = out.vertexCount;
          for (let k = 0; k < 4; k++) {
            const corner = face.corners[k]!;
            out.positions.push(lx + corner[0], y + corner[1], lz + corner[2]);
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
