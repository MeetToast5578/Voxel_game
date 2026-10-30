import { CHUNK_SIZE } from '../config';
import { tileIndex } from '../render/tilePixels';
import { BLOCKS, OPAQUE, type RenderLayer } from './blocks';

/**
 * Chunk mesher. Input is the chunk's cells plus a one-cell border from its neighbours (18³), with their light.
 * Full cubes are merged greedily into larger quads where tile, tint, ambient occlusion and light all match;
 * other shapes are emitted per cell.
 *
 * Each vertex is two uint32 words:
 *  word 0: x | y << 9 | z << 18 (in sixteenths of a cell, 0..256) | ao << 27 (0..3) | normal << 29 (0..7)
 *  word 1: tile (10 bits) | sky << 10 | block << 14 | corner << 18 (u, v bits) | tint kind << 20 | climate << 22 | sway << 30
 * Normals 0..5 are +x, -x, +y, -y, +z, -z; 6 and 7 are the two diagonals of a plant.
 * Quads are 4 vertices drawn as (0, 1, 2) and (0, 2, 3).
 */

export const PAD = CHUNK_SIZE + 2;
export const PAD_VOLUME = PAD * PAD * PAD;
const SY = PAD * PAD;
const SZ = PAD;

/** Index of padded cell (x, y, z), each -1..16. */
export function padIndex(x: number, y: number, z: number): number {
  return ((y + 1) * PAD + (z + 1)) * PAD + (x + 1);
}

export const LAYERS: readonly RenderLayer[] = ['opaque', 'cutout', 'water', 'ice'];

export interface MeshInput {
  /** Block states, PAD_VOLUME long, indexed by padIndex. */
  states: Uint16Array;
  /** Light bytes (sky << 4 | block), PAD_VOLUME long. */
  light: Uint8Array;
  /** Per column cell of the chunk (z * 16 + x): temperature << 4 | humidity, each 0..15. */
  climate: Uint8Array;
}

/** Vertex words per pass, in LAYERS order. Each quad is 8 words. */
export type MeshOutput = Uint32Array[];

// Faces: +x, -x, +y, -y, +z, -z. Corners are counter-clockwise from outside: bottom-left, bottom-right, top-right, top-left.
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
] as const;
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
/** For each face: its normal axis and the two axes of the face plane. */
const AXES = [[0, 2, 1], [0, 2, 1], [1, 0, 2], [1, 0, 2], [2, 0, 1], [2, 0, 1]] as const;
const STRIDE = [1, SY, SZ] as const;

// Per-state tables, built once.
const COUNT = BLOCKS.stateCount;
const FACE_TILE = new Uint16Array(COUNT * 6);
const FACE_TINT = new Uint8Array(COUNT * 6);
const PASS = new Uint8Array(COUNT);
/** 0: no faces; 1: greedy cube; 2: cross plant; 3: box (slab or layer). */
const KIND = new Uint8Array(COUNT);
/** Box shapes: bottom and top height in sixteenths. */
const BOX_Y0 = new Uint8Array(COUNT);
const BOX_Y1 = new Uint8Array(COUNT);
/** Faces between two cells of the same group are hidden (0: no group). */
const GROUP = new Uint16Array(COUNT);
const WATER = new Uint8Array(COUNT);

const TINT_KIND: Record<string, number> = { grass_top: 1, grass_side: 1, tall_grass: 1, fern: 1, leaves: 2 };
for (const t of BLOCKS.types) {
  for (let s = t.id; s < t.id + t.variants; s++) {
    const v = s - t.id;
    PASS[s] = Math.max(0, LAYERS.indexOf(t.layer));
    KIND[s] = t.layer === 'none' ? 0 : t.shape === 'cube' ? 1 : t.shape === 'cross' ? 2 : 3;
    GROUP[s] = t.layer === 'water' ? 0xffff : t.cullSame ? BLOCKS.typeIndex[s]! + 1 : 0;
    WATER[s] = t.layer === 'water' ? 1 : 0;
    if (t.shape === 'slab') {
      BOX_Y0[s] = v === 0 ? 0 : 8;
      BOX_Y1[s] = v === 0 ? 8 : 16;
    } else if (t.shape === 'layer') {
      BOX_Y1[s] = t.key === 'snow' ? (v + 1) * 2 : 1;
    }
    if (KIND[s] === 0) continue;
    for (let f = 0; f < 6; f++) {
      const name = f === 2 ? t.tiles.top : f === 3 ? t.tiles.bottom : t.tiles.side;
      FACE_TILE[s * 6 + f] = tileIndex(name);
      FACE_TINT[s * 6 + f] = TINT_KIND[name] ?? 0;
    }
  }
}
const FLAGS = BLOCKS.flags;

