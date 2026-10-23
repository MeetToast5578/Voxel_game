import { CHUNK_SIZE, WIND_LEAF_SWAY_M, WIND_PLANT_SWAY_M, metersToBlocks } from '../config';
import { localIndex } from '../core/coords';
import { BLOCK_REGISTRY, BlockId, EMISSION_TABLE, OPAQUE_TABLE, blockTopHeight, blockBottomHeight, blockFaceTile } from '../world/blocks';
import {
  LIGHT_CURVE,
  REGION_SIZE,
  buildRegion,
  computeBlockLight,
  computeSkyLight,
  neighborIndex,
  regionIndex,
} from '../world/light';
import { MeshTints, type TintKind } from '../world/climateTint';
import { FACES } from './faces';
import { ATLAS_TILES, tileUV } from './tiles';

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  /** Per vertex: [sky brightness, block brightness], each 0..1 (LIGHT_CURVE applied). */
  light: Float32Array;
  /** Per vertex: how far wind moves it at full strength, in blocks (T-F5). 0 for everything but foliage. */
  sway: Float32Array;
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
const CENTER = 13; // neighborIndex(0, 0, 0)
/** The two diagonal quads of a cross block (plants). Corners as in FACES: counter-clockwise from the front. */
const CROSS_QUADS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
  [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]],
];

/*
 * Everything that depends only on the block state is resolved once, into flat typed arrays, so the inner loop does
 * no object lookups, no string comparisons and no allocation. These tables are derived from the registry, so a new
 * block type is picked up automatically.
 */
const CROSS_SHAPE = 1;
const TRANSLUCENT_LAYER = 1;
const STATE_COUNT = BLOCK_REGISTRY.stateCount;
const CROSS_TABLE = new Uint8Array(STATE_COUNT);
const TINT_KIND = new Uint8Array(STATE_COUNT);
const TRANSLUCENT_TABLE = new Uint8Array(STATE_COUNT);
const CULL_SAME_TABLE = new Uint8Array(STATE_COUNT);
const BOTTOM_HEIGHT_TABLE = new Float64Array(STATE_COUNT);
const SLAB_TABLE = new Uint8Array(STATE_COUNT);
const TOP_HEIGHT_TABLE = new Float64Array(STATE_COUNT);
/** Tile index per state and axis: [top, side, bottom]. */
const TILE_TABLE = new Uint8Array(STATE_COUNT * 3);
/** Wind sway per state: leaf blocks move as a whole, plants only at their top corners (their base stays rooted). */
const SWAY_TABLE = new Float32Array(STATE_COUNT);
const FACE_TILES = new Uint8Array(STATE_COUNT * 6);
for (let state = 0; state < STATE_COUNT; state++) {
  const def = BLOCK_REGISTRY.getBlockDef(state);
  FACES.forEach((face, f) => { FACE_TILES[state * 6 + f] = blockFaceTile(state, ...face.dir); });
  const tintKey = BLOCK_REGISTRY.getBlockDef(def.slabMaterial ?? state).key;
  TINT_KIND[state] = tintKey === 'grass' ? 1 : tintKey === 'leaves' ? 2 : tintKey === 'water' || tintKey === 'flowing_water' ? 3 : 0;
  CROSS_TABLE[state] = def.shape === 'cross' ? CROSS_SHAPE : 0;
  if (tintKey === 'leaves') SWAY_TABLE[state] = metersToBlocks(WIND_LEAF_SWAY_M);
  else if (def.shape === 'cross' && !def.key.endsWith('mushroom')) SWAY_TABLE[state] = metersToBlocks(WIND_PLANT_SWAY_M);
  TRANSLUCENT_TABLE[state] = def.layer === 'translucent' ? TRANSLUCENT_LAYER : 0;
  CULL_SAME_TABLE[state] = def.cullSame ? 1 : 0;
  BOTTOM_HEIGHT_TABLE[state] = blockBottomHeight(state);
  SLAB_TABLE[state] = def.shape === 'slab' ? 1 : 0;
  TOP_HEIGHT_TABLE[state] = blockTopHeight(state);
  TILE_TABLE[state * 3] = blockFaceTile(state, 0, 1, 0);
  TILE_TABLE[state * 3 + 1] = blockFaceTile(state, 1, 0, 0);
  TILE_TABLE[state * 3 + 2] = blockFaceTile(state, 0, -1, 0);
}
/** UV rectangle per atlas tile: [u0, v0, u1, v1]. */
const TILE_COUNT = ATLAS_TILES * ATLAS_TILES;
const UV_TABLE = new Float32Array(TILE_COUNT * 4);
for (let tile = 0; tile < TILE_COUNT; tile++) {
  const uv = tileUV(tile);
  UV_TABLE[tile * 4] = uv.u0;
  UV_TABLE[tile * 4 + 1] = uv.v0;
  UV_TABLE[tile * 4 + 2] = uv.u1;
  UV_TABLE[tile * 4 + 3] = uv.v1;
}

