import { describe, expect, it, vi } from 'vitest';
import { TickQueue, type Tick } from '../src/world/tick';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';

function tick(x: number, y: number, z: number, due: number, reason: string): Tick {
  return { x, y, z, dueTick: due, reason };
}

describe('TickQueue ordering', () => {
  it('runs ticks in due-tick order regardless of insertion order', () => {
    const q = new TickQueue();
    q.schedule(tick(5, 5, 5, 3, 'c'), 0, 0, 0);
    q.schedule(tick(1, 1, 1, 1, 'a'), 0, 0, 0);
    q.schedule(tick(3, 3, 3, 2, 'b'), 0, 0, 0);
    const order: string[] = [];
    q.run(10, 100, (_t: Tick, _ctx: unknown) => {
      order.push(_t.reason);
      return 'handled';
    }, undefined);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(q.size).toBe(0);
  });

  it('breaks ties by cell position (x, then y, then z)', () => {
    const q = new TickQueue();
    q.schedule(tick(5, 5, 5, 1, 'z5'), 0, 0, 0);
    q.schedule(tick(1, 5, 5, 1, 'x1'), 0, 0, 0);
    q.schedule(tick(3, 1, 5, 1, 'y1'), 0, 0, 0);
    q.schedule(tick(3, 5, 1, 1, 'z1'), 0, 0, 0);
    const order: string[] = [];
    q.run(10, 100, (_t: Tick, _ctx: unknown) => {
      order.push(_t.reason);
      return 'handled';
    }, undefined);
    expect(order).toEqual(['x1', 'y1', 'z1', 'z5']);
  });

  it('breaks ties by cell position (x, then y, then z)', () => {
    const q = new TickQueue();
    q.schedule(tick(5, 5, 5, 1, 'z5'), 0, 0, 0);
    q.schedule(tick(1, 5, 5, 1, 'x1'), 0, 0, 0);
    q.schedule(tick(3, 1, 5, 1, 'y1'), 0, 0, 0);
    q.schedule(tick(3, 5, 1, 1, 'z1'), 0, 0, 0);
    const order: string[] = [];
    q.run(10, 100, (_t: Tick, _ctx: unknown) => {
      order.push(_t.reason);
      return 'handled';
    }, undefined);
    expect(order).toEqual(['x1', 'y1', 'z1', 'z5']);
  });

  it('skips ticks due in the future', () => {
    const q = new TickQueue();
    q.schedule(tick(1, 1, 1, 5, 'late'), 0, 0, 0);
    q.schedule(tick(2, 2, 2, 1, 'now'), 0, 0, 0);
    const order: string[] = [];
    q.run(1, 100, (_t: Tick, _ctx: unknown) => {
      order.push(_t.reason);
      return 'handled';
    }, undefined);
    expect(order).toEqual(['now']);
    expect(q.size).toBe(1);
  });

  it('empty queue costs nothing', () => {
    const q = new TickQueue();
    expect(q.isEmpty).toBe(true);
    expect(q.size).toBe(0);
    const result = q.run(10, 100, (_t: Tick, _ctx: unknown) => 'handled', undefined);
    expect(result.ran).toBe(0);
    expect(result.handedOff).toEqual([]);
  });

  it('stops when budget is exhausted and keeps the rest', () => {
    const q = new TickQueue();
    for (let i = 0; i < 100; i++) q.schedule(tick(i, 0, 0, 1, `t${i}`), 0, 0, 0);
    let budgetUses = 0;
    q.run(10, 0.001, (_t: Tick, _ctx: unknown) => {
      budgetUses++;
      return 'handled';
    }, undefined);
    expect(budgetUses).toBeLessThan(100);
    expect(q.size).toBeGreaterThan(0);
  });

  it('runs remaining ticks on the next call', () => {
    const q = new TickQueue();
    q.schedule(tick(1, 1, 1, 1, 'first'), 0, 0, 0);
    q.schedule(tick(2, 2, 2, 2, 'second'), 0, 0, 0);
    q.run(1, 100, (_t: Tick, _ctx: unknown) => 'handled', undefined);
    expect(q.size).toBe(1);
    const order: string[] = [];
    q.run(2, 100, (_t: Tick, _ctx: unknown) => {
      order.push(_t.reason);
      return 'handled';
    }, undefined);
    expect(order).toEqual(['second']);
  });
});

describe('TickQueue border handoff', () => {
  it('returns a handoff when a tick is outside this chunk', () => {
    const q = new TickQueue();
    const handoff = q.schedule(tick(100, 5, 5, 1, 'border'), 0, 0, 0);
    expect(handoff).not.toBeNull();
    expect(handoff!.cx).toBe(6);
    expect(handoff!.cy).toBe(0);
    expect(handoff!.cz).toBe(0);
    expect(q.isEmpty).toBe(true);
  });

  it('keeps in-chunk ticks and returns null handoff', () => {
    const q = new TickQueue();
    const handoff = q.schedule(tick(5, 5, 5, 1, 'inside'), 0, 0, 0);
    expect(handoff).toBeNull();
    expect(q.size).toBe(1);
  });
});