/** Growable output of one pass. */
class QuadBuffer {
  words = new Uint32Array(8 * 256);
  length = 0;

  quad(w0: Uint32Array, w1: Uint32Array, flip: boolean): void {
    if (this.length + 8 > this.words.length) {
      const next = new Uint32Array(this.words.length * 2);
      next.set(this.words);
      this.words = next;
    }
    const o = this.length;
    for (let i = 0; i < 4; i++) {
      const c = flip ? (i + 1) & 3 : i;
      this.words[o + i * 2] = w0[c]!;
      this.words[o + i * 2 + 1] = w1[c]!;
    }
    this.length += 8;
  }

  result(): Uint32Array {
    return this.words.slice(0, this.length);
  }
}

const w0 = new Uint32Array(4);
const w1 = new Uint32Array(4);
const aoC = new Uint8Array(4);
const skyC = new Uint8Array(4);
const blockC = new Uint8Array(4);

/**
 * Ambient occlusion and smooth light of the 4 corners of face f of the cell at padded index p, written to aoC, skyC
 * and blockC. Light is the average over the non-opaque cells around each corner in front of the face.
 */
function cornerShading(states: Uint16Array, light: Uint8Array, p: number, f: number): void {
  const dir = DIRS[f]!;
  const front = p + dir[0] + dir[1] * SY + dir[2] * SZ;
  const [, ua, va] = AXES[f]!;
  const su = STRIDE[ua]!, sv = STRIDE[va]!;
  const corners = CORNERS[f]!;
  for (let c = 0; c < 4; c++) {
    const du = corners[c]![ua]! === 1 ? su : -su;
    const dv = corners[c]![va]! === 1 ? sv : -sv;
    const s1 = (FLAGS[states[front + du]!]! & OPAQUE) !== 0;
    const s2 = (FLAGS[states[front + dv]!]! & OPAQUE) !== 0;
    const cornerCell = front + du + dv;
    const cc = (FLAGS[states[cornerCell]!]! & OPAQUE) !== 0;
    aoC[c] = s1 && s2 ? 0 : 3 - (+s1 + +s2 + +cc);
    let sky = light[front]! >> 4, block = light[front]! & 15, n = 1;
    if (!s1) { sky += light[front + du]! >> 4; block += light[front + du]! & 15; n++; }
    if (!s2) { sky += light[front + dv]! >> 4; block += light[front + dv]! & 15; n++; }
    if (!cc && !(s1 && s2)) { sky += light[cornerCell]! >> 4; block += light[cornerCell]! & 15; n++; }
    skyC[c] = Math.round(sky / n);
    blockC[c] = Math.round(block / n);
  }
}

// Greedy masks for one slice: 0 means no face; otherwise the words that must match for faces to merge.
const AREA = CHUNK_SIZE * CHUNK_SIZE;
const maskA = new Int32Array(AREA);
const maskB = new Int32Array(AREA);
const maskC = new Int32Array(AREA);

/** Builds the quads of one chunk. Pure apart from module scratch space; safe to run in a worker. */
export function buildMesh(input: MeshInput): MeshOutput {
  const { states, light, climate } = input;
  const out = LAYERS.map(() => new QuadBuffer());
  greedyCubes(states, light, climate, out);
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const p = padIndex(x, y, z);
        const s = states[p]!;
        const kind = KIND[s]!;
        if (kind === 2) plant(out[PASS[s]!]!, s, x, y, z, light[p]!, climate[z * CHUNK_SIZE + x]!);
        else if (kind === 3) box(out[PASS[s]!]!, states, light, s, x, y, z, p, climate[z * CHUNK_SIZE + x]!);
      }
    }
  }
  return out.map((b) => b.result());
}

