import {
  BLOCK_SIZE_M, CHUNK_SIZE, FALL_DELAY_S, GRASS_MIN_LIGHT, LAVA_FLOW_M_S, LEAF_REACH_M, MAX_TICKS_PER_STEP,
  RANDOM_TICKS_PER_CHUNK, SIM_HZ, SIM_RADIUS_CHUNKS, WATER_FLOW_M_S, cells,
} from '../config';
import { localIndex, toChunk, toLocal } from '../core/coords';
import { mulberry32 } from '../core/random';
import { AIR, BLOCKS, FLUID_LEVELS, OPAQUE, SOLID } from '../engine/blocks';
import type { World } from '../engine/world';
import { TickKind, TickScheduler } from './ticks';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const FLAGS = BLOCKS.flags;

/** One kind of fluid: its source and flowing states, how fast it spreads and how much strength it loses per cell. */
interface Fluid {
  source: number;
  flowing: number;
  delay: number;
  drop: number;
}
const flowDelay = (speed: number) => Math.max(1, Math.round((BLOCK_SIZE_M / speed) * SIM_HZ));
const WATER: Fluid = { source: S('water'), flowing: S('flowing_water'), delay: flowDelay(WATER_FLOW_M_S), drop: 1 };
const LAVA: Fluid = { source: S('lava'), flowing: S('flowing_lava'), delay: flowDelay(LAVA_FLOW_M_S), drop: 2 };
const FALLING_FLAG = FLUID_LEVELS;

/** Fluid of a state, or null. */
function fluidOf(state: number): Fluid | null {
  if (state === WATER.source || (state >= WATER.flowing && state < WATER.flowing + 2 * FLUID_LEVELS)) return WATER;
  if (state === LAVA.source || (state >= LAVA.flowing && state < LAVA.flowing + 2 * FLUID_LEVELS)) return LAVA;
  return null;
}

/** Strength of a fluid cell: 9 for a source, 8 for falling fluid, else its level (1..8). */
function strength(state: number, f: Fluid): number {
  if (state === f.source) return FLUID_LEVELS + 1;
  const v = state - f.flowing;
  return v >= FALLING_FLAG ? FLUID_LEVELS : v + 1;
}

const flowing = (f: Fluid, level: number, falling = false) => f.flowing + (level - 1) + (falling ? FALLING_FLAG : 0);

const SAND = new Set([S('sand'), S('gravel')]);
const GRASS = S('grass'), DIRT = S('dirt'), LOG = S('log'), LEAVES = S('leaves'), LEAVES_PLACED = S('leaves', 1);
const LILY = S('lily_pad'), OBSIDIAN = S('obsidian'), COBBLE = S('cobblestone');
/** Cells fluids wash away: air, plants and thin layers (not snow, which is solid). */
const REPLACEABLE = new Uint8Array(BLOCKS.stateCount);
/** Cells that pop off without a solid cell below. */
const NEEDS_SUPPORT = new Uint8Array(BLOCKS.stateCount);
for (const t of BLOCKS.types) {
  for (let s = t.id; s < t.id + t.variants; s++) {
    const thin = t.shape === 'cross' || (t.shape === 'layer' && !t.solid);
    REPLACEABLE[s] = s === AIR || thin ? 1 : 0;
    NEEDS_SUPPORT[s] = thin ? 1 : 0;
  }
}
const LEAF_REACH = cells(LEAF_REACH_M);
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

/**
 * Block updates: fluids, falling sand and gravel, plants losing their ground (scheduled ticks), and grass and leaves
 * (random ticks near the player). It changes cells only through `setBlock`, so light, meshes and saving follow.
 */
export class Simulation {
  readonly ticks = new TickScheduler();
  private readonly rand: () => number;

  constructor(private readonly world: World, private readonly setBlock: (x: number, y: number, z: number, s: number) => void, seed = 1) {
    this.rand = mulberry32(seed ^ 0x51ed);
  }

  /** Schedules the updates a change at (x, y, z) may cause in it and its six neighbours. */
  onCellChanged(x: number, y: number, z: number): void {
    this.wake(x, y, z);
    for (let d = 0; d < 6; d++) this.wake(x + DX[d]!, y + DY[d]!, z + DZ[d]!);
  }

