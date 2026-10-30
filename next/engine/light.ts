import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, MAX_LIGHT } from '../config';
import { columnIndex, localIndex, toChunk, toLocal } from '../core/coords';
import { IntQueue } from '../core/queue';
import { BLOCKS, BLOCKS_SKY, OPAQUE } from './blocks';
import type { Chunk } from './chunk';
import type { World } from './world';

// Imported constants copied locally: hot loops then read a plain constant, not a module binding.
const CHUNK_SIZE_ = CHUNK_SIZE;
const CHUNK_VOLUME_ = CHUNK_VOLUME;
const CHUNK_AREA_ = CHUNK_AREA;
const MAX_LIGHT_ = MAX_LIGHT;
/**
 * Stored light. Sky light is MAX_LIGHT_ in every cell above its column's sky top (the highest cell that stops direct
 * sunlight) and spreads from there; block light spreads from emitters. Both fall by one per cell and stop at opaque
 * cells. A chunk's own light is computed when it is generated (`chunkLight`, in a worker); the `LightEngine` joins it
 * to its neighbours when it loads and keeps light exact through edits with add and remove flood fills.
 */

const FLAGS = BLOCKS.flags;
const EMISSION = BLOCKS.emission;
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

/**
 * The light bytes (sky << 4 | block) of one chunk on its own, as if its neighbours were dark: direct sky above the sky
 * top, emitters, and spreading inside the chunk. Pure; runs in workers.
 */
export function chunkLight(states: Uint16Array, cy: number, skyTop: Int32Array): Uint8Array {
  const light = new Uint8Array(CHUNK_VOLUME_);
  const queue = new IntQueue(512);
  const y0 = cy * CHUNK_SIZE_;
  for (let i = 0; i < CHUNK_VOLUME_; i++) {
    const s = states[i]!;
    const ly = i >> 8, col = i & 255;
    const sky = y0 + ly > skyTop[col]! && (FLAGS[s]! & OPAQUE) === 0 ? MAX_LIGHT_ : 0;
    const block = EMISSION[s]!;
    light[i] = (sky << 4) | block;
    if (block > 0) queue.push(i);
  }
  // Direct-sky cells only need spreading where they border a non-opaque cell without direct sky.
  for (let i = 0; i < CHUNK_VOLUME_; i++) {
    if (light[i]! >> 4 !== MAX_LIGHT_) continue;
    const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
    for (let d = 0; d < 6; d++) {
      const x = lx + DX[d]!, y = ly + DY[d]!, z = lz + DZ[d]!;
      if (x < 0 || x > 15 || y < 0 || y > 15 || z < 0 || z > 15) continue;
      const n = localIndex(x, y, z);
      if ((FLAGS[states[n]!]! & OPAQUE) === 0 && light[n]! >> 4 !== MAX_LIGHT_) {
        queue.push(i);
        break;
      }
    }
  }
  while (queue.length > 0) {
    const i = queue.shift();
    const v = light[i]!, sky = v >> 4, block = v & 15;
    if (sky <= 1 && block <= 1) continue;
    const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
    for (let d = 0; d < 6; d++) {
      const x = lx + DX[d]!, y = ly + DY[d]!, z = lz + DZ[d]!;
      if (x < 0 || x > 15 || y < 0 || y > 15 || z < 0 || z > 15) continue;
      const n = localIndex(x, y, z);
      if ((FLAGS[states[n]!]! & OPAQUE) !== 0) continue;
      const nv = light[n]!, ns = Math.max(nv >> 4, sky - 1), nb = Math.max(nv & 15, block - 1);
      if (ns !== nv >> 4 || nb !== (nv & 15)) {
        light[n] = (ns << 4) | nb;
        queue.push(n);
      }
    }
  }
  return light;
}

/** The highest sky-blocking cell per column cell of a chunk's states, or `below` where none blocks. */
export function skyTopOf(states: Uint16Array, cy: number, below: number, out: Int32Array): void {
  for (let col = 0; col < CHUNK_AREA_; col++) {
    out[col] = below;
    for (let ly = CHUNK_SIZE_ - 1; ly >= 0; ly--) {
      if ((FLAGS[states[(ly << 8) | col]!]! & BLOCKS_SKY) !== 0) {
        out[col] = cy * CHUNK_SIZE_ + ly;
        break;
      }
    }
  }
}

export class LightEngine {
  /** Cells whose light changed since the last `drainChanged`, as chunk keys with border neighbours. */
  private readonly addQueue = new IntQueue(4096);
  private readonly removeQueue = new IntQueue(4096);
  private readonly changed = new Set<number>();

  constructor(private readonly world: World) {}

  /** Chunks whose light changed since the last call, including neighbours whose meshes read the changed border cells. */
  drainChanged(): Set<number> {
    const out = new Set(this.changed);
    this.changed.clear();
    return out;
  }

  /** The sky top of cell column (x, z), or -Infinity if its column is not loaded. */
  skyTop(x: number, z: number): number {
    return this.world.column(toChunk(x), toChunk(z))?.skyTop[columnIndex(toLocal(x), toLocal(z))] ?? -Infinity;
  }

