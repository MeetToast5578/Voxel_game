import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { fluidInfo, Simulation } from '../sim/simulation';
import { TickKind, TickScheduler } from '../sim/ticks';

const S = (key: string, v = 0) => BLOCKS.state(key, v);

/** A 3 x 2 x 3 block of chunks with a stone floor below y = 0, and a simulation wired like the game. */
function setup(fill?: (x: number, y: number, z: number) => number) {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz));
  for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) for (let y = -16; y < 16; y++) {
    const s = fill ? fill(x, y, z) : y < 0 ? S('stone') : 0;
    if (s) world.set(x, y, z, s);
  }
  // eslint-disable-next-line prefer-const
  let sim: Simulation;
  const setBlock = (x: number, y: number, z: number, s: number) => {
    const previous = world.get(x, y, z);
    if (world.set(x, y, z, s)) sim.onCellChanged(x, y, z, previous);
  };
  sim = new Simulation(world, setBlock, 1);
  const run = (steps: number) => { for (let i = 0; i < steps; i++) sim.step(0, 0); };
  return { world, sim, setBlock, run };
}

describe('fluids', () => {
  it('spreads water from a source over a floor, losing a level per cell, and stops', () => {
    const { world, setBlock, run } = setup();
    setBlock(0, 0, 0, S('water'));
    run(200);
    expect(fluidInfo(world.get(0, 0, 0))).toEqual({ fluid: 'water', strength: 9 });
    expect(fluidInfo(world.get(1, 0, 0)).strength).toBe(8);
    expect(fluidInfo(world.get(7, 0, 0)).strength).toBe(2);
    expect(fluidInfo(world.get(8, 0, 0)).strength).toBe(1);
    expect(world.get(9, 0, 0)).toBe(0);
    expect(world.get(0, 1, 0)).toBe(0);
  });

  it('dries up when its source is removed', () => {
    const { world, setBlock, run } = setup();
    setBlock(0, 0, 0, S('water'));
    run(200);
    setBlock(0, 0, 0, 0);
    run(300);
    for (let x = -9; x <= 9; x++) expect(world.get(x, 0, 0), `x ${x}`).toBe(0);
  });

  it('falls down a shaft', () => {
    const { world, setBlock, run } = setup((x, y, z) => (y < -10 || (y < 0 && !(x === 2 && z === 0)) ? S('stone') : 0));
    setBlock(0, 0, 0, S('water'));
    run(400);
    // A falling column all the way down the one-cell shaft.
    for (let y = -10; y < 0; y++) expect(fluidInfo(world.get(2, y, 0)), `y ${y}`).toEqual({ fluid: 'water', strength: 8 });
  });

  it('makes a new source between two sources', () => {
    const { world, setBlock, run } = setup();
    setBlock(0, 0, 0, S('water'));
    setBlock(2, 0, 0, S('water'));
    run(50);
    expect(world.get(1, 0, 0)).toBe(S('water'));
  });

  it('turns lava touched by water into stone', () => {
    const { world, setBlock, run } = setup();
    setBlock(0, 0, 0, S('lava'));
    setBlock(4, 0, 0, S('water'));
    run(400);
    let hardened = 0;
    for (let x = 0; x <= 4; x++) if (world.get(x, 0, 0) === S('obsidian') || world.get(x, 0, 0) === S('cobblestone')) hardened++;
    expect(hardened).toBeGreaterThan(0);
  });
});

describe('falling blocks and support', () => {
  it('drops sand to the ground and pops plants off removed ground', () => {
    const { world, setBlock, run } = setup();
    setBlock(3, 6, 3, S('sand'));
    setBlock(5, 0, 5, S('tall_grass'));
    run(100);
    expect(world.get(3, 6, 3)).toBe(0);
    expect(world.get(3, 0, 3)).toBe(S('sand'));
    expect(world.get(5, 0, 5)).toBe(S('tall_grass'));
    setBlock(5, -1, 5, 0);
    run(5);
    expect(world.get(5, 0, 5)).toBe(0);
  });
});

