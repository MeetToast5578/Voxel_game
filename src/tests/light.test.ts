import { describe, expect, it } from 'vitest';
import { CHUNK_AREA, CHUNK_VOLUME } from '../config';
import { mulberry32 } from '../core/random';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { chunkLight, LightEngine, skyTopOf } from '../engine/light';
import { World } from '../engine/world';

const S = (key: string) => BLOCKS.state(key);
const NONE = -(2 ** 31);
// A 3 x 3 x 3 block of chunks from (-1, -1, -1) to (1, 1, 1).
const RANGE = [-1, 0, 1];

/** Builds a world from a fill function, lighting each chunk as the workers and streamer would. */
function build(fill: (x: number, y: number, z: number) => number, order = 0): { world: World; light: LightEngine } {
  const world = new World();
  const light = new LightEngine(world);
  const states = new Map<string, Uint16Array>();
  for (const cx of RANGE) for (const cy of RANGE) for (const cz of RANGE) {
    const s = new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
      s[i] = fill(cx * 16 + lx, cy * 16 + ly, cz * 16 + lz);
    }
    states.set(`${cx},${cy},${cz}`, s);
  }
  // Sky tops from the top chunk down, as generation would report them.
  const tops = new Map<string, Int32Array>();
  for (const cx of RANGE) for (const cz of RANGE) {
    const top = new Int32Array(CHUNK_AREA).fill(NONE), part = new Int32Array(CHUNK_AREA);
    for (const cy of [...RANGE].reverse()) {
      skyTopOf(states.get(`${cx},${cy},${cz}`)!, cy, NONE, part);
      for (let i = 0; i < CHUNK_AREA; i++) if (top[i] === NONE) top[i] = part[i]!;
    }
    tops.set(`${cx},${cz}`, top);
  }
  const keys = [...states.keys()];
  const rand = mulberry32(order);
  if (order) keys.sort(() => rand() - 0.5);
  for (const k of keys) {
    const [cx, cy, cz] = k.split(',').map(Number) as [number, number, number];
    const chunk = new Chunk(cx, cy, cz);
    chunk.load(states.get(k)!);
    chunk.loadLight(chunkLight(states.get(k)!, cy, tops.get(`${cx},${cz}`)!));
    const column = world.add(chunk);
    if (column.chunkCount === 1) {
      column.skyTop.set(tops.get(`${cx},${cz}`)!);
      column.generatedSkyTop.fill(NONE);
    }
    light.stitch(chunk);
  }
  return { world, light };
}

function snapshot(world: World): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (const [key, chunk] of world.chunks) {
    const bytes = new Uint8Array(CHUNK_VOLUME);
    chunk.copyLightTo(bytes);
    out.set(key, bytes);
  }
  return out;
}

const lightAt = (world: World, x: number, y: number, z: number) => {
  const c = world.chunkAt(x, y, z)!;
  const i = (((y & 15) * 16 + (z & 15)) * 16) + (x & 15);
  return { sky: c.skyLight(i), block: c.blockLight(i) };
};

/** Applies an edit the way the game does: set the cell, then update light. */
function edit(world: World, light: LightEngine, x: number, y: number, z: number, state: number): void {
  const previous = world.get(x, y, z);
  if (world.set(x, y, z, state)) light.onBlockChanged(x, y, z, previous);
}

/** Recomputes the whole world's light from scratch, from its current cells. */
function recompute(world: World): Map<number, Uint8Array> {
  return snapshot(build((x, y, z) => world.get(x, y, z)).world);
}

describe('light', () => {
  it('does not depend on the order chunks load in', () => {
    const fill = (x: number, y: number, z: number) =>
      y < -5 ? S('stone') : y === 6 && x > 4 && x < 22 && z > -10 && z < 10 ? S('stone') : x === 0 && y === 0 && z === 0 ? S('glowstone') : 0;
    expect(snapshot(build(fill, 0).world)).toEqual(snapshot(build(fill, 7).world));
  });

  it('casts an overhang shadow across a chunk border and lights it from the side', () => {
    const { world } = build((x, y, z) => (y < 0 ? S('stone') : y === 8 && x >= 8 && x < 26 && z >= -20 && z < 20 ? S('stone') : 0));
    expect(lightAt(world, 0, 0, 0).sky).toBe(15);
    // Under the roof, light comes in from the nearest open edge (x = 7 or x = 26), falling by one per cell.
    expect(lightAt(world, 12, 0, 0).sky).toBe(15 - (12 - 7));
    expect(lightAt(world, 20, 0, 0).sky).toBe(15 - (26 - 20));
  });

  it('restores light exactly after a light source is placed and removed', () => {
    // A closed stone box with a dark room inside.
    const solid = (x: number, y: number, z: number) => (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 10 ? S('stone') : 0);
    const { world, light } = build(solid);
    const before = snapshot(world);
    edit(world, light, 0, 0, 0, S('glowstone'));
    expect(lightAt(world, 0, 0, 0).block).toBe(15);
    expect(lightAt(world, 3, 0, 0).block).toBe(12);
    expect(lightAt(world, 10, 0, 0).block).toBe(5);
    edit(world, light, 0, 0, 0, 0);
    expect(snapshot(world)).toEqual(before);
  });

  it('matches a full recompute after random edits', () => {
    const rand = mulberry32(42);
    const base = (x: number, y: number, z: number) =>
      y < -8 ? S('stone') : y === 4 && x * x + z * z < 120 ? S('stone') : y < -4 && rand() < 0.02 ? S('water') : 0;
    const { world, light } = build(base);
    const palette = [S('stone'), S('stone'), S('glowstone'), S('glass'), S('water'), S('leaves'), 0, 0, 0];
    for (let n = 0; n < 60; n++) {
      const x = Math.floor(rand() * 40) - 20, y = Math.floor(rand() * 30) - 14, z = Math.floor(rand() * 40) - 20;
      const state = palette[Math.floor(rand() * palette.length)]!;
      edit(world, light, x, y, z, state);
      const a = snapshot(world), b = recompute(world);
      for (const [key, bytes] of a) {
        const ref = b.get(key)!;
        const i = bytes.findIndex((v, j) => v !== ref[j]);
        if (i >= 0) {
          const c = world.chunks.get(key)!;
          throw new Error(`edit ${n} (${x},${y},${z}) -> ${BLOCKS.stateName(state)}: chunk ${c.cx},${c.cy},${c.cz} cell ${i & 15},${i >> 8},${(i >> 4) & 15} got ${bytes[i]!.toString(16)} want ${ref[i]!.toString(16)}`);
        }
      }
    }
    expect(snapshot(world)).toEqual(recompute(world));
  });

  it('reports the chunks whose light changed, with border neighbours', () => {
    const { world, light } = build((_x, y) => (y < 0 ? S('stone') : 0));
    light.drainChanged();
    edit(world, light, 15, -1, 3, 0);
    const changed = light.drainChanged();
    expect(changed.size).toBeGreaterThan(0);
    expect(changed.size).toBeLessThanOrEqual(8);
    expect(changed.has(world.chunk(0, -1, 0)!.key)).toBe(true);
  });
});