/** Whether face f of state s at padded index p shows. */
function faceVisible(states: Uint16Array, s: number, p: number, f: number): boolean {
  const dir = DIRS[f]!;
  const n = states[p + dir[0] + dir[1] * SY + dir[2] * SZ]!;
  if ((FLAGS[n]! & OPAQUE) !== 0) return false;
  const g = GROUP[s]!;
  return g === 0 || g !== GROUP[n]!;
}

function greedyCubes(states: Uint16Array, light: Uint8Array, climate: Uint8Array, out: QuadBuffer[]): void {
  const pos = [0, 0, 0];
  for (let f = 0; f < 6; f++) {
    const [a, ua, va] = AXES[f]!;
    for (let k = 0; k < CHUNK_SIZE; k++) {
      // Build the mask of this slice.
      let any = false;
      for (let v = 0; v < CHUNK_SIZE; v++) {
        for (let u = 0; u < CHUNK_SIZE; u++) {
          pos[a] = k;
          pos[ua] = u;
          pos[va] = v;
          const p = padIndex(pos[0]!, pos[1]!, pos[2]!);
          const s = states[p]!;
          const m = v * CHUNK_SIZE + u;
          if (KIND[s] !== 1 || !faceVisible(states, s, p, f)) {
            maskA[m] = 0;
            continue;
          }
          cornerShading(states, light, p, f);
          const lowered = f === 2 && WATER[s] === 1 && WATER[states[p + SY]!] === 0 ? 1 : 0;
          const tint = FACE_TINT[s * 6 + f]!;
          const clim = tint === 0 ? 0 : climate[pos[2]! * CHUNK_SIZE + pos[0]!]!;
          maskA[m] = (1 + FACE_TILE[s * 6 + f]!) | (PASS[s]! << 11) | (tint << 13) | (clim << 15) | (lowered << 23);
          maskB[m] = (skyC[0]! | (skyC[1]! << 4) | (skyC[2]! << 8) | (skyC[3]! << 12)) |
            ((blockC[0]! | (blockC[1]! << 4) | (blockC[2]! << 8) | (blockC[3]! << 12)) << 16);
          maskC[m] = aoC[0]! | (aoC[1]! << 2) | (aoC[2]! << 4) | (aoC[3]! << 6);
          any = true;
        }
      }
      if (!any) continue;
      // Merge rectangles.
      for (let v = 0; v < CHUNK_SIZE; v++) {
        for (let u = 0; u < CHUNK_SIZE;) {
          const m = v * CHUNK_SIZE + u;
          const ka = maskA[m]!;
          if (ka === 0) {
            u++;
            continue;
          }
          const kb = maskB[m]!, kc = maskC[m]!;
          let w = 1;
          while (u + w < CHUNK_SIZE && maskA[m + w] === ka && maskB[m + w] === kb && maskC[m + w] === kc) w++;
          let h = 1;
          grow: while (v + h < CHUNK_SIZE) {
            const row = (v + h) * CHUNK_SIZE + u;
            for (let i = 0; i < w; i++) {
              if (maskA[row + i] !== ka || maskB[row + i] !== kb || maskC[row + i] !== kc) break grow;
            }
            h++;
          }
          for (let j = 0; j < h; j++) maskA.fill(0, (v + j) * CHUNK_SIZE + u, (v + j) * CHUNK_SIZE + u + w);
          pos[a] = k;
          pos[ua] = u;
          pos[va] = v;
          emitGreedy(out[(ka >> 11) & 3]!, f, pos, ua, va, w, h, ka, kb, kc);
          u += w;
        }
      }
    }
  }
}