/** Per face: the region-array index offset of the cell the face looks at. */
const FACE_REGION_OFFSET = new Int32Array(6);
/** Per face: the padded-volume index offset of the cell the face looks at. */
const FACE_NEIGHBOR = new Int32Array(6);
/** Per face: shade multiplier from the face normal. */
const FACE_SHADE = new Float64Array(6);
/** Per face and vertex: the [side1, side2, corner] AO sample offsets, flat: ((face * 4) + vertex) * 3. */
const FACE_AO = new Int32Array(6 * 4 * 3);
/** Per face and vertex: corner position, flat: ((face * 4) + vertex) * 3. */
const FACE_CORNERS = new Float64Array(6 * 4 * 3);
/** Per face and vertex: which UV edge that corner takes (0 = u0/v0, 1 = u1/v1). */
const FACE_UV_U = new Uint8Array(6 * 4);
const FACE_UV_V = new Uint8Array(6 * 4);
/** Per face and vertex: AO falloff for AO levels 0..3. */
const AO_LEVELS = new Float64Array([0.5, 0.7, 0.85, 1.0]);

for (let f = 0; f < 6; f++) {
  const face = FACES[f]!;
  FACE_NEIGHBOR[f] = face.dir[0] * STRIDE_X + face.dir[1] * STRIDE_Y + face.dir[2] * STRIDE_Z;
  FACE_REGION_OFFSET[f] = face.dir[0] + face.dir[1] * REGION_SIZE * REGION_SIZE + face.dir[2] * REGION_SIZE;
  FACE_SHADE[f] = face.shade;
  const normalAxis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2;
  const [ua, va] = [0, 1, 2].filter((a) => a !== normalAxis) as [number, number];
  for (let k = 0; k < 4; k++) {
    const corner = face.corners[k]!;
    const at = f * 4 + k;
    FACE_CORNERS[at * 3] = corner[0];
    FACE_CORNERS[at * 3 + 1] = corner[1];
    FACE_CORNERS[at * 3 + 2] = corner[2];
    const uSel = k === 0 || k === 3 ? 0 : 1;
    const vSel = k < 2 ? 0 : 1;
    FACE_UV_U[at] = uSel;
    FACE_UV_V[at] = vSel;
    const su = (corner[ua]! * 2 - 1) * AXIS_STRIDE[ua as 0 | 1 | 2];
    const sv = (corner[va]! * 2 - 1) * AXIS_STRIDE[va as 0 | 1 | 2];
    FACE_AO[at * 3] = su;
    FACE_AO[at * 3 + 1] = sv;
    FACE_AO[at * 3 + 2] = su + sv;
  }
}

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
function paddedFromRegion(region: Uint16Array, vol: Uint16Array): Uint16Array {
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
  const opaque = OPAQUE_TABLE;
  let allOpaque = true;
  for (let i = 0; i < center.length; i++) {
    if (opaque[center[i]!] === 0) {
      allOpaque = false;
      break;
    }
  }
  if (!allOpaque) return false;
  const last = CHUNK_SIZE - 1;
  for (let a = 0; a < CHUNK_SIZE; a++)
    for (let b = 0; b < CHUNK_SIZE; b++) {
      if (
        opaque[neighbors[neighborIndex(-1, 0, 0)]![localIndex(last, a, b)]!] === 0 ||
        opaque[neighbors[neighborIndex(1, 0, 0)]![localIndex(0, a, b)]!] === 0 ||
        opaque[neighbors[neighborIndex(0, -1, 0)]![localIndex(a, last, b)]!] === 0 ||
        opaque[neighbors[neighborIndex(0, 1, 0)]![localIndex(a, 0, b)]!] === 0 ||
        opaque[neighbors[neighborIndex(0, 0, -1)]![localIndex(a, b, last)]!] === 0 ||
        opaque[neighbors[neighborIndex(0, 0, 1)]![localIndex(a, b, 0)]!] === 0
      )
        return false;
    }
  return true;
}

/** A chunk centre is empty only if every state in it is air. */
function allAir(blocks: Uint16Array): boolean {
  for (let i = 0; i < blocks.length; i++) if (blocks[i] !== BlockId.AIR) return false;
  return true;
}

const INITIAL_VERTICES = 512;