  private wake(x: number, y: number, z: number): void {
    const s = this.world.get(x, y, z);
    const f = fluidOf(s);
    if (f) this.ticks.schedule(x, y, z, TickKind.Flow, f.delay);
    else if (SAND.has(s)) this.ticks.schedule(x, y, z, TickKind.Fall, FALL_DELAY_S * SIM_HZ);
    else if (NEEDS_SUPPORT[s]) this.ticks.schedule(x, y, z, TickKind.Support, 1);
  }

  /** One simulation step: due scheduled ticks, then random ticks around (px, pz) (cells). */
  step(px: number, pz: number): void {
    this.ticks.now++;
    for (const t of this.ticks.takeDue(MAX_TICKS_PER_STEP)) {
      if (!this.world.isLoaded(t.x, t.y, t.z)) continue;
      if (t.kind === TickKind.Flow) this.flow(t.x, t.y, t.z);
      else if (t.kind === TickKind.Fall) this.fall(t.x, t.y, t.z);
      else this.support(t.x, t.y, t.z);
    }
    this.randomTicks(toChunk(Math.floor(px)), toChunk(Math.floor(pz)));
  }

  private flow(x: number, y: number, z: number): void {
    let s = this.world.get(x, y, z);
    const f = fluidOf(s);
    if (!f) return;
    if (s !== f.source) {
      // A flowing cell takes the strongest supply around it, or dries up.
      let target: number;
      const above = this.world.get(x, y + 1, z);
      if (fluidOf(above) === f) target = flowing(f, FLUID_LEVELS, true);
      else {
        let best = 0, sources = 0;
        for (let d = 0; d < 6; d++) {
          if (DY[d] !== 0) continue;
          const n = this.world.get(x + DX[d]!, y, z + DZ[d]!);
          if (fluidOf(n) !== f) continue;
          best = Math.max(best, strength(n, f));
          if (n === f.source) sources++;
        }
        const below = this.world.get(x, y - 1, z);
        // Two water sources side by side over solid ground (or more water) make a new source.
        if (f === WATER && sources >= 2 && ((FLAGS[below]! & SOLID) !== 0 || below === f.source)) target = f.source;
        else {
          const level = best - f.drop;
          target = level >= 1 ? flowing(f, Math.min(FLUID_LEVELS, level)) : AIR;
        }
      }
      if (target !== s) {
        this.setBlock(x, y, z, target);
        s = target;
        if (target === AIR) return;
      }
    }
    // Spread: down if it can, otherwise sideways.
    const below = this.world.get(x, y - 1, z);
    if (this.world.isLoaded(x, y - 1, z) && this.canEnter(below, f, FLUID_LEVELS)) {
      this.enter(x, y - 1, z, below, f, flowing(f, FLUID_LEVELS, true));
      return;
    }
    // Fluid resting on more of itself does not spread sideways.
    if (fluidOf(below) === f) return;
    const out = strength(s, f) - f.drop;
    if (out < 1) return;
    for (let d = 0; d < 6; d++) {
      if (DY[d] !== 0) continue;
      const nx = x + DX[d]!, nz = z + DZ[d]!;
      if (!this.world.isLoaded(nx, y, nz)) continue;
      const n = this.world.get(nx, y, nz);
      if (this.canEnter(n, f, out)) this.enter(nx, y, nz, n, f, flowing(f, Math.min(FLUID_LEVELS, out)));
    }
  }

  /** Whether fluid f with `level` may flow into a cell holding `n`. */
  private canEnter(n: number, f: Fluid, level: number): boolean {
    if (REPLACEABLE[n]) return true;
    const g = fluidOf(n);
    if (g === null) return false;
    if (g !== f) return true; // the other fluid: they react
    return n !== f.source && strength(n, f) < level && n < f.flowing + FALLING_FLAG;
  }

  private enter(x: number, y: number, z: number, n: number, f: Fluid, state: number): void {
    const g = fluidOf(n);
    if (g && g !== f) {
      // Water and lava meeting harden: a lava source to obsidian, anything else to cobblestone.
      this.setBlock(x, y, z, n === LAVA.source ? OBSIDIAN : COBBLE);
      return;
    }
    this.setBlock(x, y, z, state);
  }