function emitGreedy(buf: QuadBuffer, f: number, pos: number[], ua: number, va: number, w: number, h: number,
  ka: number, kb: number, kc: number): void {
  const tile = (ka & 0x7ff) - 1, tint = (ka >> 13) & 3, clim = (ka >> 15) & 0xff, lowered = (ka >> 23) & 1;
  const size = [16, 16, 16];
  size[ua] = 16 * w;
  size[va] = 16 * h;
  const corners = CORNERS[f]!;
  for (let c = 0; c < 4; c++) {
    const cr = corners[c]!;
    const x = pos[0]! * 16 + cr[0] * size[0]!;
    const y = pos[1]! * 16 + cr[1] * size[1]! - (lowered && cr[1] === 1 ? 2 : 0);
    const z = pos[2]! * 16 + cr[2] * size[2]!;
    const ao = (kc >> (c * 2)) & 3;
    w0[c] = (x | (y << 9) | (z << 18) | (ao << 27) | (f << 29)) >>> 0;
    w1[c] = (tile | (((kb >> (c * 4)) & 15) << 10) | (((kb >> (16 + c * 4)) & 15) << 14) |
      ((UVS[c]![0] | (UVS[c]![1] << 1)) << 18) | (tint << 20) | (clim << 22)) >>> 0;
  }
  // Split the quad along the diagonal whose corners are less occluded, so AO gradients do not crease.
  const ao0 = kc & 3, ao1 = (kc >> 2) & 3, ao2 = (kc >> 4) & 3, ao3 = (kc >> 6) & 3;
  buf.quad(w0, w1, ao0 + ao2 < ao1 + ao3);
}

/** A crossed-quad plant filling its cell. Both diagonals; the material draws both sides. */
function plant(buf: QuadBuffer, s: number, x: number, y: number, z: number, lightByte: number, clim: number): void {
  const tile = FACE_TILE[s * 6]!, tint = FACE_TINT[s * 6]!;
  const sky = lightByte >> 4, block = lightByte & 15;
  const bx = x * 16, by = y * 16, bz = z * 16;
  for (let d = 0; d < 2; d++) {
    for (let c = 0; c < 4; c++) {
      const [u, v] = UVS[c]!;
      const px = bx + 16 * u, pz = bz + 16 * (d === 0 ? u : 1 - u), py = by + 16 * v;
      w0[c] = (px | (py << 9) | (pz << 18) | (3 << 27) | ((6 + d) << 29)) >>> 0;
      w1[c] = (tile | (sky << 10) | (block << 14) | ((u | (v << 1)) << 18) | (tint << 20) | ((tint ? clim : 0) << 22) | (v << 30)) >>> 0;
    }
    buf.quad(w0, w1, false);
  }
}

/** A box from BOX_Y0 to BOX_Y1 (slabs, snow, thin layers). Faces on the cell boundary are culled by opaque neighbours. */
function box(buf: QuadBuffer, states: Uint16Array, light: Uint8Array, s: number, x: number, y: number, z: number, p: number,
  clim: number): void {
  const y0 = BOX_Y0[s]!, y1 = BOX_Y1[s]!;
  for (let f = 0; f < 6; f++) {
    const onBoundary = f === 2 ? y1 === 16 : f === 3 ? y0 === 0 : true;
    const dir = DIRS[f]!;
    const n = p + dir[0] + dir[1] * SY + dir[2] * SZ;
    if (onBoundary && (FLAGS[states[n]!]! & OPAQUE) !== 0) continue;
    const lightByte = onBoundary ? light[n]! : light[p]!;
    const tile = FACE_TILE[s * 6 + f]!, tint = FACE_TINT[s * 6 + f]!;
    const corners = CORNERS[f]!;
    for (let c = 0; c < 4; c++) {
      const cr = corners[c]!;
      const px = x * 16 + cr[0] * 16, py = y * 16 + (cr[1] ? y1 : y0), pz = z * 16 + cr[2] * 16;
      w0[c] = (px | (py << 9) | (pz << 18) | (3 << 27) | (f << 29)) >>> 0;
      w1[c] = (tile | ((lightByte >> 4) << 10) | ((lightByte & 15) << 14) | ((UVS[c]![0] | (UVS[c]![1] << 1)) << 18) |
        (tint << 20) | ((tint ? clim : 0) << 22)) >>> 0;
    }
    buf.quad(w0, w1, false);
  }
}

/** Unpacks a vertex for tests and tools: position in cells, normal, ao, tile and light. */
export function decodeVertex(word0: number, word1: number) {
  return {
    x: (word0 & 511) / 16, y: ((word0 >>> 9) & 511) / 16, z: ((word0 >>> 18) & 511) / 16,
    ao: (word0 >>> 27) & 3, normal: word0 >>> 29,
    tile: word1 & 1023, sky: (word1 >>> 10) & 15, block: (word1 >>> 14) & 15,
    tint: (word1 >>> 20) & 3, climate: (word1 >>> 22) & 255, sway: (word1 >>> 30) & 1,
  };
}