/**
 * Writes quads straight into growable typed arrays. Building into typed arrays instead of number[] boxes avoids
 * per-value boxing, array growth and a final conversion copy; `build` slices each buffer down to its exact size.
 */
class MeshBuilder {
  vertexCount = 0;
  indexCount = 0;
  private capacity = 0;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private colors = new Float32Array(0);
  private light = new Float32Array(0);
  private sway = new Float32Array(0);
  private indices = new Uint32Array(0);

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** Makes room for `vertices` more vertices and `indices` more indices. */
  reserve(vertices: number, indices: number): void {
    const neededVertices = this.vertexCount + vertices;
    if (neededVertices > this.capacity) {
      let capacity = Math.max(INITIAL_VERTICES, this.capacity * 2);
      while (capacity < neededVertices) capacity *= 2;
      this.positions = grow(this.positions, capacity * 3);
      this.uvs = grow(this.uvs, capacity * 2);
      this.colors = grow(this.colors, capacity * 3);
      this.light = grow(this.light, capacity * 2);
      this.sway = grow(this.sway, capacity);
      this.indices = growIndices(this.indices, Math.max(capacity * 6, this.indexCount + indices));
      this.capacity = capacity;
    } else if (this.indexCount + indices > this.indices.length) {
      this.indices = growIndices(this.indices, Math.max(this.capacity * 6, this.indexCount + indices));
    }
  }

  /** Position offset in floats for the next vertex. */
  get positionOffset(): number {
    return this.vertexCount * 3;
  }

  /** UV offset in floats for the next vertex. */
  get uvOffset(): number {
    return this.vertexCount * 2;
  }

  get indexOffset(): number {
    return this.indexCount;
  }

  writePosition(offset: number, x: number, y: number, z: number): void {
    const p = this.positions;
    p[offset] = x;
    p[offset + 1] = y;
    p[offset + 2] = z;
  }

  writeUV(offset: number, u: number, v: number): void {
    const p = this.uvs;
    p[offset] = u;
    p[offset + 1] = v;
  }

  writeColor(offset: number, r: number, g: number, b: number): void {
    const p = this.colors;
    p[offset] = r;
    p[offset + 1] = g;
    p[offset + 2] = b;
  }

  writeLight(offset: number, sky: number, block: number): void {
    const p = this.light;
    p[offset] = sky;
    p[offset + 1] = block;
  }

  /** Sway for the next vertex. Always written, because the buffers are reused between chunks. */
  writeSway(sway: number): void {
    this.sway[this.vertexCount] = sway;
  }

  writeIndices(offset: number, i0: number, i1: number, i2: number, i3: number, i4: number, i5: number): void {
    const p = this.indices;
    p[offset] = i0;
    p[offset + 1] = i1;
    p[offset + 2] = i2;
    p[offset + 3] = i3;
    p[offset + 4] = i4;
    p[offset + 5] = i5;
  }