  private fall(x: number, y: number, z: number): void {
    const s = this.world.get(x, y, z);
    if (!SAND.has(s) || !this.world.isLoaded(x, y - 1, z)) return;
    const below = this.world.get(x, y - 1, z);
    if (!REPLACEABLE[below] && !fluidOf(below)) return;
    this.setBlock(x, y, z, AIR);
    this.setBlock(x, y - 1, z, s);
  }

  private support(x: number, y: number, z: number): void {
    const s = this.world.get(x, y, z);
    if (!NEEDS_SUPPORT[s]) return;
    const below = this.world.get(x, y - 1, z);
    const ok = s === LILY ? below === WATER.source : (FLAGS[below]! & SOLID) !== 0;
    if (!ok && this.world.isLoaded(x, y - 1, z)) this.setBlock(x, y, z, AIR);
  }

  /** A fixed number of random cells per chunk near the player, whatever the view distance. */
  private randomTicks(pcx: number, pcz: number): void {
    for (const chunk of this.world.chunks.values()) {
      if (Math.abs(chunk.cx - pcx) > SIM_RADIUS_CHUNKS || Math.abs(chunk.cz - pcz) > SIM_RADIUS_CHUNKS) continue;
      if (!chunk.states.some((s) => s === GRASS || s === LEAVES)) continue;
      for (let n = 0; n < RANDOM_TICKS_PER_CHUNK; n++) {
        const i = Math.floor(this.rand() * 4096);
        const s = chunk.get(i);
        if (s !== GRASS && s !== LEAVES) continue;
        const x = chunk.cx * CHUNK_SIZE + (i & 15), y = chunk.cy * CHUNK_SIZE + (i >> 8), z = chunk.cz * CHUNK_SIZE + ((i >> 4) & 15);
        if (s === GRASS) this.grass(x, y, z);
        else this.leaves(x, y, z);
      }
    }
  }

  private lightAbove(x: number, y: number, z: number): number {
    const c = this.world.chunkAt(x, y + 1, z);
    if (!c) return 0;
    const i = localIndex(toLocal(x), toLocal(y + 1), toLocal(z));
    return Math.max(c.skyLight(i), c.blockLight(i));
  }

  /** Grass under an opaque cell dies back to dirt; lit grass spreads to nearby lit dirt. */
  private grass(x: number, y: number, z: number): void {
    if ((FLAGS[this.world.get(x, y + 1, z)]! & OPAQUE) !== 0) {
      this.setBlock(x, y, z, DIRT);
      return;
    }
    if (this.lightAbove(x, y, z) < GRASS_MIN_LIGHT) return;
    const tx = x + Math.floor(this.rand() * 3) - 1, ty = y + Math.floor(this.rand() * 4) - 2, tz = z + Math.floor(this.rand() * 3) - 1;
    if (this.world.get(tx, ty, tz) !== DIRT) return;
    if ((FLAGS[this.world.get(tx, ty + 1, tz)]! & OPAQUE) !== 0 || this.lightAbove(tx, ty, tz) < GRASS_MIN_LIGHT) return;
    this.setBlock(tx, ty, tz, GRASS);
  }

  /** Natural leaves with no log within reach (through leaves and logs) decay. */
  private leaves(x: number, y: number, z: number): void {
    const seen = new Set<string>([`${x},${y},${z}`]);
    let frontier = [[x, y, z]];
    for (let step = 0; step < LEAF_REACH && frontier.length > 0; step++) {
      const next: number[][] = [];
      for (const [cx, cy, cz] of frontier) {
        for (let d = 0; d < 6; d++) {
          const nx = cx! + DX[d]!, ny = cy! + DY[d]!, nz = cz! + DZ[d]!;
          const key = `${nx},${ny},${nz}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!this.world.isLoaded(nx, ny, nz)) return; // unknown: decide later
          const n = this.world.get(nx, ny, nz);
          if (n === LOG) return;
          if (n === LEAVES || n === LEAVES_PLACED) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    this.setBlock(x, y, z, AIR);
  }
}

/** For tests: which fluid a state is ('water', 'lava' or null) and its strength. */
export function fluidInfo(state: number): { fluid: 'water' | 'lava' | null; strength: number } {
  const f = fluidOf(state);
  return { fluid: f === WATER ? 'water' : f === LAVA ? 'lava' : null, strength: f ? strength(state, f) : 0 };
}