describe('random ticks', () => {
  it('spreads grass onto lit dirt and kills it under stone', () => {
    const { world, setBlock, run } = setup((_x, y) => (y < -1 ? S('stone') : y === -1 ? S('dirt') : 0));
    // Give the surface light: the chunks carry none in this test, so set the sky light directly.
    for (const c of world.chunks.values()) if (c.cy === 0) for (let i = 0; i < 4096; i++) c.setLight(i, 15, 0);
    setBlock(0, -1, 0, S('grass'));
    // Random ticks are slow by design (3 per chunk per tick): this is about half an hour of game time.
    run(40000);
    let grass = 0;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (world.get(x, -1, z) === S('grass')) grass++;
    expect(grass).toBeGreaterThan(3);
    setBlock(0, 0, 0, S('stone'));
    run(20000);
    expect(world.get(0, -1, 0)).toBe(S('dirt'));
  });

  it('decays leaves when their log goes, but keeps placed leaves and leaves another log holds', () => {
    const { world, setBlock, run } = setup();
    setBlock(0, 5, 0, S('log'));
    setBlock(1, 5, 0, S('leaves'));
    setBlock(-1, 5, 0, S('leaves', 1));
    setBlock(6, 5, 0, S('log'));
    setBlock(5, 5, 0, S('leaves'));
    run(200);
    expect(world.get(1, 5, 0)).toBe(S('leaves'));
    setBlock(0, 5, 0, 0);
    run(200);
    expect(world.get(1, 5, 0)).toBe(0);
    expect(world.get(-1, 5, 0)).toBe(S('leaves', 1));
    expect(world.get(5, 5, 0)).toBe(S('leaves'));
  });
});

describe('tick scheduler', () => {
  it('runs ticks in due order, keeps one per cell and kind, and parks unloaded chunks', () => {
    const t = new TickScheduler();
    t.schedule(0, 0, 0, TickKind.Flow, 5);
    t.schedule(0, 0, 0, TickKind.Flow, 1);
    t.schedule(1, 0, 0, TickKind.Fall, 2);
    t.schedule(40, 0, 0, TickKind.Fall, 3);
    t.park(2, 0, 0);
    expect(t.dormantCount).toBe(1);
    const order: number[] = [];
    for (let i = 0; i < 6; i++) {
      t.now++;
      for (const k of t.takeDue()) order.push(k.x);
    }
    expect(order).toEqual([1, 0]);
    const saved = t.save();
    expect(saved).toEqual([[40, 0, 0, TickKind.Fall, 3]]);
    t.resume(2, 0, 0);
    t.now += 3;
    expect(t.takeDue().map((k) => k.x)).toEqual([40]);
    const u = new TickScheduler();
    u.load([...saved, ['bad'], [1, 2, 3, 9, 1]]);
    expect(u.dormantCount).toBe(1);
  });
});

describe('ticks at the edge of the loaded area', () => {
  it('wait for their chunk instead of being lost', () => {
    const t = new TickScheduler();
    t.schedule(100, 0, 0, TickKind.Flow, 1);
    t.now = 5;
    for (const k of t.takeDue()) t.defer(k);
    expect(t.size).toBe(0);
    expect(t.dormantCount).toBe(1);
    t.resume(6, 0, 0);
    t.now += 1;
    expect(t.takeDue().map((k) => k.x)).toEqual([100]);
  });
});

describe('weather', () => {
  it('freezes still water from the banks inward until the pond is ice', () => {
    // A 7 x 7 pond at y = 0 with stone banks around it.
    const pond = (x: number, z: number) => x >= 0 && x < 7 && z >= 0 && z < 7;
    const { world, sim } = setup((x, y, z) => (y < 0 || (y === 0 && !pond(x, z)) ? S('stone') : y === 0 ? S('water') : 0));
    sim.weather = { precipitation: 'none', seasonC: -40 };
    const ICE = S('ice'), solid = (x: number, z: number) => world.get(x, 0, z) === ICE || !pond(x, z);
    let frozen = 0;
    for (let step = 0; step < 40000 && frozen < 49; step++) {
      sim.step(3, 3);
      if (step % 100 !== 0) continue;
      frozen = 0;
      for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) {
        if (world.get(x, 0, z) !== ICE) continue;
        frozen++;
        // Every ice cell touches the bank or other ice.
        expect(solid(x + 1, z) || solid(x - 1, z) || solid(x, z + 1) || solid(x, z - 1)).toBe(true);
      }
    }
    expect(frozen).toBe(49);
  });
});

describe('bone meal', () => {
  it('grows a crop one stage, stops at ripe, and turns a sapling into a tree', () => {
    const { world, sim } = setup((_x, y) => (y < 0 ? S('grass') : 0));
    world.set(1, 0, 1, S('wheat'));
    expect(sim.fertilise(1, 0, 1)).toBe(true);
    expect(world.get(1, 0, 1)).toBe(S('wheat', 1));
    world.set(1, 0, 1, S('wheat', 3));
    expect(sim.fertilise(1, 0, 1)).toBe(false);
    world.set(5, 0, 5, S('sapling'));
    expect(sim.fertilise(5, 0, 5)).toBe(true);
    expect(BLOCKS.type(world.get(5, 0, 5)).key).toBe('log');
    expect(sim.fertilise(2, 0, 2)).toBe(false);
  });
});