  build(): MeshData {
    return {
      positions: this.positions.slice(0, this.vertexCount * 3),
      uvs: this.uvs.slice(0, this.vertexCount * 2),
      colors: this.colors.slice(0, this.vertexCount * 3),
      light: this.light.slice(0, this.vertexCount * 2),
      sway: this.sway.slice(0, this.vertexCount),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}

function grow(source: Float32Array, size: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(source);
  return next;
}

function growIndices(source: Uint32Array, size: number): Uint32Array<ArrayBuffer> {
  const next = new Uint32Array(size);
  next.set(source);
  return next;
}

/*
 * Scratch buffers reused by every mesh call. Meshing is synchronous and single-threaded per worker, so one set per
 * module is safe; `build()` copies out exact-size arrays, so no caller can observe the reuse. This removes roughly
 * 460 KB of allocation and zeroing per chunk (region 221 KB, two light volumes 110 KB each) and their GC pressure.
 */
const scratchRegion = new Uint16Array(REGION_SIZE * REGION_SIZE * REGION_SIZE);
const scratchSkyLight = new Uint8Array(REGION_SIZE * REGION_SIZE * REGION_SIZE);
const scratchBlockLight = new Uint8Array(REGION_SIZE * REGION_SIZE * REGION_SIZE);
const scratchVolume = new Uint16Array(P * P * P);
const pooledSolid = new MeshBuilder();
const pooledTranslucent = new MeshBuilder();

function emptyMesh(): ChunkMeshData {
  pooledSolid.reset();
  pooledTranslucent.reset();
  return { solid: pooledSolid.build(), translucent: pooledTranslucent.build() };
}

/**
 * Meshes chunk (cx, cy, cz). neighbors: the 27 block arrays around it (see buildPaddedVolume). tops: the 9
 * column-top arrays around its column, index (dz + 1) * 3 + (dx + 1). Positions are relative to the chunk origin.
 */
export function buildChunkMesh(neighbors: readonly Uint16Array[], tops: readonly Int32Array[], cy: number, context?: { seed: number; cx: number; cz: number }): ChunkMeshData {
  if (neighbors.length !== 27) throw new Error('buildChunkMesh needs 27 chunks');
  if (tops.length !== 9) throw new Error('buildChunkMesh needs 9 column-top arrays');
  // Quick exits; both give exactly what full meshing would (no faces), without computing light.
  if (allAir(neighbors[CENTER]!)) return emptyMesh();
  if (fullyHidden(neighbors)) return emptyMesh();

  const tints = context && neighbors[CENTER]!.some(id => TINT_KIND[id]! > 0) ? new MeshTints(context.seed, context.cx, cy, context.cz) : null;
  const region = buildRegion(neighbors, scratchRegion);
  const vol = paddedFromRegion(region, scratchVolume);
  const opaque = OPAQUE_TABLE;
  const skyLight = computeSkyLight(region, tops, (cy - 1) * CHUNK_SIZE, scratchSkyLight);
  const blockLight = computeBlockLight(region, scratchBlockLight);
  pooledSolid.reset();
  pooledTranslucent.reset();
  const solid = pooledSolid;
  const translucent = pooledTranslucent;
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      let i = padIndex(1, y + 1, lz + 1);
      let r = regionIndex(CHUNK_SIZE, y + CHUNK_SIZE, lz + CHUNK_SIZE);
      for (let lx = 0; lx < CHUNK_SIZE; lx++, i++, r++) {
        const id = vol[i]!;
        if (id === BlockId.AIR) continue;
        if (CROSS_TABLE[id] === CROSS_SHAPE) {
          // Plants: two diagonal quads, each drawn from both sides, lit by their own cell. No neighbour culling.
          const skyB = LIGHT_CURVE[skyLight[r]!]!;
          const blkB = LIGHT_CURVE[blockLight[r]! > EMISSION_TABLE[id]! ? blockLight[r]! : EMISSION_TABLE[id]!]!;
          const uvAt = TILE_TABLE[id * 3 + 1]! * 4;
          const u0 = UV_TABLE[uvAt]!;
          const v0 = UV_TABLE[uvAt + 1]!;
          const u1 = UV_TABLE[uvAt + 2]!;
          const v1 = UV_TABLE[uvAt + 3]!;
          solid.reserve(8, 24);
          const start = solid.vertexCount;
          for (const quad of CROSS_QUADS) {
            let positionOffset = solid.positionOffset;
            let uvOffset = solid.uvOffset;
            let lightOffset = solid.vertexCount * 2;
            for (let k = 0; k < 4; k++) {
              const c = quad[k]!;
              solid.writePosition(positionOffset, lx + c[0], y + c[1], lz + c[2]);
              const at = k;
              solid.writeUV(uvOffset, FACE_UV_U[at] === 0 ? u0 : u1, FACE_UV_V[at] === 0 ? v0 : v1);
              solid.writeColor(positionOffset, 1, 1, 1);
              solid.writeLight(lightOffset, skyB, blkB);
              solid.writeSway(c[1] === 1 ? SWAY_TABLE[id]! : 0);
              solid.vertexCount++;
              positionOffset += 3;
              uvOffset += 2;
              lightOffset += 2;
            }
          }
          // Both windings, so each quad is visible from either side.
          const second = start + 4;
          let io = solid.indexOffset;
          solid.writeIndices(io, start, start + 1, start + 2, start, start + 2, start + 3);
          io += 6;
          solid.writeIndices(io, start, start + 2, start + 1, start, start + 3, start + 2);
          io += 6;
          solid.writeIndices(io, second, second + 1, second + 2, second, second + 2, second + 3);
          io += 6;
          solid.writeIndices(io, second, second + 2, second + 1, second, second + 3, second + 2);
          solid.indexCount += 24;
          continue;
        }
        const out = TRANSLUCENT_TABLE[id] === TRANSLUCENT_LAYER ? translucent : solid;
        const cullSame = CULL_SAME_TABLE[id] === 1;
        const emission = EMISSION_TABLE[id]!;
        const top = TOP_HEIGHT_TABLE[id]!;
        const bottom = BOTTOM_HEIGHT_TABLE[id]!;

        for (let f = 0; f < 6; f++) {
          const n = i + FACE_NEIGHBOR[f]!;
          const nid = vol[n]!;
          // A slab's interior horizontal face is not covered by the neighbouring cell.
          if (opaque[nid] === 1 && !(SLAB_TABLE[id] && ((FACES[f]!.dir[1] === 1 && top < 1) || (FACES[f]!.dir[1] === -1 && bottom > 0)))) continue;
          if (cullSame && nid === id) continue;

          const aoAt = f * 4 * 3;
          const side1 = opaque[vol[n + FACE_AO[aoAt]!]!]!;
          const side2 = opaque[vol[n + FACE_AO[aoAt + 1]!]!]!;
          const corner = opaque[vol[n + FACE_AO[aoAt + 2]!]!]!;
          ao[0] = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
          const side1b = opaque[vol[n + FACE_AO[aoAt + 3]!]!]!;
          const side2b = opaque[vol[n + FACE_AO[aoAt + 4]!]!]!;
          const cornerb = opaque[vol[n + FACE_AO[aoAt + 5]!]!]!;
          ao[1] = side1b && side2b ? 0 : 3 - (side1b + side2b + cornerb);
          const side1c = opaque[vol[n + FACE_AO[aoAt + 6]!]!]!;
          const side2c = opaque[vol[n + FACE_AO[aoAt + 7]!]!]!;
          const cornerc = opaque[vol[n + FACE_AO[aoAt + 8]!]!]!;
          ao[2] = side1c && side2c ? 0 : 3 - (side1c + side2c + cornerc);
          const side1d = opaque[vol[n + FACE_AO[aoAt + 9]!]!]!;
          const side2d = opaque[vol[n + FACE_AO[aoAt + 10]!]!]!;
          const cornerd = opaque[vol[n + FACE_AO[aoAt + 11]!]!]!;
          ao[3] = side1d && side2d ? 0 : 3 - (side1d + side2d + cornerd);

          // Flat lighting: the whole face uses the light of the cell it faces (always inside the region).
          const rf = r + FACE_REGION_OFFSET[f]!;
          const blk = blockLight[rf]! > emission ? blockLight[rf]! : emission; // glowing blocks are always fully lit
          const skyB = LIGHT_CURVE[skyLight[rf]!]!;
          const blkB = LIGHT_CURVE[blk]!;

          const tile = FACE_TILES[id * 6 + f]!;
          const u0 = UV_TABLE[tile * 4]!;
          const v0 = UV_TABLE[tile * 4 + 1]!;
          const u1 = UV_TABLE[tile * 4 + 2]!;
          const v1 = UV_TABLE[tile * 4 + 3]!;
          const shade = FACE_SHADE[f]!;

          out.reserve(4, 6);
          const base = out.vertexCount;
          let positionOffset = out.positionOffset;
          let uvOffset = out.uvOffset;
          let lightOffset = out.vertexCount * 2;
          for (let k = 0; k < 4; k++) {
            const at = f * 4 + k;
            // Flowing water stands lower than a full block: its top corners sit at its level (spec 25, slice 4).
            const cyCorner = FACE_CORNERS[at * 3 + 1]!;
            out.writePosition(
              positionOffset,
              lx + FACE_CORNERS[at * 3]!,
              y + (cyCorner === 1 ? top : bottom),
              lz + FACE_CORNERS[at * 3 + 2]!,
            );
            out.writeUV(uvOffset, FACE_UV_U[at] === 0 ? u0 : u1, FACE_UV_V[at] === 0 ? v0 : v1);
            const brightness = shade * AO_LEVELS[ao[k]!]!;
            const tint = TINT_KIND[id]!;
            if (tints && tint) {
              tints.sample(lx + FACE_CORNERS[at * 3]!, y + (cyCorner === 1 ? top : bottom), lz + FACE_CORNERS[at * 3 + 2]!, tint as TintKind);
              out.writeColor(positionOffset, brightness * tints.r, brightness * tints.g, brightness * tints.b);
            } else out.writeColor(positionOffset, brightness, brightness, brightness);
            out.writeLight(lightOffset, skyB, blkB);
            out.writeSway(SWAY_TABLE[id]!);
            out.vertexCount++;
            positionOffset += 3;
            uvOffset += 2;
            lightOffset += 2;
          }
          // Split the quad along the brighter diagonal to avoid AO artifacts.
          if (ao[0]! + ao[2]! >= ao[1]! + ao[3]!) {
            out.writeIndices(out.indexOffset, base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            out.writeIndices(out.indexOffset, base + 1, base + 2, base + 3, base + 1, base + 3, base);
          }
          out.indexCount += 6;
        }
      }
    }
  }
  return { solid: solid.build(), translucent: translucent.build() };
}