  private chunk(x: number, y: number, z: number): Chunk | undefined {
    return this.world.chunkAt(x, y, z);
  }

  private touch(chunk: Chunk, x: number, y: number, z: number): void {
    // A mesh reads a one-cell border, so a change on a chunk face also affects the chunks across it.
    const lx = toLocal(x), ly = toLocal(y), lz = toLocal(z);
    const xs = lx === 0 ? -1 : lx === 15 ? 1 : 0, ys = ly === 0 ? -1 : ly === 15 ? 1 : 0, zs = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    this.changed.add(chunk.key);
    if (xs === 0 && ys === 0 && zs === 0) return;
    for (let dy = Math.min(0, ys); dy <= Math.max(0, ys); dy++) {
      for (let dz = Math.min(0, zs); dz <= Math.max(0, zs); dz++) {
        for (let dx = Math.min(0, xs); dx <= Math.max(0, xs); dx++) {
          const n = this.world.chunk(chunk.cx + dx, chunk.cy + dy, chunk.cz + dz);
          if (n) this.changed.add(n.key);
        }
      }
    }
  }

  private setLight(chunk: Chunk, x: number, y: number, z: number, sky: number, block: number): void {
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    if (chunk.lightByte(i) === ((sky << 4) | block)) return;
    chunk.setLight(i, sky, block);
    this.touch(chunk, x, y, z);
  }

  private push(q: IntQueue, x: number, y: number, z: number, level = 0): void {
    q.push(x);
    q.push(y);
    q.push(z);
    q.push(level);
  }

  /** Joins a newly loaded chunk's light with its loaded neighbours, in both directions. */
  stitch(chunk: Chunk): void {
    const bx = chunk.cx * CHUNK_SIZE_, by = chunk.cy * CHUNK_SIZE_, bz = chunk.cz * CHUNK_SIZE_;
    for (let d = 0; d < 6; d++) {
      const n = this.world.chunk(chunk.cx + DX[d]!, chunk.cy + DY[d]!, chunk.cz + DZ[d]!);
      if (!n) continue;
      // Only border pairs where light can cross start a flood fill; equal light on both sides needs nothing.
      for (let a = 0; a < CHUNK_SIZE_; a++) {
        for (let b = 0; b < CHUNK_SIZE_; b++) {
          let x: number, y: number, z: number;
          if (DX[d] !== 0) { x = DX[d]! > 0 ? 15 : 0; y = a; z = b; }
          else if (DY[d] !== 0) { y = DY[d]! > 0 ? 15 : 0; x = a; z = b; }
          else { z = DZ[d]! > 0 ? 15 : 0; x = a; y = b; }
          const i = localIndex(x, y, z);
          const j = localIndex((x + DX[d]!) & 15, (y + DY[d]!) & 15, (z + DZ[d]!) & 15);
          const li = chunk.lightByte(i), lj = n.lightByte(j);
          if (li === lj) continue;
          const openI = (FLAGS[chunk.get(i)]! & OPAQUE) === 0, openJ = (FLAGS[n.get(j)]! & OPAQUE) === 0;
          if (openJ && ((li >> 4) - 1 > lj >> 4 || (li & 15) - 1 > (lj & 15))) this.push(this.addQueue, bx + x, by + y, bz + z);
          if (openI && ((lj >> 4) - 1 > li >> 4 || (lj & 15) - 1 > (li & 15))) {
            this.push(this.addQueue, bx + x + DX[d]!, by + y + DY[d]!, bz + z + DZ[d]!);
          }
        }
      }
    }
    this.spread();
  }

  /** Updates light after the cell (x, y, z) changed from `previous` to its current state. */
  onBlockChanged(x: number, y: number, z: number, previous: number): void {
    const chunk = this.chunk(x, y, z);
    if (!chunk) return;
    const state = chunk.get(localIndex(toLocal(x), toLocal(y), toLocal(z)));
    const column = this.world.column(chunk.cx, chunk.cz)!;
    const ci = columnIndex(toLocal(x), toLocal(z));
    const oldTop = column.skyTop[ci]!;
    const blocksSky = (FLAGS[state]! & BLOCKS_SKY) !== 0;
    // Update the sky top, and the cells that gain or lose direct sunlight.
    if (blocksSky && y > oldTop) {
      column.skyTop[ci] = y;
      // The cell itself and those below it down to the old top lose direct sunlight.
      for (let cy = y; cy > oldTop; cy--) {
        const c = this.chunk(x, cy, z);
        if (c) this.removeSky(c, x, cy, z);
      }
    } else if (!blocksSky && y === oldTop) {
      const newTop = this.scanSkyTop(x, y - 1, z, column.generatedSkyTop[ci]!);
      column.skyTop[ci] = newTop;
      for (let cy = y; cy > newTop; cy--) {
        const c = this.chunk(x, cy, z);
        if (!c) break;
        const s = c.get(localIndex(toLocal(x), toLocal(cy), toLocal(z)));
        if ((FLAGS[s]! & OPAQUE) !== 0) continue;
        this.setLight(c, x, cy, z, MAX_LIGHT_, c.blockLight(localIndex(toLocal(x), toLocal(cy), toLocal(z))));
        this.push(this.addQueue, x, cy, z);
      }
    }
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    const opaque = (FLAGS[state]! & OPAQUE) !== 0;
    const emission = EMISSION[state]!;
    // Block light: remove what this cell carried if it now blocks or emits less, then re-add its own emission.
    const block = chunk.blockLight(i);
    if (opaque || emission < block || EMISSION[previous]! > emission) {
      this.removeBlock(chunk, x, y, z, block);
    }
    if (opaque && chunk.skyLight(i) > 0) this.removeSky(chunk, x, y, z);
    if (emission > 0) {
      this.setLight(chunk, x, y, z, chunk.skyLight(i), Math.max(chunk.blockLight(i), emission));
      this.push(this.addQueue, x, y, z);
    }
    if (!opaque) {
      // Light flows back in from the neighbours.
      for (let d = 0; d < 6; d++) this.push(this.addQueue, x + DX[d]!, y + DY[d]!, z + DZ[d]!);
    }
    this.spread();
  }