describe('World tick integration', () => {
  it('schedules and runs ticks through the world', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);

    world.scheduleTick(5, 5, 5, 1, 'first');
    world.scheduleTick(3, 3, 3, 2, 'second');
    world.scheduleTick(7, 7, 7, 1, 'third');

    const stats = world.tickStep(100);
    expect(stats.ran).toBe(2); // dueTick <= 1: first and third
    expect(world.currentTick).toBe(1);
    expect(world.pendingTickCount).toBe(1); // 'second' still pending
  });

  it('pendingTickCount reflects queued ticks', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    expect(world.pendingTickCount).toBe(0);
    world.scheduleTick(5, 5, 5, 100, 'far-future');
    expect(world.pendingTickCount).toBe(1);
    world.tickStep(100);
    expect(world.pendingTickCount).toBe(1);
  });

  it('currentTick increments each step', () => {
    const world = new World(42);
    expect(world.currentTick).toBe(0);
    world.tickStep(100);
    expect(world.currentTick).toBe(1);
    world.tickStep(100);
    expect(world.currentTick).toBe(2);
  });
});

describe('TickQueue scheduling during a run', () => {
  it('handles every queued tick exactly once when a handler schedules a tick that sorts before the rest', () => {
    const q = new TickQueue();
    for (let i = 0; i < 6; i++) q.schedule(tick(8 + i, 0, 0, 0, `t${i}`), 0, 0, 0);
    const seen: string[] = [];
    q.run(0, 100, (t: Tick, _ctx: unknown) => {
      seen.push(t.reason);
      // Due now, and at a lower x than everything queued, so it sorts to the front of the queue.
      if (t.reason === 't0') q.schedule(tick(1, 0, 0, 0, 'early'), 0, 0, 0);
      return 'handled';
    }, undefined);
    expect(seen.sort()).toEqual(['early', 't0', 't1', 't2', 't3', 't4', 't5']);
    expect(q.size).toBe(0);
  });

  it('keeps a tick scheduled for a later step, and runs it then', () => {
    const q = new TickQueue();
    q.schedule(tick(1, 0, 0, 0, 'now'), 0, 0, 0);
    q.run(0, 100, (t: Tick, _ctx: unknown) => {
      if (t.reason === 'now') q.schedule(tick(0, 0, 0, 1, 'later'), 0, 0, 0);
      return 'handled';
    }, undefined);
    expect(q.size).toBe(1);
    const seen: string[] = [];
    q.run(1, 100, (t: Tick, _ctx: unknown) => {
      seen.push(t.reason);
      return 'handled';
    }, undefined);
    expect(seen).toEqual(['later']);
    expect(q.size).toBe(0);
  });
});

it('coalesces duplicate cell/reason updates at the earliest due time', () => {
  const q = new TickQueue();
  for (const due of [9, 5, 7, 5]) q.schedule(tick(1, 1, 1, due, 'flow'), 0, 0, 0);
  q.schedule(tick(1, 1, 1, 5, 'fall'), 0, 0, 0);
  expect(q.size).toBe(2);
  expect(q.run(5, 100, () => 'handled', undefined).ran).toBe(2);
  expect(q.size).toBe(0);
});

it('shares the world tick budget across chunks and resumes fairly', () => {
  const world = new World(1), chunks = [new Chunk(0, 0, 0), new Chunk(1, 0, 0)];
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const calls: number[] = [];
  try {
    for (const c of chunks) {
      world.addChunk(c);
      world.scheduleTick(c.cx * 16, 0, 0, 1, 'test');
      vi.spyOn(c.ticks, 'run').mockImplementation(() => { calls.push(c.cx); now += 3; return { handedOff: [], ran: 1 }; });
    }
    world.tickStep(2);
    expect(calls).toEqual([0]);
    world.tickStep(2);
    expect(calls).toEqual([0, 1]);
  } finally { clock.mockRestore(); }
});

it('rotates random ticks rather than starving later chunks under a budget', () => {
  const world = new World(1);
  world.addChunk(new Chunk(0, 0, 0)); world.addChunk(new Chunk(1, 0, 0));
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const cells: number[] = [];
  try {
    const visit = (_world: World, x: number) => { cells.push(Math.floor(x / 16)); now++; };
    world.randomTickStep(.5, visit);
    world.randomTickStep(.5, visit);
    expect(new Set(cells)).toEqual(new Set([0, 1]));
  } finally { clock.mockRestore(); }
});