  /** Highest sky-blocking cell at or below y in loaded chunks; falls back to the generated top below them. */
  private scanSkyTop(x: number, y: number, z: number, generated: number): number {
    for (let cy = y; ; cy--) {
      const c = this.chunk(x, cy, z);
      // shortcut: below the loaded chunks the generated sky top is assumed; edits saved in unloaded chunks are not seen.
      if (!c) return Math.min(cy, generated);
      if ((FLAGS[c.get(localIndex(toLocal(x), toLocal(cy), toLocal(z)))]! & BLOCKS_SKY) !== 0) return cy;
    }
  }

  private removeSky(chunk: Chunk, x: number, y: number, z: number): void {
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    const level = chunk.skyLight(i);
    if (level === 0) return;
    this.setLight(chunk, x, y, z, 0, chunk.blockLight(i));
    this.push(this.removeQueue, x, y, z, level);
    this.drainRemovals(true);
  }

  private removeBlock(chunk: Chunk, x: number, y: number, z: number, level: number): void {
    if (level === 0) return;
    const i = localIndex(toLocal(x), toLocal(y), toLocal(z));
    this.setLight(chunk, x, y, z, chunk.skyLight(i), 0);
    this.push(this.removeQueue, x, y, z, level);
    this.drainRemovals(false);
  }

  /** Darkens outward from removed light; cells lit by another source are queued to spread back in. */
  private drainRemovals(sky: boolean): void {
    const q = this.removeQueue;
    while (q.length > 0) {
      const x = q.shift(), y = q.shift(), z = q.shift(), level = q.shift();
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d]!, ny = y + DY[d]!, nz = z + DZ[d]!;
        const c = this.chunk(nx, ny, nz);
        if (!c) continue;
        const i = localIndex(toLocal(nx), toLocal(ny), toLocal(nz));
        const nl = sky ? c.skyLight(i) : c.blockLight(i);
        if (nl === 0) continue;
        const source = sky ? ny > this.skyTop(nx, nz) : EMISSION[c.get(i)]! >= nl;
        if (nl < level && !source) {
          if (sky) this.setLight(c, nx, ny, nz, 0, c.blockLight(i));
          else {
            const own = EMISSION[c.get(i)]!;
            this.setLight(c, nx, ny, nz, c.skyLight(i), own);
            if (own > 0) this.push(this.addQueue, nx, ny, nz);
          }
          this.push(q, nx, ny, nz, nl);
        } else {
          this.push(this.addQueue, nx, ny, nz);
        }
      }
    }
  }

  /** Spreads light from every queued cell into its neighbours until nothing changes. */
  private spread(): void {
    const q = this.addQueue;
    while (q.length > 0) {
      const x = q.shift(), y = q.shift(), z = q.shift();
      q.shift();
      const c = this.chunk(x, y, z);
      if (!c) continue;
      const lx = toLocal(x), ly = toLocal(y), lz = toLocal(z);
      const v = c.lightByte(localIndex(lx, ly, lz));
      const sky = v >> 4, block = v & 15;
      if (sky <= 1 && block <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const ax = lx + DX[d]!, ay = ly + DY[d]!, az = lz + DZ[d]!;
        // Most neighbours are in the same chunk; only look up another chunk when crossing a face.
        const inside = ax >= 0 && ax < CHUNK_SIZE_ && ay >= 0 && ay < CHUNK_SIZE_ && az >= 0 && az < CHUNK_SIZE_;
        const nx = x + DX[d]!, ny = y + DY[d]!, nz = z + DZ[d]!;
        const n = inside ? c : this.chunk(nx, ny, nz);
        if (!n) continue;
        const i = localIndex(ax & 15, ay & 15, az & 15);
        if ((FLAGS[n.get(i)]! & OPAQUE) !== 0) continue;
        const nv = n.lightByte(i), ns = Math.max(nv >> 4, sky - 1), nb = Math.max(nv & 15, block - 1);
        if (ns !== nv >> 4 || nb !== (nv & 15)) {
          this.setLight(n, nx, ny, nz, ns, nb);
          this.push(q, nx, ny, nz);
        }
      }
    }
  }
}
